/**
 * M5 · Digital Ads — VỎ của tab (28/09/2026 · sửa 14/10/2026).
 *
 * Việc duy nhất của file này: gọi `/api/ads/performance` rồi đưa vào `ads/AdsDashboard.tsx`
 * (ba tầng Blended → Meta → Google, M5_1 §9).
 *
 * 14/10/2026: BỎ màn hình EXPORT · bản cũ (Excel tay, grain tháng) — người dùng đọc nhầm
 * hai bộ số. API chưa sẵn sàng thì báo thẳng, không lặng lẽ rơi về Excel.
 * Băng đối chiếu API vs Excel chỉ hiện khi LỆCH (> 0,5%) — lệch > 2% là sai cấu trúc (M5_1 §3d).
 *
 * Tháng: M5 chọn được cả tháng Ads đang chạy (vd. T10/2026) dù POS mới tới T9 — xem `adsMonths()`.
 * Bộ lọc chung chỉ tính tháng có POS, nên kỳ của tab tự dựng từ `filters.from → filters.to`.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useFilters } from '../context/FilterContext';
import { MKT_DATA, LATEST_MONTH } from '../data';
import { formatVND, formatMonthLabel } from '../utils/formatters';
import type { AdsDashboardResponse } from '../types/ads';
import { AdsDashboard } from './ads/AdsDashboard';
import { adsMonths, isAdsOnlyMonth, monthEnd, yesterdayIct } from './ads/adsModel';

const dmy = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

export const DigitalAdsView: React.FC = () => {
  const { filters, setTo } = useFilters();

  /* Kỳ của tab trên danh sách tháng M5 (gồm tháng Ads đang chạy) + kỳ liền trước cùng số tháng. */
  const allMonths = useMemo(() => adsMonths(), []);
  const months = useMemo(
    () => allMonths.filter(m => m >= filters.from && m <= filters.to),
    [allMonths, filters.from, filters.to]);
  const prevMonths = useMemo(() => {
    const start = allMonths.indexOf(months[0]);
    const n = months.length;
    return start < 0 || n === 0 || start - n < 0 ? [] : allMonths.slice(start - n, start);
  }, [allMonths, months]);

  /* Rời M5 khi đang chọn tháng chỉ có Ads → kéo "Đến" về tháng POS cuối, để các cổng khác
     không cầm một giá trị không có trong ô chọn của chúng. */
  const filtersRef = React.useRef(filters);
  filtersRef.current = filters;
  useEffect(() => () => {
    if (isAdsOnlyMonth(filtersRef.current.to)) setTo(LATEST_MONTH);
  }, []);

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
  const cmpStart = !prevMonths.length && months.length >= 2 ? `${months[months.length - 1]}-01` : null;
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

  const running = months.filter(isAdsOnlyMonth);

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

      {/* Dòng nguồn — chỉ còn API (Meta Marketing API + Google Ads API), không còn công tắc Excel. */}
      <div className="rounded-xl border border-brand-border bg-brand-surface p-3 text-xs space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-brand-muted">Nguồn số liệu</span>
          <span className="text-[11px] text-brand-text">
            {state === 'loading' ? 'đang gọi API…'
              : state === 'ready' && api
                ? <>{api.google?.ready ? 'Meta + Google Ads API' : 'Meta Marketing API (Google từ Excel dự phòng)'} · theo ngày × chiến dịch
                    {' '}· đồng bộ tới <b>{api.syncedThrough ? dmy(api.syncedThrough) : "—"}</b></>
                : 'API chưa sẵn sàng'}
          </span>
          {running.length > 0 && (
            <span className="rounded bg-brand-gold/15 px-1.5 py-0.5 text-[10px] font-bold text-brand-gold">
              {running.map(formatMonthLabel).join(', ')} đang chạy · số tới hôm qua · chưa có doanh thu POS nên chưa tính ACR
            </span>
          )}
        </div>
        {reconcile && reconcile.level !== 'ok' && (
          <div className={`rounded-lg border p-2 text-[11px] ${
            reconcile.level === 'warn' ? 'border-status-warning/40 bg-status-warningBg/20 text-status-warning'
              : 'border-status-bad/40 bg-status-badBg/20 text-status-bad'}`}>
            <b>Đối chiếu Meta API vs Excel</b> ({reconcile.shared.map(formatMonthLabel).join(', ')}):
            {' '}API {formatVND(reconcile.apiSum)} · Excel {formatVND(reconcile.xlSum)} · lệch <b>{(reconcile.diff * 100).toFixed(2)}%</b>
            {reconcile.level === 'bad' && ' — VƯỢT 2%, sai cấu trúc chứ không phải làm tròn. Không dùng nguồn API cho tới khi tìm ra nguyên nhân.'}
            {reconcile.level === 'warn' && ' — trong ngưỡng nhưng cần ghi QA.'}
          </div>
        )}
      </div>

      {state === 'loading'
        ? <div className="rounded-xl border border-brand-border bg-brand-surface p-10 text-center text-xs text-brand-muted animate-pulse">Đang tải số liệu quảng cáo…</div>
        : state === 'ready' && api
          ? <AdsDashboard api={api} months={months} prevMonths={prevMonths} windowStart={windowStart} windowEnd={windowEnd}
              cmpApi={cmpStart ? cmpApi : null} cmpStart={cmpStart} />
          : <div className="rounded-xl border border-status-warning/40 bg-status-warningBg/20 p-6 text-center text-xs text-status-warning">
              <b>Chưa đọc được số quảng cáo từ API</b> (chưa cấu hình, chưa có dữ liệu cho kỳ này, hoặc mất mạng).
              <div className="mt-1 text-brand-muted">Kiểm tra <code>/api/ads/performance</code> và lượt đồng bộ <code>/api/ads/sync</code> — M5_1 §3.</div>
            </div>}
    </div>
  );
};
