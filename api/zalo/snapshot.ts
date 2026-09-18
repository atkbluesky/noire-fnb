import { getSql, ictDate, json, requireCron, validAccessToken, type ZaloEnv } from './_shared';

export async function handleZaloSnapshot(req: Request, env: ZaloEnv = process.env): Promise<Response> {
  if (!['GET', 'POST'].includes(req.method)) return json(405, { ok: false, error: 'Chỉ nhận GET/POST' });
  if (!requireCron(req, env)) return json(401, { ok: false, error: 'Không có quyền chạy job' });
  const oaId = env.ZALO_OA_ID?.trim();
  if (!oaId) return json(503, { ok: false, code: 'NOT_CONFIGURED', missing: ['ZALO_OA_ID'] });

  let runId: number | null = null;
  try {
    const sql = getSql(env);
    const [run] = await sql<{ id: number }[]>`insert into zalo_oa_sync_run (oa_id, job_type, status)
      values (${oaId}, 'daily_snapshot', 'running') returning id`;
    runId = run.id;
    const accessToken = await validAccessToken(sql, oaId, env);
    const response = await fetch('https://openapi.zalo.me/v2.0/oa/getoa', {
      headers: { access_token: accessToken },
      signal: AbortSignal.timeout(12_000),
    });
    const body = await response.json() as Record<string, unknown>;
    const data = (body.data && typeof body.data === 'object' ? body.data : {}) as Record<string, unknown>;
    const followers = Number(data.num_follower);
    const returnedOaId = String(data.oaid ?? data.oa_id ?? '');
    if (!response.ok || Number(body.error) !== 0 || !Number.isFinite(followers)) {
      throw new Error(`ZALO_GETOA_FAILED:${String(body.message ?? response.status)}`);
    }
    if (returnedOaId && returnedOaId !== oaId) throw new Error('ZALO_GETOA_OA_ID_MISMATCH');
    const date = ictDate();
    const safePayload = {
      oaid: returnedOaId || oaId,
      name: String(data.name ?? ''),
      is_verified: Boolean(data.is_verified),
      oa_type: Number(data.oa_type) || null,
      package_name: String(data.package_name ?? ''),
    };
    await sql.begin(async tx => {
      await tx`insert into zalo_oa_daily_snapshot (
          oa_id, snapshot_date, follower_total, oa_name, fetched_at, source_payload
        ) values (${oaId}, ${date}, ${Math.trunc(followers)}, ${safePayload.name}, now(), ${tx.json(safePayload)})
        on conflict (oa_id, snapshot_date) do update set
          follower_total = excluded.follower_total, oa_name = excluded.oa_name,
          fetched_at = now(), source_payload = excluded.source_payload`;
      await tx`insert into zalo_oa_daily_metric (oa_id, metric_date, follower_total, follower_net, updated_at)
        select ${oaId}, ${date}::date, ${Math.trunc(followers)},
          ${Math.trunc(followers)} - coalesce((
            select follower_total from zalo_oa_daily_snapshot
            where oa_id = ${oaId} and snapshot_date < ${date}::date
            order by snapshot_date desc limit 1
          ), ${Math.trunc(followers)}), now()
        on conflict (oa_id, metric_date) do update set
          follower_total = excluded.follower_total, follower_net = excluded.follower_net, updated_at = now()`;
      await tx`update zalo_oa_sync_run set status = 'success', finished_at = now(), rows_written = 1
        where id = ${runId}`;
    });
    return json(200, { ok: true, date, followerTotal: Math.trunc(followers), oaName: safePayload.name });
  } catch (error) {
    console.error('[zalo-snapshot]', error);
    if (runId != null) {
      try {
        const sql = getSql(env);
        const detail = error instanceof Error ? error.message.slice(0, 500) : 'UNKNOWN';
        await sql`update zalo_oa_sync_run set status = 'failed', finished_at = now(), error_message = ${detail}
          where id = ${runId}`;
      } catch {}
    }
    const message = error instanceof Error ? error.message : 'UNKNOWN';
    if (message.includes('NOT_CONFIGURED')) return json(503, { ok: false, code: 'NOT_CONFIGURED', detail: message });
    return json(502, { ok: false, error: 'Không đồng bộ được snapshot Zalo OA' });
  }
}

export const GET = (req: Request) => handleZaloSnapshot(req, process.env);
export const POST = (req: Request) => handleZaloSnapshot(req, process.env);
