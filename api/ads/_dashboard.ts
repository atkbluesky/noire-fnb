/**
 * M5 ba tầng — phần dữ liệu bổ sung cho `/api/ads/performance` (28/09/2026).
 *
 * Chỉ trả SỐ CỘNG ĐƯỢC. Mọi tỉ lệ (CPM, CTR, chi phí/tin nhắn…) do view tính từ tổng
 * (`src/views/ads/adsModel.ts`) — cộng hay trung bình tỉ lệ là sai số học.
 *
 * Trục phân tách chính là MẢNG (M5_1 §9.1):
 *   funnel `booking` → TIEC (bất kể page) · `hr` → HR · còn lại → brand của page.
 */
import { shiftDays, type Sql } from './_shared.js';

const num = (v: unknown): number => Number(v) || 0;

/** Biểu thức SQL gán MẢNG — một chỗ duy nhất, dùng lại ở mọi truy vấn bên dưới. */
const SEGMENT_SQL = `case
  when funnel = 'booking' then 'TIEC'
  when funnel = 'hr' then 'HR'
  when brand in ('NCB','NDC','NJFB') then brand
  else 'KHAC' end`;

const ADDITIVE_SQL = `
  coalesce(sum(spend), 0)::float                   as spend,
  coalesce(sum(impressions), 0)::float             as impressions,
  coalesce(sum(clicks), 0)::float                  as clicks,
  coalesce(sum(link_clicks), 0)::float             as link_clicks,
  coalesce(sum(messaging_conversations), 0)::float as messages,
  coalesce(sum(leads), 0)::float                   as leads,
  coalesce(sum(video_views), 0)::float             as video_views,
  coalesce(sum(thruplays), 0)::float               as thruplays,
  coalesce(sum(conversions), 0)::float             as conversions`;

type Raw = Record<string, unknown>;

const additive = (r: Raw) => ({
  spend: num(r.spend),
  impressions: num(r.impressions),
  clicks: num(r.clicks),
  linkClicks: num(r.link_clicks),
  messages: num(r.messages),
  leads: num(r.leads),
  videoViews: num(r.video_views),
  thruplays: num(r.thruplays),
  conversions: num(r.conversions),
});

const EMPTY = additive({});

/**
 * Kỳ trước = cùng SỐ NGÀY, liền trước. Không lấy "tháng trước" vì tháng đang chạy
 * dở (T9 mới 27 ngày) so với tháng đủ 31 ngày là so lệch — tháng nào cũng "giảm".
 */
export function previousWindow(start: string, end: string): { start: string; end: string } {
  const days = Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1;
  const prevEnd = shiftDays(start, -1);
  return { start: shiftDays(prevEnd, -(days - 1)), end: prevEnd };
}

/**
 * Mẫu số ĐÚNG cho chi phí trên kết quả (sửa 28/09/2026 sau khi chụp màn hình):
 *   CPTB = chi của chiến dịch MỤC TIÊU "Tin nhắn" ÷ tin nhắn của CHÍNH các chiến dịch đó
 *          — giữ nguyên định nghĩa của màn hình M5 gốc (`cpmMessage`).
 *   CPL  = chi của chiến dịch CÓ PHÁT SINH lead ÷ số lead.
 * Bản đầu chia TOÀN BỘ chi của mảng cho tin nhắn → NCB ra 214.368đ/tin, vì 16tr của NCB
 * là chiến dịch Engagement vốn không nhằm ra tin nhắn. Con số đó sai nghĩa, không sai số học.
 */
async function efficiency(sql: Sql, start: string, end: string) {
  const seg = sql.unsafe(SEGMENT_SQL);
  return sql<Raw[]>`
    with c as (
      select ${seg} as segment, f.campaign_id, d.objective,
             sum(f.spend) as spend, sum(f.messaging_conversations) as messages, sum(f.leads) as leads
        from ads_campaign_daily f
        join dim_ads_campaign d on d.platform = f.platform and d.campaign_id = f.campaign_id
       where f.stat_date between ${start}::date and ${end}::date
       group by 1, 2, 3
    )
    select segment,
           coalesce(sum(spend)    filter (where objective = 'Tin nhắn'), 0)::float as msg_spend,
           coalesce(sum(messages) filter (where objective = 'Tin nhắn'), 0)::float as msg_messages,
           coalesce(sum(spend)    filter (where leads > 0), 0)::float            as lead_spend,
           coalesce(sum(leads), 0)::float                                        as leads
      from c group by 1`;
}

