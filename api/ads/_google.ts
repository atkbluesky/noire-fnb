/**
 * M5.1 · Google Ads API — CHỈ ĐỌC.
 *
 * `googleAds:searchStream` là POST nhưng nội dung là GAQL read-only. Luật M5_1 §0.9
 * CẤM tuyệt đối mọi endpoint `:mutate` (`campaigns:mutate`, `campaignBudgets:mutate`…).
 *
 * Đã đọc tài khoản con của MCC ngày 28/09/2026: chi T8 = 4.411.052,45đ,
 * khớp Excel 4.411.053đ trong sai số làm tròn. Quyền production thuộc Cloud project.
 */
import {
  hasBrandTerm, num, redactSearchTerm,
  type AdsEnv, type CampaignDailyRow, type NetworkDailyRow, type SearchTermDailyRow,
} from './_shared.js';

/** 1.000.000 micros = 1 VND. Quên chia là chi phí gấp MỘT TRIỆU lần (M5_1 §3c.1). */
const MICROS = 1_000_000;

/**
 * Google bỏ version cũ mỗi ~4 tháng. KHÔNG ghim cứng một số rồi tin — thử từ mới
 * về cũ, version nào gọi được thì nhớ lại trong tiến trình. Ghim bằng GADS_API_VERSION.
 */
/* Đo thật 28/09/2026: v17–v21 đã bị gỡ (404), v26+ chưa có ("Method not found"),
   v22–v25 đang sống. Danh sách này sẽ lại cũ — khi mọi bản đều 404 thì thêm bản mới lên đầu. */
const VERSION_CANDIDATES = ['v25', 'v24', 'v23', 'v22'];

let cachedVersion: string | undefined;
let cachedToken: { value: string; expiresAt: number } | undefined;

export const isGoogleConfigured = (env: AdsEnv): boolean => Boolean(
  env.GADS_CLIENT_ID?.trim()
  && env.GADS_CLIENT_SECRET?.trim() && env.GADS_REFRESH_TOKEN?.trim()
  && customerList(env).length,
);

export const customerList = (env: AdsEnv): string[] =>
  (env.GADS_CUSTOMER_IDS ?? '').split(',').map(s => s.trim().replace(/-/g, '')).filter(Boolean);

/** Access token sống ~1 giờ. Nhớ lại trong tiến trình để một lần sync không đổi token nhiều lần. */
async function accessToken(env: AdsEnv): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;

  const clientId = env.GADS_CLIENT_ID?.trim();
  const clientSecret = env.GADS_CLIENT_SECRET?.trim();
  const refreshToken = env.GADS_REFRESH_TOKEN?.trim();
  if (!clientId || !clientSecret || !refreshToken) throw new Error('GADS_OAUTH_NOT_CONFIGURED');

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId, client_secret: clientSecret,
      refresh_token: refreshToken, grant_type: 'refresh_token',
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const body = await res.json().catch(() => ({})) as Record<string, unknown>;
  const token = String(body.access_token ?? '');
  if (!res.ok || !token) {
    throw new Error(`GADS_TOKEN_REFRESH_FAILED:${res.status}:${String(body.error ?? '').slice(0, 80)}`);
  }
  cachedToken = { value: token, expiresAt: Date.now() + (Number(body.expires_in) || 3600) * 1000 };
  return token;
}

