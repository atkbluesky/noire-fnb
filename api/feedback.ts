/**
 * ════════════════════════════════════════════════════════════════════════════
 * NOIRE ANALYTICS HUB — CỔNG TRUNG GIAN GỬI Ý KIẾN ĐÓNG GÓP LÊN GOOGLE SHEETS
 * ════════════════════════════════════════════════════════════════════════════
 *
 *   Trình duyệt ──POST /api/feedback──▶ [cổng này] ──kèm mã bí mật──▶ Apps Script ──▶ Sheet
 *
 * Vì sao cần cổng: mọi thứ nằm trong src/ (kể cả biến VITE_*) đều bị đóng gói vào
 * file JS công khai. Đặt URL Apps Script + mã bí mật ở đó là ai mở DevTools cũng
 * lấy được và ghi thẳng vào Sheet. Ở đây hai giá trị đó chỉ tồn tại trong biến môi
 * trường PHÍA SERVER — FEEDBACK_WEBHOOK_URL · FEEDBACK_SECRET (không có tiền tố VITE_).
 *
 * Cổng còn là chốt kiểm tra đầu vào: chỉ nhận request cùng domain, giới hạn tần
 * suất theo IP, ép mọi trường về chuỗi có giới hạn độ dài và bỏ trường lạ.
 *
 * Chạy ở đâu:
 *   - Vercel: file trong api/ tự thành Function (chữ ký Web: Request → Response).
 *   - `npm run dev` / `vite preview`: vite.config.ts gắn `handleFeedback` vào dev server.
 *
 * Cấu hình: docs/60_HUONG_DAN_FEEDBACK_GOOGLE_SHEET.md
 * ──────────────────────────────────────────────────────────────────────────── */

export interface FeedbackEnv {
  FEEDBACK_WEBHOOK_URL?: string;
  FEEDBACK_SECRET?: string;
}

/* ─── 1. GIỚI HẠN ─────────────────────────────────────────────────────────── */

const LIMITS = {
  /** Thân request tối đa — 20 bản ghi × 5.000 ký tự tiếng Việt (tới 3 byte/ký tự) vẫn lọt. */
  maxBodyBytes: 512_000,
  /** Khớp kích thước lô của FeedbackWidget.tsx. */
  maxItems: 20,
  maxContent: 5000,
  /** Apps Script khởi động nguội mất vài giây; để dưới hạn 10 giây của Function. */
  upstreamTimeoutMs: 9000,
  /** Mỗi IP tối đa 60 request trong 10 phút — dư cho người thật, chặn vòng lặp spam. */
  rateWindowMs: 10 * 60_000,
  rateMaxRequests: 60,
};

const CATEGORIES = new Set(['feature', 'bug', 'ui', 'other']);
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/* ─── 2. TIỆN ÍCH ─────────────────────────────────────────────────────────── */

const reply = (status: number, body: Record<string, unknown>, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });

/** Bỏ ký tự điều khiển (mã dưới 32, trừ tab và xuống dòng) và DEL — không có lý do hợp lệ để nằm trong ô Sheet. */
const stripControl = (s: string): string =>
  Array.from(s)
    .filter(ch => {
      const code = ch.charCodeAt(0);
      return code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127);
    })
    .join('');

/**
 * Chỉ nhận giá trị NGUYÊN THUỶ rồi ép về chuỗi. Mảng/đối tượng thành chuỗi rỗng —
 * chặn kiểu lách `"content": ["=IMPORTXML(...)"]` qua mặt bộ lọc công thức của
 * Apps Script vốn chỉ xét `typeof value === 'string'`.
 */
const text = (value: unknown, max: number): string =>
  typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? stripControl(String(value)).trim().slice(0, max)
    : '';

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

/** Dựng lại bản ghi theo danh sách trường cho phép — trường lạ bị bỏ. */
function cleanItem(raw: unknown) {
  const it = record(raw);
  const id = text(it.id, 64);
  const content = text(it.content, LIMITS.maxContent);
  if (!ID_PATTERN.test(id) || !content) return null;

  const category = text(it.category, 20);
  const ctx = record(it.context);
  const meta = record(it.meta);

  return {
    id,
    category: CATEGORIES.has(category) ? category : 'other',
    categoryLabel: text(it.categoryLabel, 60),
    content,
    contact: text(it.contact, 200),
    createdAt: text(it.createdAt, 40),
    createdAtISO: text(it.createdAtISO, 40),
    attempts: Math.min(Math.max(Math.trunc(Number(it.attempts)) || 0, 0), 99),
    context: {
      viewId: text(ctx.viewId, 40),
      viewCode: text(ctx.viewCode, 40),
      viewTitle: text(ctx.viewTitle, 120),
      viewGroup: text(ctx.viewGroup, 120),
      scope: text(ctx.scope, 40),
      brand: text(ctx.brand, 40),
      from: text(ctx.from, 20),
      to: text(ctx.to, 20),
      perday: ctx.perday === true,
      theme: text(ctx.theme, 20),
    },
    meta: {
      deviceId: text(meta.deviceId, 64),
      sessionId: text(meta.sessionId, 64),
      appVersion: text(meta.appVersion, 20),
      url: text(meta.url, 500),
      referrer: text(meta.referrer, 500),
      userAgent: text(meta.userAgent, 400),
      platform: text(meta.platform, 60),
      language: text(meta.language, 20),
      timezone: text(meta.timezone, 60),
      screen: text(meta.screen, 20),
      viewport: text(meta.viewport, 20),
    },
  };
}

