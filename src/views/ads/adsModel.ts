/**
 * M5 ba tầng — tầng TÍNH TOÁN. Mọi con số trên màn hình M5 được định nghĩa ở đây,
 * không định nghĩa lại trong JSX. Sửa công thức = sửa file này + M5_1 §9.
 *
 * Nguyên tắc:
 *   · API chỉ trả SỐ CỘNG ĐƯỢC (chi tiêu, lượt, tin nhắn…). Tỉ lệ (CPM, CTR, CPTB…)
 *     tính ở đây từ tổng — KHÔNG BAO GIỜ cộng/trung bình các tỉ lệ.
 *   · CẤM ROAS (M5 §2). Chỉ số chính là ACR = chi media ÷ doanh thu thuần.
 *   · ACR chỉ tính trên tháng TRỌN KỲ (M5 §2 · M5_1 §3b).
 */
import { HUB_DATA, MKT_DATA } from '../../data';
import type {
  AdsAdditive, AdsSegment, AdsSegmentMonthly, AdsDashboardResponse,
} from '../../types/ads';

/* ─── Mảng ────────────────────────────────────────────────────────────────── */

/** Thứ tự CỐ ĐỊNH — màu đi theo mảng, không theo hạng (dataviz: fixed order). */
export const SEGMENTS: AdsSegment[] = ['NCB', 'NDC', 'NJFB', 'TIEC'];

export const SEGMENT_LABEL: Record<AdsSegment, string> = {
  NCB: 'NCB · Café & Bistro',
  NDC: 'NDC · Dining & Café',
  NJFB: 'NJFB · Japanese Fusion',
  TIEC: 'Tiệc · NEC',
  HR: 'Tuyển dụng',
  KHAC: 'Chưa gán',
};

export const SEGMENT_SHORT: Record<AdsSegment, string> = {
  NCB: 'NCB', NDC: 'NDC', NJFB: 'NJFB', TIEC: 'Tiệc', HR: 'HR', KHAC: 'Khác',
};

/**
 * Bảng màu mảng — ĐÃ CHẠY validator dataviz 28/09/2026, qua cả 5 kiểm ở hai nền:
 *   tối : worst CVD ΔE 8,4 · normal ΔE 19,8
 *   sáng: worst CVD ΔE 9,1 · normal ΔE 22,9 · xanh ngọc & vàng < 3:1 tương phản
 *         → bắt buộc có nhãn/bảng số đi kèm (mọi biểu đồ ở M5 đều có bảng).
 * Màu brand gốc (#AE8966/#82846C/#C28B4B) TRƯỢT 4/5 kiểm: NCB↔NDC ΔE 7,2 — mắt
 * thường cũng khó tách — nên KHÔNG dùng cho biểu đồ phân mảng.
 */
const SEG_DARK: Record<string, string> = { NCB: '#d95926', NDC: '#199e70', NJFB: '#c98500', TIEC: '#9085e9' };
const SEG_LIGHT: Record<string, string> = { NCB: '#eb6834', NDC: '#1baf7a', NJFB: '#eda100', TIEC: '#4a3aa7' };

export const segmentColor = (seg: string, dark: boolean): string =>
  (dark ? SEG_DARK : SEG_LIGHT)[seg] ?? (dark ? '#6e6c65' : '#9e9b93');

/** Page chạy chiến dịch tiệc: page brand dùng màu brand đó, page NEC dùng màu Tiệc. */
export const pageColor = (page: string, dark: boolean): string =>
  segmentColor(page === 'NEC' ? 'TIEC' : page, dark);

/* Nền tảng — hai thực thể KHÁC mảng, nên dùng cặp màu khác hẳn bảng mảng. */
export const PLATFORM_COLOR = (dark: boolean) => ({
  meta: dark ? '#3987e5' : '#2a78d6',
  google: dark ? '#d55181' : '#e87ba4',
});

/* Một chuỗi đơn (thực chi, ACR…) dùng gold của hệ thống; kế hoạch/mục tiêu = xám nét đứt. */
export const ACCENT = '#C5A059';
export const PLAN_GRAY = (dark: boolean) => (dark ? '#6e6c65' : '#9e9b93');

/* ─── Số cộng được ────────────────────────────────────────────────────────── */

