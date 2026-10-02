/**
 * M5 · Digital Ads — VỎ của tab (28/09/2026).
 *
 * Việc duy nhất của file này: gọi `/api/ads/performance`, rồi chọn MỘT trong hai màn hình
 *   · API    → `ads/AdsDashboard.tsx`       — ba tầng Blended → Meta → Google (M5_1 §9)
 *   · EXPORT → `ads/DigitalAdsExcelView.tsx` — màn hình gốc trước M5.1, giữ làm dự phòng
 *
 * API chưa sẵn sàng (503 NOT_CONFIGURED / NO_DATA, mất mạng) thì TỰ RƠI về EXPORT,
 * không để trống tab (QĐ-1). Công tắc luôn nhìn thấy được, và băng đối chiếu API vs
 * Excel luôn hiện — lệch > 2% là sai cấu trúc chứ không phải làm tròn (M5_1 §3d).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useFilters } from '../context/FilterContext';
import { MKT_DATA } from '../data';
import { formatVND, formatMonthLabel } from '../utils/formatters';
import type { AdsDashboardResponse } from '../types/ads';
import { AdsDashboard } from './ads/AdsDashboard';
import { DigitalAdsExcelView } from './ads/DigitalAdsExcelView';
import { monthEnd } from './ads/adsModel';

/** Hôm qua theo giờ ICT — dữ liệu Meta chốt tới hôm qua (cron 00:35 ICT). */
function yesterdayIct(): string {
  const now = new Date(Date.now() + 7 * 3600_000);
  now.setUTCDate(now.getUTCDate() - 1);
  return now.toISOString().slice(0, 10);
}

