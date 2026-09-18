export type ZaloPeriod = 'today' | '7d' | 'mtd' | 'month';

export interface ZaloDailyMetric {
  date: string;
  followerTotal: number | null;
  followerNet: number | null;
  incomingMessages: number;
  outgoingMessages: number;
  uniqueChatUsers: number;
  conversations: number;
}

export interface ZaloPerformanceResponse {
  ok: true;
  source: string;
  period: ZaloPeriod;
  window: { start: string; end: string };
  metrics: {
    followerTotal: number | null;
    followerNet: number | null;
    incomingMessages: number;
    outgoingMessages: number;
    uniqueChatUsers: number;
    conversations: number;
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

