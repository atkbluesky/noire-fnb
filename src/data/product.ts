/**
 * Danh mục SKU kèm giá vốn và hạng Menu Engineering — 700 dòng, ~137 KB.
 * Cố ý KHÔNG nằm trong `HUB_DATA`: chỉ M2 Menu dùng tới bảng này.
 * Các con số tổng suy ra từ đây (product_stat · menu_median · category · group)
 * đã được loader tính sẵn và vẫn nằm trong `HUB_DATA` — view không tính lại (NT2).
 */
import raw from './product.json';
import { ProductItem } from '../types/hub';

export const PRODUCT = raw as unknown as ProductItem[];