export const EMPTY: AdsAdditive = {
  spend: 0, impressions: 0, clicks: 0, linkClicks: 0, messages: 0,
  leads: 0, videoViews: 0, thruplays: 0, conversions: 0,
};

export function addUp(rows: AdsAdditive[]): AdsAdditive {
  const out = { ...EMPTY };
  for (const r of rows) {
    out.spend += r.spend; out.impressions += r.impressions; out.clicks += r.clicks;
    out.linkClicks += r.linkClicks; out.messages += r.messages; out.leads += r.leads;
    out.videoViews += r.videoViews; out.thruplays += r.thruplays; out.conversions += r.conversions;
  }
  return out;
}

const div = (a: number, b: number): number | null => (b > 0 ? a / b : null);

/** Tỉ lệ dẫn xuất — luôn tính từ TỔNG. */
export function ratios(a: AdsAdditive) {
  return {
    cpm: a.impressions > 0 ? (a.spend / a.impressions) * 1000 : null,
    ctrAll: div(a.clicks, a.impressions),
    ctrLink: div(a.linkClicks, a.impressions),
    cpcLink: div(a.spend, a.linkClicks),
    costPerMessage: div(a.spend, a.messages),
    costPerLead: div(a.spend, a.leads),
    /** Tỉ lệ xem hết trên người xem ≥3 giây — nội dung có giữ chân không. */
    thruplayRate: div(a.thruplays, a.videoViews),
    /** Link click → hội thoại: nội dung dẫn khách vào inbox tốt tới đâu. */
    clickToMessage: div(a.messages, a.linkClicks),
  };
}

/* ─── Kỳ ──────────────────────────────────────────────────────────────────── */

