/**
 * M5.1 · GET|POST /api/ads/sync — cron ngày, kéo Meta + Google về Postgres.
 *
 * Bảo vệ bằng `Bearer CRON_SECRET` (luật chung với M8.1/M10.1/M8.2).
 *
 * Vì sao cron chứ không webhook: Meta và Google KHÔNG có webhook cho số chi tiêu.
 * Vì sao cửa sổ nhiều ngày chứ không một ngày: số hôm nay chưa chốt — Meta còn hiệu
 * chỉnh attribution tới 28 ngày, Google chốt chi phí sau ~3 giờ. Kéo lại 7 ngày rồi
 * upsert thì ngày T-3 hôm nay khác hôm qua vẫn được sửa (M5_1 §1b).
 *
 * Idempotent: mọi ghi upsert theo khoá tự nhiên, mart dựng lại bằng delete+insert
 * đúng khoảng ngày. Chạy hai lần liền ra cùng kết quả (QA gate 8).
 */
import {
  accountList, getSql, isoDate, json, monthEnd, isMonth, refreshMart, requireCron, shiftDays,
  upsertAccount, upsertCampaignDaily, upsertCampaignDim, upsertNetworkDaily, upsertPeriodReach, upsertSearchTermDaily,
  type AdsEnv, type CampaignDailyRow, type PeriodReachRow, type Sql,
} from './_shared.js';
import { fetchAccount, fetchInsights, fetchWindowReach, isMetaConfigured } from './_meta.js';
import {
  customerList, fetchCampaignDaily, fetchCustomer, fetchNetworkDaily, fetchSearchTermDaily,
  isGoogleConfigured,
} from './_google.js';

const DEFAULT_WINDOW_DAYS = 7;
const MAX_WINDOW_DAYS = 400;

interface PlatformReport {
  platform: string;
  ok: boolean;
  accounts?: number;
  fetched?: number;
  upserted?: number;
  redactedTerms?: number;
  throttled?: boolean;
  warnings?: string[];
  error?: string;
  code?: string;
}

/** Cửa sổ mặc định kết thúc ở HÔM QUA — ngày hôm nay chưa chốt ở cả hai nền tảng. */
function resolveWindow(url: URL, env: AdsEnv): { from: string; to: string } {
  const month = url.searchParams.get('month');
  if (month && isMonth(month)) return { from: `${month}-01`, to: monthEnd(month) };

  const explicitFrom = url.searchParams.get('from');
  const explicitTo = url.searchParams.get('to');
  const yesterday = shiftDays(isoDate(new Date()), -1);
  const to = explicitTo && /^\d{4}-\d{2}-\d{2}$/.test(explicitTo) ? explicitTo : yesterday;

  if (explicitFrom && /^\d{4}-\d{2}-\d{2}$/.test(explicitFrom)) return { from: explicitFrom, to };

  const requested = Number(url.searchParams.get('days'))
    || Number(env.ADS_SYNC_WINDOW_DAYS)
    || DEFAULT_WINDOW_DAYS;
  const days = Math.min(MAX_WINDOW_DAYS, Math.max(1, requested));
  return { from: shiftDays(to, -(days - 1)), to };
}

/** Cảnh báo cấu hình — không chặn, nhưng phải nổi lên ở response để không im lặng. */
function accountWarnings(label: string, currency: string | null, timezone: string | null): string[] {
  const out: string[] = [];
  if (currency && currency !== 'VND') {
    out.push(`${label}: currency=${currency} KHÔNG phải VND — QA gate 3 vỡ, số không được cộng vào báo cáo VND`);
  }
  if (timezone && timezone !== 'Asia/Ho_Chi_Minh') {
    out.push(`${label}: timezone=${timezone} lệch ICT — ngày của API không trùng ngày ICT (M5_1 §3c.3)`);
  }
  return out;
}

