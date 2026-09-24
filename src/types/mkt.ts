import { QAGate } from './hub';
import { SocialData } from './social';

export interface AdsMonth {
  month: string;
  spend: number;
  reach: number;
  n: number;
}

export interface AdsBrand {
  month: string;
  brand: string;
  spend: number;
  reach: number;
}

export interface AdsObjective {
  month: string;
  objective: string;
  spend: number;
  result: number;
}

export interface AdsCampaign {
  month: string;
  brand: string;
  campaign: string;
  objective: string;
  spend: number;
  result: number;
  cpr: number;
  reach: number;
}

export interface AdsStat {
  spend: number;
  reach: number;
  campaigns: number;
  hr_spend: number;
  missing: string[];
}

export interface GoogleAdsItem {
  month: string | null;
  campaign: string;
  store: string;
  status: string;
  budget_day: number;
  spend: number;
  conv: number;
  cpa: number | null;
  clicks: number;
  impr: number;
}

export interface GoogleAdsStat {
  /** Kỳ suy từ chính dữ liệu: '2026-08' hoặc '2026-07 → 2026-08'. */
  period: string;
  months: string[];
  n: number;
  spend: number;
  conv: number;
  cpa: number;
  clicks: number;
  paused_spend: number;
  unmapped: string[];
}

export interface GoogleAdsChannel {
  month?: string | null;
  channel: string;
  impr: number;
  clicks: number;
  spend: number;
  conv: number;
}

export interface GoogleAdsKeyword {
  month?: string | null;
  kw: string;
  impr: number;
  clicks: number;
  spend: number;
  conv: number;
}

export interface GoogleAdsKwStat {
  terms: number;
  brand_terms: number;
}

export interface BudgetBrand {
  brand: string;
  budget: number;
  '2026-07'?: number;
  '2026-08'?: number;
  '2026-09'?: number;
  [key: string]: any;
}

export interface BudgetExtra {
  name: string;
  '2026-07'?: number;
  '2026-08'?: number;
  '2026-09'?: number;
  [key: string]: any;
}

export interface BudgetChannel {
  channel: string;
  source: string;
  plan: number;
  '2026-07'?: number;
  '2026-08'?: number;
  '2026-09'?: number;
  [key: string]: any;
}

export interface BudgetStoreAds {
  store: string;
  brand: string;
  target: number;
  meta: number;
  google: number;
  zalo: number;
  total: number;
  pct: number;
}

export interface BudgetData {
  file: string;
  total: number;
  plan: number;
  brand: BudgetBrand[];
  extra: BudgetExtra[];
  channel: BudgetChannel[];
  store_ads: BudgetStoreAds[];
  /** Chi phí ngoài media — KHÔNG cộng vào media spend khi tính Ad Cost Ratio. */
  nonmedia: NonMediaCost[];
  nonmedia_stat: {
    months: string[];
    budget: number;
    actual: number;
    use_rate: number | null;
  };
}

export interface VoucherProg {
  prog: string;
  brand: string;
  issued: number;
  used: number;
  rate: number;
  rev: number;
  disc: number;
}

export interface VoucherMonth {
  m: string;
  brand: string;
  used: number;
  rev: number;
  disc: number;
}

export interface VoucherStat {
  files: number;
  issued: number;
  used: number;
  rate: number;
}

export interface VoucherJoin {
  rate: number;
  window: string[];
  out_window: number;
  by_month: { m: string; n: number; hit: number; rate: number }[];
}

/** Zalo OA theo tháng — export OA Manager › Thống kê › Tổng quan (S12). Số là LƯỢT. */
export interface ZaloOAItem {
  month: string;
  /** Quan tâm */
  follows: number;
  /** Gửi tin nhắn đến OA */
  msgs: number;
  /** Xem trang thông tin OA */
  views: number;
  /** Tương tác thanh menu */
  menu: number;
  /** Xem nội dung */
  content: number;
  days: number;
}

/** Cùng nghĩa cột với ZaloOAItem, grain ngày — nguồn M8.1 khi OpenAPI chưa kết nối. */
export interface ZaloOADaily {
  date: string;
  follows: number;
  msgs: number;
  views: number;
  menu: number;
  content: number;
}

