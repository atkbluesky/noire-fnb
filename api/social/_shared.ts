/**
 * M6.2 · Social Auto — hạ tầng dùng chung.
 *
 * Trách nhiệm DUY NHẤT (M8_2 §1d): env · kiểu dữ liệu · helper R2 · helper Graph · masking.
 * CẤM gọi nghiệp vụ Zalo Article hay AI ở đây — hai việc đó nằm ở `_zalo-article.ts`
 * và `_transform.ts`.
 *
 * Luật M8_2 §0.2: file này IMPORT `api/zalo/_shared.ts`, không sao chép lại logic token.
 * `validAccessToken()` của M8.1 đã xử lý advisory lock + AES-256-GCM + xoay refresh token.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { getSql, ictDate, json, requireCron, validAccessToken, type Sql } from '../zalo/_shared.js';

export { getSql, ictDate, json, requireCron, validAccessToken };
export type { Sql };

export interface SocialEnv extends NodeJS.ProcessEnv {
  DATABASE_URL?: string;
  CRON_SECRET?: string;
  // Zalo — dùng lại nguyên của M8.1, KHÔNG thêm key token thứ hai
  ZALO_APP_ID?: string;
  ZALO_APP_SECRET_KEY?: string;
  ZALO_OA_ID?: string;
  ZALO_TOKEN_ENCRYPTION_KEY?: string;
  // Facebook
  FB_GRAPH_VERSION?: string;
  FB_APP_ID?: string;
  FB_APP_SECRET?: string;
  FB_PAGE_ID?: string;
  FB_PAGE_TOKEN?: string;
  FB_WEBHOOK_VERIFY_TOKEN?: string;
  // Gemini là mặc định khi có key; Claude giữ làm đường tương thích cũ.
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  // Claude
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_MODEL?: string;
  // Cloudflare R2
  R2_ACCOUNT_ID?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  R2_BUCKET?: string;
  R2_PUBLIC_BASE?: string;
  // Công tắc an toàn — Luật M8_2 §0.7
  SOCIAL_AUTOPUBLISH?: string;
  /** Key cũ giữ để tương thích cấu hình; không còn cấp quyền API. */
  SOCIAL_REVIEW_SECRET?: string;
  SOCIAL_ADMIN_PASSWORD_HASH?: string;
  /** Hạn mức broadcast/tháng theo gói OA. Cơ bản ~1, Nâng cao ~4. */
  SOCIAL_BROADCAST_QUOTA?: string;
  FFMPEG_PATH?: string;
}

/* ─── Trần cứng lấy từ tài liệu Zalo, KHÔNG phải ước lượng ──────────────────
   Bài viết:  title ≤150 · description ≤300 · author ≤50 · ảnh ≤1MB
   Video:     chỉ mp4/avi · ≤50MB
   Đổi mấy số này = phải sửa cả check constraint ở 004_social_auto.sql.          */
export const ZALO_TITLE_MAX = 150;
export const ZALO_DESC_MAX = 300;
export const ZALO_AUTHOR_MAX = 50;
export const ZALO_IMAGE_MAX_BYTES = 1_048_576;
export const ZALO_VIDEO_MAX_BYTES = 50 * 1_048_576;
export const ZALO_VIDEO_MIME = new Set(['video/mp4', 'video/x-msvideo', 'video/avi']);

/** Quá ngưỡng này thì thôi, chuyển FAILED — không retry vô hạn (M8_2 §2b). */
export const MAX_ATTEMPT = 5;

/** Backoff mũ theo số lần đã thử: 1' → 2' → 4' → 8' → 16'. */
export const backoffMinutes = (attempt: number): number => Math.min(16, 2 ** Math.max(0, attempt - 1));

export const isAutoPublish = (env: SocialEnv): boolean =>
  /^(1|true|yes)$/i.test(env.SOCIAL_AUTOPUBLISH?.trim() ?? '');

/** 'YYYY-MM' theo giờ ICT — khoá đối chiếu quota broadcast. */
export const ictMonth = (value = new Date()): string => ictDate(value).slice(0, 7);

export const mask = (t?: string): string =>
  !t ? '(trống)' : `${t.slice(0, 6)}…${t.slice(-4)}`;

export const newIdempotencyKey = (): string => randomBytes(16).toString('hex');

/* ─── Facebook ──────────────────────────────────────────────────────────── */

export function requireFb(env: SocialEnv): { version: string; pageId: string; token: string } {
  const pageId = env.FB_PAGE_ID?.trim();
  const token = env.FB_PAGE_TOKEN?.trim();
  if (!pageId || !token) throw new Error('FB_PAGE_NOT_CONFIGURED');
  return { version: (env.FB_GRAPH_VERSION || 'v23.0').trim(), pageId, token };
}

export async function fbGraph<T = Record<string, unknown>>(
  node: string,
  params: Record<string, string | number | undefined>,
  env: SocialEnv,
  timeoutMs = 20_000,
): Promise<T> {
  const { version, token } = requireFb(env);
  const url = new URL(`https://graph.facebook.com/${version}/${node}`);
  for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, String(v));
  url.searchParams.set('access_token', token);
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  const body = await res.json().catch(() => ({})) as Record<string, unknown>;
  if (!res.ok || body.error) {
    const e = (body.error ?? {}) as Record<string, unknown>;
    throw new Error(`FB_GRAPH_FAILED:${res.status}:${String(e.code ?? '')}:${String(e.message ?? '').slice(0, 160)}`);
  }
  return body as T;
}

/**
 * Chữ ký webhook Facebook: HMAC-SHA256 toàn bộ raw body bằng App Secret.
 * So sánh timing-safe. Chữ ký sai thì caller trả 200 + ignored, KHÔNG 401 —
 * cùng luật đã áp cho `api/zalo/webhook.ts` §6.
 */