async function openRun(sql: Sql, platform: string, from: string, to: string): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    insert into ads_sync_run (platform, kind, window_from, window_to)
    values (${platform}, 'window', ${from}::date, ${to}::date) returning id`;
  return row.id;
}

async function closeRun(
  sql: Sql, id: string, ok: boolean,
  stats: { fetched?: number; upserted?: number; redacted?: number; error?: string },
): Promise<void> {
  await sql`update ads_sync_run set
      finished_at = now(), ok = ${ok},
      fetched = ${stats.fetched ?? 0}, upserted = ${stats.upserted ?? 0},
      redacted_terms = ${stats.redacted ?? 0},
      error_message = ${stats.error ?? null}
    where id = ${id}`;
}

/** Ghi một lô fact: dimension TRƯỚC (fact join vào nó), rồi fact. */
async function writeCampaignRows(sql: Sql, rows: CampaignDailyRow[]): Promise<number> {
  if (!rows.length) return 0;
  await upsertCampaignDim(sql, rows);
  return upsertCampaignDaily(sql, rows);
}

/**
 * Reach & tần suất theo cửa sổ (M5_1 §2h): mỗi tháng dương lịch chạm vào cửa sổ
 * sync, cộng cửa sổ 7 ngày gần nhất. Tháng đang chạy dừng ở hôm qua.
 * Mỗi cửa sổ hỏi hai cấp: tài khoản (một dòng) và chiến dịch (một dòng/chiến dịch).
 */
async function syncWindowReach(sql: Sql, accountId: string, from: string, to: string, env: AdsEnv): Promise<number> {
  const yesterday = shiftDays(isoDate(new Date()), -1);
  const cap = (d: string) => (d > yesterday ? yesterday : d);
  const windows: Array<{ kind: 'month' | 'last7d'; start: string; end: string }> = [];

  for (let m = from.slice(0, 7); m <= to.slice(0, 7); m = shiftDays(`${m}-01`, 32).slice(0, 7)) {
    const start = `${m}-01`;
    if (start > yesterday) break;
    windows.push({ kind: 'month', start, end: cap(monthEnd(m)) });
  }
  if (to >= shiftDays(yesterday, -6)) {
    windows.push({ kind: 'last7d', start: shiftDays(yesterday, -6), end: yesterday });
  }

  let written = 0;
  for (const w of windows) {
    for (const level of ['account', 'campaign'] as const) {
      const got = await fetchWindowReach(accountId, level, w.start, w.end, env);
      const rows: PeriodReachRow[] = got.map(g => ({
        level, entityId: g.entityId, periodKind: w.kind, periodStart: w.start, periodEnd: w.end,
        reach: g.reach, impressions: g.impressions, frequency: g.frequency, spend: g.spend,
      }));
      written += await upsertPeriodReach(sql, rows);
    }
  }
  return written;
}

async function syncMeta(sql: Sql, from: string, to: string, env: AdsEnv): Promise<PlatformReport> {
  if (!isMetaConfigured(env)) {
    return { platform: 'meta', ok: true, code: 'NOT_CONFIGURED', warnings: ['Thiếu META_ADS_SYSTEM_TOKEN / META_ADS_ACCOUNT_IDS'] };
  }
  const runId = await openRun(sql, 'meta', from, to);
  const warnings: string[] = [];
  let fetched = 0;
  let upserted = 0;
  let throttled = false;

  try {
    const accounts = accountList(env.META_ADS_ACCOUNT_IDS);
    for (const accountId of accounts) {
      const account = await fetchAccount(accountId, env);
      await upsertAccount(sql, { platform: 'meta', ...account });
      warnings.push(...accountWarnings(`meta:act_${accountId}`, account.currency, account.timezone));

      const result = await fetchInsights(accountId, from, to, env);
      fetched += result.rows.length;
      upserted += await writeCampaignRows(sql, result.rows);
      if (result.throttled) {
        throttled = true;
        warnings.push(`meta:act_${accountId}: dừng sớm vì quota ≥90% — cron sau sẽ kéo tiếp`);
        break;
      }

      // Reach & tần suất theo cửa sổ — lỗi ở đây KHÔNG làm hỏng số chi tiêu vừa ghi,
      // chỉ báo cảnh báo (reach là chỉ số phụ, chi tiêu là chỉ số chính).
      try {
        upserted += await syncWindowReach(sql, accountId, from, to, env);
      } catch (error) {
        warnings.push(`meta:act_${accountId}: không kéo được reach theo kỳ — ${error instanceof Error ? error.message.slice(0, 120) : 'UNKNOWN'}`);
      }
    }
    await closeRun(sql, runId, true, { fetched, upserted });
    return { platform: 'meta', ok: true, accounts: accounts.length, fetched, upserted, throttled, warnings };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'UNKNOWN';
    console.error('[ads-sync:meta]', error);
    await closeRun(sql, runId, false, { fetched, upserted, error: message });
    return { platform: 'meta', ok: false, fetched, upserted, error: message, warnings };
  }
}

async function syncGoogle(sql: Sql, from: string, to: string, env: AdsEnv): Promise<PlatformReport> {
  if (!isGoogleConfigured(env)) {
    return {
      platform: 'google', ok: true, code: 'NOT_CONFIGURED',
      warnings: ['Thiếu GADS_DEVELOPER_TOKEN / OAuth / GADS_CUSTOMER_IDS — xem M5_1 §8'],
    };
  }
  const runId = await openRun(sql, 'google', from, to);
  const warnings: string[] = [];
  let fetched = 0;
  let upserted = 0;
  let redacted = 0;

  try {
    const customers = customerList(env);
    for (const customerId of customers) {
      const customer = await fetchCustomer(customerId, env);
      await upsertAccount(sql, {
        platform: 'google', accountId: customerId,
        name: customer.name, currency: customer.currency, timezone: customer.timezone,
      });
      warnings.push(...accountWarnings(`google:${customerId}`, customer.currency, customer.timezone));

      const campaigns = await fetchCampaignDaily(customerId, from, to, env);
      fetched += campaigns.length;
      upserted += await writeCampaignRows(sql, campaigns);

      // Hai bảng dưới có GRAIN KHÁC — không bao giờ gộp vào ads_campaign_daily,
      // gộp là nhân đôi chi phí (bẫy M5 §6.3).
      upserted += await upsertNetworkDaily(sql, await fetchNetworkDaily(customerId, from, to, env));

      const terms = await fetchSearchTermDaily(customerId, from, to, env);
      redacted += terms.redacted;
      upserted += await upsertSearchTermDaily(sql, terms.rows);
    }
    await closeRun(sql, runId, true, { fetched, upserted, redacted });
    return { platform: 'google', ok: true, accounts: customers.length, fetched, upserted, redactedTerms: redacted, warnings };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'UNKNOWN';
    console.error('[ads-sync:google]', error);
    await closeRun(sql, runId, false, { fetched, upserted, redacted, error: message });
    return { platform: 'google', ok: false, fetched, upserted, error: message, warnings };
  }
}

export async function handleAdsSync(req: Request, env: AdsEnv = process.env): Promise<Response> {
  if (!requireCron(req, env)) return json(401, { ok: false, error: 'Thiếu CRON_SECRET' });

  let sql: Sql;
  try {
    sql = getSql(env);
  } catch {
    return json(503, { ok: false, code: 'NOT_CONFIGURED', error: 'Chưa có DATABASE_URL' });
  }

  const url = new URL(req.url);
  const { from, to } = resolveWindow(url, env);
  const only = url.searchParams.get('platform');

  const platforms: PlatformReport[] = [];
  if (only !== 'google') platforms.push(await syncMeta(sql, from, to, env));
  if (only !== 'meta') platforms.push(await syncGoogle(sql, from, to, env));

  // Mart dựng lại SAU khi fact đã ghi xong — dựng trước thì thiếu số.
  let martRows = 0;
  let martError: string | undefined;
  try {
    martRows = await refreshMart(sql, from, to);
  } catch (error) {
    martError = error instanceof Error ? error.message : 'UNKNOWN';
    console.error('[ads-sync:mart]', error);
  }

  const ok = platforms.every(p => p.ok) && !martError;
  return json(ok ? 200 : 500, {
    ok,
    window: { from, to },
    platforms,
    mart: { rows: martRows, ...(martError ? { error: martError } : {}) },
  });
}

export const GET = (req: Request) => handleAdsSync(req, process.env);
export const POST = (req: Request) => handleAdsSync(req, process.env);
