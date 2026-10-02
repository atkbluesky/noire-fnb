import RES from '../data/reservation.json';

/* ════════════════════════════════════════════════════════════════════
   M11 · ĐẶT BÀN — mô hình phễu Ads → đơn đặt bàn iPOS, chia theo brand

   iPOS chỉ xuất NGUỒN ĐƠN ở cấp toàn chuỗi; brand chỉ tách được ở báo cáo
   KHÁCH theo cửa hàng. Vì vậy:
     · Tầng Ads (chi phí · hiển thị · click · hội thoại · chuyển đổi) — SỐ THẬT theo brand.
     · Tầng đơn theo brand — ƯỚC TÍNH: đơn của nguồn trả phí chia cho brand theo
       đúng tín hiệu của mục chi phí đó (hội thoại Meta, chuyển đổi Google…);
       nguồn không trả phí chia theo tỷ trọng khách đặt của brand.
     · Huỷ theo brand — tỷ lệ khách huỷ của brand (báo cáo cửa hàng).
   Tổng đơn mọi brand cộng lại LUÔN bằng tổng đơn iPOS.
   ════════════════════════════════════════════════════════════════════ */

export const RES_BRANDS = ['NCB', 'NDC', 'NJFB'] as const;
export type ResBrand = typeof RES_BRANDS[number];
export type ItemKey = 'meta' | 'google';

export interface ResSource { name: string; group: string; kind: 'paid' | 'owned' | 'offline'; orders: number; slices: number }
export interface ResDaily { date: string; orders: number; cancelled: number; guests: number }
export interface ResStore { ipos: string; store: string | null; brand: string | null; name: string; guests: number; cancel_guests: number }
export interface ResQA { name: string; ok: boolean; detail: string }
export interface ResMonth {
  month: string; folder: string; files: string[];
  first: string | null; last: string | null; days: number; days_month: number;
  orders: number; cancelled: number; guests_store: number; cancel_guests_store: number; guests_daily: number;
  sources: ResSource[]; daily: ResDaily[]; stores: ResStore[]; party: { group: string; orders: number }[]; qa: ResQA[];
}
export interface ResCampaign {
  platform: 'meta' | 'google'; brand: string; objective: string; funnel: string; campaign: string;
  spend: number; spend_month: number; impr: number; clicks: number; conv: number; msgs: number;
}
export interface ResAds {
  from: string; to: string; synced_through: string | null; pulled_at: string; kept?: boolean;
  campaigns: ResCampaign[]; daily: { date: string; brand: string; funnel: string; spend: number }[];
}
export interface AdsItemDef { key: ItemKey; label: string; platform: string; action: string | null; sources: string[]; note: string }

interface ResFile {
  built: string;
  ads_items: AdsItemDef[];
  source_groups: Record<string, string>;
  months: ResMonth[];
  ads: Record<string, ResAds>;
}

export const RESERVATION = RES as unknown as ResFile;
export const RES_MONTHS = RESERVATION.months.map(m => m.month);
export const ITEM_DEFS = RESERVATION.ads_items;

const div = (a: number, b: number) => (b > 0 ? a / b : null);

/** Mục chi phí của một chiến dịch Ads — chỉ phễu nhà hàng (`funnel = store`) của 3 brand. */
export function itemOf(c: ResCampaign): ItemKey | null {
  if (c.funnel !== 'store' || !RES_BRANDS.includes(c.brand as ResBrand)) return null;
  return c.platform === 'google' ? 'google' : 'meta';
}

