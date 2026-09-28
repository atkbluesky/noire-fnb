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

/* ═══ M5 ba tầng (28/09/2026) — bổ sung, không đổi các kiểu phía trên ═══════════ */

/**
 * Bốn MẢNG kinh doanh + HR. Đây là trục phân tách chính của tab M5.
 *   NCB · NDC · NJFB — ăn tại chỗ (funnel `store`), theo brand của page
 *   TIEC            — booking tiệc/catering (funnel `booking`), BẤT KỂ chạy trên page nào.
 *                     Page NEC mở từ T7/2026; trước đó chạy nhờ page brand, nhận diện
 *                     bằng tên chiến dịch (tiệc · YEP · party · sự kiện…). Xem M5_1 §2b-bis.
 *   HR              — tuyển dụng, ngoài ACR.
 */
export type AdsSegment = 'NCB' | 'NDC' | 'NJFB' | 'TIEC' | 'HR' | 'KHAC';

/** Số cộng được. Mọi tỉ lệ (CPM, CTR, CPTB…) tính ở view từ các số này — không cộng tỉ lệ. */
export interface AdsAdditive {
  spend: number;
  impressions: number;
  clicks: number;
  linkClicks: number;
  messages: number;
  leads: number;
  videoViews: number;
  thruplays: number;
  conversions: number;
}

export interface AdsSegmentBlock {
  segment: AdsSegment;
  current: AdsAdditive;
  previous: AdsAdditive;
}

export interface AdsSegmentDaily extends AdsAdditive {
  date: string;
  segment: AdsSegment;
}

export interface AdsSegmentMonthly extends AdsAdditive {
  month: string;
  segment: AdsSegment;
}

/** Chi tiệc theo PAGE chạy — cho thấy dịch chuyển sang page NEC từ T7/2026. */
export interface AdsTiecByPage {
  month: string;
  page: string;
  spend: number;
}

export interface AdsCampaignRow extends AdsAdditive {
  platform: string;
  campaignId: string;
  campaignName: string;
  brand: string;
  segment: AdsSegment;
  objective: string;
  locked: boolean;
  /** Reach/tần suất của chiến dịch trong THÁNG CUỐI của kỳ đang xem (không cộng được qua tháng). */
  monthReach: number | null;
  monthFrequency: number | null;
}

export interface AdsReachWindow {
  periodStart: string;
  periodEnd: string;
  reach: number | null;
  impressions: number | null;
  frequency: number | null;
}

export interface AdsDashboardExtras {
  google?: AdsGoogleDashboard;
  previous: { start: string; end: string };
  segments: AdsSegmentBlock[];
  segmentDaily: AdsSegmentDaily[];
  /** TOÀN BỘ các tháng có dữ liệu — cho biểu đồ ACR & kế hoạch, không bị cắt theo kỳ. */
  segmentMonthly: AdsSegmentMonthly[];
  tiecByPage: AdsTiecByPage[];
  campaigns: AdsCampaignRow[];
  reach: {
    /** Tài khoản, tháng cuối của kỳ đang xem. */
    month: AdsReachWindow | null;
    /** Tài khoản, 7 ngày gần nhất — thước đo bão hoà tệp. */
    last7d: AdsReachWindow | null;
  };
  syncedThrough: string | null;
  /** Mẫu số đúng cho CPTB / CPL — xem `efficiency()` ở api/ads/_dashboard.ts. */
  efficiency: AdsEfficiencyBlock[];
}

export interface AdsEfficiency {
  /** Chi của chiến dịch mục tiêu "Tin nhắn". */
  msgSpend: number;
  /** Tin nhắn của CHÍNH các chiến dịch đó. */
  msgMessages: number;
  /** Chi của chiến dịch có phát sinh lead. */
  leadSpend: number;
  leads: number;
}

export interface AdsEfficiencyBlock {
  segment: AdsSegment;
  current: AdsEfficiency;
  previous: AdsEfficiency;
}

export type AdsDashboardResponse = AdsPerformanceResponse & AdsDashboardExtras;

/** Google API uses daily data; coverage distinguishes missing data from zero spend. */
export interface AdsGoogleMetrics { spend: number; conv: number; clicks: number; impr: number }
export interface AdsGoogleDashboard {
  ready: boolean;
  coverage: Array<{ start: string; end: string }>;
  syncedThrough: string | null;
  lastSuccess: string | null;
  monthly: Array<AdsGoogleMetrics & { month: string; brand: string }>;
  daily: Array<AdsGoogleMetrics & { date: string; brand: string }>;
  campaigns: Array<AdsGoogleMetrics & { campaignId: string; campaign: string; store: string | null; brand: string; status: string }>;
  channels: Array<AdsGoogleMetrics & { channel: string; brand: string }>;
  terms: Array<AdsGoogleMetrics & { kw: string; brand: string }>;
}
