import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MessageSquarePlus, X, Send, CheckCircle2, CloudUpload, CloudOff, HardDrive } from 'lucide-react';
import { useFilters } from '../../context/FilterContext';
import { NAVIGATION_GROUPS } from '../layout/Sidebar';

/* ════════════════════════════════════════════════════════════════════════════
   CƠ SỞ LƯU TRỮ Ý KIẾN ĐÓNG GÓP — NOIRE ANALYTICS HUB
   ────────────────────────────────────────────────────────────────────────────
   Mô hình: Local-first + Outbox (hàng đợi gửi lại).

     [Form]  →  ghi ngay vào LocalStorage (không bao giờ mất phản hồi)
             →  đẩy lên Google Sheets qua Webhook Google Apps Script
             →  nếu lỗi/mất mạng: giữ trạng thái 'pending' và tự gửi lại khi
                (a) mở lại dashboard, (b) có mạng trở lại, (c) quay lại tab,
                (d) theo chu kỳ nền, (e) lúc rời trang (sendBeacon).

   Mỗi bản ghi đi kèm NGỮ CẢNH đầy đủ (đang xem màn hình nào, bộ lọc nào,
   thiết bị gì) để đội vận hành tái hiện đúng tình huống người dùng gặp phải.

   Cấu hình: xem docs/60_HUONG_DAN_FEEDBACK_GOOGLE_SHEET.md
   ═══════════════════════════════════════════════════════════════════════════ */

/* ─── 1. KIỂU DỮ LIỆU ─────────────────────────────────────────────────────── */

/** Trạng thái đồng bộ của một bản ghi lên Google Sheets. */
export type FeedbackSyncStatus =
  | 'pending'   // đã lưu cục bộ, đang chờ gửi lên Sheets
  | 'synced'    // Sheets đã xác nhận ghi thành công
  | 'sent'      // đã gửi ở chế độ no-cors — không thể xác minh phản hồi
  | 'failed'    // thử lại quá số lần cho phép
  | 'local';    // chưa cấu hình webhook → chỉ lưu máy

/** Ngữ cảnh dashboard tại thời điểm người dùng bấm gửi. */
export interface FeedbackContext {
  viewId: string;
  viewCode: string;
  viewTitle: string;
  viewGroup: string;
  scope: string;
  brand: string;
  from: string;
  to: string;
  perday: boolean;
  theme: string;
}

/** Dấu vết kỹ thuật của phiên gửi — phục vụ tái hiện lỗi. */
export interface FeedbackMeta {
  deviceId: string;
  sessionId: string;
  appVersion: string;
  url: string;
  referrer: string;
  userAgent: string;
  platform: string;
  language: string;
  timezone: string;
  screen: string;
  viewport: string;
}

export interface FeedbackData {
  id: string;
  category: string;
  categoryLabel: string;
  content: string;
  contact?: string;
  /** Giờ Việt Nam dạng người đọc — giữ nguyên định dạng cũ để tương thích ngược. */
  createdAt: string;
  /** Mốc thời gian chuẩn ISO-8601 — dùng để sắp xếp và đối chiếu trên Sheets. */
  createdAtISO: string;
  context: FeedbackContext;
  meta: FeedbackMeta;
  status: FeedbackSyncStatus;
  attempts: number;
  lastError?: string;
  syncedAt?: string;
}

export const FEEDBACK_CATEGORIES = [
  { id: 'feature', label: '💡 Góp ý tính năng' },
  { id: 'bug', label: '🐞 Báo lỗi dữ liệu' },
  { id: 'ui', label: '🎨 Trải nghiệm UI' },
  { id: 'other', label: '✨ Ý kiến khác' },
];

/* ─── 2. CẤU HÌNH ─────────────────────────────────────────────────────────── */

/** Đọc biến môi trường Vite mà không phụ thuộc khai báo type toàn cục. */
const readEnv = (key: string): string => {
  try {
    const env = (import.meta as any)?.env;
    const value = env ? env[key] : undefined;
    return typeof value === 'string' ? value.trim() : '';
  } catch {
    return '';
  }
};

/**
 * CẤU HÌNH LƯU TRỮ ĐÓNG GÓP Ý KIẾN
 *
 * Thứ tự ưu tiên của `webhookUrl`:
 *   1. Biến môi trường VITE_FEEDBACK_WEBHOOK_URL (khuyến nghị — đặt trên Vercel)
 *   2. Chuỗi dán trực tiếp vào `FALLBACK_WEBHOOK_URL` bên dưới
 *   3. Để trống  →  hệ thống vẫn chạy, chỉ lưu LocalStorage
 */
