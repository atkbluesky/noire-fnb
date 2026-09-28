/**
 * M8.1 — tầng GỘP NGUỒN. Một màn hình, mỗi chỉ số lấy từ nguồn có số, luật nằm hết ở đây:
 *
 *   Chỉ số                          Nguồn chính                 Bù khi thiếu
 *   Quan tâm mới · Gửi tin đến OA   Export S12 (ngày có file)   API webhook (ngày sau file, từ ngày kết nối)
 *   Xem trang · Menu · Xem nội dung Export S12                  — (API không có)
 *   Tổng follower                   API getoa (snapshot ngày)   Sổ tay S26
 *   Bỏ quan tâm                     API webhook unfollow        Sổ tay S26
 *   Tin OA gửi · Người chat · Hội thoại · Loại tin   API        — (export không có)
 *
 * Export là số CHÍNH THỨC của OA Manager nên ngày nào có file thì dùng file, kể cả khi API cũng có.
 * Ngày không nguồn nào phủ = null (thiếu số), KHÔNG coi là 0.
 */
import type { ZaloOADaily, ZaloOAFollower } from '../../types/mkt';
import type { ZaloPerformanceResponse } from '../../types/zalo';

export type OaPeriod = '7d' | '30d' | 'month' | 'ytd';
export interface Range { start: string; end: string }
export interface OaWindow extends Range { prev: Range | null }

/* ─── Ngày (chuỗi YYYY-MM-DD, múi giờ Asia/Bangkok) ─────────────────────── */

export const ictToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());

export const shiftDays = (value: string, days: number) => {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const monthEnd = (month: string) => {
  const date = new Date(`${month}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  return shiftDays(date.toISOString().slice(0, 10), -1);
};

const eachDay = ({ start, end }: Range) => {
  const out: string[] = [];
  for (let d = start; d <= end; d = shiftDays(d, 1)) out.push(d);
  return out;
};

/** Kỳ xem, neo vào `anchor` (hôm nay khi API sống, ngày cuối có export khi API tắt). */
export function oaWindow(period: OaPeriod, month: string, anchor: string): OaWindow {
  if (period === '7d') return { start: shiftDays(anchor, -6), end: anchor, prev: { start: shiftDays(anchor, -13), end: shiftDays(anchor, -7) } };
  if (period === '30d') return { start: shiftDays(anchor, -29), end: anchor, prev: { start: shiftDays(anchor, -59), end: shiftDays(anchor, -30) } };
  if (period === 'ytd') return { start: `${anchor.slice(0, 4)}-01-01`, end: anchor, prev: null };
  const end = monthEnd(month) < anchor ? monthEnd(month) : anchor;
  const prevMonth = shiftDays(`${month}-01`, -1).slice(0, 7);
  return { start: `${month}-01`, end, prev: { start: `${prevMonth}-01`, end: monthEnd(prevMonth) } };
}

/* ─── Gộp theo ngày ─────────────────────────────────────────────────────── */

export interface OaDay {
  date: string;
  /** Nguồn của Quan tâm mới + Gửi tin nhắn ngày này; null = chưa nguồn nào phủ. */
  src: 'export' | 'api' | null;
  follows: number | null;
  msgs: number | null;
  views: number | null;
  menu: number | null;
  content: number | null;
  followerTotal: number | null;
  unfollows: number | null;
}

export interface OaSources {
  exportDaily: ZaloOADaily[];
  follower: ZaloOAFollower[];
  api: ZaloPerformanceResponse | null;
}

export function mergeDays(range: Range, { exportDaily, follower, api }: OaSources): OaDay[] {
  const exp = new Map(exportDaily.map(row => [row.date, row]));
  const s26 = new Map(follower.map(row => [row.date, row]));
  const apiDay = new Map((api?.daily ?? []).map(row => [row.date, row]));
  // Từ ngày kết nối, ngày KHÔNG có dòng API = ngày không có event (0), không phải thiếu số.
  const apiFrom = api?.freshness.first_metric ?? null;

  return eachDay(range).map(date => {
    const e = exp.get(date);
    const a = apiDay.get(date);
    const s = s26.get(date);
    const apiCovers = apiFrom != null && date >= apiFrom;
    return {
      date,
      src: e ? 'export' : apiCovers ? 'api' : null,
      follows: e ? e.follows : apiCovers ? a?.newFollowers ?? 0 : null,
      msgs: e ? e.msgs : apiCovers ? a?.incomingMessages ?? 0 : null,
      views: e?.views ?? null,
      menu: e?.menu ?? null,
      content: e?.content ?? null,
      followerTotal: a?.followerTotal ?? s?.follower_total ?? null,
      unfollows: apiCovers ? a?.unfollowers ?? 0 : s?.unfollows ?? null,
    };
  });
}

/* ─── Tổng kỳ ───────────────────────────────────────────────────────────── */

const total = (values: (number | null)[]) => {
  const known = values.filter((v): v is number => v != null);
  return known.length ? known.reduce((sum, v) => sum + v, 0) : null;
};

export interface OaSummary {
  follows: number | null;
  msgs: number | null;
  views: number | null;
  menu: number | null;
  content: number | null;
  unfollows: number | null;
  /** Quan tâm ÷ Xem trang, chỉ trên ngày có export — mẫu và tử cùng nguồn. */
  followRate: number | null;
  /** Số ngày trong kỳ chưa có Quan tâm/Tin nhắn từ nguồn nào. */
  gapDays: number;
  /** Số ngày trong kỳ chưa có export (Xem trang · Menu · Xem nội dung trống). */
  noExportDays: number;
}

export function summarize(days: OaDay[]): OaSummary {
  const exp = days.filter(d => d.src === 'export');
  const views = total(exp.map(d => d.views));
  return {
    follows: total(days.map(d => d.follows)),
    msgs: total(days.map(d => d.msgs)),
    views: total(days.map(d => d.views)),
    menu: total(days.map(d => d.menu)),
    content: total(days.map(d => d.content)),
    unfollows: total(days.map(d => d.unfollows)),
    followRate: views ? (total(exp.map(d => d.follows)) ?? 0) / views : null,
    gapDays: days.filter(d => d.src == null).length,
    noExportDays: days.filter(d => d.src !== 'export').length,
  };
}

/** Tổng follower cuối kỳ + tăng ròng. API trước (server đã tính ròng theo snapshot), sổ S26 sau. */
export function followerOf(win: Range, follower: ZaloOAFollower[], api: ZaloPerformanceResponse | null) {
  const m = api?.metrics;
  if (m?.followerTotal != null) {
    return { total: m.followerTotal, net: m.followerNet, netSince: m.followerNetSince, source: 'api' as const, date: null };
  }
  const snaps = follower.filter(row => row.follower_total != null);
  const current = [...snaps].reverse().find(row => row.date <= win.end) ?? null;
  const before = [...snaps].reverse().find(row => row.date < win.start) ?? null;
  return {
    total: current?.follower_total ?? null,
    net: current && before ? current.follower_total! - before.follower_total! : null,
    netSince: null,
    source: current ? 's26' as const : null,
    date: current?.date ?? null,
  };
}

/** Các đoạn ngày liên tiếp lấy số từ API — tô nền trên biểu đồ để phân biệt với export. */
export function apiSpans(days: OaDay[]): [string, string][] {
  const spans: [string, string][] = [];
  for (const d of days) {
    if (d.src !== 'api') continue;
    const last = spans.at(-1);
    if (last && shiftDays(last[1], 1) === d.date) last[1] = d.date;
    else spans.push([d.date, d.date]);
  }
  return spans;
}
