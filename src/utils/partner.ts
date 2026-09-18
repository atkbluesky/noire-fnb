/* ĐỐI TÁC = AGGREGATOR + PARTNER — phép gộp DÙNG CHUNG cho M7 (thẻ bản chất "Đối tác")
   và M9 (Partnership). Hai màn gọi cùng một hàm trên cùng bảng MKT_DATA.partner_fact nên
   số không thể lệch nhau. Định nghĩa kênh, cách nhận hoá đơn: data_contract.json → $partner. */
import { MKT_DATA } from '../data';
import type { PartnerBasis, PartnerChannel, PartnerFact, PartnerItem } from '../types/mkt';

export const PARTNER_META = MKT_DATA.partner_meta;
export const PARTNERS: PartnerItem[] = MKT_DATA.partners || [];
export const PARTNER_BY_CODE: Record<string, PartnerItem> = Object.fromEntries(PARTNERS.map(p => [p.code, p]));
export const CHANNELS = PARTNER_META?.channels ?? [];
export const CHANNEL_META = Object.fromEntries(CHANNELS.map(c => [c.code, c])) as Record<PartnerChannel, (typeof CHANNELS)[0]>;
export const BASIS_META = Object.fromEntries((PARTNER_META?.bases ?? []).map(b => [b.code, b])) as Record<PartnerBasis, { code: PartnerBasis; label: string; desc: string }>;

export interface PartnerTotals {
  bills: number;
  guests: number;
  gross: number;
  disc: number;
  voucher: number;
  net: number;
  cost: number;
  fee: number;
  /** Phần phí là ƯỚC TÍNH (POS không ghi hoa hồng). */
  fee_est: number;
  /** Doanh thu lấy từ báo cáo team (không đối soát được hoá đơn). */
  net_report: number;
}

export const emptyTotals = (): PartnerTotals => ({
  bills: 0, guests: 0, gross: 0, disc: 0, voucher: 0, net: 0, cost: 0, fee: 0, fee_est: 0, net_report: 0,
});

export function addTo(t: PartnerTotals, r: PartnerFact): PartnerTotals {
  t.bills += r.bills; t.guests += r.guests; t.gross += r.gross; t.disc += r.disc; t.voucher += r.voucher;
  t.net += r.net; t.cost += r.cost; t.fee += r.fee;
  if (r.fee_est) t.fee_est += r.fee;
  if (r.basis === 'REPORT') t.net_report += r.net;
  return t;
}

/** Dòng đối tác trong kỳ lọc: đúng tháng · đúng brand · đúng phạm vi cửa hàng (nếu biết cửa hàng). */
export function partnerRows(
  months: string[],
  brandMatches: (b: string) => boolean,
  inScope?: (store: string) => boolean,
): PartnerFact[] {
  const ms = new Set(months);
  return (MKT_DATA.partner_fact || []).filter(r =>
    ms.has(r.month)
    && (r.brand ? brandMatches(r.brand) : brandMatches('ALL'))
    && (!r.store || !inScope || inScope(r.store)));
}

export function totalsBy<K extends string>(rows: PartnerFact[], key: (r: PartnerFact) => K): Record<K, PartnerTotals> {
  const out = {} as Record<K, PartnerTotals>;
  rows.forEach(r => addTo((out[key(r)] ||= emptyTotals()), r));
  return out;
}

export const totals = (rows: PartnerFact[]): PartnerTotals => rows.reduce(addTo, emptyTotals());
