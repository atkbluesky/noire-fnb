/**
 * M6.2 · Lấy media từ Facebook, ép về đúng trần Zalo, đẩy lên R2.
 *
 * Trách nhiệm DUY NHẤT (M8_2 §1d): tải · chuẩn hoá · đẩy R2. **CẤM ghi database** —
 * hàm ở đây nhận id, trả mô tả asset; `tick.ts` mới là chỗ ghi `social_asset`.
 * CẤM import `_transform.ts` và `_zalo-article.ts` (luật phụ thuộc một chiều).
 *
 * ── Vì sao KHÔNG dùng sharp ────────────────────────────────────────────────
 * Facebook đã render sẵn nhiều kích thước cho mỗi ảnh (`?fields=images` trả mảng
 * source/width/height xếp từ lớn xuống nhỏ). Chọn bản lớn nhất còn ≤1MB là xong,
 * không cần resize. Đỡ được một native dep ~30MB trong bundle 250MB của Vercel,
 * và ảnh giữ nguyên chất lượng gốc của FB thay vì nén hai lần.
 * Chỉ video mới thật sự cần ffmpeg, và chỉ khi file >50MB.
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  fbGraph, fetchBinary, r2Put,
  ZALO_IMAGE_MAX_BYTES, ZALO_VIDEO_MAX_BYTES,
  type SocialEnv,
} from './_shared.js';

export interface AssetDraft {
  kind: 'image' | 'video' | 'thumb';
  ordinal: number;
  sourceUrl: string | null;
  publicUrl: string | null;
  bytes: number | null;
  width: number | null;
  height: number | null;
  durationSec: number | null;
  mime: string | null;
  ok: boolean;
  note: string | null;
}

export interface PostDetail {
  message: string;
  permalink: string | null;
  createdAt: string | null;
  reactions: number;
  comments: number;
  shares: number;
  photoIds: string[];
  videoId: string | null;
  fallbackImage: string | null;
}

export interface MediaResult {
  assets: AssetDraft[];
  needsTranscode: boolean;
  fatal: string | null;
}

const FIELDS = [
  'id', 'message', 'created_time', 'permalink_url', 'full_picture', 'shares',
  'attachments{type,media_type,media,target,subattachments{media,target,type}}',
  'reactions.summary(true).limit(0)',
  'comments.summary(true).limit(0)',
].join(',');

/** Một lần gọi Graph lấy đủ caption + engagement + danh sách media. */
export async function fetchPostDetail(fbPostId: string, env: SocialEnv): Promise<PostDetail> {
  const p = await fbGraph<Record<string, any>>(fbPostId, { fields: FIELDS }, env);
  const attachments: any[] = p.attachments?.data ?? [];
  const photoIds: string[] = [];
  let videoId: string | null = null;

  const walk = (node: any) => {
    if (!node) return;
    const type = String(node.type ?? node.media_type ?? '');
    const targetId = node.target?.id ? String(node.target.id) : null;
    if (/video|reel/i.test(type) && targetId) videoId ??= targetId;
    else if (/photo|image|album/i.test(type) && targetId) photoIds.push(targetId);
    for (const sub of node.subattachments?.data ?? []) walk(sub);
  };
  for (const a of attachments) walk(a);

  return {
    message: String(p.message ?? ''),
    permalink: p.permalink_url ? String(p.permalink_url) : null,
    createdAt: p.created_time ? new Date(p.created_time).toISOString() : null,
    reactions: Number(p.reactions?.summary?.total_count ?? 0),
    comments: Number(p.comments?.summary?.total_count ?? 0),
    shares: Number(p.shares?.count ?? 0),
    photoIds: [...new Set(photoIds)],
    videoId,
    fallbackImage: p.full_picture ? String(p.full_picture) : null,
  };
}

/* ─── Ảnh ───────────────────────────────────────────────────────────────── */

interface Rendition { source: string; width: number; height: number }

/** Mảng kích thước FB đã render sẵn, xếp từ lớn xuống nhỏ. */
async function renditions(photoId: string, env: SocialEnv): Promise<Rendition[]> {
  try {
    const r = await fbGraph<Record<string, any>>(photoId, { fields: 'images' }, env);
    return (r.images ?? [])
      .map((i: any) => ({ source: String(i.source), width: Number(i.width) || 0, height: Number(i.height) || 0 }))
      .filter((i: Rendition) => i.source)
      .sort((a: Rendition, b: Rendition) => b.width - a.width);
  } catch {
    return [];
  }
}

