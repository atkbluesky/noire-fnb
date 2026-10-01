/**
 * M6.2 · Logic nghiệp vụ của từng bước trong máy trạng thái.
 *
 * Trách nhiệm DUY NHẤT (M8_2 §1d): mỗi hàm `step*` đẩy MỘT bài đi ĐÚNG MỘT bước
 * và trả trạng thái kế tiếp. **Không** biết gì về hàng đợi, lease, attempt,
 * backoff hay audit — đó là việc của `tick.ts`.
 *
 * Tách khỏi `tick.ts` vì §1d đặt trần 200 dòng cho bộ điều phối và cấm nhét
 * nghiệp vụ vào đó. Nhờ tách, mỗi `step*` gọi độc lập được khi cần dò lỗi.
 */
import {
  getSql, isAutoPublish, newIdempotencyKey,
  type SocialEnv, type SocialPostRow, type Sql,
} from './_shared.js';
import { collectMedia, fetchPostDetail } from './_media.js';
import { blendScore, transform, PROMPT_VERSION } from './_transform.js';
import {
  buildArticlePayload, broadcastArticle, createArticle, updateArticle,
  uploadVideo, verifyArticle, verifyVideoUpload, withinBroadcastWindow,
  VIDEO_FAILED, VIDEO_READY,
} from './_zalo-article.js';

/** Trạng thái mà tick được phép đẩy. PENDING_REVIEW/NEEDS_TRANSCODE chờ người. */
export const ACTIVE_STATES = [
  'INGESTED', 'MEDIA_STAGED', 'TRANSFORMED', 'APPROVED',
  'VIDEO_UPLOADING', 'VIDEO_CONVERTING',
  'ARTICLE_CREATING', 'ARTICLE_VERIFYING', 'BROADCAST_QUEUED',
];

const AUTO_APPROVE_MIN = 75;   // chỉ dùng khi SOCIAL_AUTOPUBLISH=true

export interface StepResult {
  state: string;
  detail?: Record<string, unknown>;
  /** Chạy lại CHÍNH bước này sau N phút thay vì đổi trạng thái (video đang convert). */
  retryInMinutes?: number;
}

/** Lấy access token Zalo — lười, chỉ gọi khi bước thật sự cần chạm Zalo. */
export type TokenFn = () => Promise<string>;

/* ─── Helper đọc dữ liệu ────────────────────────────────────────────────── */

async function loadDraft(sql: Sql, fbPostId: string) {
  const [d] = await sql<Array<{
    title: string; description: string; author: string; body: unknown; broadcast_score: number | null;
  }>>`select title, description, author, body, broadcast_score from social_draft
      where fb_post_id = ${fbPostId} order by version desc limit 1`;
  if (!d) throw new Error('SOCIAL_DRAFT_MISSING');
  return {
    title: d.title,
    description: d.description,
    author: d.author,
    body: (Array.isArray(d.body) ? d.body : []) as never,
    broadcast_score: d.broadcast_score ?? 0,
    reject_reason: null,
  };
}

async function loadCovers(sql: Sql, fbPostId: string) {
  const rows = await sql<Array<{ kind: string; public_url: string | null }>>`
    select kind, public_url from social_asset
    where fb_post_id = ${fbPostId} and ok = true and public_url is not null
    order by ordinal`;
  return {
    coverImageUrl: rows.find(r => r.kind === 'image')?.public_url ?? null,
    thumbUrl: rows.find(r => r.kind === 'thumb')?.public_url ?? null,
  };
}

/* ─── Các bước ──────────────────────────────────────────────────────────── */