/** Sổ nhập tay S26 — snapshot Tổng người quan tâm. null = chưa nhập. */
export interface ZaloOAFollower {
  date: string;
  follower_total: number | null;
  unfollows: number | null;
}

/** Member đăng ký mới theo tháng — lấy từ bảng theo dõi tay. */
export interface MemberMonth {
  month: string;
  member: number;
  oa: number;
  days: number;
}

/* ── Đối tác = Aggregator + Partner (M7 · M9) — hợp đồng: data_contract.json → $partner ── */
export type PartnerChannel = 'AGGREGATOR' | 'PARTNER';
export type PartnerBasis = 'CTKM' | 'NGUON' | 'PTTT' | 'XAC_NHAN' | 'TU_THONG_KE' | 'PHI';

/** Chương trình ưu đãi của đối tác — sheet 3_CHUONG_TRINH của file đối tác. */
export interface PartnerProgram {
  prog: string;
  name: string | null;
  brand: string | null;
  mech: string | null;
  offer: string | null;
  /** < 1 là tỷ lệ (0,15 = 15%), ≥ 1 là số tiền. */
  rate: number | null;
  cap: number | null;
  min_bill: number | null;
  condition: string | null;
  start: string | null;
  end: string | null;
  codes: number | null;
  cid: string | null;
  pos_name: string | null;
  note: string | null;
}

/** Danh mục đối tác (file đối tác L0 S15) + cờ đối chiếu với số thật. Kết quả nằm ở partner_fact. */
export interface PartnerItem {
  code: string;
  name: string;
  channel: PartnerChannel;
  kind: string | null;
  brand: string | null;
  stores: string | null;
  start: string | null;
  end: string | null;
  status: string | null;
  noire_share: number;
  /** Phí hợp tác · kỳ tính phí (Không / Một lần / Hàng tháng). */
  fee: number | null;
  fee_period: string | null;
  /** Hoa hồng nền tảng / chiết khấu cho đối tác. */
  commission_pct: number | null;
  fee_month: number | null;
  fee_unit: string | null;
  fee_unit_amount: number | null;
  sponsor: string | null;
  /** POS = đo trên hoá đơn · TU_THONG_KE = số team nhập (Dining City). */
  source: 'POS' | 'TU_THONG_KE';
  media: number | null;
  owner: string | null;
  note: string | null;
  programs: PartnerProgram[];
  first: string | null;
  last: string | null;
  active_brands: string[];
  bases: PartnerBasis[];
  flags: string[];
}

/** Số đối tác theo tháng × cửa hàng × đối tác × cách nhận — nền chung M7 · M9. */
export interface PartnerFact {
  month: string;
  partner: string;
  channel: PartnerChannel;
  brand: string | null;
  store: string | null;
  basis: PartnerBasis;
  camp: string | null;
  bills: number;
  guests: number;
  /** Chỉ số tự thống kê (Dining City). */
  bookings?: number | null;
  cancels?: number | null;
  method?: string | null;
  note?: string;
  gross: number;
  disc: number;
  voucher: number;
  /** Tổng tiền cả hoá đơn — cùng base Net Sales. */
  net: number;
  /** Ưu đãi NOIRE chịu. */
  cost: number;
  /** Phí đối tác / nền tảng tính vào chi phí (thực trả, hoặc ước tính khi fee_est). */
  fee: number;
  fee_est: boolean;
  /** Hoa hồng POS ĐÃ TRỪ sẵn trong Tổng tiền (GrabFood giao hàng) — chỉ để xem, không cộng vào chi phí. */
  fee_netted: number;
}

export interface PartnerMeta {
  channels: { code: PartnerChannel; label: string; short: string; color: string; desc: string }[];
  bases: { code: PartnerBasis; label: string; desc: string; count: boolean }[];
  other: { code: string; name: string; channel: PartnerChannel };
  last_month: string | null;
}

/** Log eVoucher đối tác — dòng PHAT (tháng phát hành) và DUNG (tháng × cửa hàng sử dụng). */
export interface PartnerVoucher {
  cid: string | null;
  campaign: string | null;
  partner: string | null;
  brand: string | null;
  kind: 'PHAT' | 'DUNG';
  month: string;
  store: string | null;
  issued: number;
  used: number;
  locked: number;
  gross: number;
  disc: number;
  expire: string | null;
}

