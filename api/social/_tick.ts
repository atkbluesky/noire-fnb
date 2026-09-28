/**
 * M8.2 · Nhịp đập của máy trạng thái.
 *
 * Trách nhiệm DUY NHẤT (M8_2 §1d): nhặt job · gọi ĐÚNG MỘT handler · ghi kết quả ·
 * audit vào `social_run`. **Không có logic nghiệp vụ ở file này** — mọi bước nằm
 * trong `_steps.ts`. Nó là bộ điều phối, chỉ biết hàng đợi / attempt / backoff.
 *
 * Gọi bởi cron-job.org mỗi 3 phút:
 *   GET /api/social/tick   Authorization: Bearer <CRON_SECRET>
 *
 * ── Vì sao "lease" chứ không giữ transaction ───────────────────────────────
 * Một bước có thể mất 60–200s (tải video, ffmpeg, Claude). Giữ transaction
 * Postgres mở suốt chừng đó là chặn connection pool của Neon (max 1 ở
 * `api/zalo/_shared.ts`). Nên: nhặt job bằng `for update skip locked` rồi ĐẨY
 * NGAY `next_run_at` lên 5 phút (lease), đóng transaction, xử lý bên ngoài.
 * Tick khác chạy chồng cũng không nhặt trúng bài đang làm. Nếu tick này chết
 * giữa chừng, 5 phút sau bài tự quay lại hàng đợi.
 */
import {
  MAX_ATTEMPT, backoffMinutes, getSql, json, requireCron, validAccessToken,
  type SocialEnv, type SocialPostRow,
} from './_shared.js';
import { ACTIVE_STATES, advance } from './_steps.js';

const BATCH = 3;                 // tối đa 3 bài mỗi tick (M8_2 §1)
const TIME_BUDGET_MS = 240_000;  // chừa 60s dưới trần 300s của Vercel
const LEASE_MINUTES = 5;

/** Lỗi cấu hình: KHÔNG đốt attempt của bài, và dừng cả tick. */
const FATAL_CONFIG = /_NOT_CONFIGURED$/;

export async function handleSocialTick(req: Request, env: SocialEnv = process.env): Promise<Response> {
  if (!['GET', 'POST'].includes(req.method)) return json(405, { ok: false, error: 'Chỉ nhận GET/POST' });
  if (!requireCron(req, env)) return json(401, { ok: false, error: 'Không có quyền chạy job' });

  const startedAt = Date.now();
  let runId: number | null = null;
  const log: Array<Record<string, unknown>> = [];

  try {
    const sql = getSql(env);
    const [run] = await sql<[{ id: number }]>`
      insert into social_run (job_type, status) values ('tick', 'running') returning id`;
    runId = run.id;

    const picked = await sql<SocialPostRow[]>`
      with candidate as (
        select fb_post_id from social_post
        where state = any(${ACTIVE_STATES}) and next_run_at <= now()
        order by next_run_at limit ${BATCH}
        for update skip locked
      )
      update social_post p
        set next_run_at = now() + (${LEASE_MINUTES} * interval '1 minute'), updated_at = now()
      from candidate c where p.fb_post_id = c.fb_post_id
      returning p.fb_post_id, p.fb_page_id, p.fb_kind, p.fb_permalink, p.fb_message, p.fb_video_id,
                p.fb_reactions, p.fb_comments, p.fb_shares, p.state, p.attempt, p.idempotency_key,
                p.zalo_video_token, p.zalo_video_id, p.zalo_article_token, p.zalo_article_id,
                p.broadcast_score`;

    // Access token lấy LƯỜI: bài chỉ có ảnh không cần chạm Zalo ở bước đầu.
    let cached: string | null = null;
    const token = async () => {
      if (cached) return cached;
      const oaId = env.ZALO_OA_ID?.trim();
      if (!oaId) throw new Error('ZALO_OA_ID_NOT_CONFIGURED');
      cached = await validAccessToken(sql, oaId, env);
      return cached;
    };

    let advanced = 0;
    for (const post of picked) {
      if (Date.now() - startedAt > TIME_BUDGET_MS) {
        // Hết giờ: trả bài về hàng đợi NGAY, đừng để nó nằm chờ hết 5 phút lease.
        await sql`update social_post set next_run_at = now() where fb_post_id = ${post.fb_post_id}`;
        log.push({ post: post.fb_post_id, skipped: 'TIME_BUDGET' });
        continue;
      }
      try {
        const result = await advance(sql, post, env, token);
        const delay = result.retryInMinutes ?? 0;
        await sql`update social_post set
            state = ${result.state}, attempt = 0, last_error = null,
            next_run_at = now() + (${delay} * interval '1 minute'), updated_at = now()
          where fb_post_id = ${post.fb_post_id}`;
        advanced += 1;
        log.push({ post: post.fb_post_id, from: post.state, to: result.state, ...result.detail });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'UNKNOWN';
        if (FATAL_CONFIG.test(message)) {
          // Lỗi cấu hình: KHÔNG đốt attempt của bài, và dừng cả tick — nếu không,
          // 5 lượt retry sẽ giết sạch hàng đợi chỉ vì thiếu một biến môi trường.
          await sql`update social_post set next_run_at = now() + interval '10 minutes',
              last_error = ${message.slice(0, 400)}, updated_at = now()
            where fb_post_id = ${post.fb_post_id}`;
          log.push({ post: post.fb_post_id, fatal: message });
          break;
        }
        const attempt = post.attempt + 1;
        const dead = attempt >= MAX_ATTEMPT;
        await sql`update social_post set
            state = ${dead ? 'FAILED' : post.state}, attempt = ${attempt},
            last_error = ${message.slice(0, 400)},
            next_run_at = now() + (${dead ? 0 : backoffMinutes(attempt)} * interval '1 minute'),
            updated_at = now()
          where fb_post_id = ${post.fb_post_id}`;
        log.push({ post: post.fb_post_id, state: post.state, attempt, dead, error: message.slice(0, 200) });
      }
    }

    await sql`update social_run set status = 'success', finished_at = now(),
        picked = ${picked.length}, advanced = ${advanced} where id = ${runId}`;
    return json(200, { ok: true, picked: picked.length, advanced, ms: Date.now() - startedAt, log });
  } catch (error) {
    console.error('[social-tick]', error);
    const message = error instanceof Error ? error.message : 'UNKNOWN';
    if (runId != null) {
      try {
        await getSql(env)`update social_run set status = 'failed', finished_at = now(),
          error_message = ${message.slice(0, 500)} where id = ${runId}`;
      } catch { /* DB đã hỏng thì thôi */ }
    }
    if (message.includes('NOT_CONFIGURED')) return json(503, { ok: false, code: 'NOT_CONFIGURED', detail: message });
    return json(500, { ok: false, error: 'Tick thất bại', detail: message.slice(0, 200) });
  }
}

export const GET = (req: Request) => handleSocialTick(req, process.env);
export const POST = (req: Request) => handleSocialTick(req, process.env);
