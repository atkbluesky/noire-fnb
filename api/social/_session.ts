import { createHash, createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { getSql, type SocialEnv } from './_shared.js';

const SESSION_SECONDS = 4 * 60 * 60;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const SCRYPT_OPTIONS = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

export function socialOriginSecure(req: Request): boolean {
  const url = new URL(req.url);
  return url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
}

function configuredHash(env: SocialEnv): string | null {
  const value = env.SOCIAL_ADMIN_PASSWORD_HASH?.trim() ?? '';
  const parts = value.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return null;
  const [, salt, digest] = parts;
  if (Buffer.from(salt, 'base64url').length < 16 || Buffer.from(digest, 'base64url').length !== 64) return null;
  return value;
}

export const socialAuthConfigured = (env: SocialEnv): boolean => Boolean(configuredHash(env) && env.DATABASE_URL?.trim());

export async function verifySocialPassword(password: string, env: SocialEnv): Promise<boolean> {
  const stored = configuredHash(env);
  if (!stored || password.length < 16 || password.length > 256) return false;
  const [, salt, digest] = stored.split('$');
  const expected = Buffer.from(digest, 'base64url');
  const actual = await new Promise<Buffer>((resolve, reject) => {
    scryptCallback(password, Buffer.from(salt, 'base64url'), expected.length, SCRYPT_OPTIONS,
      (error, derived) => error ? reject(error) : resolve(derived));
  });
  return timingSafeEqual(actual, expected);
}

function cookieName(req: Request): string {
  return new URL(req.url).protocol === 'https:' ? '__Host-noire-social' : 'noire-social-local';
}

function cookieToken(req: Request): string | null {
  const name = cookieName(req);
  const pair = (req.headers.get('cookie') ?? '').split(';').map(x => x.trim()).find(x => x.startsWith(`${name}=`));
  const token = pair?.slice(name.length + 1) ?? '';
  return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}

export function sessionCookie(req: Request, token: string | null): string {
  const secure = new URL(req.url).protocol === 'https:';
  return `${cookieName(req)}=${token ?? ''}; Path=/; HttpOnly; SameSite=Strict; ${secure ? 'Secure; ' : ''}Max-Age=${token ? SESSION_SECONDS : 0}`;
}

export function validSocialMutationRequest(req: Request): boolean {
  const origin = req.headers.get('origin');
  const fetchSite = req.headers.get('sec-fetch-site');
  return origin === new URL(req.url).origin
    && (!fetchSite || fetchSite === 'same-origin')
    && req.headers.get('x-social-action') === '1';
}

export async function requireSocialSession(req: Request, env: SocialEnv): Promise<boolean> {
  if (!socialOriginSecure(req)) return false;
  const token = cookieToken(req);
  const credential = configuredHash(env);
  if (!token || !credential) return false;
  const sql = getSql(env);
  const rows = await sql<Array<{ ok: boolean }>>`
    select true as ok from social_admin_session
    where token_hash = ${sha256(token)} and credential_tag = ${sha256(credential)}
      and expires_at > now() limit 1`;
  return rows.length === 1;
}

export async function createSocialSession(req: Request, env: SocialEnv): Promise<string> {
  const credential = configuredHash(env);
  if (!credential) throw new Error('SOCIAL_ADMIN_PASSWORD_HASH_NOT_CONFIGURED');
  const token = randomBytes(32).toString('base64url');
  const sql = getSql(env);
  await deleteSocialSession(req, env);
  await sql`delete from social_admin_session where expires_at <= now()`;
  await sql`insert into social_admin_session (token_hash, credential_tag, expires_at)
    values (${sha256(token)}, ${sha256(credential)}, now() + (${SESSION_SECONDS} * interval '1 second'))`;
  return sessionCookie(req, token);
}

export async function deleteSocialSession(req: Request, env: SocialEnv): Promise<void> {
  const token = cookieToken(req);
  if (token && env.DATABASE_URL?.trim()) {
    await getSql(env)`delete from social_admin_session where token_hash = ${sha256(token)}`;
  }
}

function clientKey(req: Request, env: SocialEnv): string {
  const address = req.headers.get('x-real-ip') || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const key = configuredHash(env) ?? '';
  return createHmac('sha256', key).update(address).digest('hex');
}

export async function socialLoginBlocked(req: Request, env: SocialEnv): Promise<boolean> {
  const rows = await getSql(env)<Array<{ blocked_until: Date | null }>>`
    select blocked_until from social_auth_attempt where client_key = ${clientKey(req, env)}`;
  return Boolean(rows[0]?.blocked_until && new Date(rows[0].blocked_until).getTime() > Date.now());
}

export async function recordSocialLoginFailure(req: Request, env: SocialEnv): Promise<void> {
  const key = clientKey(req, env);
  const sql = getSql(env);
  await sql.begin(async tx => {
    await tx`insert into social_auth_attempt (client_key) values (${key}) on conflict do nothing`;
    const [row] = await tx<[{ attempts: number; window_start: Date }]>`
      select attempts, window_start from social_auth_attempt where client_key = ${key} for update`;
    const withinWindow = Date.now() - new Date(row.window_start).getTime() < ATTEMPT_WINDOW_MS;
    const attempts = withinWindow ? row.attempts + 1 : 1;
    await tx`update social_auth_attempt set attempts = ${attempts},
      window_start = ${withinWindow ? row.window_start : new Date()},
      blocked_until = ${attempts >= MAX_ATTEMPTS ? new Date(Date.now() + ATTEMPT_WINDOW_MS) : null}
      where client_key = ${key}`;
  });
}

export async function clearSocialLoginFailures(req: Request, env: SocialEnv): Promise<void> {
  await getSql(env)`delete from social_auth_attempt where client_key = ${clientKey(req, env)}`;
}
