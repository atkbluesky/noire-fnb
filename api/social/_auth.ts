import { json, type SocialEnv } from './_shared.js';
import {
  clearSocialLoginFailures, createSocialSession, deleteSocialSession,
  requireSocialSession, sessionCookie, socialAuthConfigured, socialLoginBlocked,
  recordSocialLoginFailure, validSocialMutationRequest, verifySocialPassword,
  socialOriginSecure,
} from './_session.js';

export async function handleSocialAuth(req: Request, env: SocialEnv = process.env): Promise<Response> {
  if (!['GET', 'POST', 'DELETE'].includes(req.method)) return json(405, { ok: false, error: 'Chỉ nhận GET/POST/DELETE' });
  if (!socialOriginSecure(req)) return json(403, { ok: false, error: 'M6.2 yêu cầu HTTPS' });
  if (!socialAuthConfigured(env)) {
    return json(503, { ok: false, code: 'AUTH_NOT_CONFIGURED', error: 'Chưa cấu hình đăng nhập M6.2' });
  }
  if (req.method !== 'GET' && !validSocialMutationRequest(req)) {
    return json(403, { ok: false, error: 'Yêu cầu không cùng nguồn gốc' });
  }

  try {
    if (req.method === 'GET') {
      return json(200, { ok: true, authenticated: await requireSocialSession(req, env) });
    }
    if (req.method === 'DELETE') {
      await deleteSocialSession(req, env);
      const response = json(200, { ok: true });
      response.headers.set('Set-Cookie', sessionCookie(req, null));
      return response;
    }
    if (await socialLoginBlocked(req, env)) {
      return json(429, { ok: false, error: 'Đã thử quá nhiều lần. Vui lòng đợi 15 phút.' });
    }
    let body: Record<string, unknown>;
    try { body = await req.json() as Record<string, unknown>; }
    catch { return json(400, { ok: false, error: 'Body không phải JSON' }); }
    const password = typeof body.password === 'string' ? body.password : '';
    if (!await verifySocialPassword(password, env)) {
      await recordSocialLoginFailure(req, env);
      return json(401, { ok: false, error: 'Mật khẩu không đúng' });
    }
    const cookie = await createSocialSession(req, env);
    await clearSocialLoginFailures(req, env);
    const response = json(200, { ok: true, authenticated: true });
    response.headers.set('Set-Cookie', cookie);
    return response;
  } catch (error) {
    console.error('[social-auth]', error);
    return json(503, { ok: false, error: 'Không xác thực được M6.2' });
  }
}

export const GET = (req: Request) => handleSocialAuth(req, process.env);
export const POST = (req: Request) => handleSocialAuth(req, process.env);
export const DELETE = (req: Request) => handleSocialAuth(req, process.env);
