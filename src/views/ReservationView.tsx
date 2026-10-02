import React, { useEffect, useMemo, useState } from 'react';
import { useFilters } from '../context/FilterContext';
import { BRAND_COLORS, BRAND_NAMES } from '../data';
import { MetricCard } from '../components/common/MetricCard';
import { Card } from '../components/common/Card';
import { DataTable, Column } from '../components/common/DataTable';
import { EChartWrapper } from '../components/charts/EChartWrapper';
import { formatVND, formatNumber, formatPercent, formatMonthLabel } from '../utils/formatters';
import type { EChartsOption } from 'echarts';
import {
  RESERVATION, RES_MONTHS, RES_BRANDS, ITEM_DEFS, ALLOC_LABEL, buildModel, unitMetrics,
  type Cell, type ItemKey, type ResBrand, type AdsItemDef,
} from '../utils/reservation';

/* ════════════════════════════════════════════════════════════════════
   M11 · ĐẶT BÀN — PHỄU TỪ CHI PHÍ ADS TỚI ĐƠN ĐẶT BÀN iPOS

   Tách khỏi M10 (tiệc & sự kiện): khác grain (1 đơn đặt bàn ↔ 1 lead tiệc),
   khác vòng đời, khác giá trị. Chung với M10 DUY NHẤT tầng chi phí Ads (M5),
   nhưng M11 chỉ lấy phễu nhà hàng (`funnel = store`) — chi tiệc NEC thuộc M10.

   Nguồn: L0_input/06_ĐAT_BAN/Tháng M.YYYY (5 báo cáo iPOS) + Postgres M5.1
   → scripts/build-reservation.mjs → src/data/reservation.json.
   Luật gán nguồn → mục chi phí và cách phân bổ brand: src/utils/reservation.ts.
   ════════════════════════════════════════════════════════════════════ */

const ITEM_COLOR: Record<ItemKey, string> = { meta: '#DFBF7A', google: '#82846C' };
const KIND_META: Record<string, { label: string; color: string }> = {
  paid: { label: 'Kênh có chi phí Ads', color: '#C5A059' },
  owned: { label: 'Kênh sở hữu', color: '#82846C' },
  offline: { label: 'Điện thoại · vãng lai · trực tiếp', color: '#6E6C65' },
};
const ACTION_LABEL: Record<ItemKey, string> = { meta: 'Hội thoại', google: 'Chuyển đổi Google' };
/** Tên nhóm nguồn iPOS ghép với mỗi mục chi phí — quy ước Marketing 01/10/2026. */
const SOURCE_OF: Record<ItemKey, string> = { meta: 'Fanpage', google: 'Google Ads' };

type Scope = 'CHAIN' | ResBrand;
const safeDiv = (a: number, b: number) => (b > 0 ? a / b : null);
const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/* ── Phễu một mục chi phí ─────────────────────────────────────────── */
interface Step { label: string; value: string; raw: number; rate?: string; cost?: string; est?: boolean }

