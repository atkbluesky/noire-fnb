/**
 * M5.1 · Phase 0 — thăm dò Meta Marketing API + Google Ads API TRƯỚC khi dựng migration.
 *
 *   node scripts/ads-probe.mjs meta                          tài khoản Meta: currency · timezone · quyền token
 *   node scripts/ads-probe.mjs meta-insights --month=2026-08  kéo insights 1 tháng, in tổng + 10 chiến dịch đầu
 *   node scripts/ads-probe.mjs google-auth                   LẤY GADS_REFRESH_TOKEN — chạy MỘT lần, ghi thẳng .env.local
 *   node scripts/ads-probe.mjs google                        đổi refresh_token → access_token, dò API version
 *   node scripts/ads-probe.mjs google-campaigns --month=2026-08
 *   node scripts/ads-probe.mjs reconcile --month=2026-08     ĐỐI CHIẾU số API với data_mkt.json  ← gate quan trọng nhất
 *   node scripts/ads-probe.mjs all --month=2026-08           chạy tuần tự tất cả
 *
 * Đọc biến môi trường, không có thì đọc .env.local / .env. KHÔNG in full token.
 * CHỈ gọi endpoint ĐỌC — luật M5_1 §0.9. Không mutate, không đổi ngân sách, không bật/tắt gì.
 * Dữ liệu thô ghi vào _cache/ads/ (đã nằm trong .gitignore qua _cache/).
 *
 * Tài liệu: https://developers.facebook.com/docs/marketing-api/insights
 *           https://developers.google.com/google-ads/api/rest/design/overview
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, '_cache', 'ads');

/* ─── env ─────────────────────────────────────────────────────────────────── */
function loadEnv() {
  const env = {};
  for (const f of ['.env', '.env.local']) {
    const p = path.join(ROOT, f);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
  return { ...env, ...Object.fromEntries(Object.entries(process.env).filter(([, v]) => v)) };
}
const ENV = loadEnv();

const FB_VER = (ENV.FB_GRAPH_VERSION || 'v23.0').trim();
const META_TOKEN = (ENV.META_ADS_SYSTEM_TOKEN || ENV.FB_USER_TOKEN || '').trim();
const META_ACCOUNTS = (ENV.META_ADS_ACCOUNT_IDS || '').split(',').map(s => s.trim().replace(/^act_/, '')).filter(Boolean);
const FB_APP_ID = (ENV.FB_APP_ID || '').trim();
const FB_APP_SECRET = (ENV.FB_APP_SECRET || '').trim();

const GADS_DEV_TOKEN = (ENV.GADS_DEVELOPER_TOKEN || '').trim();
const GADS_CLIENT_ID = (ENV.GADS_CLIENT_ID || '').trim();
const GADS_CLIENT_SECRET = (ENV.GADS_CLIENT_SECRET || '').trim();
const GADS_REFRESH = (ENV.GADS_REFRESH_TOKEN || '').trim();
const GADS_CUSTOMERS = (ENV.GADS_CUSTOMER_IDS || '').split(',').map(s => s.trim().replace(/-/g, '')).filter(Boolean);
const GADS_LOGIN_CID = (ENV.GADS_LOGIN_CUSTOMER_ID || '').trim().replace(/-/g, '');

/* Google Ads API bỏ version cũ mỗi ~4 tháng. KHÔNG hardcode một con số rồi tin —
   thử từ mới về cũ và báo cái nào gọi được. Đặt GADS_API_VERSION để ghim một version. */
const GADS_VERSIONS = ENV.GADS_API_VERSION?.trim()
  ? [ENV.GADS_API_VERSION.trim()]
  : ['v25', 'v24', 'v23', 'v22'];   // đo 28/09/2026: ≤ v21 đã gỡ (404), v26+ chưa có

/* ─── in ra ───────────────────────────────────────────────────────────────── */
const mask = t => (!t ? '(trống)' : `${t.slice(0, 8)}…${t.slice(-4)} (${t.length} ký tự)`);
const vnd = n => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(n || 0);
const pct = n => `${(n * 100).toFixed(2)}%`;
/** Dừng cả tiến trình. Chỉ dùng cho lỗi cách gọi lệnh (sai --month, thiếu file). */
const die = msg => { console.error(`\n✗ ${msg}\n`); process.exit(1); };

/**
 * Lỗi CÓ THỂ bỏ qua để chạy tiếp nền tảng còn lại — thiếu credential, API không với tới.
 * Phải THROW chứ không exit: `reconcile` bắt lỗi này để Meta hỏng thì Google vẫn được thử.
 */
const fail = msg => { throw new Error(msg); };

/**
 * QA gate vỡ = sai cấu trúc dữ liệu. Dừng NGAY, kể cả đang trong reconcile —
 * chạy tiếp trên số sai còn tệ hơn không chạy.
 */
const gateBreak = msg => { console.error(`\n✗ QA GATE VỠ — DỪNG\n  ${msg}\n`); process.exit(1); };

const warn = msg => console.log(`   ⚠ ${msg}`);
const head = t => console.log(`\n${'─'.repeat(74)}\n${t}\n${'─'.repeat(74)}`);

function save(name, data) {
  fs.mkdirSync(OUT, { recursive: true });
  const p = path.join(OUT, name);
  fs.writeFileSync(p, typeof data === 'string' ? data : JSON.stringify(data, null, 2));
  console.log(`   ↳ ghi ${path.relative(ROOT, p)}`);
}

const arg = name => {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : undefined;
};

/** 'YYYY-MM' → { since, until } của tháng trọn kỳ. */
function monthRange(month) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) die(`--month phải dạng YYYY-MM, nhận "${month}"`);
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { since: `${month}-01`, until: `${month}-${String(last).padStart(2, '0')}` };
}

