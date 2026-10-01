/**
 * M6.2 · Router điều phối Serverless Function duy nhất cho Social Auto.
 *
 * Lý do: Vercel gói Hobby giới hạn tối đa 12 Serverless Functions trên toàn dự án.
 * Bằng cách gom các endpoint /api/social/* vào 1 router động duy nhất [route].ts,
 * số lượng functions giảm từ 15 xuống 10 (thỏa mãn < 12) mà KHÔNG xóa bất kỳ logic
 * hay tính năng nào.
 *
 * Các route hỗ trợ:
 * - /api/social/auth         -> handleSocialAuth
 * - /api/social/performance  -> handleSocialPerformance
 * - /api/social/reconcile    -> handleSocialReconcile
 * - /api/social/review       -> handleSocialReview
 * - /api/social/tick         -> handleSocialTick
 * - /api/social/webhook-fb   -> handleSocialWebhookFb
 */
import { json, type SocialEnv } from './_shared.js';
import { handleSocialAuth } from './_authRoute.js';
import { handleSocialPerformance } from './_performanceRoute.js';
import { handleSocialReconcile } from './_reconcileRoute.js';
import { handleSocialReview } from './_reviewRoute.js';
import { handleSocialTick } from './_tickRoute.js';
import { handleSocialWebhookFb } from './_webhookFbRoute.js';

function extractRoute(req: Request): string {
  try {
    const url = new URL(req.url, 'http://localhost');
    const segments = url.pathname.split('/').filter(Boolean);
    const idx = segments.indexOf('social');
    if (idx !== -1 && idx + 1 < segments.length) {
      return segments[idx + 1];
    }
    return url.searchParams.get('route') || segments[segments.length - 1] || '';
  } catch {
    return '';
  }
}

export async function handleSocialRoute(req: Request, env: SocialEnv = process.env): Promise<Response> {
  const route = extractRoute(req);

  switch (route) {
    case 'auth':
      return handleSocialAuth(req, env);
    case 'performance':
      return handleSocialPerformance(req, env);
    case 'reconcile':
      return handleSocialReconcile(req, env);
    case 'review':
      return handleSocialReview(req, env);
    case 'tick':
      return handleSocialTick(req, env);
    case 'webhook-fb':
      return handleSocialWebhookFb(req, env);
    default:
      return json(404, { ok: false, error: `Route /api/social/${route} không tồn tại` });
  }
}

export const GET = (req: Request) => handleSocialRoute(req, process.env);
export const POST = (req: Request) => handleSocialRoute(req, process.env);
export const DELETE = (req: Request) => handleSocialRoute(req, process.env);
export const PUT = (req: Request) => handleSocialRoute(req, process.env);
