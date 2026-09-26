import { createHmac, timingSafeEqual } from 'node:crypto';
// getSql/json dùng chung với M8.1: cùng một DATABASE_URL, và khi chạy Vite dev
// cả hai module nằm trong một tiến trình nên phải dùng chung một pool.
import { getSql, json, type Sql } from '../zalo/_shared.js';

export { getSql, json };
export type { Sql };

export interface IposEnv extends NodeJS.ProcessEnv {
  DATABASE_URL?: string;
  IPOS_API_URL?: string;
  IPOS_APP_KEY?: string;
  IPOS_PARTNER_ACCESS_TOKEN?: string;
  IPOS_BRAND?: string;
  IPOS_WEBHOOK_SECRET?: string;
  PHONE_HASH_KEY?: string;
  CRON_SECRET?: string;
}

const DEFAULT_API = 'https://booking.ipos.vn/api';

/**
 * Tài liệu iPOS không nhất quán tên header: chỗ `access-token`, chỗ `access_token`,
 * có endpoint gửi cả `token`.
 *
 * ⚠ KHÔNG gửi cả ba cùng lúc. iPOS chuẩn hoá `_` ↔ `-` nên `access-token` và
 * `access_token` gộp thành một giá trị nối đôi → 401 "Định dạng partner_key không hợp lệ".
 * Đo trên production 26/09/2026: gửi riêng từng cái đều 200. Vì vậy gửi MỘT header,
 * gặp 401/403 mới thử tên kế tiếp.
 */
const HEADER_NAMES = ['access-token', 'access_token', 'token'] as const;

export function partnerToken(env: IposEnv): string {
  // Khoá ứng dụng dùng luôn được làm partner access token (đo 26/09/2026).
  const token = env.IPOS_PARTNER_ACCESS_TOKEN?.trim() || env.IPOS_APP_KEY?.trim();
  if (!token) throw new Error('IPOS_TOKEN_NOT_CONFIGURED');
  return token;
}

export async function iposCall<T>(
  route: string,
  { method = 'GET', body, env = process.env as IposEnv }: {
    method?: 'GET' | 'POST' | 'PUT';
    body?: unknown;
    env?: IposEnv;
  } = {},
): Promise<T> {
  const base = (env.IPOS_API_URL?.trim() || DEFAULT_API).replace(/\/+$/, '');
  const token = partnerToken(env);
  const payload = body === undefined ? undefined : JSON.stringify(body);
  let lastError = 'IPOS_UNAUTHORIZED';

  for (const name of HEADER_NAMES) {
    const res = await fetch(`${base}${route}`, {
      method,
      headers: { [name]: token, ...(payload ? { 'Content-Type': 'application/json' } : {}) },
      ...(payload ? { body: payload } : {}),
    });
    const text = await res.text();
    let parsed: { data?: T; error?: number; message?: string };
    try {
      parsed = JSON.parse(text) as typeof parsed;
    } catch {
      throw new Error(`IPOS_BAD_JSON: HTTP ${res.status} ${text.slice(0, 160)}`);
    }
    if (res.status === 401 || res.status === 403) {
      lastError = `IPOS_UNAUTHORIZED: ${parsed.message ?? res.status} (header "${name}")`;
      continue;
    }
    if (!res.ok) throw new Error(`IPOS_HTTP_${res.status}: ${parsed.message ?? text.slice(0, 160)}`);
    if (parsed.error) throw new Error(`IPOS_ERROR_${parsed.error}: ${parsed.message ?? ''}`);
    return parsed.data as T;
  }
  throw new Error(lastError);
}

// ─── thời gian ──────────────────────────────────────────────────────────────
// Mọi mốc iPOS là unix giây. `meal_day` = 00:00 UTC của NGÀY PHỤC VỤ theo giờ
// địa phương, nên đọc nó bằng các hàm UTC; `created_at`/`meal_start_*` là mốc thật.
const ICT_OFFSET = 7 * 3600;

export const tsToDate = (value: unknown): Date | null => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000) : null;
};

/** 00:00 UTC của ngày địa phương hiện tại — đúng quy ước `meal_day` của iPOS. */
export function localDayStart(seconds = Math.floor(Date.now() / 1000)): number {
  const d = new Date((seconds + ICT_OFFSET) * 1000);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 1000;
}

/** `meal_day` unix → 'YYYY-MM-DD' (đọc bằng UTC, xem ghi chú trên). */
export function mealDayString(value: unknown): string | null {
  const d = tsToDate(value);
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}