/** INGESTED → tải media, ép về trần Zalo, ghi `social_asset`. */
export async function stepIngested(sql: Sql, post: SocialPostRow, env: SocialEnv): Promise<StepResult> {
  const detail = await fetchPostDetail(post.fb_post_id, env);
  const media = await collectMedia(post.fb_post_id, detail, env);
  if (media.fatal) throw new Error(media.fatal);

  await sql.begin(async tx => {
    for (const a of media.assets) {
      await tx`insert into social_asset (
          fb_post_id, kind, ordinal, source_url, public_url, bytes,
          width, height, duration_sec, mime, ok, note
        ) values (
          ${post.fb_post_id}, ${a.kind}, ${a.ordinal}, ${a.sourceUrl}, ${a.publicUrl}, ${a.bytes},
          ${a.width}, ${a.height}, ${a.durationSec}, ${a.mime}, ${a.ok}, ${a.note}
        ) on conflict (fb_post_id, kind, ordinal) do update set
          source_url = excluded.source_url, public_url = excluded.public_url,
          bytes = excluded.bytes, ok = excluded.ok, note = excluded.note`;
    }
    await tx`update social_post set
        fb_message = coalesce(${detail.message || null}, fb_message),
        fb_permalink = coalesce(${detail.permalink}, fb_permalink),
        fb_created_at = coalesce(${detail.createdAt}, fb_created_at),
        fb_reactions = ${detail.reactions}, fb_comments = ${detail.comments},
        fb_shares = ${detail.shares}, fb_stats_at = now(),
        fb_video_id = coalesce(${detail.videoId}, fb_video_id), updated_at = now()
      where fb_post_id = ${post.fb_post_id}`;
  });

  if (media.needsTranscode) {
    return { state: 'NEEDS_TRANSCODE', detail: { reason: 'video >50MB và không có ffmpeg' } };
  }
  // Không caption, không ảnh, không video ⇒ không có gì để đăng.
  const usable = media.assets.some(a => a.ok);
  if (!usable && detail.message.trim().length < 15) {
    await sql`update social_post set reject_reason = 'NO_USABLE_CONTENT' where fb_post_id = ${post.fb_post_id}`;
    return { state: 'SKIPPED', detail: { reason: 'không có nội dung dùng được' } };
  }
  return { state: 'MEDIA_STAGED', detail: { assets: media.assets.length } };
}

/** MEDIA_STAGED → AI viết lại, ghi `social_draft`. */
export async function stepMediaStaged(sql: Sql, post: SocialPostRow, env: SocialEnv): Promise<StepResult> {
  const assets = await sql<Array<{ kind: string; public_url: string | null; ok: boolean }>>`
    select kind, public_url, ok from social_asset
    where fb_post_id = ${post.fb_post_id} order by kind, ordinal`;
  const imageUrls = assets.filter(a => a.kind === 'image' && a.ok && a.public_url).map(a => a.public_url!);
  const hasVideo = assets.some(a => a.kind === 'video' && a.ok);

  const fewShot = await sql<Array<{ fb_message: string | null; title: string; description: string }>>`
    select p.fb_message, d.title, d.description
    from social_draft d join social_post p using (fb_post_id)
    where d.approved = true and p.fb_message is not null
    order by d.approved_at desc limit 3`;

  const { draft, model, rounds } = await transform({
    message: post.fb_message ?? '',
    kind: post.fb_kind,
    permalink: post.fb_permalink,
    imageUrls,
    hasVideo,
    reactions: post.fb_reactions,
    comments: post.fb_comments,
    shares: post.fb_shares,
    fewShot: fewShot.map(f => ({ source: f.fb_message ?? '', title: f.title, description: f.description })),
  }, env);

  const score = blendScore(draft.broadcast_score, post.fb_reactions, post.fb_comments, post.fb_shares);

  await sql.begin(async tx => {
    const [{ next }] = await tx<[{ next: number }]>`
      select coalesce(max(version), 0) + 1 as next from social_draft where fb_post_id = ${post.fb_post_id}`;
    await tx`insert into social_draft (
        fb_post_id, version, title, description, author, body,
        broadcast_score, reject_reason, model, prompt_version
      ) values (
        ${post.fb_post_id}, ${next}, ${draft.title}, ${draft.description}, ${draft.author},
        ${tx.json(draft.body)}, ${score}, ${draft.reject_reason}, ${model}, ${PROMPT_VERSION}
      )`;
    await tx`update social_post set broadcast_score = ${score},
        reject_reason = ${draft.reject_reason}, updated_at = now()
      where fb_post_id = ${post.fb_post_id}`;
  });

  if (draft.reject_reason) return { state: 'REJECTED', detail: { reason: draft.reject_reason } };
  return { state: 'TRANSFORMED', detail: { score, model, rounds } };
}

/**
 * TRANSFORMED → vào hàng chờ duyệt.
 * Chỉ tự duyệt khi SOCIAL_AUTOPUBLISH bật VÀ điểm đủ cao (Luật §0.7 + QA gate 9).
 */
export function stepTransformed(post: SocialPostRow, env: SocialEnv): StepResult {
  const score = post.broadcast_score ?? 0;
  if (isAutoPublish(env) && score >= AUTO_APPROVE_MIN) {
    return { state: 'APPROVED', detail: { auto: true, score } };
  }
  return { state: 'PENDING_REVIEW', detail: { score } };
}

