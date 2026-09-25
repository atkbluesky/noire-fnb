export type ZaloPeriod = 'today' | '7d' | 'mtd' | 'month';

export interface ZaloDailyMetric {
  date: string;
  followerTotal: number | null;
  followerNet: number | null;
  incomingMessages: number;
  outgoingMessages: number;
  uniqueChatUsers: number;
  conversations: number;
  /** Webhook follow — cần migration 002. */
  newFollowers: number;
  /** Webhook unfollow — cần migration 002. */
  unfollowers: number;
}

export interface ZaloPerformanceResponse {
  ok: true;
  source: string;
  /** Tên OA từ snapshot getoa gần nhất — để biết đang xem OA nào (Dining/Bistro…). */
  oaName: string | null;
  period: ZaloPeriod;
  window: { start: string; end: string };
  metrics: {
    followerTotal: number | null;
    followerNet: number | null;
    /** Có giá trị khi mốc so nằm TRONG kỳ (mới kết nối giữa kỳ): ngày snapshot đầu tiên. */
    followerNetSince: string | null;
    incomingMessages: number;
    outgoingMessages: number;
    uniqueChatUsers: number;
    conversations: number;
    newFollowers: number;
    unfollowers: number;
  };
  messageTypes: Record<string, number>;
  daily: ZaloDailyMetric[];
  freshness: {
    last_webhook: string | null;
    last_snapshot: string | null;
    last_success: string | null;
  };
  definitions: Record<string, string>;
}

