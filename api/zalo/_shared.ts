import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import postgres from 'postgres';

export interface ZaloEnv extends NodeJS.ProcessEnv {
  DATABASE_URL?: string;
  ZALO_APP_ID?: string;
  ZALO_APP_SECRET_KEY?: string;
  ZALO_OA_ID?: string;
  ZALO_OA_SECRET_KEY?: string;
  ZALO_TOKEN_ENCRYPTION_KEY?: string;
  ZALO_USER_HASH_KEY?: string;
  ZALO_OA_ACCESS_TOKEN?: string;
  ZALO_OA_REFRESH_TOKEN?: string;
  CRON_SECRET?: string;
}

export type Sql = ReturnType<typeof postgres>;
let sqlClient: Sql | undefined;

export const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });

export function getSql(env: ZaloEnv = process.env): Sql {
  const url = env.DATABASE_URL?.trim();
  if (!url) throw new Error('DATABASE_URL_NOT_CONFIGURED');
  if (!sqlClient) {
    sqlClient = postgres(url, {
      max: 1,
      prepare: false,
      idle_timeout: 20,
      connect_timeout: 10,
      ssl: /localhost|127\.0\.0\.1/.test(url) ? false : 'require',
    });
  }
  return sqlClient;
}

const base64url = (value: Buffer) => value.toString('base64url');
const fromBase64url = (value: string) => Buffer.from(value, 'base64url');

function encryptionKey(env: ZaloEnv): Buffer {
  const raw = env.ZALO_TOKEN_ENCRYPTION_KEY?.trim() ?? '';
  if (!raw) throw new Error('ZALO_TOKEN_ENCRYPTION_KEY_NOT_CONFIGURED');
  const decoded = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  if (decoded.length !== 32) throw new Error('ZALO_TOKEN_ENCRYPTION_KEY_MUST_BE_32_BYTES');
  return decoded;
}

export function encryptToken(value: string, env: ZaloEnv): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(env), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return ['v1', base64url(iv), base64url(cipher.getAuthTag()), base64url(encrypted)].join('.');
}

export function decryptToken(value: string, env: ZaloEnv): string {
  const [version, iv, tag, encrypted] = value.split('.');
  if (version !== 'v1' || !iv || !tag || !encrypted) throw new Error('TOKEN_CIPHERTEXT_INVALID');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(env), fromBase64url(iv));
  decipher.setAuthTag(fromBase64url(tag));
  return Buffer.concat([decipher.update(fromBase64url(encrypted)), decipher.final()]).toString('utf8');
}

const safeEqual = (left: string, right: string): boolean => {
  const a = Buffer.from(left.toLowerCase());
  const b = Buffer.from(right.toLowerCase());
  return a.length === b.length && timingSafeEqual(a, b);
};

export function verifyWebhookSignature(rawBody: string, payload: Record<string, unknown>, signature: string | null, env: ZaloEnv): boolean {
  const appId = String(payload.app_id ?? '');
  const timestamp = String(payload.timestamp ?? '');
  const secret = env.ZALO_OA_SECRET_KEY?.trim() ?? '';
  if (!appId || !timestamp || !secret || !signature) return false;
  if (env.ZALO_APP_ID && appId !== env.ZALO_APP_ID) return false;
  const supplied = signature.replace(/^mac=/i, '').trim();
  const expected = createHash('sha256').update(`${appId}${rawBody}${timestamp}${secret}`, 'utf8').digest('hex');
  return safeEqual(supplied, expected);
}

export function hashUser(userId: string, env: ZaloEnv): string | null {
  if (!userId) return null;
  const key = env.ZALO_USER_HASH_KEY?.trim();
  if (!key) throw new Error('ZALO_USER_HASH_KEY_NOT_CONFIGURED');
  return createHmac('sha256', key).update(userId).digest('hex');
}