/* ─── Meta ────────────────────────────────────────────────────────────────── */
async function graph(node, params = {}, token = META_TOKEN) {
  const url = new URL(`https://graph.facebook.com/${FB_VER}/${node}`);
  for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, String(v));
  url.searchParams.set('access_token', token);
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) {
    const e = body.error || {};
    fail(`Meta Graph ${res.status} · ${e.type || ''} ${e.code || ''}${e.error_subcode ? `/${e.error_subcode}` : ''}\n  ${e.message || JSON.stringify(body)}`);
  }
  // Rate limit — M5_1 §4a. In ra để biết còn bao nhiêu quota.
  const usage = res.headers.get('x-business-use-case-usage');
  if (usage) {
    try {
      const parsed = JSON.parse(usage);
      for (const rows of Object.values(parsed)) {
        for (const r of rows) {
          const worst = Math.max(r.call_count || 0, r.total_cputime || 0, r.total_time || 0);
          if (worst >= 75) warn(`quota Meta đang ở ${worst}% — >90% thì phải dừng`);
        }
      }
    } catch { /* header đổi định dạng thì bỏ qua, không phải lỗi nghiệp vụ */ }
  }
  return body;
}

async function cmdMeta() {
  head('META · TÀI KHOẢN QUẢNG CÁO');
  if (!META_TOKEN) fail('Thiếu META_ADS_SYSTEM_TOKEN (hoặc FB_USER_TOKEN để thử tạm) trong .env.local');
  console.log(`Token: ${mask(META_TOKEN)}`);

  if (FB_APP_ID && FB_APP_SECRET) {
    const { data } = await graph('debug_token', { input_token: META_TOKEN }, `${FB_APP_ID}|${FB_APP_SECRET}`);
    const exp = data.expires_at ? new Date(data.expires_at * 1000).toISOString() : 'KHÔNG HẾT HẠN';
    console.log(`   loại        : ${data.type || '?'}`);
    console.log(`   hạn dùng    : ${exp}`);
    console.log(`   scope       : ${(data.scopes || []).join(', ') || '(không thấy)'}`);
    if (!(data.scopes || []).includes('ads_read')) warn('token KHÔNG có scope ads_read — insights sẽ 403');
    if ((data.scopes || []).includes('ads_management')) {
      warn('token CÓ ads_management (quyền GHI). M5_1 §0.9 chỉ cần ads_read — nên thu hẹp lại');
    }
    if (data.expires_at) warn('token CÓ hạn — dùng probe được, KHÔNG dùng cho cron. Cần System User token');
  } else {
    warn('thiếu FB_APP_ID/FB_APP_SECRET → bỏ qua bước soi token');
  }

  // Tài khoản mà token truy cập được. Nếu đã khai META_ADS_ACCOUNT_IDS thì soi đúng các id đó.
  const ids = META_ACCOUNTS.length ? META_ACCOUNTS : null;
  let accounts = [];
  if (ids) {
    for (const id of ids) {
      const a = await graph(`act_${id}`, { fields: 'account_id,name,currency,timezone_name,account_status,amount_spent' });
      accounts.push(a);
    }
  } else {
    warn('chưa khai META_ADS_ACCOUNT_IDS → liệt kê tài khoản token thấy được');
    const { data } = await graph('me/adaccounts', { fields: 'account_id,name,currency,timezone_name,account_status', limit: 50 });
    accounts = data || [];
  }

  console.log(`\n${accounts.length} tài khoản:`);
  for (const a of accounts) {
    const flag = a.currency === 'VND' ? '✔' : '✖';
    console.log(`   ${flag} act_${a.account_id} · ${a.name}`);
    console.log(`        currency=${a.currency}  timezone=${a.timezone_name}  status=${a.account_status}`);
    if (a.currency !== 'VND') gateBreak(`QA gate 3 VỠ: tài khoản ${a.account_id} dùng ${a.currency}, không phải VND. Không được cộng thẳng vào số VND`);
    if (a.timezone_name && a.timezone_name !== 'Asia/Ho_Chi_Minh') {
      warn(`timezone ${a.timezone_name} ≠ Asia/Ho_Chi_Minh — ngày của API lệch ICT (M5_1 §3c.3). PHẢI ghi vào dim_ads_account.timezone và cảnh báo trên màn hình`);
    }
  }
  save('meta-accounts.json', accounts);
  return accounts;
}

