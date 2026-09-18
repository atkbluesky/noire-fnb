import { getSql, ictDate, json, type ZaloEnv } from './_shared';

type Period = 'today' | '7d' | 'mtd' | 'month';

const iso = (date: Date) => date.toISOString().slice(0, 10);
const fromIso = (value: string) => new Date(`${value}T00:00:00Z`);
const shift = (value: string, days: number) => {
  const date = fromIso(value);
  date.setUTCDate(date.getUTCDate() + days);
  return iso(date);
};

function periodWindow(period: Period, month: string | null) {
  const today = ictDate();
  if (period === 'today') return { start: today, end: today };
  if (period === '7d') return { start: shift(today, -6), end: today };
  if (period === 'mtd') return { start: `${today.slice(0, 7)}-01`, end: today };
  const selected = /^\d{4}-(0[1-9]|1[0-2])$/.test(month ?? '') ? month! : today.slice(0, 7);
  const start = `${selected}-01`;
  const next = fromIso(start);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const monthEnd = shift(iso(next), -1);
  return { start, end: selected === today.slice(0, 7) ? today : monthEnd };
}

const num = (value: unknown) => Number(value) || 0;

export async function handleZaloPerformance(req: Request, env: ZaloEnv = process.env): Promise<Response> {
  if (req.method !== 'GET') return json(405, { ok: false, error: 'Chỉ nhận GET' });
  const url = new URL(req.url);
  const rawPeriod = url.searchParams.get('period') ?? '7d';
  const period: Period = ['today', '7d', 'mtd', 'month'].includes(rawPeriod) ? rawPeriod as Period : '7d';
  const window = periodWindow(period, url.searchParams.get('month'));
  const oaId = env.ZALO_OA_ID?.trim();
  if (!oaId || !env.DATABASE_URL) {
    return json(503, {
      ok: false,
      code: 'NOT_CONFIGURED',
      message: 'M8.1 đã sẵn sàng nhưng chưa có DATABASE_URL/ZALO_OA_ID.',
    });
  }

  try {
    const sql = getSql(env);
    const rows = await sql<{
      metric_date: string;
      follower_total: number | null;
      follower_net: number | null;
      incoming_messages: number;
      outgoing_messages: number;
      unique_chat_users: number;
      conversations: number;
      message_types: Record<string, number>;
    }[]>`select metric_date::text, follower_total, follower_net, incoming_messages,
        outgoing_messages, unique_chat_users, conversations, message_types
      from zalo_oa_daily_metric
      where oa_id = ${oaId} and metric_date between ${window.start}::date and ${window.end}::date
      order by metric_date`;

    const [rangeUnique] = await sql<{ n: number }[]>`select count(distinct user_hash)::integer as n
      from zalo_oa_webhook_event
      where oa_id = ${oaId} and user_hash is not null
        and direction in ('incoming', 'outgoing')
        and event_date between ${window.start}::date and ${window.end}::date
        and event_time >= (${window.start}::date::timestamp at time zone 'Asia/Bangkok')
        and event_time < ((${window.end}::date + 1)::timestamp at time zone 'Asia/Bangkok')`;
    const [followers] = await sql<{ current: number | null; before: number | null }[]>`select
      (select follower_total from zalo_oa_daily_snapshot where oa_id = ${oaId}
        and snapshot_date <= ${window.end}::date order by snapshot_date desc limit 1) as current,
      (select follower_total from zalo_oa_daily_snapshot where oa_id = ${oaId}
        and snapshot_date < ${window.start}::date order by snapshot_date desc limit 1) as before`;
    const [freshness] = await sql<{ last_webhook: string | null; last_snapshot: string | null; last_success: string | null }[]>`select
      (select max(received_at)::text from zalo_oa_webhook_event where oa_id = ${oaId}) as last_webhook,
      (select max(fetched_at)::text from zalo_oa_daily_snapshot where oa_id = ${oaId}) as last_snapshot,
      (select max(finished_at)::text from zalo_oa_sync_run where oa_id = ${oaId} and status = 'success') as last_success`;

    const messageTypes: Record<string, number> = {};
    for (const row of rows) {
      for (const [key, value] of Object.entries(row.message_types ?? {})) {
        messageTypes[key] = (messageTypes[key] ?? 0) + num(value);
      }
    }
    const followerTotal = followers?.current == null ? null : num(followers.current);
    const followerBefore = followers?.before == null ? null : num(followers.before);
    return json(200, {
      ok: true,
      source: 'Zalo OA OpenAPI + Webhook',
      period,
      window,
      metrics: {
        followerTotal,
        followerNet: followerTotal != null && followerBefore != null ? followerTotal - followerBefore : null,
        incomingMessages: rows.reduce((sum, row) => sum + num(row.incoming_messages), 0),
        outgoingMessages: rows.reduce((sum, row) => sum + num(row.outgoing_messages), 0),
        uniqueChatUsers: num(rangeUnique?.n),
        conversations: rows.reduce((sum, row) => sum + num(row.conversations), 0),
      },
      messageTypes,
      daily: rows.map(row => ({
        date: row.metric_date,
        followerTotal: row.follower_total == null ? null : num(row.follower_total),
        followerNet: row.follower_net == null ? null : num(row.follower_net),
        incomingMessages: num(row.incoming_messages),
        outgoingMessages: num(row.outgoing_messages),
        uniqueChatUsers: num(row.unique_chat_users),
        conversations: num(row.conversations),
      })),
      freshness,
      definitions: {
        conversation: 'Phiên bắt đầu bằng incoming message sau ít nhất 24 giờ không có tương tác với user đó.',
        uniqueChatUsers: 'Số user hash duy nhất có event trong toàn kỳ; không cộng unique theo ngày.',
        followerNet: 'Snapshot cuối kỳ trừ snapshot gần nhất trước đầu kỳ.',
      },
    });
  } catch (error) {
    console.error('[zalo-performance]', error);
    return json(500, { ok: false, error: 'Không đọc được dữ liệu M8.1' });
  }
}

export const GET = (req: Request) => handleZaloPerformance(req, process.env);
export const POST = () => json(405, { ok: false, error: 'Chỉ nhận GET' });
