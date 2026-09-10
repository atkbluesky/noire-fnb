/**
 * ENGINE PHÂN TÍCH — tầng L3 phía trình bày
 * =========================================
 * Nơi duy nhất chứa các phép phân tích dẫn xuất. View KHÔNG được tự tính lại (NT2).
 *
 * Ba năng lực:
 *   1. Bóc tách nguyên nhân  ΔNet = do LƯỢNG khách hay do CHI TIÊU đầu khách?
 *   2. Phát hiện bất thường  ±k·σ trên xu hướng RIÊNG của từng cửa hàng
 *   3. So sánh same-store    chỉ so cửa hàng có mặt ở cả hai kỳ
 */
import { HUB_DATA } from '../data';
import { StoreMonth } from '../types/hub';

/* ════════════════════════════════════════════════════════════════════
   1. BÓC TÁCH NGUYÊN NHÂN — Net = Guest × TA
   ════════════════════════════════════════════════════════════════════

   ΔNet = ΔGuest·TA₀  +  Guest₀·ΔTA  +  ΔGuest·ΔTA
          └─ do lượng ─┘  └─ do chi tiêu ─┘  └─ tương tác ─┘

   Ba thành phần cộng lại đúng bằng ΔNet — có thể kiểm chứng bằng số học.
   Đây là câu trả lời cho "doanh thu giảm vì ít khách hơn hay vì khách chi ít hơn".
*/
export interface Decomposition {
  netPrev: number;
  netCur: number;
  deltaNet: number;
  deltaPct: number | null;
  guestPrev: number;
  guestCur: number;
  taPrev: number | null;
  taCur: number | null;
  /** Phần biến động do số lượng khách thay đổi */
  volumeEffect: number;
  /** Phần biến động do chi tiêu bình quân đầu khách thay đổi */
  priceEffect: number;
  /** Phần tương tác — cả hai cùng đổi */
  interaction: number;
  /** Yếu tố chi phối: 'volume' | 'price' | 'balanced' */
  driver: 'volume' | 'price' | 'balanced';
  /** Tỷ trọng đóng góp của yếu tố chi phối, 0–1 */
  driverShare: number;
}

export function decompose(
  prev: { net: number; guest: number },
  cur: { net: number; guest: number },
): Decomposition {
  const netPrev = prev.net || 0;
  const netCur = cur.net || 0;
  const guestPrev = prev.guest || 0;
  const guestCur = cur.guest || 0;

  const taPrev = guestPrev > 0 ? netPrev / guestPrev : null;
  const taCur = guestCur > 0 ? netCur / guestCur : null;

  const dGuest = guestCur - guestPrev;
  const dTa = (taCur ?? 0) - (taPrev ?? 0);

  const volumeEffect = dGuest * (taPrev ?? 0);
  const priceEffect = guestPrev * dTa;
  const interaction = dGuest * dTa;

  const deltaNet = netCur - netPrev;
  const av = Math.abs(volumeEffect);
  const ap = Math.abs(priceEffect);
  const tot = av + ap;
  const driverShare = tot > 0 ? Math.max(av, ap) / tot : 0;

  return {
    netPrev, netCur, deltaNet,
    deltaPct: netPrev !== 0 ? deltaNet / Math.abs(netPrev) : null,
    guestPrev, guestCur, taPrev, taCur,
    volumeEffect, priceEffect, interaction,
    driver: driverShare < 0.6 ? 'balanced' : av >= ap ? 'volume' : 'price',
    driverShare,
  };
}

/** Câu diễn giải ngắn cho một kết quả bóc tách — dùng thẳng trên màn hình. */
export function explainDecomposition(d: Decomposition): string {
  if (d.deltaNet === 0) return 'Doanh thu đi ngang.';
  const dir = d.deltaNet > 0 ? 'tăng' : 'giảm';
  const share = (d.driverShare * 100).toFixed(0);
  if (d.driver === 'balanced') {
    return `Doanh thu ${dir} do cả lượng khách và chi tiêu đầu khách cùng đổi, không yếu tố nào chi phối.`;
  }
  const who = d.driver === 'volume' ? 'LƯỢNG KHÁCH' : 'CHI TIÊU ĐẦU KHÁCH (TA)';
  return `Doanh thu ${dir} chủ yếu do ${who} — chiếm ${share}% mức biến động.`;
}

/* ════════════════════════════════════════════════════════════════════
   2. PHÁT HIỆN BẤT THƯỜNG — z-score trên xu hướng RIÊNG của từng cửa hàng
   ════════════════════════════════════════════════════════════════════

   So một cửa hàng với trung bình chuỗi là sai: cửa hàng nhỏ luôn trông "bất thường".
   Phải so với chính lịch sử của nó — đó là lý do dùng độ lệch chuẩn của
   chuỗi tăng trưởng MoM của riêng cửa hàng đó.
*/
export interface Anomaly {
  store: string;
  storeName: string;
  brand: string;
  month: string;
  net: number;
  /** Tăng trưởng MoM của kỳ này */
  growth: number;
  /** Tăng trưởng trung bình của chính cửa hàng này */
  meanGrowth: number;
  sd: number;
  /** Số độ lệch chuẩn so với xu hướng riêng — dấu cho biết chiều */
  z: number;
  direction: 'up' | 'down';
  decomposition: Decomposition;
}

const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const stdev = (a: number[]) => {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
};

/**
 * @param months  danh sách tháng TRỌN KỲ, đã sắp tăng dần
 * @param stores  mã cửa hàng trong phạm vi lọc
 * @param k       ngưỡng số độ lệch chuẩn (mặc định 1,5 theo Blueprint)
 * @param minObs  số kỳ tối thiểu để có ý nghĩa thống kê
 */