export const monthEnd = (month: string): string => {
  const [y, m] = month.split('-').map(Number);
  return `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
};

export const daysInMonth = (month: string): number => Number(monthEnd(month).slice(8));

/* ─── Doanh thu & ACR ─────────────────────────────────────────────────────── */

/** Doanh thu thuần theo tháng. `brand` = null → toàn hệ thống (kể cả cửa hàng OTHER). */
export function netByMonth(brand: string | null): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of HUB_DATA.store_month) {
    const b = (r as { brand?: string }).brand ?? HUB_DATA.stores[r.store]?.brand;
    if (brand && b !== brand) continue;
    out[r.month] = (out[r.month] || 0) + (r.net || 0);
  }
  return out;
}

/** Tháng doanh thu còn dở dang (T9/2026 hiện tại) — KHÔNG được tính ACR. */
export const revenuePartial = (month: string): boolean =>
  !!(HUB_DATA.coverage as Record<string, { partial?: boolean }>)[month]?.partial;

/**
 * Mục tiêu ACR suy từ file ngân sách Q3: kế hoạch ads ÷ mục tiêu doanh thu, theo cửa hàng.
 * Toàn hệ thống = 269,6tr ÷ 25,27 tỷ = 1,067%. Người vận hành CHƯA chốt một trần cố định —
 * đây là giả định ghi ở M5_1 §9.2.
 */
export function acrTarget(brand: string | null): number | null {
  const rows = (MKT_DATA.budget?.store_ads ?? []).filter(r => !brand || r.brand === brand);
  const plan = rows.reduce((a, r) => a + (r.total || 0), 0);
  const target = rows.reduce((a, r) => a + (r.target || 0), 0);
  return target > 0 ? plan / target : null;
}

/* ─── Google (Excel, theo tháng) ──────────────────────────────────────────── */

export interface GoogleMonth { month: string; brand: string; spend: number; conv: number; clicks: number; impr: number }

/** Google chỉ có ở nhánh Excel, grain THÁNG, T7–T8/2026. Không có mảng Tiệc. */
export function googleMonthly(api?: AdsDashboardResponse | null): GoogleMonth[] {
  if (api?.google?.ready) return api.google.monthly;
  const map = new Map<string, GoogleMonth>();
  for (const g of MKT_DATA.gads ?? []) {
    if (!g.month) continue;
    const brand = (g as { brand?: string }).brand ?? 'KHAC';
    const k = `${g.month}|${brand}`;
    const o = map.get(k) ?? { month: g.month, brand, spend: 0, conv: 0, clicks: 0, impr: 0 };
    o.spend += g.spend || 0; o.conv += g.conv || 0; o.clicks += g.clicks || 0; o.impr += g.impr || 0;
    map.set(k, o);
  }
  return [...map.values()];
}

export const googleMonths = (): string[] => [...new Set(googleMonthly().map(g => g.month))].sort();

/* ─── Kế hoạch ngân sách Q3 ───────────────────────────────────────────────── */

export type PlanLine = 'dinein' | 'tiec';

export interface PlanRow {
  channel: 'Meta Ads' | 'Google Ads' | 'Zalo Ads';
  line: PlanLine;
  byMonth: Record<string, number>;
  total: number;
}

/**
 * Kế hoạch lấy từ `budget.channel` (file NOIRE_MKT_Q3_2026…). Mỗi dòng có cột `source`:
 *   "Brand MKT (NCB+NDC+NJFB…)"  → ăn tại chỗ
 *   "Extra Budget - Chạy Tiệc"  → tiệc
 *   "Extra Budget - CRM…"       → BỎ khỏi M5 (người vận hành chốt 28/09/2026 — CRM thuộc M8)
 * File chỉ có Q3 (T7–T9). Tháng ngoài Q3 → không có kế hoạch, không tính pacing.
 */
export function planRows(): PlanRow[] {
  const out: PlanRow[] = [];
  for (const c of (MKT_DATA.budget?.channel ?? []) as Array<Record<string, unknown>>) {
    const src = String(c.source ?? '');
    const line: PlanLine | null = /tiệc/i.test(src) ? 'tiec' : /brand mkt/i.test(src) ? 'dinein' : null;
    if (!line) continue;
    const byMonth: Record<string, number> = {};
    for (const [k, v] of Object.entries(c)) if (/^\d{4}-\d{2}$/.test(k)) byMonth[k] = Number(v) || 0;
    out.push({
      channel: String(c.channel) as PlanRow['channel'],
      line,
      byMonth,
      total: Number(c.plan) || Object.values(byMonth).reduce((a, b) => a + b, 0),
    });
  }
  return out;
}

export const planMonths = (): string[] =>
  [...new Set(planRows().flatMap(r => Object.keys(r.byMonth)))].sort();

/**
 * Kế hoạch LŨY KẾ tới hết cửa sổ: tháng đã qua tính đủ, tháng đang chạy chia theo số
 * ngày đã có dữ liệu. Giả định: tiền phân bổ ĐỀU theo ngày trong tháng (ghi ở M5_1 §9.4).
 */
export function planToDate(byMonth: Record<string, number>, months: string[], through: string | null): number {
  let sum = 0;
  for (const m of months) {
    const p = byMonth[m] || 0;
    if (!p) continue;
    const end = monthEnd(m);
    if (!through || through >= end) { sum += p; continue; }
    if (through < `${m}-01`) continue;
    sum += p * (Number(through.slice(8)) / daysInMonth(m));
  }
  return sum;
}

/* ─── Ngưỡng màu (status) ─────────────────────────────────────────────────── */

export type Status = 'ok' | 'warning' | 'bad' | 'neutral';

/** ACR: ≤ mục tiêu xanh · ≤ 120% mục tiêu cam · vượt nữa đỏ. */
export const acrStatus = (acr: number | null, target: number | null): Status =>
  acr == null || target == null ? 'neutral' : acr <= target ? 'ok' : acr <= target * 1.2 ? 'warning' : 'bad';

/** Pacing: 95–105% xanh · 70–115% cam · còn lại đỏ (giữ ngưỡng của M5 §5). */
export const pacingStatus = (r: number | null): Status =>
  r == null ? 'neutral' : r >= 0.95 && r <= 1.05 ? 'ok' : r >= 0.7 && r <= 1.15 ? 'warning' : 'bad';

/** Tần suất trên cửa sổ: < 3,5 xanh · 3,5–4 cam · ≥ 4 đỏ (tệp bão hoà). */
export const frequencyStatus = (f: number | null): Status =>
  f == null ? 'neutral' : f < 3.5 ? 'ok' : f < 4 ? 'warning' : 'bad';

/**
 * Chi phí trên kết quả so kỳ trước: THẤP HƠN là tốt. Dao động ±10% coi như đứng yên —
 * dưới ngưỡng đó là nhiễu của một tuần nhiều/ít tiệc, không phải xu hướng.
 */
export function costDelta(cur: number | null, prev: number | null): { text: string; status: Status } {
  if (cur == null || prev == null || prev === 0) return { text: '—', status: 'neutral' };
  const d = (cur - prev) / prev;
  const t = `${d > 0 ? '+' : ''}${(d * 100).toFixed(1)}%`;
  return { text: t, status: Math.abs(d) < 0.1 ? 'neutral' : d < 0 ? 'ok' : 'bad' };
}

/** Khối lượng (tin nhắn, lead…) so kỳ trước: CAO HƠN là tốt. */
export function volumeDelta(cur: number | null, prev: number | null): { text: string; status: Status } {
  if (cur == null || prev == null || prev === 0) return { text: '—', status: 'neutral' };
  const d = (cur - prev) / prev;
  const t = `${d > 0 ? '+' : ''}${(d * 100).toFixed(1)}%`;
  return { text: t, status: Math.abs(d) < 0.05 ? 'neutral' : d > 0 ? 'ok' : 'bad' };
}

export const STATUS_TEXT: Record<Status, string> = {
  ok: 'text-status-ok', warning: 'text-status-warning', bad: 'text-status-bad', neutral: 'text-brand-muted',
};

/* ─── Gom theo tháng × mảng (Meta API + Google Excel) ─────────────────────── */

export interface MonthSegmentSpend {
  month: string;
  meta: Record<string, number>;     // theo mảng
  google: Record<string, number>;   // theo brand (Google không có Tiệc)
  hr: number;
}

export function monthSegmentSpend(api: AdsDashboardResponse | null): MonthSegmentSpend[] {
  const map = new Map<string, MonthSegmentSpend>();
  const get = (m: string) => {
    let o = map.get(m);
    if (!o) { o = { month: m, meta: {}, google: {}, hr: 0 }; map.set(m, o); }
    return o;
  };
  for (const r of (api?.segmentMonthly ?? []) as AdsSegmentMonthly[]) {
    const o = get(r.month);
    if (r.segment === 'HR') o.hr += r.spend;
    else o.meta[r.segment] = (o.meta[r.segment] || 0) + r.spend;
  }
  for (const g of googleMonthly(api)) {
    const o = get(g.month);
    o.google[g.brand] = (o.google[g.brand] || 0) + g.spend;
  }
  return [...map.values()].sort((a, b) => a.month.localeCompare(b.month));
}

/** Chi media của một mảng trong tháng (Meta + Google). `null` mảng = cả hệ thống. */
export function mediaSpend(row: MonthSegmentSpend, segment: AdsSegment | null): number {
  const pick = (rec: Record<string, number>) =>
    segment ? rec[segment] || 0 : Object.values(rec).reduce((a, b) => a + b, 0);
  return pick(row.meta) + pick(row.google);
}

/* ─── Chi phí trên kết quả — mẫu số ĐÚNG (sửa 28/09/2026) ──────────────────
   CPTB = chi chiến dịch mục tiêu "Tin nhắn" ÷ tin nhắn của chính chúng (định nghĩa M5 gốc).
   CPL  = chi chiến dịch có phát sinh lead ÷ lead.
   KHÔNG chia toàn bộ chi của mảng: NCB có 16tr chiến dịch Engagement không nhằm ra tin
   nhắn — chia chung thì ra 214.368đ/tin, một con số sai nghĩa. */
export interface Eff { msgSpend: number; msgMessages: number; leadSpend: number; leads: number }

export const addEff = (rows: Eff[]): Eff => rows.reduce(
  (a, r) => ({
    msgSpend: a.msgSpend + r.msgSpend, msgMessages: a.msgMessages + r.msgMessages,
    leadSpend: a.leadSpend + r.leadSpend, leads: a.leads + r.leads,
  }),
  { msgSpend: 0, msgMessages: 0, leadSpend: 0, leads: 0 });

export const effRatios = (e: Eff) => ({
  cpt: e.msgMessages > 0 ? e.msgSpend / e.msgMessages : null,
  cpl: e.leads > 0 ? e.leadSpend / e.leads : null,
});
