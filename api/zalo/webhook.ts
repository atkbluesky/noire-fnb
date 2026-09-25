import {
  getSql, json, normalizeWebhook, verifyWebhookSignature, type ZaloEnv,
} from './_shared.js';

const MAX_BODY_BYTES = 256_000;

export async function handleZaloWebhook(req: Request, env: ZaloEnv = process.env): Promise<Response> {
  if (req.method !== 'POST') return json(405, { ok: false, error: 'Chỉ nhận POST' });
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) {
    return json(413, { ok: false, error: 'Payload quá lớn' });
  }
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return json(413, { ok: false, error: 'Payload quá lớn' });

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return json(400, { ok: false, error: 'JSON không hợp lệ' });
  }
  const signature = req.headers.get('x-zevent-signature');
  if (!verifyWebhookSignature(raw, payload, signature, env)) {
    return json(401, { ok: false, error: 'Chữ ký Zalo không hợp lệ' });
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
    if (message === 'WEBHOOK_OA_ID_INVALID') return json(200, { ok: true, ignored: 'OA_NOT_TRACKED' });
    console.error('[zalo-webhook]', error);
    if (message === 'DATABASE_URL_NOT_CONFIGURED') return json(503, { ok: false, code: 'NOT_CONFIGURED' });
    return json(500, { ok: false, error: 'Không lưu được webhook' });
  }
}

export const POST = (req: Request) => handleZaloWebhook(req, process.env);
export const GET = () => json(405, { ok: false, error: 'Chỉ nhận POST' });
