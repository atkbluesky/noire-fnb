/**
 * M5.1 · GET /api/ads/performance — nguồn đọc cho nhánh API của M5.
 *
 * ❗ Endpoint này KHÔNG trả ACR.
 *
 * ACR = media spend ÷ net sales, mà `net sales` nằm ở `src/data/data.json`
 * (`store_month.net`, do `scripts/build-data.mjs` sinh từ Excel) — KHÔNG nằm trong
 * Postgres. Nên ở đây chỉ trả phần tử số + cờ tháng nào trọn kỳ; phép chia do
 * `DigitalAdsView` làm, vì view đã có sẵn cả hai vế.
 *
 * Trả 503 `{code:'NOT_CONFIGURED'}` khi chưa có DATABASE_URL — view bắt mã này và
 * TỰ RƠI về nguồn Excel thay vì để trống. Cùng khuôn `handleZaloPerformance` (M8.1).
 */
import { getSql, ictDate, json, monthEnd, isMonth, shiftDays, type AdsEnv, type Sql } from './_shared.js';

type Period = 'today' | '7d' | 'mtd' | 'month' | 'range';

const num = (value: unknown): number => Number(value) || 0;
const ratio = (a: number, b: number): number | null => (b > 0 ? a / b : null);

function periodWindow(url: URL): { period: Period; start: string; end: string } {
  const today = ictDate();
  const raw = url.searchParams.get('period') ?? '7d';

  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  if (from && to && /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return { period: 'range', start: from, end: to };
  }
  if (raw === 'today') return { period: 'today', start: today, end: today };
  if (raw === 'mtd') return { period: 'mtd', start: `${today.slice(0, 7)}-01`, end: today };
  if (raw === 'month') {
    const month = url.searchParams.get('month');
    const selected = month && isMonth(month) ? month : today.slice(0, 7);
    const end = monthEnd(selected);
    return { period: 'month', start: `${selected}-01`, end: end < today ? end : today };
  }
  return { period: '7d', start: shiftDays(today, -6), end: today };
}

interface MartRow {
  stat_date: string;
  brand: string;
  platform: string;
  store_spend: string;
  booking_spend: string;
  hr_spend: string;
  media_spend: string;
  impressions: string;
  clicks: string;
  reach: string | null;
  conversions: string;
  messaging_conversations: string;
  campaigns: number;
  paused_spend: string;
}

/** Cộng một tập dòng mart thành một khối số. */
function total(rows: MartRow[]) {
  const sum = (pick: (r: MartRow) => unknown) => rows.reduce((a, r) => a + num(pick(r)), 0);
  const mediaSpend = sum(r => r.media_spend);
  const impressions = sum(r => r.impressions);
  const clicks = sum(r => r.clicks);
  const messagingConversations = sum(r => r.messaging_conversations);
  return {
    totalSpend: mediaSpend + sum(r => r.hr_spend),
    mediaSpend,
    storeSpend: sum(r => r.store_spend),
    bookingSpend: sum(r => r.booking_spend),
    hrSpend: sum(r => r.hr_spend),
    impressions,
    clicks,
    conversions: sum(r => r.conversions),
    messagingConversations,
    pausedSpend: sum(r => r.paused_spend),
    campaigns: sum(r => r.campaigns),
    // Chỉ số dẫn xuất — chuẩn ngành, an toàn. Tuyệt đối KHÔNG có ROAS (M5_1 §3a).
    cpm: impressions > 0 ? (mediaSpend / impressions) * 1000 : null,
    cpc: ratio(mediaSpend, clicks),
    ctr: ratio(clicks, impressions),
    costPerConversation: ratio(mediaSpend, messagingConversations),
  };
}

function groupBy(rows: MartRow[], key: (r: MartRow) => string) {
  const map = new Map<string, MartRow[]>();
  for (const r of rows) {
    const k = key(r);
    const hit = map.get(k);
    if (hit) hit.push(r); else map.set(k, [r]);
  }
  return map;
}

