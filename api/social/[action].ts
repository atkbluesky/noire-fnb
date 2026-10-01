/**
 * M6.2 · MỘT Vercel Function cho mọi endpoint /api/social/<action>.
 *
 * Gói Hobby chỉ cho 12 Serverless Function mỗi deployment — 5 file social riêng đẩy repo lên 14
 * và làm hỏng build ("No more than 12 Serverless Functions…", 28/09/2026). Handler vẫn nằm ở
 * từng file `_<action>.ts` (tiền tố `_` = Vercel không coi là function); file này chỉ rẽ nhánh
 * theo đoạn cuối URL, nên URL, cron `/api/social/reconcile` và webhook Facebook KHÔNG đổi.
 */
import { json } from './_shared.js';
import * as auth from './_auth.js';
import * as performance from './_performance.js';
import * as reconcile from './_reconcile.js';
import * as review from './_review.js';
import * as tick from './_tick.js';
import * as webhookFb from './_webhook-fb.js';

type Handler = (req: Request) => Response | Promise<Response>;
type Route = { GET?: Handler; POST?: Handler; DELETE?: Handler };

const ROUTES: Record<string, Route> = {
  auth, performance, reconcile, review, tick, 'webhook-fb': webhookFb,
};

function dispatch(req: Request): Response | Promise<Response> {
  const action = new URL(req.url).pathname.replace(/\/+$/, '').split('/').pop() ?? '';
  const route = Object.hasOwn(ROUTES, action) ? ROUTES[action] : undefined;
  if (!route) return json(404, { ok: false, error: 'Không có endpoint này' });
  const handler = route[req.method as 'GET' | 'POST' | 'DELETE'];
  return handler ? handler(req) : json(405, { ok: false, error: 'Sai phương thức' });
}

export const GET = dispatch;
export const POST = dispatch;
export const DELETE = dispatch;
