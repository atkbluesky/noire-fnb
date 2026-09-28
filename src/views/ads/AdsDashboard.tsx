/**
 * M5 · Digital Ads — màn hình BA TẦNG (28/09/2026).
 *
 *   TẦNG 1 · Tổng quan trả phí   — tiền có nằm trong khung doanh thu, giải ngân có đúng nhịp?
 *   TẦNG 2 · Meta Ads            — mỗi đồng Meta mua được bao nhiêu hội thoại/lead, tệp có bão hoà?
 *   TẦNG 3 · Google Ads          — Google bắt nhu cầu tìm quán ở kênh nào, rẻ hay đắt?
 *
 * Trục phân tách: 4 MẢNG — NCB · NDC · NJFB (ăn tại chỗ) + Tiệc (NEC). Xem M5_1 §9.
 * Công thức ở `adsModel.ts`; file này chỉ trình bày.
 *
 * Luật biểu đồ (dataviz, đã chạy validator): KHÔNG trục kép — hai thước đo khác đơn vị
 * thì hai biểu đồ xếp dọc chung trục thời gian. Màu đi theo MẢNG, thứ tự cố định.
 * Mọi biểu đồ có bảng số đi kèm (bắt buộc vì 2 màu nền sáng < 3:1 tương phản).
 */
import React, { useMemo, useState } from 'react';
import type { EChartsOption } from 'echarts';
import { MKT_DATA, HUB_DATA } from '../../data';
import { useFilters } from '../../context/FilterContext';
import { Card } from '../../components/common/Card';
import { MetricCard } from '../../components/common/MetricCard';
import { StatusBadge } from '../../components/common/StatusBadge';
import { DataTable, type Column } from '../../components/common/DataTable';
import { EChartWrapper } from '../../components/charts/EChartWrapper';
import { formatVND, formatNumber, formatPercent, formatMonthLabel } from '../../utils/formatters';
import type { AdsCampaignRow, AdsDashboardResponse, AdsSegment } from '../../types/ads';
import {
  ACCENT, PLAN_GRAY, PLATFORM_COLOR, SEGMENTS, SEGMENT_LABEL, SEGMENT_SHORT, STATUS_TEXT,
  acrStatus, acrTarget, addEff, addUp, costDelta, effRatios, frequencyStatus, googleMonthly, mediaSpend,
  monthEnd, monthSegmentSpend, netByMonth, pacingStatus, pageColor, planMonths, planRows,
  planToDate, ratios, revenuePartial, segmentColor, volumeDelta, type Status,
} from './adsModel';

type SegFilter = 'ALL' | AdsSegment;

interface Props {
  api: AdsDashboardResponse;
  months: string[];
  prevMonths: string[];
  windowStart: string;
  windowEnd: string;
}

const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const dmy = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const vnd = (n: number | null | undefined) => (n == null ? '—' : `${formatNumber(Math.round(n))} đ`);
const pct = (n: number | null | undefined, d = 1) => (n == null ? '—' : formatPercent(n, d));

const BADGE: Record<Status, 'ok' | 'warning' | 'bad' | 'neutral'> = {
  ok: 'ok', warning: 'warning', bad: 'bad', neutral: 'neutral',
};

/** Tiêu đề tầng: số tầng · tên · câu hỏi tầng đó trả lời. */
const TierHeader: React.FC<{ n: number; title: string; question: string; note?: React.ReactNode }> = ({ n, title, question, note }) => (
  <div className="pt-2">
    <div className="flex items-baseline gap-2">
      <span className="rounded bg-brand-gold/15 px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-widest text-brand-gold">
        Tầng {n}
      </span>
      <h3 className="text-base font-extrabold text-brand-text font-display">{title}</h3>
    </div>
    <p className="mt-1 text-xs text-brand-muted"><b className="text-brand-text">Câu hỏi:</b> {question}</p>
    {note && <p className="mt-0.5 text-[11px] text-brand-faint">{note}</p>}
  </div>
);

/** Dòng phụ dưới số lớn: nhãn + mức thay đổi có màu theo NGHĨA (chi phí giảm = tốt). */
const Delta: React.FC<{ d: { text: string; status: Status }; suffix?: string }> = ({ d, suffix = 'vs kỳ trước' }) => (
  <span>
    <b className={STATUS_TEXT[d.status]}>{d.text}</b>
    <span className="ml-1 text-[10px] text-brand-faint">{suffix}</span>
  </span>
);