/** Tổng hợp một chiến dịch eVoucher (toàn bộ log). */
export interface PartnerCampaign {
  cid: string | null;
  campaign: string | null;
  partner: string | null;
  brand: string | null;
  expire: string | null;
  issued: number;
  used: number;
  locked: number;
  gross: number;
  disc: number;
  first: string | null;
  last_use: string | null;
  prog: string | null;
  offer: string | null;
  use_rate: number | null;
}

/** Hoá đơn khớp nền tảng nhưng CHƯA đủ căn cứ — không cộng vào doanh thu, hiện để kiểm lại. */
export interface PartnerCheck {
  month: string;
  partner: string;
  brand: string | null;
  store: string | null;
  basis: PartnerBasis;
  bills: number;
  net: number;
}

/** Cổng chuẩn hoá đầu vào — file lạ trong thư mục nguồn đã nạp vào schema chuẩn. */
export interface PartnerIngest {
  source: string | null;
  file: string | null;
  /** Bộ chuyển đã dùng; trống = chưa có bộ chuyển, file KHÔNG được đọc. */
  adapter: string | null;
  rows: number;
  note: string | null;
  /** Đã điền vào file chuẩn những gì (file chuẩn luôn thắng từng ô). */
  applied: string | null;
  /** Ô file lạ không ghi rõ — để trống, chờ bổ sung. */
  miss: string | null;
}

export interface PartnerPlan {
  month: string;
  code: string;
  scenario: string | null;
  issued: number | null;
  use_rate: number | null;
  aov: number | null;
  cost: number | null;
  rev: number | null;
  gp: number | null;
}

export interface PreAnalyticsQ3 {
  name: string;
  brand: string;
  kind: string;
  roi: number | null;
  nc: number;
}

export interface PreStat {
  n: number;
  neg: number;
  neg_nc: number;
  pos_nc: number;
}

export interface SystemAudit {
  total_py: number;
  total_loc: number;
  cache_mb: number;
  tools: { root: string; files: number; loc: number; dirs: string[] }[];
  dashboards: { name: string; path: string; kb: number }[];
  caches: { path: string; files: number; mb: number }[];
  dup_json: Record<string, string[]>;
}

export interface MktData {
  meta: { built: string };
  qa: QAGate[];
  ads_month: AdsMonth[];
  ads_brand: AdsBrand[];
  ads_objective: AdsObjective[];
  ads_campaign: AdsCampaign[];
  ads_stat: AdsStat;
  gads: GoogleAdsItem[];
  gads_month: GoogleAdsMonth[];
  gads_stat: GoogleAdsStat;
  gads_channel: GoogleAdsChannel[];
  gads_kw: GoogleAdsKeyword[];
  gads_kw_stat: GoogleAdsKwStat;
  budget: BudgetData;
  voucher_prog: VoucherProg[];
  voucher_month: VoucherMonth[];
  voucher_stat: VoucherStat;
  voucher_join: VoucherJoin;
  partner_meta: PartnerMeta;
  partner_fact: PartnerFact[];
  partner_voucher: PartnerVoucher[];
  partner_campaigns: PartnerCampaign[];
  partner_check: PartnerCheck[];
  partner_plan: PartnerPlan[];
  partner_ingest: PartnerIngest[];
  oa: ZaloOAItem[];
  oa_daily: ZaloOADaily[];
  oa_follower: ZaloOAFollower[];
  member_month: MemberMonth[];
  member_stat: { total: number; months_filled: number; months_template: number };
  crm_target: { month: string; kpi: string; target: number }[];
  partners: PartnerItem[];
  pre_q3: PreAnalyticsQ3[];
  pre_stat: PreStat;
  system: SystemAudit;
  /** Khối M6 — Fanpage & TikTok. Xem types/social.ts. */
  social: SocialData;
}


/* ── Google Ads gộp theo tháng (M5) ───────────────────────────────────── */
export interface GoogleAdsMonth {
  month: string;
  spend: number;
  conv: number;
  clicks: number;
  impr: number;
  cpa: number | null;
}

/* ── Chi phí NGOÀI media theo tháng (M4) ──────────────────────────────── */
export interface NonMediaCost {
  month: string;
  item: string;
  budget: number | null;
  actual: number | null;
  use_rate: number | null;
}
