/**
 * M11 · Đặt bàn — đọc 5 báo cáo xuất từ iPOS Booking + thực chi Ads → src/data/reservation.json
 *
 *   node scripts/build-reservation.mjs          (npm run build:reservation)
 *
 * Nguồn: L0_input/06_ĐAT_BAN/Tháng <M>.<YYYY>/  — mỗi tháng MỘT thư mục, thả nguyên 5 file iPOS xuất:
 *   nguon_don_dat_ban__xuat_tep*.xlsx          Nguồn | Giá trị          → số ĐƠN theo nguồn (toàn chuỗi)
 *   theo_doi_tinh_trang_dat_ban*.xlsx          Ngày | Tổng đơn | Đơn hủy | Số khách
 *   thong_ke_luong_dat_ban_theo_cu*.xlsx       Nhà hàng | Tổng số khách | Khách hủy   → số KHÁCH theo cửa hàng
 *   ti_le_huy_don*.xlsx                        Trạng thái | Số đơn
 *   xu_huong_dat_ban_theo_so_luong*.xlsx       Nhóm | Lượt          → quy mô nhóm khách
 * Trùng loại (vd "(1)", "(2)") → lấy file sửa gần nhất.
 *
 * Thực chi Ads: đọc thẳng Postgres của M5.1 (ads_campaign_daily ⋈ dim_ads_campaign) khi có DATABASE_URL
 * (biến môi trường hoặc .env.local) — cắt đúng cửa sổ ngày có dữ liệu đặt bàn. Không có DB thì GIỮ số Ads
 * của bản reservation.json cũ, không ghi đè bằng 0 (số 0 trông giống "không chi đồng nào").
 *
 * File json được commit (L0_input không lên GitHub) — Vercel không cần DB lúc build.
 * Mọi luật gán nguồn → kênh → mục chi phí nằm ở SOURCE_RULES / ADS_ITEMS dưới đây và đi kèm dữ liệu;
 * màn hình M11 KHÔNG tự phân loại lại.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'L0_input', '06_ĐAT_BAN');
const MASTER = path.join(ROOT, 'data_input', '01_master.xlsx');
const OUT = path.join(ROOT, 'src', 'data', 'reservation.json');

const norm = (s) => String(s ?? '').normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();

/* ── Mục chi phí Ads ↔ nguồn đơn iPOS ──────────────────────────────────────────
   `booking_source` là KÊNH TẠO ĐƠN trong iPOS, không phải attribution quảng cáo (M5 §2).
   Ghép mỗi mục chi phí với nguồn đơn GẦN NHẤT về hành vi — tương quan, không phải nhân quả.
   Quy ước 01/10/2026 (Marketing chốt): hai mục chi phí, hai nhóm nguồn —
     Meta Ads (Tin nhắn + Tương tác)  ↔ nguồn "Fanpage"    = FacebookCRM + Fanpage
     Google Ads (PMax Local)          ↔ nguồn "Google Ads" = Google Ads + Website
   Zalo Ads KHÔNG tính (chưa có thực chi) → ZaloCRM về nhóm kênh sở hữu, không gắn chi phí. */
const ADS_ITEMS = [
  { key: 'meta', label: 'Meta Ads', platform: 'meta', action: 'Hội thoại', sources: ['meta'],
    note: 'Tin nhắn + Tương tác. Khách nhắn inbox / bấm Đặt bàn trên trang → lễ tân tạo đơn nguồn FacebookCRM hoặc Fanpage.' },
  { key: 'google', label: 'Google Ads', platform: 'google', action: 'Chuyển đổi', sources: ['google'],
    note: 'Performance Max Local → Google Maps / Search → đặt qua nút Google hoặc website. Chuyển đổi Google gồm chỉ đường · gọi · vào web, không phải đơn.' },
];

/* Nguồn đơn iPOS (theo TÊN — iPOS chỉ xuất tên, nhiều code trùng tên, vd "Google Ads" ×7) → nhóm. */
const SOURCE_RULES = [
  { re: /^(facebook ?crm|fanpage)$/, group: 'meta', kind: 'paid' },
  { re: /^(google ads|website)$/, group: 'google', kind: 'paid' },
  { re: /^zalo ?crm$/, group: 'zalo', kind: 'owned' },
  { re: /^marketing$/, group: 'mkt', kind: 'owned' },
  { re: /^(gọi đặt|hotline)$/, group: 'phone', kind: 'offline' },
  { re: /^vãng lai$/, group: 'walkin', kind: 'offline' },
  { re: /^(sales|cộng tác viên|nội bộ|đối tác)$/, group: 'direct', kind: 'offline' },
];
const GROUP_LABEL = {
  meta: 'Fanpage (FacebookCRM + Fanpage)', google: 'Google Ads (Google Ads + Website)', zalo: 'ZaloCRM',
  mkt: 'Marketing (không gắn kênh)', phone: 'Điện thoại · Hotline',
  walkin: 'Vãng lai', direct: 'Sales · CTV · Nội bộ · Đối tác', other: 'Chưa phân loại',
};