const FALLBACK_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbzCC3g6yPwIGn-ZLc2tLe-QonqY9Ajs7vOMw_EqiSnDhJMYtXwMSFkmeju-Scfz_09r/exec'; // << Dán URL Webhook Google Apps Script vào đây nếu không dùng biến môi trường
const FALLBACK_SECRET = 'NOIRE-fb-luXWNNgVgSoxq108N_EZwgGJ'; // << Mã bí mật, PHẢI dán y hệt vào SHARED_SECRET trong Apps Script

export const FEEDBACK_CONFIG = {
  /** URL Web App của Google Apps Script (…/exec). */
  webhookUrl: readEnv('VITE_FEEDBACK_WEBHOOK_URL') || FALLBACK_WEBHOOK_URL,
  /** Mã bí mật chống spam, gửi kèm trong payload. */
  secret: readEnv('VITE_FEEDBACK_SECRET') || FALLBACK_SECRET,
  /** Khoá LocalStorage — giữ nguyên tên cũ để không mất dữ liệu đã lưu. */
  storageKey: 'noire_feedbacks',
  deviceKey: 'noire_feedback_device',
  sessionKey: 'noire_feedback_session',
  /** Số bản ghi giữ lại trên máy (cắt bớt bản cũ nhất khi vượt ngưỡng). */
  maxStored: 300,
  /** Giới hạn ký tự nội dung, tránh vượt hạn mức ô của Google Sheets. */
  maxContentLength: 5000,
  /** Số lần thử gửi tối đa trước khi đánh dấu 'failed'. */
  maxAttempts: 8,
  /** Thời gian chờ tối đa cho một lần gọi webhook (ms). */
  timeoutMs: 12000,
  /** Backoff: 20s → 40s → 80s … tối đa 15 phút. */
  retryBaseMs: 20000,
  retryMaxMs: 900000,
  /** Chu kỳ quét hàng đợi khi còn bản ghi chờ (ms). */
  sweepIntervalMs: 60000,
  appVersion: '3.0.0',
  source: 'noire-analytics-hub',
};

/* ─── 3. TRUY CẬP LƯU TRỮ AN TOÀN ─────────────────────────────────────────── */

/* Chế độ riêng tư / cookie bị chặn có thể ném lỗi ngay khi ĐỌC localStorage,
   nên mọi lối vào đều bọc try/catch — widget không bao giờ làm sập dashboard. */