async function searchStream(
  version: string, customerId: string, query: string, env: AdsEnv,
): Promise<Array<Record<string, unknown>>> {
  const token = await accessToken(env);
  const loginCid = env.GADS_LOGIN_CUSTOMER_ID?.trim().replace(/-/g, '');
  const res = await fetch(
    `https://googleads.googleapis.com/${version}/customers/${customerId}/googleAds:searchStream`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        ...(env.GADS_DEVELOPER_TOKEN?.trim() ? { 'developer-token': env.GADS_DEVELOPER_TOKEN.trim() } : {}),
        ...(loginCid ? { 'login-customer-id': loginCid } : {}),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(120_000),
    },
  );
  const text = await res.text();
  let body: unknown;
  try { body = JSON.parse(text); } catch { throw new Error(`GADS_BAD_JSON:${res.status}:${text.slice(0, 160)}`); }
  if (!res.ok) {
    const err = (Array.isArray(body) ? (body[0] as Record<string, unknown>)?.error : (body as Record<string, unknown>)?.error) as Record<string, unknown> | undefined;
    // Lấy errorCode cụ thể trong `details` — thông báo chung "The caller does not have permission"
    // không phân biệt được thiếu quyền tài khoản hay developer token mới ở mức Test.
    const codes = ((err?.details as Array<{ errors?: Array<{ errorCode?: Record<string, string> }> }>) ?? [])
      .flatMap(d => d.errors ?? []).map(e => Object.values(e.errorCode ?? {}).join('/')).filter(Boolean);
    throw new Error(`GADS_HTTP_${res.status}:${codes.length ? codes.join(',') + ':' : ''}${String(err?.message ?? text.slice(0, 160))}`);
  }
  // searchStream trả MẢNG chunk, mỗi chunk có `.results`.
  const chunks = Array.isArray(body) ? body : [body];
  return chunks.flatMap(c => ((c as Record<string, unknown>)?.results as Array<Record<string, unknown>>) ?? []);
}

/** Dò version gọi được. Lỗi quyền thì ném luôn — đổi version cũng vô ích. */
async function resolveVersion(customerId: string, env: AdsEnv): Promise<string> {
  const pinned = env.GADS_API_VERSION?.trim();
  if (pinned) return pinned;
  if (cachedVersion) return cachedVersion;

  let lastError = 'GADS_NO_WORKING_VERSION';
  for (const v of VERSION_CANDIDATES) {
    try {
      await searchStream(v, customerId, 'SELECT customer.id FROM customer LIMIT 1', env);
      cachedVersion = v;
      return v;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      lastError = msg;
      // Không phải lỗi version → dừng, báo nguyên văn để người đọc biết đi xin quyền.
      if (/DEVELOPER_TOKEN|PERMISSION_DENIED|NOT_APPROVED|not.*approved|test account|UNAUTHENTICATED|does not have permission|GADS_HTTP_40[13]/i.test(msg)) {
        throw new Error(msg);
      }
    }
  }
  throw new Error(lastError);
}

const gaqlDate = (since: string, until: string) => `segments.date BETWEEN '${since}' AND '${until}'`;

export interface GoogleCustomer {
  customerId: string;
  name: string | null;
  currency: string | null;
  timezone: string | null;
}

export async function fetchCustomer(customerId: string, env: AdsEnv): Promise<GoogleCustomer> {
  const version = await resolveVersion(customerId, env);
  const rows = await searchStream(version, customerId,
    'SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone, customer.manager FROM customer LIMIT 1', env);
  const c = (rows[0]?.customer ?? {}) as Record<string, unknown>;
  if (c.manager === true) throw new Error(`GADS_CUSTOMER_IS_MANAGER:${customerId}:Đặt tài khoản chạy quảng cáo vào GADS_CUSTOMER_IDS và MCC vào GADS_LOGIN_CUSTOMER_ID`);
  return {
    customerId,
    name: c.descriptiveName == null ? null : String(c.descriptiveName),
    currency: c.currencyCode == null ? null : String(c.currencyCode),
    timezone: c.timeZone == null ? null : String(c.timeZone),
  };
}

const m = (row: Record<string, unknown>) => (row.metrics ?? {}) as Record<string, unknown>;
const c = (row: Record<string, unknown>) => (row.campaign ?? {}) as Record<string, unknown>;
const seg = (row: Record<string, unknown>) => (row.segments ?? {}) as Record<string, unknown>;

/** Chi phí micros → VND. Chia NGAY ở đây, không để tầng trên chia (M5_1 §3c.1). */
const spendOf = (row: Record<string, unknown>) => num(m(row).costMicros, 'cost_micros') / MICROS;