/* ── Một ô phễu: brand × mục chi phí ─────────────────────────────── */
export interface Cell {
  spend: number;        // thực chi trong cửa sổ có dữ liệu đặt bàn
  /** Chi phí theo mục tiêu chiến dịch (Meta: Tin nhắn · Tương tác…) — chỉ để hiện thành phần. */
  split: Record<string, number>;
  impr: number;
  clicks: number;
  actions: number;      // hội thoại (Meta — chỉ chiến dịch Tin nhắn mới đo) · chuyển đổi (Google)
  orders: number;       // đơn đặt bàn của nguồn tương ứng — ƯỚC TÍNH khi tách brand
  kept: number;         // đơn không huỷ
  guests: number;       // khách giữ chỗ (đơn không huỷ × khách/đơn)
  campaigns: number;
}
const emptyCell = (): Cell => ({ spend: 0, split: {}, impr: 0, clicks: 0, actions: 0, orders: 0, kept: 0, guests: 0, campaigns: 0 });
const addCell = (a: Cell, b: Cell): Cell => ({
  spend: a.spend + b.spend,
  split: Object.fromEntries([...new Set([...Object.keys(a.split), ...Object.keys(b.split)])].map(k => [k, (a.split[k] ?? 0) + (b.split[k] ?? 0)])),
  impr: a.impr + b.impr, clicks: a.clicks + b.clicks,
  actions: a.actions + b.actions, orders: a.orders + b.orders, kept: a.kept + b.kept, guests: a.guests + b.guests,
  campaigns: a.campaigns + b.campaigns,
});

export interface BrandModel {
  brand: ResBrand;
  guests: number; cancelGuests: number; cancelRate: number | null;
  orders: number;                     // ước tính — Σ mọi nhóm nguồn
  paidOrders: number;
  items: Record<ItemKey, Cell>;
  groups: Record<string, number>;     // đơn ước tính theo nhóm nguồn
  spendStore: number;                 // thực chi Meta + Google
  spendShare: number | null;
  orderShare: number | null;
}

export interface Model {
  months: ResMonth[];
  ads: ResAds[];
  orders: number; cancelled: number; guests: number; cancelGuests: number; partyAvg: number | null;
  window: { from: string | null; to: string | null };
  brands: Record<ResBrand, BrandModel>;
  chain: Record<ItemKey, Cell>;
  groups: { group: string; label: string; kind: string; orders: number; names: string[] }[];
  sources: ResSource[];
  daily: (ResDaily & { spend: number })[];
  stores: ResStore[];
  party: { group: string; orders: number }[];
  qa: (ResQA & { month: string })[];
  excluded: { tiec: number; unknown: number; hr: number };
  spendMonthStore: number;
  hasAds: boolean;
}

const ITEM_KEYS: ItemKey[] = ['meta', 'google'];

/** Khoá phân bổ đơn của từng nhóm nguồn trả phí sang brand. */
const ALLOC_KEY: Record<ItemKey, (c: Cell) => number> = {
  meta: c => c.actions,       // hội thoại Meta — tín hiệu sát nhất với đơn FacebookCRM (≈98% nhóm Fanpage)
  google: c => c.actions,     // chuyển đổi Google
};
export const ALLOC_LABEL: Record<ItemKey, string> = {
  meta: 'theo hội thoại Meta của brand',
  google: 'theo chuyển đổi Google của brand',
};

