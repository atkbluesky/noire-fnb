import React, { useMemo, useState } from 'react';
import { useFilters } from '../context/FilterContext';
import { HUB_DATA, MKT_DATA } from '../data';
import { MetricCard } from '../components/common/MetricCard';
import { Card } from '../components/common/Card';
import { DataTable, Column } from '../components/common/DataTable';
import { EChartWrapper } from '../components/charts/EChartWrapper';
import { formatVND, formatNumber, formatPercent, formatMonthLabel } from '../utils/formatters';
import type { EChartsOption } from 'echarts';
import type { BookingRow, BookingStage } from '../types/hub';

/* ════════════════════════════════════════════════════════════════════
   M10 · BOOKING TIỆC & SỰ KIỆN — PHỄU TỪ QUẢNG CÁO TỚI DOANH THU

   Ba nguồn, nối theo THÁNG NHẬN LEAD (cohort):
     Meta Ads (chiến dịch booking) → hiển thị · click · hội thoại/lead form
     Sổ booking của Sales          → lead ghi sổ · chốt · doanh thu
     Fanpage NEC                   → bối cảnh: tổng liên hệ vào trang tiệc

   Mọi luật (chốt là gì, dòng nào là đặt bàn, ads nào là booking) nằm ở
   data_contract.json → $booking và đi kèm dữ liệu qua HUB_DATA.booking_meta.
   Màn hình này KHÔNG tự phân loại lại.
   ════════════════════════════════════════════════════════════════════ */

const META = HUB_DATA.booking_meta;
const STAGE = Object.fromEntries(META.stages.map(s => [s.code, s])) as Record<BookingStage, typeof META.stages[0]>;
const CONTACT_KINDS = new Set(META.result_kinds.filter(k => k.contact).map(k => k.code));
const RKIND_LABEL = Object.fromEntries(META.result_kinds.map(k => [k.code, k.label]));
const MKT_SRC = new Set(META.mkt_sources);
/** Tháng có báo cáo Meta Ads — để phân biệt "không chạy ads booking" với "chưa nộp báo cáo". */
const ADS_REPORT_MONTHS = new Set((MKT_DATA.ads_month || []).map(r => r.month));

const isMkt = (src: string | null) => MKT_SRC.has(String(src ?? '').trim().toLowerCase());
const safeDiv = (a: number, b: number) => (b > 0 ? a / b : null);

type Tally = { leads: number; won: number; open: number; lost: number; closed: number; closed_n: number; exp_open: number; guests: number };
const emptyTally = (): Tally => ({ leads: 0, won: 0, open: 0, lost: 0, closed: 0, closed_n: 0, exp_open: 0, guests: 0 });
function tally(rows: BookingRow[]): Tally {
  const t = emptyTally();
  for (const r of rows) {
    t.leads += r.leads;
    t.guests += r.guests;
    t[r.stage] += r.leads;
    if (r.stage === 'won') { t.closed += r.closed; t.closed_n += r.closed_n; }
    if (r.stage === 'open') t.exp_open += r.exp;
  }
  return t;
}

/* ── Một tầng phễu ─────────────────────────────────────────────────── */
interface Stage {
  label: string;
  sub: string;
  value: string;
  width: number;          // độ rộng minh hoạ — KHÔNG tỷ lệ với số
  rate?: { text: string; label: string; tone?: 'ok' | 'warn' | 'bad' };
  cost?: string;
  color: string;
}

const FunnelStages: React.FC<{ stages: Stage[] }> = ({ stages }) => (
  <div className="space-y-1.5">
    {stages.map(s => (
      <div key={s.label} className="grid grid-cols-[minmax(0,1fr)] sm:grid-cols-[150px_minmax(0,1fr)_130px] items-center gap-x-3 gap-y-1">
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-wide text-brand-text">{s.label}</div>
          <div className="font-mono text-[10px] text-brand-faint truncate">{s.sub}</div>
        </div>
        <div className="flex justify-center">
          <div
            className="flex h-10 items-center justify-center rounded-md px-2 text-center shadow-sm transition-all"
            style={{ width: `${s.width}%`, minWidth: 120, background: s.color }}
          >
            <span className="font-display text-sm sm:text-base font-extrabold text-[#141417] whitespace-nowrap">{s.value}</span>
          </div>
        </div>
        <div className="flex sm:flex-col items-baseline sm:items-end gap-2 sm:gap-0 text-right">
          {s.rate && (
            <span className={`font-mono text-xs font-bold ${
              s.rate.tone === 'bad' ? 'text-status-bad' : s.rate.tone === 'warn' ? 'text-status-warning' : 'text-status-ok'
            }`}>
              {s.rate.text} <span className="font-sans text-[10px] font-normal text-brand-muted">{s.rate.label}</span>
            </span>
          )}
          {s.cost && <span className="font-mono text-[10px] text-brand-muted">{s.cost}</span>}
        </div>
      </div>
    ))}
  </div>
);