// ─── số điện thoại ──────────────────────────────────────────────────────────
/**
 * Chuẩn hoá về dạng nội địa 0xxxxxxxxx TRƯỚC khi băm, để cùng một thuê bao
 * ghi trong iPOS (`84367036699`) và trong hoá đơn POS (`0367036699`) ra cùng hash.
 */
export function normalizePhone(raw: string): string {
  let digits = String(raw ?? '').replace(/\D/g, '');
  if (digits.startsWith('84') && digits.length >= 10) digits = `0${digits.slice(2)}`;
  if (digits && !digits.startsWith('0')) digits = `0${digits}`;
  return digits.length >= 9 ? digits : '';
}

export function hashPhone(raw: string, env: IposEnv): string | null {
  const phone = normalizePhone(raw);
  if (!phone) return null;
  const key = env.PHONE_HASH_KEY?.trim();
  if (!key) throw new Error('PHONE_HASH_KEY_NOT_CONFIGURED');
  return createHmac('sha256', key).update(phone).digest('hex');
}

// ─── webhook secret ─────────────────────────────────────────────────────────
/** Webhook iPOS KHÔNG có chữ ký → secret nằm trong query `?k=`. */
export function verifyWebhookSecret(url: string, env: IposEnv): boolean {
  const expected = env.IPOS_WEBHOOK_SECRET?.trim() ?? '';
  if (!expected) return false;
  const supplied = new URL(url).searchParams.get('k') ?? '';
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function requireCron(req: Request, env: IposEnv): boolean {
  const secret = env.CRON_SECRET?.trim();
  if (!secret) return false;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

// ─── ánh xạ đơn đặt bàn ─────────────────────────────────────────────────────
export interface IposReservationRaw {
  booking_code?: string;
  brand_code?: string;
  booking_source?: string;
  status?: string;
  created_at?: number;
  booking_confirmed_at?: number;
  meal_day?: number;
  meal_start_expected?: number;
  meal_end_expected?: number;
  meal_start_reality?: number;
  meal_end_reality?: number;
  booking_seats?: number;
  booking_adult_seats?: number;
  booking_child_seats?: number;
  deposit?: number;
  total_amount?: number;
  table_ids?: string[];
  tag_ids?: string[];
  customer_temp_phone?: string;
  booking_note?: string;
  collaborator_id?: string;
  restaurant?: { _id?: string; name?: string; reference_pos?: string };
  booking_alt?: { hub_errors?: unknown[] };
}

export interface ReservationRow {
  bookingCode: string;
  posParent: string;
  posId: string | null;
  sourceCode: string | null;
  status: string;
  createdAt: Date;
  confirmedAt: Date | null;
  mealDay: string;
  expectedStart: Date | null;
  expectedEnd: Date | null;
  realStart: Date | null;
  realEnd: Date | null;
  seats: number;
  adultSeats: number | null;
  childSeats: number | null;
  deposit: number;
  totalAmount: number;
  tableIds: string[];
  tagIds: string[];
  phoneHash: string | null;
  hasNote: boolean;
  collaboratorId: string | null;
  posPushFailed: boolean;
}

export function mapReservation(raw: IposReservationRaw, posParent: string, env: IposEnv): ReservationRow | null {
  const bookingCode = String(raw.booking_code ?? '').trim();
  const createdAt = tsToDate(raw.created_at);
  const mealDay = mealDayString(raw.meal_day);
  // Thiếu một trong ba thì bản ghi vô nghĩa với mọi chỉ số — bỏ qua, đếm vào QA.
  if (!bookingCode || !createdAt || !mealDay) return null;

  return {
    bookingCode,
    posParent: String(raw.brand_code ?? posParent),
    posId: raw.restaurant?.reference_pos ? String(raw.restaurant.reference_pos) : null,
    sourceCode: raw.booking_source ? String(raw.booking_source) : null,
    status: String(raw.status ?? 'UNKNOWN'),
    createdAt,
    confirmedAt: tsToDate(raw.booking_confirmed_at),
    mealDay,
    expectedStart: tsToDate(raw.meal_start_expected),
    expectedEnd: tsToDate(raw.meal_end_expected),
    realStart: tsToDate(raw.meal_start_reality),
    realEnd: tsToDate(raw.meal_end_reality),
    seats: Number(raw.booking_seats ?? 0) || 0,
    adultSeats: Number.isFinite(Number(raw.booking_adult_seats)) ? Number(raw.booking_adult_seats) : null,
    childSeats: Number.isFinite(Number(raw.booking_child_seats)) ? Number(raw.booking_child_seats) : null,
    deposit: Number(raw.deposit ?? 0) || 0,
    totalAmount: Number(raw.total_amount ?? 0) || 0,
    tableIds: (raw.table_ids ?? []).map(String),
    tagIds: (raw.tag_ids ?? []).map(String),
    phoneHash: hashPhone(String(raw.customer_temp_phone ?? ''), env),
    hasNote: Boolean(String(raw.booking_note ?? '').trim()),
    collaboratorId: raw.collaborator_id ? String(raw.collaborator_id) : null,
    posPushFailed: (raw.booking_alt?.hub_errors ?? []).length > 0,
  };
}

/** Upsert đơn + ghi nhật ký trạng thái. Trả về số đơn thực sự ghi. */
export async function upsertReservations(sql: Sql, rows: ReservationRow[], via: 'webhook' | 'sync'): Promise<number> {
  if (!rows.length) return 0;
  let written = 0;
  for (const r of rows) {
    await sql.begin(async tx => {
      await tx`insert into ipos_reservation (
          booking_code, pos_parent, pos_id, source_code, status, created_at, confirmed_at, meal_day,
          expected_start, expected_end, real_start, real_end, seats, adult_seats, child_seats,
          deposit, total_amount, table_ids, tag_ids, phone_hash, has_note, collaborator_id,
          pos_push_failed, synced_at
        ) values (
          ${r.bookingCode}, ${r.posParent}, ${r.posId}, ${r.sourceCode}, ${r.status}, ${r.createdAt},
          ${r.confirmedAt}, ${r.mealDay}, ${r.expectedStart}, ${r.expectedEnd}, ${r.realStart}, ${r.realEnd},
          ${r.seats}, ${r.adultSeats}, ${r.childSeats}, ${r.deposit}, ${r.totalAmount},
          ${r.tableIds}, ${r.tagIds}, ${r.phoneHash}, ${r.hasNote}, ${r.collaboratorId},
          ${r.posPushFailed}, now()
        )
        on conflict (booking_code) do update set
          pos_parent = excluded.pos_parent, pos_id = excluded.pos_id,
          source_code = excluded.source_code, status = excluded.status,
          confirmed_at = excluded.confirmed_at, meal_day = excluded.meal_day,
          expected_start = excluded.expected_start, expected_end = excluded.expected_end,
          real_start = excluded.real_start, real_end = excluded.real_end,
          seats = excluded.seats, adult_seats = excluded.adult_seats, child_seats = excluded.child_seats,
          deposit = excluded.deposit, total_amount = excluded.total_amount,
          table_ids = excluded.table_ids, tag_ids = excluded.tag_ids,
          phone_hash = excluded.phone_hash, has_note = excluded.has_note,
          collaborator_id = excluded.collaborator_id, pos_push_failed = excluded.pos_push_failed,
          synced_at = now()`;

      await tx`insert into ipos_reservation_status_log (booking_code, status, via)
        values (${r.bookingCode}, ${r.status}, ${via})
        on conflict (booking_code, status) do nothing`;

      if (r.sourceCode) {
        await tx`insert into dim_ipos_source (code) values (${r.sourceCode})
          on conflict (code) do nothing`;
      }
    });
    written += 1;
  }
  return written;
}

/** Lọc đơn theo lô. `filters` chỉ nhận created_at, KHÔNG nhận meal_day. */
export async function fetchReservations(
  posParent: string,
  criteria: { createdAt?: [number, number]; codes?: string[] },
  env: IposEnv,
): Promise<IposReservationRaw[]> {
  const out: IposReservationRaw[] = [];
  for (let page = 0; page < 200; page += 1) {
    const data = await iposCall<{ results?: IposReservationRaw[]; total?: number }>(
      '/v1/partner/reservations/filters',
      {
        method: 'POST',
        env,
        body: {
          pos_parent: posParent,
          tag_ids: [], phones: [], customers: [], sources: [], ips: [], status: [],
          codes: criteria.codes ?? [],
          ...(criteria.createdAt ? { created_at: criteria.createdAt } : {}),
          page_size: 500,
          page_index: page,
        },
      },
    );
    const batch = data?.results ?? [];
    out.push(...batch);
    if (!batch.length || out.length >= (data?.total ?? 0)) break;
  }
  return out;
}

/** Brand đang kết nối. Rỗng = app chưa được brand nào duyệt. */
export async function connectedBrands(env: IposEnv): Promise<string[]> {
  const configured = (env.IPOS_BRAND ?? '').split(',').map(s => s.trim()).filter(Boolean);
  if (configured.length) return configured;
  const data = await iposCall<Array<{ code?: string; pos_parent?: string }>>('/v1/partner/brands', { env });
  return (data ?? []).map(b => b.code ?? b.pos_parent ?? '').filter(Boolean);
}
