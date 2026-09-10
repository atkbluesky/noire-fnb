export interface StoreMeta {
  code: string;
  brand: 'NCB' | 'NDC' | 'NJFB' | 'OTHER';
  tier: 'core' | 'flagship' | 'satellite' | 'popup';
  name: string;
  open: string;
}

export interface StoreMonth {
  month: string;
  store: string;
  net: number;
  gross: number;
  disc: number;
  voucher: number;
  guest: number;
  tc: number;
  ta?: number;
  aov?: number;
}

export interface DailySales {
  date: string;
  store: string;
  net: number;
  guest?: number;
  tc?: number;
}

export interface DaypartData {
  month: string;
  daypart: string;
  net: number;
  tc: number;
  guest?: number;
}

export interface HeatmapPoint {
  dow: number; // 0=Mon..6=Sun
  hour_in: number;
  net: number;
  tc: number;
}

export interface ChannelData {
  month: string;
  channel: string;
  net: number;
  tc: number;
}

export interface ProductItem {
  code: string;
  name: string;
  cat: string;
  grp: string;
  brand: string;
  qty: number;
  rev: number;
  cogs: number;
  cm_pct: number;
  has_cogs: boolean;
  mclass: 'Star' | 'Plow-horse' | 'Puzzle' | 'Dog' | 'Chưa xếp hạng';
}

export interface ProductStat {
  /** Kỳ mà bảng luỹ kế THỰC SỰ phủ. Khai ở _stats — không suy được từ dữ liệu đã cắt. */
  covers?: string | null;
  sku: number;
  sku_cogs: number;
  rev: number;
  slow: number;
  slow_rev: number;
  rev20: number;
  n80: number;
  cls: Record<string, number>;
  cls_rev: Record<string, number>;
}

export interface CategoryData {
  cat: string;
  rev: number;
  qty: number;
}

export interface GroupData {
  grp: string;
  rev: number;
  qty: number;
}

export interface CogsCoverage {
  month: string;
  pct: number;
}

export interface CogsFlag {
  brand: string;
  code: string;
  name: string;
  cogs: number;
  price: number;
  pct: number;
}

export interface BomStat {
  rows: number;
  codes: number;
  over45: number;
  loss: number;
  nocost: number;
}

export interface NatureData {
  month: string;
  brand: string;
  nature: 'COMMERCIAL' | 'INTERNAL' | 'PARTNER' | 'LOYALTY';
  rev: number;
  bills: number;
}

export interface CampaignItem {
  month: string;
  brand: string;
  name: string;
  nature: string;
  rev: number;
  bills: number;
}

export interface StaffData {
  store: string;
  name: string;
  net: number;
  tc: number;
  aov: number;
}

export interface ZoneData {
  store: string;
  zone: string;
  net: number;
  tc: number;
}

export interface DwellData {
  mean: number;
  median: number;
  n: number;
}

/** Thời gian ngồi bàn trung bình của một cửa hàng, đơn vị phút. */
export interface DwellStore {
  store: string;
  dwell: number | null;
}

/** Cơ cấu phương thức thanh toán. */
export interface PaymentData {
  pttt: string;
  net: number;
  tc: number;
}

export interface IdentifyData {
  month: string;
  bills: number;
  id_bills: number;
  rate: number;
}

export interface RepeatItem {
  label: string;
  n: number;
}

export interface RepeatStat {
  customers: number;
  repeat: number;
  rate: number;
  max: number;
}

export interface LeadMonth {
  m: string;
  leads: number;
  exp: number;
}

export interface LeadSource {
  month?: string | null;
  src: string;
  leads: number;
  exp: number;
}

export interface LeadType {
  month?: string | null;
  etype: string;
  leads: number;
  exp: number;
}

/** Một dòng booking đã gộp: tháng SỰ KIỆN × outlet × loại × nguồn × trạng thái. */
export interface BookingRow {
  month: string;
  outlet: string | null;
  etype: string | null;
  source: string | null;
  status: string | null;
  leads: number;
  guests: number;
  exp: number;
  closed: number;
}

export interface BookingStat {
  leads: number;
  won: number;
  open: number;
  win_rate: number | null;
  exp: number;
  closed: number;
  pipeline: number;
  guests: number;
  months: string[];
}

export interface TargetItem {
  month: string;
  store: string;
  target: number;
}

export interface ReconItem {
  month: string;
  store: string;
  net_bill: number;
  net_report: number;
  d_bill: number;
}

export interface QAGate {
  no: number;
  name: string;
  detail: string;
  ok: boolean;
}

export interface HubData {
  meta: {
    built: string;
    rows_item: number;
    rows_bill: number;
    months: string[];
    cogs_coverage: number;
  };
  qa: QAGate[];
  stores: Record<string, StoreMeta>;
  core7: string[];
  days: Record<string, number>;
  coverage: Record<string, { days_data: number; days_month: number; last: string; partial: boolean }>;
  store_month: StoreMonth[];
  /** Đã tách sang src/data/daily.ts — import trực tiếp ở M1 Doanh thu. */
  daypart: DaypartData[];
  daypart_order: string[];
  heat: HeatmapPoint[];
  channel: ChannelData[];
  menu_median: { qty: number; cm_pct: number };
  /** Đã tách sang src/data/product.ts — import trực tiếp ở M2 Menu. */
  product_stat: ProductStat;
  category: CategoryData[];
  group: GroupData[];
  cogs_cov: CogsCoverage[];
  cogs_flags: CogsFlag[];
  bom_stat: BomStat;
  nature: NatureData[];
  campaigns: CampaignItem[];
  staff: StaffData[];
  zone: ZoneData[];
  payment: PaymentData[];
  dwell: DwellData;
  dwell_store: DwellStore[];
  identify: IdentifyData[];
  repeat: RepeatItem[];
  repeat_stat: RepeatStat;
  lead_month: LeadMonth[];
  lead_source: LeadSource[];
  lead_type: LeadType[];
  booking: BookingRow[];
  booking_stat: BookingStat;
  target: TargetItem[];
  recon: ReconItem[];
}
