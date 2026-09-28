/**
 * M5.1 · GET /api/ads/export?month=YYYY-MM — xuất báo cáo XLSX.
 *
 * Bốn sheet: Tổng hợp · Theo ngày · Theo chiến dịch · **Định nghĩa chỉ số**.
 * Sheet cuối bắt buộc có — để người đọc báo cáo không phải hỏi lại "ACR là gì",
 * và để mọi bản xuất ra đều mang theo luật CẤM dùng ROAS (M5_1 §3a).
 *
 * Bảo vệ: `Bearer CRON_SECRET` hoặc `Bearer ADS_EXPORT_SECRET`. Chưa đặt key nào
 * thì CHỈ `CRON_SECRET` mở được — chưa cấu hình là khoá, không phải mở.
 */
import ExcelJS from 'exceljs';
import { getSql, isMonth, json, monthEnd, type AdsEnv, type Sql } from './_shared.js';

const VND = '#,##0';
const PCT = '0.00%';

function authorized(req: Request, env: AdsEnv): boolean {
  const header = req.headers.get('authorization') ?? '';
  const cron = env.CRON_SECRET?.trim();
  const own = env.ADS_EXPORT_SECRET?.trim();
  if (cron && header === `Bearer ${cron}`) return true;
  if (own && header === `Bearer ${own}`) return true;
  return false;
}

const num = (value: unknown): number => Number(value) || 0;

