/**
 * KHỐI SOCIAL — Fanpage & TikTok (M6)
 * ===================================
 * Mọi trường `| null` ở đây đều mang nghĩa "CHƯA ĐO ĐƯỢC", khác hẳn số 0.
 * Loader giữ nguyên phân biệt đó, view phải hiện `—` chứ không được quy về 0.
 *
 * `unit` đi kèm mỗi con số tiếp cận vì Facebook và TikTok không đếm cùng một thứ —
 * xem docs/modules/M6_Social_Media.md §2.
 */

export type Platform = 'FACEBOOK' | 'TIKTOK' | 'INSTAGRAM' | 'YOUTUBE' | 'ZALO';

/** Một dòng = một tháng × nền tảng × brand × kênh. */
export interface SocialMonth {
  month: string;
  platform: Platform;
  brand: string;
  page: string | null;

  followers: number | null;
  follows: number | null;
  unfollows: number | null;
  reach: number | null;
  impr: number | null;
  views: number | null;
  profile_views: number | null;
  clicks: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  engage: number | null;
  posts: number | null;
  spend: number | null;
  days: number | null;

  /** Mẫu số tiếp cận ĐÚNG của nền tảng này — reach với Facebook, views với TikTok. */
  audience: number | null;
  /** Nhãn đơn vị của `audience`: "tài khoản tiếp cận" hoặc "lượt xem". */
  unit: string;
  net_follow: number | null;
  er: number | null;
  reach_rate: number | null;
  per_post: number | null;
  cpm: number | null;
}

/** Mức gộp DUY NHẤT được phép — `platform` luôn nằm trong khoá. */
export interface SocialPlatformMonth {
  month: string;
  platform: Platform;
  unit: string;
  followers: number;
  net_follow: number | null;
  audience: number;
  engage: number;
  posts: number;
  spend: number;
  clicks: number;
  profile_views: number;
  er: number | null;
  per_post: number | null;
}

/** Một kênh = một (nền tảng × brand × page). */
export interface SocialPage {
  platform: Platform;
  brand: string;
  page: string | null;
  unit: string;
  followers: number | null;
  net_follow: number | null;
  audience: number;
  engage: number;
  posts: number;
  spend: number;
  clicks?: number;
  profile_views?: number;
  er: number | null;
  months: number;
}

export interface SocialPost {
  date: string | null;
  month: string | null;
  platform: Platform;
  brand: string;
  page: string | null;
  format: string | null;
  title: string | null;
  reach: number | null;
  views: number | null;
  impr: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  clicks: number | null;
  /** Thời lượng xem trung bình, tính bằng GIÂY. */
  watch_avg: number | null;
  spend: number | null;
  link: string | null;
  engage: number;
  audience: number | null;
  unit: string;
  er: number | null;
}

export interface SocialFormat {
  platform: Platform;
  format: string;
  posts: number;
  audience: number;
  engage: number;
  er: number | null;
}

export interface SocialTarget {
  month: string;
  platform: Platform | null;
  kpi: string;
  target: number;
}

export interface SocialStat {
  months: string[];
  platforms: Platform[];
  pages: number;
  posts: number;
  spend: number;
  engage: number;
  net_follow: number | null;
  er: number | null;
  /** Cố ý KHÔNG có một con số `audience` tổng: cộng chéo nền tảng là số vô nghĩa. */
  audience_by_platform: Record<string, number>;
}

export interface SocialData {
  /** true khi chưa nộp sheet `social_month` — màn hình hiện hướng dẫn thay vì số. */
  empty: boolean;
  month: SocialMonth[];
  platform_month: SocialPlatformMonth[];
  page: SocialPage[];
  post: SocialPost[];
  format: SocialFormat[];
  target: SocialTarget[];
  stat: SocialStat;
}
