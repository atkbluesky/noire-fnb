/**
 * M5.1 · Ads Auto — hạ tầng dùng chung.
 *
 * Trách nhiệm DUY NHẤT: env · kiểu dữ liệu · luật gán brand/objective/funnel ·
 * upsert dimension + fact. CẤM gọi Meta hay Google ở đây — hai việc đó nằm ở
 * `_meta.ts` và `_google.ts`.
 *
 * Luật M5_1 §0.4: file này IMPORT `api/zalo/_shared.ts`, không sao chép lại logic.
 * M5.1 là module thứ TƯ dùng chung pool đó (sau M8.1 · M10.1 · M8.2) — khi chạy Vite
 * dev cả bốn nằm trong một tiến trình nên bắt buộc chung một pool.
 */
import { getSql, ictDate, json, requireCron, type Sql } from '../zalo/_shared.js';

export { getSql, ictDate, json, requireCron };
export type { Sql };

export interface AdsEnv extends NodeJS.ProcessEnv {
  DATABASE_URL?: string;
  CRON_SECRET?: string;
  // Meta — FB_GRAPH_VERSION dùng chung với M8.2, KHÔNG khai key thứ hai
  FB_GRAPH_VERSION?: string;
  META_ADS_SYSTEM_TOKEN?: string;
  META_ADS_ACCOUNT_IDS?: string;
  // Google
  GADS_DEVELOPER_TOKEN?: string;
  GADS_CLIENT_ID?: string;
  GADS_CLIENT_SECRET?: string;
  GADS_REFRESH_TOKEN?: string;
  GADS_CUSTOMER_IDS?: string;
  GADS_LOGIN_CUSTOMER_ID?: string;
  GADS_API_VERSION?: string;
  // Vận hành
  ADS_SYNC_WINDOW_DAYS?: string;
  ADS_EXPORT_SECRET?: string;
}

export type Platform = 'meta' | 'google';
export type Funnel = 'store' | 'booking' | 'hr';

export const UNKNOWN_BRAND = 'Không xác định';

/* ─── Luật gán — port NGUYÊN VĂN từ build_mkt.py:114-124 ────────────────────
   Hai nhánh ETL phải ra cùng một kết quả, nếu không số API và số Excel lệch nhau
   mà không ai biết vì sao (QĐ-4, loại lỗi im lặng tệ nhất).

   ⚠ Đây CHỈ là giá trị mặc định lúc SINH dòng `dim_ads_campaign`. Sau đó luật thật
   nằm ở dòng DB đó, không nằm ở đây. Sửa brand = sửa DB, không sửa file này.        */

const norm = (value: unknown): string => String(value ?? '').toLowerCase();

/** Chiến dịch tuyển dụng — KHÔNG phải marketing thương hiệu (M5 §6.2). */
const HR_PAT = /hr |tuyển dụng|tuyen dung|recruit/;

const BRAND_PAT: Array<[string, RegExp]> = [
  /* `jpb` — biến thể gõ tay của NJFB, gặp ở "NOIRE JPB - Combo sáng" (245.276đ).
     Người vận hành xác nhận 27/09/2026. */
  ['NJFB', /\bnjfb\b|\bnfb\b|\bjfb\b|\bjpb\b|japanese|fusion|crest|\bssv\b/],
  /* `noire dc` — biến thể gõ tay của NDC ("NOIRE DC - Engage", "NOIRE DC - Weekly
     Performance"). Người vận hành xác nhận 27/09/2026. */
  ['NDC', /\bndc\b|noire\s*dc\b|dining|39 ?ntmk|berkley/],
  ['NCB', /\bncb\b|bistro|the mett|empress|\bskc\b|café|cafe/],
  /* NEC — NOIRE Events & Catering. KHÔNG có trong build_mkt.py, thêm 27/09/2026 sau
     khi probe đo được 6.521.370đ (13,7% chi tiêu T8) rơi vào 'Không xác định'.
     Đặt CUỐI để không cướp chiến dịch của ba brand trên. */
  ['NEC', /\bnec\b|events? ?&? ?catering|noire events/],
];

const OBJ_PAT: Array<[string, RegExp]> = [
  ['Tuyển dụng', HR_PAT],
  ['Lead tiệc', /\blead\b|tiệc|tiec|\byep\b|booking|party|banquet/],
  ['Tin nhắn', /message|mess\b|tin nhắn|cuộc trò chuyện|inbox/],
  ['Tương tác', /engagement|tương tác|post|reel|clip|video/],
  ['Tiếp cận', /reach|awareness|nhận diện|traffic|lượt xem/],
];