/**
 * Chọn bản lớn nhất mà vẫn ≤1MB. Bỏ qua bản quá to (>2000px) vì gần như chắc
 * chắn vượt trần, tải về rồi vứt là phí băng thông và phí thời gian của tick.
 */
async function stageImage(
  candidates: Rendition[], ordinal: number, fbPostId: string, env: SocialEnv,
): Promise<AssetDraft> {
  const base: AssetDraft = {
    kind: 'image', ordinal, sourceUrl: candidates[0]?.source ?? null, publicUrl: null,
    bytes: null, width: null, height: null, durationSec: null, mime: null, ok: false, note: null,
  };
  const tries = candidates.filter(c => c.width <= 2000).slice(0, 4);
  if (!tries.length) return { ...base, note: 'NO_RENDITION_UNDER_2000PX' };

  for (const c of tries) {
    const got = await fetchBinary(c.source, ZALO_IMAGE_MAX_BYTES, 60_000);
    if (!got.ok || !got.buffer) continue;                       // quá 1MB → thử bản nhỏ hơn
    const mime = got.mime ?? 'image/jpeg';
    const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
    const url = await r2Put(`social/${fbPostId}/img-${ordinal}.${ext}`, got.buffer, mime, env);
    return {
      ...base, sourceUrl: c.source, publicUrl: url, bytes: got.bytes,
      width: c.width, height: c.height, mime, ok: true,
    };
  }
  return { ...base, note: 'ALL_RENDITIONS_OVER_1MB' };
}

/* ─── Video ─────────────────────────────────────────────────────────────── */

/**
 * ffmpeg là tuỳ chọn: lấy theo FFMPEG_PATH → gói `ffmpeg-static` nếu có → `ffmpeg`
 * trên PATH. Không có thì KHÔNG ném lỗi — trả null để tick chuyển bài sang
 * NEEDS_TRANSCODE, người vận hành đọc dashboard là biết phải làm gì.
 */
function resolveFfmpeg(env: SocialEnv): string | null {
  if (env.FFMPEG_PATH?.trim()) return env.FFMPEG_PATH.trim();
  try {
    const req = createRequire(import.meta.url);
    const bin = req('ffmpeg-static');
    if (typeof bin === 'string' && bin) return bin;
  } catch { /* chưa cài — bình thường */ }
  return process.env.VERCEL ? null : 'ffmpeg';
}

/**
 * Ép video xuống ~45MB (chừa 5MB an toàn dưới trần 50MB của Zalo).
 * Một pass với bitrate tính ngược từ thời lượng + `-maxrate` để không vọt.
 * Trần 200s để còn chỗ cho phần còn lại của request trong 300s của Vercel.
 */
