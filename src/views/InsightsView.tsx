import React, { useState, useMemo } from 'react';
import { useFilters } from '../context/FilterContext';
import { HUB_DATA, MKT_DATA, FULL_MONTHS } from '../data';
import { MetricCard } from '../components/common/MetricCard';
import { Card } from '../components/common/Card';
import { StatusBadge } from '../components/common/StatusBadge';
import { DataTable, Column } from '../components/common/DataTable';
import { EChartWrapper } from '../components/charts/EChartWrapper';
import { formatVND, formatNumber, formatPercent, formatMonthLabel, calculateDelta } from '../utils/formatters';
import {
  decompose, explainDecomposition, detectAnomalies, sameStore, storeContributions,
  type Anomaly, type StoreContribution,
} from '../utils/analytics';
import { AlertCircle, AlertTriangle, CheckCircle, Filter, Users, Coins, Activity } from 'lucide-react';
import type { EChartsOption } from 'echarts';

export interface InsightItem {
  id: string;
  title: string;
  desc: string;
  module: string;
  level: 'bad' | 'warning' | 'ok';
}

export const InsightsView: React.FC = () => {
  const { inScope, aggByMonth, filters } = useFilters();
  const [filterLevel, setFilterLevel] = useState<'all' | 'bad' | 'warning' | 'ok'>('all');

  const fullMs = FULL_MONTHS;
  const lastFull = fullMs[fullMs.length - 1] || '2026-07';
  const prevFull = fullMs[fullMs.length - 2] || '2026-06';

  const lastAgg = aggByMonth[lastFull] || { net: 0, days: 30 };
  const prevAgg = aggByMonth[prevFull] || { net: 0, days: 30 };

  /* ── Engine phân tích (src/utils/analytics.ts) ────────────────────── */
  const scopeStores = useMemo(
    () => Object.keys(HUB_DATA.stores).filter(inScope),
    [filters.scope, filters.brand],
  );

  // ❶ Bóc tách nguyên nhân: doanh thu đổi vì LƯỢNG khách hay vì CHI TIÊU đầu khách?
  const decomp = useMemo(() => {
    const at = (m: string) => HUB_DATA.store_month
      .filter(r => r.month === m && inScope(r.store))
      .reduce((a, r) => ({ net: a.net + r.net, guest: a.guest + r.guest }), { net: 0, guest: 0 });
    return decompose(at(prevFull), at(lastFull));
  }, [prevFull, lastFull, filters.scope, filters.brand]);

  // ❷ Bất thường ±1,5σ trên xu hướng RIÊNG của từng cửa hàng
  const anomalies = useMemo(
    () => detectAnomalies(fullMs, scopeStores, 1.5),
    [fullMs, scopeStores],
  );

  // ❸ Same-store: tách phần tăng trưởng thật khỏi phần do cửa hàng mới mở
  const ss = useMemo(
    () => sameStore(prevFull, lastFull, inScope),
    [prevFull, lastFull, filters.scope, filters.brand],
  );

  // ❹ Cửa hàng nào kéo con số chung đi
  const contribs = useMemo(
    () => storeContributions(prevFull, lastFull, inScope),
    [prevFull, lastFull, filters.scope, filters.brand],
  );

  const deltaNet = calculateDelta(lastAgg.net, prevAgg.net);
  const deltaPerDay = calculateDelta(lastAgg.net / lastAgg.days, prevAgg.net / prevAgg.days);

  // Anomaly: Stores dropping 2+ consecutive months
  const droppingStores: { store: string; n: number; dropPct: number }[] = [];
  const inScopeStores = Object.keys(HUB_DATA.stores).filter(inScope);

  inScopeStores.forEach(st => {
    const series = fullMs
      .map(m => HUB_DATA.store_month.find(r => r.month === m && r.store === st))
      .filter(Boolean);

    if (series.length >= 3) {
      let n = 0;
      for (let i = series.length - 1; i > 0; i--) {
        if (series[i]!.net < series[i - 1]!.net) n++;
        else break;
      }
      if (n >= 2) {
        const curVal = series[series.length - 1]!.net;
        const prevVal = series[series.length - 1 - n]!.net;
        droppingStores.push({
          store: HUB_DATA.stores[st]?.name || st,
          n,
          dropPct: (curVal - prevVal) / prevVal,
        });
      }
    }
  });

  const PS = HUB_DATA.product_stat;
  const idBills = HUB_DATA.identify.reduce((a, b) => a + b.id_bills, 0);
  const totalBills = HUB_DATA.identify.reduce((a, b) => a + b.bills, 0);
  const idRate = totalBills > 0 ? idBills / totalBills : 0;

  const natTotals: Record<string, number> = {};
  (HUB_DATA.nature || []).forEach(r => {
    natTotals[r.nature] = (natTotals[r.nature] || 0) + r.rev;
  });
  const totalNatRev = Object.values(natTotals).reduce((a, b) => a + b, 0);
  const internalShare = totalNatRev > 0 ? (natTotals['INTERNAL'] || 0) / totalNatRev : 0;

  const GS = MKT_DATA.gads_stat || { spend: 0, paused_spend: 0, unmapped: [] };
  const B = MKT_DATA.budget || { channel: [], store_ads: [] };
  const CH = B.channel || [];
  const zaloBudget = CH.filter(c => c.channel === 'Zalo Ads').reduce((a, c) => a + c.plan, 0);

  // Generate automated insights list
  const insights: InsightItem[] = [
    {
      id: 'ins-1',
      title: `Độ phủ giá vốn (COGS) mới đạt ${formatPercent(HUB_DATA.meta.cogs_coverage)}`,
      desc: `Bảng BOM chỉ có ${HUB_DATA.bom_stat.codes} mã duy nhất trong khi hệ thống đã bán ${formatNumber(
        PS.sku
      )} SKU (mới có ${formatNumber(
        PS.sku_cogs
      )} món có giá vốn). Toàn bộ tầng biên lợi nhuận, Prime Cost và ma trận menu đang chạy trên chưa tới một nửa doanh thu.`,
      module: 'M2 · Menu',
      level: 'bad',
    },
    {
      id: 'ins-2',
      title: `Chỉ ${formatPercent(idRate)} hoá đơn nhận diện được khách hàng`,
      desc: `Mọi chỉ số CRM, tỷ lệ quay lại và attribution quảng cáo đều bị chặn ở đây. Đây là lý do chính đáng để hệ thống không sử dụng chỉ số ROAS.`,
      module: 'M9 · CRM',
      level: 'bad',
    },
    {
      id: 'ins-3',
      title: `Chiết khấu INTERNAL chiếm ${formatPercent(internalShare)} doanh thu gắn chương trình`,
      desc: `Ưu đãi nội bộ không phải là hoạt động marketing. Nếu gộp chung khi báo cáo, hiệu quả marketing sẽ bị bóp méo nghiêm trọng theo hướng bất lợi.`,
      module: 'M8 · Khuyến mãi',
      level: 'warning',
    },
    {
      id: 'ins-4',
      title: `${formatNumber(PS.slow)} SKU bán chậm (<10 suất/tháng), chỉ đóng góp ${formatPercent(PS.slow_rev)} doanh thu`,
      desc: `Menu đang phình to. Phần đuôi dài kéo theo chi phí tồn kho, hao hụt nguyên liệu và thời gian order của khách hàng.`,
      module: 'M2 · Menu',
      level: 'warning',
    },
    ...(HUB_DATA.bom_stat.loss > 0
      ? [
          {
            id: 'ins-5',
            title: `${HUB_DATA.bom_stat.loss} món có giá vốn ≥100% giá bán (Bán lỗ)`,
            desc: `Theo bảng BOM, các món này đang có chi phí vượt giá bán. Cần Bếp và Cost Control kiểm tra lại định lượng và công thức nhập.`,
            module: 'M2 · BOM',
            level: 'bad' as const,
          },
        ]
      : []),
    ...(droppingStores.length > 0
      ? [
          {
            id: 'ins-6',
            title: `${droppingStores.length} cửa hàng giảm doanh thu từ 2 kỳ liên tiếp`,
            desc: droppingStores
              .map(x => `${x.store} (${x.n} kỳ, ${formatPercent(x.dropPct)})`)
              .join(' · '),
            module: 'M1 · Doanh thu',
            level: 'warning' as const,
          },
        ]
      : []),
    ...(zaloBudget > 0
      ? [
          {
            id: 'ins-7',
            title: `Zalo Ads được cấp ${formatVND(zaloBudget)} cho Q3 nhưng chưa ghi nhận thực chi`,
            desc: `Đến hết Tháng 8 vẫn chưa phát sinh dòng tiền. Hoặc kênh chưa triển khai, hoặc đã chạy nhưng chưa tích hợp dữ liệu vào hub.`,
            module: 'M4 · Ngân sách',
            level: 'bad' as const,
          },
        ]
      : []),
    ...(GS.paused_spend > 0
      ? [
          {
            id: 'ins-8',
            title: `Chiến dịch Google Ads tạm dừng vẫn phát sinh ${formatNumber(GS.paused_spend)} đ với 0 chuyển đổi`,
            desc: `Chiến dịch ${GS.unmapped?.join(', ') || 'tạm dừng'} chiếm ${formatPercent(
              GS.paused_spend / (GS.spend || 1)
            )} tổng chi phí Google mà không mang lại lượt chuyển đổi nào.`,
            module: 'M5 · Ads',
            level: 'bad' as const,
          },
        ]
      : []),
    {
      id: 'ins-9',
      title: `Tỷ lệ khớp Voucher ↔ Hoá đơn đạt ${formatPercent(MKT_DATA.voucher_join?.rate || 0.998)}`,
      desc: `Trong khi attribution ads bị chặn ở 8,6% nhận diện thì voucher lại khớp gần như tuyệt đối với hoá đơn POS. Mọi chương trình phát mã đều đo được doanh thu thật đáng tin cậy.`,
      module: 'M9 · Voucher',
      level: 'ok',
    },
  ];

  const filteredInsights = insights.filter(it => {
    if (filterLevel === 'all') return true;
    return it.level === filterLevel;
  });

  /* ── Biểu đồ thác nước cho phần bóc tách nguyên nhân ────────────────
     Cột "bệ đỡ" trong suốt để mỗi khối bắt đầu đúng chỗ khối trước kết thúc. */
  const wfSteps = [
    { name: `Net ${formatMonthLabel(prevFull)}`, value: decomp.netPrev, kind: 'total' as const },
    { name: 'Do lượng khách', value: decomp.volumeEffect, kind: 'delta' as const },
    { name: 'Do chi tiêu (TA)', value: decomp.priceEffect, kind: 'delta' as const },
    { name: 'Tương tác', value: decomp.interaction, kind: 'delta' as const },
    { name: `Net ${formatMonthLabel(lastFull)}`, value: decomp.netCur, kind: 'total' as const },
  ];
  const base: number[] = [];
  const bars: number[] = [];
  let run = 0;
  wfSteps.forEach(s => {
    if (s.kind === 'total') {
      base.push(0);
      bars.push(s.value);
      run = s.value;
    } else {
      base.push(s.value >= 0 ? run : run + s.value);
      bars.push(Math.abs(s.value));
      run += s.value;
    }
  });

  const waterfallOption: EChartsOption = {
    grid: { top: 28, right: 16, bottom: 26, left: 62 },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (p: any) => {
        const i = Array.isArray(p) ? p[0].dataIndex : p.dataIndex;
        const s = wfSteps[i];
        return `<b>${s.name}</b><br/>${s.kind === 'delta' && s.value > 0 ? '+' : ''}${formatVND(s.value)}`;
      },
    },
    xAxis: {
      type: 'category',
      data: wfSteps.map(s => s.name),
      axisLabel: { fontSize: 10, interval: 0 },
    },
    yAxis: {
      type: 'value',
      name: 'Net Sales (VNĐ)',
      nameTextStyle: { fontSize: 10 },
      axisLabel: { fontSize: 10, formatter: (v: number) => formatVND(v, 0) },
    },
    series: [
      {
        type: 'bar', stack: 'wf', silent: true,
        itemStyle: { color: 'transparent' },
        data: base, barMaxWidth: 56,
      },
      {
        type: 'bar', stack: 'wf', barMaxWidth: 56,
        label: {
          show: true, position: 'top', fontSize: 10, fontWeight: 'bold',
          formatter: (p: any) => {
            const s = wfSteps[p.dataIndex];
            return (s.kind === 'delta' && s.value > 0 ? '+' : '') + formatVND(s.value);
          },
        },
        data: bars.map((v, i) => ({
          value: v,
          itemStyle: {
            color: wfSteps[i].kind === 'total'
              ? '#B0834B'
              : wfSteps[i].value >= 0 ? '#4A7C59' : '#A8443A',
          },
        })),
      },
    ],
  };

  /* ── Cột bảng ────────────────────────────────────────────────────── */
  const driverChip = (d: { driver: string; driverShare: number }) => (
    <StatusBadge
      label={d.driver === 'volume' ? 'Lượng khách' : d.driver === 'price' ? 'Chi tiêu' : 'Cả hai'}
      variant={d.driver === 'volume' ? 'warning' : d.driver === 'price' ? 'nature-comm' : 'neutral'}
    />
  );

  const anomalyCols: Column<Anomaly>[] = [
    {
      key: 'storeName', header: 'Cửa hàng', sortable: true,
      render: r => (
        <div>
          <div className="font-semibold text-brand-text">{r.storeName}</div>
          <div className="text-[10px] text-brand-faint">{r.brand}</div>
        </div>
      ),
    },
    {
      key: 'z', header: 'Lệch (σ)', align: 'right', sortable: true,
      render: r => (
        <span className={`font-mono font-bold ${r.direction === 'up' ? 'text-status-ok' : 'text-status-bad'}`}>
          {r.z > 0 ? '+' : ''}{r.z.toFixed(2)}σ
        </span>
      ),
    },
    {
      key: 'growth', header: 'MoM kỳ này', align: 'right', sortable: true,
      render: r => (
        <span className={r.growth >= 0 ? 'text-status-ok' : 'text-status-bad'}>
          {r.growth > 0 ? '+' : ''}{formatPercent(r.growth)}
        </span>
      ),
    },
    {
      key: 'meanGrowth', header: 'MoM thường thấy', align: 'right', sortable: true,
      render: r => (
        <span className="text-brand-muted">
          {r.meanGrowth > 0 ? '+' : ''}{formatPercent(r.meanGrowth)}
          <span className="text-brand-faint"> ±{formatPercent(r.sd)}</span>
        </span>
      ),
    },
    { key: 'net', header: 'Net kỳ này', align: 'right', sortable: true, render: r => formatVND(r.net) },
    { key: 'driver', header: 'Nguyên nhân', align: 'center', render: r => driverChip(r.decomposition) },
  ];

  const contribCols: Column<StoreContribution>[] = [
    {
      key: 'storeName', header: 'Cửa hàng', sortable: true,
      render: r => (
        <div className="flex items-center gap-1.5">
          <div>
            <div className="font-semibold text-brand-text">{r.storeName}</div>
            <div className="text-[10px] text-brand-faint">{r.brand}</div>
          </div>
          {r.isNew && <StatusBadge label="Mới" variant="nature-part" />}
        </div>
      ),
    },
    { key: 'netPrev', header: formatMonthLabel(prevFull), align: 'right', sortable: true, render: r => formatVND(r.netPrev) },
    { key: 'netCur', header: formatMonthLabel(lastFull), align: 'right', sortable: true, render: r => formatVND(r.netCur) },
    {
      key: 'delta', header: 'Biến động', align: 'right', sortable: true,
      render: r => (
        <span className={`font-semibold ${r.delta >= 0 ? 'text-status-ok' : 'text-status-bad'}`}>
          {r.delta > 0 ? '+' : ''}{formatVND(r.delta)}
        </span>
      ),
    },
    {
      key: 'shareOfChange', header: '% mức biến động', align: 'right', sortable: true,
      render: r => (r.shareOfChange == null ? '—' : (
        <span className="font-mono text-brand-sand">
          {r.shareOfChange > 0 ? '+' : ''}{formatPercent(r.shareOfChange)}
        </span>
      )),
    },
    { key: 'driver', header: 'Nguyên nhân', align: 'center', render: r => driverChip(r.decomposition) },
  ];

  return (
    <div className="space-y-5 p-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-brand-gold">
            PHÁT HIỆN TỰ ĐỘNG
          </span>
          <h2 className="text-xl font-extrabold text-brand-text font-display mt-0.5">
            R1 · Tổng Hợp Insight &amp; Cảnh Báo Chiến Lược
          </h2>
          <p className="text-xs text-brand-muted mt-1">
            Hệ thống phát hiện tự động các điểm bất thường và cơ hội tối ưu hóa từ dữ liệu chuỗi.
          </p>
        </div>

        {/* Filter level buttons */}
        <div className="flex items-center gap-1.5 rounded-lg border border-brand-border bg-brand-surface p-1 text-xs">
          <button
            onClick={() => setFilterLevel('all')}
            className={`rounded px-2.5 py-1 font-semibold transition-colors ${
              filterLevel === 'all' ? 'bg-brand-card text-brand-text' : 'text-brand-muted hover:text-brand-text'
            }`}
          >
            Tất cả ({insights.length})
          </button>
          <button
            onClick={() => setFilterLevel('bad')}
            className={`flex items-center gap-1 rounded px-2.5 py-1 font-semibold transition-colors ${
              filterLevel === 'bad' ? 'bg-status-badBg text-status-bad' : 'text-brand-muted hover:text-status-bad'
            }`}
          >
            <AlertCircle className="h-3 w-3" />
            <span>Nguy cấp ({insights.filter(i => i.level === 'bad').length})</span>
          </button>
          <button
            onClick={() => setFilterLevel('warning')}
            className={`flex items-center gap-1 rounded px-2.5 py-1 font-semibold transition-colors ${
              filterLevel === 'warning' ? 'bg-status-warningBg text-status-warning' : 'text-brand-muted hover:text-status-warning'
            }`}
          >
            <AlertTriangle className="h-3 w-3" />
            <span>Cảnh báo ({insights.filter(i => i.level === 'warning').length})</span>
          </button>
          <button
            onClick={() => setFilterLevel('ok')}
            className={`flex items-center gap-1 rounded px-2.5 py-1 font-semibold transition-colors ${
              filterLevel === 'ok' ? 'bg-status-okBg text-status-ok' : 'text-brand-muted hover:text-status-ok'
            }`}
          >
            <CheckCircle className="h-3 w-3" />
            <span>Điểm sáng ({insights.filter(i => i.level === 'ok').length})</span>
          </button>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <MetricCard
          label="Kỳ Dữ Liệu Trọn Vẹn"
          subLabel={`${formatMonthLabel(fullMs[0])} → ${formatMonthLabel(lastFull)}`}
          value={`${fullMs.length} tháng`}
          customDeltaText="Loại trừ tháng T8 chưa trọn kỳ"
          variant="hero"
        />
        <MetricCard
          label={`Net Sales Kỳ Trọn Gần Nhất (${formatMonthLabel(lastFull)})`}
          subLabel={`So với kỳ ${formatMonthLabel(prevFull)}`}
          value={formatVND(lastAgg.net)}
          customDeltaText={`${deltaNet.trend === 'up' ? '+' : ''}${deltaNet.text} vs kỳ trước`}
        />
        <MetricCard
          label="Net Sales TB / Ngày"
          subLabel={`${formatMonthLabel(lastFull)} (${lastAgg.days} ngày)`}
          value={formatVND(lastAgg.net / lastAgg.days)}
          unit="/ngày"
          customDeltaText={`${deltaPerDay.trend === 'up' ? '+' : ''}${deltaPerDay.text} vs kỳ trước`}
        />
      </div>

      {/* ═══ BÓC TÁCH NGUYÊN NHÂN ═══ */}
      <Card
        hero
        title={`Bóc Tách Nguyên Nhân Biến Động — ${formatMonthLabel(prevFull)} → ${formatMonthLabel(lastFull)}`}
        description="Net = Guest × TA. Ba thành phần dưới đây cộng lại đúng bằng mức biến động — trả lời doanh thu đổi vì ít/nhiều khách hơn, hay vì mỗi khách chi khác đi."
        chip={decomp.driver === 'volume' ? 'DO LƯỢNG KHÁCH' : decomp.driver === 'price' ? 'DO CHI TIÊU' : 'CẢ HAI'}
        chipColor={
          decomp.driver === 'volume'
            ? 'border-status-warning/40 bg-status-warningBg text-status-warning'
            : decomp.driver === 'price'
            ? 'border-brand-gold/40 bg-brand-gold/10 text-brand-goldLight'
            : 'border-brand-border bg-brand-surface text-brand-sand'
        }
      >
        <p className="mb-3 text-xs leading-relaxed text-brand-text">
          {explainDecomposition(decomp)}
        </p>

        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          {[
            {
              lb: 'Tổng biến động Net', v: decomp.deltaNet,
              sub: decomp.deltaPct != null ? formatPercent(decomp.deltaPct) + ' MoM' : '—',
              icon: <Activity className="h-4 w-4" />, strong: true,
            },
            {
              lb: 'Do LƯỢNG khách', v: decomp.volumeEffect,
              sub: `Guest ${formatNumber(decomp.guestPrev)} → ${formatNumber(decomp.guestCur)}`,
              icon: <Users className="h-4 w-4" />,
            },
            {
              lb: 'Do CHI TIÊU đầu khách', v: decomp.priceEffect,
              sub: `TA ${formatVND(decomp.taPrev, 0)} → ${formatVND(decomp.taCur, 0)}`,
              icon: <Coins className="h-4 w-4" />,
            },
            {
              lb: 'Phần tương tác', v: decomp.interaction,
              sub: 'cả hai cùng đổi', icon: null,
            },
          ].map(c => (
            <div
              key={c.lb}
              className={`rounded-lg border p-3 ${
                c.strong ? 'border-brand-gold/30 bg-brand-gold/5' : 'border-brand-border bg-brand-surface/60'
              }`}
            >
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-brand-muted">
                {c.icon}
                <span>{c.lb}</span>
              </div>
              <div
                className={`mt-1 font-display text-lg font-extrabold ${
                  c.v > 0 ? 'text-status-ok' : c.v < 0 ? 'text-status-bad' : 'text-brand-muted'
                }`}
              >
                {c.v > 0 ? '+' : ''}{formatVND(c.v)}
              </div>
              <div className="mt-0.5 text-[10px] text-brand-faint">{c.sub}</div>
            </div>
          ))}
        </div>

        <div className="mt-3">
          <EChartWrapper height={210} option={waterfallOption} />
        </div>
      </Card>

      {/* ═══ SAME-STORE ═══ */}
      <Card
        title="Tăng Trưởng Same-Store"
        description="Chỉ so cửa hàng có mặt ở CẢ HAI kỳ. Không lọc bước này, tăng trưởng chuỗi bị thổi phồng bởi cửa hàng mới mở."
        chip={`${ss.stores.length} cửa hàng so được`}
      >
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          <div className="rounded-lg border border-status-ok/30 bg-status-okBg/10 p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-brand-muted">
              Same-store (số thật)
            </div>
            <div className={`mt-1 font-display text-xl font-extrabold ${
              (ss.growth ?? 0) >= 0 ? 'text-status-ok' : 'text-status-bad'}`}>
              {ss.growth != null ? (ss.growth > 0 ? '+' : '') + formatPercent(ss.growth) : '—'}
            </div>
            <div className="mt-0.5 text-[10px] text-brand-faint">
              {formatVND(ss.prev.net)} → {formatVND(ss.cur.net)}
            </div>
          </div>

          <div className="rounded-lg border border-brand-border bg-brand-surface/60 p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-brand-muted">
              Tính cả cửa hàng mới
            </div>
            <div className="mt-1 font-display text-xl font-extrabold text-brand-sand">
              {ss.growthAll != null ? (ss.growthAll > 0 ? '+' : '') + formatPercent(ss.growthAll) : '—'}
            </div>
            <div className="mt-0.5 text-[10px] text-brand-faint">
              {ss.growth != null && ss.growthAll != null
                ? `chênh ${formatPercent(ss.growthAll - ss.growth)} là do mở mới`
                : '—'}
            </div>
          </div>

          <div className="rounded-lg border border-brand-border bg-brand-surface/60 p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-brand-muted">
              Loại khỏi phép so
            </div>
            <div className="mt-1 font-display text-xl font-extrabold text-brand-text">
              {ss.excluded.length || '—'}
            </div>
            <div className="mt-0.5 text-[10px] text-brand-faint">
              {ss.excluded.length
                ? ss.excluded.map(s => HUB_DATA.stores[s]?.name ?? s).join(' · ')
                : 'không có cửa hàng mới trong kỳ'}
            </div>
          </div>
        </div>
      </Card>

      {/* ═══ BẤT THƯỜNG ±1,5σ ═══ */}
      <Card
        title="Biến Động Bất Thường (±1,5 độ lệch chuẩn)"
        description="So mỗi cửa hàng với xu hướng RIÊNG của chính nó, không so với trung bình chuỗi — cửa hàng nhỏ luôn trông bất thường nếu so ngang."
        chip={anomalies.length ? `${anomalies.length} phát hiện` : 'không có'}
        chipColor={anomalies.length
          ? 'border-status-warning/40 bg-status-warningBg text-status-warning'
          : 'border-status-ok/30 bg-status-okBg text-status-ok'}
      >
        {anomalies.length === 0 ? (
          <p className="py-6 text-center text-xs text-brand-muted">
            Không cửa hàng nào lệch quá 1,5σ so với xu hướng riêng trong kỳ {formatMonthLabel(lastFull)}.
          </p>
        ) : (
          <DataTable<Anomaly>
            data={anomalies}
            searchable={false}
            pageSize={6}
            exportFilename={`bat_thuong_${lastFull}`}
            columns={anomalyCols}
          />
        )}
      </Card>

      {/* ═══ ĐÓNG GÓP THEO CỬA HÀNG ═══ */}
      <Card
        title={`Cửa Hàng Nào Kéo Con Số Chung Đi — ${formatMonthLabel(lastFull)}`}
        description="Xếp theo trị tuyệt đối mức biến động. Cột cuối cho biết mỗi cửa hàng đổi vì lượng khách hay vì chi tiêu đầu khách."
        chip={`${contribs.length} cửa hàng`}
      >
        <DataTable<StoreContribution>
          data={contribs}
          searchable={false}
          pageSize={8}
          exportFilename={`dong_gop_bien_dong_${lastFull}`}
          columns={contribCols}
        />
      </Card>

      {/* Insights List */}
      <div className="space-y-3">
        {filteredInsights.map((ins, idx) => (
          <div
            key={ins.id}
            className={`rounded-xl border p-4 transition-all ${
              ins.level === 'bad'
                ? 'border-status-bad/40 bg-status-badBg/10'
                : ins.level === 'warning'
                ? 'border-status-warning/40 bg-status-warningBg/10'
                : 'border-status-ok/40 bg-status-okBg/10'
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5">
                  {ins.level === 'bad' && <AlertCircle className="h-5 w-5 text-status-bad flex-shrink-0" />}
                  {ins.level === 'warning' && <AlertTriangle className="h-5 w-5 text-status-warning flex-shrink-0" />}
                  {ins.level === 'ok' && <CheckCircle className="h-5 w-5 text-status-ok flex-shrink-0" />}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-brand-text flex items-center gap-2">
                    <span>{idx + 1}.</span>
                    <span>{ins.title}</span>
                  </h3>
                  <p className="mt-1 text-xs text-brand-muted leading-relaxed">
                    {ins.desc}
                  </p>
                </div>
              </div>

              <span className="rounded bg-brand-surface px-2 py-0.5 text-[10px] font-mono font-bold text-brand-sand border border-brand-border flex-shrink-0">
                {ins.module}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