const MESSAGING_ACTION = 'onsite_conversion.messaging_conversation_started_7d';

/** Insights cấp campaign, 1 dòng/ngày. Có paging. */
async function metaInsights(accountId, since, until) {
  const rows = [];
  let after;
  for (let page = 0; page < 200; page += 1) {
    const body = await graph(`act_${accountId}/insights`, {
      level: 'campaign',                       // BẮT BUỘC — thiếu là lẫn adset, bẫy M5 §6.1
      time_increment: 1,                       // 1 dòng / 1 ngày
      time_range: JSON.stringify({ since, until }),
      fields: 'campaign_id,campaign_name,spend,impressions,clicks,reach,frequency,actions',
      limit: 500,
      after,
    });
    rows.push(...(body.data || []));
    after = body.paging?.cursors?.after;
    if (!body.paging?.next || !after) break;
  }
  return rows;
}

/** Bẫy M5_1 §3c.2 — Meta trả spend dạng CHUỖI. NaN thì throw, không lặng lẽ thành 0. */
function numStrict(value, label) {
  if (value == null || value === '') return 0;
  const n = Number(value);
  if (!Number.isFinite(n)) gateBreak(`${label} không phải số: ${JSON.stringify(value)}`);
  return n;
}

function mapMetaRow(r, accountId) {
  const actions = Array.isArray(r.actions) ? r.actions : [];
  const msg = actions.find(a => a.action_type === MESSAGING_ACTION);
  return {
    platform: 'meta',
    account_id: accountId,
    campaign_id: String(r.campaign_id ?? ''),
    campaign_name: String(r.campaign_name ?? ''),
    stat_date: String(r.date_start ?? ''),
    spend: numStrict(r.spend, 'spend'),
    impressions: numStrict(r.impressions, 'impressions'),
    clicks: numStrict(r.clicks, 'clicks'),
    reach: r.reach == null ? null : numStrict(r.reach, 'reach'),
    frequency: r.frequency == null ? null : numStrict(r.frequency, 'frequency'),
    messaging_conversations: msg ? numStrict(msg.value, 'messaging') : 0,
  };
}

async function cmdMetaInsights(month = arg('month')) {
  head(`META · INSIGHTS ${month}`);
  if (!META_TOKEN) fail('Thiếu META_ADS_SYSTEM_TOKEN');
  if (!META_ACCOUNTS.length) fail('Thiếu META_ADS_ACCOUNT_IDS — probe cần biết kéo tài khoản nào');
  const { since, until } = monthRange(month);
  console.log(`Kỳ: ${since} → ${until} · level=campaign · time_increment=1`);

  const all = [];
  for (const id of META_ACCOUNTS) {
    const raw = await metaInsights(id, since, until);
    console.log(`   act_${id}: ${raw.length} dòng ngày×chiến dịch`);
    all.push(...raw.map(r => mapMetaRow(r, id)));
  }

  const spend = all.reduce((a, r) => a + r.spend, 0);
  const days = new Set(all.map(r => r.stat_date));
  const camps = new Set(all.map(r => r.campaign_id));
  console.log(`\nTổng: ${vnd(spend)} đ · ${camps.size} chiến dịch · ${days.size} ngày có dữ liệu`);
  console.log(`   tin nhắn bắt đầu : ${vnd(all.reduce((a, r) => a + r.messaging_conversations, 0))}`);

  // QA gate 5 — API lẽ ra không trả dòng cộng dồn, nhưng kiểm vẫn hơn tin.
  const totalRows = all.filter(r => /^tổng số/i.test(r.campaign_name.trim()));
  if (totalRows.length) gateBreak(`QA gate 5 VỠ: ${totalRows.length} dòng có tên bắt đầu "Tổng số" — sẽ nhân đôi chi phí`);

  // QA gate 4 — ngày nào gấp ≥2× ngày liền trước là dấu hiệu lẫn cấp adset.
  const byDay = {};
  for (const r of all) byDay[r.stat_date] = (byDay[r.stat_date] || 0) + r.spend;
  const sorted = Object.keys(byDay).sort();
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = byDay[sorted[i - 1]];
    const cur = byDay[sorted[i]];
    if (prev > 0 && cur >= prev * 2) warn(`${sorted[i]} chi ${vnd(cur)} — gấp ${(cur / prev).toFixed(1)}× ngày trước (${vnd(prev)}). Kiểm có lẫn cấp adset không`);
  }

  // Top chiến dịch để mắt người nhìn được ngay có hợp lý không.
  const byCamp = {};
  for (const r of all) {
    byCamp[r.campaign_id] ??= { name: r.campaign_name, spend: 0 };
    byCamp[r.campaign_id].spend += r.spend;
  }
  console.log('\n10 chiến dịch chi nhiều nhất:');
  Object.entries(byCamp).sort((a, b) => b[1].spend - a[1].spend).slice(0, 10)
    .forEach(([id, c], i) => console.log(`   ${String(i + 1).padStart(2)}. ${vnd(c.spend).padStart(13)} đ  ${c.name.slice(0, 52)}  [${id}]`));

  save(`meta-insights-${month}.json`, all);
  return { rows: all, spend };
}

