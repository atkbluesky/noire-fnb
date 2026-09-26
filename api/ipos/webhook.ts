import {
  fetchReservations, getSql, json, mapReservation, upsertReservations,
  verifyWebhookSecret, type IposEnv,
} from './_shared.js';

const MAX_BODY_BYTES = 256_000;

interface WebhookPayload {
  event?: string;
  reservation?: {
    _id?: string;
    code?: string;
    brand_code?: string;
    restaurant_code?: string;
    status?: string;
    booking_note?: string;
  };
}

/**
 * Webhook iPOS. Hai luật nền:
 *
 * ① iPOS chỉ nhận Webhook URL khi URL trả 200 cho request kiểm tra, nên mọi
 *    request sai vẫn trả 200 nhưng BỊ BỎ QUA — an toàn nằm ở chỗ không ghi gì,
 *    không nằm ở mã lỗi. Cùng luật với M8.1 §6.
 *
 * ② Payload webhook KHÔNG có chữ ký và rất mỏng (không có meal_day, source, seats).
 *    Vì vậy KHÔNG BAO GIỜ tin body: chỉ lấy mã đơn, rồi gọi lại
 *    filters{codes:[mã]} để lấy dữ liệu thật. Body chỉ là tiếng gõ cửa.
 */
export async function handleIposWebhook(req: Request, env: IposEnv = process.env): Promise<Response> {
  if (req.method !== 'POST') return json(405, { ok: false, error: 'Chỉ nhận POST' });
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) {
    return json(413, { ok: false, error: 'Payload quá lớn' });
  }
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return json(413, { ok: false, error: 'Payload quá lớn' });

  if (!verifyWebhookSecret(req.url, env)) {
    console.warn('[ipos-webhook] bỏ qua request thiếu/sai secret ?k=');
    return json(200, { ok: false, ignored: 'INVALID_SECRET' });
  }

  let payload: WebhookPayload;
  try {
    payload = JSON.parse(raw) as WebhookPayload;
  } catch {
    return json(200, { ok: false, ignored: 'INVALID_JSON' });
  }

  const reservation = payload.reservation ?? {};
  const bookingCode = String(reservation.code ?? '').trim();
  const posParent = String(reservation.brand_code ?? '').trim();
  if (!bookingCode) return json(200, { ok: false, ignored: 'NO_BOOKING_CODE' });

  try {
    const sql = getSql(env);
    // Ghi tiếng gõ cửa TRƯỚC. Nếu refetch hỏng, /api/ipos/sync sẽ dọn dòng chưa resolve.
    const [queued] = await sql<{ id: string }[]>`
      insert into ipos_webhook_event (booking_code, pos_parent, event, status_hint)
      values (${bookingCode}, ${posParent || null}, ${payload.event ?? null}, ${reservation.status ?? null})
      returning id`;

    if (!posParent) return json(200, { ok: true, queued: true, pending: 'NO_BRAND_CODE' });

    let upserted = 0;
    try {
      const fetched = await fetchReservations(posParent, { codes: [bookingCode] }, env);
      const rows = fetched
        .map(item => mapReservation(item, posParent, env))
        .filter((row): row is NonNullable<typeof row> => row !== null);
      upserted = await upsertReservations(sql, rows, 'webhook');
      if (upserted) await sql`update ipos_webhook_event set resolved_at = now() where id = ${queued.id}`;
    } catch (error) {
      // Brand chưa kết nối / iPOS lỗi tạm: giữ dòng chưa resolve, cron dọn sau.
      console.warn('[ipos-webhook] chưa refetch được', bookingCode, error instanceof Error ? error.message : error);
      return json(200, { ok: true, queued: true, pending: 'REFETCH_FAILED' });
    }
    return json(200, { ok: true, booking_code: bookingCode, upserted });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'UNKNOWN';
    console.error('[ipos-webhook]', error);
    if (message === 'DATABASE_URL_NOT_CONFIGURED') return json(503, { ok: false, code: 'NOT_CONFIGURED' });
    return json(500, { ok: false, error: 'Không lưu được webhook' });
  }
}

export const POST = (req: Request) => handleIposWebhook(req, process.env);
export const GET = () => json(405, { ok: false, error: 'Chỉ nhận POST' });
