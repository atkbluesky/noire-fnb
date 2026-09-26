import {
  connectedBrands, fetchReservations, getSql, iposCall, json, localDayStart,
  mapReservation, requireCron, upsertReservations, type IposEnv, type Sql,
} from './_shared.js';

const CHUNK = 200;
const chunk = <T>(items: T[], size = CHUNK): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

/** Danh mục nguồn + nhà hàng: rẻ, chạy mỗi lần sync để tên không bị lệch. */
async function refreshDimensions(sql: Sql, posParent: string, env: IposEnv): Promise<void> {
  const sources = await iposCall<Array<{ code?: string; name?: string }>>(
    `/v1/partner/reservations/sources?pos_parent=${encodeURIComponent(posParent)}`, { env },
  ).catch(() => []);
  for (const s of sources ?? []) {
    if (!s.code) continue;
    await sql`insert into dim_ipos_source (code, name_ipos)
      values (${s.code}, ${s.name ?? null})
      on conflict (code) do update set name_ipos = excluded.name_ipos, updated_at = now()`;
  }

  const outlets = await iposCall<Array<{ _id?: string; name?: string; reference_pos?: string; booking_activated?: boolean }>>(
    `/v1/partner/brands/${encodeURIComponent(posParent)}/restaurants`, { env },
  ).catch(() => []);
  for (const o of outlets ?? []) {
    if (!o.reference_pos) continue;
    await sql`insert into dim_ipos_restaurant (pos_parent, pos_id, restaurant_id, name, booking_active)
      values (${posParent}, ${String(o.reference_pos)}, ${o._id ?? null}, ${o.name ?? null}, ${o.booking_activated ?? null})
      on conflict (pos_parent, pos_id) do update set
        restaurant_id = excluded.restaurant_id, name = excluded.name,
        booking_active = excluded.booking_active, updated_at = now()`;
  }
}

async function syncCodes(sql: Sql, posParent: string, codes: string[], env: IposEnv): Promise<number> {
  let upserted = 0;
  for (const part of chunk(codes)) {
    const fetched = await fetchReservations(posParent, { codes: part }, env);
    const rows = fetched
      .map(item => mapReservation(item, posParent, env))
      .filter((row): row is NonNullable<typeof row> => row !== null);
    upserted += await upsertReservations(sql, rows, 'sync');
  }
  return upserted;
}

/**
 * Cron ngày. Ba việc, theo thứ tự:
 *   ① cửa sổ `created_at` [T-days, now] — đơn mới và đơn vừa sửa
 *   ② re-sync đơn ĐANG MỞ có meal_day ≥ hôm qua — vì `filters` KHÔNG lọc theo
 *      meal_day, đơn tạo tháng trước đổi trạng thái hôm nay sẽ lọt khỏi ①
 *   ③ dọn hàng đợi webhook chưa resolve
 */
export async function handleIposSync(req: Request, env: IposEnv = process.env): Promise<Response> {
  if (!requireCron(req, env)) return json(401, { ok: false, error: 'Thiếu CRON_SECRET' });

  const url = new URL(req.url);
  const days = Math.min(400, Math.max(1, Number(url.searchParams.get('days') ?? 7) || 7));
  const to = Math.floor(Date.now() / 1000);
  const from = Number(url.searchParams.get('from')) || to - days * 86400;
  const until = Number(url.searchParams.get('to')) || to;

  let sql: Sql;
  try {
    sql = getSql(env);
  } catch {
    return json(503, { ok: false, code: 'NOT_CONFIGURED' });
  }

  let brands: string[];
  try {
    brands = await connectedBrands(env);
  } catch (error) {
    return json(503, { ok: false, code: 'IPOS_UNREACHABLE', error: error instanceof Error ? error.message : 'UNKNOWN' });
  }
  if (!brands.length) {
    // Trạng thái hiện tại 26/09/2026: app chưa được brand nào duyệt kết nối.
    return json(503, { ok: false, code: 'NOT_CONNECTED', error: 'Chưa brand nào kết nối với app iPOS' });
  }

  const report: Array<Record<string, unknown>> = [];
  for (const posParent of brands) {
    const [run] = await sql<{ id: string }[]>`
      insert into ipos_sync_run (kind, pos_parent) values ('window', ${posParent}) returning id`;
    try {
      await refreshDimensions(sql, posParent, env);

      // ① cửa sổ created_at
      const windowed = await fetchReservations(posParent, { createdAt: [from, until] }, env);
      const rows = windowed
        .map(item => mapReservation(item, posParent, env))
        .filter((row): row is NonNullable<typeof row> => row !== null);
      const fromWindow = await upsertReservations(sql, rows, 'sync');

      // ② đơn đang mở, có thể đã đổi trạng thái ngoài cửa sổ trên
      const yesterday = new Date((localDayStart() - 86400) * 1000).toISOString().slice(0, 10);
      const open = await sql<{ booking_code: string }[]>`
        select booking_code from ipos_reservation
        where pos_parent = ${posParent}
          and status in ('WAITING_CONFIRM', 'CONFIRMED')
          and meal_day >= ${yesterday}::date`;
      const fromOpen = await syncCodes(sql, posParent, open.map(r => r.booking_code), env);

      // ③ hàng đợi webhook chưa resolve
      const pending = await sql<{ booking_code: string }[]>`
        select distinct booking_code from ipos_webhook_event
        where resolved_at is null and (pos_parent = ${posParent} or pos_parent is null)`;
      const codes = pending.map(r => r.booking_code);
      const fromWebhook = await syncCodes(sql, posParent, codes, env);
      if (codes.length) {
        await sql`update ipos_webhook_event set resolved_at = now()
          where resolved_at is null and booking_code = any(${codes})`;
      }

      const upserted = fromWindow + fromOpen + fromWebhook;
      await sql`update ipos_sync_run set finished_at = now(), ok = true,
        fetched = ${windowed.length}, upserted = ${upserted} where id = ${run.id}`;
      report.push({
        pos_parent: posParent, fetched: windowed.length,
        upserted, from_window: fromWindow, from_open: fromOpen, from_webhook: fromWebhook,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'UNKNOWN';
      console.error('[ipos-sync]', posParent, error);
      await sql`update ipos_sync_run set finished_at = now(), ok = false, error_message = ${message}
        where id = ${run.id}`;
      report.push({ pos_parent: posParent, ok: false, error: message });
    }
  }

  const ok = report.every(r => r.ok !== false);
  return json(ok ? 200 : 500, {
    ok,
    window: { from: new Date(from * 1000).toISOString(), to: new Date(until * 1000).toISOString() },
    brands: report,
  });
}

export const GET = (req: Request) => handleIposSync(req, process.env);
export const POST = (req: Request) => handleIposSync(req, process.env);
