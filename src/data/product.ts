/**
 * Bán món theo THÁNG × CỬA HÀNG — nguồn sheet `product_month` của data_input/monthly.
 * Cố ý KHÔNG nằm trong `HUB_DATA`: chỉ M2 Menu dùng tới bảng này, Rollup gói nó vào
 * đúng chunk của M2.
 *
 * Dữ liệu nằm ở dạng nén (xem ProductBundle). M2 gộp lại theo bộ lọc kỳ · brand ·
 * phạm vi bằng `aggregateProducts` — vì vậy chọn brand ở thanh lọc là số đổi thật.
 */
import raw from './product.json';
import { MenuClass, ProductBundle, ProductItem } from '../types/hub';

export const PRODUCT_BUNDLE = raw as unknown as ProductBundle;

const median = (xs: number[]): number => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export interface ProductAgg {
  products: ProductItem[];
  /** Trung vị cắt ma trận Menu Engineering — tính trên CHÍNH tập món đang lọc. */
  median: { qty: number; cm_pct: number };
  /** false = chưa có product_month, đang hiện bảng luỹ kế toàn chuỗi cũ (không lọc được). */
  filtered: boolean;
}

/** Gộp các dòng tháng × cửa hàng × món theo bộ lọc rồi xếp hạng Menu Engineering. */
export function aggregateProducts(months: string[], inScope: (store: string) => boolean): ProductAgg {
  const B = PRODUCT_BUNDLE;
  if (!B.rows?.length) {
    const legacy = B.legacy ?? [];
    const wc = legacy.filter(p => p.has_cogs && p.qty > 0);
    return {
      products: legacy,
      median: { qty: median(wc.map(p => p.qty)), cm_pct: median(wc.map(p => p.cm_pct ?? 0)) },
      filtered: false,
    };
  }
  const mOk = new Set(months.map(m => B.months.indexOf(m)).filter(i => i >= 0));
  const sOk = B.stores.map(s => inScope(s));
  const acc = new Map<number, { qty: number; rev: number; cogs: number; has: boolean }>();
  for (const [mi, si, ii, qty, rev, cogs] of B.rows) {
    if (!mOk.has(mi) || !sOk[si]) continue;
    const o = acc.get(ii) ?? { qty: 0, rev: 0, cogs: 0, has: false };
    o.qty += qty;
    o.rev += rev;
    if (cogs !== null) { o.cogs += cogs; o.has = true; }
    acc.set(ii, o);
  }
  const products: ProductItem[] = [];
  for (const [ii, o] of acc) {
    const it = B.items[ii];
    const has = o.has && o.cogs > 0;
    const cm = has ? o.rev - o.cogs : null;
    products.push({
      ma: it.ma, name: it.name, cat: it.cat, grp: it.grp,
      qty: o.qty, rev: o.rev, cogs: has ? o.cogs : 0, has_cogs: has,
      cm, cm_pct: has && o.rev > 0 ? (cm as number) / o.rev : null,
      mclass: 'Chưa xếp hạng',
    });
  }
  products.sort((a, b) => b.rev - a.rev);
  const wc = products.filter(p => p.has_cogs && p.qty > 0 && p.cm_pct !== null);
  const qMed = median(wc.map(p => p.qty));
  const mMed = median(wc.map(p => p.cm_pct as number));
  for (const p of wc) {
    const hq = p.qty >= qMed, hm = (p.cm_pct as number) >= mMed;
    p.mclass = (hq && hm ? 'Star' : hq ? 'Plow-horse' : hm ? 'Puzzle' : 'Dog') as MenuClass;
  }
  return { products, median: { qty: qMed, cm_pct: mMed }, filtered: true };
}