/** APPROVED → rẽ nhánh: có video thì nạp video trước, không thì tạo bài luôn. */
export async function stepApproved(sql: Sql, post: SocialPostRow): Promise<StepResult> {
  const [video] = await sql<Array<{ public_url: string | null }>>`
    select public_url from social_asset
    where fb_post_id = ${post.fb_post_id} and kind = 'video' and ok = true limit 1`;
  return video?.public_url ? { state: 'VIDEO_UPLOADING' } : { state: 'ARTICLE_CREATING' };
}

/** VIDEO_UPLOADING → preparevideo, lưu token TRƯỚC khi đổi trạng thái. */
export async function stepVideoUploading(
  sql: Sql, post: SocialPostRow, accessToken: string,
): Promise<StepResult> {
  if (post.zalo_video_token) return { state: 'VIDEO_CONVERTING' };   // đã nạp rồi, đừng nạp lại
  const [video] = await sql<Array<{ public_url: string }>>`
    select public_url from social_asset
    where fb_post_id = ${post.fb_post_id} and kind = 'video' and ok = true and public_url is not null limit 1`;
  if (!video) return { state: 'ARTICLE_CREATING', detail: { note: 'video biến mất, đăng dạng bài thường' } };

  const token = await uploadVideo(video.public_url, accessToken);
  await sql`update social_post set zalo_video_token = ${token}, updated_at = now()
    where fb_post_id = ${post.fb_post_id}`;
  return { state: 'VIDEO_CONVERTING', detail: { uploaded: true } };
}

/** VIDEO_CONVERTING → poll. Đang xử lý thì trả tick, KHÔNG chờ trong request. */
export async function stepVideoConverting(
  sql: Sql, post: SocialPostRow, accessToken: string,
): Promise<StepResult> {
  if (!post.zalo_video_token) return { state: 'VIDEO_UPLOADING' };
  const s = await verifyVideoUpload(post.zalo_video_token, accessToken);

  if (s.status === VIDEO_READY && s.videoId) {
    await sql`update social_post set zalo_video_id = ${s.videoId}, updated_at = now()
      where fb_post_id = ${post.fb_post_id}`;
    return { state: 'ARTICLE_CREATING', detail: { videoId: s.videoId } };
  }
  if (s.status === VIDEO_FAILED || s.status === 0) {
    throw new Error(`ZALO_VIDEO_CONVERT_FAILED:${s.status}:${s.message}`);
  }
  // status 2 (khoá) / 3 (đang xử lý) / 5 (đã xoá) — chờ tiếp, convert mất vài phút.
  return { state: 'VIDEO_CONVERTING', retryInMinutes: 2, detail: { percent: s.percent, status: s.status } };
}

/** ARTICLE_CREATING → luôn tạo với status "hide" (Luật §0.7). */
export async function stepArticleCreating(
  sql: Sql, post: SocialPostRow, accessToken: string,
): Promise<StepResult> {
  if (post.zalo_article_id) return { state: 'PUBLISHED' };            // đã đăng, không tạo lại
  if (post.zalo_article_token) return { state: 'ARTICLE_VERIFYING' }; // đã bắn, chỉ thiếu verify

  const draft = await loadDraft(sql, post.fb_post_id);
  const { coverImageUrl, thumbUrl } = await loadCovers(sql, post.fb_post_id);
  const payload = buildArticlePayload({
    draft, coverImageUrl, videoId: post.zalo_video_id,
    thumbUrl: thumbUrl ?? coverImageUrl, status: 'hide', allowComment: true,
  });

  // Luật §0.8: ghi idempotency_key TRƯỚC khi gọi API ghi.
  const key = post.idempotency_key ?? newIdempotencyKey();
  await sql`update social_post set idempotency_key = ${key}, updated_at = now()
    where fb_post_id = ${post.fb_post_id}`;

  const token = await createArticle(payload, accessToken);
  await sql`update social_post set zalo_article_token = ${token}, updated_at = now()
    where fb_post_id = ${post.fb_post_id}`;
  return { state: 'ARTICLE_VERIFYING', detail: { created: true } };
}

