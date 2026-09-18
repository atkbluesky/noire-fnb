/* ĐỐI TÁC = AGGREGATOR + PARTNER — phép gộp DÙNG CHUNG cho M7 (thẻ bản chất "Đối tác")
   và M9 (Partnership). Hai màn gọi cùng một hàm trên cùng bảng MKT_DATA.partner_fact nên
   số không thể lệch nhau. Định nghĩa kênh, cách nhận số: data_contract.json → $partner.
   Danh mục · cơ chế · phí · số tự thống kê: file đối tác L0 S15 (tools/partner_template.py). */
import { MKT_DATA } from '../data';
import type { PartnerBasis, PartnerChannel, PartnerFact, PartnerItem, PartnerProgram } from '../types/mkt';
import { formatNumber, formatPercent } from './formatters';

export const PARTNER_META = MKT_DATA.partner_meta;
export const PARTNERS: PartnerItem[] = MKT_DATA.partners || [];
export const PARTNER_BY_CODE: Record<string, PartnerItem> = Object.fromEntries(PARTNERS.map(p => [p.code, p]));
export const CHANNELS = PARTNER_META?.channels ?? [];
export const CHANNEL_META = Object.fromEntries(CHANNELS.map(c => [c.code, c])) as Record<PartnerChannel, (typeof CHANNELS)[0]>;
export const BASIS_META = Object.fromEntries((PARTNER_META?.bases ?? []).map(b => [b.code, b])) as Record<PartnerBasis, { code: PartnerBasis; label: string; desc: string; count: boolean }>;

export interface PartnerTotals {
  bills: number;
  guests: number;
  bookings: number;
  cancels: number;
  gross: number;
  disc: number;
  voucher: number;
  net: number;
  /** Ưu đãi NOIRE chịu. */
  cost: number;
  /** Phí đối tác / nền tảng. */
  fee: number;
  /** Phần phí là ƯỚC TÍNH (chưa có hoa hồng thực trả). */
  fee_est: number;
  /** Hoa hồng đã trừ sẵn trong doanh thu POS (không cộng vào chi phí). */
  fee_netted: number;
  /** Doanh thu do team TỰ THỐNG KÊ (không đối soát được hoá đơn POS). */
  net_self: number;
}

export const emptyTotals = (): PartnerTotals => ({
  bills: 0, guests: 0, bookings: 0, cancels: 0, gross: 0, disc: 0, voucher: 0, net: 0, cost: 0, fee: 0, fee_est: 0,
  fee_netted: 0, net_self: 0,
});

export function addTo(t: PartnerTotals, r: PartnerFact): PartnerTotals {
  t.bills += r.bills; t.guests += r.guests; t.gross += r.gross; t.disc += r.disc; t.voucher += r.voucher;
  t.bookings += r.bookings ?? 0; t.cancels += r.cancels ?? 0;
  t.net += r.net; t.cost += r.cost; t.fee += r.fee;
  if (r.fee_est) t.fee_est += r.fee;
  t.fee_netted += r.fee_netted ?? 0;
  if (r.basis === 'TU_THONG_KE') t.net_self += r.net;
  return t;
}

/** Dòng đối tác trong kỳ lọc: đúng tháng · đúng brand. Dòng không gắn brand (phí hợp tác chung)
 *  chỉ tính khi xem tất cả brand. */
export function partnerRows(months: string[], brandMatches: (b: string) => boolean): PartnerFact[] {
  const ms = new Set(months);
  return (MKT_DATA.partner_fact || []).filter(r =>
    ms.has(r.month) && (r.brand ? brandMatches(r.brand) : brandMatches('ALL')));
}

export function totalsBy<K extends string>(rows: PartnerFact[], key: (r: PartnerFact) => K): Record<K, PartnerTotals> {
  const out = {} as Record<K, PartnerTotals>;
  rows.forEach(r => addTo((out[key(r)] ||= emptyTotals()), r));
  return out;
}

export const totals = (rows: PartnerFact[]): PartnerTotals => rows.reduce(addTo, emptyTotals());

/** Mức ưu đãi hiển thị: 0,15 → 15% · 200000 → 200.000đ. */
export function rateText(rate: number | null | undefined): string {
  if (rate === null || rate === undefined) return '';
  return rate < 1 ? formatPercent(rate, 0) : `${formatNumber(rate)}đ`;
}

/** Một dòng mô tả chương trình: nội dung ưu đãi, không có thì ghép từ cơ chế + mức + trần + HĐ tối thiểu. */
export function offerText(p: PartnerProgram): string {
  if (p.offer) return p.offer;
  const parts = [p.mech, rateText(p.rate), p.cap ? `tối đa ${formatNumber(p.cap)}đ` : '', p.min_bill ? `HĐ từ ${formatNumber(p.min_bill)}đ` : ''];
  return parts.filter(Boolean).join(' · ');
}
