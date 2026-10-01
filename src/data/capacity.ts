/**
 * Ma trận giờ vào × thứ và cơ cấu thanh toán theo THÁNG × CỬA HÀNG.
 * Cố ý KHÔNG nằm trong `HUB_DATA`: chỉ M3 Công suất dùng — Rollup gói vào chunk của M3.
 */
import raw from './capacity.json';
import { CapacityBundle } from '../types/hub';

export const CAPACITY = raw as unknown as CapacityBundle;