export function verifyFbSignature(rawBody: string, header: string | null, env: SocialEnv): boolean {
  const secret = env.FB_APP_SECRET?.trim();
  if (!secret || !header) return false;
  const supplied = header.replace(/^sha256=/i, '').trim().toLowerCase();
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/* ─── Tải nhị phân có trần dung lượng ───────────────────────────────────────
   Không bao giờ `arrayBuffer()` mù: một reel 2GB sẽ giết function 2GB RAM.
   Đọc content-length trước, quá trần thì bỏ ngay và báo số thật để caller
   quyết định (hạ size ảnh / transcode video).                                */
export interface BinaryResult {
  ok: boolean;
  bytes: number;
  buffer?: Buffer;
  mime?: string;
  reason?: string;
}

export async function fetchBinary(url: string, maxBytes: number, timeoutMs = 120_000): Promise<BinaryResult> {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) return { ok: false, bytes: 0, reason: `HTTP_${res.status}` };
  const mime = res.headers.get('content-type')?.split(';')[0]?.trim() || undefined;
  const declared = Number(res.headers.get('content-length') ?? 0);
  if (declared > maxBytes) {
    await res.body?.cancel().catch(() => {});
    return { ok: false, bytes: declared, mime, reason: 'TOO_LARGE' };
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length > maxBytes) return { ok: false, bytes: buffer.length, mime, reason: 'TOO_LARGE' };
  return { ok: true, bytes: buffer.length, buffer, mime };
}

/* ─── Cloudflare R2 (S3 API, ký SigV4 tay) ──────────────────────────────────
   Không thêm @aws-sdk (≈10MB) vào bundle 250MB của Vercel chỉ để PUT một file.
   Cùng tinh thần với `api/zalo/_shared.ts` — repo này ký tay AES-GCM/HMAC sẵn rồi.
   R2 dùng region cố định 'auto'.                                              */
const sha256hex = (data: Buffer | string): string => createHash('sha256').update(data).digest('hex');
const hmacRaw = (key: Buffer | string, data: string): Buffer => createHmac('sha256', key).update(data, 'utf8').digest();
const uriEncode = (s: string): string =>
  encodeURIComponent(s).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

export function requireR2(env: SocialEnv) {
  const accountId = env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY?.trim();
  const bucket = env.R2_BUCKET?.trim();
  const publicBase = env.R2_PUBLIC_BASE?.trim().replace(/\/+$/, '');
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicBase) {
    throw new Error('R2_NOT_CONFIGURED');
  }
  return { accountId, accessKeyId, secretAccessKey, bucket, publicBase };
}

/** PUT một object lên R2, trả về URL công khai để Zalo fetch. */
export async function r2Put(key: string, body: Buffer, contentType: string, env: SocialEnv): Promise<string> {
  const { accountId, accessKeyId, secretAccessKey, bucket, publicBase } = requireR2(env);
  const host = `${accountId}.r2.cloudflarestorage.com`;
  const canonicalUri = `/${bucket}/${key.split('/').map(uriEncode).join('/')}`;
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');   // 20260927T103000Z
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256hex(body);

  const signedHeaders = 'content-length;content-type;host;x-amz-content-sha256;x-amz-date';
  const canonicalHeaders = [
    `content-length:${body.length}`,
    `content-type:${contentType}`,
    `host:${host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${amzDate}`,
  ].join('\n') + '\n';
  const canonicalRequest = ['PUT', canonicalUri, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');

  const scope = `${dateStamp}/auto/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256hex(canonicalRequest)].join('\n');
  const signing = hmacRaw(hmacRaw(hmacRaw(hmacRaw(`AWS4${secretAccessKey}`, dateStamp), 'auto'), 's3'), 'aws4_request');
  const signature = createHmac('sha256', signing).update(stringToSign, 'utf8').digest('hex');

  const res = await fetch(`https://${host}${canonicalUri}`, {
    method: 'PUT',
    headers: {
      'content-length': String(body.length),
      'content-type': contentType,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
    body: new Uint8Array(body),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    throw new Error(`R2_PUT_FAILED:${res.status}:${(await res.text().catch(() => '')).slice(0, 200)}`);
  }
  return `${publicBase}/${key}`;
}

/* ─── Kiểu dữ liệu dùng chung ───────────────────────────────────────────── */

export type SocialState =
  | 'INGESTED' | 'MEDIA_STAGED' | 'NEEDS_TRANSCODE' | 'TRANSFORMED'
  | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED'
  | 'VIDEO_UPLOADING' | 'VIDEO_CONVERTING'
  | 'ARTICLE_CREATING' | 'ARTICLE_VERIFYING' | 'PUBLISHED'
  | 'BROADCAST_QUEUED' | 'BROADCAST_SENT'
  | 'FAILED' | 'SKIPPED';

export interface SocialPostRow {
  fb_post_id: string;
  fb_page_id: string;
  fb_kind: string;
  fb_permalink: string | null;
  fb_message: string | null;
  fb_video_id: string | null;
  fb_reactions: number;
  fb_comments: number;
  fb_shares: number;
  state: SocialState;
  attempt: number;
  idempotency_key: string | null;
  zalo_video_token: string | null;
  zalo_video_id: string | null;
  zalo_article_token: string | null;
  zalo_article_id: string | null;
  broadcast_score: number | null;
}

export type DraftBlock =
  | { type: 'text'; content: string }
  | { type: 'image'; url: string; caption?: string };

export interface DraftPayload {
  title: string;
  description: string;
  author: string;
  body: DraftBlock[];
  broadcast_score: number;
  reject_reason: string | null;
}