const tag = (text: string, pats: Array<[string, RegExp]>, fallback: string): string => {
  const n = norm(text);
  for (const [label, pattern] of pats) if (pattern.test(n)) return label;
  return fallback;
};

export const isHrCampaign = (name: string): boolean => HR_PAT.test(norm(name));

export const guessBrand = (name: string): string =>
  isHrCampaign(name) ? 'Tuyển dụng' : tag(name, BRAND_PAT, UNKNOWN_BRAND);

export const guessObjective = (name: string, resultType = ''): string =>
  tag(`${name} ${resultType}`, OBJ_PAT, 'Khác');

/**
 * Phễu doanh thu mà chi tiêu nhắm tới — quyết định chi tiêu này so được với mẫu số nào.
 *
 * Luật lấy từ M10 §3 (`$booking.ads`): tên chứa tiệc/booking/party/YEP/sự kiện/event
 * HOẶC mã fanpage NEC. Giữ NGUYÊN luật đó để M5 và M10 không đếm lệch nhau.
 *
 * ⚠ SỬA 27/09/2026 — bản đầu SAI. Nó loại trừ ba brand nhà hàng khỏi `booking`, nên
 * 26 chiến dịch tiệc chạy trên page NCB/NDC/NJFB (**35.568.697đ**, 17,4% chi 8 tháng)
 * bị xếp `store`. Trong khi M10 ĐANG tính đúng các chiến dịch đó là chi phí ads booking
 * → hai module đếm lệch nhau, đúng cái điều đoạn ghi chú trên nói là phải tránh.
 *
 * Cách tách đúng nằm ở ĐỘ MẠNH của tín hiệu, không ở brand:
 *   · tín hiệu MẠNH (tiệc · YEP · party · banquet · sự kiện · event) → booking, bất kể brand.
 *     `NOIRE Dining- YEP` chạy trên page NDC nhưng bán tiệc, không bán bữa ăn tại chỗ.
 *   · riêng chữ "booking" thì YẾU — `NDC | Messages 2026` là tin nhắn ĐẶT BÀN nhà hàng,
 *     không phải tiệc (chính M10 §3 nêu ca này). Chỉ nhận khi brand không phải nhà hàng.
 */
const BANQUET_STRONG = /tiệc|tiec|\byep\b|party|banquet|sự kiện|su kien|\bevent\b/;
const BANQUET_WEAK = /booking|\blead\b/;

export function guessFunnel(name: string, brand: string): Funnel {
  if (isHrCampaign(name)) return 'hr';
  if (brand === 'NEC') return 'booking';
  const n = norm(name);
  if (BANQUET_STRONG.test(n)) return 'booking';
  if (BANQUET_WEAK.test(n) && !['NCB', 'NDC', 'NJFB'].includes(brand)) return 'booking';
  return 'store';
}

/* ─── Kiểu dữ liệu fact ─────────────────────────────────────────────────────── */

export interface CampaignDailyRow {
  platform: Platform;
  campaignId: string;
  campaignName: string;
  accountId: string | null;
  statDate: string;                      // 'YYYY-MM-DD'
  spend: number;                         // VND — Google ĐÃ chia micros trước khi tới đây
  impressions: number;
  clicks: number;
  reach: number | null;                  // Google không có → null, KHÔNG phải 0
  frequency: number | null;
  conversions: number;
  results: number | null;
  resultType: string | null;
  messagingConversations: number;
  status: string | null;
  raw: Record<string, unknown>;
}

export interface NetworkDailyRow {
  campaignId: string;
  network: string;
  statDate: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
}

export interface SearchTermDailyRow {
  campaignId: string;
  searchTerm: string;
  statDate: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  hasBrandTerm: boolean;
}

/* ─── Bẫy đơn vị — chặn ngay ở tầng map (M5_1 §3c) ─────────────────────────── */

/**
 * Meta trả `spend` dạng CHUỖI ("1234.56"). Cộng thẳng là nối chuỗi.
 * Giá trị không parse được thì THROW — tuyệt đối không lặng lẽ thành 0,
 * vì 0 trông giống "không chi" và lọt qua mọi QA gate.
 */
export function num(value: unknown, label: string): number {
  if (value == null || value === '') return 0;
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`ADS_NOT_A_NUMBER:${label}:${String(value).slice(0, 40)}`);
  return n;
}

/** Trần tỉnh táo cho chi tiêu một ngày một chiến dịch — bắt lỗi quên chia micros. */
export const SANE_SPEND_MAX = 1e10;

