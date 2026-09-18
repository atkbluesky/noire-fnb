/**
 * Doanh thu theo NGÀY — ~2.400 dòng + phần khách tiệc, ~170 KB.
 * Cố ý KHÔNG nằm trong `HUB_DATA`: chỉ M1 Doanh thu dùng tới bảng này.
 * Vì chỉ RevenueView import file này, Rollup gói nó vào đúng chunk của M1 —
 * người mở Scorecard rồi đóng tab không phải tải một byte nào của nó.
 *
 * `DAILY_PARTY` là phần KHÁCH TIỆC của `DAILY` (HĐ ≥ `GUEST_SEGMENT.party_min_guests`
 * khách). Khách lẻ không lưu riêng: lẻ = DAILY − DAILY_PARTY, nên hai phần luôn
 * cộng đúng bằng số chính thức.
 */
import raw from './daily.json';
import { DailyBundle } from '../types/hub';

const bundle = raw as unknown as DailyBundle;

export const DAILY = bundle.rows;
export const DAILY_PARTY = bundle.party ?? [];
export const GUEST_SEGMENT = bundle.segment;