export const AdsDashboard: React.FC<Props> = ({ api, months, prevMonths, windowStart, windowEnd }) => {
  const { theme, filters } = useFilters();
  const dark = theme === 'dark';
  const surface = dark ? '#141417' : '#FFFFFF';
  const platformColor = PLATFORM_COLOR(dark);
  /** Chữ trên biểu đồ mang màu CHỮ, không mang màu chuỗi; bỏ viền trắng mặc định của ECharts
      (viền đó làm số nhoè trên nền tối — thấy rõ khi chụp màn hình 28/09/2026). */
  const ink = dark ? '#F3F2EE' : '#18181B';
  const LBL = { color: ink, textBorderWidth: 0, fontSize: 11 } as const;

  /* Bộ lọc MẢNG của riêng tab — mặc định theo brand của bộ lọc chung. */
  const [seg, setSeg] = useState<SegFilter>(
    ['NCB', 'NDC', 'NJFB'].includes(filters.brand) ? (filters.brand as AdsSegment) : 'ALL');

  /** Các mảng đang được tính. 'ALL' gồm cả KHAC (chưa gán) để tổng khớp; HR luôn ngoài. */
  const segList: AdsSegment[] = seg === 'ALL' ? [...SEGMENTS, 'KHAC'] : [seg];
  const brandOnly = seg === 'NCB' || seg === 'NDC' || seg === 'NJFB' ? seg : null;

  /* ═══ Số liệu nền ═══════════════════════════════════════════════════════ */

  const meta = useMemo(() => {
    const cur = addUp(api.segments.filter(s => segList.includes(s.segment)).map(s => s.current));
    const prev = addUp(api.segments.filter(s => segList.includes(s.segment)).map(s => s.previous));
    const eff = addEff(api.efficiency.filter(e => segList.includes(e.segment)).map(e => e.current));
    const effPrev = addEff(api.efficiency.filter(e => segList.includes(e.segment)).map(e => e.previous));
    return { cur, prev, r: ratios(cur), rp: ratios(prev), e: effRatios(eff), ep: effRatios(effPrev), eff };
  }, [api, seg]);

  const googleApi = api.google?.ready ? api.google : null;
  const googleRows = useMemo(() => googleMonthly(api), [api]);
  const googleCovered = !googleApi || googleApi.coverage.some(w => w.start <= windowStart && w.end >= windowEnd);
  const googleLabel = googleApi ? 'Google Ads API' : 'Excel dự phòng';
  const google = useMemo(() => {
    const pick = (ms: string[]) => googleRows.filter(g =>
      ms.includes(g.month) && seg !== 'TIEC' && (seg === 'ALL' || g.brand === seg));
    const sum = (rs: typeof googleRows) => rs.reduce(
      (a, g) => ({ spend: a.spend + g.spend, conv: a.conv + g.conv, clicks: a.clicks + g.clicks, impr: a.impr + g.impr }),
      { spend: 0, conv: 0, clicks: 0, impr: 0 });
    const inRange = (start: string, end: string) => (googleApi?.daily ?? [])
      .filter(g => g.date >= start && g.date <= end && (seg === 'ALL' || g.brand === seg))
      .map(g => ({ ...g, month: g.date.slice(0, 7) }));
    const cur = sum(googleApi ? inRange(windowStart, windowEnd) : pick(months));
    const prev = sum(googleApi ? inRange(api.previous.start, api.previous.end) : pick(prevMonths));
    const monthsWith = [...new Set(pick(months).map(g => g.month))].sort();
    return { cur, prev, monthsWith };
  }, [googleRows, months, prevMonths, seg, googleApi, windowStart, windowEnd, api.previous]);

  const hrCur = api.segments.find(s => s.segment === 'HR')?.current.spend ?? 0;
  const tiecCur = api.segments.find(s => s.segment === 'TIEC')?.current.spend ?? 0;

  /* ═══ TẦNG 1 ════════════════════════════════════════════════════════════ */

  const monthly = useMemo(() => monthSegmentSpend(api), [api]);
  const metaComplete = useMemo(() => new Set(api.months.filter(m => m.complete).map(m => m.month)), [api]);

  /** Tháng trọn kỳ: doanh thu đủ tháng VÀ Meta đã kéo hết tháng. */
  const isComplete = (m: string) => !revenuePartial(m) && metaComplete.has(m);

  const acr = useMemo(() => {
    if (seg === 'TIEC') return null;
    const net = netByMonth(brandOnly);
    const inWindow = months.filter(isComplete);
    const fallback = monthly.map(r => r.month).filter(m => isComplete(m) && m <= (months[months.length - 1] ?? m));
    const month = inWindow[inWindow.length - 1] ?? fallback[fallback.length - 1];
    if (!month) return null;
    const row = monthly.find(r => r.month === month);
    if (!row || !net[month]) return null;
    const media = mediaSpend(row, brandOnly);
    const dinein = brandOnly ? media : media - (row.meta.TIEC || 0);
    return {
      month,
      inWindow: inWindow.includes(month),
      value: media / net[month],
      dinein: dinein / net[month],
      target: acrTarget(brandOnly),
      media,
      net: net[month],
    };
  }, [monthly, months, seg, api]);

  const blended = useMemo(() => {
    const spend = meta.cur.spend + google.cur.spend;
    const spendPrev = meta.prev.spend + google.prev.spend;
    const actions = meta.cur.messages + meta.cur.leads + google.cur.conv;
    const actionsPrev = meta.prev.messages + meta.prev.leads + google.prev.conv;
    return {
      spend, spendPrev, actions, actionsPrev,
      cpa: actions > 0 ? spend / actions : null,
      cpaPrev: actionsPrev > 0 ? spendPrev / actionsPrev : null,
      metaShare: spend > 0 ? meta.cur.spend / spend : null,
      googleShare: spend > 0 ? google.cur.spend / spend : null,
    };
  }, [meta, google]);

  /* Giải ngân Q3 — độc lập với kỳ đang xem: đây là câu hỏi kiểm soát ngân sách QUÝ. */
  const pacing = useMemo(() => {
    const q3 = planMonths();
    const plans = planRows();
    const metaThrough = api.syncedThrough;
    const gMonths = googleRows.map(g => g.month).sort();
    const googleThrough = googleApi ? googleApi.syncedThrough : gMonths.length ? monthEnd(gMonths[gMonths.length - 1]) : null;
    const metaActual = (line: 'dinein' | 'tiec') => api.segmentMonthly
      .filter(r => q3.includes(r.month) && (line === 'tiec' ? r.segment === 'TIEC' : ['NCB', 'NDC', 'NJFB', 'KHAC'].includes(r.segment)))
      .reduce((a, r) => a + r.spend, 0);
    const googleActual = (line: 'dinein' | 'tiec') => googleRows
      .filter(g => q3.includes(g.month) && (line === 'tiec' ? g.brand === 'TIEC' : g.brand !== 'TIEC'))
      .reduce((a, g) => a + g.spend, 0);

    const rows = plans.map(p => {
      const through = p.channel === 'Meta Ads' ? metaThrough : p.channel === 'Google Ads' ? googleThrough : null;
      const actual = p.channel === 'Meta Ads' ? metaActual(p.line) : p.channel === 'Google Ads' ? googleActual(p.line) : null;
      const planTD = through ? planToDate(p.byMonth, q3, through) : null;
      const ratio = actual != null && planTD ? actual / planTD : null;
      return {
        key: `${p.channel}-${p.line}`,
        channel: p.channel.replace(' Ads', ''),
        line: p.line === 'tiec' ? 'Tiệc' : 'Ăn tại chỗ',
        planQ3: p.total, planTD, actual, ratio, through,
        status: actual == null ? 'neutral' as Status : pacingStatus(ratio),
      };
    });
    const tracked = rows.filter(r => r.actual != null && r.planTD != null);
    const tPlanTD = tracked.reduce((a, r) => a + (r.planTD || 0), 0);
    const tActual = tracked.reduce((a, r) => a + (r.actual || 0), 0);
    return {
      rows,
      q3,
      planQ3: rows.reduce((a, r) => a + r.planQ3, 0),
      tPlanTD, tActual,
      tRatio: tPlanTD ? tActual / tPlanTD : null,
    };
  }, [api, googleRows]);

  /* Biểu đồ A — chi media theo tháng × mảng (Meta + Google), tô vùng kỳ đang xem. */
  const optSpendMonth = useMemo<EChartsOption>(() => {
    const ms = monthly.map(r => r.month);
    const segs = seg === 'ALL' ? SEGMENTS : [seg];
    const inWin = ms.filter(m => months.includes(m));
    return {
      tooltip: {
        trigger: 'axis', axisPointer: { type: 'shadow' },
        valueFormatter: (v: unknown) => vnd(Number(v)),
      },
      legend: { top: 0, itemWidth: 12, itemHeight: 8 },
      grid: { top: 32, right: 12, bottom: 24, left: 58 },
      xAxis: { type: 'category', data: ms.map(formatMonthLabel) },
      yAxis: { type: 'value', axisLabel: { formatter: (v: number) => formatVND(v, 0) } },
      series: segs.map((s, i) => ({
        name: SEGMENT_SHORT[s],
        type: 'bar',
        stack: 'media',
        barMaxWidth: 34,
        itemStyle: {
          color: segmentColor(s, dark), borderColor: surface, borderWidth: 1,
          borderRadius: i === segs.length - 1 ? [4, 4, 0, 0] : 0,
        },
        data: monthly.map(r => Math.round(mediaSpend(r, s))),
        ...(i === 0 && inWin.length ? {
          markArea: {
            silent: true,
            itemStyle: { color: dark ? 'rgba(197,160,89,0.07)' : 'rgba(197,160,89,0.10)' },
            data: [[{ xAxis: formatMonthLabel(inWin[0]) }, { xAxis: formatMonthLabel(inWin[inWin.length - 1]) }]],
          },
        } : {}),
      })),
    };
  }, [monthly, seg, months, dark]);

  /* Biểu đồ B — ACR theo tháng (chỉ tháng trọn kỳ) so mục tiêu. Một trục: phần trăm. */
  const optAcr = useMemo<EChartsOption | null>(() => {
    if (seg === 'TIEC') return null;
    const net = netByMonth(brandOnly);
    const ms = monthly.map(r => r.month).filter(m => net[m]);
    const target = acrTarget(brandOnly);
    const val = (m: string, dineinOnly: boolean) => {
      if (!isComplete(m)) return null;
      const r = monthly.find(x => x.month === m)!;
      const media = mediaSpend(r, brandOnly);
      const v = (dineinOnly && !brandOnly ? media - (r.meta.TIEC || 0) : media) / net[m];
      return Number((v * 100).toFixed(3));
    };
    const main = ms.map(m => val(m, false));
    const lastIdx = main.reduce<number>((acc, v, i) => (v != null ? i : acc), -1);
    /* Trục Y phải chứa được đường mục tiêu — bản đầu để trục tự co theo dữ liệu (tối đa 0,98%)
       nên mục tiêu 1,07% nằm NGOÀI khung và biến mất. Thấy khi chụp màn hình 28/09/2026. */
    const yMax = Math.max(...main.filter((v): v is number => v != null), target != null ? target * 100 : 0) * 1.18;
    const series: EChartsOption['series'] = [{
      name: brandOnly ? `ACR ${brandOnly}` : 'ACR toàn hệ thống',
      type: 'line', data: main, connectNulls: false,
      lineStyle: { width: 2, color: ACCENT }, itemStyle: { color: ACCENT }, symbolSize: 8,
      // Nhãn CHỌN LỌC: chỉ điểm cuối có số — không gắn số lên mọi điểm (dataviz).
      label: { show: true, position: 'top', ...LBL, fontWeight: 'bold',
        formatter: (p: any) => (p.value == null || p.dataIndex !== lastIdx ? '' : `${Number(p.value).toFixed(2)}%`) },
      markLine: target == null ? undefined : {
        silent: true, symbol: 'none',
        lineStyle: { type: 'dotted', color: PLAN_GRAY(dark), width: 2 },
        label: { formatter: `Mục tiêu ${(target * 100).toFixed(2)}%`, position: 'insideStartTop', ...LBL, fontSize: 10 },   // bên TRÁI — bên phải là nhãn điểm cuối
        data: [{ yAxis: Number((target * 100).toFixed(3)) }],
      },
    }];
    if (!brandOnly) {
      series.push({
        name: 'ACR ăn tại chỗ (bỏ chi tiệc)',
        type: 'line', data: ms.map(m => val(m, true)), connectNulls: false,
        lineStyle: { width: 2, type: 'dashed', color: ACCENT }, itemStyle: { color: ACCENT }, symbolSize: 8,
      });
    }
    return {
      tooltip: { trigger: 'axis', valueFormatter: (v: unknown) => (v == null ? '— (tháng chưa trọn kỳ)' : `${Number(v).toFixed(2)}%`) },
      legend: { top: 0 },
      grid: { top: 34, right: 16, bottom: 24, left: 44 },
      xAxis: { type: 'category', data: ms.map(formatMonthLabel) },
      yAxis: { type: 'value', axisLabel: { formatter: (v: number) => `${v.toFixed(2)}%` }, min: 0, max: Number(yMax.toFixed(2)) },
      series,
    };
  }, [monthly, seg, dark, api]);

  /* Biểu đồ C — kế hoạch vs thực chi từng tháng Q3. */
  const optPlanMonth = useMemo<EChartsOption>(() => {
    const q3 = pacing.q3;
    const plans = planRows().filter(p => p.channel !== 'Zalo Ads' && (seg === 'TIEC' ? p.line === 'tiec' : seg === 'ALL' ? true : p.line === 'dinein'));
    const planBy = q3.map(m => plans.reduce((a, p) => a + (p.byMonth[m] || 0), 0));
    const actualBy = q3.map(m => {
      const r = monthly.find(x => x.month === m);
      if (!r) return 0;
      if (seg === 'TIEC') return r.meta.TIEC || 0;
      if (seg === 'ALL') return mediaSpend(r, null);
      return mediaSpend(r, null) - (r.meta.TIEC || 0);   // brand: file ngân sách không chia theo brand
    });
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v: unknown) => vnd(Number(v)) },
      legend: { top: 0 },
      grid: { top: 32, right: 12, bottom: 24, left: 58 },
      xAxis: { type: 'category', data: q3.map(formatMonthLabel) },
      yAxis: { type: 'value', axisLabel: { formatter: (v: number) => formatVND(v, 0) } },
      series: [
        { name: 'Kế hoạch', type: 'bar', barMaxWidth: 28, data: planBy.map(Math.round),
          itemStyle: { color: PLAN_GRAY(dark), borderRadius: [4, 4, 0, 0] } },
        { name: 'Thực chi', type: 'bar', barMaxWidth: 28, data: actualBy.map(Math.round),
          itemStyle: { color: ACCENT, borderRadius: [4, 4, 0, 0] },
          label: { show: true, position: 'top', ...LBL, fontSize: 10,
            formatter: (p: any) => (planBy[p.dataIndex] ? `${Math.round((p.value / planBy[p.dataIndex]) * 100)}%` : '') } },
      ],
    };
  }, [pacing, monthly, seg, dark]);

  /* Biểu đồ D — tỷ trọng kênh trong kỳ. */
  const optShare = useMemo<EChartsOption>(() => ({
    tooltip: { trigger: 'item', valueFormatter: (v: unknown) => vnd(Number(v)) },
    legend: { bottom: 0, formatter: (name: string) => {
      const v = name === 'Meta' ? meta.cur.spend : google.cur.spend;
      return `${name} · ${((v / (meta.cur.spend + google.cur.spend || 1)) * 100).toFixed(1)}% · ${formatVND(v)}`;
    } },
    series: [{
      type: 'pie', radius: ['52%', '74%'], center: ['50%', '44%'],
      itemStyle: { borderColor: surface, borderWidth: 2 },
      label: { show: false },   // nhãn quanh vòng chồng chữ khi một lát chỉ 2% — số % nằm ở chú giải
      data: [
        { name: 'Meta', value: Math.round(meta.cur.spend), itemStyle: { color: platformColor.meta } },
        { name: 'Google', value: Math.round(google.cur.spend), itemStyle: { color: platformColor.google } },
      ].filter(d => d.value > 0),
    }],
  }), [meta, google, dark]);

  /* ═══ TẦNG 2 · Meta ═════════════════════════════════════════════════════ */

  /** Gộp ngày → tuần khi kỳ dài hơn 62 ngày, nếu không cột dày tới mức không đọc được. */
  const buckets = useMemo(() => {
    const days = [...new Set(api.segmentDaily.map(d => d.date))].sort();
    const weekly = days.length > 62;
    /* Khối 7 ngày tính NGƯỢC từ ngày cuối kỳ — khối gần nhất luôn đủ 7 ngày.
       Bản đầu chia theo tuần lịch (thứ Hai) → khối cuối chỉ có 31/08 và đồ thị tụt giả
       ngay chỗ người đọc nhìn nhiều nhất. Nếu có khối thiếu ngày thì chỉ là khối ĐẦU. */
    const last = days[days.length - 1];
    const keyOf = (d: string) => {
      if (!weekly) return d;
      const back = Math.round((Date.parse(`${last}T00:00:00Z`) - Date.parse(`${d}T00:00:00Z`)) / 86_400_000);
      const t = new Date(`${last}T00:00:00Z`);
      t.setUTCDate(t.getUTCDate() - Math.floor(back / 7) * 7 - 6);   // ngày ĐẦU của khối
      return t.toISOString().slice(0, 10);
    };
    const keys = [...new Set(days.map(keyOf))];
    const rows = api.segmentDaily.filter(d => segList.includes(d.segment));
    const at = (k: string) => rows.filter(r => keyOf(r.date) === k);
    const firstPartial = weekly && keys.length > 0 && keys[0] < days[0];
    return {
      weekly, keys, at, firstPartial,
      label: (k: string) => (weekly ? `${dm(k < days[0] ? days[0] : k)}${k < days[0] ? '*' : ''}` : dm(k)),
    };
  }, [api, seg]);

  const optDailySpend = useMemo<EChartsOption>(() => {
    const segs = seg === 'ALL' ? SEGMENTS : [seg];
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v: unknown) => vnd(Number(v)) },
      legend: { top: 0, itemWidth: 12, itemHeight: 8 },
      grid: { top: 30, right: 12, bottom: 22, left: 58 },
      xAxis: { type: 'category', data: buckets.keys.map(buckets.label) },
      yAxis: { type: 'value', axisLabel: { formatter: (v: number) => formatVND(v, 0) } },
      series: segs.map((s, i) => ({
        name: SEGMENT_SHORT[s], type: 'bar', stack: 'd', barMaxWidth: 18,
        itemStyle: { color: segmentColor(s, dark), borderColor: surface, borderWidth: 1,
          borderRadius: i === segs.length - 1 ? [3, 3, 0, 0] : 0 },
        data: buckets.keys.map(k => Math.round(buckets.at(k).filter(r => r.segment === s).reduce((a, r) => a + r.spend, 0))),
      })),
    };
  }, [buckets, seg, dark]);

  const optDailyResult = useMemo<EChartsOption>(() => ({
    tooltip: { trigger: 'axis', valueFormatter: (v: unknown) => `${formatNumber(Number(v))} lượt` },
    legend: { top: 0 },
    grid: { top: 30, right: 12, bottom: 22, left: 58 },
    xAxis: { type: 'category', data: buckets.keys.map(buckets.label) },
    yAxis: { type: 'value', name: 'lượt', nameTextStyle: { fontSize: 10 } },
    series: [
      { name: 'Tin nhắn mới', type: 'line', symbolSize: 6, lineStyle: { width: 2, color: ACCENT }, itemStyle: { color: ACCENT },
        data: buckets.keys.map(k => buckets.at(k).reduce((a, r) => a + r.messages, 0)) },
      { name: 'Lead (form tiệc)', type: 'line', symbolSize: 6, lineStyle: { width: 2, type: 'dashed', color: ACCENT }, itemStyle: { color: ACCENT },
        data: buckets.keys.map(k => buckets.at(k).reduce((a, r) => a + r.leads, 0)) },
    ],
  }), [buckets]);

  /* Hiệu quả theo mảng — chi phí trên tin nhắn. Một thước đo, màu = mảng. */
  const segTable = useMemo(() => SEGMENTS.filter(s => seg === 'ALL' || s === seg).map(s => {
    const b = api.segments.find(x => x.segment === s)!;
    const ef = api.efficiency.find(x => x.segment === s)!;
    const r = ratios(b.current);
    const e = effRatios(ef.current);
    const ep = effRatios(ef.previous);
    return {
      segment: s, label: SEGMENT_LABEL[s],
      spend: b.current.spend, messages: b.current.messages, leads: b.current.leads,
      linkClicks: b.current.linkClicks,
      cpm: r.cpm, ctrLink: r.ctrLink, cpt: e.cpt, cpl: e.cpl,
      clickToMsg: r.clickToMessage,
      cptDelta: costDelta(e.cpt, ep.cpt),
    };
  }), [api, seg]);

  const optSegCpt = useMemo<EChartsOption>(() => {
    const rows = segTable.filter(r => r.cpt != null);
    return {
      tooltip: { trigger: 'item', formatter: (p: any) => `${rows[p.dataIndex].label}<br/>Chi phí / tin nhắn: <b>${vnd(p.value)}</b>` },
      grid: { top: 8, right: 70, bottom: 8, left: 96 },
      xAxis: { type: 'value', show: false },
      yAxis: { type: 'category', inverse: true, data: rows.map(r => r.label), axisLabel: { fontSize: 11 } },
      series: [{
        type: 'bar', barMaxWidth: 18,
        data: rows.map(r => ({ value: Math.round(r.cpt!), itemStyle: { color: segmentColor(r.segment, dark), borderRadius: [0, 4, 4, 0] } })),
        label: { show: true, position: 'right', ...LBL, formatter: (p: any) => vnd(p.value) },
      }],
    };
  }, [segTable, dark]);

  /* Chi tiệc theo PAGE — tiệc đã chuyển hẳn sang page NEC chưa? */
  const optTiecPage = useMemo<EChartsOption>(() => {
    const ms = [...new Set(api.tiecByPage.map(r => r.month))].sort();
    const pages = ['NCB', 'NDC', 'NJFB', 'NEC'].filter(p => api.tiecByPage.some(r => r.page === p));
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v: unknown) => vnd(Number(v)) },
      legend: { top: 0, itemWidth: 12, itemHeight: 8 },
      grid: { top: 30, right: 12, bottom: 24, left: 58 },
      xAxis: { type: 'category', data: ms.map(formatMonthLabel) },
      yAxis: { type: 'value', axisLabel: { formatter: (v: number) => formatVND(v, 0) } },
      series: pages.map((p, i) => ({
        name: p === 'NEC' ? 'Page NEC' : `Page ${p}`, type: 'bar', stack: 'p', barMaxWidth: 30,
        itemStyle: { color: pageColor(p, dark), borderColor: surface, borderWidth: 1,
          borderRadius: i === pages.length - 1 ? [4, 4, 0, 0] : 0 },
        data: ms.map(m => Math.round(api.tiecByPage.filter(r => r.month === m && r.page === p).reduce((a, r) => a + r.spend, 0))),
      })),
    };
  }, [api, dark]);

  /** Nhóm chiến dịch theo mục đích — đúng ba nhóm prompt yêu cầu. */
  const objectiveGroup = (c: AdsCampaignRow): string =>
    c.segment === 'TIEC' ? 'Tiệc · Catering'
      : c.segment === 'HR' ? 'Tuyển dụng'
        : c.objective === 'Tiếp cận' ? 'Nhận diện & Reach'
          : 'Tin nhắn & Tương tác';

  const campaignRows = useMemo(() => api.campaigns
    .filter(c => c.platform === 'meta' && (seg === 'ALL' || c.segment === seg))
    .map(c => {
      const r = ratios(c);
      return {
        ...c,
        group: objectiveGroup(c),
        ctrLinkV: r.ctrLink ?? -1,
        // CP/tin nhắn chỉ có nghĩa với chiến dịch MỤC TIÊU Tin nhắn — Engagement 16tr ÷ 5 tin = 3,2tr/tin là số vô nghĩa.
        cptV: c.objective === 'Tin nhắn' && r.costPerMessage != null ? r.costPerMessage : Number.POSITIVE_INFINITY,
        cplV: r.costPerLead ?? Number.POSITIVE_INFINITY,
        freqV: c.monthFrequency ?? -1,
      };
    }), [api, seg]);

  const campaignCols: Column<(typeof campaignRows)[number]>[] = [
    { key: 'campaignName', header: 'Chiến dịch', render: r => (
      <div>
        <div className="font-bold text-brand-text">{r.campaignName}</div>
        <div className="text-[10px] text-brand-faint">{r.group}{r.locked ? ' · gán tay' : ''}</div>
      </div>) },
    { key: 'segment', header: 'Mảng', render: r => (
      <span className="text-[11px] font-semibold">
        <span style={{ color: segmentColor(r.segment, dark) }}>●</span> {SEGMENT_SHORT[r.segment]}
      </span>) },
    { key: 'spend', header: 'Chi tiêu', align: 'right', sortable: true, render: r => <span className="font-mono font-bold">{vnd(r.spend)}</span> },
    { key: 'freqV', header: 'Tần suất tháng', align: 'right', sortable: true, render: r => {
      const st = frequencyStatus(r.monthFrequency);
      return <span className={`font-mono ${STATUS_TEXT[st]}`}>{r.monthFrequency == null ? '—' : r.monthFrequency.toFixed(2)}</span>;
    } },
    { key: 'ctrLinkV', header: 'CTR link', align: 'right', sortable: true, render: r => <span className="font-mono">{r.ctrLinkV < 0 ? '—' : pct(r.ctrLinkV, 2)}</span> },
    { key: 'messages', header: 'Tin nhắn', align: 'right', sortable: true, render: r => <span className="font-mono">{formatNumber(r.messages)}</span> },
    { key: 'cptV', header: 'CP / tin nhắn', align: 'right', sortable: true, render: r => <span className="font-mono">{Number.isFinite(r.cptV) ? vnd(r.cptV) : '—'}</span> },
    { key: 'leads', header: 'Lead', align: 'right', sortable: true, render: r => <span className="font-mono">{r.leads ? formatNumber(r.leads) : '—'}</span> },
    { key: 'cplV', header: 'CP / lead', align: 'right', sortable: true, render: r => <span className="font-mono">{Number.isFinite(r.cplV) ? vnd(r.cplV) : '—'}</span> },
  ];

  /* ═══ TẦNG 3 · Google API / Excel dự phòng ════════════════════════════════ */

  const gCampaigns = useMemo(() => {
    if (googleApi) return googleApi.campaigns.filter(g => seg === 'ALL' || g.brand === seg).map(g => {
      const store = g.store ?? (MKT_DATA.gads ?? []).find(x => x.campaign === g.campaign)?.store;
      return { ...g, store: store ? HUB_DATA.stores[store]?.name || store : '—',
        status: g.status === 'PAUSED' ? 'Tạm dừng' : g.status === 'REMOVED' ? 'Đã xoá' : g.status === 'ENABLED' ? 'Đang bật' : g.status,
        cpa: g.conv > 0 ? g.spend / g.conv : Number.POSITIVE_INFINITY };
    });
    const map = new Map<string, { campaign: string; store: string; status: string; spend: number; conv: number; clicks: number; impr: number }>();
    for (const g of MKT_DATA.gads ?? []) {
      if (!g.month || !months.includes(g.month)) continue;
      const brand = (g as { brand?: string }).brand;
      if (seg === 'TIEC' || (seg !== 'ALL' && brand !== seg)) continue;
      const o = map.get(g.campaign) ?? { campaign: g.campaign, store: HUB_DATA.stores[g.store]?.name || g.store || '—', status: g.status, spend: 0, conv: 0, clicks: 0, impr: 0 };
      o.spend += g.spend; o.conv += g.conv; o.clicks += g.clicks; o.impr += g.impr; o.status = g.status;
      map.set(g.campaign, o);
    }
    return [...map.values()].map(r => ({ ...r, cpa: r.conv > 0 ? r.spend / r.conv : Number.POSITIVE_INFINITY }))
      .sort((a, b) => b.spend - a.spend);
  }, [months, seg, googleApi]);

  const gChannels = useMemo(() => {
    const map = new Map<string, { channel: string; spend: number; conv: number; clicks: number; impr: number }>();
    const source = googleApi ? googleApi.channels
      .filter(c => seg === 'ALL' || c.brand === seg).map(c => ({ ...c, month: '' })) : MKT_DATA.gads_channel ?? [];
    const labels: Record<string, string> = { SEARCH: 'Google Tìm kiếm', SEARCH_PARTNERS: 'Đối tác tìm kiếm',
      CONTENT: 'Mạng hiển thị', YOUTUBE: 'YouTube', DISCOVER: 'Discover', MAPS: 'Google Maps',
      GMAIL: 'Gmail', MIXED: 'Nhiều kênh', UNSPECIFIED: 'Chưa xác định', UNKNOWN: 'Khác' };
    for (const raw of source) {
      const c = { ...raw, channel: labels[raw.channel] ?? raw.channel };
      if (c.month && !months.includes(c.month)) continue;
      const o = map.get(c.channel) ?? { channel: c.channel, spend: 0, conv: 0, clicks: 0, impr: 0 };
      o.spend += c.spend; o.conv += c.conv; o.clicks += c.clicks; o.impr += c.impr;
      map.set(c.channel, o);
    }
    return [...map.values()].filter(c => c.spend > 0).map(c => ({ ...c, cpa: c.conv > 0 ? c.spend / c.conv : null }))
      .sort((a, b) => (a.cpa ?? Infinity) - (b.cpa ?? Infinity));
  }, [months, seg, googleApi]);

  const optGChannel = useMemo<EChartsOption>(() => ({
    tooltip: { trigger: 'item', formatter: (p: any) => {
      const c = gChannels[p.dataIndex];
      return `<b>${c.channel}</b><br/>Chi phí: ${vnd(c.spend)}<br/>Chuyển đổi: ${formatNumber(c.conv)}<br/>CP/chuyển đổi: ${c.cpa ? vnd(c.cpa) : '—'}`;
    } },
    grid: { top: 8, right: 70, bottom: 8, left: 130 },
    xAxis: { type: 'value', show: false },
    yAxis: { type: 'category', inverse: true, data: gChannels.map(c => c.channel), axisLabel: { fontSize: 11 } },
    series: [{
      type: 'bar', barMaxWidth: 18,
      data: gChannels.map(c => ({ value: c.cpa ? Math.round(c.cpa) : 0, itemStyle: { color: c.cpa ? platformColor.google : PLAN_GRAY(dark), borderRadius: [0, 4, 4, 0] } })),
      label: { show: true, position: 'right', ...LBL, formatter: (p: any) => (gChannels[p.dataIndex].cpa ? vnd(p.value) : '0 chuyển đổi') },
    }],
  }), [gChannels, dark]);

  const gTerms = useMemo(() => {
    const map = new Map<string, { kw: string; clicks: number; conv: number; spend: number }>();
    const source = googleApi ? googleApi.terms
      .filter(k => seg === 'ALL' || k.brand === seg).map(k => ({ ...k, month: '' })) : MKT_DATA.gads_kw ?? [];
    for (const k of source) {
      if (k.month && !months.includes(k.month)) continue;
      const o = map.get(k.kw) ?? { kw: k.kw, clicks: 0, conv: 0, spend: 0 };
      o.clicks += k.clicks; o.conv += k.conv; o.spend += k.spend;
      map.set(k.kw, o);
    }
    const all = [...map.values()].sort((a, b) => b.clicks - a.clicks);
    const brand = all.filter(k => /noire/i.test(k.kw));
    return { all, brand: brand.length, nonBrand: all.length - brand.length };
  }, [months, seg, googleApi]);

  /* ═══ Trình bày ═════════════════════════════════════════════════════════ */

  const segButtons: SegFilter[] = ['ALL', ...SEGMENTS];
  const lastMonth = months[months.length - 1];
  const funnelSteps = [
    { label: 'Hiển thị', value: meta.cur.impressions, rate: null as number | null, rateLabel: '' },
    { label: 'Link click', value: meta.cur.linkClicks, rate: meta.r.ctrLink, rateLabel: 'CTR link' },
    { label: 'Tin nhắn mới', value: meta.cur.messages, rate: meta.r.clickToMessage, rateLabel: 'từ link click' },
  ];

  return (
    <div className="space-y-5">
      {/* ── Bộ lọc: một hàng, trên mọi biểu đồ ── */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-brand-border bg-brand-surface p-2.5 text-xs">
        <span className="text-[10px] font-extrabold uppercase tracking-widest text-brand-muted">Mảng</span>
        <div className="flex flex-wrap gap-1">
          {segButtons.map(s => (
            <button key={s} onClick={() => setSeg(s)}
              className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-bold transition-colors ${
                seg === s ? 'border-brand-gold bg-brand-gold/15 text-brand-text' : 'border-brand-border text-brand-muted hover:text-brand-text'}`}>
              {s !== 'ALL' && <span className="inline-block h-2 w-2 rounded-full" style={{ background: segmentColor(s, dark) }} />}
              {s === 'ALL' ? 'Tất cả' : SEGMENT_SHORT[s]}
            </button>
          ))}
        </div>
        <span className="ml-auto text-[11px] text-brand-faint">
          Kỳ Meta: <b className="text-brand-text">{dmy(windowStart)} → {dmy(windowEnd)}</b>
          {' · '}so với {dmy(api.previous.start)} → {dmy(api.previous.end)} (cùng số ngày)
          {' · '}dữ liệu tới {api.syncedThrough ? dmy(api.syncedThrough) : '—'}
        </span>
      </div>

      {/* ════════ TẦNG 1 ════════ */}
      <TierHeader n={1} title="Tổng quan quảng cáo trả phí"
        question="Tiền quảng cáo có nằm trong khung cho phép so với doanh thu, và giải ngân có đúng nhịp kế hoạch không?"
        note={<>Meta theo ngày từ API · Google từ {googleLabel} ({google.monthsWith.length ? google.monthsWith.map(formatMonthLabel).join(', ') : 'không có tháng nào trong kỳ'}) · CẤM ROAS — dùng ACR.</>} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <MetricCard variant={acr && acrStatus(acr.value, acr.target) === 'bad' ? 'critical' : 'hero'}
          label={acr ? `ACR · ${formatMonthLabel(acr.month)}` : 'ACR'}
          subLabel={seg === 'TIEC' ? 'Không áp dụng cho tiệc' : 'Chi media ÷ doanh thu thuần · tháng trọn kỳ'}
          value={acr ? (acr.value * 100).toFixed(2) : '—'} unit={acr ? '%' : undefined}
          customDeltaText={seg === 'TIEC'
            ? 'Doanh thu tiệc theo dõi ở M10, không có trong mẫu số'
            : acr ? (
              <span>
                Mục tiêu <b>{acr.target != null ? `${(acr.target * 100).toFixed(2)}%` : '—'}</b>
                {' · '}<b className={STATUS_TEXT[acrStatus(acr.value, acr.target)]}>
                  {acrStatus(acr.value, acr.target) === 'ok' ? 'trong khung' : acrStatus(acr.value, acr.target) === 'warning' ? 'vượt nhẹ' : 'vượt trần'}
                </b>
                {!brandOnly && <> · ăn tại chỗ {(acr.dinein * 100).toFixed(2)}%</>}
                {!acr.inWindow && <div className="text-[10px] text-brand-faint">Kỳ đang xem chưa có tháng trọn — lấy tháng gần nhất</div>}
              </span>) : 'Chưa có tháng trọn kỳ'} />
        <MetricCard label="Tổng chi media trong kỳ"
          subLabel={`Meta ${formatVND(meta.cur.spend)} + Google ${formatVND(google.cur.spend)}`}
          value={formatVND(blended.spend)}
          customDeltaText={<Delta d={volumeDelta(blended.spend, blended.spendPrev) && { ...volumeDelta(blended.spend, blended.spendPrev), status: 'neutral' }} />} />
        <MetricCard label="Tỷ trọng kênh" subLabel="Phần chi của từng nền tảng trong kỳ"
          value={blended.metaShare == null ? '—' : `${Math.round(blended.metaShare * 100)} / ${Math.round((blended.googleShare ?? 0) * 100)}`}
          unit="Meta / Google %"
          customDeltaText={<span>Zalo Ads: <b>0 đ</b> · TikTok: chưa chạy</span>} />
        <MetricCard label="Hành động inbound"
          subLabel="Tin nhắn + lead (Meta) + chuyển đổi (Google)"
          value={formatNumber(blended.actions)}
          customDeltaText={<span>{formatNumber(meta.cur.messages)} tin nhắn · {formatNumber(meta.cur.leads)} lead · {formatNumber(google.cur.conv)} Google</span>} />
        <MetricCard label="Chi phí / hành động" subLabel="Bình quân mọi hành động inbound"
          value={blended.cpa == null ? '—' : vnd(blended.cpa)}
          customDeltaText={<Delta d={costDelta(blended.cpa, blended.cpaPrev)} />} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2" title="Chi media theo tháng · theo mảng"
          description="Tiền đang dồn vào mảng nào, và dịch chuyển ra sao qua các tháng? Vùng tô = kỳ đang xem."
          chip="META + GOOGLE">
          <EChartWrapper option={optSpendMonth} height={270} />
          <MonthSegTable monthly={monthly} segs={seg === 'ALL' ? SEGMENTS : [seg]} dark={dark} highlight={months} />
        </Card>
        <Card title="Tỷ trọng kênh trong kỳ" description="Meta và Google chia nhau ngân sách thế nào?" chip="PHÂN BỔ">
          {blended.spend > 0 ? <EChartWrapper option={optShare} height={250} /> : <Empty text="Không có chi tiêu trong kỳ" />}
          <p className="mt-1 text-[11px] text-brand-faint">{googleApi ? `Google Ads API · đã đồng bộ tới ${googleApi.syncedThrough ? dmy(googleApi.syncedThrough) : '—'}.` : 'Google đang dùng Excel dự phòng; kỳ không có dữ liệu không đồng nghĩa không chạy.'}</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card title="ACR theo tháng so với mục tiêu"
          description="Chi quảng cáo chiếm bao nhiêu phần doanh thu, tháng nào vượt trần? Chỉ vẽ tháng trọn kỳ."
          chip="NORTH STAR">
          {optAcr ? <EChartWrapper option={optAcr} height={250} /> : (
            <Empty text="ACR không áp dụng cho mảng Tiệc — doanh thu tiệc do M10 Booking theo dõi, không nằm trong doanh thu nhà hàng." />
          )}
          <p className="mt-1 text-[11px] text-brand-faint">
            Mục tiêu = kế hoạch ads Q3 ÷ mục tiêu doanh thu Q3 (file ngân sách). Đường nét đứt bỏ chi tiệc khỏi tử số —
            vì doanh thu tiệc không có ở mẫu số.
          </p>
        </Card>
        <Card title="Kế hoạch vs thực chi · từng tháng Q3"
          description={seg === 'TIEC' ? 'Ngân sách "Chạy Tiệc" có được giải ngân đúng nhịp?' : 'Tháng nào chi lệch kế hoạch? Nhãn = % đạt kế hoạch tháng.'}
          chip="PACING">
          <EChartWrapper option={optPlanMonth} height={250} />
          <p className="mt-1 text-[11px] text-brand-faint">
            {brandOnly ? 'File ngân sách không chia kế hoạch theo brand × tháng — đang so TOÀN BỘ phần ăn tại chỗ. ' : ''}
            Meta tới {api.syncedThrough ? dmy(api.syncedThrough) : '—'}; Google: {googleLabel}{googleApi?.syncedThrough ? ` tới ${dmy(googleApi.syncedThrough)}` : ''}.
          </p>
        </Card>
      </div>

      <Card title="Giải ngân Q3 · kế hoạch lũy kế so với thực chi"
        description="Tiền có đang nằm im so với phần kế hoạch đã tới hạn không? Ngưỡng lành mạnh 95–105%."
        chip="Q3/2026" hero>
        <div className="overflow-x-auto rounded-lg border border-brand-border">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-brand-border bg-brand-surface text-[10px] font-bold uppercase tracking-wider text-brand-muted">
                <th className="p-2.5">Kênh</th><th className="p-2.5">Mảng</th>
                <th className="p-2.5 text-right">Kế hoạch Q3</th><th className="p-2.5 text-right">Kế hoạch lũy kế</th>
                <th className="p-2.5 text-right">Thực chi</th><th className="p-2.5 text-right">Đạt</th><th className="p-2.5">Số tới ngày</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-border/40 font-mono">
              {pacing.rows.map(r => (
                <tr key={r.key}>
                  <td className="p-2.5 font-sans font-bold text-brand-text">{r.channel}</td>
                  <td className="p-2.5 font-sans text-brand-muted">{r.line}</td>
                  <td className="p-2.5 text-right text-brand-muted">{formatVND(r.planQ3)}</td>
                  <td className="p-2.5 text-right">{r.planTD == null ? '—' : formatVND(r.planTD)}</td>
                  <td className="p-2.5 text-right font-bold text-brand-goldLight">{r.actual == null ? '—' : formatVND(r.actual)}</td>
                  <td className="p-2.5 text-right">{r.ratio == null ? '—' : <StatusBadge label={formatPercent(r.ratio)} variant={BADGE[r.status]} />}</td>
                  <td className="p-2.5 font-sans text-[11px] text-brand-faint">{r.through ? dmy(r.through) : 'chưa có nguồn số'}</td>
                </tr>
              ))}
              <tr className="bg-brand-surface/60">
                <td className="p-2.5 font-sans font-extrabold text-brand-text" colSpan={2}>Tổng (dòng có số)</td>
                <td className="p-2.5 text-right text-brand-muted">{formatVND(pacing.planQ3)}</td>
                <td className="p-2.5 text-right">{formatVND(pacing.tPlanTD)}</td>
                <td className="p-2.5 text-right font-bold text-brand-goldLight">{formatVND(pacing.tActual)}</td>
                <td className="p-2.5 text-right"><StatusBadge label={pct(pacing.tRatio)} variant={BADGE[pacingStatus(pacing.tRatio)]} /></td>
                <td className="p-2.5" />
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-brand-faint">
          Kế hoạch = dòng <i>Brand MKT</i> (ăn tại chỗ) + <i>Extra Budget – Chạy Tiệc</i>. Ngân sách CRM Q3 thuộc M8, không tính ở đây.
          Tháng đang chạy: kế hoạch chia đều theo ngày. Mỗi kênh so tới ngày <b>nó có số</b>.
        </p>
      </Card>

      {(tiecCur > 0 || hrCur > 0) && seg === 'ALL' && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {tiecCur > 0 && (
            <div className="rounded-xl border border-brand-border bg-brand-surface p-3 text-xs text-brand-muted">
              <b className="text-brand-text">Tiệc · Catering: {vnd(tiecCur)}</b> trong kỳ ({pct(tiecCur / (meta.cur.spend || 1))} chi Meta).
              {' '}Tính trong ACR toàn hệ thống nhưng doanh thu tương ứng nằm ở M10 — xem ACR ăn tại chỗ để đọc đúng hiệu quả nhà hàng.
            </div>
          )}
          {hrCur > 0 && (
            <div className="rounded-xl border border-brand-border bg-brand-surface p-3 text-xs text-brand-muted">
              <b className="text-brand-text">Tuyển dụng: {vnd(hrCur)}</b> trong kỳ — không phải marketing thương hiệu, đã loại khỏi mọi con số ở trên.
            </div>
          )}
        </div>
      )}

      {/* ════════ TẦNG 2 ════════ */}
      <TierHeader n={2} title="Meta Ads · bóc tách phễu"
        question="Mỗi đồng Meta đang mua được bao nhiêu hội thoại và lead, nội dung có kéo được click, tệp có bị bão hoà không?"
        note="Kỳ chính xác theo ngày. Mũi tên so với kỳ trước cùng số ngày; chi phí giảm = xanh." />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <MetricCard label="Chi Meta" subLabel={`${pct(blended.metaShare)} tổng chi media`} value={formatVND(meta.cur.spend)}
          customDeltaText={<Delta d={{ ...volumeDelta(meta.cur.spend, meta.prev.spend), status: 'neutral' }} />} />
        <MetricCard label="Tin nhắn mới" subLabel={`CPTB ${vnd(meta.e.cpt)} · chiến dịch mục tiêu Tin nhắn`} value={formatNumber(meta.cur.messages)}
          customDeltaText={<span><Delta d={volumeDelta(meta.cur.messages, meta.prev.messages)} suffix="số lượng" />{' · '}<Delta d={costDelta(meta.e.cpt, meta.ep.cpt)} suffix="CPTB" /></span>} />
        <MetricCard label="Lead · form đặt tiệc" subLabel={`CP / lead ${vnd(meta.e.cpl)} · chiến dịch có lead`} value={formatNumber(meta.cur.leads)}
          customDeltaText={<span><Delta d={volumeDelta(meta.cur.leads, meta.prev.leads)} suffix="số lượng" />{' · '}<Delta d={costDelta(meta.e.cpl, meta.ep.cpl)} suffix="CPL" /></span>} />
        <MetricCard label="Tần suất 7 ngày" subLabel="Toàn tài khoản · ngưỡng bão hoà 3,5"
          value={api.reach.last7d?.frequency != null ? api.reach.last7d.frequency.toFixed(2) : '—'}
          variant={frequencyStatus(api.reach.last7d?.frequency ?? null) === 'bad' ? 'critical' : 'default'}
          customDeltaText={<span className={STATUS_TEXT[frequencyStatus(api.reach.last7d?.frequency ?? null)]}>
            {api.reach.last7d ? `${dm(api.reach.last7d.periodStart)}–${dm(api.reach.last7d.periodEnd)} · reach ${formatNumber(api.reach.last7d.reach)}` : '—'}
          </span>} />
        <MetricCard label={`Reach · ${lastMonth ? formatMonthLabel(lastMonth) : ''}`}
          subLabel={seg === 'ALL' ? 'Người duy nhất, cả tài khoản' : 'Chỉ đo được ở cấp tài khoản'}
          value={seg === 'ALL' && api.reach.month?.reach != null ? formatNumber(api.reach.month.reach) : '—'}
          customDeltaText={<span>Tần suất tháng {api.reach.month?.frequency != null ? api.reach.month.frequency.toFixed(2) : '—'} · {formatNumber(meta.cur.impressions)} hiển thị trong kỳ</span>} />
        <MetricCard label="CPM" subLabel="Chi / 1.000 hiển thị" value={vnd(meta.r.cpm)}
          customDeltaText={<Delta d={costDelta(meta.r.cpm, meta.rp.cpm)} />} />
        <MetricCard label="Link click" subLabel={`CPC link ${vnd(meta.r.cpcLink)}`} value={formatNumber(meta.cur.linkClicks)}
          customDeltaText={<Delta d={costDelta(meta.r.cpcLink, meta.rp.cpcLink)} suffix="CPC link" />} />
        <MetricCard label="CTR" subLabel="Tất cả · link" value={`${pct(meta.r.ctrAll, 2)} · ${pct(meta.r.ctrLink, 2)}`}
          customDeltaText={<Delta d={volumeDelta(meta.r.ctrLink, meta.rp.ctrLink)} suffix="CTR link" />} />
        <MetricCard label="Video ≥ 3 giây" subLabel={`ThruPlay ${formatNumber(meta.cur.thruplays)}`} value={formatNumber(meta.cur.videoViews)}
          customDeltaText={<span>Xem hết / xem 3 giây: <b>{pct(meta.r.thruplayRate)}</b></span>} />
        <MetricCard label="Link click → tin nhắn" subLabel="Nội dung dẫn khách vào inbox tốt tới đâu" value={pct(meta.r.clickToMessage)}
          customDeltaText={<Delta d={volumeDelta(meta.r.clickToMessage, meta.rp.clickToMessage)} />} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2" title={`Chi Meta và kết quả theo ${buckets.weekly ? 'tuần' : 'ngày'}`}
          description="Tiền đổ vào ngày nào, và ngày đó có ra hội thoại không? Hai biểu đồ chung trục thời gian — không dùng trục kép."
          chip="XU HƯỚNG">
          <EChartWrapper option={optDailySpend} height={200} />
          <EChartWrapper option={optDailyResult} height={170} />
          {buckets.weekly && (
            <p className="text-[11px] text-brand-faint">
              Kỳ dài hơn 62 ngày nên gộp khối 7 ngày, tính ngược từ ngày cuối — khối gần nhất luôn đủ 7 ngày.
              {buckets.firstPartial && ' Khối đầu (*) thiếu ngày.'} Nhãn = ngày đầu khối.
            </p>
          )}
        </Card>
        <Card title="Phễu Meta trong kỳ" description="Rơi ở bước nào: không ai bấm, hay bấm mà không nhắn?" chip="PHỄU">
          <div className="space-y-2">
            {funnelSteps.map((s, i) => (
              <div key={s.label}>
                {i > 0 && (
                  <div className="py-0.5 text-center text-[10px] text-brand-faint">
                    ↓ <b className="text-brand-text">{pct(s.rate, 2)}</b> {s.rateLabel}
                  </div>
                )}
                <div className="flex items-baseline justify-between rounded-lg border border-brand-border bg-brand-surface/60 px-3 py-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-brand-muted">{s.label}</span>
                  <span className="font-display text-lg font-extrabold text-brand-text">{formatNumber(s.value)}</span>
                </div>
              </div>
            ))}
            <div className="flex items-baseline justify-between rounded-lg border border-dashed border-brand-border px-3 py-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-brand-muted">Lead (form riêng)</span>
              <span className="font-display text-lg font-extrabold text-brand-text">{formatNumber(meta.cur.leads)}</span>
            </div>
            <p className="text-[10px] text-brand-faint">Lead đến từ form đặt tiệc, không đi qua tin nhắn — nên đứng ngoài phễu.</p>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card title="Chi phí / tin nhắn theo mảng" description="Mảng nào mua hội thoại rẻ nhất, đắt nhất? Chỉ tính chiến dịch mục tiêu Tin nhắn." chip="HIỆU QUẢ">
          {segTable.some(r => r.cpt != null) ? <EChartWrapper option={optSegCpt} height={Math.max(120, segTable.length * 42)} /> : <Empty text="Không có tin nhắn trong kỳ" />}
          <div className="mt-2 overflow-x-auto rounded-lg border border-brand-border">
            <table className="w-full border-collapse text-left text-[11px]">
              <thead>
                <tr className="border-b border-brand-border bg-brand-surface text-[10px] font-bold uppercase tracking-wider text-brand-muted">
                  <th className="p-2">Mảng</th><th className="p-2 text-right">Chi</th><th className="p-2 text-right">Tin nhắn</th>
                  <th className="p-2 text-right">CPTB</th><th className="p-2 text-right">Lead</th><th className="p-2 text-right">CP/lead</th><th className="p-2 text-right">CTR link</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border/40 font-mono">
                {segTable.map(r => (
                  <tr key={r.segment}>
                    <td className="p-2 font-sans font-bold"><span style={{ color: segmentColor(r.segment, dark) }}>●</span> {SEGMENT_SHORT[r.segment]}</td>
                    <td className="p-2 text-right">{formatVND(r.spend)}</td>
                    <td className="p-2 text-right">{formatNumber(r.messages)}</td>
                    <td className="p-2 text-right">{vnd(r.cpt)} <span className={`text-[10px] ${STATUS_TEXT[r.cptDelta.status]}`}>{r.cptDelta.text}</span></td>
                    <td className="p-2 text-right">{formatNumber(r.leads)}</td>
                    <td className="p-2 text-right">{vnd(r.cpl)}</td>
                    <td className="p-2 text-right">{pct(r.ctrLink, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        {(seg === 'ALL' || seg === 'TIEC') && (
          <Card title="Chi tiệc theo page chạy" description="Tiệc đã chuyển hẳn sang page NEC chưa? Page NEC mở từ T7/2026 — trước đó tiệc chạy nhờ page brand."
            chip="NEC">
            {api.tiecByPage.length ? <EChartWrapper option={optTiecPage} height={260} /> : <Empty text="Chưa có chi tiệc" />}
            <p className="mt-1 text-[11px] text-brand-faint">
              Trước T7 nhận diện tiệc bằng tên chiến dịch (tiệc · YEP · party · sự kiện…). Dù chạy trên page nào, chi tiệc đều thuộc mảng Tiệc.
            </p>
          </Card>
        )}
      </div>

      <Card title="Chiến dịch Meta trong kỳ" description="Chiến dịch nào ăn tiền mà không ra hội thoại, chiến dịch nào tệp đã nóng? Tần suất tính trên cả tháng cuối kỳ."
        chip={`${campaignRows.length} CHIẾN DỊCH`}>
        <DataTable columns={campaignCols} data={campaignRows} searchable searchPlaceholder="Tìm chiến dịch..."
          searchKeys={['campaignName', 'group']} pageSize={10} exportFilename="NOIRE_Meta_chien_dich" />
        <p className="mt-2 text-[11px] text-brand-faint">
          Nhóm: <b>Nhận diện & Reach</b> (mục tiêu tiếp cận) · <b>Tin nhắn & Tương tác</b> (combo, món mới, kéo inbox) · <b>Tiệc · Catering</b>.
          Tần suất ≥ 3,5 cam, ≥ 4 đỏ.
        </p>
      </Card>

      {/* ════════ TẦNG 3 ════════ */}
      <TierHeader n={3} title="Google Ads · Performance Max"
        question="Google bắt được nhu cầu tìm quán ở kênh nào, và mỗi hành động tốn bao nhiêu?"
        note={`${googleLabel}${googleApi ? " · dữ liệu theo ngày, so với kỳ trước cùng số ngày" : " · dữ liệu theo tháng"}. Chi phí và chuyển đổi theo kênh hiển thị.`} />

      {!googleCovered && <Empty text="Google API chưa đồng bộ đủ kỳ đang chọn; số bên dưới chỉ gồm dữ liệu đã có." />}
      {!googleApi && seg === 'TIEC' ? (
        <Empty text="Google Ads không chạy chiến dịch tiệc — chọn mảng khác để xem." />
      ) : google.cur.spend === 0 ? (
        <Empty text={googleApi ? "Không có chi tiêu Google trong dữ liệu đã đồng bộ của kỳ/mảng này." : "Kỳ đang xem không có số Google trong nguồn Excel dự phòng."} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricCard label="Chi Google" subLabel={`${pct(blended.googleShare)} tổng chi media`} value={formatVND(google.cur.spend)}
              customDeltaText={<Delta d={{ ...volumeDelta(google.cur.spend, google.prev.spend), status: 'neutral' }} suffix={googleApi ? "vs kỳ trước" : "vs các tháng trước"} />} />
            <MetricCard label="Chuyển đổi" subLabel={`CP / chuyển đổi ${vnd(google.cur.conv ? google.cur.spend / google.cur.conv : null)}`}
              value={formatNumber(google.cur.conv)}
              customDeltaText={<Delta d={costDelta(google.cur.conv ? google.cur.spend / google.cur.conv : null, google.prev.conv ? google.prev.spend / google.prev.conv : null)} suffix="CP/chuyển đổi" />} />
            <MetricCard label="Lượt nhấp · CTR" subLabel={`${formatNumber(google.cur.impr)} hiển thị`}
              value={formatNumber(google.cur.clicks)} unit={pct(google.cur.impr ? google.cur.clicks / google.cur.impr : null, 2)} />
            <MetricCard label="CPC trung bình" subLabel="Chi ÷ lượt nhấp"
              value={vnd(google.cur.clicks ? google.cur.spend / google.cur.clicks : null)} />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Card title="Chi phí / chuyển đổi theo kênh hiển thị" description="Kênh nào rẻ nhất để kéo khách tới quán? Xếp tăng dần." chip="KÊNH">
              {gChannels.length ? <EChartWrapper option={optGChannel} height={Math.max(140, gChannels.length * 34)} /> : <Empty text="Không có số kênh" />}
            </Card>
            <Card title="Khách tìm gì trên Google" description="Các cụm từ Google cung cấp có phát sinh hoạt động; không đại diện toàn bộ truy vấn do giới hạn báo cáo/quyền riêng tư." chip="CỤM TỪ">
              <div className="mb-3 grid grid-cols-2 gap-2.5">
                <Tile label="Tìm theo nhu cầu" value={formatNumber(gTerms.nonBrand)} sub={pct(gTerms.all.length ? gTerms.nonBrand / gTerms.all.length : null)} />
                <Tile label='Có chữ "noire"' value={formatNumber(gTerms.brand)} sub={pct(gTerms.all.length ? gTerms.brand / gTerms.all.length : null)} />
              </div>
              <DataTable columns={[
                { key: 'kw', header: 'Cụm từ', render: (r: (typeof gTerms.all)[number]) => <span className="text-brand-text">{r.kw}</span> },
                { key: 'clicks', header: 'Nhấp', align: 'right', sortable: true, render: r => <span className="font-mono">{formatNumber(r.clicks)}</span> },
                { key: 'conv', header: 'Chuyển đổi', align: 'right', sortable: true, render: r => <span className="font-mono">{r.conv ? formatNumber(r.conv) : '—'}</span> },
              ]} data={gTerms.all} searchable searchKeys={['kw']} pageSize={6} exportFilename="NOIRE_Google_cum_tu" />
            </Card>
          </div>

          <Card title="Chiến dịch Google theo cửa hàng" description="Cửa hàng nào kéo được hành động rẻ, chiến dịch nào tạm dừng mà vẫn tiêu tiền?" chip={`${gCampaigns.length} CHIẾN DỊCH`}>
            <DataTable columns={[
              { key: 'campaign', header: 'Chiến dịch', render: (r: (typeof gCampaigns)[number]) => <span className="font-bold text-brand-text">{r.campaign}</span> },
              { key: 'store', header: 'Cửa hàng', render: r => <span className="text-[11px] text-brand-muted">{r.store}</span> },
              { key: 'status', header: 'Trạng thái', render: r => <StatusBadge label={r.status} variant={/tạm dừng/i.test(r.status) ? 'bad' : 'ok'} /> },
              { key: 'spend', header: 'Chi phí', align: 'right', sortable: true, render: r => <span className="font-mono font-bold">{vnd(r.spend)}</span> },
              { key: 'conv', header: 'Chuyển đổi', align: 'right', sortable: true, render: r => <span className="font-mono">{formatNumber(r.conv)}</span> },
              { key: 'cpa', header: 'CP / chuyển đổi', align: 'right', sortable: true, render: r => <span className="font-mono">{Number.isFinite(r.cpa) ? vnd(r.cpa) : '—'}</span> },
              { key: 'clicks', header: 'Nhấp', align: 'right', sortable: true, render: r => <span className="font-mono">{formatNumber(r.clicks)}</span> },
            ]} data={gCampaigns} pageSize={6} exportFilename="NOIRE_Google_chien_dich" />
          </Card>
        </>
      )}

      <div className="rounded-xl border border-dashed border-brand-border p-3 text-xs text-brand-muted">
        <b className="text-brand-text">Chưa có: chỉ đường Maps · cuộc gọi · lượt xem menu của Google.</b>{' '}
        {googleApi ? 'API hiện lấy tổng chuyển đổi; chưa triển khai báo cáo tách theo loại hành động.' : 'Excel chỉ trả tổng chuyển đổi, không tách theo loại hành động.'}
      </div>
    </div>
  );
};

/* ─── Thành phần phụ ─────────────────────────────────────────────────────── */

const Empty: React.FC<{ text: string }> = ({ text }) => (
  <div className="rounded-lg border border-dashed border-brand-border p-6 text-center text-xs text-brand-muted">{text}</div>
);

const Tile: React.FC<{ label: string; value: string; sub: string }> = ({ label, value, sub }) => (
  <div className="rounded-lg border border-brand-border bg-brand-surface/60 p-2.5">
    <div className="text-[10px] uppercase tracking-wider text-brand-muted">{label}</div>
    <div className="mt-0.5 font-display text-lg font-extrabold text-brand-text">{value}</div>
    <div className="text-[10px] text-brand-faint">{sub} tổng cụm từ</div>
  </div>
);

/** Bảng số đi kèm biểu đồ tháng × mảng — bắt buộc (2 màu nền sáng < 3:1 tương phản). */
const MonthSegTable: React.FC<{
  monthly: ReturnType<typeof monthSegmentSpend>; segs: AdsSegment[]; dark: boolean; highlight: string[];
}> = ({ monthly, segs, dark, highlight }) => (
  <details className="mt-2 text-[11px]">
    <summary className="cursor-pointer text-brand-muted hover:text-brand-text">Xem bảng số</summary>
    <div className="mt-2 overflow-x-auto rounded-lg border border-brand-border">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-brand-border bg-brand-surface text-[10px] font-bold uppercase tracking-wider text-brand-muted">
            <th className="p-2">Tháng</th>
            {segs.map(s => <th key={s} className="p-2 text-right"><span style={{ color: segmentColor(s, dark) }}>●</span> {SEGMENT_SHORT[s]}</th>)}
            <th className="p-2 text-right">Tổng</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-brand-border/40 font-mono">
          {monthly.map(r => (
            <tr key={r.month} className={highlight.includes(r.month) ? 'bg-brand-gold/5' : ''}>
              <td className="p-2 font-sans">{formatMonthLabel(r.month)}</td>
              {segs.map(s => <td key={s} className="p-2 text-right">{formatVND(mediaSpend(r, s))}</td>)}
              <td className="p-2 text-right font-bold">{formatVND(segs.reduce((a, s) => a + mediaSpend(r, s), 0))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </details>
);
