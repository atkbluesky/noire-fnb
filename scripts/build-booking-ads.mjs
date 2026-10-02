/**
 * M10 · Chi phí ads booking tháng CHƯA có file Meta Ads — kéo từ Postgres M5.1 → data_input/booking_ads_api.json
 *
 *   node scripts/build-booking-ads.mjs                 (mặc định: các tháng không có trong sheet ads_campaign_detail)
 *   node scripts/build-booking-ads.mjs 2026-09 2026-10
 *
 * Lấy chiến dịch `dim_ads_campaign.funnel = 'booking'` (luật `$booking.ads` đã gắn sẵn ở M5.1, gồm brand NEC).
 * Cùng định nghĩa cột với file Meta Ads: click = link_clicks · hội thoại = messaging_conversations · form = leads.
 * Không có DATABASE_URL → giữ nguyên file cũ. build-data.mjs §4b chỉ dùng các tháng này khi sheet tháng đó
 * KHÔNG có dòng ads booking — file Meta Ads về sau luôn thắng.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data_input', 'booking_ads_api.json');

function databaseUrl() {
  if (process.env.DATABASE_URL?.trim()) return process.env.DATABASE_URL.trim();
  const f = path.join(ROOT, '.env.local');
  if (!fs.existsSync(f)) return null;
  const line = fs.readFileSync(f, 'utf8').split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
  return line ? line.slice('DATABASE_URL='.length).replace(/^["']|["']$/g, '').trim() || null : null;
}

const rkindOf = (name, msgs, leads) =>
  msgs > 0 || /message|tin nh[aắ]n/i.test(name) ? 'msg'
    : leads > 0 || /lead/i.test(name) ? 'lead'
      : /like/i.test(name) ? 'like'
        : /engage|t[uư]ơng t[aá]c/i.test(name) ? 'engage' : 'click';

const months = process.argv.slice(2).filter((a) => /^\d{4}-\d{2}$/.test(a));
if (!months.length) {
  console.error('Cho ít nhất một tháng, vd: node scripts/build-booking-ads.mjs 2026-09');
  process.exit(1);
}
const url = databaseUrl();
if (!url) {
  console.log('[booking-ads] không có DATABASE_URL — giữ nguyên booking_ads_api.json');
  process.exit(0);
}

const { default: postgres } = await import('postgres');
const sql = postgres(url, { ssl: 'require', max: 1, connect_timeout: 15 });
const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : { months: {} };
try {
  const [sync] = await sql`select min(t)::text as through from (
      select max(window_to) as t from ads_sync_run where ok group by platform) x`;
  for (const m of months) {
    const from = `${m}-01`;
    const rows = await sql`
      select coalesce(d.campaign_name, c.campaign_id) as campaign, d.brand,
             sum(c.spend)::float as spend, sum(c.impressions)::float as impr,
             sum(c.link_clicks)::float as clicks, sum(c.messaging_conversations)::float as msgs,
             sum(c.leads)::float as leads, max(c.stat_date)::text as last_day
        from ads_campaign_daily c
        join dim_ads_campaign d on d.platform = c.platform and d.campaign_id = c.campaign_id
       where c.platform = 'meta' and d.funnel = 'booking'
         and c.stat_date >= ${from}::date and c.stat_date < (${from}::date + interval '1 month')
       group by 1, 2
      having sum(c.spend) > 0
       order by 3 desc`;
    prev.months[m] = {
      through: rows.map((r) => r.last_day).sort().at(-1) ?? null,
      campaigns: rows.map((r) => {
        const page = String(r.campaign).split('|')[0].trim().toUpperCase();
        const kind = rkindOf(r.campaign, r.msgs, r.leads);
        return {
          campaign: r.campaign, page: /^[A-Z]{2,4}$/.test(page) ? page : null, brand: r.brand === 'NEC' ? 'Không xác định' : (r.brand ?? null),
          rkind: kind, spend: Math.round(r.spend), impr: Math.round(r.impr ?? 0), clicks: Math.round(r.clicks ?? 0),
          result: Math.round(kind === 'lead' ? r.leads : r.msgs ?? 0),
        };
      }),
    };
    const t = prev.months[m].campaigns;
    console.log(`[booking-ads] ${m}: ${t.length} chiến dịch · chi ${t.reduce((a, r) => a + r.spend, 0).toLocaleString('vi-VN')} đ`
      + ` · tới ${prev.months[m].through}`);
  }
  prev.synced_through = sync?.through ?? null;
  prev.pulled_at = new Date().toISOString();
  fs.writeFileSync(OUT, JSON.stringify(prev, null, 1));
} finally {
  await sql.end({ timeout: 5 });
}