export function detectAnomalies(
  months: string[],
  stores: string[],
  k = 1.5,
  minObs = 4,
): Anomaly[] {
  const out: Anomaly[] = [];
  const rows = HUB_DATA.store_month as StoreMonth[];

  for (const st of stores) {
    const series = months
      .map((m) => rows.find((r) => r.month === m && r.store === st))
      .filter(Boolean) as StoreMonth[];
    if (series.length < minObs + 1) continue;

    const growths: number[] = [];
    for (let i = 1; i < series.length; i++) {
      const p = series[i - 1].net;
      growths.push(p !== 0 ? (series[i].net - p) / Math.abs(p) : 0);
    }
    // Chuỗi nền = mọi kỳ TRỪ kỳ đang xét, để kỳ bất thường không tự kéo trung bình theo mình
    const last = growths[growths.length - 1];
    const base = growths.slice(0, -1);
    const m = mean(base);
    const sd = stdev(base);
    if (sd === 0) continue;

    const z = (last - m) / sd;
    if (Math.abs(z) < k) continue;

    const cur = series[series.length - 1];
    const prv = series[series.length - 2];
    out.push({
      store: st,
      storeName: HUB_DATA.stores[st]?.name ?? st,
      brand: HUB_DATA.stores[st]?.brand ?? '—',
      month: cur.month,
      net: cur.net,
      growth: last,
      meanGrowth: m,
      sd,
      z,
      direction: z > 0 ? 'up' : 'down',
      decomposition: decompose(
        { net: prv.net, guest: prv.guest },
        { net: cur.net, guest: cur.guest },
      ),
    });
  }
  return out.sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
}

/* ════════════════════════════════════════════════════════════════════
   3. SAME-STORE — chỉ so cửa hàng có mặt ở CẢ HAI kỳ
   ════════════════════════════════════════════════════════════════════
   Không có bước này, tăng trưởng chuỗi bị thổi phồng bởi cửa hàng mới mở.
*/
export interface SameStoreResult {
  stores: string[];
  excluded: string[];
  prev: { net: number; guest: number; tc: number };
  cur: { net: number; guest: number; tc: number };
  growth: number | null;
  /** Tăng trưởng nếu tính cả cửa hàng mới — để thấy phần bị thổi phồng */
  growthAll: number | null;
}

export function sameStore(
  prevMonth: string,
  curMonth: string,
  inScope: (s: string) => boolean,
): SameStoreResult {
  const rows = HUB_DATA.store_month as StoreMonth[];
  const at = (m: string) => rows.filter((r) => r.month === m && inScope(r.store));
  const P = at(prevMonth);
  const C = at(curMonth);

  const pSet = new Set(P.map((r) => r.store));
  const cSet = new Set(C.map((r) => r.store));
  const both = [...cSet].filter((s) => pSet.has(s));
  const excluded = [...cSet].filter((s) => !pSet.has(s));

  const agg = (rs: StoreMonth[], keep: Set<string>) =>
    rs.filter((r) => keep.has(r.store)).reduce(
      (a, r) => ({ net: a.net + r.net, guest: a.guest + r.guest, tc: a.tc + r.tc }),
      { net: 0, guest: 0, tc: 0 },
    );

  const keep = new Set(both);
  const prev = agg(P, keep);
  const cur = agg(C, keep);
  const prevAll = agg(P, pSet);
  const curAll = agg(C, cSet);

  return {
    stores: both,
    excluded,
    prev,
    cur,
    growth: prev.net ? (cur.net - prev.net) / prev.net : null,
    growthAll: prevAll.net ? (curAll.net - prevAll.net) / prevAll.net : null,
  };
}

/* ════════════════════════════════════════════════════════════════════
   4. ĐÓNG GÓP THEO CỬA HÀNG — cửa hàng nào kéo con số chung đi
   ════════════════════════════════════════════════════════════════════ */
export interface StoreContribution {
  store: string;
  storeName: string;
  brand: string;
  netPrev: number;
  netCur: number;
  delta: number;
  /** Phần trăm của TỔNG mức biến động toàn chuỗi mà cửa hàng này gây ra */
  shareOfChange: number | null;
  decomposition: Decomposition;
  isNew: boolean;
}

export function storeContributions(
  prevMonth: string,
  curMonth: string,
  inScope: (s: string) => boolean,
): StoreContribution[] {
  const rows = HUB_DATA.store_month as StoreMonth[];
  const find = (m: string, s: string) => rows.find((r) => r.month === m && r.store === s);
  const codes = [...new Set(rows.filter((r) => r.month === curMonth || r.month === prevMonth)
    .map((r) => r.store))].filter(inScope);

  const items = codes.map((s) => {
    const p = find(prevMonth, s);
    const c = find(curMonth, s);
    const netPrev = p?.net ?? 0;
    const netCur = c?.net ?? 0;
    return {
      store: s,
      storeName: HUB_DATA.stores[s]?.name ?? s,
      brand: HUB_DATA.stores[s]?.brand ?? '—',
      netPrev, netCur,
      delta: netCur - netPrev,
      shareOfChange: null as number | null,
      decomposition: decompose(
        { net: netPrev, guest: p?.guest ?? 0 },
        { net: netCur, guest: c?.guest ?? 0 },
      ),
      isNew: !p && !!c,
    };
  });

  // Mẫu số là tổng TRỊ TUYỆT ĐỐI mức biến động: nếu lấy tổng đại số, các cửa hàng
  // tăng và giảm triệt tiêu nhau và tỷ trọng sẽ vọt lên vô nghĩa.
  const totalAbs = items.reduce((s, r) => s + Math.abs(r.delta), 0);
  for (const r of items) r.shareOfChange = totalAbs ? r.delta / totalAbs : null;

  return items.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}
