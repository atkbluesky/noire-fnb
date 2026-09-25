import {
  getSql, json, normalizeWebhook, verifyWebhookSignature, type ZaloEnv,
} from './_shared.js';

const MAX_BODY_BYTES = 256_000;

type RejectReason = 'INVALID_JSON' | 'INVALID_SIGNATURE' | 'OA_NOT_TRACKED' | 'ERROR';

/** Ghi request bị bỏ qua vào zalo_oa_webhook_reject (migration 003) — chỉ lý do, tên event,
 *  app_id có khớp không. Không lưu body/chữ ký/user id. Lỗi ghi nhật ký KHÔNG được làm hỏng
 *  phản hồi cho Zalo, nên nuốt lỗi (vd chưa chạy migration 003, chưa có DATABASE_URL). */
async function logReject(env: ZaloEnv, reason: RejectReason, payload: Record<string, unknown> | null, detail?: string) {
  try {
    if (!env.DATABASE_URL) return;
    const appId = payload ? String(payload.app_id ?? '') : '';
    const sql = getSql(env);
    await sql`insert into zalo_oa_webhook_reject (reason, event_name, app_id_match, detail)
      values (${reason}, ${payload ? String(payload.event_name ?? '').slice(0, 80) || null : null},
        ${payload ? (appId !== '' && appId === (env.ZALO_APP_ID ?? '').trim()) : null},
        ${detail ? detail.slice(0, 200) : null})`;
  } catch (error) {
    console.warn('[zalo-webhook] không ghi được nhật ký bỏ qua', error instanceof Error ? error.message : error);
  }
}

export async function handleZaloWebhook(req: Request, env: ZaloEnv = process.env): Promise<Response> {
  if (req.method !== 'POST') return json(405, { ok: false, error: 'Chỉ nhận POST' });
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) {
    return json(413, { ok: false, error: 'Payload quá lớn' });
  }
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return json(413, { ok: false, error: 'Payload quá lớn' });

  // Zalo chỉ nhận Webhook URL khi URL trả 200 cho request kiểm tra — request đó KHÔNG có chữ ký
  // hợp lệ (OA Secret Key chỉ hiện ra SAU khi URL được nhận). Vì vậy request lỗi / sai chữ ký
  // trả 200 nhưng bị BỎ QUA: không chạm database. An toàn nằm ở chỗ không lưu, không ở mã 401.
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    await logReject(env, 'INVALID_JSON', null, `bytes=${raw.length}`);
    return json(200, { ok: false, ignored: 'INVALID_JSON' });
  }
  const signature = req.headers.get('x-zevent-signature');
  if (!verifyWebhookSignature(raw, payload, signature, env)) {
    console.warn('[zalo-webhook] bỏ qua request sai chữ ký', String(payload.event_name ?? ''));
    await logReject(env, 'INVALID_SIGNATURE', payload, signature ? 'có header chữ ký' : 'thiếu header X-ZEvent-Signature');
    return json(200, { ok: false, ignored: 'INVALID_SIGNATURE' });
  }

  try {
    const event = normalizeWebhook(payload, env);
    const sql = getSql(env);
    const inserted = await sql.begin(async tx => {
      const rows = await tx`insert into zalo_oa_webhook_event (
          oa_id, event_key, event_name, event_time, event_date, direction,
          user_hash, message_id, message_type, payload
        ) values (
          ${event.oaId}, ${event.eventKey}, ${event.eventName}, ${event.eventTime}, ${event.eventDate},
          ${event.direction}, ${event.userHash}, ${event.messageId}, ${event.messageType}, ${tx.json(event.payload)}
        ) on conflict (oa_id, event_key) do nothing returning id`;
      if (rows.length) {
        await tx`select zalo_oa_refresh_daily_metric(${event.oaId}, ${event.eventDate}::date)`;
        // Event tới trễ có thể đổi điểm bắt đầu session của ngày kế tiếp.
        await tx`select zalo_oa_refresh_daily_metric(${event.oaId}, ${event.eventDate}::date + 1)`;
      }
      return rows.length === 1;
    });
    return json(200, { ok: true, inserted, duplicate: !inserted });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'UNKNOWN';
    // Một App liên kết nhiều OA (vd Dining + Bistro) thì webhook nhận event của mọi OA.
    // Event không thuộc ZALO_OA_ID: trả 200 để Zalo không gửi lại, không lưu gì.
    if (message === 'WEBHOOK_OA_ID_INVALID') {
      await logReject(env, 'OA_NOT_TRACKED', payload);
      return json(200, { ok: true, ignored: 'OA_NOT_TRACKED' });
    }
    console.error('[zalo-webhook]', error);
    await logReject(env, 'ERROR', payload, message);
    if (message === 'DATABASE_URL_NOT_CONFIGURED') return json(503, { ok: false, code: 'NOT_CONFIGURED' });
    return json(500, { ok: false, error: 'Không lưu được webhook' });
  }
}

export const POST = (req: Request) => handleZaloWebhook(req, process.env);
export const GET = () => json(405, { ok: false, error: 'Chỉ nhận POST' });