export function assertSaneSpend(row: CampaignDailyRow): void {
  if (row.spend >= SANE_SPEND_MAX) {
    throw new Error(`ADS_SPEND_INSANE:${row.platform}:${row.campaignId}:${row.statDate}:${row.spend}`);
  }
  // Bẫy M5 §6.3 — export Excel có dòng cộng dồn. API lẽ ra không trả, nhưng kiểm vẫn hơn tin.
  if (/^tổng số/i.test(row.campaignName.trim())) {
    throw new Error(`ADS_TOTAL_ROW_LEAKED:${row.campaignId}:${row.campaignName.slice(0, 40)}`);
  }
}

/* ─── Riêng tư: cụm từ tìm kiếm (M5_1 §2g) ─────────────────────────────────── */

/** Chuỗi ≥9 chữ số = nghi số điện thoại. Không lưu truy vấn nhận dạng được cá nhân. */
const PHONE_ISH = /\d{9,}/;
export const REDACTED_TERM = '[đã lược]';

export function redactSearchTerm(term: string): { term: string; redacted: boolean } {
  const cleaned = String(term ?? '').trim();
  if (PHONE_ISH.test(cleaned.replace(/[\s.\-()]/g, ''))) return { term: REDACTED_TERM, redacted: true };
  return { term: cleaned, redacted: false };
}

export const hasBrandTerm = (term: string): boolean => /noire/i.test(term);

/* ─── Ghi xuống DB ──────────────────────────────────────────────────────────── */

export async function upsertAccount(
  sql: Sql,
  a: { platform: Platform; accountId: string; name?: string | null; currency?: string | null; timezone?: string | null },
): Promise<void> {
  await sql`insert into dim_ads_account (platform, account_id, name, currency, timezone)
    values (${a.platform}, ${a.accountId}, ${a.name ?? null}, ${a.currency ?? null}, ${a.timezone ?? null})
    on conflict (platform, account_id) do update set
      name = excluded.name, currency = excluded.currency,
      timezone = excluded.timezone, updated_at = now()`;
}

/**
 * Chèn dòng dimension cho chiến dịch chưa từng thấy, đoán brand/objective/funnel
 * bằng regex MỘT LẦN. Chiến dịch đã có thì chỉ làm mới `campaign_name`.
 *
 * `mapping_locked = true` → KHÔNG đụng vào brand/objective/funnel/store_code nữa,
 * kể cả khi tên chiến dịch đổi (QA gate 12).
 */
export async function upsertCampaignDim(sql: Sql, rows: CampaignDailyRow[]): Promise<void> {
  const seen = new Map<string, CampaignDailyRow>();
  for (const r of rows) seen.set(`${r.platform}:${r.campaignId}`, r);

  for (const r of seen.values()) {
    const brand = guessBrand(r.campaignName);
    await sql`insert into dim_ads_campaign (
        platform, campaign_id, account_id, campaign_name, brand, objective, funnel
      ) values (
        ${r.platform}, ${r.campaignId}, ${r.accountId}, ${r.campaignName},
        ${brand}, ${guessObjective(r.campaignName, r.resultType ?? '')}, ${guessFunnel(r.campaignName, brand)}
      )
      on conflict (platform, campaign_id) do update set
        account_id = excluded.account_id,
        campaign_name = excluded.campaign_name,
        -- chỉ đoán lại khi người CHƯA sửa tay
        brand     = case when dim_ads_campaign.mapping_locked then dim_ads_campaign.brand     else excluded.brand     end,
        objective = case when dim_ads_campaign.mapping_locked then dim_ads_campaign.objective else excluded.objective end,
        funnel    = case when dim_ads_campaign.mapping_locked then dim_ads_campaign.funnel    else excluded.funnel    end,
        updated_at = now()`;
  }
}

/**
 * Chia lô để một câu lệnh không mang quá nhiều tham số.
 * 500 dòng × 15 cột = 7.500 giá trị, còn xa trần 65.535 của Postgres.
 */
const CHUNK = 500;