/* ─── Google ──────────────────────────────────────────────────────────────── */
async function googleAccessToken() {
  if (!GADS_CLIENT_ID || !GADS_CLIENT_SECRET || !GADS_REFRESH) {
    fail('Thiếu GADS_CLIENT_ID / GADS_CLIENT_SECRET / GADS_REFRESH_TOKEN trong .env.local');
  }
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GADS_CLIENT_ID,
      client_secret: GADS_CLIENT_SECRET,
      refresh_token: GADS_REFRESH,
      grant_type: 'refresh_token',
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) {
    fail(`Đổi refresh_token thất bại: ${res.status} ${body.error || ''} ${body.error_description || JSON.stringify(body)}`);
  }
  return body.access_token;
}

/** searchStream — POST nhưng là read-only GAQL (luật M5_1 §0.9). */
async function gaql(version, customerId, query, token) {
  const res = await fetch(
    `https://googleads.googleapis.com/${version}/customers/${customerId}/googleAds:searchStream`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        ...(GADS_DEV_TOKEN ? { 'developer-token': GADS_DEV_TOKEN } : {}),
        ...(GADS_LOGIN_CID ? { 'login-customer-id': GADS_LOGIN_CID } : {}),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(120_000),
    },
  );
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { throw new Error(`GADS_BAD_JSON ${res.status}: ${text.slice(0, 200)}`); }
  if (!res.ok) {
    const err = Array.isArray(body) ? body[0]?.error : body?.error;
    const codes = (err?.details ?? []).flatMap(d => d.errors ?? []).map(e => Object.values(e.errorCode ?? {}).join('/')).filter(Boolean);
    throw new Error(`GADS_HTTP_${res.status}: ${codes.length ? codes.join(',') + ' — ' : ''}${err?.message || text.slice(0, 200)}`);
  }
  // searchStream trả MẢNG các chunk, mỗi chunk có .results
  return (Array.isArray(body) ? body : [body]).flatMap(c => c.results || []);
}