function monthModel(m: ResMonth, ads: ResAds | undefined) {
  const items = Object.fromEntries(RES_BRANDS.map(b => [b, Object.fromEntries(ITEM_KEYS.map(k => [k, emptyCell()]))])) as
    Record<ResBrand, Record<ItemKey, Cell>>;
  for (const c of ads?.campaigns ?? []) {
    const k = itemOf(c);
    if (!k) continue;
    const cell = items[c.brand as ResBrand][k];
    cell.spend += c.spend; cell.impr += c.impr; cell.clicks += c.clicks; cell.campaigns += c.spend > 0 ? 1 : 0;
    cell.actions += k === 'meta' ? c.msgs : c.conv;
    const part = k === 'meta' ? c.objective : 'PMax Local';
    cell.split[part] = (cell.split[part] ?? 0) + c.spend;
  }

  /* Tỷ trọng khách đặt theo brand (báo cáo cửa hàng — gồm cả khách huỷ). */
  const g = Object.fromEntries(RES_BRANDS.map(b => [b, 0])) as Record<ResBrand, number>;
  const cg = { ...g };
  for (const s of m.stores) if (s.brand && s.brand in g) { g[s.brand as ResBrand] += s.guests; cg[s.brand as ResBrand] += s.cancel_guests; }
  const gTot = RES_BRANDS.reduce((a, b) => a + g[b], 0);
  const share = (b: ResBrand) => (gTot > 0 ? g[b] / gTot : 1 / RES_BRANDS.length);
  const brandOrders = Object.fromEntries(RES_BRANDS.map(b => [b, m.orders * share(b)])) as Record<ResBrand, number>;
  const cancelRate = (b: ResBrand) => (g[b] > 0 ? cg[b] / g[b] : m.orders ? m.cancelled / m.orders : 0);
  const partyAvg = m.orders ? m.guests_store / m.orders : 0;

  /* Đơn theo nhóm nguồn. */
  const byGroup = new Map<string, number>();
  for (const s of m.sources) byGroup.set(s.group, (byGroup.get(s.group) ?? 0) + s.orders);

  const groups = Object.fromEntries(RES_BRANDS.map(b => [b, {} as Record<string, number>])) as Record<ResBrand, Record<string, number>>;
  // 1) nhóm trả phí: chia theo tín hiệu Ads của đúng mục đó
  for (const k of ITEM_KEYS) {
    const n = byGroup.get(k) ?? 0;
    const keys = RES_BRANDS.map(b => ALLOC_KEY[k](items[b][k]));
    const tot = keys.reduce((a, x) => a + x, 0);
    RES_BRANDS.forEach((b, i) => { groups[b][k] = n * (tot > 0 ? keys[i] / tot : share(b)); });
  }
  // 2) nhóm còn lại: phần đơn còn thiếu của từng brand (đơn ước tính theo khách − đơn trả phí), chuẩn hoá về đúng tổng
  const rest = [...byGroup.entries()].filter(([k]) => !ITEM_KEYS.includes(k as ItemKey));
  const room = RES_BRANDS.map(b => Math.max(0, brandOrders[b] - ITEM_KEYS.reduce((a, k) => a + groups[b][k], 0)));
  const roomTot = room.reduce((a, x) => a + x, 0);
  RES_BRANDS.forEach((b, i) => {
    const w = roomTot > 0 ? room[i] / roomTot : share(b);
    for (const [k, n] of rest) groups[b][k] = n * w;
  });

  for (const b of RES_BRANDS) for (const k of ITEM_KEYS) {
    const c = items[b][k];
    c.orders = groups[b][k];
    c.kept = c.orders * (1 - cancelRate(b));
    c.guests = c.kept * partyAvg;
  }
  return { items, groups, g, cg };
}

