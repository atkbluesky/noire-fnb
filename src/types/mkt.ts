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

export interface ZaloOAItem {
  month: string;
  follows: number;
  msgs: number;
  views: number;
}

/** Member đăng ký mới theo tháng — lấy từ bảng theo dõi tay. */
export interface MemberMonth {
  month: string;
  member: number;
  oa: number;
  days: number;
}

export interface PartnerItem {
  code: string;
  name: string;
  kind: string;
  brand: string;
  start: string;
  end: string;
  status: string;
  media: number;
  issued: number;
  used: number;
  use_rate?: number;
  rev?: number;
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
  aggregator: AggregatorRow[];
  aggregator_stat: AggregatorStat;
  partner_month: PartnerMonth[];
  oa: ZaloOAItem[];
  member_month: MemberMonth[];
  member_stat: { total: number; months_filled: number; months_template: number };
  crm_target: { month: string; kpi: string; target: number }[];
  partners: PartnerItem[];
  partner_camp: any[];
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

/* ── Nền tảng trung gian — GrabFood · Dining City… (M7) ───────────────── */
export interface AggregatorRow {
  month: string;
  platform: string;
  brand: string | null;
  store: string | null;
  sales: number;
  orders: number;
  items: number | null;
  guests: number | null;
  discount: number | null;
  commission: number | null;
  ads_spend: number | null;
  note: string | null;
  aov: number | null;
  /** Phần nền tảng giữ lại: (discount + commission + ads) ÷ sales. */
  take_rate: number | null;
  net_after: number;
}

export interface AggregatorStat {
  months: string[];
  platforms: string[];
  sales: number;
  orders: number;
  aov: number | null;
  discount: number;
  commission: number;
  take_rate: number | null;
  net_after: number;
  by_month: { month: string; sales: number; orders: number; aov: number | null }[];
  empty: boolean;
}

/* ── Kết quả đối tác theo tháng (M9) ─────────────────────────────────── */
export interface PartnerMonth {
  month: string;
  code: string;
  issued: number | null;
  used: number | null;
  rev: number | null;
  disc: number | null;
  use_rate: number | null;
}

/* ── Chi phí NGOÀI media theo tháng (M4) ──────────────────────────────── */
export interface NonMediaCost {
  month: string;
  item: string;
  budget: number | null;
  actual: number | null;
  use_rate: number | null;
}
