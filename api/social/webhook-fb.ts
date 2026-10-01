/**
 * M6.2 · Nhận bài mới từ Facebook Page webhook (field `feed`).
 *
 * Trách nhiệm DUY NHẤT (M8_2 §1d): verify chữ ký · dedupe · ghi hàng đợi.
 * CẤM gọi Graph API, CẤM tải media, CẤM gọi AI/Zalo ở đây.
 * Facebook coi webhook là hỏng nếu không nhận 200 trong ~5s và sẽ gỡ subscription —
 * nên handler này chỉ được làm đúng một việc: đẩy `fb_post_id` vào `social_post`
 * rồi trả 200. Mọi việc nặng để tick làm.
 */
import { getSql, json, verifyFbSignature, type SocialEnv } from './_shared.js';

const MAX_BODY_BYTES = 256_000;

/** item của FB feed → `fb_kind` trong social_post. */
const KIND: Record<string, string> = {
  status: 'text',
  photo: 'photo',
  video: 'video',
  reel: 'reel',
  share: 'link',
  album: 'album',
};

interface FeedChange {
  item?: string;
  verb?: string;
  post_id?: string;
  video_id?: string;
  created_time?: number;
  message?: string;
  published?: number;
  permalink_url?: string;
}

/** FB gọi GET một lần lúc đăng ký webhook để đối chiếu verify token. */
function handleVerify(req: Request, env: SocialEnv): Response {
  const url = new URL(req.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge') ?? '';
  const expected = env.FB_WEBHOOK_VERIFY_TOKEN?.trim();
  if (mode === 'subscribe' && expected && token === expected) {
    // FB đòi trả về NGUYÊN chuỗi challenge, không bọc JSON.
    return new Response(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } });
  }
  return json(403, { ok: false, error: 'verify_token không khớp' });
}

export async function handleSocialWebhookFb(req: Request, env: SocialEnv = process.env): Promise<Response> {
  if (req.method === 'GET') return handleVerify(req, env);
  if (req.method !== 'POST') return json(405, { ok: false, error: 'Chỉ nhận GET/POST' });
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) {
    return json(413, { ok: false, error: 'Payload quá lớn' });
  }

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return json(413, { ok: false, error: 'Payload quá lớn' });

  // Cùng luật với api/zalo/webhook.ts: request sai chữ ký trả 200 nhưng BỊ BỎ QUA,
  // không chạm database. An toàn nằm ở chỗ không lưu, không ở mã lỗi.
  if (!verifyFbSignature(raw, req.headers.get('x-hub-signature-256'), env)) {
    console.warn('[social-webhook-fb] bỏ qua request sai chữ ký');
    return json(200, { ok: false, ignored: 'INVALID_SIGNATURE' });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return json(200, { ok: false, ignored: 'INVALID_JSON' });
  }
  if (payload.object !== 'page') return json(200, { ok: true, ignored: 'NOT_PAGE_OBJECT' });

  const trackedPage = env.FB_PAGE_ID?.trim();
  const entries = Array.isArray(payload.entry) ? payload.entry as Record<string, unknown>[] : [];

  let inserted = 0;
  let requeued = 0;
  let skipped = 0;

  try {
    const sql = getSql(env);
    for (const entry of entries) {
      const pageId = String(entry.id ?? '');
      // Một App có thể nhận webhook của nhiều Page. Chỉ nhận Page đang theo dõi.
      if (!pageId || (trackedPage && pageId !== trackedPage)) { skipped += 1; continue; }

      const changes = Array.isArray(entry.changes) ? entry.changes as Record<string, unknown>[] : [];
      for (const change of changes) {
        if (change.field !== 'feed') { skipped += 1; continue; }
        const v = (change.value ?? {}) as FeedChange;
        const postId = String(v.post_id ?? '').trim();
        if (!postId) { skipped += 1; continue; }

        const verb = String(v.verb ?? '');
        const kind = KIND[String(v.item ?? '')] ?? 'text';
        const createdAt = Number(v.created_time) ? new Date(Number(v.created_time) * 1000).toISOString() : null;

        if (verb === 'remove' || verb === 'hide') {
          // Bài bị gỡ bên FB: dừng pipeline nếu CHƯA đăng. Đã đăng rồi thì để nguyên —
          // gỡ bài trên Zalo là quyết định của người, không tự động.
          const rows = await sql`update social_post set
              state = 'SKIPPED', reject_reason = 'FB_POST_REMOVED', updated_at = now()
            where fb_post_id = ${postId}
              and state not in ('PUBLISHED', 'BROADCAST_QUEUED', 'BROADCAST_SENT')
            returning fb_post_id`;
          skipped += rows.length ? 0 : 1;
          continue;
        }

        if (verb === 'edited') {
          // Sửa caption bên FB trước khi đăng Zalo ⇒ dựng lại từ đầu để AI viết lại.
          // Đã có zalo_article_id thì KHÔNG đụng (Luật §0.8) — cập nhật bài đã đăng
          // là việc của review.ts, không phải của webhook.
          const rows = await sql`update social_post set
              state = 'INGESTED', attempt = 0, next_run_at = now(), last_error = null, updated_at = now()
            where fb_post_id = ${postId}
              and zalo_article_id is null
              and state not in ('PUBLISHED', 'BROADCAST_QUEUED', 'BROADCAST_SENT', 'REJECTED')
            returning fb_post_id`;
          requeued += rows.length;
          continue;
        }

        if (verb !== 'add') { skipped += 1; continue; }
        if (v.published === 0) { skipped += 1; continue; }   // bài nháp/lên lịch, chưa public

        const rows = await sql`insert into social_post (
            fb_post_id, fb_page_id, fb_kind, fb_permalink, fb_message, fb_video_id, fb_created_at
          ) values (
            ${postId}, ${pageId}, ${kind}, ${v.permalink_url ?? null},
            ${v.message ?? null}, ${v.video_id ?? null}, ${createdAt}
          ) on conflict (fb_post_id) do nothing returning fb_post_id`;
        inserted += rows.length;
      }
    }
    return json(200, { ok: true, inserted, requeued, skipped });
  } catch (error) {
    console.error('[social-webhook-fb]', error);
    const message = error instanceof Error ? error.message : 'UNKNOWN';
    if (message === 'DATABASE_URL_NOT_CONFIGURED') return json(503, { ok: false, code: 'NOT_CONFIGURED' });
    // Trả 500 để Facebook gửi lại — mất bài còn tệ hơn nhận trùng (insert đã idempotent).
    return json(500, { ok: false, error: 'Không ghi được hàng đợi' });
  }
}

export const GET = (req: Request) => handleSocialWebhookFb(req, process.env);
export const POST = (req: Request) => handleSocialWebhookFb(req, process.env);