export async function handleAdsExport(req: Request, env: AdsEnv = process.env): Promise<Response> {
  if (req.method !== 'GET') return json(405, { ok: false, error: 'Chỉ nhận GET' });
  if (!authorized(req, env)) return json(401, { ok: false, error: 'Thiếu CRON_SECRET hoặc ADS_EXPORT_SECRET' });
  if (!env.DATABASE_URL?.trim()) return json(503, { ok: false, code: 'NOT_CONFIGURED' });

  const url = new URL(req.url);
  const month = url.searchParams.get('month') ?? '';
  if (!isMonth(month)) return json(400, { ok: false, error: 'Cần ?month=YYYY-MM' });
  const from = `${month}-01`;
  const to = monthEnd(month);

  try {
    const sql: Sql = getSql(env);

    const daily = await sql<Array<{
      stat_date: string; brand: string; platform: string;
      store_spend: string; booking_spend: string; hr_spend: string; media_spend: string;
      impressions: string; clicks: string; conversions: string;
      messaging_conversations: string; campaigns: number; paused_spend: string;
    }>>`select stat_date::text, brand, platform, store_spend, booking_spend, hr_spend, media_spend,
               impressions, clicks, conversions, messaging_conversations, campaigns, paused_spend
          from ads_daily_metric
         where stat_date between ${from}::date and ${to}::date
         order by stat_date, brand, platform`;

    if (!daily.length) return json(404, { ok: false, error: `Chưa có dữ liệu cho ${month}` });

    const campaigns = await sql<Array<{
      platform: string; campaign_id: string; campaign_name: string | null;
      brand: string | null; objective: string | null; funnel: string | null;
      mapping_locked: boolean | null;
      spend: string; impressions: string; clicks: string; conversions: string;
      messaging_conversations: string; days: number;
    }>>`select f.platform, f.campaign_id,
               c.campaign_name, c.brand, c.objective, c.funnel, c.mapping_locked,
               sum(f.spend)::text as spend, sum(f.impressions)::text as impressions,
               sum(f.clicks)::text as clicks, sum(f.conversions)::text as conversions,
               sum(f.messaging_conversations)::text as messaging_conversations,
               count(*)::int as days
          from ads_campaign_daily f
          left join dim_ads_campaign c
            on c.platform = f.platform and c.campaign_id = f.campaign_id
         where f.stat_date between ${from}::date and ${to}::date
         group by f.platform, f.campaign_id, c.campaign_name, c.brand, c.objective, c.funnel, c.mapping_locked
         order by sum(f.spend) desc`;

    const [cover] = await sql<Array<{ last_date: string; first_date: string }>>`
      select max(stat_date)::text as last_date, min(stat_date)::text as first_date
        from ads_campaign_daily where stat_date between ${from}::date and ${to}::date`;

    const wb = new ExcelJS.Workbook();
    wb.creator = 'NOIRE Analytics Hub · M5.1 Ads Auto';
    wb.created = new Date();

    /* ── Sheet 1 · Tổng hợp ─────────────────────────────────────────────── */
    const s1 = wb.addWorksheet('Tổng hợp');
    s1.columns = [{ width: 34 }, { width: 20 }, { width: 58 }];
    const sum = (pick: (r: (typeof daily)[number]) => unknown) => daily.reduce((a, r) => a + num(pick(r)), 0);
    const media = sum(r => r.media_spend);
    const impressions = sum(r => r.impressions);
    const clicks = sum(r => r.clicks);
    const msg = sum(r => r.messaging_conversations);
    const complete = cover?.last_date === to;

    s1.addRow([`BÁO CÁO DIGITAL ADS · ${month}`]).font = { bold: true, size: 14 };
    s1.addRow([]);
    const put = (label: string, value: unknown, note = '', fmt = VND) => {
      const row = s1.addRow([label, value, note]);
      if (typeof value === 'number') row.getCell(2).numFmt = fmt;
      return row;
    };
    put('Kỳ dữ liệu', `${cover?.first_date ?? from} → ${cover?.last_date ?? to}`,
      complete ? 'Tháng TRỌN KỲ' : '⚠ Tháng CHƯA trọn kỳ — không dùng để tính ACR');
    s1.addRow([]);
    put('Chi tiêu media (vào ACR)', media, 'store + booking, KHÔNG gồm tuyển dụng');
    put('· nhắm doanh thu nhà hàng', sum(r => r.store_spend), 'mẫu số store_month.net dùng được');
    put('· nhắm tiệc / catering', sum(r => r.booking_spend), 'doanh thu tương ứng do M10 theo dõi riêng');
    put('Chi tuyển dụng (ngoài ACR)', sum(r => r.hr_spend), 'không phải marketing thương hiệu');
    put('Chi của chiến dịch đã tạm dừng', sum(r => r.paused_spend), 'tiền tiêu mà chiến dịch không còn chạy');
    s1.addRow([]);
    put('Lượt hiển thị', impressions, '', '#,##0');
    put('Lượt nhấp', clicks, '', '#,##0');
    put('Chuyển đổi', sum(r => r.conversions), 'Google trả số thập phân', '#,##0.00');
    put('Hội thoại bắt đầu', msg, 'Meta đo tới bước tin nhắn', '#,##0');
    s1.addRow([]);
    put('CPM', impressions > 0 ? (media / impressions) * 1000 : 0, 'chi ÷ hiển thị × 1000');
    put('CPC', clicks > 0 ? media / clicks : 0, 'chi ÷ lượt nhấp');
    put('CTR', impressions > 0 ? clicks / impressions : 0, 'lượt nhấp ÷ hiển thị', PCT);
    put('Cost per Conversation', msg > 0 ? media / msg : 0, 'chi ÷ hội thoại bắt đầu');
    s1.addRow([]);
    const warn = s1.addRow(['⚠ KHÔNG có ROAS trong báo cáo này — xem sheet "Định nghĩa chỉ số"']);
    warn.font = { bold: true, color: { argb: 'FFC00000' } };

    /* ── Sheet 2 · Theo ngày ────────────────────────────────────────────── */
    const s2 = wb.addWorksheet('Theo ngày');
    s2.columns = [
      { header: 'Ngày', key: 'd', width: 12 },
      { header: 'Brand', key: 'b', width: 16 },
      { header: 'Nền tảng', key: 'p', width: 10 },
      { header: 'Chi media', key: 'm', width: 15, style: { numFmt: VND } },
      { header: 'Nhà hàng', key: 's', width: 15, style: { numFmt: VND } },
      { header: 'Tiệc', key: 'bk', width: 15, style: { numFmt: VND } },
      { header: 'Tuyển dụng', key: 'hr', width: 15, style: { numFmt: VND } },
      { header: 'Hiển thị', key: 'i', width: 13, style: { numFmt: '#,##0' } },
      { header: 'Nhấp', key: 'c', width: 11, style: { numFmt: '#,##0' } },
      { header: 'Chuyển đổi', key: 'cv', width: 12, style: { numFmt: '#,##0.00' } },
      { header: 'Hội thoại', key: 'msg', width: 11, style: { numFmt: '#,##0' } },
    ];
    s2.getRow(1).font = { bold: true };
    s2.views = [{ state: 'frozen', ySplit: 1 }];
    for (const r of daily) {
      s2.addRow({
        d: r.stat_date, b: r.brand, p: r.platform,
        m: num(r.media_spend), s: num(r.store_spend), bk: num(r.booking_spend), hr: num(r.hr_spend),
        i: num(r.impressions), c: num(r.clicks), cv: num(r.conversions), msg: num(r.messaging_conversations),
      });
    }

    /* ── Sheet 3 · Theo chiến dịch ──────────────────────────────────────── */
    const s3 = wb.addWorksheet('Theo chiến dịch');
    s3.columns = [
      { header: 'Nền tảng', key: 'p', width: 10 },
      { header: 'Chiến dịch', key: 'n', width: 52 },
      { header: 'Brand', key: 'b', width: 16 },
      { header: 'Mục tiêu', key: 'o', width: 15 },
      { header: 'Phễu', key: 'f', width: 10 },
      { header: 'Gán tay', key: 'l', width: 9 },
      { header: 'Chi tiêu', key: 's', width: 15, style: { numFmt: VND } },
      { header: 'Hiển thị', key: 'i', width: 13, style: { numFmt: '#,##0' } },
      { header: 'Nhấp', key: 'c', width: 11, style: { numFmt: '#,##0' } },
      { header: 'Chuyển đổi', key: 'cv', width: 12, style: { numFmt: '#,##0.00' } },
      { header: 'Hội thoại', key: 'msg', width: 11, style: { numFmt: '#,##0' } },
      { header: 'Số ngày chạy', key: 'd', width: 13 },
      { header: 'CPC', key: 'cpc', width: 13, style: { numFmt: VND } },
    ];
    s3.getRow(1).font = { bold: true };
    s3.views = [{ state: 'frozen', ySplit: 1 }];
    for (const r of campaigns) {
      const spend = num(r.spend);
      const cl = num(r.clicks);
      const row = s3.addRow({
        p: r.platform, n: r.campaign_name ?? `(chưa có tên · ${r.campaign_id})`,
        b: r.brand ?? 'Không xác định', o: r.objective ?? '', f: r.funnel ?? 'store',
        l: r.mapping_locked ? 'có' : '', s: spend,
        i: num(r.impressions), c: cl, cv: num(r.conversions),
        msg: num(r.messaging_conversations), d: r.days, cpc: cl > 0 ? spend / cl : 0,
      });
      // Chưa gán brand = tiền đang rơi khỏi mọi phân tích theo brand → tô đỏ cho thấy ngay.
      if (!r.brand || r.brand === 'Không xác định') {
        row.getCell('b').font = { bold: true, color: { argb: 'FFC00000' } };
      }
    }

    /* ── Sheet 4 · Định nghĩa chỉ số ────────────────────────────────────── */
    const s4 = wb.addWorksheet('Định nghĩa chỉ số');
    s4.columns = [
      { header: 'Chỉ số', key: 'k', width: 26 },
      { header: 'Công thức', key: 'f', width: 34 },
      { header: 'Phải đọc thế nào', key: 'n', width: 76 },
    ];
    s4.getRow(1).font = { bold: true };
    const defs: Array<[string, string, string]> = [
      ['Ad Cost Ratio (ACR)', 'chi media ÷ doanh thu thuần',
        'Chỉ số chính báo cáo BOD. CHỈ tính trên tháng TRỌN KỲ — chi ads đủ tháng mà doanh thu mới có nửa tháng sẽ thổi ACR lên gấp đôi (T8 ra 1,55% thay vì 0,74% thật).'],
      ['Chi media', 'store + booking',
        'KHÔNG gồm chi tuyển dụng — tuyển dụng không phải marketing thương hiệu.'],
      ['· nhắm nhà hàng (store)', '', 'Phần duy nhất có mẫu số tương ứng trong store_month.net.'],
      ['· nhắm tiệc (booking)', '', 'Brand NEC — NOIRE Events & Catering. Doanh thu tiệc do M10 theo dõi riêng, KHÔNG nằm trong store_month.net. Để trong tử số mà mẫu số không có sẽ làm ACR cao hơn thực tế.'],
      ['Cost per Conversation', 'chi ÷ hội thoại bắt đầu', 'Meta đo được tới bước tin nhắn. Không đo được tới đơn hàng.'],
      ['CPM · CPC · CTR', 'chi÷hiển thị×1000 · chi÷nhấp · nhấp÷hiển thị', 'Chuẩn ngành.'],
      ['Reach', '', 'Meta có, Google KHÔNG trả. Reach cộng giữa các chiến dịch là trùng người — đọc là tổng reach từng chiến dịch, không phải số người duy nhất.'],
      ['Chuyển đổi', '', 'Google trả số THẬP PHÂN vì attribution phân số. Không làm tròn thành số nguyên.'],
      ['❌ ROAS', 'CẤM DÙNG',
        'NOIRE không có attribution đủ mạnh: chỉ 8,6% hoá đơn có SĐT, và Meta chỉ đo tới bước tin nhắn. Không nói được doanh thu nào do quảng cáo tạo ra. Dùng ACR thay thế. Nếu có ai đưa ROAS cho NOIRE, hỏi họ lấy attribution ở đâu.'],
      ['Net / Meta spend', 'doanh thu ÷ chi Meta',
        'Là TƯƠNG QUAN, không phải nhân quả. Không được đọc thành "1 đồng ads ra X đồng doanh thu".'],
    ];
    for (const [k, f, n] of defs) {
      const row = s4.addRow({ k, f, n });
      row.alignment = { wrapText: true, vertical: 'top' };
      if (k.startsWith('❌')) row.font = { bold: true, color: { argb: 'FFC00000' } };
    }
    s4.addRow([]);
    s4.addRow({ k: 'Nguồn', f: 'Meta Marketing API + Google Ads API', n: `Xuất ${new Date().toISOString()} · module M5.1 · grain ngày × chiến dịch` });

    const buffer = await wb.xlsx.writeBuffer();
    return new Response(buffer as ArrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="NOIRE-digital-ads-${month}.xlsx"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('[ads-export]', error);
    return json(500, { ok: false, error: 'Không xuất được báo cáo M5.1' });
  }
}

export const GET = (req: Request) => handleAdsExport(req, process.env);
export const POST = () => json(405, { ok: false, error: 'Chỉ nhận GET' });
