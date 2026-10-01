/**
 * M6.2 · Duyệt / từ chối / sửa tay / xếp hàng broadcast.
 *
 * Trách nhiệm DUY NHẤT (M8_2 §1d): đổi trạng thái. **CẤM đăng trực tiếp** —
 * endpoint này không bao giờ gọi Zalo API; nó chỉ đẩy bài vào đúng ô của máy
 * trạng thái rồi để tick làm. Nhờ vậy một cú bấm nhầm không gây ra lệnh gọi
 * ra ngoài ngay lập tức.
 *
 * Endpoint này yêu cầu phiên đăng nhập M6.2 và kiểm tra nguồn gốc request.
 * Bearer SOCIAL_REVIEW_SECRET cũ không còn cấp quyền duyệt.
 */
import {
  ZALO_AUTHOR_MAX, ZALO_DESC_MAX, ZALO_TITLE_MAX,
  getSql, ictMonth, json, type SocialEnv,
} from './_shared.js';
import { requireSocialSession, validSocialMutationRequest } from './_auth.js';

const ACTIONS = ['approve', 'reject', 'edit', 'broadcast', 'retry'] as const;
type Action = typeof ACTIONS[number];

const DEFAULT_QUOTA = 4;   // gói Nâng cao ~4/tháng; gói Cơ bản đặt lại thành 1

