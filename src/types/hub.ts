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

/** Ranh giới khách lẻ / tiệc — đọc từ data_contract.json → $guest_segment. */
export interface GuestSegmentMeta {
  party_min_guests: number;
  min_sample_bills: number;
  labels: { solo: string; party: string };
}

export interface DailyBundle {
  rows: DailySales[];
  /** Phần khách tiệc của `rows` (HĐ ≥ party_min_guests khách). Khách lẻ = rows − party. */
  party: DailySales[];
  segment: GuestSegmentMeta;
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

/** Bản chất CTKM — nhãn, màu và thứ tự hiển thị do `data_contract.json → $promo_nature`
 *  quyết định, loader chuyển nguyên xuống đây. Thêm một bản chất thì sửa hợp đồng,
 *  KHÔNG sửa file .tsx nào. */
export interface NatureMeta {
  code: string;
  label: string;
  short: string;
  color: string;
  badge: string;
  /** `full` tính đủ vào ROI marketing · `partial` chỉ phần NOIRE gánh · `none` không tính. */
  roi: 'full' | 'partial' | 'none';
  desc: string;
}

export interface NatureData {
  month: string;
  brand: string;
  /** Mã bản chất — giá trị hợp lệ do `nature_meta` quyết định, không cố định trong type. */
  nature: string;
  /** Doanh thu CTKM — Σ Tổng tiền CẢ hoá đơn gắn tên CTKM (cấp hoá đơn, gồm VAT/phí; cùng nền store_month và M7.2).
   *  basis = 'ITEM' chỉ ở tháng chưa có bảng kê: Thành tiền dòng món, trước VAT — không so được với 'BILL'. */
  rev: number;
  /** Chi phí ưu đãi — giảm giá + phiếu GG ở cấp HOÁ ĐƠN. */
  disc: number;
  bills: number;
  basis?: 'BILL' | 'ITEM';
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

export type BookingStage = 'won' | 'open' | 'lost';

/** Một dòng booking đã gộp: tháng NHẬN LEAD (month) × tháng DIỄN RA (ev_month) ×
 *  cửa hàng × phân khúc × loại × nguồn × trạng thái. Luật: data_contract.json → $booking. */
export interface BookingRow {
  month: string;
  ev_month: string | null;
  store: string | null;
  brand: string | null;
  outlet: string | null;
  /** 'event' = tiệc & sự kiện · 'table' = đặt bàn nhỏ lẫn trong sổ */
  seg: 'event' | 'table';
  etype: string | null;
  source: string | null;
  status: string | null;
  stage: BookingStage;
  lost_reason: string | null;
  leads: number;
  guests: number;
  /** Σ Expected Revenue của exp_n lead có báo giá — ô trống KHÔNG tính là 0 */
  exp: number;
  exp_n: number;
  /** Σ Closed Revenue của closed_n lead Confirmed đã nhập số */
  closed: number;
  closed_n: number;
  /** số lead thiếu ngày nhận, tháng nhận lấy theo ngày sự kiện */
  inq_est: number;
}

/** Chiến dịch Meta thuộc phễu booking (funnel = 'booking'), theo tháng. */
export interface BookingAd {
  month: string;
  campaign: string;
  page: string | null;
  brand: string | null;
  /** msg | lead | like | engage | click | other */
  rkind: string;
  spend: number;
  impr: number;
  reach: number;
  clicks: number;
  result: number;
}

/** Fanpage chuyên tiệc (NEC) theo tháng — số của cả trang, tự nhiên + trả phí. */
export interface BookingPage {
  month: string;
  code: string;
  page: string | null;
  views: number | null;
  reach: number | null;
  engage: number | null;
  clicks: number | null;
  profile_views: number | null;
  follows: number | null;
  contacts: number | null;
  msgs: number | null;
}

export interface BookingMeta {
  stages: { code: BookingStage; label: string; color: string; desc: string }[];
  segment: { table_max_guests: number; table_types: string[]; labels: Record<'event' | 'table', string> };
  mkt_sources: string[];
  result_kinds: { code: string; label: string; contact: boolean }[];
  lost_reasons: string[];
  pages: string[];
}

export interface BookingStat {
  leads: number;
  won: number;
  win_rate: number | null;
  closed: number;
  table_rows: number;
  ads_spend: number;
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
  /** Từ điển bản chất CTKM — nguồn: data_contract.json → $promo_nature. */
  nature_meta: NatureMeta[];
  nature: NatureData[];
  campaigns: CampaignItem[];
  /** CTKM theo tháng × tên × brand — Tổng tiền cả hoá đơn gắn CTKM (cùng định nghĩa M7.2) */
  promo_month?: { month: string; name: string; brand: string; nature: string;
    bills: number; net: number; disc: number; voucher: number }[];
  staff: StaffData[];
  zone: ZoneData[];
  payment: PaymentData[];
  dwell: DwellData;
  dwell_store: DwellStore[];
  identify: IdentifyData[];
  repeat: RepeatItem[];
  repeat_stat: RepeatStat;
  booking: BookingRow[];
  booking_ads: BookingAd[];
  booking_page: BookingPage[];
  booking_meta: BookingMeta;
  booking_stat: BookingStat;
  target: TargetItem[];
  recon: ReconItem[];
}