async function transcode(input: Buffer, durationSec: number, env: SocialEnv): Promise<Buffer | null> {
  const bin = resolveFfmpeg(env);
  if (!bin) return null;
  const dur = durationSec > 0 ? durationSec : 60;
  const targetKbps = Math.max(300, Math.floor((45 * 8192) / dur) - 128);

  const dir = await mkdtemp(path.join(tmpdir(), 'social-'));
  const inFile = path.join(dir, 'in.mp4');
  const outFile = path.join(dir, 'out.mp4');
  try {
    await writeFile(inFile, input);
    const args = [
      '-y', '-i', inFile,
      '-c:v', 'libx264', '-preset', 'veryfast',
      '-b:v', `${targetKbps}k`, '-maxrate', `${targetKbps}k`, '-bufsize', `${targetKbps * 2}k`,
      '-vf', 'scale=-2:min(720\\,ih)',
      '-c:a', 'aac', '-b:a', '128k',
      '-movflags', '+faststart',
      outFile,
    ];
    const code = await new Promise<number>((resolve) => {
      const ps = spawn(bin, args, { stdio: 'ignore' });
      const timer = setTimeout(() => ps.kill('SIGKILL'), 200_000);
      ps.on('close', c => { clearTimeout(timer); resolve(c ?? -1); });
      ps.on('error', () => { clearTimeout(timer); resolve(-1); });
    });
    if (code !== 0) return null;
    const out = await readFile(outFile);
    return out.length <= ZALO_VIDEO_MAX_BYTES ? out : null;
  } catch {
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

async function stageVideo(videoId: string, fbPostId: string, env: SocialEnv): Promise<{
  assets: AssetDraft[]; needsTranscode: boolean;
}> {
  const v = await fbGraph<Record<string, any>>(
    videoId, { fields: 'id,source,length,picture,permalink_url' }, env,
  );
  const duration = Number(v.length) || 0;
  const base: AssetDraft = {
    kind: 'video', ordinal: 0, sourceUrl: v.source ? String(v.source) : null, publicUrl: null,
    bytes: null, width: null, height: null, durationSec: duration || null,
    mime: 'video/mp4', ok: false, note: null,
  };
  const assets: AssetDraft[] = [];

  // Thumbnail cho `avatar` của bài viết dạng video — Zalo bắt buộc có.
  if (v.picture) {
    const thumb = await fetchBinary(String(v.picture), ZALO_IMAGE_MAX_BYTES, 45_000);
    if (thumb.ok && thumb.buffer) {
      const url = await r2Put(`social/${fbPostId}/thumb.jpg`, thumb.buffer, 'image/jpeg', env);
      assets.push({
        kind: 'thumb', ordinal: 0, sourceUrl: String(v.picture), publicUrl: url,
        bytes: thumb.bytes, width: null, height: null, durationSec: null,
        mime: 'image/jpeg', ok: true, note: null,
      });
    }
  }

  // Meta đã siết field `source` nhiều lần — đây là chỗ duy nhất phát hiện ra,
  // và là câu trả lời cho ô 🔴 đầu tiên ở M8_2 §8.
  if (!v.source) {
    assets.push({ ...base, note: 'FB_SOURCE_FIELD_MISSING' });
    return { assets, needsTranscode: false };
  }

  const got = await fetchBinary(String(v.source), ZALO_VIDEO_MAX_BYTES, 180_000);
  if (got.ok && got.buffer) {
    const url = await r2Put(`social/${fbPostId}/video.mp4`, got.buffer, 'video/mp4', env);
    assets.push({ ...base, publicUrl: url, bytes: got.bytes, ok: true });
    return { assets, needsTranscode: false };
  }
  if (got.reason !== 'TOO_LARGE') {
    assets.push({ ...base, note: `DOWNLOAD_${got.reason ?? 'FAILED'}` });
    return { assets, needsTranscode: false };
  }

  // >50MB: tải bản đầy đủ (trần 400MB để không giết RAM) rồi ép xuống.
  const full = await fetchBinary(String(v.source), 400 * 1_048_576, 240_000);
  if (!full.ok || !full.buffer) {
    assets.push({ ...base, bytes: got.bytes, note: 'TOO_LARGE_AND_UNFETCHABLE' });
    return { assets, needsTranscode: false };
  }
  const shrunk = await transcode(full.buffer, duration, env);
  if (!shrunk) {
    assets.push({ ...base, bytes: full.bytes, note: 'NEEDS_TRANSCODE_NO_FFMPEG' });
    return { assets, needsTranscode: true };
  }
  const url = await r2Put(`social/${fbPostId}/video.mp4`, shrunk, 'video/mp4', env);
  assets.push({ ...base, publicUrl: url, bytes: shrunk.length, ok: true, note: `TRANSCODED_FROM_${full.bytes}` });
  return { assets, needsTranscode: false };
}

/* ─── Điểm vào duy nhất ─────────────────────────────────────────────────── */

export async function collectMedia(
  fbPostId: string, detail: PostDetail, env: SocialEnv,
): Promise<MediaResult> {
  const assets: AssetDraft[] = [];
  let needsTranscode = false;

  try {
    if (detail.videoId) {
      const r = await stageVideo(detail.videoId, fbPostId, env);
      assets.push(...r.assets);
      needsTranscode = r.needsTranscode;
    }

    // Tối đa 8 ảnh — bài viết Zalo dài hơn thế là không ai đọc hết.
    const ids = detail.photoIds.slice(0, 8);
    for (let i = 0; i < ids.length; i += 1) {
      const sizes = await renditions(ids[i], env);
      if (sizes.length) assets.push(await stageImage(sizes, i, fbPostId, env));
    }

    // Không nhặt được ảnh nào qua photo id thì dùng full_picture làm cover.
    if (!assets.some(a => a.kind === 'image') && !detail.videoId && detail.fallbackImage) {
      assets.push(await stageImage(
        [{ source: detail.fallbackImage, width: 1200, height: 630 }], 0, fbPostId, env,
      ));
    }
    return { assets, needsTranscode, fatal: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'UNKNOWN';
    // R2 chưa cấu hình là lỗi cấu hình, không phải lỗi của bài — tick phải phân biệt
    // để không đốt hết 5 lượt attempt của mọi bài trong hàng đợi.
    if (message === 'R2_NOT_CONFIGURED' || message === 'FB_PAGE_NOT_CONFIGURED') {
      return { assets, needsTranscode, fatal: message };
    }
    throw error;
  }
}
