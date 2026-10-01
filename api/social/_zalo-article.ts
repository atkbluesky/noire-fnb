/**
 * M6.2 · Gọi Zalo OA Content API.
 *
 * Trách nhiệm DUY NHẤT (M8_2 §1d): preparevideo → upload_video/verify →
 * article/create → article/verify → article/update → oa/message.
 * CẤM tự quyết "show"/"hide" — nhận tham số, không nghĩ hộ (Luật §0.7).
 * CẤM ghi database, CẤM import `_media.ts`/`_transform.ts`.
 *
 * Mọi API ở đây BẤT ĐỒNG BỘ theo cùng một khuôn: trả `token`, phải gọi verify
 * riêng mới ra id thật. Đó là lý do máy trạng thái có hai bước rời nhau cho mỗi
 * thao tác ghi, chứ không gộp làm một (M8_2 §1c).
 */
import {
  ZALO_VIDEO_MAX_BYTES,
  type DraftBlock, type DraftPayload, type SocialEnv,
} from './_shared.js';

const BASE = 'https://openapi.zalo.me/v2.0';

/** Mã trạng thái video của Zalo (tài liệu `upload_video/verify`). */
export const VIDEO_READY = 1;
export const VIDEO_LOCKED = 2;
export const VIDEO_PROCESSING = 3;
export const VIDEO_FAILED = 4;
export const VIDEO_DELETED = 5;

export interface ArticlePayload {
  type: 'normal' | 'video';
  title: string;
  description: string;
  status: 'show' | 'hide';
  comment: 'show' | 'hide';
  author?: string;
  cover?: { cover_type: 'photo'; photo_url: string; status: 'show' | 'hide' };
  body?: DraftBlock[];
  video_id?: string;
  avatar?: string;
  id?: string;
}

/* ─── Vỏ bọc chung ──────────────────────────────────────────────────────── */

/**
 * Zalo luôn trả HTTP 200 kèm `error` trong body — `res.ok` một mình là vô nghĩa.
 * Bắt buộc đọc `error !== 0` mới biết hỏng.
 */
async function zaloCall<T = Record<string, unknown>>(
  url: string, init: RequestInit, tag: string,
): Promise<T> {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({})) as Record<string, any>;
  const code = Number(body.error ?? -1);
  if (!res.ok || code !== 0) {
    throw new Error(`ZALO_${tag}_FAILED:${code}:${String(body.message ?? res.status).slice(0, 160)}`);
  }
  return (body.data ?? {}) as T;
}

const jsonInit = (accessToken: string, payload: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json', access_token: accessToken },
  body: JSON.stringify(payload),
  signal: AbortSignal.timeout(30_000),
});

/* ─── ① + ② Video ──────────────────────────────────────────────────────── */

/**
 * Nạp video lên Zalo. Chỉ nhận mp4/avi, ≤50MB — kiểm ở đây một lần nữa dù
 * `_media.ts` đã ép, vì file có thể đến từ đường khác (sửa tay, chạy lại).
 * Trả về `token` để poll ở bước ②, KHÔNG phải video_id.
 */
export async function uploadVideo(videoUrl: string, accessToken: string): Promise<string> {
  const got = await fetch(videoUrl, { signal: AbortSignal.timeout(180_000) });
  if (!got.ok) throw new Error(`ZALO_VIDEO_FETCH_FAILED:${got.status}`);
  const buf = Buffer.from(await got.arrayBuffer());
  if (buf.length > ZALO_VIDEO_MAX_BYTES) {
    throw new Error(`ZALO_VIDEO_TOO_LARGE:${buf.length}`);
  }

  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(buf)], { type: 'video/mp4' }), 'video.mp4');
  // KHÔNG tự set Content-Type: fetch phải tự sinh boundary cho multipart.
  const data = await zaloCall<{ token?: string }>(
    `${BASE}/article/upload_video/preparevideo`,
    { method: 'POST', headers: { access_token: accessToken }, body: form, signal: AbortSignal.timeout(240_000) },
    'PREPAREVIDEO',
  );
  const token = String(data.token ?? '');
  if (!token) throw new Error('ZALO_PREPAREVIDEO_NO_TOKEN');
  return token;
}

export interface VideoStatus {
  status: number;
  videoId: string | null;
  percent: number;
  message: string;
}

/** Poll trạng thái convert. status=1 mới dùng được (M8_2 §4b). */
export async function verifyVideoUpload(token: string, accessToken: string): Promise<VideoStatus> {
  const url = new URL(`${BASE}/article/upload_video/verify`);
  url.searchParams.set('token', token);
  const data = await zaloCall<Record<string, any>>(
    url.toString(),
    { method: 'GET', headers: { access_token: accessToken }, signal: AbortSignal.timeout(20_000) },
    'VIDEO_VERIFY',
  );
  return {
    status: Number(data.status ?? 0),
    videoId: data.video_id ? String(data.video_id) : null,
    percent: Number(data.convert_percent ?? 0),
    message: String(data.status_message ?? ''),
  };
}

