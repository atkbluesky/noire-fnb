/**
 * Doanh thu theo NGÀY — 2.373 dòng, ~166 KB.
 * Cố ý KHÔNG nằm trong `HUB_DATA`: chỉ M1 Doanh thu dùng tới bảng này.
 * Vì chỉ RevenueView import file này, Rollup gói nó vào đúng chunk của M1 —
 * người mở Scorecard rồi đóng tab không phải tải một byte nào của nó.
 */
import raw from './daily.json';
import { DailySales } from '../types/hub';

export const DAILY = raw as unknown as DailySales[];
