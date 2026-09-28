/** Google API data for M5. Kept separate from Meta and the Excel fallback. */
import type { Sql } from './_shared.js';

const n = (v: unknown) => Number(v) || 0;
type Row = Record<string, unknown>;
const segment = `case when d.funnel = 'booking' then 'TIEC'
  when d.brand in ('NCB','NDC','NJFB') then d.brand else 'KHAC' end`;
const metrics = `coalesce(sum(f.spend),0)::float as spend,
  coalesce(sum(f.impressions),0)::float as impr, coalesce(sum(f.clicks),0)::float as clicks,
  coalesce(sum(f.conversions),0)::float as conv`;
const values = (r: Row) => ({ spend: n(r.spend), impr: n(r.impr), clicks: n(r.clicks), conv: n(r.conv) });

export async function googleDashboard(sql: Sql, start: string, end: string, previousStart: string) {
  const seg = sql.unsafe(segment);
  const add = sql.unsafe(metrics);
  const [coverage, monthly, daily, campaigns, channels, terms] = await Promise.all([
    sql<Row[]>`select window_from::text as start, window_to::text as end,
        max(finished_at)::text as synced_at from ads_sync_run
      where platform = 'google' and ok group by 1,2 order by 1,2`,
    sql<Row[]>`select to_char(f.stat_date,'YYYY-MM') as month, ${seg} as brand, ${add}
      from ads_campaign_daily f left join dim_ads_campaign d
        on d.platform = f.platform and d.campaign_id = f.campaign_id
      where f.platform = 'google' and coalesce(d.funnel,'store') <> 'hr' group by 1,2 order by 1,2`,
    sql<Row[]>`select f.stat_date::text as date, ${seg} as brand, ${add}
      from ads_campaign_daily f left join dim_ads_campaign d
        on d.platform = f.platform and d.campaign_id = f.campaign_id
      where f.platform = 'google' and coalesce(d.funnel,'store') <> 'hr'
        and f.stat_date between ${previousStart}::date and ${end}::date group by 1,2 order by 1,2`,
    sql<Row[]>`select f.campaign_id, d.campaign_name, d.store_code, ${seg} as brand,
        (array_agg(f.status order by f.stat_date desc))[1] as status, ${add}
      from ads_campaign_daily f left join dim_ads_campaign d
        on d.platform = f.platform and d.campaign_id = f.campaign_id
      where f.platform = 'google' and coalesce(d.funnel,'store') <> 'hr'
        and f.stat_date between ${start}::date and ${end}::date
      group by f.campaign_id,d.campaign_name,d.store_code,${seg}
      having sum(f.spend) > 0 or sum(f.clicks) > 0 order by sum(f.spend) desc`,
    sql<Row[]>`select f.network as channel, ${seg} as brand, ${add}
      from ads_network_daily f left join dim_ads_campaign d
        on d.platform = f.platform and d.campaign_id = f.campaign_id
      where f.platform = 'google' and coalesce(d.funnel,'store') <> 'hr'
        and f.stat_date between ${start}::date and ${end}::date group by 1,2 order by sum(f.spend) desc`,
    sql<Row[]>`select f.search_term as kw, ${seg} as brand, ${add}
      from ads_search_term_daily f left join dim_ads_campaign d
        on d.platform = f.platform and d.campaign_id = f.campaign_id
      where f.platform = 'google' and coalesce(d.funnel,'store') <> 'hr'
        and f.stat_date between ${start}::date and ${end}::date group by 1,2 order by sum(f.clicks) desc`,
  ]);
  const windows: Array<{ start: string; end: string }> = [];
  for (const row of coverage) {
    const w = { start: String(row.start), end: String(row.end) };
    const last = windows[windows.length - 1];
    if (last && Date.parse(w.start) <= Date.parse(last.end) + 86_400_000) {
      if (w.end > last.end) last.end = w.end;
    } else windows.push(w);
  }
  return {
    ready: windows.length > 0,
    coverage: windows,
    syncedThrough: windows.length ? windows[windows.length - 1].end : null,
    lastSuccess: coverage.map(r => String(r.synced_at)).sort().at(-1) ?? null,
    monthly: monthly.map(r => ({ month: String(r.month), brand: String(r.brand), ...values(r) })),
    daily: daily.map(r => ({ date: String(r.date), brand: String(r.brand), ...values(r) })),
    campaigns: campaigns.map(r => ({ campaignId: String(r.campaign_id), campaign: String(r.campaign_name ?? r.campaign_id),
      store: r.store_code == null ? null : String(r.store_code), brand: String(r.brand),
      status: String(r.status ?? 'UNKNOWN'), ...values(r) })),
    channels: channels.map(r => ({ channel: String(r.channel), brand: String(r.brand), ...values(r) })),
    terms: terms.map(r => ({ kw: String(r.kw), brand: String(r.brand), ...values(r) })),
  };
}
