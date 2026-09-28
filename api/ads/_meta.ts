/**
 * M5.1 · Meta Marketing API — CHỈ ĐỌC.
 *
 * Luật M5_1 §0.9: file này chỉ được gọi `GET /insights` và `GET /act_<id>`.
 * CẤM tuyệt đối mọi endpoint mutate (`POST /act_<id>/campaigns`, `campaignBudgets`…) —
 * tài khoản này đang tiêu tiền thật.
 * (Viết `<id>` chứ không viết dấu sao: chuỗi sao-gạch-chéo đóng sớm block comment
 *  và làm vỡ bundle — đã mắc một lần 27/09/2026.)
 *
 * Logic dưới đây đã được `scripts/ads-probe.mjs` đo trên production 27/09/2026 và
 * ra ĐÚNG 47.526.065đ cho T8/2026, khớp nhánh Excel lệch 0,00%. Sửa gì ở đây phải
 * chạy lại `npm run probe:ads reconcile` để chứng minh vẫn khớp.
 */
import {
  accountList, num, type AdsEnv, type CampaignDailyRow,
} from './_shared.js';

const DEFAULT_VERSION = 'v23.0';

/** Meta đo được tới bước tin nhắn — đây là mẫu số Cost per Conversation (M5_1 §3a). */
const MESSAGING_ACTION = 'onsite_conversion.messaging_conversation_started_7d';

/**
 * BẮT BUỘC `level=campaign`. Thiếu là export lẫn cả dòng cấp adset (có tháng còn
 * tách theo tuổi × giới tính) → cộng ra 549tr thay vì 157tr, sai 3,5 lần.
 * Đây là bẫy M5 §6.1, đã mắc một lần với Excel.
 */
const INSIGHT_FIELDS =
  'campaign_id,campaign_name,spend,impressions,clicks,reach,frequency,actions,video_thruplay_watched_actions';

export function requireMeta(env: AdsEnv): { version: string; token: string; accounts: string[] } {
  const token = env.META_ADS_SYSTEM_TOKEN?.trim();
  const accounts = accountList(env.META_ADS_ACCOUNT_IDS);
  if (!token) throw new Error('META_TOKEN_NOT_CONFIGURED');
  if (!accounts.length) throw new Error('META_ACCOUNTS_NOT_CONFIGURED');
  return { version: (env.FB_GRAPH_VERSION || DEFAULT_VERSION).trim(), token, accounts };
}

export const isMetaConfigured = (env: AdsEnv): boolean =>
  Boolean(env.META_ADS_SYSTEM_TOKEN?.trim() && accountList(env.META_ADS_ACCOUNT_IDS).length);

interface GraphResult {
  data?: Array<Record<string, unknown>>;
  paging?: { next?: string; cursors?: { after?: string } };
  [key: string]: unknown;
}

/** Mức dùng quota; >90% thì dừng vòng lặp để cron sau chạy tiếp (M5_1 §4a). */
function usagePercent(header: string | null): number {
  if (!header) return 0;
  try {
    let worst = 0;
    for (const rows of Object.values(JSON.parse(header) as Record<string, Array<Record<string, number>>>)) {
      for (const r of rows ?? []) {
        worst = Math.max(worst, r.call_count ?? 0, r.total_cputime ?? 0, r.total_time ?? 0);
      }
    }
    return worst;
  } catch {
    return 0;   // header đổi định dạng không phải lỗi nghiệp vụ
  }
}

async function graph(
  node: string,
  params: Record<string, string | number | undefined>,
  env: AdsEnv,
  timeoutMs = 60_000,
): Promise<{ body: GraphResult; usage: number }> {
  const { version, token } = requireMeta(env);
  const url = new URL(`https://graph.facebook.com/${version}/${node}`);
  for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, String(v));
  url.searchParams.set('access_token', token);

  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  const body = await res.json().catch(() => ({})) as GraphResult & { error?: Record<string, unknown> };
  if (!res.ok || body.error) {
    const e = (body.error ?? {}) as Record<string, unknown>;
    throw new Error(`META_GRAPH_FAILED:${res.status}:${String(e.code ?? '')}:${String(e.message ?? '').slice(0, 160)}`);
  }
  return { body, usage: usagePercent(res.headers.get('x-business-use-case-usage')) };
}

export interface MetaAccount {
  accountId: string;
  name: string | null;
  currency: string | null;
  timezone: string | null;
}

export async function fetchAccount(accountId: string, env: AdsEnv): Promise<MetaAccount> {
  const { body } = await graph(`act_${accountId}`, {
    fields: 'account_id,name,currency,timezone_name',
  }, env);
  return {
    accountId: String(body.account_id ?? accountId),
    name: body.name == null ? null : String(body.name),
    currency: body.currency == null ? null : String(body.currency),
    timezone: body.timezone_name == null ? null : String(body.timezone_name),
  };
}