async function cmdGoogle() {
  head('GOOGLE ADS · TOKEN + API VERSION');
  if (!GADS_CUSTOMERS.length) fail('Thiếu GADS_CUSTOMER_IDS (customer id 10 số, không dấu gạch)');
  console.log(`developer-token   : ${mask(GADS_DEV_TOKEN)}`);
  console.log(`login-customer-id : ${GADS_LOGIN_CID || '(không dùng MCC)'}`);
  console.log(`customer ids      : ${GADS_CUSTOMERS.join(' · ')}`);

  const token = await googleAccessToken();
  console.log(`access_token      : ${mask(token)}  ✔ đổi từ refresh_token được`);

  // Dò version gọi được — M5_1 §4b, không hardcode.
  let ok = null;
  for (const v of GADS_VERSIONS) {
    try {
      await gaql(v, GADS_CUSTOMERS[0], 'SELECT customer.id FROM customer LIMIT 1', token);
      ok = v;
      console.log(`API version       : ${v}  ✔`);
      break;
    } catch (e) {
      const msg = String(e.message);
      console.log(`API version       : ${v}  ✖ ${msg.slice(0, 110)}`);
      // Lỗi quyền/token thì đổi version cũng vô ích — dừng luôn và nói rõ.
      if (/DEVELOPER_TOKEN|PERMISSION_DENIED|NOT_APPROVED|not.*approved|test account|does not have permission|GADS_HTTP_40[13]/i.test(msg)) {
        fail(`Không phải lỗi version mà là lỗi quyền:\n  ${msg}\n\n  → Kiểm tra quyền tài khoản Ads và Google Cloud project chứa OAuth client.\n    CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION: Google Ads API Overview → Upgrade access level → Explorer.`);
      }
    }
  }
  if (!ok) fail(`Không version nào gọi được trong ${GADS_VERSIONS.join(', ')}. Đặt GADS_API_VERSION nếu biết version đúng`);

  for (const cid of GADS_CUSTOMERS) {
    const rows = await gaql(ok, cid,
      'SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone, customer.manager FROM customer LIMIT 1', token);
    const c = rows[0]?.customer || {};
    if (c.manager) fail('GADS_CUSTOMER_IDS đang là MCC. Điền tài khoản quảng cáo con; chuyển MCC sang GADS_LOGIN_CUSTOMER_ID.');
    const flag = c.currencyCode === 'VND' ? '✔' : '✖';
    console.log(`\n   ${flag} ${cid} · ${c.descriptiveName || '?'}`);
    console.log(`        currency=${c.currencyCode}  timezone=${c.timeZone}`);
    if (c.currencyCode && c.currencyCode !== 'VND') gateBreak(`QA gate 3 VỠ: customer ${cid} dùng ${c.currencyCode}, không phải VND`);
    if (c.timeZone && !['Asia/Ho_Chi_Minh', 'Asia/Saigon'].includes(c.timeZone)) {
      warn(`timezone ${c.timeZone} ≠ Asia/Ho_Chi_Minh — ngày lệch ICT (M5_1 §3c.3)`);
    }
  }
  save('google-version.json', { version: ok, customers: GADS_CUSTOMERS });
  return { version: ok, token };
}

const MICROS = 1_000_000;

async function cmdGoogleCampaigns(month = arg('month'), ctx) {
  head(`GOOGLE ADS · CHIẾN DỊCH ${month}`);
  const { since, until } = monthRange(month);
  const { version, token } = ctx || await cmdGoogle();

  const query = `
    SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type,
           segments.date, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions
    FROM campaign
    WHERE segments.date BETWEEN '${since}' AND '${until}'`.trim();

  const all = [];
  for (const cid of GADS_CUSTOMERS) {
    const rows = await gaql(version, cid, query, token);
    console.log(`   ${cid}: ${rows.length} dòng ngày×chiến dịch`);
    for (const r of rows) {
      const micros = Number(r.metrics?.costMicros ?? 0);
      if (!Number.isFinite(micros)) gateBreak(`cost_micros không phải số: ${JSON.stringify(r.metrics)}`);
      all.push({
        platform: 'google',
        account_id: cid,
        campaign_id: String(r.campaign?.id ?? ''),
        campaign_name: String(r.campaign?.name ?? ''),
        status: String(r.campaign?.status ?? ''),
        stat_date: String(r.segments?.date ?? ''),
        spend: micros / MICROS,                               // bẫy M5_1 §3c.1
        impressions: Number(r.metrics?.impressions ?? 0),
        clicks: Number(r.metrics?.clicks ?? 0),
        conversions: Number(r.metrics?.conversions ?? 0),     // THẬP PHÂN, không phải integer
        reach: null,                                          // Google không trả reach — null, KHÔNG phải 0
      });
    }
  }

  const spend = all.reduce((a, r) => a + r.spend, 0);
  const camps = new Set(all.map(r => r.campaign_id));
  console.log(`\nTổng: ${vnd(spend)} đ · ${camps.size} chiến dịch · ${vnd(all.reduce((a, r) => a + r.conversions, 0))} chuyển đổi`);

  // QA gate 6 — quên chia micros thì con số nổ lên hàng nghìn tỉ.
  const insane = all.filter(r => r.spend >= 1e10);
  if (insane.length) gateBreak(`QA gate 6 VỠ: ${insane.length} dòng có spend ≥ 10^10 — nghi chưa chia micros`);

  const paused = all.filter(r => /PAUSED|REMOVED/i.test(r.status)).reduce((a, r) => a + r.spend, 0);
  if (paused > 0) console.log(`   chi của chiến dịch đã tạm dừng/xoá: ${vnd(paused)} đ  (M5 checklist mục 1)`);

  save(`google-campaigns-${month}.json`, all);
  return { rows: all, spend };
}