const ItemFunnel: React.FC<{
  def: AdsItemDef; cell: Cell; estimated: boolean; color: string; parts: { name: string; orders: number }[];
}> = ({ def, cell, estimated, color, parts }) => {
  const u = unitMetrics(cell);
  const k = def.key;
  const act = ACTION_LABEL[k];
  const steps: Step[] = [
    { label: 'Hiển thị', value: formatNumber(cell.impr), raw: cell.impr, cost: u.cpm !== null ? `CPM ${formatVND(u.cpm)}` : undefined },
    { label: 'Click', value: formatNumber(cell.clicks), raw: cell.clicks, rate: `CTR ${formatPercent(u.ctr, 2)}`, cost: u.cpc !== null ? `CPC ${formatVND(u.cpc)}` : undefined },
    { label: act, value: formatNumber(cell.actions), raw: cell.actions,
      rate: `${formatPercent(safeDiv(cell.actions, cell.clicks))} ÷ click`, cost: u.cpa !== null ? `${formatVND(u.cpa)} / ${act.toLowerCase()}` : undefined },
    { label: `Đơn ${SOURCE_OF[k]}`, value: formatNumber(cell.orders, estimated ? 1 : 0), raw: cell.orders, est: estimated,
      rate: `${formatPercent(u.actionToOrder, 1)} ÷ ${act.toLowerCase()}`, cost: u.cpo !== null ? `${formatVND(u.cpo)} / đơn` : undefined },
    { label: 'Đơn giữ (không huỷ)', value: formatNumber(cell.kept, 1), raw: cell.kept, est: true,
      rate: `giữ ${formatPercent(u.keepRate, 0)}`, cost: u.cpk !== null ? `${formatVND(u.cpk)} / đơn giữ` : undefined },
    { label: 'Khách giữ chỗ', value: formatNumber(cell.guests, 0), raw: cell.guests, est: true,
      cost: u.cpg !== null ? `${formatVND(u.cpg)} / khách` : undefined },
  ];
  const max = Math.max(...steps.map(s => s.raw), 1);
  const width = (v: number) => Math.max(14, (Math.log10(v + 1) / Math.log10(max + 1)) * 100);
  const split = Object.entries(cell.split).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);

  return (
    <div className="flex h-full flex-col rounded-xl border border-brand-border bg-brand-surface/50 p-3">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 flex-shrink-0 rounded-sm" style={{ background: color }} />
            <span className="text-sm font-extrabold text-brand-text">{def.label}</span>
            <span className="text-[10px] text-brand-faint">→ nguồn {SOURCE_OF[k]}</span>
          </div>
          <div className="mt-0.5 text-[10px] text-brand-faint">
            {cell.campaigns} chiến dịch · thực chi{split.length > 1 && <> · {split.map(([o, v]) => `${o} ${formatVND(v)}`).join(' · ')}</>}
          </div>
        </div>
        <div className="font-display text-lg font-extrabold text-brand-goldLight">{formatVND(cell.spend)}</div>
      </div>
      <div className="space-y-1.5">
        {steps.map(s => (
          <div key={s.label}>
            <div className="flex items-baseline justify-between gap-2 text-[10px]">
              <span className="truncate font-semibold uppercase tracking-wide text-brand-muted">{s.label}</span>
              {s.cost && <span className="whitespace-nowrap font-mono font-semibold text-brand-goldLight">{s.cost}</span>}
            </div>
            <div className="flex items-center gap-2">
              <div className="h-5 flex-shrink-0 rounded" style={{ width: `${width(s.raw) * 0.6}%`, background: color, opacity: s.est ? 0.55 : 0.9 }} />
              <span className="font-mono text-xs font-bold text-brand-text">
                {s.value}{s.est && <span className="ml-0.5 text-[9px] font-normal text-brand-faint">≈</span>}
              </span>
              {s.rate && <span className="ml-auto whitespace-nowrap font-mono text-[10px] text-brand-faint">{s.rate}</span>}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-auto pt-2 text-[10px] leading-snug text-brand-faint">
        Nguồn {SOURCE_OF[k]} {estimated ? 'toàn chuỗi ' : ''}= {parts.map(p => `${p.name} ${formatNumber(p.orders)}`).join(' + ')} đơn. {def.note}
      </p>
    </div>
  );
};

export const ReservationView: React.FC = () => {
  const { selectedMonths, filters, theme } = useFilters();
  const isDark = theme === 'dark';
  const gridLine = isDark ? '#1F1F26' : '#E7E3D9';

  const inRange = RES_MONTHS.filter(m => selectedMonths.includes(m));
  const months = inRange.length ? inRange : RES_MONTHS.slice(-1);
  const fellBack = !inRange.length && RES_MONTHS.length > 0;
  const M = useMemo(() => buildModel(months), [months.join()]);

  const [scope, setScope] = useState<Scope>(filters.brand === 'ALL' ? 'CHAIN' : (filters.brand as ResBrand));
  useEffect(() => { setScope(filters.brand === 'ALL' ? 'CHAIN' : (filters.brand as ResBrand)); }, [filters.brand]);
  const items = scope === 'CHAIN' ? M.chain : M.brands[scope].items;

  if (!RES_MONTHS.length) {
    return (
      <div className="p-4 sm:p-6">
        <Card title="Chưa có dữ liệu đặt bàn" description="Thả 5 báo cáo iPOS vào L0_input/06_ĐAT_BAN/Tháng M.YYYY rồi chạy npm run build:reservation.">
          <p className="py-6 text-center text-xs text-brand-muted">reservation.json chưa có tháng nào.</p>
        </Card>
      </div>
    );
  }

  /* ── KPI ──────────────────────────────────────────────────────────── */
  const itemKeys = ITEM_DEFS.map(d => d.key);
  const spendActual = itemKeys.reduce((a, k) => a + M.chain[k].spend, 0);
  const paidOrders = M.groups.filter(g => g.kind === 'paid').reduce((a, g) => a + g.orders, 0);
  /** Thành phần nguồn iPOS của mỗi nhóm (vd Fanpage = FacebookCRM + Fanpage). */
  const partsOf = (k: ItemKey) => M.sources.filter(x => x.group === k).map(x => ({ name: x.name, orders: x.orders }));
  const days = M.months.reduce((a, m) => a + m.days, 0);
  const cancelRate = safeDiv(M.cancelled, M.orders);

  /* ── So sánh brand ────────────────────────────────────────────────── */
  const compareRows = RES_BRANDS.flatMap(b => ITEM_DEFS.map(def => {
    const c = M.brands[b].items[def.key];
    return { id: `${b}-${def.key}`, brand: b, key: def.key, label: def.label, c, u: unitMetrics(c) };
  }));
  const compareColumns: Column<typeof compareRows[0]>[] = [
    { key: 'brand', header: 'Brand', render: r => <span className="font-bold" style={{ color: BRAND_COLORS[r.brand] }}>{r.brand}</span>,
      exportValue: r => r.brand },
    { key: 'label', header: 'Mục chi phí', render: r => (
      <span className="flex items-center gap-1.5 text-brand-text">
        <span className="h-2 w-2 rounded-sm" style={{ background: ITEM_COLOR[r.key] }} />{r.label}
      </span>) },
    { key: 'spend', header: 'Chi phí', align: 'right', render: r => (
      <span className="font-mono font-bold text-brand-goldLight">{formatVND(r.c.spend)}</span>), exportValue: r => Math.round(r.c.spend) },
    { key: 'actions', header: 'Hội thoại / CĐ', align: 'right', render: r => (
      <span className="font-mono">{formatNumber(r.c.actions)}</span>),
      exportValue: r => Math.round(r.c.actions) },
    { key: 'cpa', header: 'Chi phí / HĐ-CĐ', align: 'right', render: r => (
      <span className="font-mono">{formatVND(r.u.cpa)}</span>),
      exportValue: r => (r.u.cpa === null ? null : Math.round(r.u.cpa)) },
    { key: 'orders', header: 'Đơn ≈', align: 'right', render: r => <span className="font-mono">{formatNumber(r.c.orders, 1)}</span>,
      exportValue: r => Math.round(r.c.orders * 10) / 10 },
    { key: 'cpo', header: 'Chi phí / đơn', align: 'right', render: r => (
      <span className="font-mono font-bold text-brand-text">{formatVND(r.u.cpo)}</span>),
      exportValue: r => (r.u.cpo === null ? null : Math.round(r.u.cpo)) },
    { key: 'kept', header: 'Đơn giữ ≈', align: 'right', render: r => <span className="font-mono">{formatNumber(r.c.kept, 1)}</span>,
      exportValue: r => Math.round(r.c.kept * 10) / 10 },
    { key: 'cpg', header: 'Chi phí / khách', align: 'right', render: r => (
      <span className="font-mono text-brand-muted">{formatVND(r.u.cpg)}</span>),
      exportValue: r => (r.u.cpg === null ? null : Math.round(r.u.cpg)) },
  ];

  const cpoKeys = itemKeys;
  const cpoOption: EChartsOption = {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' },
      valueFormatter: (v: any) => (v == null ? '—' : `${formatVND(v)} / đơn`) },
    legend: { top: 0, textStyle: { color: '#9E9B93', fontSize: 11 } },
    grid: { top: 32, right: 12, bottom: 24, left: 52 },
    xAxis: { type: 'category', data: [...RES_BRANDS] },
    yAxis: { type: 'value', axisLabel: { formatter: (v: number) => formatVND(v, 0), color: '#9E9B93', fontSize: 10 },
      splitLine: { lineStyle: { color: gridLine, type: 'dashed' } } },
    series: cpoKeys.map(k => ({
      name: `${ITEM_DEFS.find(d => d.key === k)?.label} → ${SOURCE_OF[k]}`, type: 'bar' as const, barMaxWidth: 30,
      itemStyle: { color: ITEM_COLOR[k], borderRadius: [3, 3, 0, 0] },
      label: { show: true, position: 'top' as const, fontSize: 9, color: '#9E9B93', formatter: (p: any) => formatVND(p.value, 0) },
      data: RES_BRANDS.map(b => unitMetrics(M.brands[b].items[k]).cpo),
    })),
  };

  const shareOption: EChartsOption = {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v: any) => formatPercent(v) },
    legend: { top: 0, textStyle: { color: '#9E9B93', fontSize: 11 } },
    grid: { top: 32, right: 12, bottom: 24, left: 44 },
    xAxis: { type: 'category', data: [...RES_BRANDS] },
    yAxis: { type: 'value', axisLabel: { formatter: (v: number) => `${Math.round(v * 100)}%`, color: '#9E9B93', fontSize: 10 },
      splitLine: { lineStyle: { color: gridLine, type: 'dashed' } } },
    series: [
      { name: 'Tỷ trọng thực chi Ads (Meta + Google)', type: 'bar', barMaxWidth: 28,
        itemStyle: { color: '#C5A059', borderRadius: [3, 3, 0, 0] },
        label: { show: true, position: 'top', fontSize: 10, color: '#9E9B93', formatter: (p: any) => formatPercent(p.value, 0) },
        data: RES_BRANDS.map(b => M.brands[b].spendShare) },
      { name: 'Tỷ trọng đơn đặt bàn', type: 'bar', barMaxWidth: 28,
        itemStyle: { color: '#82846C', borderRadius: [3, 3, 0, 0] },
        label: { show: true, position: 'top', fontSize: 10, color: '#9E9B93', formatter: (p: any) => formatPercent(p.value, 0) },
        data: RES_BRANDS.map(b => M.brands[b].orderShare) },
    ],
  };

  /* ── Nguồn đơn ────────────────────────────────────────────────────── */
  const sourceOption: EChartsOption = {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' },
      formatter: (params: any) => {
        const g = M.groups[params[0]?.dataIndex];
        return g ? `<div style="font-size:12px"><b>${g.label}</b><br/>${formatNumber(g.orders)} đơn · ${formatPercent(safeDiv(g.orders, M.orders))}<br/>
          <span style="color:#9E9B93">${KIND_META[g.kind]?.label ?? g.kind} · tên iPOS: ${g.names.join(', ')}</span></div>` : '';
      } },
    grid: { top: 8, right: 72, bottom: 8, left: 4, containLabel: true },
    xAxis: { type: 'value', minInterval: 1, axisLabel: { show: false }, splitLine: { lineStyle: { color: gridLine, type: 'dashed' } } },
    yAxis: { type: 'category', inverse: true, data: M.groups.map(g => g.label), axisLabel: { fontSize: 11 } },
    series: [{ type: 'bar', barMaxWidth: 18,
      data: M.groups.map(g => ({ value: g.orders, itemStyle: { color: KIND_META[g.kind]?.color ?? '#9E9B93', borderRadius: [0, 3, 3, 0] } })),
      label: { show: true, position: 'right', fontSize: 10, color: '#9E9B93',
        formatter: (p: any) => `${p.value} · ${formatPercent(safeDiv(p.value, M.orders), 0)}` } }],
  };
  const kindTotals = Object.keys(KIND_META).map(k => ({ k, n: M.groups.filter(g => g.kind === k).reduce((a, g) => a + g.orders, 0) }));

  /* ── Xu hướng ngày ────────────────────────────────────────────────── */
  const D = M.daily.filter(d => !M.window.from || d.date >= M.window.from);
  const dailyOption: EChartsOption = {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' },
      formatter: (params: any) => {
        const d = D[params[0]?.dataIndex];
        if (!d) return '';
        return `<div style="font-size:12px;min-width:180px"><b>${dm(d.date)}</b><br/>
          Đơn: ${d.orders} · huỷ ${d.cancelled}<br/>Khách: ${d.guests}<br/>Chi Ads nhà hàng: ${formatVND(d.spend)}</div>`;
      } },
    legend: { top: 0, textStyle: { color: '#9E9B93', fontSize: 11 } },
    grid: { top: 34, right: 52, bottom: 24, left: 36 },
    xAxis: { type: 'category', data: D.map(d => dm(d.date)), axisLabel: { fontSize: 10 } },
    yAxis: [
      { type: 'value', name: 'Đơn', nameTextStyle: { color: '#9E9B93', fontSize: 10 }, axisLabel: { color: '#9E9B93', fontSize: 10 },
        splitLine: { lineStyle: { color: gridLine, type: 'dashed' } } },
      { type: 'value', name: 'Chi Ads', nameTextStyle: { color: '#9E9B93', fontSize: 10 },
        axisLabel: { formatter: (v: number) => formatVND(v, 0), color: '#9E9B93', fontSize: 10 }, splitLine: { show: false } },
    ],
    series: [
      { name: 'Đơn giữ', type: 'bar', stack: 'o', barMaxWidth: 16, itemStyle: { color: '#82846C' }, data: D.map(d => d.orders - d.cancelled) },
      { name: 'Đơn huỷ', type: 'bar', stack: 'o', barMaxWidth: 16, itemStyle: { color: '#B4574B', borderRadius: [3, 3, 0, 0] }, data: D.map(d => d.cancelled) },
      { name: 'Chi Ads nhà hàng (3 brand)', type: 'line', yAxisIndex: 1, symbolSize: 4, smooth: true,
        lineStyle: { color: '#DFBF7A', width: 2 }, itemStyle: { color: '#DFBF7A' }, data: D.map(d => d.spend) },
    ],
  };

  /* ── Cửa hàng & quy mô nhóm ───────────────────────────────────────── */
  const storeRows = M.stores.filter(s => s.guests > 0).map(s => ({ ...s, rate: safeDiv(s.cancel_guests, s.guests), share: safeDiv(s.guests, M.guests) }));
  const zeroStores = M.stores.filter(s => s.guests === 0).map(s => s.name);
  const storeColumns: Column<typeof storeRows[0]>[] = [
    { key: 'name', header: 'Cửa hàng', render: r => <span className="font-semibold text-brand-text">{r.name}</span> },
    { key: 'brand', header: 'Brand', render: r => <span className="font-bold" style={{ color: BRAND_COLORS[r.brand ?? 'OTHER'] }}>{r.brand}</span> },
    { key: 'guests', header: 'Khách đặt', align: 'right', render: r => <span className="font-mono">{formatNumber(r.guests)}</span> },
    { key: 'share', header: 'Tỷ trọng', align: 'right', render: r => <span className="font-mono text-brand-muted">{formatPercent(r.share, 0)}</span> },
    { key: 'cancel_guests', header: 'Khách huỷ', align: 'right', render: r => <span className="font-mono">{formatNumber(r.cancel_guests)}</span> },
    { key: 'rate', header: 'Tỷ lệ huỷ', align: 'right', render: r => (
      <span className={`font-mono font-bold ${(r.rate ?? 0) >= 0.2 ? 'text-status-bad' : (r.rate ?? 0) >= 0.12 ? 'text-status-warning' : 'text-status-ok'}`}>
        {formatPercent(r.rate, 0)}
      </span>) },
  ];
  const partyOption: EChartsOption = {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { top: 10, right: 52, bottom: 20, left: 80 },
    xAxis: { type: 'value', axisLabel: { color: '#9E9B93', fontSize: 10 }, splitLine: { lineStyle: { color: gridLine, type: 'dashed' } } },
    yAxis: { type: 'category', inverse: true, data: M.party.map(p => p.group), axisLabel: { fontSize: 11 } },
    series: [{ type: 'bar', barMaxWidth: 16, itemStyle: { color: '#AE8966', borderRadius: [0, 3, 3, 0] }, data: M.party.map(p => p.orders),
      label: { show: true, position: 'right', fontSize: 10, color: '#9E9B93',
        formatter: (p: any) => `${p.value} · ${formatPercent(safeDiv(p.value, M.orders), 0)}` } }],
  };

  /* ── Phân tích tự động ────────────────────────────────────────────── */
  const ranked = itemKeys
    .map(k => ({ k, label: ITEM_DEFS.find(d => d.key === k)!.label, cpo: unitMetrics(M.chain[k]).cpo }))
    .filter(r => r.cpo !== null).sort((a, b) => (a.cpo ?? 0) - (b.cpo ?? 0));
  const msgCpa = RES_BRANDS.map(b => ({ b, cpa: unitMetrics(M.brands[b].items.meta).cpa })).filter(x => x.cpa !== null)
    .sort((a, b) => (a.cpa ?? 0) - (b.cpa ?? 0));
  const gap = RES_BRANDS.map(b => ({ b, d: (M.brands[b].spendShare ?? 0) - (M.brands[b].orderShare ?? 0) })).sort((a, b) => b.d - a.d);
  const cancelTop = RES_BRANDS.map(b => ({ b, r: M.brands[b].cancelRate ?? 0 })).sort((a, b) => b.r - a.r);
  const phone = M.groups.filter(g => ['phone', 'walkin'].includes(g.group)).reduce((a, g) => a + g.orders, 0);
  const meta = M.chain.meta;
  const metaEng = Object.entries(meta.split).filter(([o]) => o !== 'Tin nhắn').reduce((a, [, v]) => a + v, 0);
  const metaMsg = meta.split['Tin nhắn'] ?? 0;
  const googleSpend = RES_BRANDS.map(b => ({ b, s: M.brands[b].items.google.spend, share: M.brands[b].orderShare ?? 0 }));
  const lowGoogle = googleSpend.filter(x => x.share > 0.25 && x.s < 0.1 * Math.max(...googleSpend.map(y => y.s)));
  const msgRate = unitMetrics(meta).actionToOrder;
  const partsText = (k: ItemKey) => partsOf(k).map(p => `${p.name} ${p.orders}`).join(' + ');

  const insights: { tone: 'ok' | 'warn' | 'bad' | 'info'; title: string; text: React.ReactNode }[] = [
    { tone: 'info', title: `Kênh có Ads tạo ${formatPercent(safeDiv(paidOrders, M.orders), 0)} số đơn`,
      text: <>Fanpage ({partsText('meta')}) và Google Ads ({partsText('google')}) tạo <b>{formatNumber(paidOrders)}</b>/{formatNumber(M.orders)} đơn.
        Điện thoại + vãng lai vẫn chiếm <b>{formatPercent(safeDiv(phone, M.orders), 0)}</b> — phần này chưa nối được với quảng cáo
        (khách thấy ads rồi gọi điện sẽ ghi nguồn "Gọi đặt").</> },
    ranked.length > 1 && { tone: 'ok', title: `${ranked[0].label} rẻ hơn ${formatNumber((ranked.at(-1)!.cpo ?? 0) / (ranked[0].cpo || 1), 1)} lần trên mỗi đơn`,
      text: <>Chi phí / đơn đặt bàn: {ranked.map((r, i) => <React.Fragment key={r.k}>{i > 0 && ' · '}<b>{r.label}</b> {formatVND(r.cpo)}</React.Fragment>)}.
        Google chỉ chiếm {formatPercent(safeDiv(M.chain.google.spend, spendActual), 0)} thực chi mà mang về {formatNumber(M.chain.google.orders)} đơn
        ({formatPercent(safeDiv(M.chain.google.orders, paidOrders), 0)} đơn từ kênh có Ads). Lưu ý: nguồn Google Ads gồm cả Website và nút Đặt bàn
        trên Google Maps — một phần là đơn tự nhiên, nên đây là mức <b>sàn</b> của chi phí thật.</> },
    metaEng > 0 && { tone: 'warn', title: `${formatPercent(safeDiv(metaEng, meta.spend), 0)} chi Meta là chiến dịch Tương tác`,
      text: <>Meta Ads {formatVND(meta.spend)} = Tin nhắn {formatVND(metaMsg)} + Tương tác/khác {formatVND(metaEng)}. Hội thoại chỉ đến từ chiến dịch Tin nhắn
        ({formatVND(safeDiv(metaMsg, meta.actions))} / hội thoại nếu chỉ tính Tin nhắn). Nếu mục tiêu tháng là đặt bàn, dời một phần ngân sách Tương tác
        sang Tin nhắn sẽ kéo chi phí / đơn Fanpage xuống.</> },
    msgCpa.length > 1 && { tone: 'warn', title: `Hội thoại Meta của ${msgCpa.at(-1)!.b} đắt gấp ${formatNumber((msgCpa.at(-1)!.cpa ?? 0) / (msgCpa[0].cpa || 1), 1)} lần ${msgCpa[0].b}`,
      text: <>Chi phí Meta / hội thoại: {msgCpa.map((x, i) => <React.Fragment key={x.b}>{i > 0 && ' · '}<b>{x.b}</b> {formatVND(x.cpa)}</React.Fragment>)} (số thật từ Meta, gồm cả chi Tương tác).
        Toàn chuỗi {formatPercent(msgRate, 1)} hội thoại thành đơn Fanpage — <b>trần trên</b> vì FacebookCRM gồm cả inbox tự nhiên.</> },
    { tone: gap[0].d > 0.05 ? 'warn' : 'info', title: `${gap[0].b} chi nhiều hơn phần đơn mang về`,
      text: <>{RES_BRANDS.map((b, i) => <React.Fragment key={b}>{i > 0 && ' · '}<b>{b}</b> {formatPercent(M.brands[b].spendShare, 0)} chi phí ↔ {formatPercent(M.brands[b].orderShare, 0)} đơn</React.Fragment>)}.
        {gap.at(-1)!.d < 0 && <> {gap.at(-1)!.b} đang hiệu quả hơn mức chi.</>}</> },
    { tone: cancelTop[0].r >= 0.2 ? 'bad' : 'warn', title: `${cancelTop[0].b} huỷ ${formatPercent(cancelTop[0].r, 0)} số khách đặt`,
      text: <>Tỷ lệ khách huỷ: {cancelTop.map((x, i) => <React.Fragment key={x.b}>{i > 0 && ' · '}<b>{x.b}</b> {formatPercent(x.r, 0)}</React.Fragment>)}.
        Huỷ cao đẩy chi phí / đơn giữ của {cancelTop[0].b} lên — nên gọi xác nhận trước giờ hẹn hoặc thu cọc với nhóm lớn.</> },
    lowGoogle.length > 0 && { tone: 'info', title: `${lowGoogle.map(x => x.b).join(', ')} gần như không chạy Google`,
      text: <>{lowGoogle.map(x => `${x.b} chiếm ${formatPercent(x.share, 0)} đơn nhưng chỉ chi ${formatVND(x.s)} Google`).join('; ')}.
        Google là mục rẻ nhất trên mỗi đơn ở các brand khác — còn dư địa tăng.</> },
  ].filter(Boolean) as typeof insights;

  const toneCls = { ok: 'border-status-ok/40', warn: 'border-status-warning/40', bad: 'border-status-bad/40', info: 'border-brand-border' };
  const toneDot = { ok: 'bg-status-ok', warn: 'bg-status-warning', bad: 'bg-status-bad', info: 'bg-brand-muted' };

  const ads = M.ads[0];
  const scopes: { v: Scope; lb: string }[] = [{ v: 'CHAIN', lb: 'Toàn chuỗi' }, ...RES_BRANDS.map(b => ({ v: b as Scope, lb: b }))];

  return (
    <div className="space-y-5 p-4 sm:p-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div>
        <span className="text-[10px] font-extrabold uppercase tracking-widest text-brand-gold">QUẢNG CÁO CÓ RA ĐƠN ĐẶT BÀN KHÔNG</span>
        <h2 className="mt-0.5 font-display text-xl font-extrabold text-brand-text">M11 · Đặt bàn</h2>
        <p className="mt-1 max-w-4xl text-xs text-brand-muted">
          Phễu từ <b>thực chi Ads</b> (Meta · Google, phễu nhà hàng của NCB · NDC · NJFB) tới <b>đơn đặt bàn iPOS</b> theo nguồn đơn.
          Kỳ {M.months.map(m => formatMonthLabel(m.month)).join(', ')} · cửa sổ đối chiếu {M.window.from ? dm(M.window.from) : '—'} → {M.window.to ? dm(M.window.to) : '—'} ({days} ngày có đơn).
          Số có dấu <b>≈</b> là ước tính phân bổ — iPOS chỉ xuất nguồn đơn ở cấp toàn chuỗi.
        </p>
        {fellBack && (
          <p className="mt-2 inline-block rounded-md border border-status-warning/40 bg-status-warningBg px-2.5 py-1 text-[11px] text-status-warning">
            Kỳ đang chọn chưa có dữ liệu đặt bàn — đang hiện {formatMonthLabel(months[0])}, tháng gần nhất có báo cáo iPOS.
          </p>
        )}
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <MetricCard label="Đơn đặt bàn" subLabel="iPOS · mọi nguồn" value={formatNumber(M.orders)} unit="đơn" variant="hero"
          customDeltaText={`${formatNumber(safeDiv(M.orders, days), 1)} đơn / ngày · ${days} ngày`} />
        <MetricCard label="Đơn huỷ" subLabel="Trạng thái Đã huỷ" value={formatNumber(M.cancelled)} unit="đơn"
          variant={(cancelRate ?? 0) > 0.15 ? 'warning' : 'default'} customDeltaText={`${formatPercent(cancelRate)} tổng đơn`} />
        <MetricCard label="Khách đặt" subLabel="Báo cáo theo cửa hàng" value={formatNumber(M.guests)} unit="khách"
          customDeltaText={`${formatNumber(M.partyAvg, 1)} khách / đơn · huỷ ${formatPercent(safeDiv(M.cancelGuests, M.guests), 0)}`} />
        <MetricCard label="Thực chi Ads nhà hàng" subLabel="Meta + Google · 3 brand" value={formatVND(spendActual)}
          customDeltaText={`cả tháng ${formatVND(M.spendMonthStore)} · không gồm tiệc NEC ${formatVND(M.excluded.tiec)}`} />
        <MetricCard label="Đơn từ kênh có Ads" subLabel="Fanpage + Google Ads" value={formatNumber(paidOrders)} unit="đơn"
          customDeltaText={`${formatPercent(safeDiv(paidOrders, M.orders), 0)} tổng đơn`} />
        <MetricCard label="Chi phí / đơn từ Ads" subLabel="Thực chi Meta+Google ÷ đơn Fanpage+Google Ads" value={formatVND(safeDiv(spendActual, paidOrders))}
          customDeltaText={`Ads ÷ mọi đơn: ${formatVND(safeDiv(spendActual, M.orders))}`} />
      </div>

      {/* Phễu theo mục chi phí */}
      <Card
        title="Phễu chuyển đổi theo mục chi phí"
        description="Meta Ads (Tin nhắn + Tương tác) → nguồn Fanpage (FacebookCRM + Fanpage). Google Ads → nguồn Google Ads (Google Ads + Website). Đi từ hiển thị → click → hội thoại/chuyển đổi → đơn iPOS → đơn giữ → khách. Thanh vẽ theo thang log; chi phí đơn vị ở bên phải."
        chip={scope === 'CHAIN' ? 'TOÀN CHUỖI' : `BRAND ${scope} · ƯỚC TÍNH`}
        hero
      >
        <div className="mb-3 inline-flex flex-wrap rounded-lg border border-brand-border bg-brand-surface p-0.5 text-[11px] font-semibold">
          {scopes.map(o => (
            <button key={o.v} onClick={() => setScope(o.v)}
              className={`whitespace-nowrap rounded-md px-3 py-1 transition-colors ${scope === o.v ? 'bg-brand-gold text-[#141417]' : 'text-brand-muted hover:text-brand-text'}`}>
              {o.lb}
            </button>
          ))}
        </div>
        {scope !== 'CHAIN' && (
          <p className="mb-3 text-[11px] text-brand-muted">
            <b style={{ color: BRAND_COLORS[scope] }}>{BRAND_NAMES[scope]}</b> — tầng Ads là số thật của brand; tầng đơn là phần chia của nguồn toàn chuỗi:
            Fanpage {ALLOC_LABEL.meta}, Google Ads {ALLOC_LABEL.google}.
            Huỷ theo tỷ lệ khách huỷ của brand ({formatPercent(M.brands[scope].cancelRate, 0)}).
          </p>
        )}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {ITEM_DEFS.map(def => (
            <ItemFunnel key={def.key} def={def} cell={items[def.key]} estimated={scope !== 'CHAIN'} color={ITEM_COLOR[def.key]} parts={partsOf(def.key)} />
          ))}
        </div>
      </Card>

      {/* Phân tích */}
      <Card title="Phân tích — chi phí Ads chuyển thành đặt bàn ra sao" description="Tự sinh từ số trong kỳ; đọc kèm phần độ tin cậy cuối trang." chip="INSIGHT">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {insights.map(x => (
            <div key={x.title} className={`rounded-xl border ${toneCls[x.tone]} bg-brand-surface/50 p-3`}>
              <div className="mb-1 flex items-center gap-2">
                <span className={`h-2 w-2 flex-shrink-0 rounded-full ${toneDot[x.tone]}`} />
                <span className="text-xs font-extrabold text-brand-text">{x.title}</span>
              </div>
              <p className="text-[11px] leading-relaxed text-brand-muted">{x.text}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* So sánh brand */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Chi phí trên mỗi đơn đặt bàn — theo brand" description="Meta Ads → đơn Fanpage · Google Ads → đơn Google Ads (gồm Website)." chip="≈ ƯỚC TÍNH">
          <EChartWrapper option={cpoOption} height={280} />
        </Card>
        <Card title="Tỷ trọng chi phí ↔ tỷ trọng đơn" description="Cột vàng cao hơn cột xanh = brand đang chi nhiều hơn phần đơn đặt bàn mang về." chip="HIỆU QUẢ PHÂN BỔ">
          <EChartWrapper option={shareOption} height={280} />
        </Card>
      </div>
      <Card title="Bảng phễu brand × mục chi phí" description="Chi phí, hội thoại/chuyển đổi là số thật; đơn, đơn giữ, chi phí / đơn là ước tính phân bổ (≈)." chip={`${compareRows.length} DÒNG`}>
        <DataTable columns={compareColumns} data={compareRows} searchable={false} pageSize={12} exportFilename="Noire_M11_Dat_Ban_Pheu_Brand" />
      </Card>

      {/* Nguồn + xu hướng */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card title="Đơn đặt bàn theo nguồn" description="Gộp các mã nguồn iPOS cùng tên. Vàng: có chi phí Ads · xanh: kênh sở hữu · xám: điện thoại / vãng lai / trực tiếp." chip={`${formatNumber(M.orders)} ĐƠN`}>
          <EChartWrapper option={sourceOption} height={Math.max(220, M.groups.length * 30 + 30)} />
          <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-brand-muted">
            {kindTotals.map(t => (
              <span key={t.k} className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm" style={{ background: KIND_META[t.k].color }} />
                {KIND_META[t.k].label}: <b className="text-brand-text">{formatNumber(t.n)}</b> ({formatPercent(safeDiv(t.n, M.orders), 0)})
              </span>
            ))}
          </div>
        </Card>
        <Card title="Đơn theo ngày ↔ chi Ads" description="Cột: đơn giữ + đơn huỷ theo ngày trong báo cáo iPOS. Đường: thực chi Ads nhà hàng cùng ngày." chip="NGÀY">
          <EChartWrapper option={dailyOption} height={300} />
        </Card>
      </div>

      {/* Cửa hàng + quy mô */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <Card title="Khách đặt theo cửa hàng" description={zeroStores.length ? `Chưa có khách đặt qua iPOS: ${zeroStores.join(', ')}.` : 'Mọi cửa hàng đều có khách đặt.'} chip="CỬA HÀNG" className="xl:col-span-3">
          <DataTable columns={storeColumns} data={storeRows} searchable={false} pageSize={10} exportFilename="Noire_M11_Dat_Ban_Cua_Hang" />
        </Card>
        <Card title="Quy mô nhóm khách" description="Số đơn theo số khách trên đơn." chip={`${formatNumber(M.partyAvg, 1)} KHÁCH / ĐƠN`} className="xl:col-span-2">
          <EChartWrapper option={partyOption} height={220} />
        </Card>
      </div>

      {/* Độ tin cậy */}
      <Card title="Đọc số này thế nào cho đúng" description="Giới hạn của 5 báo cáo iPOS và cách ghép với Ads." chip="ĐỘ TIN CẬY">
        <ul className="space-y-1.5 text-[11px] leading-relaxed">
          {[
            { tone: 'info', text: <>Nguồn đơn iPOS là <b>kênh tạo đơn</b>, không phải attribution quảng cáo (luật M5 §2). Ghép mục chi phí ↔ nguồn đơn là <b>tương quan</b>, không phải nhân quả. Không dùng từ "ROAS" ở đây.</> },
            { tone: 'warn', text: <>Nguồn đơn chỉ có ở <b>cấp toàn chuỗi</b>. Đơn theo brand là ước tính: nguồn trả phí chia theo tín hiệu Ads của brand, nguồn còn lại chia theo tỷ trọng khách đặt. Vì vậy tỷ lệ hội thoại → đơn giống nhau giữa các brand — khác biệt thật nằm ở <b>chi phí / hội thoại</b> và <b>chi phí / chuyển đổi</b>. Muốn số thật theo brand: xuất "Nguồn đơn đặt bàn" lọc riêng từng nhà hàng.</> },
            { tone: 'info', text: <>Chuyển đổi Google (PMax Local) gồm chỉ đường · gọi · vào web — không phải đơn đặt bàn. FacebookCRM gồm cả inbox tự nhiên, nên tỷ lệ hội thoại → đơn là trần trên.</> },
            { tone: 'info', text: <>Quy ước ghép nguồn: <b>Fanpage</b> = FacebookCRM + Fanpage ↔ Meta Ads (Tin nhắn + Tương tác); <b>Google Ads</b> = Google Ads + Website ↔ Google Ads. Zalo Ads không tính (chưa có thực chi) — ZaloCRM xếp vào kênh sở hữu.</> },
            { tone: 'info', text: <>Thực chi cắt theo cửa sổ có đơn ({M.window.from ? dm(M.window.from) : '—'} → {M.window.to ? dm(M.window.to) : '—'}). Chi tiệc NEC ({formatVND(M.excluded.tiec)}) thuộc M10, không tính ở đây{M.excluded.unknown > 0 ? <>; {formatVND(M.excluded.unknown)} chưa gán brand cũng bị loại</> : null}.</> },
            { tone: 'info', text: <>Báo cáo iPOS không có <b>no-show</b> và doanh thu bill — phễu dừng ở đơn giữ / khách giữ chỗ. Khách giữ chỗ = đơn giữ × {formatNumber(M.partyAvg, 2)} khách/đơn (trung bình chuỗi).</> },
            ...M.qa.filter(q => !q.ok).map(q => ({ tone: 'warn', text: <><b>{formatMonthLabel(q.month)} · {q.name}:</b> {q.detail}</> })),
          ].map((q, i) => (
            <li key={i} className="flex gap-2">
              <span className={`mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full ${q.tone === 'warn' ? 'bg-status-warning' : 'bg-brand-muted'}`} />
              <span className="text-brand-muted">{q.text}</span>
            </li>
          ))}
        </ul>
        <details className="mt-3 text-[11px]">
          <summary className="cursor-pointer font-semibold text-brand-sand">Chốt QA đã đạt ({M.qa.filter(q => q.ok).length}/{M.qa.length})</summary>
          <ul className="mt-2 space-y-1 text-brand-muted">
            {M.qa.filter(q => q.ok).map(q => <li key={q.month + q.name}>✔ {q.name}: {q.detail}</li>)}
          </ul>
        </details>
        {ads && (
          <details className="mt-2 text-[11px]">
            <summary className="cursor-pointer font-semibold text-brand-sand">
              Chiến dịch Ads trong cửa sổ ({ads.campaigns.length}) · số Ads đồng bộ tới {ads.synced_through ?? '—'}{ads.kept ? ' · giữ bản cũ (không có DB lúc dựng)' : ''}
            </summary>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[640px] font-mono">
                <thead>
                  <tr className="text-left text-[10px] uppercase text-brand-faint">
                    <th className="py-1 pr-2">Brand</th><th className="pr-2">Chiến dịch</th><th className="pr-2">Mục</th>
                    <th className="pr-2 text-right">Chi phí</th><th className="pr-2 text-right">Click</th><th className="pr-2 text-right">Hội thoại</th><th className="text-right">CĐ Google</th>
                  </tr>
                </thead>
                <tbody>
                  {M.ads.flatMap(a => a.campaigns).map((c, i) => {
                    const inScope = c.funnel === 'store' && RES_BRANDS.includes(c.brand as ResBrand);
                    return (
                      <tr key={i} className={`border-t border-brand-border/60 ${inScope ? 'text-brand-muted' : 'text-brand-faint line-through'}`}>
                        <td className="py-1 pr-2">{c.brand}</td>
                        <td className="pr-2 font-sans text-brand-text">{c.campaign}</td>
                        <td className="pr-2 font-sans">{c.platform === 'google' ? 'Google' : `Meta · ${c.objective}`}{c.funnel !== 'store' ? ` · ${c.funnel}` : ''}</td>
                        <td className="pr-2 text-right">{formatVND(c.spend)}</td>
                        <td className="pr-2 text-right">{formatNumber(c.clicks)}</td>
                        <td className="pr-2 text-right">{formatNumber(c.msgs)}</td>
                        <td className="text-right">{formatNumber(c.conv)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </details>
        )}
        <p className="mt-2 text-[10px] text-brand-faint">Dựng lúc {new Date(RESERVATION.built).toLocaleString('vi-VN')} · file: {M.months.flatMap(m => m.files).join(' · ')}</p>
      </Card>
    </div>
  );
};