/* ── Đọc Excel ─────────────────────────────────────────────────────────────── */
const val = (c) => {
  const v = c?.value;
  if (v && typeof v === 'object') return 'result' in v ? v.result : 'text' in v ? v.text : v;
  return v;
};
async function rows(file) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.worksheets[0];
  const out = [];
  ws.eachRow((row, i) => { if (i > 1) out.push(row.values.slice(1).map((_, j) => val(row.getCell(j + 1)))); });
  return out.filter((r) => r.some((c) => c !== null && c !== undefined && c !== ''));
}
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

/* Cửa hàng iPOS → dim_store bằng cột aliases của 01_master.xlsx (cùng nguồn với loader chính). */
async function storeAliases() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(MASTER);
  const ws = wb.getWorksheet('dim_store');
  const head = ws.getRow(1).values.slice(1).map((v) => norm(v));
  const col = (k) => head.indexOf(k) + 1;
  const list = [];
  ws.eachRow((row, i) => {
    if (i === 1) return;
    const code = String(val(row.getCell(col('code'))) ?? '').trim();
    if (!code) return;
    const aliases = String(val(row.getCell(col('aliases'))) ?? '').split('|').map(norm).filter(Boolean);
    list.push({ code, brand: String(val(row.getCell(col('brand')))), name: String(val(row.getCell(col('name')))), aliases });
  });
  return list;
}

const KINDS = [
  ['sources', /^nguon_don_dat_ban/i],
  ['daily', /^theo_doi_tinh_trang_dat_ban/i],
  ['stores', /^thong_ke_luong_dat_ban_theo_cu/i],
  ['cancel', /^ti_le_huy_don/i],
  ['party', /^xu_huong_dat_ban_theo_so_luong/i],
];