export async function handleAdsPerformance(req: Request, env: AdsEnv = process.env): Promise<Response> {
  if (req.method !== 'GET') return json(405, { ok: false, error: 'Chỉ nhận GET' });
  if (!env.DATABASE_URL?.trim()) {
    return json(503, {
      ok: false, code: 'NOT_CONFIGURED',
      message: 'M5.1 đã sẵn sàng nhưng chưa có DATABASE_URL. Màn hình dùng nguồn Excel.',
    });
  }

  const url = new URL(req.url);
  const { period, start, end } = periodWindow(url);

  try {
    const sql: Sql = getSql(env);

    const rows = await sql<MartRow[]>`
      select stat_date::text, brand, platform, store_spend, booking_spend, hr_spend, media_spend,
             impressions, clicks, reach, conversions, messaging_conversations, campaigns, paused_spend
        from ads_daily_metric
       where stat_date between ${start}::date and ${end}::date
       order by stat_date`;

    if (!rows.length) {
      // Bảng có nhưng chưa chạy sync lần nào — nói rõ để view rơi về Excel,
      // KHÔNG trả 200 với số 0 (số 0 trông giống "không chi đồng nào").
      const [any] = await sql<{ n: number }[]>`select count(*)::int as n from ads_campaign_daily`;
      if (!num(any?.n)) {
        return json(503, {
          ok: false, code: 'NO_DATA',
          message: 'Chưa có dữ liệu ads. Chạy /api/ads/sync trước.',
        });
      }
    }

    /* Tháng nào TRỌN KỲ — điều kiện để hiện ACR (M5_1 §3b).
       Trọn kỳ = có dữ liệu tới đúng ngày cuối tháng. Có `stat_date` nên kiểm được
       bằng dữ liệu, không phải khai tay như `isPartialMonth` của nhánh Excel. */
    const months = await sql<{
      month: string; store_spend: string; booking_spend: string; hr_spend: string;
      media_spend: string; last_date: string;
    }[]>`
      select to_char(stat_date, 'YYYY-MM') as month,
             sum(store_spend)::text   as store_spend,
             sum(booking_spend)::text as booking_spend,
             sum(hr_spend)::text      as hr_spend,
             sum(media_spend)::text   as media_spend,
             max(stat_date)::text     as last_date
        from ads_daily_metric
       group by 1 order by 1`;

    /* Chiến dịch chưa gán brand — QA gate 11 + 13. Đưa lên response để màn hình
       hiện được cảnh báo thay vì im lặng nuốt tiền vào rổ 'Không xác định'. */
    const unmapped = await sql<{
      platform: string; campaign_id: string; campaign_name: string | null; spend: string;
    }[]>`
      select platform, campaign_id, campaign_name, spend::text
        from ads_unmapped_campaign
       where last_date >= ${start}::date and first_date <= ${end}::date
       order by spend desc limit 20`;

    const [freshness] = await sql<{
      last_sync: string | null; last_success: string | null; stuck: number; synced_through: string | null;
    }[]>`select
        (select max(started_at)::text  from ads_sync_run) as last_sync,
        (select max(finished_at)::text from ads_sync_run where ok) as last_success,
        (select count(*)::int from ads_sync_run
          where finished_at is null and started_at < now() - interval '30 minutes') as stuck,
        /* Đã KÉO tới ngày nào — khác hẳn "có chi tiêu tới ngày nào".
           T2/2026 ngừng chạy ads từ ngày 14, nhưng tháng đó VẪN trọn kỳ. */
        (select max(window_to)::text from ads_sync_run where ok) as synced_through`;

    const metrics = total(rows);
    const syncedThrough = freshness?.synced_through ?? null;

    const monthRows = months.map(m => ({
      month: m.month,
      mediaSpend: num(m.media_spend),
      storeSpend: num(m.store_spend),
      bookingSpend: num(m.booking_spend),
      hrSpend: num(m.hr_spend),
      lastDate: m.last_date,
      /**
       * true = tháng TRỌN KỲ, được phép hiện ACR (M5_1 §3b).
       *
       * Điều kiện là "đã KÉO hết tháng", KHÔNG phải "có chi tiêu ở ngày cuối tháng".
       * Bản đầu dùng `last_date >= monthEnd` và sai ngay ở T2/2026: ads ngừng chạy
       * từ ngày 14 nên tháng đó bị coi là dở dang và ACR bị giấu — trong khi T2 là
       * tháng hoàn chỉnh, chỉ là không chi tiền nửa cuối tháng.
       */
      complete: syncedThrough != null && syncedThrough >= monthEnd(m.month),
    }));

    const unknownShare = ratio(
      rows.filter(r => r.brand === 'Không xác định').reduce((a, r) => a + num(r.media_spend), 0),
      metrics.mediaSpend,
    );

    return json(200, {
      ok: true,
      source: 'Meta Marketing API + Google Ads API',
      period,
      window: { start, end },
      metrics,
      daily: [...groupBy(rows, r => r.stat_date)].map(([date, rs]) => ({ date, ...total(rs) })),
      byBrand: [...groupBy(rows, r => r.brand)]
        .map(([brand, rs]) => ({ brand, ...total(rs) }))
        .sort((a, b) => b.mediaSpend - a.mediaSpend),
      /* Lát tháng × brand — `DigitalAdsView` cần đúng lát này để dựng lại chuỗi
         ACR theo tháng có lọc brand, thay cho `MKT_DATA.ads_brand` của nhánh Excel.
         Không có lát này thì view phải tự gộp từ `daily`, mà `daily` đã bỏ chiều brand. */
      byMonthBrand: [...groupBy(rows, r => `${r.stat_date.slice(0, 7)} ${r.brand}`)]
        .map(([key, rs]) => {
          const [month, brand] = key.split(' ');
          return { month, brand, ...total(rs) };
        })
        .sort((a, b) => (a.month === b.month ? b.mediaSpend - a.mediaSpend : a.month < b.month ? -1 : 1)),
      byPlatform: [...groupBy(rows, r => r.platform)]
        .map(([platform, rs]) => ({ platform, ...total(rs) }))
        .sort((a, b) => b.mediaSpend - a.mediaSpend),
      months: monthRows,
      quality: {
        unknownBrandShare: unknownShare,
        /** QA gate 13 — tính THEO KỲ ĐANG XEM, không tính trung bình dài kỳ.
            Gate cũ của build_mkt.py gộp 8 tháng ra 4,5% và che mất T8 đang là 13,7%. */
        unknownBrandOk: unknownShare == null || unknownShare < 0.05,
        unmappedCampaigns: unmapped.map(u => ({
          platform: u.platform, campaignId: u.campaign_id,
          campaignName: u.campaign_name, spend: num(u.spend),
        })),
      },
      freshness: {
        lastSync: freshness?.last_sync ?? null,
        lastSuccess: freshness?.last_success ?? null,
        stuckRuns: num(freshness?.stuck),
      },
      definitions: {
        mediaSpend: 'Chi tiêu tính vào Ad Cost Ratio = store + booking. KHÔNG gồm chi tuyển dụng.',
        storeSpend: 'Phần nhắm doanh thu nhà hàng — mẫu số store_month.net dùng được cho phần này.',
        bookingSpend: 'Phần nhắm tiệc/catering (brand NEC). Doanh thu tương ứng do M10 theo dõi riêng, KHÔNG nằm trong store_month.net.',
        hrSpend: 'Chi tuyển dụng — không phải marketing thương hiệu, đã loại khỏi mediaSpend.',
        acr: 'KHÔNG tính ở đây. ACR = mediaSpend ÷ net sales, mà net sales nằm ở data.json. View tự chia.',
        acrFullMonth: 'Chỉ hiện ACR cho tháng có months[].complete = true (có dữ liệu tới ngày cuối tháng).',
        roas: 'CẤM dùng. NOIRE chỉ 8,6% hoá đơn có SĐT, Meta chỉ đo tới bước tin nhắn — không đủ attribution (M5 §2).',
        reach: 'Meta có, Google KHÔNG trả (null). Reach cộng giữa các chiến dịch là trùng người — đọc là tổng reach từng chiến dịch.',
      },
    });
  } catch (error) {
    console.error('[ads-performance]', error);
    return json(500, { ok: false, error: 'Không đọc được dữ liệu M5.1' });
  }
}

export const GET = (req: Request) => handleAdsPerformance(req, process.env);
export const POST = () => json(405, { ok: false, error: 'Chỉ nhận GET' });