export async function dashboardExtras(sql: Sql, start: string, end: string) {
  const prev = previousWindow(start, end);
  const seg = sql.unsafe(SEGMENT_SQL);
  const add = sql.unsafe(ADDITIVE_SQL);

  const [effCur, effPrev] = await Promise.all([efficiency(sql, start, end), efficiency(sql, prev.start, prev.end)]);
  const [cur, before, daily, monthly, tiec, campaigns, reachRows, synced] = await Promise.all([
    sql<Raw[]>`select ${seg} as segment, ${add} from ads_daily_segment
      where stat_date between ${start}::date and ${end}::date group by 1`,
    sql<Raw[]>`select ${seg} as segment, ${add} from ads_daily_segment
      where stat_date between ${prev.start}::date and ${prev.end}::date group by 1`,
    sql<Raw[]>`select stat_date::text as date, ${seg} as segment, ${add} from ads_daily_segment
      where stat_date between ${start}::date and ${end}::date group by 1, 2 order by 1`,
    // TOÀN BỘ tháng — biểu đồ ACR & kế hoạch cần lịch sử, không cắt theo kỳ đang xem.
    sql<Raw[]>`select to_char(stat_date, 'YYYY-MM') as month, ${seg} as segment, ${add}
      from ads_daily_segment group by 1, 2 order by 1`,
    // Chi tiệc theo PAGE chạy: cho thấy dịch chuyển sang page NEC từ T7/2026.
    sql<Raw[]>`select to_char(stat_date, 'YYYY-MM') as month, brand as page, coalesce(sum(spend), 0)::float as spend
      from ads_daily_segment where funnel = 'booking' group by 1, 2 order by 1`,
    sql<Raw[]>`
      with f as (
        select f.platform, f.campaign_id, ${add}
          from ads_campaign_daily f
         where f.stat_date between ${start}::date and ${end}::date
         group by 1, 2
        having sum(f.spend) > 0
      ), r as (
        select entity_id, reach, frequency from ads_period_reach
         where level = 'campaign' and period_kind = 'month'
           and period_start = date_trunc('month', ${end}::date)::date
      )
      select f.*, c.campaign_name, c.brand, c.funnel, c.objective, c.mapping_locked,
             r.reach::float as month_reach, r.frequency::float as month_frequency
        from f
        left join dim_ads_campaign c on c.platform = f.platform and c.campaign_id = f.campaign_id
        left join r on r.entity_id = f.campaign_id
       order by f.spend desc`,
    sql<Raw[]>`
      (select 'month' as kind, period_start::text as ps, period_end::text as pe,
              reach::float, impressions::float, frequency::float
         from ads_period_reach
        where level = 'account' and period_kind = 'month'
          and period_start = date_trunc('month', ${end}::date)::date
        limit 1)
      union all
      (select 'last7d', period_start::text, period_end::text, reach::float, impressions::float, frequency::float
         from ads_period_reach
        where level = 'account' and period_kind = 'last7d'
        order by period_start desc limit 1)`,
    sql<Raw[]>`select max(window_to)::text as d from ads_sync_run where ok`,
  ]);

  const segments = ['NCB', 'NDC', 'NJFB', 'TIEC', 'HR', 'KHAC'].map(s => ({
    segment: s,
    current: cur.find(r => r.segment === s) ? additive(cur.find(r => r.segment === s)!) : EMPTY,
    previous: before.find(r => r.segment === s) ? additive(before.find(r => r.segment === s)!) : EMPTY,
  }));

  const segmentOf = (funnel: unknown, brand: unknown): string =>
    funnel === 'booking' ? 'TIEC'
      : funnel === 'hr' ? 'HR'
        : ['NCB', 'NDC', 'NJFB'].includes(String(brand)) ? String(brand) : 'KHAC';

  const reachOf = (kind: string) => {
    const r = reachRows.find(x => x.kind === kind);
    return r ? {
      periodStart: String(r.ps), periodEnd: String(r.pe),
      reach: r.reach == null ? null : num(r.reach),
      impressions: r.impressions == null ? null : num(r.impressions),
      frequency: r.frequency == null ? null : num(r.frequency),
    } : null;
  };

  return {
    previous: prev,
    segments,
    segmentDaily: daily.map(r => ({ date: String(r.date), segment: String(r.segment), ...additive(r) })),
    segmentMonthly: monthly.map(r => ({ month: String(r.month), segment: String(r.segment), ...additive(r) })),
    tiecByPage: tiec.map(r => ({ month: String(r.month), page: String(r.page), spend: num(r.spend) })),
    campaigns: campaigns.map(r => ({
      platform: String(r.platform),
      campaignId: String(r.campaign_id),
      campaignName: String(r.campaign_name ?? r.campaign_id),
      brand: String(r.brand ?? 'Không xác định'),
      segment: segmentOf(r.funnel, r.brand),
      objective: String(r.objective ?? 'Khác'),
      locked: Boolean(r.mapping_locked),
      monthReach: r.month_reach == null ? null : num(r.month_reach),
      monthFrequency: r.month_frequency == null ? null : num(r.month_frequency),
      ...additive(r),
    })),
    reach: { month: reachOf('month'), last7d: reachOf('last7d') },
    efficiency: ['NCB', 'NDC', 'NJFB', 'TIEC', 'HR', 'KHAC'].map(s => {
      const pick = (rows: Raw[]) => {
        const r = rows.find(x => x.segment === s) ?? {};
        return { msgSpend: num(r.msg_spend), msgMessages: num(r.msg_messages), leadSpend: num(r.lead_spend), leads: num(r.leads) };
      };
      return { segment: s, current: pick(effCur), previous: pick(effPrev) };
    }),
    syncedThrough: synced[0]?.d ? String(synced[0].d) : null,
  };
}