export function ictDate(value = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(value);
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function eventDate(timestamp: unknown): { at: Date; date: string } {
  let n = Number(timestamp);
  if (!Number.isFinite(n)) n = Date.now();
  if (n < 10_000_000_000) n *= 1000;
  const at = new Date(n);
  if (Number.isNaN(at.getTime())) throw new Error('WEBHOOK_TIMESTAMP_INVALID');
  return { at, date: ictDate(at) };
}

const KNOWN_MESSAGE_TYPES = new Set(['text', 'image', 'audio', 'video', 'file', 'sticker', 'gif', 'location', 'link']);

const FOLLOW_EVENTS = new Set(['follow', 'unfollow']);

export function classifyEvent(eventName: string) {
  if (FOLLOW_EVENTS.has(eventName)) return { direction: 'system', messageType: eventName } as const;
  const direction = eventName.startsWith('user_send_')
    ? 'incoming'
    : eventName.startsWith('oa_send_') ? 'outgoing' : 'system';
  const suffix = eventName.replace(/^(user|oa)_send_/, '').split('_')[0];
  return { direction, messageType: KNOWN_MESSAGE_TYPES.has(suffix) ? suffix : direction === 'system' ? 'system' : 'other' } as const;
}

const asObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

export function normalizeWebhook(payload: Record<string, unknown>, env: ZaloEnv) {
  const eventName = String(payload.event_name ?? '').trim();
  if (!eventName) throw new Error('WEBHOOK_EVENT_NAME_REQUIRED');
  const sender = asObject(payload.sender);
  const recipient = asObject(payload.recipient);
  const message = asObject(payload.message);
  const { direction, messageType } = classifyEvent(eventName);
  // follow/unfollow không có sender/recipient: payload mang `oa_id` + `follower.id`.
  const isFollow = FOLLOW_EVENTS.has(eventName);
  const oaId = isFollow
    ? String(payload.oa_id ?? recipient.id ?? '')
    : direction === 'outgoing' ? String(sender.id ?? '') : String(recipient.id ?? '');
  if (!oaId || (env.ZALO_OA_ID && oaId !== env.ZALO_OA_ID)) throw new Error('WEBHOOK_OA_ID_INVALID');
  const userId = isFollow
    ? String(asObject(payload.follower).id ?? sender.id ?? '')
    : direction === 'outgoing' ? String(recipient.id ?? '') : String(sender.id ?? '');
  const messageId = String(message.msg_id ?? '').trim();
  const { at, date } = eventDate(payload.timestamp);
  const stable = messageId || createHash('sha256').update(JSON.stringify(payload)).digest('hex');

  return {
    oaId,
    eventKey: `${eventName}:${stable}`,
    eventName,
    eventTime: at.toISOString(),
    eventDate: date,
    direction,
    userHash: hashUser(userId, env),
    messageId: messageId || null,
    messageType,
    // Không lưu nội dung text, URL, attachment hoặc Zalo user id.
    payload: {
      app_id: String(payload.app_id ?? ''),
      event_name: eventName,
      timestamp: String(payload.timestamp ?? ''),
      has_message: Object.keys(message).length > 0,
    },
  };
}

export function requireCron(req: Request, env: ZaloEnv): boolean {
  const secret = env.CRON_SECRET?.trim();
  if (!secret) return false;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

export async function validAccessToken(sql: Sql, oaId: string, env: ZaloEnv): Promise<string> {
  return sql.begin(async tx => {
    await tx`select pg_advisory_xact_lock(hashtext(${`zalo-token:${oaId}`}))`;
    let [row] = await tx<{
      access_token_encrypted: string;
      refresh_token_encrypted: string | null;
      access_expires_at: Date | null;
    }[]>`select access_token_encrypted, refresh_token_encrypted, access_expires_at
        from zalo_oa_token where oa_id = ${oaId}`;

    if (!row) {
      const access = env.ZALO_OA_ACCESS_TOKEN?.trim();
      if (!access) throw new Error('ZALO_OA_ACCESS_TOKEN_NOT_CONFIGURED');
      const refresh = env.ZALO_OA_REFRESH_TOKEN?.trim() || null;
      [row] = await tx<{
        access_token_encrypted: string;
        refresh_token_encrypted: string | null;
        access_expires_at: Date | null;
      }[]>`insert into zalo_oa_token (
          oa_id, access_token_encrypted, refresh_token_encrypted, access_expires_at, refresh_expires_at
        ) values (
          ${oaId}, ${encryptToken(access, env)}, ${refresh ? encryptToken(refresh, env) : null},
          ${refresh ? tx`now() - interval '1 second'` : tx`now() + interval '30 minutes'`},
          ${refresh ? tx`now() + interval '89 days'` : null}
        ) returning access_token_encrypted, refresh_token_encrypted, access_expires_at`;
    }

    if (row.access_expires_at && row.access_expires_at.getTime() > Date.now() + 5 * 60_000) {
      return decryptToken(row.access_token_encrypted, env);
    }
    if (!row.refresh_token_encrypted) return decryptToken(row.access_token_encrypted, env);

    const appId = env.ZALO_APP_ID?.trim();
    const appSecret = env.ZALO_APP_SECRET_KEY?.trim();
    if (!appId || !appSecret) throw new Error('ZALO_APP_CREDENTIALS_NOT_CONFIGURED');

    const body = new URLSearchParams({
      refresh_token: decryptToken(row.refresh_token_encrypted, env),
      app_id: appId,
      grant_type: 'refresh_token',
    });
    const response = await fetch('https://oauth.zaloapp.com/v4/oa/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        secret_key: appSecret,
      },
      body,
      signal: AbortSignal.timeout(12_000),
    });
    const result = await response.json() as Record<string, unknown>;
    const access = String(result.access_token ?? '');
    const refresh = String(result.refresh_token ?? '');
    if (!response.ok || !access || !refresh) {
      throw new Error(`ZALO_TOKEN_REFRESH_FAILED:${String(result.message ?? response.status)}`);
    }
    const expiresIn = Math.max(300, Number(result.expires_in) || 90_000);
    await tx`update zalo_oa_token set
      access_token_encrypted = ${encryptToken(access, env)},
      refresh_token_encrypted = ${encryptToken(refresh, env)},
      access_expires_at = now() + (${expiresIn} * interval '1 second'),
      refresh_expires_at = now() + interval '89 days', updated_at = now()
      where oa_id = ${oaId}`;
    return access;
  });
}