/**
 * Chỉ nhận request phát ra từ chính trang dashboard.
 * Trình duyệt luôn gửi `Origin` với POST (kể cả sendBeacon) và không cho trang
 * khác giả mạo nó — chặn được site lạ nhúng form gửi hộ. Công cụ ngoài trình
 * duyệt (curl…) vẫn giả được header, phần đó do giới hạn tần suất lo.
 */
function isSameOrigin(req: Request): boolean {
  const site = req.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin') return false;

  const origin = req.headers.get('origin');
  const host = (req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? '').split(',')[0].trim();
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/* Bộ đếm nằm trong bộ nhớ của từng instance: Vercel tái sử dụng instance nên chặn
   được spam dồn dập, nhưng KHÔNG phải giới hạn tuyệt đối trên toàn hệ thống.
   Lớp chặn thật sự là đăng nhập trước khi vào dashboard. */
const hits = new Map<string, number[]>();

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const since = now - LIMITS.rateWindowMs;
  const recent = (hits.get(key) ?? []).filter(t => t > since);
  const limited = recent.length >= LIMITS.rateMaxRequests;
  if (!limited) recent.push(now);
  hits.set(key, recent);

  if (hits.size > 5000) {
    for (const [k, times] of hits) if (!times.some(t => t > since)) hits.delete(k);
  }
  return limited;
}

const clientIp = (req: Request): string =>
  req.headers.get('x-real-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';

/* ─── 3. XỬ LÝ REQUEST ────────────────────────────────────────────────────── */

export async function handleFeedback(req: Request, env: FeedbackEnv): Promise<Response> {
  if (req.method !== 'POST') {
    return reply(405, { ok: false, error: 'Chỉ nhận POST' }, { Allow: 'POST' });
  }
  if (!isSameOrigin(req)) {
    return reply(403, { ok: false, error: 'Nguồn gửi không hợp lệ' });
  }
  if (isRateLimited(clientIp(req))) {
    return reply(429, { ok: false, error: 'Gửi quá nhiều, vui lòng thử lại sau' }, { 'Retry-After': '600' });
  }

  const webhookUrl = (env.FEEDBACK_WEBHOOK_URL ?? '').trim();
  const secret = (env.FEEDBACK_SECRET ?? '').trim();
  if (!webhookUrl || !secret) {
    console.error('[feedback] Thiếu biến môi trường FEEDBACK_WEBHOOK_URL hoặc FEEDBACK_SECRET');
    return reply(503, { ok: false, error: 'Kho lưu trữ chưa được cấu hình' });
  }

  if (Number(req.headers.get('content-length') ?? 0) > LIMITS.maxBodyBytes) {
    return reply(413, { ok: false, error: 'Dữ liệu gửi lên quá lớn' });
  }
  const raw = await req.text();
  if (raw.length > LIMITS.maxBodyBytes) {
    return reply(413, { ok: false, error: 'Dữ liệu gửi lên quá lớn' });
  }

  let envelope: Record<string, unknown>;
  try {
    envelope = record(JSON.parse(raw));
  } catch {
    return reply(400, { ok: false, error: 'Dữ liệu không phải JSON hợp lệ' });
  }

  const input = envelope.items;
  if (!Array.isArray(input) || input.length === 0 || input.length > LIMITS.maxItems) {
    return reply(400, { ok: false, error: `Cần từ 1 đến ${LIMITS.maxItems} bản ghi` });
  }
  const items = input.map(cleanItem).filter(x => x !== null);
  const rejected = input.length - items.length;
  if (items.length === 0) {
    return reply(400, { ok: false, error: 'Không có bản ghi hợp lệ' });
  }

  let upstream: Response;
  try {
    /* Apps Script trả 302 sang script.googleusercontent.com; fetch tự theo và đổi
       sang GET — đúng cách trang echo của Google trả kết quả JSON. */
    upstream = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        secret,
        source: 'noire-analytics-hub',
        version: text(envelope.version, 20),
        sentAt: new Date().toISOString(),
        items,
      }),
      redirect: 'follow',
      signal: AbortSignal.timeout(LIMITS.upstreamTimeoutMs),
    });
  } catch (err) {
    console.error('[feedback] Không gọi được Apps Script:', err);
    return reply(502, { ok: false, error: 'Không kết nối được kho lưu trữ' });
  }

  const body = await upstream.text().catch(() => '');
  let result: Record<string, unknown> = {};
  try {
    result = record(JSON.parse(body));
  } catch {
    /* Trang HTML = lỗi phía Google (sai quyền truy cập, deployment đã lưu trữ…). */
  }

  if (!upstream.ok || result.ok !== true) {
    // Chi tiết (vd "Sai mã bí mật") chỉ ghi vào log server, không trả về cho trình duyệt.
    console.error('[feedback] Apps Script từ chối:', upstream.status, body.slice(0, 300));
    return reply(502, { ok: false, error: 'Kho lưu trữ từ chối bản ghi' });
  }

  return reply(200, {
    ok: true,
    inserted: Number(result.inserted) || 0,
    skipped: Number(result.skipped) || 0,
    rejected,
  });
}

/* ─── 4. ĐIỂM VÀO VERCEL FUNCTION ─────────────────────────────────────────── */

export function POST(req: Request): Promise<Response> {
  return handleFeedback(req, process.env);
}

export function GET(req: Request): Promise<Response> {
  return handleFeedback(req, process.env);
}