function monthOf(folder) {
  const m = norm(folder).match(/tháng\s*(\d{1,2})[.\-_/ ](\d{4})/);
  return m ? `${m[2]}-${m[1].padStart(2, '0')}` : null;
}
const dmy = (s) => {
  if (s instanceof Date) return s.toISOString().slice(0, 10);
  const m = String(s).match(/^(\d{2})-(\d{2})-(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : String(s);
};

async function readMonth(folder, stores) {
  const month = monthOf(folder);
  const dir = path.join(DIR, folder);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.xlsx') && !f.startsWith('~$'));
  const pick = {};
  for (const [kind, re] of KINDS) {
    const hit = files.filter((f) => re.test(f))
      .sort((a, b) => fs.statSync(path.join(dir, b)).mtimeMs - fs.statSync(path.join(dir, a)).mtimeMs);
    if (hit.length) pick[kind] = hit[0];
  }
  const qa = [];
  const missing = KINDS.map(([k]) => k).filter((k) => !pick[k]);
  qa.push({ name: 'Đủ 5 báo cáo iPOS', ok: !missing.length, detail: missing.length ? `thiếu: ${missing.join(', ')}` : '5/5 file' });

  /* Nguồn — gộp các code trùng tên, đếm số lát để cảnh báo (M11 §3b — vụ "Google Ads" trùng tên). */
  const srcMap = new Map();
  for (const [name, v] of pick.sources ? await rows(path.join(dir, pick.sources)) : []) {
    const key = norm(name);
    const rule = SOURCE_RULES.find((r) => r.re.test(key));
    const cur = srcMap.get(key) ?? {
      name: String(name).trim(), group: rule?.group ?? 'other', kind: rule?.kind ?? 'offline', orders: 0, slices: 0,
    };
    cur.orders += num(v); cur.slices += 1;
    srcMap.set(key, cur);
  }
  const sources = [...srcMap.values()].sort((a, b) => b.orders - a.orders);

  const daily = (pick.daily ? await rows(path.join(dir, pick.daily)) : [])
    .map(([d, o, c, g]) => ({ date: dmy(d), orders: num(o), cancelled: num(c), guests: num(g) }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const storeRows = [];
  for (const [name, g, c] of pick.stores ? await rows(path.join(dir, pick.stores)) : []) {
    const key = norm(name);
    const s = stores.find((x) => x.aliases.includes(key));
    storeRows.push({ ipos: String(name).replace(/\s+/g, ' ').trim(), store: s?.code ?? null, brand: s?.brand ?? null,
      name: s?.name ?? String(name).trim(), guests: num(g), cancel_guests: num(c) });
  }

  const cancelRows = pick.cancel ? await rows(path.join(dir, pick.cancel)) : [];
  const cancelled = num(cancelRows.find((r) => /hủy|huỷ/i.test(String(r[0])))?.[1]);
  const party = (pick.party ? await rows(path.join(dir, pick.party)) : [])
    .map(([g, n]) => ({ group: String(g), orders: num(n) }));

  /* ── QA — đối chiếu chéo 5 báo cáo ── */
  const sumSrc = sources.reduce((a, s) => a + s.orders, 0);
  const sumDay = daily.reduce((a, d) => a + d.orders, 0);
  const sumParty = party.reduce((a, p) => a + p.orders, 0);
  const sumCancelRow = cancelRows.reduce((a, r) => a + num(r[1]), 0);
  const dayCancel = daily.reduce((a, d) => a + d.cancelled, 0);
  const dayGuests = daily.reduce((a, d) => a + d.guests, 0);
  const storeGuests = storeRows.reduce((a, s) => a + s.guests, 0);
  const storeCancel = storeRows.reduce((a, s) => a + s.cancel_guests, 0);
  const counts = { 'nguồn': sumSrc, 'theo ngày': sumDay, 'tỷ lệ huỷ': sumCancelRow, 'quy mô nhóm': sumParty };
  const same = new Set(Object.values(counts)).size === 1;
  qa.push({ name: 'Tổng đơn khớp giữa 4 báo cáo', ok: same,
    detail: Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(' · ') });
  qa.push({ name: 'Đơn huỷ khớp (theo ngày ↔ tỷ lệ huỷ)', ok: dayCancel === cancelled, detail: `${dayCancel} ↔ ${cancelled}` });
  qa.push({ name: 'Số khách khớp (theo cửa hàng ↔ theo ngày)', ok: storeGuests === dayGuests,
    detail: `${storeGuests} khách theo cửa hàng (gồm ${storeCancel} khách huỷ) ↔ ${dayGuests} theo ngày — lệch ${storeGuests - dayGuests}. `
      + 'iPOS không ghi rõ trục ngày của từng báo cáo (ngày tạo hay ngày phục vụ) — tỷ trọng brand lấy theo báo cáo cửa hàng.' });
  const unmappedStores = storeRows.filter((s) => !s.store).map((s) => s.ipos);
  qa.push({ name: 'Cửa hàng iPOS nhận ra hết', ok: !unmappedStores.length,
    detail: unmappedStores.length ? `chưa nhận ra: ${unmappedStores.join(', ')} — thêm bí danh ở dim_store` : `${storeRows.length}/${storeRows.length}` });
  const unknownSrc = sources.filter((s) => s.group === 'other').map((s) => s.name);
  qa.push({ name: 'Nguồn đơn phân loại hết', ok: !unknownSrc.length,
    detail: unknownSrc.length ? `nguồn lạ: ${unknownSrc.join(', ')} — thêm luật vào SOURCE_RULES` : `${sources.length} nguồn` });
  const dupNames = sources.filter((s) => s.slices > 1);
  qa.push({ name: 'Mã nguồn trùng tên', ok: !dupNames.length,
    detail: dupNames.length ? dupNames.map((s) => `"${s.name}" ×${s.slices} mã`).join(' · ') + ' — iPOS xuất theo tên nên không tách được mã nào thuộc cửa hàng nào' : 'không có' });

  const active = daily.filter((d) => d.orders > 0);
  return {
    month, folder, files: Object.values(pick),
    first: active[0]?.date ?? null, last: active.at(-1)?.date ?? null,
    days: active.length, days_month: daily.length,
    orders: sumSrc, cancelled, guests_store: storeGuests, cancel_guests_store: storeCancel, guests_daily: dayGuests,
    sources, daily, stores: storeRows, party, qa,
  };
}

/* ── Thực chi Ads (M5.1 Postgres) ──────────────────────────────────────────── */
function databaseUrl() {
  if (process.env.DATABASE_URL?.trim()) return process.env.DATABASE_URL.trim();
  const f = path.join(ROOT, '.env.local');
  if (!fs.existsSync(f)) return null;
  const line = fs.readFileSync(f, 'utf8').split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
  return line ? line.slice('DATABASE_URL='.length).replace(/^["']|["']$/g, '').trim() || null : null;
}

async function readAds(months) {
  const url = databaseUrl();
  if (!url) return null;
  const { default: postgres } = await import('postgres');
  const sql = postgres(url, { ssl: 'require', max: 1, connect_timeout: 15 });
  try {
    const out = {};
    for (const m of months) {
      if (!m.first) continue;
      const mStart = `${m.month}-01`;
      const mEnd = m.daily.at(-1)?.date ?? m.last;
      const camp = await sql`
        select c.platform, coalesce(d.brand, 'Không xác định') as brand, coalesce(d.objective, 'Khác') as objective,
               coalesce(d.funnel, 'store') as funnel, coalesce(d.campaign_name, c.campaign_id) as campaign,
               sum(c.spend) filter (where c.stat_date >= ${m.first}::date)::float as spend,
               sum(c.spend)::float as spend_month,
               sum(c.impressions) filter (where c.stat_date >= ${m.first}::date)::float as impr,
               sum(c.clicks) filter (where c.stat_date >= ${m.first}::date)::float as clicks,
               sum(c.conversions) filter (where c.stat_date >= ${m.first}::date)::float as conv,
               sum(c.messaging_conversations) filter (where c.stat_date >= ${m.first}::date)::float as msgs
          from ads_campaign_daily c
          left join dim_ads_campaign d on d.platform = c.platform and d.campaign_id = c.campaign_id
         where c.stat_date between ${mStart}::date and ${mEnd}::date
         group by 1, 2, 3, 4, 5
        having sum(c.spend) > 0
         order by 6 desc nulls last`;
      const daily = await sql`
        select c.stat_date::text as date, coalesce(d.brand, 'Không xác định') as brand,
               coalesce(d.funnel, 'store') as funnel, sum(c.spend)::float as spend
          from ads_campaign_daily c
          left join dim_ads_campaign d on d.platform = c.platform and d.campaign_id = c.campaign_id
         where c.stat_date between ${mStart}::date and ${mEnd}::date
         group by 1, 2, 3 order by 1`;
      const [sync] = await sql`select min(t)::text as through from (
          select max(window_to) as t from ads_sync_run where ok group by platform) x`;
      out[m.month] = {
        from: m.first, to: mEnd, synced_through: sync?.through ?? null, pulled_at: new Date().toISOString(),
        campaigns: camp.map((r) => ({
          platform: r.platform, brand: r.brand, objective: r.objective, funnel: r.funnel, campaign: r.campaign,
          spend: Math.round(r.spend ?? 0), spend_month: Math.round(r.spend_month ?? 0),
          impr: r.impr ?? 0, clicks: r.clicks ?? 0, conv: Math.round((r.conv ?? 0) * 10) / 10, msgs: r.msgs ?? 0,
        })),
        daily: daily.map((r) => ({ date: r.date, brand: r.brand, funnel: r.funnel, spend: Math.round(r.spend) })),
      };
    }
    return out;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

/* ── Chạy ──────────────────────────────────────────────────────────────────── */
const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : null;
const folders = fs.existsSync(DIR)
  ? fs.readdirSync(DIR, { withFileTypes: true }).filter((d) => d.isDirectory() && monthOf(d.name)).map((d) => d.name)
  : [];
if (!folders.length) {
  console.log('[reservation] không thấy thư mục "Tháng M.YYYY" trong L0_input/06_ĐAT_BAN — giữ nguyên reservation.json');
  process.exit(0);
}

const stores = await storeAliases();
const months = [];
for (const f of folders) months.push(await readMonth(f, stores));
months.sort((a, b) => a.month.localeCompare(b.month));

let ads = null;
let adsNote;
try {
  ads = await readAds(months);
  adsNote = ads ? 'Postgres M5.1' : 'không có DATABASE_URL';
} catch (e) {
  adsNote = `lỗi đọc DB: ${e.message}`;
}
if (!ads) ads = {};
for (const m of months) {
  if (!ads[m.month] && prev?.ads?.[m.month]) { ads[m.month] = prev.ads[m.month]; ads[m.month].kept = true; }
}

const data = {
  built: new Date().toISOString(),
  ads_items: ADS_ITEMS,
  source_groups: GROUP_LABEL,
  months,
  ads,
};
fs.writeFileSync(OUT, JSON.stringify(data, null, 1));

for (const m of months) {
  const a = ads[m.month];
  console.log(`[reservation] ${m.month}: ${m.orders} đơn · ${m.cancelled} huỷ · ${m.guests_store} khách · ${m.first} → ${m.last}`
    + ` · ads ${a ? `${a.campaigns.length} chiến dịch${a.kept ? ' (giữ bản cũ)' : ''}` : 'CHƯA CÓ'}`);
  for (const q of m.qa) console.log(`   ${q.ok ? '✔' : '⚠'} ${q.name}: ${q.detail}`);
}
console.log(`[reservation] Ads: ${adsNote} → ${path.relative(ROOT, OUT)}`);