/* ─── Đối chiếu — gate quan trọng nhất (M5_1 §3d) ─────────────────────────── */
/**
 * Nguồn Excel để đối chiếu là `src/data/data_mkt.json` — bản do
 * `scripts/build-data.mjs` sinh ra và là bản `src/data/index.ts` THẬT SỰ import.
 *
 * ⚠ KHÔNG dùng `data_mkt.json` ở gốc repo: đó là output cũ của `build_mkt.py` (Python),
 * không được view nào import, và chứa `NaN` nên `JSON.parse` ném lỗi.
 * Đo ngày 27/09/2026: gốc cũ hơn bản sống 4 ngày.
 */
function readMktJson() {
  const live = path.join(ROOT, 'src', 'data', 'data_mkt.json');
  const legacy = path.join(ROOT, 'data_mkt.json');
  if (fs.existsSync(live)) {
    return { data: JSON.parse(fs.readFileSync(live, 'utf8')), from: 'src/data/data_mkt.json' };
  }
  if (!fs.existsSync(legacy)) die('Không thấy src/data/data_mkt.json — chạy `npm run build:data` trước');
  warn('không có src/data/data_mkt.json → tạm đọc bản gốc của build_mkt.py (có NaN, phải vá trước khi parse)');
  const raw = fs.readFileSync(legacy, 'utf8').replace(/\bNaN\b/g, 'null');
  return { data: JSON.parse(raw), from: 'data_mkt.json (legacy)' };
}

function excelMonth(month) {
  const { data: D, from } = readMktJson();
  const meta = (D.ads_month || []).find(r => r.month === month);

  // `gads_month` là bản gộp theo tháng có sẵn — ưu tiên dùng.
  // Không có thì cộng `gads` lọc theo month (cột `month` chỉ có từ bản vá M5 §cuối).
  const gm = (D.gads_month || []).find(r => r.month === month);
  const summed = (D.gads || []).filter(r => r.month === month).reduce((a, r) => a + (r.spend || 0), 0);
  const google = gm ? gm.spend || 0 : summed > 0 ? summed : null;

  return {
    from,
    meta: meta ? meta.spend || 0 : null,
    google,
    googleAnyMonth: (D.gads || []).reduce((a, r) => a + (r.spend || 0), 0),
    gadsHasMonth: (D.gads || []).some(r => r.month) || (D.gads_month || []).length > 0,
  };
}

function verdict(label, api, excel) {
  if (excel == null) {
    warn(`${label}: Excel không có số cho tháng này — không đối chiếu được`);
    return 'skip';
  }
  if (!excel) { warn(`${label}: Excel = 0 → bỏ qua phép chia`); return 'skip'; }
  const diff = Math.abs(api - excel) / excel;
  const line = `${label}: API ${vnd(api)} đ · Excel ${vnd(excel)} đ · lệch ${pct(diff)}`;
  if (diff < 0.005) { console.log(`   ✔ ${line}`); return 'ok'; }
  if (diff <= 0.02) { console.log(`   ⚠ ${line}  → trong ngưỡng nhưng phải ghi QA`); return 'warn'; }
  console.log(`   ✖ ${line}  → VƯỢT 2%, CHẶN nguồn API (M5_1 §3d)`);
  return 'fail';
}

async function cmdReconcile(month = arg('month')) {
  head(`ĐỐI CHIẾU API vs EXCEL · ${month}`);
  const xl = excelMonth(month);
  console.log(`Mốc Excel (${xl.from}):`);
  console.log(`   Meta  : ${xl.meta == null ? '(không có)' : `${vnd(xl.meta)} đ`}`);
  console.log(`   Google: ${xl.google == null ? '(không có)' : `${vnd(xl.google)} đ`}`);
  const results = [];

  let metaSpend = null;
  try { ({ spend: metaSpend } = await cmdMetaInsights(month)); }
  catch (e) { warn(`Meta không kéo được: ${String(e.message).slice(0, 120)}`); }

  let googleSpend = null;
  try { ({ spend: googleSpend } = await cmdGoogleCampaigns(month)); }
  catch (e) { warn(`Google không kéo được: ${String(e.message).slice(0, 120)}`); }

  head('KẾT LUẬN');
  if (metaSpend != null) results.push(verdict('Meta  ', metaSpend, xl.meta));
  if (googleSpend != null) {
    if (xl.google == null && xl.googleAnyMonth > 0 && !xl.gadsHasMonth) {
      warn(`Google: data_mkt.json còn dữ liệu gads KHÔNG có cột month (tổng ${vnd(xl.googleAnyMonth)} đ) — đúng lỗi M5 §cuối đã ghi. Không đối chiếu theo tháng được`);
      results.push('skip');
    } else {
      results.push(verdict('Google', googleSpend, xl.google));
    }
  }

  save(`reconcile-${month}.json`, {
    month, api: { meta: metaSpend, google: googleSpend }, excel: xl, results,
  });

  if (results.includes('fail')) {
    console.log('\n✖ QA gate 7 VỠ — KHÔNG dựng migration. Nguyên nhân hay gặp:');
    console.log('   · thiếu tài khoản trong META_ADS_ACCOUNT_IDS / GADS_CUSTOMER_IDS');
    console.log('   · Excel còn lẫn cấp adset (bẫy M5 §6.1) hoặc dòng "Tổng số:" (bẫy M5 §6.3)');
    console.log('   · lệch timezone tài khoản (M5_1 §3c.3)');
    process.exit(1);
  }
  if (!results.length) { console.log('\n⚠ Không đối chiếu được gì — kiểm credential rồi chạy lại'); process.exit(1); }
  console.log('\n✔ QA gate 7 XANH — đủ điều kiện chạy database/migrations/005_ads_auto.sql');
}