/**
 * ARTICLE_VERIFYING → lấy id thật, rồi mở hiển thị.
 * `article/update` KHÔNG phải patch: phải gửi lại TOÀN BỘ payload kèm id, và nó
 * cũng trả token bất đồng bộ nên phải verify lần hai (đối chiếu tài liệu 27/09/2026).
 */
export async function stepArticleVerifying(
  sql: Sql, post: SocialPostRow, accessToken: string,
): Promise<StepResult> {
  let articleId = post.zalo_article_id;
  if (!articleId) {
    if (!post.zalo_article_token) return { state: 'ARTICLE_CREATING' };
    articleId = await verifyArticle(post.zalo_article_token, accessToken);
    await sql`update social_post set zalo_article_id = ${articleId}, updated_at = now()
      where fb_post_id = ${post.fb_post_id}`;
  }

  const draft = await loadDraft(sql, post.fb_post_id);
  const { coverImageUrl, thumbUrl } = await loadCovers(sql, post.fb_post_id);
  const shown = buildArticlePayload({
    draft, coverImageUrl, videoId: post.zalo_video_id,
    thumbUrl: thumbUrl ?? coverImageUrl, status: 'show', allowComment: true,
  });
  const updateToken = await updateArticle(articleId, shown, accessToken);
  await verifyArticle(updateToken, accessToken);

  await sql`update social_post set zalo_shown_at = now(), updated_at = now()
    where fb_post_id = ${post.fb_post_id}`;
  return { state: 'PUBLISHED', detail: { articleId } };
}

/**
 * BROADCAST_QUEUED → bắn tin Truyền thông.
 * Chỉ vào được trạng thái này qua `review.ts` (người bấm), KHÔNG tự động —
 * quota 1–4/tháng quá hiếm để máy tự quyết (M8_2 §4b).
 */
export async function stepBroadcastQueued(
  sql: Sql, post: SocialPostRow, accessToken: string, env: SocialEnv,
): Promise<StepResult> {
  const oaId = env.ZALO_OA_ID?.trim();
  if (!oaId) throw new Error('ZALO_OA_ID_NOT_CONFIGURED');
  if (!post.zalo_article_id) return { state: 'PUBLISHED', detail: { note: 'chưa có article_id' } };
  if (!withinBroadcastWindow()) {
    return { state: 'BROADCAST_QUEUED', retryInMinutes: 30, detail: { note: 'ngoài khung 6h–22h' } };
  }

  const [row] = await sql<Array<{ id: number; status: string; target: Record<string, string> | null }>>`
    select id, status, target from social_broadcast
    where zalo_article_id = ${post.zalo_article_id} and status in ('queued', 'sent') limit 1`;
  if (!row) return { state: 'PUBLISHED', detail: { note: 'không có bản ghi broadcast' } };
  if (row.status === 'sent') return { state: 'BROADCAST_SENT' };

  try {
    const messageId = await broadcastArticle(post.zalo_article_id, row.target ?? {}, accessToken);
    await sql`update social_broadcast set status = 'sent', zalo_message_id = ${messageId}, sent_at = now()
      where id = ${row.id}`;
    return { state: 'BROADCAST_SENT', detail: { messageId } };
  } catch (error) {
    const detail = error instanceof Error ? error.message.slice(0, 400) : 'UNKNOWN';
    await sql`update social_broadcast set status = 'failed', error_message = ${detail} where id = ${row.id}`;
    throw error;
  }
}

/** Bảng phân phối duy nhất: trạng thái → hàm xử lý. */
export async function advance(
  sql: Sql, post: SocialPostRow, env: SocialEnv, token: TokenFn,
): Promise<StepResult> {
  switch (post.state) {
    case 'INGESTED':          return stepIngested(sql, post, env);
    case 'MEDIA_STAGED':      return stepMediaStaged(sql, post, env);
    case 'TRANSFORMED':       return stepTransformed(post, env);
    case 'APPROVED':          return stepApproved(sql, post);
    case 'VIDEO_UPLOADING':   return stepVideoUploading(sql, post, await token());
    case 'VIDEO_CONVERTING':  return stepVideoConverting(sql, post, await token());
    case 'ARTICLE_CREATING':  return stepArticleCreating(sql, post, await token());
    case 'ARTICLE_VERIFYING': return stepArticleVerifying(sql, post, await token());
    case 'BROADCAST_QUEUED':  return stepBroadcastQueued(sql, post, await token(), env);
    default: throw new Error(`STATE_NOT_HANDLED:${post.state}`);
  }
}

export { getSql };
