/**
 * M5.1 · Kiểu dữ liệu của `/api/ads/performance`.
 *
 * Nhánh API của tab M5. Nhánh Excel vẫn dùng `src/types/mkt.ts` (`AdsMonth`,
 * `GoogleAdsItem`…) — hai bộ kiểu tồn tại song song có chủ ý, không phải trùng lặp:
 * grain khác nhau (ngày × chiến dịch vs tháng × chiến dịch).
 */

export type AdsPeriod = 'today' | '7d' | 'mtd' | 'month' | 'range';

/** Khối số dùng chung cho tổng kỳ · từng ngày · từng brand · từng nền tảng. */
export interface AdsMetricBlock {
  /** Tổng mọi chi tiêu, GỒM cả tuyển dụng. */
  totalSpend: number;
  /** Chi vào ACR = store + booking. KHÔNG gồm tuyển dụng. */
  mediaSpend: number;
  /** Phần nhắm doanh thu nhà hàng — có mẫu số tương ứng ở `store_month.net`. */
  storeSpend: number;
  /** Phần nhắm tiệc/catering (brand NEC). Doanh thu do M10 theo dõi riêng. */
  bookingSpend: number;
  /** Chi tuyển dụng — đã loại khỏi `mediaSpend`. */
  hrSpend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  messagingConversations: number;
  pausedSpend: number;
  campaigns: number;
  cpm: number | null;
  cpc: number | null;
  ctr: number | null;
  costPerConversation: number | null;
}

export interface AdsDailyRow extends AdsMetricBlock {
  date: string;
}

export interface AdsBrandRow extends AdsMetricBlock {
  brand: string;
}

export interface AdsPlatformRow extends AdsMetricBlock {
  platform: string;
}

/** Lát tháng × brand — thay cho `MKT_DATA.ads_brand` khi màn hình chạy nhánh API. */
export interface AdsMonthBrandRow extends AdsMetricBlock {
  month: string;
  brand: string;
}

export interface AdsMonthRow {
  month: string;
  mediaSpend: number;
  storeSpend: number;
  bookingSpend: number;
  hrSpend: number;
  lastDate: string;
  /** true = có dữ liệu tới ngày cuối tháng → ĐƯỢC PHÉP hiện ACR cho tháng này. */
  complete: boolean;
}

export interface AdsUnmappedCampaign {
  platform: string;
  campaignId: string;
  campaignName: string | null;
  spend: number;
}

export interface AdsPerformanceResponse {
  ok: true;
  source: string;
  period: AdsPeriod;
  window: { start: string; end: string };
  metrics: AdsMetricBlock;
  daily: AdsDailyRow[];
  byBrand: AdsBrandRow[];
  byPlatform: AdsPlatformRow[];
  byMonthBrand: AdsMonthBrandRow[];
  months: AdsMonthRow[];
  quality: {
    unknownBrandShare: number | null;
    /** QA gate 13 — tính theo KỲ ĐANG XEM, không phải trung bình dài kỳ. */
    unknownBrandOk: boolean;
    unmappedCampaigns: AdsUnmappedCampaign[];
  };
  freshness: {
    lastSync: string | null;
    lastSuccess: string | null;
    stuckRuns: number;
  };
  definitions: Record<string, string>;
}

/** 503 khi chưa cấu hình DB hoặc chưa chạy sync lần nào — view rơi về nguồn Excel. */
export interface AdsNotReadyResponse {
  ok: false;
  code: 'NOT_CONFIGURED' | 'NO_DATA';
  message?: string;
}