export async function fetchCampaignDaily(
  customerId: string, since: string, until: string, env: AdsEnv,
): Promise<CampaignDailyRow[]> {
  const version = await resolveVersion(customerId, env);
  const rows = await searchStream(version, customerId, `
    SELECT campaign.id, campaign.name, campaign.status, segments.date,
           metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions
    FROM campaign
    WHERE ${gaqlDate(since, until)}`.trim(), env);

  return rows.map(r => ({
    platform: 'google' as const,
    campaignId: String(c(r).id ?? ''),
    campaignName: String(c(r).name ?? ''),
    accountId: customerId,
    statDate: String(seg(r).date ?? ''),
    spend: spendOf(r),
    impressions: num(m(r).impressions, 'impressions'),
    clicks: num(m(r).clicks, 'clicks'),
    reach: null,                      // Google KHÔNG trả reach → null, không phải 0
    frequency: null,
    conversions: num(m(r).conversions, 'conversions'),   // THẬP PHÂN, không phải integer
    results: null,
    resultType: null,
    messagingConversations: 0,
    linkClicks: 0,          // Google không tách link click — dùng `clicks`
    leads: 0,
    videoViews: 0,
    thruplays: 0,
    status: c(r).status == null ? null : String(c(r).status),
    raw: {},
  }));
}

export async function fetchNetworkDaily(
  customerId: string, since: string, until: string, env: AdsEnv,
): Promise<NetworkDailyRow[]> {
  const version = await resolveVersion(customerId, env);
  const rows = await searchStream(version, customerId, `
    SELECT campaign.id, segments.date, segments.ad_network_type,
           metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions
    FROM campaign
    WHERE ${gaqlDate(since, until)}`.trim(), env);

  return rows.map(r => ({
    campaignId: String(c(r).id ?? ''),
    network: String(seg(r).adNetworkType ?? 'UNKNOWN'),
    statDate: String(seg(r).date ?? ''),
    spend: spendOf(r),
    impressions: num(m(r).impressions, 'impressions'),
    clicks: num(m(r).clicks, 'clicks'),
    conversions: num(m(r).conversions, 'conversions'),
  }));
}

/**
 * Cụm từ tìm kiếm. Trả kèm `redacted` = số cụm bị lược vì nghi lộ SĐT (M5_1 §2g).
 *
 * Chỉ giữ cụm CÓ hoạt động: báo cáo T8/2026 có 3.799 cụm nhưng chỉ 452 cụm có
 * nhấp/chuyển đổi/chi phí; phần đuôi 0 lượt nhấp chiếm ~88% số dòng mà không nói
 * lên điều gì (M5 §cuối).
 */
export async function fetchSearchTermDaily(
  customerId: string, since: string, until: string, env: AdsEnv,
): Promise<{ rows: SearchTermDailyRow[]; redacted: number }> {
  const version = await resolveVersion(customerId, env);
  const raw = await searchStream(version, customerId, `
    SELECT campaign.id, campaign_search_term_view.search_term, segments.date,
           metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions
    FROM campaign_search_term_view
    WHERE ${gaqlDate(since, until)}`.trim(), env);

  let redacted = 0;

  /* GỘP theo khoá chính (campaign_id, search_term, stat_date) thay vì đẩy thẳng.
     Bắt buộc, vì nhiều cụm từ KHÁC NHAU cùng lược thành '[đã lược]' sẽ trùng khoá;
     upsert khi đó ghi đè nhau và làm MẤT chi tiêu thay vì cộng dồn. */
  const bucket = new Map<string, SearchTermDailyRow>();

  for (const r of raw) {
    const spend = spendOf(r);
    const clicks = num(m(r).clicks, 'clicks');
    const conversions = num(m(r).conversions, 'conversions');
    if (spend === 0 && clicks === 0 && conversions === 0) continue;   // bỏ phần đuôi im lặng

    const view = (r.campaignSearchTermView ?? {}) as Record<string, unknown>;
    const safe = redactSearchTerm(String(view.searchTerm ?? ''));
    if (safe.redacted) redacted += 1;
    if (!safe.term) continue;

    const campaignId = String(c(r).id ?? '');
    const statDate = String(seg(r).date ?? '');
    const key = `${campaignId}\u0000${safe.term}\u0000${statDate}`;

    const hit = bucket.get(key);
    if (hit) {
      hit.spend += spend;
      hit.impressions += num(m(r).impressions, 'impressions');
      hit.clicks += clicks;
      hit.conversions += conversions;
    } else {
      bucket.set(key, {
        campaignId,
        searchTerm: safe.term,
        statDate,
        spend,
        impressions: num(m(r).impressions, 'impressions'),
        clicks,
        conversions,
        hasBrandTerm: hasBrandTerm(safe.term),
      });
    }
  }
  return { rows: [...bucket.values()], redacted };
}