export async function handleSocialReview(req: Request, env: SocialEnv = process.env): Promise<Response> {
  if (req.method !== 'POST') return json(405, { ok: false, error: 'Chỉ nhận POST' });
  if (!validSocialMutationRequest(req)) return json(403, { ok: false, error: 'Yêu cầu không cùng nguồn gốc' });
  try {
    if (!await requireSocialSession(req, env)) return json(401, { ok: false, error: 'Cần đăng nhập M6.2' });
  } catch (error) {
    console.error('[social-review-auth]', error);
    return json(503, { ok: false, error: 'Không kiểm tra được phiên đăng nhập' });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json() as Record<string, unknown>;
  } catch {
    return json(400, { ok: false, error: 'Body không phải JSON' });
  }

  const fbPostId = String(body.fb_post_id ?? '').trim();
  const action = String(body.action ?? '') as Action;
  if (!fbPostId) return json(400, { ok: false, error: 'Thiếu fb_post_id' });
  if (!ACTIONS.includes(action)) {
    return json(400, { ok: false, error: `action phải là một trong: ${ACTIONS.join(', ')}` });
  }

  try {
    const sql = getSql(env);
    const [post] = await sql<Array<{ state: string; zalo_article_id: string | null; broadcast_score: number | null }>>`
      select state, zalo_article_id, broadcast_score from social_post where fb_post_id = ${fbPostId}`;
    if (!post) return json(404, { ok: false, error: 'Không có bài này' });

    switch (action) {
      case 'approve': {
        if (post.state !== 'PENDING_REVIEW') {
          return json(409, { ok: false, error: `Bài đang ở ${post.state}, chỉ duyệt được khi PENDING_REVIEW` });
        }
        await sql.begin(async tx => {
          await tx`update social_draft set approved = true, approved_at = now()
            where fb_post_id = ${fbPostId}
              and version = (select max(version) from social_draft where fb_post_id = ${fbPostId})`;
          await tx`update social_post set state = 'APPROVED', attempt = 0,
              next_run_at = now(), last_error = null, updated_at = now()
            where fb_post_id = ${fbPostId}`;
        });
        return json(200, { ok: true, state: 'APPROVED' });
      }

      case 'reject': {
        if (post.state !== 'PENDING_REVIEW') {
          return json(409, { ok: false, error: `Chỉ từ chối được bài PENDING_REVIEW, hiện là ${post.state}` });
        }
        const reason = String(body.reason ?? 'REJECTED_BY_HUMAN').slice(0, 300);
        await sql.begin(async tx => {
          await tx`update social_draft set approved = false
            where fb_post_id = ${fbPostId}
              and version = (select max(version) from social_draft where fb_post_id = ${fbPostId})`;
          await tx`update social_post set state = 'REJECTED', reject_reason = ${reason}, updated_at = now()
            where fb_post_id = ${fbPostId}`;
        });
        return json(200, { ok: true, state: 'REJECTED' });
      }

      case 'edit': {
        if (post.state !== 'PENDING_REVIEW') {
          return json(409, { ok: false, error: `Chỉ sửa được bản nháp PENDING_REVIEW, hiện là ${post.state}` });
        }
        // Sửa tay vẫn phải qua đúng trần của Zalo — người cũng gõ quá 150 ký tự như thường.
        const title = String(body.title ?? '').trim();
        const description = String(body.description ?? '').trim();
        const author = String(body.author ?? '').trim();
        const errors: string[] = [];
        if (!title || title.length > ZALO_TITLE_MAX) errors.push(`title 1..${ZALO_TITLE_MAX} ký tự`);
        if (!description || description.length > ZALO_DESC_MAX) errors.push(`description 1..${ZALO_DESC_MAX} ký tự`);
        if (!author || author.length > ZALO_AUTHOR_MAX) errors.push(`author 1..${ZALO_AUTHOR_MAX} ký tự`);
        if (!Array.isArray(body.body) || !body.body.length) errors.push('body phải là mảng không rỗng');
        if (errors.length) return json(422, { ok: false, errors });

        const [created] = await sql<[{ version: number }]>`
          insert into social_draft (
            fb_post_id, version, title, description, author, body,
            broadcast_score, model, prompt_version, edited_by_human
          )
          select ${fbPostId}, coalesce(max(version), 0) + 1, ${title}, ${description}, ${author},
                 ${sql.json(body.body as never)}, ${post.broadcast_score}, 'human', 'human', true
          from social_draft where fb_post_id = ${fbPostId}
          returning version`;
        return json(200, { ok: true, version: created.version, state: post.state });
      }

      case 'broadcast': {
        if (post.state !== 'PUBLISHED' || !post.zalo_article_id) {
          return json(409, { ok: false, error: 'Chỉ broadcast được bài đã PUBLISHED và có article_id' });
        }
        const oaId = env.ZALO_OA_ID?.trim();
        if (!oaId) return json(503, { ok: false, code: 'NOT_CONFIGURED', missing: ['ZALO_OA_ID'] });

        const month = ictMonth();
        const quota = Number(env.SOCIAL_BROADCAST_QUOTA) || DEFAULT_QUOTA;
        const [{ used }] = await sql<[{ used: number }]>`
          select social_broadcast_used(${oaId}, ${month}) as used`;
        if (used >= quota) {
          // Chặn CỨNG ở đây, không để tick phát hiện ra lúc đã gọi API.
          return json(409, { ok: false, error: `Hết quota broadcast tháng ${month}`, used, quota });
        }

        const target = (body.target && typeof body.target === 'object') ? body.target : {};
        const inserted = await sql`insert into social_broadcast (
            oa_id, fb_post_id, zalo_article_id, quota_month, target, status
          ) values (
            ${oaId}, ${fbPostId}, ${post.zalo_article_id}, ${month}, ${sql.json(target as never)}, 'queued'
          ) on conflict do nothing returning id`;
        if (!inserted.length) return json(409, { ok: false, error: 'Bài này đã được xếp hàng hoặc đã gửi' });

        await sql`update social_post set state = 'BROADCAST_QUEUED', attempt = 0,
            next_run_at = now(), updated_at = now() where fb_post_id = ${fbPostId}`;
        return json(200, { ok: true, state: 'BROADCAST_QUEUED', month, used: used + 1, quota });
      }

      case 'retry': {
        if (!['FAILED', 'NEEDS_TRANSCODE', 'REJECTED', 'SKIPPED'].includes(post.state)) {
          return json(409, { ok: false, error: `Không retry được từ ${post.state}` });
        }
        await sql`update social_post set state = 'INGESTED', attempt = 0, last_error = null,
            reject_reason = null, next_run_at = now(), updated_at = now()
          where fb_post_id = ${fbPostId}`;
        return json(200, { ok: true, state: 'INGESTED' });
      }
    }
  } catch (error) {
    console.error('[social-review]', error);
    const message = error instanceof Error ? error.message : 'UNKNOWN';
    if (message === 'DATABASE_URL_NOT_CONFIGURED') return json(503, { ok: false, code: 'NOT_CONFIGURED' });
    return json(500, { ok: false, error: 'Không đổi được trạng thái' });
  }
}

export const POST = (req: Request) => handleSocialReview(req, process.env);
export const GET = () => json(405, { ok: false, error: 'Chỉ nhận POST' });