/** Lấy giá trị của một action_type trong mảng `actions`. */
function actionValue(actions: unknown, type: string): number {
  if (!Array.isArray(actions)) return 0;
  const hit = actions.find(a => (a as Record<string, unknown>)?.action_type === type);
  return hit ? num((hit as Record<string, unknown>).value, `action:${type}`) : 0;
}

function mapRow(raw: Record<string, unknown>, accountId: string): CampaignDailyRow {
  return {
    platform: 'meta',
    campaignId: String(raw.campaign_id ?? ''),
    campaignName: String(raw.campaign_name ?? ''),
    accountId,
    // `date_start` của dòng time_increment=1 là NGÀY theo timezone TÀI KHOẢN.
    // Đo 27/09/2026: tài khoản Fnb Ads dùng Asia/Ho_Chi_Minh nên trùng ICT.
    // Tài khoản khác timezone thì `dim_ads_account.timezone` giữ dấu vết (M5_1 §3c.3).
    statDate: String(raw.date_start ?? ''),
    spend: num(raw.spend, 'spend'),                 // Meta trả CHUỖI — num() chặn NaN
    impressions: num(raw.impressions, 'impressions'),
    clicks: num(raw.clicks, 'clicks'),
    reach: raw.reach == null ? null : num(raw.reach, 'reach'),
    frequency: raw.frequency == null ? null : num(raw.frequency, 'frequency'),
    conversions: 0,                                  // Meta không có khái niệm này như Google
    results: null,
    resultType: null,
    messagingConversations: actionValue(raw.actions, MESSAGING_ACTION),
    // Ba action dưới đo được ở T8/2026: link_click 5.372 · lead 191 · video_view 138.830.
    linkClicks: actionValue(raw.actions, 'link_click'),
    leads: actionValue(raw.actions, 'lead'),
    videoViews: actionValue(raw.actions, 'video_view'),
    // ThruPlay KHÔNG nằm trong `actions` — là trường riêng, cũng dạng mảng {action_type, value}.
    thruplays: actionValue(raw.video_thruplay_watched_actions, 'video_view'),
    status: null,                                    // insights không trả status chiến dịch
    // Giữ `actions` để sau muốn thêm loại kết quả khác thì khỏi kéo lại API (M5_1 §2c).
    raw: { actions: Array.isArray(raw.actions) ? raw.actions : [] },
  };
}

/**
 * Kéo insights cấp chiến dịch, 1 dòng/ngày, cho MỘT tài khoản.
 * Trả về cả cờ `throttled` để caller biết dừng sớm vì quota.
 */
export async function fetchInsights(
  accountId: string,
  since: string,
  until: string,
  env: AdsEnv,
): Promise<{ rows: CampaignDailyRow[]; throttled: boolean }> {
  const rows: CampaignDailyRow[] = [];
  let after: string | undefined;
  let throttled = false;

  for (let page = 0; page < 200; page += 1) {
    const { body, usage } = await graph(`act_${accountId}/insights`, {
      level: 'campaign',
      time_increment: 1,
      time_range: JSON.stringify({ since, until }),
      fields: INSIGHT_FIELDS,
      limit: 500,
      after,
    }, env);

    for (const item of body.data ?? []) rows.push(mapRow(item, accountId));

    if (usage >= 90) { throttled = true; break; }
    after = body.paging?.cursors?.after;
    if (!body.paging?.next || !after) break;
  }

  return { rows, throttled };
}

/* ─── Reach & tần suất theo CỬA SỔ (M5_1 §2h) ───────────────────────────────
   Reach không cộng được qua ngày/chiến dịch, nên hỏi Meta đúng cả cửa sổ: không
   truyền `time_increment` thì Meta trả MỘT dòng cho toàn khoảng `time_range`.
   `level=account` → một dòng cho tài khoản; `level=campaign` → một dòng mỗi chiến dịch. */
export async function fetchWindowReach(
  accountId: string,
  level: 'account' | 'campaign',
  since: string,
  until: string,
  env: AdsEnv,
): Promise<Array<{ entityId: string; reach: number | null; impressions: number | null; frequency: number | null; spend: number | null }>> {
  const out: Array<{ entityId: string; reach: number | null; impressions: number | null; frequency: number | null; spend: number | null }> = [];
  let after: string | undefined;
  for (let page = 0; page < 50; page += 1) {
    const { body } = await graph(`act_${accountId}/insights`, {
      level,
      time_range: JSON.stringify({ since, until }),
      fields: level === 'campaign' ? 'campaign_id,reach,impressions,frequency,spend' : 'reach,impressions,frequency,spend',
      limit: 500,
      after,
    }, env);
    for (const r of body.data ?? []) {
      const opt = (v: unknown, label: string) => (v == null || v === '' ? null : num(v, label));
      out.push({
        entityId: level === 'campaign' ? String(r.campaign_id ?? '') : accountId,
        reach: opt(r.reach, 'reach'),
        impressions: opt(r.impressions, 'impressions'),
        frequency: opt(r.frequency, 'frequency'),
        spend: opt(r.spend, 'spend'),
      });
    }
    after = body.paging?.cursors?.after;
    if (!body.paging?.next || !after) break;
  }
  return out;
}