export const BookingView: React.FC = () => {
  const { selectedMonths, filters, brandMatches } = useFilters();
  const ms = selectedMonths;
  const brandAll = filters.brand === 'ALL';
  const [withTables, setWithTables] = useState(false);

  /* ── Lọc ────────────────────────────────────────────────────────── */
  const inScope = (r: BookingRow) =>
    (withTables || r.seg === 'event') && (brandAll || (!!r.brand && brandMatches(r.brand)));

  const BK = useMemo(
    () => (HUB_DATA.booking || []).filter(r => ms.includes(r.month) && inScope(r)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ms, withTables, filters.brand],
  );
  const ADS = useMemo(
    () => (HUB_DATA.booking_ads || []).filter(a => ms.includes(a.month) && (brandAll || brandMatches(a.brand ?? ''))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ms, filters.brand],
  );
  const PAGE = (HUB_DATA.booking_page || []).filter(p => ms.includes(p.month));

  /* ── Tầng Ads ────────────────────────────────────────────────────── */
  const spend = ADS.reduce((a, r) => a + r.spend, 0);
  const impr = ADS.reduce((a, r) => a + r.impr, 0);
  const clicks = ADS.reduce((a, r) => a + r.clicks, 0);
  const contacts = ADS.filter(r => CONTACT_KINDS.has(r.rkind)).reduce((a, r) => a + r.result, 0);
  const contactsMsg = ADS.filter(r => r.rkind === 'msg').reduce((a, r) => a + r.result, 0);
  const contactsForm = contacts - contactsMsg;
  const nCampaigns = new Set(ADS.map(a => a.campaign)).size;
  const monthsNoReport = ms.filter(m => !ADS_REPORT_MONTHS.has(m));

  /* ── Tầng Sales ──────────────────────────────────────────────────── */
  const ALL = tally(BK);
  const MKT = tally(BK.filter(r => isMkt(r.source)));
  const cpl = safeDiv(spend, MKT.leads);
  const cpa = safeDiv(spend, MKT.won);
  const roas = safeDiv(MKT.closed, spend);
  const handoff = safeDiv(MKT.leads, contacts);
  const mktWin = safeDiv(MKT.won, MKT.leads);
  const mktOpenShare = safeDiv(MKT.open, MKT.leads);

  const funnel: Stage[] = [
    {
      label: 'Hiển thị', sub: `${nCampaigns} chiến dịch booking · Meta`,
      value: formatNumber(impr), width: 100, color: '#DFBF7A',
      cost: impr > 0 ? `CPM ${formatVND(spend / impr * 1000)}` : undefined,
    },
    {
      label: 'Click liên kết', sub: 'người bấm vào quảng cáo',
      value: formatNumber(clicks), width: 86, color: '#D4AF68',
      rate: { text: formatPercent(safeDiv(clicks, impr), 2), label: 'CTR' },
      cost: clicks > 0 ? `CPC ${formatVND(spend / clicks)}` : undefined,
    },
    {
      label: 'Hội thoại + lead form', sub: `${formatNumber(contactsMsg)} tin nhắn · ${formatNumber(contactsForm)} form`,
      value: formatNumber(contacts), width: 72, color: '#C5A059',
      rate: { text: formatPercent(safeDiv(contacts, clicks)), label: '÷ click' },
      cost: contacts > 0 ? `${formatVND(spend / contacts)} / liên hệ` : undefined,
    },
    {
      label: 'Lead MKT ghi sổ', sub: 'Sổ Sales · Source = MKT',
      value: formatNumber(MKT.leads), width: 58, color: '#AE8966',
      rate: handoff === null ? undefined : {
        text: formatPercent(handoff), label: 'được ghi sổ',
        tone: handoff > 1 ? 'warn' : handoff < 0.5 ? 'bad' : 'ok',
      },
      cost: cpl !== null ? `CPL ${formatVND(cpl)}` : undefined,
    },
    {
      label: 'Chốt tiệc', sub: `Confirmed · còn ${formatNumber(MKT.open)} đang theo`,
      value: formatNumber(MKT.won), width: 44, color: '#82846C',
      rate: { text: formatPercent(mktWin), label: 'tỷ lệ chốt', tone: (mktWin ?? 0) < 0.2 ? 'bad' : 'ok' },
      cost: cpa !== null ? `${formatVND(cpa)} / tiệc` : undefined,
    },
    {
      label: 'Doanh thu chốt', sub: MKT.won ? `TB ${formatVND(safeDiv(MKT.closed, MKT.closed_n))} / tiệc` : 'Closed Revenue',
      value: formatVND(MKT.closed), width: 34, color: '#6F7A5C',
      rate: roas === null ? undefined : { text: `${formatNumber(roas, 1)}×`, label: 'ROAS', tone: roas < 1 ? 'bad' : 'ok' },
    },
  ];

  /* ── Fanpage NEC ─────────────────────────────────────────────────── */
  const pageSum = (k: 'views' | 'reach' | 'profile_views' | 'contacts' | 'msgs' | 'follows') => {
    const vals = PAGE.map(p => p[k]).filter((v): v is number => v !== null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
  };
  const pageMsgMonths = PAGE.filter(p => p.msgs !== null).map(p => p.month);
  const adsMsgNEC = ADS.filter(a => (a.page ?? '').toUpperCase() === 'NEC' && a.rkind === 'msg' && pageMsgMonths.includes(a.month))
    .reduce((a, r) => a + r.result, 0);
  const pageMsgs = pageSum('msgs');

  /* ── Xu hướng theo tháng nhận lead ───────────────────────────────── */
  const trendMonths = ms.filter(m =>
    BK.some(r => r.month === m) || ADS.some(a => a.month === m));
  const byMonth = trendMonths.map(m => {
    const t = tally(BK.filter(r => r.month === m && isMkt(r.source)));
    const a = ADS.filter(x => x.month === m);
    const sp = a.reduce((s, r) => s + r.spend, 0);
    const ct = a.filter(r => CONTACT_KINDS.has(r.rkind)).reduce((s, r) => s + r.result, 0);
    return { m, t, sp, ct, report: ADS_REPORT_MONTHS.has(m) };
  });

  const trendOption: EChartsOption = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: any) => {
        const row = byMonth[params[0]?.dataIndex];
        if (!row) return '';
        const { t, sp, ct } = row;
        const line = (k: string, v: string) =>
          `<div style="display:flex;justify-content:space-between;gap:16px"><span>${k}</span><b>${v}</b></div>`;
        return `<div style="font-size:12px;min-width:220px">
          <div style="font-weight:700;margin-bottom:4px">Lead nhận ${formatMonthLabel(row.m)}</div>
          ${line('Chi phí ads booking', row.report ? formatVND(sp) : 'chưa có báo cáo')}
          ${line('Hội thoại + form', formatNumber(ct))}
          ${line('Lead MKT ghi sổ', formatNumber(t.leads))}
          ${line('· Đã chốt', `${formatNumber(t.won)} (${formatPercent(safeDiv(t.won, t.leads), 0)})`)}
          ${line('· Đang theo', formatNumber(t.open))}
          ${line('· Đã mất', formatNumber(t.lost))}
          ${line('Doanh thu chốt', formatVND(t.closed))}
          ${line('CPL', sp && t.leads ? formatVND(sp / t.leads) : '—')}
          ${(safeDiv(t.open, t.leads) ?? 0) > 0.4 ? '<div style="margin-top:4px;color:#F59E0B">Còn >40% lead đang theo — tỷ lệ chốt tháng này chưa chín</div>' : ''}
        </div>`;
      },
    },
    legend: { top: 0, textStyle: { color: '#9E9B93', fontSize: 11 } },
    grid: { top: 36, right: 56, bottom: 24, left: 44 },
    xAxis: { type: 'category', data: byMonth.map(r => formatMonthLabel(r.m)) },
    yAxis: [
      { type: 'value', name: 'Số liên hệ / lead', nameTextStyle: { color: '#9E9B93', fontSize: 10 },
        axisLabel: { color: '#9E9B93', fontSize: 10 }, splitLine: { lineStyle: { color: '#1F1F26', type: 'dashed' } } },
      { type: 'value', name: 'Chi phí', nameTextStyle: { color: '#9E9B93', fontSize: 10 },
        axisLabel: { formatter: (v: number) => formatVND(v, 0), color: '#9E9B93', fontSize: 10 }, splitLine: { show: false } },
    ],
    series: [
      { name: 'Hội thoại + form (Ads)', type: 'bar', barMaxWidth: 22, barGap: '10%',
        itemStyle: { color: 'rgba(223,191,122,0.35)', borderColor: '#DFBF7A', borderWidth: 1, borderRadius: [3, 3, 0, 0] },
        data: byMonth.map(r => r.ct) },
      ...(['won', 'open', 'lost'] as BookingStage[]).map((code, i) => ({
        name: `Lead MKT · ${STAGE[code].label}`, type: 'bar' as const, stack: 'mkt', barMaxWidth: 22,
        itemStyle: { color: STAGE[code].color, borderRadius: i === 2 ? [3, 3, 0, 0] : 0 },
        data: byMonth.map(r => r.t[code]),
      })),
      { name: 'Chi phí ads booking', type: 'line', yAxisIndex: 1, symbolSize: 6, connectNulls: false,
        lineStyle: { color: '#C5A059', width: 2 }, itemStyle: { color: '#C5A059' },
        data: byMonth.map(r => (r.report ? r.sp : null)) },
    ],
  };

  /* ── So sánh nguồn lead (mọi nguồn) ──────────────────────────────── */
  const sourceRows = useMemo(() => {
    const m = new Map<string, BookingRow[]>();
    for (const r of BK) {
      const k = (r.source ?? '').trim() || '(không ghi nguồn)';
      m.set(k, [...(m.get(k) ?? []), r]);
    }
    return [...m.entries()].map(([src, rows]) => {
      const t = tally(rows);
      return {
        src, ...t,
        win: safeDiv(t.won, t.leads),
        winDecided: safeDiv(t.won, t.won + t.lost),
        avg: safeDiv(t.closed, t.closed_n),
        share: safeDiv(t.closed, ALL.closed),
      };
    }).sort((a, b) => b.closed - a.closed || b.leads - a.leads);
  }, [BK, ALL.closed]);

  const sourceOption: EChartsOption = {
    tooltip: {
      trigger: 'axis', axisPointer: { type: 'shadow' },
      formatter: (params: any) => {
        const r = sourceRows[params[0]?.dataIndex];
        if (!r) return '';
        return `<div style="font-size:12px"><b>${r.src}</b> · ${formatNumber(r.leads)} lead<br/>
          Đã chốt ${formatNumber(r.won)} · Đang theo ${formatNumber(r.open)} · Đã mất ${formatNumber(r.lost)}<br/>
          Tỷ lệ chốt ${formatPercent(r.win)} · khi đã có kết luận ${formatPercent(r.winDecided)}</div>`;
      },
    },
    legend: { top: 0, textStyle: { color: '#9E9B93', fontSize: 11 } },
    grid: { top: 30, right: 16, bottom: 20, left: 110 },
    xAxis: { type: 'value', max: 1, axisLabel: { formatter: (v: number) => `${Math.round(v * 100)}%`, color: '#9E9B93', fontSize: 10 },
      splitLine: { lineStyle: { color: '#1F1F26', type: 'dashed' } } },
    yAxis: { type: 'category', inverse: true, data: sourceRows.map(r => r.src), axisLabel: { fontSize: 11 } },
    series: (['won', 'open', 'lost'] as BookingStage[]).map(code => ({
      name: STAGE[code].label, type: 'bar' as const, stack: 's', barMaxWidth: 20,
      itemStyle: { color: STAGE[code].color },
      label: { show: true, color: '#141417', fontSize: 10, fontWeight: 'bold' as const,
        formatter: (p: any) => (p.value >= 0.08 ? `${Math.round(p.value * 100)}%` : '') },
      data: sourceRows.map(r => (r.leads ? r[code] / r.leads : 0)),
    })),
  };

  const sourceColumns: Column<typeof sourceRows[0]>[] = [
    { key: 'src', header: 'Nguồn', render: r => (
      <span className={`font-bold ${isMkt(r.src) ? 'text-brand-gold' : 'text-brand-text'}`}>{r.src}</span>) },
    { key: 'leads', header: 'Lead', align: 'right', render: r => <span className="font-mono">{formatNumber(r.leads)}</span> },
    { key: 'won', header: 'Chốt', align: 'right', render: r => <span className="font-mono">{formatNumber(r.won)}</span> },
    { key: 'win', header: 'Tỷ lệ chốt', align: 'right', render: r => (
      <span className="font-mono" title={`Khi đã có kết luận (chốt ÷ chốt+mất): ${formatPercent(r.winDecided)}`}>
        {formatPercent(r.win)}
      </span>) },
    { key: 'closed', header: 'DT chốt', align: 'right', render: r => (
      <span className="font-mono font-bold text-brand-goldLight">{formatVND(r.closed)}</span>) },
    { key: 'avg', header: 'TB / tiệc', align: 'right', render: r => <span className="font-mono">{formatVND(r.avg)}</span> },
    { key: 'exp_open', header: 'Pipeline', align: 'right', render: r => (
      <span className="font-mono text-brand-muted">{formatVND(r.exp_open)}</span>) },
  ];

  /* ── Lịch doanh thu theo tháng DIỄN RA ───────────────────────────────
     Lọc theo tháng diễn ra từ đầu kỳ đang chọn trở đi (gồm cả tháng tương lai) —
     KHÔNG lọc theo tháng nhận lead, vì tiệc T11 có thể được chốt từ lead T6. */
  const calRows = (HUB_DATA.booking || []).filter(r => inScope(r) && r.ev_month && ms.length && r.ev_month >= ms[0]);
  const calMonths = [...new Set(calRows.map(r => r.ev_month as string))].sort();
  const calData = calMonths.map(m => {
    const t = tally(calRows.filter(r => r.ev_month === m));
    return { m, ...t };
  });
  const noEvDate = tally((HUB_DATA.booking || []).filter(r => inScope(r) && !r.ev_month && r.stage === 'open'));
  const calOption: EChartsOption = {
    tooltip: {
      trigger: 'axis', axisPointer: { type: 'shadow' },
      formatter: (params: any) => {
        const r = calData[params[0]?.dataIndex];
        if (!r) return '';
        const missing = r.won - r.closed_n;
        return `<div style="font-size:12px"><b>Tiệc diễn ra ${formatMonthLabel(r.m)}</b><br/>
          Đã chốt: ${formatNumber(r.won)} tiệc · ${formatVND(r.closed)}${missing > 0 ? ` <span style="color:#F59E0B">(${missing} tiệc chưa nhập DT)</span>` : ''}<br/>
          Đang theo: ${formatNumber(r.open)} lead · kỳ vọng ${formatVND(r.exp_open)}<br/>
          Khách dự kiến: ${formatNumber(r.guests)}</div>`;
      },
    },
    legend: { top: 0, textStyle: { color: '#9E9B93', fontSize: 11 } },
    grid: { top: 32, right: 16, bottom: 24, left: 56 },
    xAxis: { type: 'category', data: calData.map(r => formatMonthLabel(r.m)) },
    yAxis: { type: 'value', axisLabel: { formatter: (v: number) => formatVND(v, 0), color: '#9E9B93', fontSize: 10 },
      splitLine: { lineStyle: { color: '#1F1F26', type: 'dashed' } } },
    series: [
      { name: 'Doanh thu đã chốt', type: 'bar', stack: 'c', barMaxWidth: 30, itemStyle: { color: STAGE.won.color },
        data: calData.map(r => r.closed) },
      { name: 'Kỳ vọng còn treo', type: 'bar', stack: 'c', barMaxWidth: 30,
        itemStyle: { color: 'rgba(197,160,89,0.45)', borderColor: STAGE.open.color, borderWidth: 1, borderRadius: [3, 3, 0, 0] },
        data: calData.map(r => r.exp_open) },
    ],
  };

  /* ── Vì sao mất lead ─────────────────────────────────────────────── */
  const lostRows = META.lost_reasons.map(reason => {
    const rows = BK.filter(r => r.stage === 'lost' && r.lost_reason === reason);
    return {
      reason,
      n: rows.reduce((a, r) => a + r.leads, 0),
      mkt: rows.filter(r => isMkt(r.source)).reduce((a, r) => a + r.leads, 0),
    };
  }).filter(r => r.n > 0).sort((a, b) => b.n - a.n);
  const lostOption: EChartsOption = {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' },
      formatter: (params: any) => {
        const r = lostRows[params[0]?.dataIndex];
        return r ? `<div style="font-size:12px"><b>${r.reason}</b><br/>${r.n} lead · ${r.mkt} từ MKT</div>` : '';
      } },
    grid: { top: 8, right: 36, bottom: 20, left: 170 },
    xAxis: { type: 'value', minInterval: 1, axisLabel: { color: '#9E9B93', fontSize: 10 },
      splitLine: { lineStyle: { color: '#1F1F26', type: 'dashed' } } },
    yAxis: { type: 'category', inverse: true, data: lostRows.map(r => r.reason), axisLabel: { fontSize: 11 } },
    series: [{ type: 'bar', barMaxWidth: 16, data: lostRows.map(r => r.n),
      itemStyle: { color: STAGE.lost.color, borderRadius: [0, 3, 3, 0] },
      label: { show: true, position: 'right', color: '#9E9B93', fontSize: 10 } }],
  };

  /* ── Loại sự kiện ────────────────────────────────────────────────── */
  const typeRows = useMemo(() => {
    const m = new Map<string, BookingRow[]>();
    for (const r of BK) {
      const k = r.etype ?? '(chưa rõ loại)';
      m.set(k, [...(m.get(k) ?? []), r]);
    }
    return [...m.entries()].map(([etype, rows]) => {
      const t = tally(rows);
      return { etype, ...t, win: safeDiv(t.won, t.leads), avgGuests: safeDiv(t.guests, t.leads) };
    }).sort((a, b) => b.closed - a.closed || b.leads - a.leads);
  }, [BK]);
  const typeColumns: Column<typeof typeRows[0]>[] = [
    { key: 'etype', header: 'Loại sự kiện', render: r => <span className="font-semibold text-brand-text">{r.etype}</span> },
    { key: 'leads', header: 'Lead', align: 'right', render: r => <span className="font-mono">{formatNumber(r.leads)}</span> },
    { key: 'win', header: 'Tỷ lệ chốt', align: 'right', render: r => <span className="font-mono">{formatPercent(r.win, 0)}</span> },
    { key: 'closed', header: 'DT chốt', align: 'right', render: r => (
      <span className="font-mono font-bold text-brand-goldLight">{formatVND(r.closed)}</span>) },
    { key: 'avgGuests', header: 'Khách TB', align: 'right', render: r => (
      <span className="font-mono text-brand-muted">{formatNumber(r.avgGuests)}</span>) },
  ];

  /* ── Độ tin cậy số liệu ──────────────────────────────────────────── */
  const allInPeriod = (HUB_DATA.booking || []).filter(r => ms.includes(r.month) && (brandAll || (!!r.brand && brandMatches(r.brand))));
  const nTables = allInPeriod.filter(r => r.seg === 'table').reduce((a, r) => a + r.leads, 0);
  const nInqEst = BK.reduce((a, r) => a + r.inq_est, 0);
  const nNoClosed = ALL.won - ALL.closed_n;
  const nNoExp = BK.filter(r => r.stage === 'open').reduce((a, r) => a + r.leads - r.exp_n, 0);
  const nNoBrand = brandAll ? BK.filter(r => !r.brand).reduce((a, r) => a + r.leads, 0) : 0;
  const quality: { tone: 'ok' | 'warn' | 'info'; text: React.ReactNode }[] = [
    { tone: 'info', text: <>Phễu ghép <b>theo tháng nhận lead</b>, không nối được từng khách: sổ Sales không ghi mã hội thoại. Source = MKT gồm cả lead từ fanpage tự nhiên, nên tỷ lệ ghi sổ là <b>xấp xỉ</b>.</> },
    nTables > 0 && { tone: 'info', text: <>{withTables ? 'Đang gộp' : 'Đã tách riêng'} <b>{formatNumber(nTables)}</b> dòng đặt bàn nhỏ (Dinner/Lunch dưới {META.segment.table_max_guests} khách) — chúng không phải tiệc và làm tỷ lệ chốt của nguồn Sales đẹp giả.</> },
    nNoClosed > 0 && { tone: 'warn', text: <><b>{formatNumber(nNoClosed)}</b> tiệc Confirmed chưa nhập Closed Revenue → doanh thu chốt và ROAS đang <b>thấp hơn thực tế</b>.</> },
    nInqEst > 0 && { tone: 'warn', text: <><b>{formatNumber(nInqEst)}</b> lead thiếu Inquiry Date — tháng nhận lead tạm lấy theo ngày sự kiện.</> },
    nNoExp > 0 && { tone: 'warn', text: <><b>{formatNumber(nNoExp)}</b> lead đang theo chưa có Expected Revenue (trống/TBA) — pipeline chưa tính phần này, không coi là 0.</> },
    nNoBrand > 0 && { tone: 'info', text: <><b>{formatNumber(nNoBrand)}</b> lead chưa ghi Outlet (TBA) — chỉ hiện khi xem tất cả brand.</> },
    monthsNoReport.length > 0 && { tone: 'warn', text: <>Chưa có báo cáo Meta Ads cho {monthsNoReport.map(formatMonthLabel).join(', ')} — chi phí, CPL, ROAS của các tháng này chưa đầy đủ.</> },
    !brandAll && { tone: 'info', text: <>Đang lọc brand {filters.brand}: chiến dịch fanpage NEC không gắn brand nên không tính vào tầng Ads.</> },
  ].filter(Boolean) as { tone: 'ok' | 'warn' | 'info'; text: React.ReactNode }[];

  const hasData = BK.length > 0 || ADS.length > 0;

  return (
    <div className="space-y-5 p-4 sm:p-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-brand-gold">
            QUẢNG CÁO CÓ RA TIỆC KHÔNG
          </span>
          <h2 className="text-xl font-extrabold text-brand-text font-display mt-0.5">
            M10 · Booking &amp; Tiệc Sự Kiện
          </h2>
          <p className="text-xs text-brand-muted mt-1 max-w-3xl">
            Phễu từ quảng cáo Meta → hội thoại → Sales ghi sổ → chốt → doanh thu. Ghép theo <b>tháng nhận lead</b>;
            lịch doanh thu bên dưới xếp theo <b>tháng diễn ra</b> tiệc.
          </p>
        </div>
        <div className="inline-flex self-start rounded-lg border border-brand-border bg-brand-surface p-0.5 text-[11px] font-semibold">
          {[
            { v: false, lb: META.segment.labels.event },
            { v: true, lb: `Gồm ${META.segment.labels.table.toLowerCase()}` },
          ].map(o => (
            <button
              key={o.lb}
              onClick={() => setWithTables(o.v)}
              className={`whitespace-nowrap rounded-md px-3 py-1.5 transition-colors ${
                withTables === o.v ? 'bg-brand-gold text-[#141417]' : 'text-brand-muted hover:text-brand-text'
              }`}
            >
              {o.lb}
            </button>
          ))}
        </div>
      </div>

      {!hasData ? (
        <Card title="Chưa có dữ liệu booking trong kỳ" description="Chọn khoảng tháng khác hoặc thả sổ booking vào L0_input/01_DOANH_THU/06_Booking_Tiec.">
          <p className="py-6 text-center text-xs text-brand-muted">Không có lead hay chiến dịch booking nào trong kỳ đang chọn.</p>
        </Card>
      ) : (
        <>
          {/* KPI */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <MetricCard
              label="Chi phí Ads booking"
              subLabel={`Meta · ${nCampaigns} chiến dịch`}
              value={formatVND(spend)}
              customDeltaText={contacts ? `${formatNumber(contacts)} liên hệ · ${formatVND(spend / contacts)}/liên hệ` : 'chưa có hội thoại/form'}
            />
            <MetricCard
              label="Lead MKT ghi sổ"
              subLabel="Source = MKT"
              value={formatNumber(MKT.leads)}
              unit="lead"
              customDeltaText={`CPL ${formatVND(cpl)} · ghi sổ ${formatPercent(handoff, 0)} liên hệ`}
            />
            <MetricCard
              label="Tiệc chốt từ MKT"
              subLabel="Status = Confirmed"
              value={formatNumber(MKT.won)}
              unit="tiệc"
              variant={(mktWin ?? 0) < 0.2 && MKT.leads >= 10 ? 'warning' : 'default'}
              customDeltaText={`Tỷ lệ chốt ${formatPercent(mktWin)} · ${formatVND(cpa)}/tiệc`}
            />
            <MetricCard
              label="Doanh thu chốt từ MKT"
              subLabel="Σ Closed Revenue"
              value={formatVND(MKT.closed)}
              variant="hero"
              customDeltaText={roas !== null ? `ROAS ${formatNumber(roas, 1)}× chi phí ads` : 'không có chi phí ads trong kỳ'}
            />
            <div className="col-span-2 lg:col-span-1">
              <MetricCard
                label="Doanh thu tiệc đã chốt"
                subLabel="Mọi nguồn"
                value={formatVND(ALL.closed)}
                customDeltaText={`${formatNumber(ALL.won)}/${formatNumber(ALL.leads)} lead chốt · MKT ${formatPercent(safeDiv(MKT.closed, ALL.closed), 0)}`}
              />
            </div>
          </div>

          {/* Phễu + fanpage */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Card
              title="Phễu Marketing → Tiệc"
              description="Mỗi tầng ghi số thật, tỷ lệ chuyển đổi so với tầng trên và chi phí đơn vị. Độ rộng thanh chỉ minh hoạ thứ tự, không tỷ lệ với số."
              chip="COHORT THÁNG NHẬN LEAD"
              hero
              className="xl:col-span-2"
            >
              <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-brand-faint">
                <span className="h-px flex-1 bg-brand-border" />Meta Ads<span className="h-px flex-1 bg-brand-border" />
              </div>
              <FunnelStages stages={funnel.slice(0, 3)} />
              <div className="my-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-brand-faint">
                <span className="h-px flex-1 bg-brand-border" />Bàn giao inbox → Sổ Sales<span className="h-px flex-1 bg-brand-border" />
              </div>
              <FunnelStages stages={funnel.slice(3)} />
              {mktOpenShare !== null && mktOpenShare > 0.3 && (
                <p className="mt-3 rounded-lg border border-status-warning/40 bg-status-warningBg p-2.5 text-[11px] leading-relaxed text-status-warning">
                  {formatPercent(mktOpenShare, 0)} lead MKT trong kỳ vẫn <b>đang theo</b> — tỷ lệ chốt và ROAS sẽ còn tăng khi Sales cập nhật trạng thái.
                </p>
              )}
            </Card>

            <Card
              title="Fanpage NEC"
              description="Trang chuyên tiệc & sự kiện — số của cả trang (tự nhiên + trả phí), lấy từ Meta Business Suite."
              chip={PAGE.length ? `${PAGE.length} THÁNG CÓ SỐ` : 'CHƯA CÓ SỐ'}
            >
              {!brandAll ? (
                <p className="py-6 text-center text-xs text-brand-muted">Fanpage NEC phục vụ mọi brand — chọn "Tất cả brand" để xem.</p>
              ) : PAGE.length === 0 ? (
                <p className="py-6 text-center text-xs text-brand-muted">
                  Chưa có số fanpage NEC trong kỳ. Số fanpage bắt đầu từ T7/2026 (file Facebook_Tong_hop).
                </p>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { lb: 'Lượt xem', v: pageSum('views') },
                      { lb: PAGE.length > 1 ? 'Người xem (cộng tháng)' : 'Người xem', v: pageSum('reach') },
                      { lb: 'Lượt truy cập trang', v: pageSum('profile_views') },
                      { lb: 'Lượt theo dõi mới', v: pageSum('follows') },
                      { lb: 'Người liên hệ', v: pageSum('contacts') },
                      { lb: 'Hội thoại mới', v: pageMsgs },
                    ].map(x => (
                      <div key={x.lb} className="rounded-lg border border-brand-border bg-brand-surface/60 p-2.5">
                        <div className="text-[10px] uppercase tracking-wider text-brand-muted">{x.lb}</div>
                        <div className="mt-0.5 font-display text-lg font-extrabold text-brand-text">{formatNumber(x.v)}</div>
                      </div>
                    ))}
                  </div>
                  {pageMsgs ? (
                    <div className="rounded-lg border border-brand-border p-2.5 text-[11px] leading-relaxed text-brand-muted">
                      <div className="mb-1.5 flex justify-between font-semibold text-brand-text">
                        <span>Hội thoại đến từ quảng cáo</span>
                        <span className="font-mono">{formatPercent(safeDiv(adsMsgNEC, pageMsgs), 0)}</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded bg-brand-border">
                        <div className="h-full bg-brand-gold" style={{ width: `${Math.min(100, (safeDiv(adsMsgNEC, pageMsgs) ?? 0) * 100)}%` }} />
                      </div>
                      <p className="mt-1.5">
                        {formatNumber(adsMsgNEC)} hội thoại từ chiến dịch NEC ÷ {formatNumber(pageMsgs)} hội thoại của trang
                        ({pageMsgMonths.map(formatMonthLabel).join(', ')}). Gần 100% nghĩa là trang gần như không có inbox tự nhiên.
                      </p>
                    </div>
                  ) : null}
                  {PAGE.length > 1 && (
                    <p className="text-[10px] text-brand-faint">Người xem là số người duy nhất trong từng tháng — cộng nhiều tháng sẽ đếm trùng.</p>
                  )}
                </div>
              )}
            </Card>
          </div>

          {/* Xu hướng */}
          <Card
            title="Xu hướng theo tháng nhận lead"
            description="Cột nhạt: hội thoại + lead form từ Ads. Cột chồng: lead MKT được Sales ghi sổ, tô theo kết quả. Đường: chi phí ads booking."
            chip="ADS × SỔ SALES"
          >
            <EChartWrapper option={trendOption} height={300} />
          </Card>

          {/* Nguồn lead */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card
              title="Kết quả theo nguồn lead"
              description="Tỷ trọng chốt · đang theo · mất trong mỗi nguồn. Di chuột để xem số lead."
              chip="MỌI NGUỒN"
            >
              <EChartWrapper option={sourceOption} height={Math.max(180, sourceRows.length * 42 + 50)} />
            </Card>
            <Card
              title="Nguồn nào mang về doanh thu"
              description="Xếp theo doanh thu đã chốt, không theo số lead. TB / tiệc chỉ tính tiệc đã nhập Closed Revenue."
              chip="CHỐT & PIPELINE"
            >
              <DataTable columns={sourceColumns} data={sourceRows} searchable={false} pageSize={8} exportFilename="Noire_Booking_Nguon" />
            </Card>
          </div>

          {/* Lịch doanh thu */}
          <Card
            title="Lịch doanh thu tiệc theo tháng diễn ra"
            description={`Từ ${formatMonthLabel(ms[0])} trở đi, gồm cả tháng tương lai. Xanh: đã chốt. Vàng: kỳ vọng của lead còn đang theo — chưa phải doanh thu.`}
            chip="FORWARD VIEW"
          >
            {calData.length ? (
              <>
                <EChartWrapper option={calOption} height={280} />
                {noEvDate.leads > 0 && (
                  <p className="mt-2 text-[11px] text-brand-muted">
                    Ngoài ra <b>{formatNumber(noEvDate.leads)}</b> lead đang theo chưa có ngày sự kiện (TBA) · kỳ vọng {formatVND(noEvDate.exp_open)}.
                  </p>
                )}
              </>
            ) : (
              <p className="py-6 text-center text-xs text-brand-muted">Không có tiệc nào có ngày diễn ra trong khoảng này.</p>
            )}
          </Card>

          {/* Lý do mất + loại sự kiện */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card
              title="Vì sao mất lead"
              description="Lý do Sales ghi tay, gom nhóm theo luật ở data_contract.json → $booking."
              chip={`${formatNumber(ALL.lost)} LEAD MẤT`}
              chipColor="border-status-bad/40 bg-status-badBg text-status-bad"
            >
              {lostRows.length
                ? <EChartWrapper option={lostOption} height={Math.max(160, lostRows.length * 32 + 30)} />
                : <p className="py-6 text-center text-xs text-brand-muted">Không có lead mất trong kỳ.</p>}
            </Card>
            <Card
              title="Loại sự kiện"
              description="Loại nào vừa chốt được vừa có giá trị."
              chip="EVENT TYPE"
            >
              <DataTable columns={typeColumns} data={typeRows} searchable={false} pageSize={7} exportFilename="Noire_Booking_Loai_Su_Kien" />
            </Card>
          </div>

          {/* Chất lượng dữ liệu */}
          <Card title="Đọc số này thế nào cho đúng" description="Giới hạn của dữ liệu trong kỳ đang chọn." chip="ĐỘ TIN CẬY">
            <ul className="space-y-1.5 text-[11px] leading-relaxed">
              {quality.map((q, i) => (
                <li key={i} className="flex gap-2">
                  <span className={`mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full ${
                    q.tone === 'warn' ? 'bg-status-warning' : q.tone === 'ok' ? 'bg-status-ok' : 'bg-brand-muted'
                  }`} />
                  <span className="text-brand-muted">{q.text}</span>
                </li>
              ))}
            </ul>
            {ADS.length > 0 && (
              <details className="mt-3 text-[11px]">
                <summary className="cursor-pointer font-semibold text-brand-sand">Chiến dịch được tính vào phễu ({nCampaigns})</summary>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full min-w-[520px] font-mono">
                    <thead>
                      <tr className="text-left text-[10px] uppercase text-brand-faint">
                        <th className="py-1 pr-2">Tháng</th><th className="pr-2">Chiến dịch</th><th className="pr-2">Kết quả</th>
                        <th className="pr-2 text-right">Chi phí</th><th className="text-right">Số KQ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ADS.map(a => (
                        <tr key={a.month + a.campaign} className="border-t border-brand-border/60 text-brand-muted">
                          <td className="py-1 pr-2">{formatMonthLabel(a.month)}</td>
                          <td className="pr-2 font-sans text-brand-text">{a.campaign}</td>
                          <td className={`pr-2 font-sans ${CONTACT_KINDS.has(a.rkind) ? 'text-brand-gold' : ''}`}>
                            {RKIND_LABEL[a.rkind] ?? 'Khác'}
                          </td>
                          <td className="pr-2 text-right">{formatVND(a.spend)}</td>
                          <td className="text-right">{formatNumber(a.result)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
          </Card>
        </>
      )}
    </div>
  );
};