export const DigitalAdsView: React.FC = () => {
  const { selectedMonths, prevPeriodMonths } = useFilters();
  const months = selectedMonths;

  /* Kỳ Meta = các tháng đang lọc, cắt ở hôm qua (tháng đang chạy chưa có số hôm nay). */
  const windowStart = months.length ? `${months[0]}-01` : '';
  const windowEnd = useMemo(() => {
    if (!months.length) return '';
    const end = monthEnd(months[months.length - 1]);
    const y = yesterdayIct();
    return end < y ? end : y;
  }, [months.join(',')]);

  const [api, setApi] = useState<AdsDashboardResponse | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [preferApi, setPreferApi] = useState(true);

  useEffect(() => {
    if (!windowStart || !windowEnd || windowStart > windowEnd) { setState('unavailable'); return; }
    let alive = true;
    setState('loading');
    fetch(`/api/ads/performance?from=${windowStart}&to=${windowEnd}`)
      .then(async res => {
        const body = await res.json().catch(() => null);
        if (!alive) return;
        if (res.ok && body?.ok && Array.isArray(body.segments)) { setApi(body as AdsDashboardResponse); setState('ready'); }
        else { setApi(null); setState('unavailable'); }
      })
      .catch(() => { if (alive) { setApi(null); setState('unavailable'); } });
    return () => { alive = false; };
  }, [windowStart, windowEnd]);

  /* Kỳ chọn bắt đầu từ tháng dữ liệu đầu tiên (mặc định T1 → tháng trọn gần nhất) thì kỳ trước cùng
     số ngày của API rỗng → mọi mũi tên so sánh thành "—". Khi ấy gọi thêm một kỳ = tháng cuối kỳ;
     API trả kèm kỳ trước cùng số ngày của nó, dùng riêng cho mũi tên tăng/giảm (AGENTS.md QT2.3). */
  const cmpStart = !prevPeriodMonths.length && months.length >= 2 ? `${months[months.length - 1]}-01` : null;
  const [cmpApi, setCmpApi] = useState<AdsDashboardResponse | null>(null);
  useEffect(() => {
    setCmpApi(null);
    if (!cmpStart || !windowEnd || cmpStart > windowEnd) return;
    let alive = true;
    fetch(`/api/ads/performance?from=${cmpStart}&to=${windowEnd}`)
      .then(async res => {
        const body = await res.json().catch(() => null);
        if (alive && res.ok && body?.ok && Array.isArray(body.segments)) setCmpApi(body as AdsDashboardResponse);
      })
      .catch(() => { /* không có kỳ so sánh thì mũi tên giữ "—" như cũ */ });
    return () => { alive = false; };
  }, [cmpStart, windowEnd]);

  const useApi = preferApi && state === 'ready' && api != null;

  /* Đối chiếu Meta API vs Excel — chỉ trên tháng CẢ HAI nguồn cùng có, ĐỦ tháng. */
  const reconcile = useMemo(() => {
    if (!api) return null;
    const complete = new Set(api.months.filter(m => m.complete).map(m => m.month));
    const shared = months.filter(m => complete.has(m) && (MKT_DATA.ads_month ?? []).some(a => a.month === m));
    if (!shared.length) return null;
    const apiSum = api.segmentMonthly.filter(r => shared.includes(r.month)).reduce((a, r) => a + r.spend, 0);
    const xlSum = (MKT_DATA.ads_month ?? []).filter(a => shared.includes(a.month)).reduce((a, r) => a + (r.spend || 0), 0);
    if (!xlSum) return null;
    const diff = Math.abs(apiSum - xlSum) / xlSum;
    return { shared, apiSum, xlSum, diff, level: diff < 0.005 ? 'ok' : diff <= 0.02 ? 'warn' : 'bad' as 'ok' | 'warn' | 'bad' };
  }, [api, months.join(',')]);

  return (
    <div className="space-y-5 p-4 sm:p-6 max-w-[1600px] mx-auto">
      <div>
        <span className="text-[10px] font-extrabold uppercase tracking-widest text-brand-gold">TỐN BAO NHIÊU ĐỂ BÁN</span>
        <h2 className="text-xl font-extrabold text-brand-text font-display mt-0.5">M5 · Digital Ads (Meta &amp; Google)</h2>
        <p className="text-xs text-brand-muted mt-1">
          Đi từ tổng thể tới từng kênh. Thước đo chính là <b>Ad Cost Ratio (ACR = chi media ÷ doanh thu thuần)</b> — không dùng ROAS
          vì POS chỉ nhận diện được 8,6% hoá đơn và Meta chỉ đo tới bước tin nhắn.
        </p>
      </div>

      {/* Công tắc nguồn — QĐ-1: phải NHÌN THẤY ĐƯỢC */}
      <div className="rounded-xl border border-brand-border bg-brand-surface p-3 text-xs space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-brand-muted">Nguồn số liệu</span>
          <div className="flex overflow-hidden rounded-md border border-brand-border">
            <button onClick={() => setPreferApi(true)} disabled={state !== 'ready'}
              title={state !== 'ready' ? 'API chưa sẵn sàng' : 'Meta Marketing API — theo ngày'}
              className={`px-2.5 py-1 text-[11px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${useApi ? 'bg-brand-gold text-brand-dark' : 'text-brand-muted hover:text-brand-text'}`}>
              API · 3 tầng
            </button>
            <button onClick={() => setPreferApi(false)}
              className={`px-2.5 py-1 text-[11px] font-bold transition-colors ${!useApi ? 'bg-brand-gold text-brand-dark' : 'text-brand-muted hover:text-brand-text'}`}>
              EXPORT · bản cũ
            </button>
          </div>
          <span className="text-[11px] text-brand-faint">
            {state === 'loading' ? 'đang gọi API…'
              : useApi ? (api?.google?.ready ? 'Meta + Google Ads API · theo ngày × chiến dịch' : 'Meta Marketing API + Google từ Excel dự phòng')
                : state === 'unavailable' ? 'API chưa nối — đang chạy bằng Excel' : 'Excel export tay (grain tháng)'}
          </span>
        </div>
        {reconcile && (
          <div className={`rounded-lg border p-2 text-[11px] ${
            reconcile.level === 'ok' ? 'border-status-ok/40 bg-status-okBg/20 text-status-ok'
              : reconcile.level === 'warn' ? 'border-status-warning/40 bg-status-warningBg/20 text-status-warning'
                : 'border-status-bad/40 bg-status-badBg/20 text-status-bad'}`}>
            <b>Đối chiếu Meta API vs Excel</b> ({reconcile.shared.map(formatMonthLabel).join(', ')}):
            {' '}API {formatVND(reconcile.apiSum)} · Excel {formatVND(reconcile.xlSum)} · lệch <b>{(reconcile.diff * 100).toFixed(2)}%</b>
            {reconcile.level === 'bad' && ' — VƯỢT 2%, sai cấu trúc chứ không phải làm tròn. Không dùng nguồn API cho tới khi tìm ra nguyên nhân.'}
            {reconcile.level === 'warn' && ' — trong ngưỡng nhưng cần ghi QA.'}
          </div>
        )}
      </div>

      {/* Đang gọi API thì hiện khung chờ — không nhấp nháy màn hình Excel cũ rồi mới đổi. */}
      {state === 'loading' && preferApi
        ? <div className="rounded-xl border border-brand-border bg-brand-surface p-10 text-center text-xs text-brand-muted animate-pulse">Đang tải số liệu quảng cáo…</div>
        : useApi && api
          ? <AdsDashboard api={api} months={months} prevMonths={prevPeriodMonths} windowStart={windowStart} windowEnd={windowEnd}
              cmpApi={cmpStart ? cmpApi : null} cmpStart={cmpStart} />
          : <DigitalAdsExcelView />}
    </div>
  );
};