/* ─── Lấy GADS_REFRESH_TOKEN (chạy MỘT LẦN) ───────────────────────────────
   Refresh token không có sẵn ở đâu để copy — nó là KẾT QUẢ của một lần cấp quyền.
   Luồng dùng ở đây là loopback: mở trang đồng ý của Google, Google trả `code` về
   http://localhost:<port>, đổi `code` lấy refresh token.

   Ba điểm bắt buộc, thiếu một là không ra refresh token:
     · OAuth client phải là loại **Desktop app** (loại Web cần khai sẵn redirect URI)
     · `access_type=offline`  — không có thì Google chỉ trả access token 1 giờ
     · `prompt=consent`       — lần cấp quyền thứ hai trở đi Google BỎ QUA refresh
                                 token nếu không ép hỏi lại

   Token KHÔNG in ra màn hình: ghi thẳng vào .env.local.                        */
const OAUTH_PORT = 8787;
const ADS_SCOPE = 'https://www.googleapis.com/auth/adwords';

/** Ghi/ghi đè một key trong .env.local mà không đụng các dòng khác. */
function writeEnvLocal(key, value) {
  const p = path.join(ROOT, '.env.local');
  const line = `${key}=${value}`;
  let text = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
  const re = new RegExp(`^${key}=.*$`, 'm');
  if (re.test(text)) {
    text = text.replace(re, line);
  } else {
    text = text.replace(/\s*$/, '') + `\n${line}\n`;
  }
  fs.writeFileSync(p, text);
}