/* ─── ③ + ④ Bài viết ───────────────────────────────────────────────────── */

export interface BuildInput {
  draft: DraftPayload;
  coverImageUrl: string | null;
  videoId: string | null;
  thumbUrl: string | null;
  status: 'show' | 'hide';
  allowComment: boolean;
}

/**
 * Dựng payload đúng một trong hai dạng Zalo chấp nhận.
 * Bài có video dùng dạng "video" — KHÔNG có `body`, `author`, `cover`; Zalo
 * chỉ nhận `video_id` + `avatar`. Nhét thừa trường là bị từ chối.
 */
export function buildArticlePayload(input: BuildInput): ArticlePayload {
  const { draft, status } = input;
  const comment = input.allowComment ? 'show' : 'hide';

  if (input.videoId) {
    if (!input.thumbUrl) throw new Error('ZALO_VIDEO_ARTICLE_NEEDS_AVATAR');
    return {
      type: 'video',
      title: draft.title,
      description: draft.description,
      video_id: input.videoId,
      avatar: input.thumbUrl,
      status,
      comment,
    };
  }

  const payload: ArticlePayload = {
    type: 'normal',
    title: draft.title,
    author: draft.author,
    description: draft.description,
    body: draft.body.length ? draft.body : [{ type: 'text', content: draft.description }],
    status,
    comment,
  };
  if (input.coverImageUrl) {
    payload.cover = { cover_type: 'photo', photo_url: input.coverImageUrl, status: 'show' };
  }
  return payload;
}

/** Tạo bài. Trả `token` — CHƯA phải id, phải gọi `verifyArticle` ở bước ④. */
export async function createArticle(payload: ArticlePayload, accessToken: string): Promise<string> {
  const data = await zaloCall<{ token?: string }>(
    `${BASE}/article/create`, jsonInit(accessToken, payload), 'ARTICLE_CREATE',
  );
  const token = String(data.token ?? '');
  if (!token) throw new Error('ZALO_ARTICLE_CREATE_NO_TOKEN');
  return token;
}

/** Đổi token của create/update thành id bài viết thật. */
export async function verifyArticle(token: string, accessToken: string): Promise<string> {
  const data = await zaloCall<{ id?: string }>(
    `${BASE}/article/verify`, jsonInit(accessToken, { token }), 'ARTICLE_VERIFY',
  );
  const id = String(data.id ?? '');
  if (!id) throw new Error('ZALO_ARTICLE_VERIFY_NO_ID');
  return id;
}

/**
 * ⑤ Cập nhật bài — CHÚ Ý: `article/update` KHÔNG phải patch từng trường.
 * Phải gửi lại TOÀN BỘ payload kèm `id`, và nó cũng trả `token` bất đồng bộ
 * y như create (đã đối chiếu tài liệu 27/09/2026). Vì vậy caller phải gọi
 * `verifyArticle` lần nữa sau khi update.
 */
export async function updateArticle(
  id: string, payload: ArticlePayload, accessToken: string,
): Promise<string> {
  const data = await zaloCall<{ token?: string }>(
    `${BASE}/article/update`, jsonInit(accessToken, { ...payload, id }), 'ARTICLE_UPDATE',
  );
  const token = String(data.token ?? '');
  if (!token) throw new Error('ZALO_ARTICLE_UPDATE_NO_TOKEN');
  return token;
}

/* ─── ⑥ Broadcast ──────────────────────────────────────────────────────── */

export interface BroadcastTarget {
  ages?: string;
  gender?: string;
  locations?: string;
  cities?: string;
  platform?: string;
}

/**
 * Đẩy bài đã đăng tới người quan tâm. Quota rất hẹp (Cơ bản ~1/tháng, Nâng cao
 * ~4/tháng) nên caller BẮT BUỘC kiểm `social_broadcast_used()` trước khi gọi —
 * hàm này không tự biết quota. Zalo xử lý ~30 phút trước khi tin tới người dùng.
 */
export async function broadcastArticle(
  articleId: string, target: BroadcastTarget, accessToken: string,
): Promise<string> {
  const payload = {
    recipient: { target: Object.keys(target).length ? target : { gender: '0' } },
    message: {
      attachment: {
        type: 'template',
        payload: {
          template_type: 'media',
          elements: [{ media_type: 'article', attachment_id: articleId }],
        },
      },
    },
  };
  const data = await zaloCall<{ message_id?: string }>(
    `${BASE}/oa/message`, jsonInit(accessToken, payload), 'BROADCAST',
  );
  return String(data.message_id ?? '');
}

/** Khung giờ Zalo cho phép gửi tin Truyền thông: 6h00–21h59 giờ ICT. */
export function withinBroadcastWindow(now = new Date()): boolean {
  const hour = Number(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok', hour: '2-digit', hour12: false,
  }).format(now));
  return hour >= 6 && hour <= 21;
}
