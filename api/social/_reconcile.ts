/**
 * M8.2 · Quét bài sót + làm tươi số tương tác Facebook.
 *
 * Trách nhiệm DUY NHẤT (M8_2 §1d): đẩy bài thiếu vào `INGESTED`. **CẤM đăng.**
 *
 * Webhook là đường chính, cái này là lưới an toàn: webhook có thể rớt khi Vercel
 * lỗi, khi FB gỡ subscription, hoặc khi deploy đúng lúc bài lên. Chạy 1 lần/ngày
 * bằng Vercel Cron — đúng trần "tối thiểu 1 lần/ngày" của gói Hobby.
 *
 * Việc thứ hai của nó quan trọng không kém: refresh `fb_reactions/comments/shares`.
 * Bài mới đăng 2 phút thì engagement bằng 0; điểm broadcast tính trên số đó là vô
 * nghĩa. Sau một ngày mới có số thật để xếp hạng (M8_2 §8).
 */
import { fbGraph, getSql, json, requireCron, requireFb, type SocialEnv } from './_shared.js';

const WINDOW_DAYS = 7;
const PAGE_SIZE = 50;

const KIND_FROM_ATTACHMENT: Record<string, string> = {
  photo: 'photo', album: 'album', video_inline: 'video', video_autoplay: 'video',
  share: 'link', status: 'text', profile_media: 'photo',
};

export async function handleSocialReconcile(req: Request, env: SocialEnv = process.env): Promise<Response> {
  if (!['GET', 'POST'].includes(req.method)) return json(405, { ok: false, error: 'Chỉ nhận GET/POST' });
  if (!requireCron(req, env)) return json(401, { ok: false, error: 'Không có quyền chạy job' });

  let runId: number | null = null;
  try {
    const { pageId } = requireFb(env);
    const sql = getSql(env);
    const [run] = await sql<[{ id: number }]>`
      insert into social_run (job_type, status) values ('reconcile', 'running') returning id`;
    runId = run.id;

    const since = Math.floor((Date.now() - WINDOW_DAYS * 86_400_000) / 1000);
    const res = await fbGraph<Record<string, any>>(`${pageId}/published_posts`, {
      since,
      limit: PAGE_SIZE,
      fields: 'id,created_time,message,permalink_url,shares,'
        + 'attachments{type,media_type,target},'
        + 'reactions.summary(true).limit(0),comments.summary(true).limit(0)',
    }, env, 30_000);

    const posts: any[] = res.data ?? [];
    let inserted = 0;
    let refreshed = 0;

    for (const p of posts) {
      const fbPostId = String(p.id ?? '');
      if (!fbPostId) continue;
      const attachment = p.attachments?.data?.[0] ?? {};
      const kind = KIND_FROM_ATTACHMENT[String(attachment.type ?? '')] ?? 'text';
      const reactions = Number(p.reactions?.summary?.total_count ?? 0);
      const comments = Number(p.comments?.summary?.total_count ?? 0);
      const shares = Number(p.shares?.count ?? 0);
      const createdAt = p.created_time ? new Date(p.created_time).toISOString() : null;

      const rows = await sql`insert into social_post (
          fb_post_id, fb_page_id, fb_kind, fb_permalink, fb_message, fb_created_at,
          fb_reactions, fb_comments, fb_shares, fb_stats_at
        ) values (
          ${fbPostId}, ${pageId}, ${kind}, ${p.permalink_url ?? null}, ${p.message ?? null}, ${createdAt},
          ${reactions}, ${comments}, ${shares}, now()
        ) on conflict (fb_post_id) do nothing returning fb_post_id`;

      if (rows.length) { inserted += 1; continue; }

      // Đã có: chỉ làm tươi số tương tác. KHÔNG đụng state — bài có thể đang
      // ở giữa pipeline, đổi state từ đây là giẫm chân tick (Luật §0.8).
      await sql`update social_post set
          fb_reactions = ${reactions}, fb_comments = ${comments}, fb_shares = ${shares},
          fb_stats_at = now(), updated_at = now()
        where fb_post_id = ${fbPostId}`;
      refreshed += 1;
    }

    await sql`update social_run set status = 'success', finished_at = now(),
        picked = ${posts.length}, advanced = ${inserted} where id = ${runId}`;
    return json(200, { ok: true, scanned: posts.length, inserted, refreshed, windowDays: WINDOW_DAYS });
  } catch (error) {
    console.error('[social-reconcile]', error);
    const message = error instanceof Error ? error.message : 'UNKNOWN';
    if (runId != null) {
      try {
        await getSql(env)`update social_run set status = 'failed', finished_at = now(),
          error_message = ${message.slice(0, 500)} where id = ${runId}`;
      } catch { /* DB hỏng thì thôi */ }
    }
    if (message.includes('NOT_CONFIGURED')) return json(503, { ok: false, code: 'NOT_CONFIGURED', detail: message });
    return json(502, { ok: false, error: 'Không quét được bài sót' });
  }
}

export const GET = (req: Request) => handleSocialReconcile(req, process.env);
export const POST = (req: Request) => handleSocialReconcile(req, process.env);