async function cmdGoogleAuth() {
  head('GOOGLE ADS · LẤY REFRESH TOKEN');
  if (!GADS_CLIENT_ID || !GADS_CLIENT_SECRET) {
    fail(`Thiếu GADS_CLIENT_ID / GADS_CLIENT_SECRET.

  Tạo ở Google Cloud Console › APIs & Services › Credentials
    › Create credentials › OAuth client ID › loại **Desktop app**
  Rồi điền hai khoá đó vào .env.local và chạy lại lệnh này.`);
  }

  const http = await import('node:http');
  const redirectUri = `http://localhost:${OAUTH_PORT}`;

  /* Đường dự phòng: bấm đồng ý trên THIẾT BỊ KHÁC (điện thoại) thì Google chuyển về
     localhost:8787 của thiết bị đó — mã không bao giờ tới máy này, trình duyệt báo
     "không kết nối được" nhưng thanh địa chỉ vẫn chứa `?code=…`. Gặp thật 28/09/2026.
     Khi đó chạy:  npm run probe:ads google-auth -- --code="<dán cả đường dẫn đó>"
     Mã chỉ sống ~10 phút và dùng được MỘT lần. Dán vào dòng lệnh, KHÔNG dán vào chat. */
  const manual = arg('code');
  if (manual) {
    let code = manual.trim();
    if (/^https?:\/\//.test(code)) code = new URL(code).searchParams.get('code') ?? '';
    if (!code) fail('Không thấy `code=` trong giá trị --code. Dán nguyên đường dẫn localhost:8787/?code=… hoặc riêng phần mã.');
    return exchangeAndSave(code, redirectUri);
  }
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', GADS_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', ADS_SCOPE);
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');

  console.log('\n1. Mở đường dẫn này bằng trình duyệt ĐANG đăng nhập tài khoản có quyền Google Ads:\n');
  console.log(authUrl.toString());
  console.log(`\n2. Bấm đồng ý. Google sẽ chuyển về ${redirectUri} — trang đó do lệnh này phục vụ.`);
  console.log('   (Gặp cảnh báo "Google hasn\'t verified this app" thì bấm Advanced › Go to … — đây là app của chính bạn.)\n');
  console.log('Đang chờ…  (Ctrl+C để huỷ)');

  const code = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, redirectUri);
      const got = url.searchParams.get('code');
      const err = url.searchParams.get('error');
      /* Chỉ phản ứng với đúng lượt Google chuyển về (có `code` hoặc `error`).
         Request lạc — /favicon.ico, lệnh kiểm cổng — trước đây làm listener tự đóng
         khi người dùng còn chưa bấm đồng ý (gặp thật 28/09/2026). */
      if (!got && !err) { res.writeHead(204); res.end(); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html><meta charset="utf-8"><body style="font:16px system-ui;padding:40px">
        <h2>${got ? '✅ Xong — quay lại cửa sổ dòng lệnh' : '❌ Không lấy được mã'}</h2>
        <p>${got ? 'Có thể đóng tab này.' : String(err || 'không rõ lý do')}</p></body>`);
      server.close();
      got ? resolve(got) : reject(new Error(`OAUTH_DENIED: ${err || 'không có code'}`));
    });
    server.on('error', e => reject(new Error(
      e.code === 'EADDRINUSE'
        ? `Cổng ${OAUTH_PORT} đang bận — tắt tiến trình đang dùng cổng đó rồi chạy lại`
        : String(e.message))));
    server.listen(OAUTH_PORT);
    /* 15 phút chứ không 5: đăng nhập Google hay vướng passkey/Bluetooth, xác minh 2 bước —
       5 phút hết trước khi người dùng kịp tới màn hình đồng ý (gặp thật 28/09/2026). */
    setTimeout(() => { server.close(); reject(new Error('OAUTH_TIMEOUT: quá 15 phút không thấy phản hồi')); }, 900_000);
  });

  return exchangeAndSave(code, redirectUri);
}

/** Đổi authorization code → refresh token, ghi thẳng .env.local. Dùng chung cho cả hai đường. */
async function exchangeAndSave(code, redirectUri) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: GADS_CLIENT_ID,
      client_secret: GADS_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) fail(`Đổi code thất bại: ${res.status} ${body.error || ''} ${body.error_description || ''}`);
  if (!body.refresh_token) {
    fail(`Google KHÔNG trả refresh_token.

  Gần như luôn là do tài khoản đã cấp quyền cho app này trước đó, nên Google bỏ qua.
  Gỡ quyền tại https://myaccount.google.com/permissions rồi chạy lại lệnh này.`);
  }

  writeEnvLocal('GADS_REFRESH_TOKEN', body.refresh_token);
  console.log(`\n✔ Đã ghi GADS_REFRESH_TOKEN vào .env.local  (${mask(body.refresh_token)})`);
  console.log('  Token KHÔNG in đầy đủ ra màn hình — đừng chụp màn hình, đừng dán đi đâu.');
  console.log('\nTiếp theo:  npm run probe:ads google');
}

/* ─── main ────────────────────────────────────────────────────────────────── */
const CMD = process.argv[2];
const MONTH = arg('month');

try {
  if (CMD === 'meta') await cmdMeta();
  else if (CMD === 'meta-insights') await cmdMetaInsights(MONTH);
  else if (CMD === 'google-auth') await cmdGoogleAuth();
  else if (CMD === 'google') await cmdGoogle();
  else if (CMD === 'google-campaigns') await cmdGoogleCampaigns(MONTH);
  else if (CMD === 'reconcile') await cmdReconcile(MONTH);
  else if (CMD === 'all') {
    await cmdMeta();
    await cmdReconcile(MONTH);
  } else {
    console.log(`
M5.1 · Phase 0 probe — Meta Ads + Google Ads

  node scripts/ads-probe.mjs meta
  node scripts/ads-probe.mjs meta-insights --month=2026-08
  node scripts/ads-probe.mjs google-auth                    ← lấy GADS_REFRESH_TOKEN (chạy 1 lần)
  node scripts/ads-probe.mjs google
  node scripts/ads-probe.mjs google-campaigns --month=2026-08
  node scripts/ads-probe.mjs reconcile --month=2026-08      ← gate quan trọng nhất
  node scripts/ads-probe.mjs all --month=2026-08

CHỈ gọi endpoint ĐỌC. Không mutate gì trên tài khoản quảng cáo (M5_1 §0.9).
`);
    process.exit(1);
  }
} catch (e) {
  /* Lỗi ở đây phần lớn là thiếu credential và thông điệp đã tự nói rõ phải làm gì.
     Kèm stack trace chỉ làm hướng dẫn bị chìm — chỉ hiện khi gọi với --debug. */
  die(process.argv.includes('--debug')
    ? String(e?.stack || e?.message || e)
    : String(e?.message || e));
}