export function buildModel(months: string[]): Model {
  const ms = RESERVATION.months.filter(m => months.includes(m.month));
  const ads = ms.map(m => RESERVATION.ads[m.month]).filter(Boolean) as ResAds[];

  const brands = Object.fromEntries(RES_BRANDS.map(b => [b, {
    brand: b, guests: 0, cancelGuests: 0, cancelRate: null, orders: 0, paidOrders: 0,
    items: Object.fromEntries(ITEM_KEYS.map(k => [k, emptyCell()])) as Record<ItemKey, Cell>,
    groups: {}, spendStore: 0, spendShare: null, orderShare: null,
  } as BrandModel])) as Record<ResBrand, BrandModel>;

  for (const m of ms) {
    const mm = monthModel(m, RESERVATION.ads[m.month]);
    for (const b of RES_BRANDS) {
      const B = brands[b];
      B.guests += mm.g[b]; B.cancelGuests += mm.cg[b];
      for (const k of ITEM_KEYS) B.items[k] = addCell(B.items[k], mm.items[b][k]);
      for (const [k, n] of Object.entries(mm.groups[b])) B.groups[k] = (B.groups[k] ?? 0) + n;
    }
  }
  const chain = Object.fromEntries(ITEM_KEYS.map(k => [k, RES_BRANDS.reduce((a, b) => addCell(a, brands[b].items[k]), emptyCell())])) as Record<ItemKey, Cell>;
  const orders = ms.reduce((a, m) => a + m.orders, 0);
  const spendAll = RES_BRANDS.reduce((a, b) => a + brands[b].items.meta.spend + brands[b].items.google.spend, 0);
  for (const b of RES_BRANDS) {
    const B = brands[b];
    B.cancelRate = div(B.cancelGuests, B.guests);
    B.orders = Object.values(B.groups).reduce((a, n) => a + n, 0);
    B.paidOrders = ITEM_KEYS.reduce((a, k) => a + B.items[k].orders, 0);
    B.spendStore = B.items.meta.spend + B.items.google.spend;
    B.spendShare = div(B.spendStore, spendAll);
    B.orderShare = div(B.orders, orders);
  }

  /* Nhóm nguồn toàn chuỗi. */
  const gm = new Map<string, { group: string; label: string; kind: string; orders: number; names: string[] }>();
  const srcMap = new Map<string, ResSource>();
  for (const m of ms) for (const s of m.sources) {
    const cur = gm.get(s.group) ?? { group: s.group, label: RESERVATION.source_groups[s.group] ?? s.group, kind: s.kind, orders: 0, names: [] };
    cur.orders += s.orders;
    if (!cur.names.includes(s.name)) cur.names.push(s.name);
    gm.set(s.group, cur);
    const sc = srcMap.get(s.name) ?? { ...s, orders: 0, slices: 0 };
    sc.orders += s.orders; sc.slices = Math.max(sc.slices, s.slices);
    srcMap.set(s.name, sc);
  }

  /* Ngày: đơn iPOS + chi Ads phễu nhà hàng của 3 brand. */
  const spendDay = new Map<string, number>();
  for (const a of ads) for (const d of a.daily) {
    if (d.funnel !== 'store' || !RES_BRANDS.includes(d.brand as ResBrand)) continue;
    spendDay.set(d.date, (spendDay.get(d.date) ?? 0) + d.spend);
  }
  const daily = ms.flatMap(m => m.daily).map(d => ({ ...d, spend: spendDay.get(d.date) ?? 0 }));

  const storeMap = new Map<string, ResStore>();
  for (const m of ms) for (const s of m.stores) {
    const k = s.store ?? s.ipos;
    const cur = storeMap.get(k) ?? { ...s, guests: 0, cancel_guests: 0 };
    cur.guests += s.guests; cur.cancel_guests += s.cancel_guests;
    storeMap.set(k, cur);
  }
  const partyMap = new Map<string, number>();
  for (const m of ms) for (const p of m.party) partyMap.set(p.group, (partyMap.get(p.group) ?? 0) + p.orders);

  const excluded = { tiec: 0, unknown: 0, hr: 0 };
  let spendMonthStore = 0;
  for (const a of ads) for (const c of a.campaigns) {
    if (c.funnel === 'booking') excluded.tiec += c.spend;
    else if (c.funnel === 'hr') excluded.hr += c.spend;
    else if (!RES_BRANDS.includes(c.brand as ResBrand)) excluded.unknown += c.spend;
    else spendMonthStore += c.spend_month;
  }

  const guests = ms.reduce((a, m) => a + m.guests_store, 0);
  return {
    months: ms, ads,
    orders, cancelled: ms.reduce((a, m) => a + m.cancelled, 0),
    guests, cancelGuests: ms.reduce((a, m) => a + m.cancel_guests_store, 0),
    partyAvg: div(guests, orders),
    window: { from: ads[0]?.from ?? ms[0]?.first ?? null, to: ads.at(-1)?.to ?? ms.at(-1)?.last ?? null },
    brands, chain,
    groups: [...gm.values()].sort((a, b) => b.orders - a.orders),
    sources: [...srcMap.values()].sort((a, b) => b.orders - a.orders),
    daily, stores: [...storeMap.values()].sort((a, b) => b.guests - a.guests),
    party: [...partyMap.entries()].map(([group, n]) => ({ group, orders: n })),
    qa: ms.flatMap(m => m.qa.map(q => ({ ...q, month: m.month }))),
    excluded, spendMonthStore,
    hasAds: ads.length > 0,
  };
}

/** Các chỉ số đơn vị của một ô phễu. */
export function unitMetrics(c: Cell) {
  return {
    cpm: div(c.spend * 1000, c.impr),
    ctr: div(c.clicks, c.impr),
    cpc: div(c.spend, c.clicks),
    cpa: div(c.spend, c.actions),
    actionToOrder: div(c.orders, c.actions),
    cpo: div(c.spend, c.orders),
    cpk: div(c.spend, c.kept),
    cpg: div(c.spend, c.guests),
    keepRate: div(c.kept, c.orders),
  };
}