function chunked<T>(items: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Upsert fact theo khoá tự nhiên → chạy lại không cộng đôi (QA gate 8).
 *
 * Ghi theo LÔ bằng `unnest`: mỗi lô là MỘT lượt đi-về database.
 * Bản đầu ghi từng dòng một — T3/2026 có 403 dòng thành 403 lượt đi-về Neon, đo
 * 27/09/2026 là chậm thấy rõ và sẽ **timeout** trên Vercel (10s Hobby / 60s Pro).
 *
 * Dùng `unnest` chứ không dùng helper `sql(rows, …)` vì cột `raw` là `jsonb`:
 * với `unnest` thì ép kiểu từng mảng một cách tường minh, không phụ thuộc suy đoán.
 */
export async function upsertCampaignDaily(sql: Sql, rows: CampaignDailyRow[]): Promise<number> {
  if (!rows.length) return 0;
  for (const r of rows) assertSaneSpend(r);

  let written = 0;
  for (const part of chunked(rows)) {
    await sql`insert into ads_campaign_daily (
        platform, campaign_id, stat_date, account_id, spend, impressions, clicks, reach,
        frequency, conversions, results, result_type, messaging_conversations, status, raw, synced_at
      )
      select t.*, now() from unnest(
        ${part.map(r => r.platform)}::text[],
        ${part.map(r => r.campaignId)}::text[],
        ${part.map(r => r.statDate)}::date[],
        ${part.map(r => r.accountId)}::text[],
        ${part.map(r => r.spend)}::numeric[],
        ${part.map(r => r.impressions)}::bigint[],
        ${part.map(r => r.clicks)}::bigint[],
        ${part.map(r => r.reach)}::bigint[],
        ${part.map(r => r.frequency)}::numeric[],
        ${part.map(r => r.conversions)}::numeric[],
        ${part.map(r => r.results)}::numeric[],
        ${part.map(r => r.resultType)}::text[],
        ${part.map(r => r.messagingConversations)}::bigint[],
        ${part.map(r => r.status)}::text[],
        ${part.map(r => JSON.stringify(r.raw ?? {}))}::jsonb[]
      ) as t(platform, campaign_id, stat_date, account_id, spend, impressions, clicks, reach,
             frequency, conversions, results, result_type, messaging_conversations, status, raw)
      on conflict (platform, campaign_id, stat_date) do update set
        account_id = excluded.account_id, spend = excluded.spend,
        impressions = excluded.impressions, clicks = excluded.clicks, reach = excluded.reach,
        frequency = excluded.frequency, conversions = excluded.conversions,
        results = excluded.results, result_type = excluded.result_type,
        messaging_conversations = excluded.messaging_conversations,
        status = excluded.status, raw = excluded.raw, synced_at = now()`;
    written += part.length;
  }
  return written;
}

export async function upsertNetworkDaily(sql: Sql, rows: NetworkDailyRow[]): Promise<number> {
  let written = 0;
  for (const r of rows) {
    await sql`insert into ads_network_daily (
        platform, campaign_id, network, stat_date, spend, impressions, clicks, conversions, synced_at
      ) values (
        'google', ${r.campaignId}, ${r.network}, ${r.statDate}::date,
        ${r.spend}, ${r.impressions}, ${r.clicks}, ${r.conversions}, now()
      )
      on conflict (platform, campaign_id, network, stat_date) do update set
        spend = excluded.spend, impressions = excluded.impressions,
        clicks = excluded.clicks, conversions = excluded.conversions, synced_at = now()`;
    written += 1;
  }
  return written;
}

export async function upsertSearchTermDaily(sql: Sql, rows: SearchTermDailyRow[]): Promise<number> {
  let written = 0;
  for (const r of rows) {
    await sql`insert into ads_search_term_daily (
        platform, campaign_id, search_term, stat_date, spend, impressions, clicks,
        conversions, has_brand_term, synced_at
      ) values (
        'google', ${r.campaignId}, ${r.searchTerm}, ${r.statDate}::date,
        ${r.spend}, ${r.impressions}, ${r.clicks}, ${r.conversions}, ${r.hasBrandTerm}, now()
      )
      on conflict (platform, campaign_id, search_term, stat_date) do update set
        spend = excluded.spend, impressions = excluded.impressions, clicks = excluded.clicks,
        conversions = excluded.conversions, has_brand_term = excluded.has_brand_term, synced_at = now()`;
    written += 1;
  }
  return written;
}

/** Dựng lại mart. Gọi SAU khi fact đã ghi xong, nếu không mart sẽ thiếu. */
export async function refreshMart(sql: Sql, from: string, to: string): Promise<number> {
  const [row] = await sql<{ n: number }[]>`select ads_refresh_daily_metric(${from}::date, ${to}::date) as n`;
  return Number(row?.n ?? 0);
}

/* ─── Tiện ích ngày ─────────────────────────────────────────────────────────── */

export const isoDate = (d: Date): string => d.toISOString().slice(0, 10);

export function shiftDays(value: string, days: number): string {
  const d = new Date(`${value}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDate(d);
}

/** Ngày cuối của 'YYYY-MM'. */
export function monthEnd(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
}

export const isMonth = (value: string): boolean => /^\d{4}-(0[1-9]|1[0-2])$/.test(value);

export const accountList = (raw?: string): string[] =>
  (raw ?? '').split(',').map(s => s.trim().replace(/^act_/, '').replace(/-/g, '')).filter(Boolean);