const store = {
  get(key: string): string | null {
    try {
      return typeof window === 'undefined' ? null : window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): boolean {
    try {
      if (typeof window === 'undefined') return false;
      window.localStorage.setItem(key, value);
      return true;
    } catch (err) {
      console.warn('[NOIRE Feedback] Không ghi được LocalStorage:', err);
      return false;
    }
  },
  session(key: string): string | null {
    try {
      return typeof window === 'undefined' ? null : window.sessionStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setSession(key: string, value: string): void {
    try {
      if (typeof window !== 'undefined') window.sessionStorage.setItem(key, value);
    } catch {
      /* bỏ qua — sessionStorage chỉ để gắn nhãn phiên, không bắt buộc */
    }
  },
};

/** Sinh mã ngắn, đủ phân biệt cho mục đích nhận dạng bản ghi/thiết bị. */
const randomId = (prefix: string): string =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`.toUpperCase();

/** Mã thiết bị ẩn danh, bền qua các phiên — gom nhiều góp ý của cùng một người. */
const getDeviceId = (): string => {
  const existing = store.get(FEEDBACK_CONFIG.deviceKey);
  if (existing) return existing;
  const created = randomId('DV');
  store.set(FEEDBACK_CONFIG.deviceKey, created);
  return created;
};

/** Mã phiên — reset mỗi lần mở tab mới. */
const getSessionId = (): string => {
  const existing = store.session(FEEDBACK_CONFIG.sessionKey);
  if (existing) return existing;
  const created = randomId('SS');
  store.setSession(FEEDBACK_CONFIG.sessionKey, created);
  return created;
};

/* ─── 4. ĐỌC / GHI KHO BẢN GHI ────────────────────────────────────────────── */

/** Nâng cấp bản ghi cũ (schema v1, chỉ có 5 trường) lên schema hiện tại. */
const normalize = (raw: any): FeedbackData | null => {
  if (!raw || typeof raw !== 'object' || typeof raw.content !== 'string') return null;
  return {
    id: String(raw.id || randomId('FB')),
    category: String(raw.category || 'other'),
    categoryLabel: String(raw.categoryLabel || raw.category || 'Ý kiến khác'),
    content: String(raw.content),
    contact: raw.contact ? String(raw.contact) : undefined,
    createdAt: String(raw.createdAt || ''),
    createdAtISO: String(raw.createdAtISO || new Date().toISOString()),
    context: raw.context || ({} as FeedbackContext),
    meta: raw.meta || ({} as FeedbackMeta),
    status: (raw.status as FeedbackSyncStatus) || 'local',
    attempts: Number(raw.attempts) || 0,
    lastError: raw.lastError ? String(raw.lastError) : undefined,
    syncedAt: raw.syncedAt ? String(raw.syncedAt) : undefined,
  };
};

/** Toàn bộ phản hồi đã lưu trên máy, mới nhất đứng đầu. */
export const loadFeedbacks = (): FeedbackData[] => {
  const raw = store.get(FEEDBACK_CONFIG.storageKey);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalize).filter((x): x is FeedbackData => x !== null);
  } catch (err) {
    console.warn('[NOIRE Feedback] Dữ liệu LocalStorage hỏng, bỏ qua:', err);
    return [];
  }
};

const saveFeedbacks = (list: FeedbackData[]): void => {
  const trimmed = list.slice(0, FEEDBACK_CONFIG.maxStored);
  if (store.set(FEEDBACK_CONFIG.storageKey, JSON.stringify(trimmed))) return;

  /* Hết hạn mức (QuotaExceeded): giữ lại 50 bản mới nhất để ít nhất
     những phản hồi chưa gửi được vẫn còn cơ hội lên Sheets. */
  const rescue = trimmed.slice(0, 50);
  store.set(FEEDBACK_CONFIG.storageKey, JSON.stringify(rescue));
};

/** Chèn mới hoặc cập nhật tại chỗ theo `id`. */
const upsertFeedback = (item: FeedbackData): void => {
  const list = loadFeedbacks();
  const idx = list.findIndex(x => x.id === item.id);
  if (idx >= 0) list[idx] = item;
  else list.unshift(item);
  saveFeedbacks(list);
};

/** Các bản ghi còn phải gửi lên Sheets. */
export const getPendingFeedbacks = (): FeedbackData[] =>
  loadFeedbacks().filter(x => x.status === 'pending');

/** Khoảng chờ trước lần thử lại kế tiếp (exponential backoff). */
const backoffMs = (attempts: number): number =>
  Math.min(FEEDBACK_CONFIG.retryBaseMs * Math.pow(2, Math.max(0, attempts - 1)), FEEDBACK_CONFIG.retryMaxMs);

/** Bản ghi đã đủ nguội để thử gửi lại chưa. */
const isDueForRetry = (item: FeedbackData): boolean => {
  if (item.attempts <= 0) return true;
  const base = Date.parse(item.syncedAt || item.createdAtISO);
  if (Number.isNaN(base)) return true;
  return Date.now() - base >= backoffMs(item.attempts);
};

/* ─── 5. TẦNG VẬN CHUYỂN LÊN GOOGLE SHEETS ────────────────────────────────── */

interface TransportResult {
  ok: boolean;
  verified: boolean;
  error?: string;
}

/** Gói payload gửi đi — Apps Script nhận cả lô nhiều bản ghi một lần. */
const buildEnvelope = (items: FeedbackData[]) => ({
  secret: FEEDBACK_CONFIG.secret,
  source: FEEDBACK_CONFIG.source,
  version: FEEDBACK_CONFIG.appVersion,
  sentAt: new Date().toISOString(),
  items,
});

/**
 * Gửi lô bản ghi lên Web App của Google Apps Script.
 *
 * Dùng Content-Type `text/plain` có chủ đích: đó là "simple request" nên trình
 * duyệt KHÔNG bắn preflight OPTIONS — Apps Script không trả lời OPTIONS, dùng
 * `application/json` sẽ hỏng ngay ở bước preflight. Apps Script đọc payload
 * bằng `e.postData.contents` nên vẫn parse JSON bình thường.
 */
const postBatch = async (items: FeedbackData[]): Promise<TransportResult> => {
  const url = FEEDBACK_CONFIG.webhookUrl;
  if (!url) return { ok: false, verified: false, error: 'Chưa cấu hình webhook' };

  const body = JSON.stringify(buildEnvelope(items));
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), FEEDBACK_CONFIG.timeoutMs) : null;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body,
      redirect: 'follow',
      signal: controller ? controller.signal : undefined,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const text = await res.text();
    try {
      const json = JSON.parse(text);
      if (json && json.ok === false) {
        return { ok: false, verified: true, error: String(json.error || 'Webhook từ chối bản ghi') };
      }
    } catch {
      /* Apps Script đôi khi trả HTML trang trung gian — vẫn coi là đã nhận. */
    }
    return { ok: true, verified: true };
  } catch (err: any) {
    /* Lỗi CORS/mạng: thử lại ở chế độ no-cors. Phản hồi là opaque nên không
       xác minh được kết quả, chỉ ghi nhận "đã gửi". */
    try {
      await fetch(url, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body,
      });
      return { ok: true, verified: false };
    } catch (fallbackErr: any) {
      return {
        ok: false,
        verified: false,
        error: String(err?.message || fallbackErr?.message || 'Không gửi được'),
      };
    }
  } finally {
    if (timer) clearTimeout(timer);
  }
};

/* Chặn nhiều lượt flush chồng nhau (mount + online + interval cùng lúc). */
let isFlushing = false;

export interface FlushResult {
  sent: number;
  failed: number;
  remaining: number;
}

/**
 * Đẩy toàn bộ hàng đợi lên Google Sheets.
 * @param force Bỏ qua backoff — dùng ngay sau khi người dùng bấm Gửi.
 */
export const flushFeedbackQueue = async (force = false): Promise<FlushResult> => {
  const all = loadFeedbacks();
  const queue = all.filter(x => x.status === 'pending' && (force || isDueForRetry(x)));

  if (!FEEDBACK_CONFIG.webhookUrl || queue.length === 0 || isFlushing) {
    return { sent: 0, failed: 0, remaining: all.filter(x => x.status === 'pending').length };
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { sent: 0, failed: 0, remaining: queue.length };
  }

  isFlushing = true;
  try {
    /* Gửi theo lô 20 bản ghi để payload không quá lớn với Apps Script. */
    const batches: FeedbackData[][] = [];
    for (let i = 0; i < queue.length; i += 20) batches.push(queue.slice(i, i + 20));

    let sent = 0;
    let failed = 0;

    for (const batch of batches) {
      const result = await postBatch(batch);
      const stamp = new Date().toISOString();
      const list = loadFeedbacks();

      batch.forEach(item => {
        const idx = list.findIndex(x => x.id === item.id);
        if (idx < 0) return;
        const attempts = list[idx].attempts + 1;

        if (result.ok) {
          list[idx] = {
            ...list[idx],
            status: result.verified ? 'synced' : 'sent',
            attempts,
            syncedAt: stamp,
            lastError: undefined,
          };
          sent += 1;
        } else {
          list[idx] = {
            ...list[idx],
            status: attempts >= FEEDBACK_CONFIG.maxAttempts ? 'failed' : 'pending',
            attempts,
            syncedAt: stamp,
            lastError: result.error,
          };
          failed += 1;
        }
      });

      saveFeedbacks(list);
    }

    return { sent, failed, remaining: getPendingFeedbacks().length };
  } finally {
    isFlushing = false;
  }
};

/**
 * Gửi nốt hàng đợi lúc người dùng rời trang.
 * `sendBeacon` chạy được cả khi tab đã đóng — nhưng không báo kết quả, nên
 * bản ghi vẫn giữ trạng thái 'pending' và Apps Script sẽ khử trùng lặp theo `id`.
 */
const beaconFlush = (): void => {
  if (!FEEDBACK_CONFIG.webhookUrl) return;
  if (typeof navigator === 'undefined' || typeof navigator.sendBeacon !== 'function') return;

  const queue = getPendingFeedbacks();
  if (queue.length === 0) return;

  try {
    const blob = new Blob([JSON.stringify(buildEnvelope(queue.slice(0, 20)))], {
      type: 'text/plain;charset=utf-8',
    });
    navigator.sendBeacon(FEEDBACK_CONFIG.webhookUrl, blob);
  } catch {
    /* Không gửi được thì thôi — bản ghi vẫn nằm trong LocalStorage. */
  }
};

/* ─── 6. TIỆN ÍCH QUẢN TRỊ (xuất / dọn kho) ───────────────────────────────── */

const CSV_COLUMNS: { key: string; label: string; pick: (x: FeedbackData) => any }[] = [
  { key: 'id', label: 'Mã phản hồi', pick: x => x.id },
  { key: 'createdAtISO', label: 'Thời gian (ISO)', pick: x => x.createdAtISO },
  { key: 'createdAt', label: 'Thời gian (VN)', pick: x => x.createdAt },
  { key: 'categoryLabel', label: 'Phân loại', pick: x => x.categoryLabel },
  { key: 'content', label: 'Nội dung', pick: x => x.content },
  { key: 'contact', label: 'Liên hệ', pick: x => x.contact || '' },
  { key: 'view', label: 'Màn hình', pick: x => [x.context?.viewCode, x.context?.viewTitle].filter(Boolean).join(' · ') },
  { key: 'group', label: 'Nhóm màn hình', pick: x => x.context?.viewGroup || '' },
  { key: 'scope', label: 'Phạm vi', pick: x => x.context?.scope || '' },
  { key: 'brand', label: 'Thương hiệu', pick: x => x.context?.brand || '' },
  { key: 'period', label: 'Kỳ dữ liệu', pick: x => [x.context?.from, x.context?.to].filter(Boolean).join(' → ') },
  { key: 'theme', label: 'Giao diện', pick: x => x.context?.theme || '' },
  { key: 'deviceId', label: 'Mã thiết bị', pick: x => x.meta?.deviceId || '' },
  { key: 'status', label: 'Trạng thái đồng bộ', pick: x => x.status },
];

/** Tải toàn bộ phản hồi trên máy về file CSV (mở được bằng Excel, có BOM). */
export const exportFeedbacksToCSV = (): number => {
  const rows = loadFeedbacks();
  if (rows.length === 0 || typeof document === 'undefined') return 0;

  const escape = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const header = CSV_COLUMNS.map(c => escape(c.label)).join(',');
  const body = rows.map(r => CSV_COLUMNS.map(c => escape(c.pick(r))).join(',')).join('\n');

  const blob = new Blob(['﻿' + header + '\n' + body], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `noire_feedback_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  return rows.length;
};

/** Xoá sạch kho phản hồi trên máy (không ảnh hưởng dữ liệu đã lên Sheets). */
export const clearFeedbacks = (): void => {
  saveFeedbacks([]);
};

/**
 * Đưa các bản ghi lưu ở giai đoạn CHƯA có webhook vào hàng đợi.
 * Nhờ vậy, ngày cấu hình Google Sheets xong thì toàn bộ phản hồi cũ cũng
 * được đẩy lên, không bị bỏ lại trên máy người dùng.
 */
const promoteLocalRecords = (): void => {
  if (!FEEDBACK_CONFIG.webhookUrl) return;
  const list = loadFeedbacks();
  let changed = false;
  const next = list.map(item => {
    if (item.status !== 'local') return item;
    changed = true;
    return { ...item, status: 'pending' as FeedbackSyncStatus, attempts: 0 };
  });
  if (changed) saveFeedbacks(next);
};

/* ─── 7. WIDGET ───────────────────────────────────────────────────────────── */

/** Tra tên màn hình đang mở từ bản đồ điều hướng của Sidebar. */
const describeView = (viewId: string): Pick<FeedbackContext, 'viewCode' | 'viewTitle' | 'viewGroup'> => {
  for (const group of NAVIGATION_GROUPS) {
    const item = group.items.find(i => i.id === viewId);
    if (item) return { viewCode: item.code, viewTitle: item.title, viewGroup: group.groupTitle };
  }
  return { viewCode: viewId, viewTitle: viewId, viewGroup: '' };
};

const collectMeta = (): FeedbackMeta => {
  const nav = typeof navigator !== 'undefined' ? navigator : ({} as Navigator);
  const win = typeof window !== 'undefined' ? window : undefined;
  let timezone = '';
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    /* môi trường không hỗ trợ Intl — bỏ qua */
  }

  return {
    deviceId: getDeviceId(),
    sessionId: getSessionId(),
    appVersion: FEEDBACK_CONFIG.appVersion,
    url: win ? win.location.href : '',
    referrer: typeof document !== 'undefined' ? document.referrer : '',
    userAgent: (nav as any).userAgent || '',
    platform: (nav as any).platform || '',
    language: (nav as any).language || '',
    timezone,
    screen: win && win.screen ? `${win.screen.width}×${win.screen.height}` : '',
    viewport: win ? `${win.innerWidth}×${win.innerHeight}` : '',
  };
};

export const FeedbackWidget: React.FC = () => {
  const { theme, activeView, filters } = useFilters();
  const isDark = theme === 'dark';

  const [isOpen, setIsOpen] = useState(false);
  const [category, setCategory] = useState('feature');
  const [content, setContent] = useState('');
  const [contact, setContact] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSync, setLastSync] = useState<FeedbackSyncStatus>('local');

  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshPending = useCallback(() => {
    setPendingCount(getPendingFeedbacks().length);
  }, []);

  /* Gom mọi lối kích hoạt hàng đợi về một chỗ. */
  const runFlush = useCallback(
    async (force = false) => {
      await flushFeedbackQueue(force);
      refreshPending();
    },
    [refreshPending],
  );

  // Đóng modal khi nhấn phím Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  /* Vòng đời hàng đợi: gửi lại khi mở app, khi có mạng, khi quay lại tab,
     theo chu kỳ nền, và cố gắng gửi nốt lúc rời trang. */
  useEffect(() => {
    promoteLocalRecords();
    refreshPending();
    void runFlush();

    const onOnline = () => void runFlush(true);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void runFlush();
      else beaconFlush();
    };

    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', beaconFlush);

    const sweep = setInterval(() => void runFlush(), FEEDBACK_CONFIG.sweepIntervalMs);

    /* Bộ công cụ quản trị trong Console:
       NOIRE_FEEDBACK.list() · .exportCSV() · .flush() · .pending() · .clear() */
    (window as any).NOIRE_FEEDBACK = {
      list: loadFeedbacks,
      pending: getPendingFeedbacks,
      flush: () => flushFeedbackQueue(true),
      exportCSV: exportFeedbacksToCSV,
      clear: () => {
        clearFeedbacks();
        refreshPending();
      },
      config: FEEDBACK_CONFIG,
    };

    return () => {
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', beaconFlush);
      clearInterval(sweep);
    };
  }, [runFlush, refreshPending]);

  /* Dọn timer đóng modal nếu component bị gỡ giữa chừng. */
  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) {
      setErrorMsg('Vui lòng nhập nội dung ý kiến đóng góp.');
      return;
    }

    setErrorMsg('');
    setIsSubmitting(true);

    const catObj = FEEDBACK_CATEGORIES.find(c => c.id === category);
    const now = new Date();
    const view = describeView(activeView);

    const feedbackItem: FeedbackData = {
      id: 'FB_' + Date.now().toString().slice(-6),
      category,
      categoryLabel: catObj?.label || category,
      content: content.trim().slice(0, FEEDBACK_CONFIG.maxContentLength),
      contact: contact.trim() || undefined,
      createdAt: now.toLocaleString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }),
      createdAtISO: now.toISOString(),
      context: {
        viewId: activeView,
        ...view,
        scope: filters.scope,
        brand: filters.brand,
        from: filters.from,
        to: filters.to,
        perday: filters.perday,
        theme,
      },
      meta: collectMeta(),
      status: FEEDBACK_CONFIG.webhookUrl ? 'pending' : 'local',
      attempts: 0,
    };

    // 1. Lưu cục bộ TRƯỚC — phản hồi không bao giờ mất dù mạng hỏng.
    upsertFeedback(feedbackItem);

    // 2. Đẩy ngay lên Google Sheets; thất bại thì hàng đợi lo phần còn lại.
    if (FEEDBACK_CONFIG.webhookUrl) {
      await runFlush(true);
      const saved = loadFeedbacks().find(x => x.id === feedbackItem.id);
      setLastSync(saved?.status || 'pending');
    } else {
      setLastSync('local');
    }

    refreshPending();
    setIsSubmitting(false);
    setIsSuccess(true);

    // Tự động đóng sau khi gửi thành công
    closeTimerRef.current = setTimeout(() => {
      setIsSuccess(false);
      setContent('');
      setContact('');
      setCategory('feature');
      setIsOpen(false);
    }, 2000);
  };

  const handleClose = () => {
    setIsOpen(false);
    setErrorMsg('');
    setIsSuccess(false);
  };

  /* Dòng trạng thái lưu trữ hiển thị ở màn hình cảm ơn. */
  const syncNotice = (() => {
    if (lastSync === 'synced') {
      return { icon: <CloudUpload className="h-3 w-3" />, text: 'Đã đồng bộ về Google Sheets.', tone: '#10B981' };
    }
    if (lastSync === 'sent') {
      return { icon: <CloudUpload className="h-3 w-3" />, text: 'Đã gửi về Google Sheets.', tone: '#10B981' };
    }
    if (lastSync === 'pending' || lastSync === 'failed') {
      return {
        icon: <CloudOff className="h-3 w-3" />,
        text: 'Đã lưu trên máy — hệ thống sẽ tự gửi lại khi có kết nối.',
        tone: '#F59E0B',
      };
    }
    return { icon: <HardDrive className="h-3 w-3" />, text: 'Đã lưu vào bộ nhớ dashboard.', tone: '#9E9B93' };
  })();

  return (
    <>
      {/* Nút Feedback dọc bám sát mép phải màn hình:
          - Chế độ Sáng (Light): Nền cam (#F97316), chữ trắng
          - Chế độ Tối (Dark): Nền vàng sáng (#FACC15), chữ ĐEN TUYỀN (#000000) font-black */}
      <button
        onClick={() => setIsOpen(true)}
        aria-label="Mở Feedback Widget"
        title="Đóng góp ý kiến (Feedback)"
        style={{
          backgroundColor: isDark ? '#FACC15' : '#F97316',
          color: isDark ? '#000000' : '#FFFFFF',
        }}
        className={`fixed right-0 top-1/2 -translate-y-1/2 z-40 flex flex-col items-center justify-center gap-2 rounded-l-lg py-3.5 px-2 shadow-2xl transition-all duration-200 hover:-translate-x-1 cursor-pointer border-y border-l ${
          isDark ? 'border-black/25' : 'border-white/25'
        } group select-none`}
      >
        <MessageSquarePlus
          className="h-4 w-4 flex-shrink-0 transition-transform group-hover:scale-110"
          style={{ color: isDark ? '#000000' : '#FFFFFF' }}
        />
        <span
          style={{
            writingMode: 'vertical-rl',
            transform: 'rotate(180deg)',
            color: isDark ? '#000000' : '#FFFFFF',
          }}
          className="text-[11px] font-black uppercase tracking-widest leading-none py-0.5"
        >
          Feedback
        </span>
      </button>

      {/* Modal Popup phản hồi */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleClose();
          }}
        >
          <div
            style={{
              backgroundColor: isDark ? '#141417' : '#FFFFFF',
              color: isDark ? '#F3F2EE' : '#18181B',
              borderColor: isDark ? '#2A2A33' : '#E2DED5',
            }}
            className="w-full max-w-md rounded-2xl border p-6 shadow-2xl relative animate-in zoom-in-95 duration-150 flex flex-col"
          >
            {/* Nút Đóng (X) */}
            <button
              onClick={handleClose}
              style={{ color: isDark ? '#9E9B93' : '#78756E' }}
              className="absolute right-4 top-4 rounded-lg p-1.5 hover:opacity-80 transition-opacity"
              aria-label="Đóng"
            >
              <X className="h-4 w-4" />
            </button>

            {/* Tiêu đề Modal (Đã bỏ tab Gửi góp ý / Lịch sử) */}
            <div className="flex items-center gap-2 pb-3 border-b" style={{ borderColor: isDark ? '#2A2A33' : '#E2DED5' }}>
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-500/15 text-orange-500 dark:bg-amber-300/20 dark:text-amber-400 font-bold text-sm">
                ✍️
              </span>
              <h3 className="text-sm font-bold" style={{ color: isDark ? '#F3F2EE' : '#18181B' }}>
                Đóng góp ý kiến
              </h3>
            </div>

            {/* Trạng thái gửi thành công */}
            {isSuccess ? (
              <div className="py-8 text-center space-y-3">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                  <CheckCircle2 className="h-8 w-8" />
                </div>
                <h3 className="text-base font-bold" style={{ color: isDark ? '#F3F2EE' : '#18181B' }}>
                  Cảm ơn bạn đã đóng góp ý kiến!
                </h3>
                <p className="text-xs max-w-xs mx-auto" style={{ color: isDark ? '#9E9B93' : '#52504A' }}>
                  Ý kiến của bạn đã được ghi nhận thành công và sẽ giúp hệ thống Dashboard hoàn thiện tốt hơn.
                </p>
                <p
                  className="flex items-center justify-center gap-1.5 text-[11px] font-medium"
                  style={{ color: syncNotice.tone }}
                >
                  {syncNotice.icon}
                  <span>{syncNotice.text}</span>
                </p>
              </div>
            ) : (
              /* Form nhập ý kiến */
              <form onSubmit={handleSubmit} className="space-y-4 pt-4">
                <p className="text-xs" style={{ color: isDark ? '#9E9B93' : '#52504A' }}>
                  Mọi phản hồi của bạn sẽ giúp đội ngũ tối ưu hóa giao diện và tính năng của hệ thống.
                </p>

                {/* Phân loại phản hồi */}
                <div className="space-y-1.5">
                  <span
                    className="block text-[11px] font-semibold uppercase tracking-wider"
                    style={{ color: isDark ? '#9E9B93' : '#78756E' }}
                  >
                    Phân loại phản hồi
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {FEEDBACK_CATEGORIES.map((cat) => {
                      const isSelected = category === cat.id;
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => setCategory(cat.id)}
                          style={{
                            backgroundColor: isSelected
                              ? (isDark ? 'rgba(197, 160, 89, 0.15)' : 'rgba(176, 131, 75, 0.12)')
                              : (isDark ? '#1A1A1F' : '#F3F1EC'),
                            color: isSelected
                              ? (isDark ? '#DFBF7A' : '#8A5F24')
                              : (isDark ? '#D6D3CA' : '#52504A'),
                            borderColor: isSelected
                              ? (isDark ? '#C5A059' : '#B0834B')
                              : (isDark ? '#2A2A33' : '#E2DED5'),
                          }}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer"
                        >
                          {cat.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Nội dung góp ý (Textarea) - Nền tối chữ trắng ở Dark mode, nền trắng chữ đen ở Light mode */}
                <div>
                  <label
                    htmlFor="feedback-content"
                    className="block text-xs font-semibold mb-1"
                    style={{ color: isDark ? '#F3F2EE' : '#18181B' }}
                  >
                    Nội dung góp ý <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    id="feedback-content"
                    rows={4}
                    value={content}
                    onChange={(e) => {
                      setContent(e.target.value);
                      if (errorMsg) setErrorMsg('');
                    }}
                    placeholder="Mô tả chi tiết ý kiến, mong muốn hoặc vấn đề bạn gặp phải..."
                    style={{
                      backgroundColor: isDark ? '#1A1A1F' : '#FFFFFF',
                      color: isDark ? '#FFFFFF' : '#18181B',
                      borderColor: isDark ? '#383845' : '#D0CCC1',
                    }}
                    className="w-full rounded-xl border p-3 text-xs focus:border-amber-500 focus:outline-none transition-colors resize-none placeholder:text-neutral-400 dark:placeholder:text-neutral-500"
                    autoFocus
                  />
                  {errorMsg && <p className="text-[11px] text-red-500 mt-1">{errorMsg}</p>}
                </div>

                {/* Thông tin liên hệ (Input) */}
                <div>
                  <label
                    htmlFor="feedback-contact"
                    className="block text-xs font-medium mb-1"
                    style={{ color: isDark ? '#9E9B93' : '#52504A' }}
                  >
                    Thông tin liên hệ (Email hoặc SĐT/Zalo - Không bắt buộc)
                  </label>
                  <input
                    id="feedback-contact"
                    type="text"
                    value={contact}
                    onChange={(e) => setContact(e.target.value)}
                    placeholder="VD: 0912... hoặc email@example.com"
                    style={{
                      backgroundColor: isDark ? '#1A1A1F' : '#FFFFFF',
                      color: isDark ? '#FFFFFF' : '#18181B',
                      borderColor: isDark ? '#383845' : '#D0CCC1',
                    }}
                    className="w-full rounded-xl border px-3 py-2 text-xs focus:border-amber-500 focus:outline-none transition-colors placeholder:text-neutral-400 dark:placeholder:text-neutral-500"
                  />
                </div>

                {/* Cảnh báo còn phản hồi chưa đồng bộ (chỉ hiện khi thực sự có) */}
                {pendingCount > 0 && (
                  <p className="flex items-center gap-1.5 text-[11px]" style={{ color: '#F59E0B' }}>
                    <CloudOff className="h-3 w-3 flex-shrink-0" />
                    <span>
                      Còn {pendingCount} phản hồi đang chờ đồng bộ — hệ thống sẽ tự gửi lại.
                    </span>
                  </p>
                )}

                {/* Nút thao tác Hủy và Gửi */}
                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={handleClose}
                    style={{ color: isDark ? '#9E9B93' : '#52504A' }}
                    className="px-3.5 py-2 text-xs font-medium hover:opacity-80 transition-opacity cursor-pointer"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    style={{
                      backgroundColor: isDark ? '#FACC15' : '#F97316',
                      color: isDark ? '#000000' : '#FFFFFF',
                    }}
                    className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-black transition-all shadow-md hover:brightness-105 disabled:opacity-50 cursor-pointer"
                  >
                    <Send className="h-3.5 w-3.5" style={{ color: isDark ? '#000000' : '#FFFFFF' }} />
                    <span>{isSubmitting ? 'Đang gửi...' : 'Gửi'}</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
};
