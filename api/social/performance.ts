/**
 * M8.2 · Số liệu cho dashboard.
 *
 * Trách nhiệm DUY NHẤT (M8_2 §1d): ĐỌC. Không ghi, không gọi API ngoài.
 *
 * `GET /api/social/performance`          → phễu + quota + lỗi (tóm tắt, mở như M8.1)
 * `GET /api/social/performance?queue=1`  → kèm NỘI DUNG bản nháp đang chờ duyệt,
 *                                          đòi `Bearer SOCIAL_REVIEW_SECRET`
 *
 * Tách hai mức vì phễu chỉ là con số, còn bản nháp là nội dung chưa duyệt của
 * thương hiệu — lộ ra ngoài là lộ bài sắp đăng.
 */
import { getSql, ictMonth, json, type SocialEnv } from './_shared.js';

const DEFAULT_QUOTA = 4;

/** Thứ tự phễu để dashboard vẽ đúng chiều, không phụ thuộc thứ tự SQL trả về. */
const FUNNEL_ORDER = [
  'INGESTED', 'MEDIA_STAGED', 'NEEDS_TRANSCODE', 'TRANSFORMED', 'PENDING_REVIEW',
  'APPROVED', 'VIDEO_UPLOADING', 'VIDEO_CONVERTING', 'ARTICLE_CREATING',
  'ARTICLE_VERIFYING', 'PUBLISHED', 'BROADCAST_QUEUED', 'BROADCAST_SENT',
  'REJECTED', 'SKIPPED', 'FAILED',
];

export async function handleSocialPerformance(req: Request, env: SocialEnv = process.env): Promise<Response> {
  if (req.method !== 'GET') return json(405, { ok: false, error: 'Chỉ nhận GET' });
  if (!env.DATABASE_URL) {
    return json(503, {
      ok: false, code: 'NOT_CONFIGURED',
      message: 'M8.2 đã dựng nhưng chưa có DATABASE_URL. Chạy database/migrations/004_social_auto.sql trước.',
    });
  }

  const url = new URL(req.url);
  const wantQueue = url.searchParams.get('queue') === '1';
  const secret = env.SOCIAL_REVIEW_SECRET?.trim();
  const mayReadQueue = Boolean(secret) && req.headers.get('authorization') === `Bearer ${secret}`;
  if (wantQueue && !mayReadQueue) {
    return json(401, { ok: false, error: 'Xem nội dung bản nháp cần Bearer SOCIAL_REVIEW_SECRET' });
  }

  try {
    const sql = getSql(env);
    const oaId = env.ZALO_OA_ID?.trim() ?? '';
    const month = ictMonth();
    const quota = Number(env.SOCIAL_BROADCAST_QUOTA) || DEFAULT_QUOTA;

    const [states, totals, quotaRow, failures, runs] = await Promise.all([
      sql<Array<{ state: string; n: number }>>`
        select state, count(*)::int as n from social_post group by state`,
      sql<[{ total: number; last7: number; published: number; reach_ready: number }]>`
        select count(*)::int as total,
               count(*) filter (where fb_created_at > now() - interval '7 days')::int as last7,
               count(*) filter (where state in ('PUBLISHED','BROADCAST_QUEUED','BROADCAST_SENT'))::int as published,
               count(*) filter (where state = 'PENDING_REVIEW')::int as reach_ready
        from social_post`,
      oaId
        ? sql<[{ used: number }]>`select social_broadcast_used(${oaId}, ${month}) as used`
        : Promise.resolve([{ used: 0 }] as [{ used: number }]),
      sql<Array<{ fb_post_id: string; state: string; attempt: number; last_error: string | null; fb_permalink: string | null }>>`
        select fb_post_id, state, attempt, last_error, fb_permalink from social_post
        where state in ('FAILED', 'NEEDS_TRANSCODE') order by updated_at desc limit 20`,
      sql<Array<{ job_type: string; status: string; picked: number; advanced: number; started_at: string; error_message: string | null }>>`
        select job_type, status, picked, advanced, started_at, error_message
        from social_run order by started_at desc limit 10`,
    ]);

    const byState = Object.fromEntries(states.map(s => [s.state, s.n]));
    const funnel = FUNNEL_ORDER.map(state => ({ state, count: byState[state] ?? 0 }));
    const used = quotaRow[0]?.used ?? 0;

    const payload: Record<string, unknown> = {
      ok: true,
      month,
      funnel,
      totals: totals[0],
      broadcast: { month, used, quota, remaining: Math.max(0, quota - used) },
      failures,
      runs,
    };

    if (wantQueue) {
      // Chỉ bản nháp MỚI NHẤT của mỗi bài — các version cũ chỉ dùng để so sánh.
      payload.queue = await sql<Array<Record<string, unknown>>>`
        select p.fb_post_id, p.fb_kind, p.fb_permalink, p.fb_message, p.fb_created_at,
               p.fb_reactions, p.fb_comments, p.fb_shares, p.broadcast_score,
               d.version, d.title, d.description, d.author, d.body, d.edited_by_human, d.model,
               (select coalesce(json_agg(json_build_object('kind', a.kind, 'url', a.public_url, 'bytes', a.bytes)
                        order by a.kind, a.ordinal), '[]'::json)
                  from social_asset a where a.fb_post_id = p.fb_post_id and a.ok = true) as assets
        from social_post p
        join social_draft d on d.fb_post_id = p.fb_post_id
         and d.version = (select max(version) from social_draft where fb_post_id = p.fb_post_id)
        where p.state = 'PENDING_REVIEW'
        order by p.broadcast_score desc nulls last, p.fb_created_at desc
        limit 30`;
    }

    return json(200, payload);
  } catch (error) {
    console.error('[social-performance]', error);
    const message = error instanceof Error ? error.message : 'UNKNOWN';
    if (message === 'DATABASE_URL_NOT_CONFIGURED') return json(503, { ok: false, code: 'NOT_CONFIGURED' });
    // Bảng chưa tồn tại = migration chưa chạy. Nói thẳng cho người vận hành.
    if (/relation .* does not exist/i.test(message)) {
      return json(503, { ok: false, code: 'MIGRATION_PENDING', message: 'Chạy database/migrations/004_social_auto.sql' });
    }
    return json(500, { ok: false, error: 'Không đọc được số liệu M8.2' });
  }
}

export const GET = (req: Request) => handleSocialPerformance(req, process.env);
export const POST = () => json(405, { ok: false, error: 'Chỉ nhận GET' });
