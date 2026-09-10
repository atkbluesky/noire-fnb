import React from 'react';
import { useFilters } from '../context/FilterContext';
import { HUB_DATA, MKT_DATA } from '../data';
import { MetricCard } from '../components/common/MetricCard';
import { Card } from '../components/common/Card';
import { StatusBadge, BadgeVariant } from '../components/common/StatusBadge';
import { DataTable, Column } from '../components/common/DataTable';
import { EChartWrapper } from '../components/charts/EChartWrapper';
import { formatVND, formatNumber, formatPercent, formatMonthLabel } from '../utils/formatters';
import type { EChartsOption } from 'echarts';

export const PromotionView: React.FC = () => {
  const { filters, brandMatches, selectedMonths, aggByMonth, theme } = useFilters();
  const isDark = theme === 'dark';

  const ms = selectedMonths;
  const NAT = ['COMMERCIAL', 'INTERNAL', 'PARTNER', 'LOYALTY'] as const;

  /* ── Nền tảng trung gian: GrabFood · Dining City… ─────────────────────
     `sales` là doanh thu ghi nhận TRÊN NỀN TẢNG, không phải tiền về túi.
     Phải trừ discount + commission + ads mới ra net_after, và `take_rate`
     (phần nền tảng giữ lại) mới là con số quyết định kênh này lãi hay lỗ. */
  const AGG = (MKT_DATA.aggregator || []).filter(r => ms.includes(r.month));
  const aggSales = AGG.reduce((a, b) => a + b.sales, 0);
  const aggOrders = AGG.reduce((a, b) => a + b.orders, 0);
  const aggMeasured = AGG.some(r => r.take_rate !== null);
  const aggCut = aggMeasured
    ? AGG.reduce((a, b) => a + (b.discount || 0) + (b.commission || 0) + (b.ads_spend || 0), 0)
    : null;

  const natureColors: Record<string, string> = {
    COMMERCIAL: '#22C55E',
    INTERNAL: '#EF4444',
    PARTNER: '#F59E0B',
    LOYALTY: '#82846C',
  };

  const keepRow = (r: any) => ms.includes(r.month) && brandMatches(r.brand);

  const natTotals: Record<string, { rev: number; bills: number }> = {};
  NAT.forEach(n => {
    natTotals[n] = { rev: 0, bills: 0 };
  });

  (HUB_DATA.nature || []).forEach(r => {
    if (keepRow(r) && natTotals[r.nature]) {
      natTotals[r.nature].rev += r.rev;
      natTotals[r.nature].bills += r.bills;
    }
  });

  const totalNatRev = NAT.reduce((acc, n) => acc + natTotals[n].rev, 0);
  const totalPeriodNet = ms.reduce((acc, m) => acc + (aggByMonth[m]?.net || 0), 0);

  // Group by month for stacked bar
  const byMonthNat: Record<string, Record<string, number>> = {};
  ms.forEach(m => {
    byMonthNat[m] = {};
    NAT.forEach(n => {
      byMonthNat[m][n] = 0;
    });
  });

  (HUB_DATA.nature || []).forEach(r => {
    if (keepRow(r) && byMonthNat[r.month]) {
      byMonthNat[r.month][r.nature] += r.rev;
    }
  });

  // 1. Stacked Bar Chart
  const stackedOption: EChartsOption = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: any) => {
        let res = `<div class="font-bold text-xs mb-1 border-b border-brand-border pb-1">${params[0]?.axisValue}</div>`;
        params.forEach((item: any) => {
          res += `<div class="flex items-center justify-between gap-4 text-xs py-0.5 font-mono">
            <span>${item.marker} ${item.seriesName}:</span>
            <b>${formatVND(item.value)}</b>
          </div>`;
        });
        return res;
      },
    },
    legend: {
      top: 0,
      textStyle: { color: '#9E9B93', fontSize: 11 },
    },
    grid: { top: 35, right: 20, bottom: 25, left: 65 },
    xAxis: {
      type: 'category',
      data: ms.map(m => formatMonthLabel(m)),
      axisLine: { lineStyle: { color: '#2A2A33' } },
      axisLabel: { color: isDark ? '#F3F2EE' : '#18181B', fontSize: 11 },
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        formatter: (val: number) => formatVND(val, 0),
        color: '#9E9B93',
        fontSize: 10,
      },
      splitLine: { lineStyle: { color: '#1F1F26', type: 'dashed' } },
    },
    series: NAT.map(n => ({
      name: n,
      type: 'bar' as const,
      stack: 'nature',
      data: ms.map(m => byMonthNat[m][n] || 0),
      itemStyle: { color: natureColors[n] },
      barMaxWidth: 38,
    })),
  };

  // 2. Donut Chart
  const donutOption: EChartsOption = {
    tooltip: {
      trigger: 'item',
      formatter: (params: any) => {
        return `<div class="text-xs">
          <b>${params.name}</b>: ${formatVND(params.value)} (${params.percent}%)
        </div>`;
      },
    },
    legend: {
      bottom: 0,
      textStyle: { color: '#9E9B93', fontSize: 11 },
    },
    series: [
      {
        name: 'Bản chất CTKM',
        type: 'pie',
        radius: ['50%', '75%'],
        center: ['50%', '45%'],
        itemStyle: { borderRadius: 4, borderColor: isDark ? '#141417' : '#FFFFFF', borderWidth: 2 },
        label: { show: false },
        data: NAT.map(n => ({
          name: n,
          value: natTotals[n].rev,
          itemStyle: { color: natureColors[n] },
        })),
      },
    ],
  };

  // Top 25 Campaigns Table
  const filteredCamp = (HUB_DATA.campaigns || []).filter(c => brandMatches(c.brand));
  const aggregatedCamp: Record<string, { name: string; nature: string; rev: number; bills: number; brands: Set<string> }> = {};

  filteredCamp.forEach(c => {
    const k = `${c.name}|${c.nature}`;
    aggregatedCamp[k] = aggregatedCamp[k] || {
      name: c.name,
      nature: c.nature,
      rev: 0,
      bills: 0,
      brands: new Set(),
    };
    aggregatedCamp[k].rev += c.rev;
    aggregatedCamp[k].bills += c.bills;
    aggregatedCamp[k].brands.add(c.brand);
  });

  const topCampaignList = Object.values(aggregatedCamp)
    .sort((a, b) => b.rev - a.rev)
    .slice(0, 25);

  const topCampColumns: Column<typeof topCampaignList[0]>[] = [
    {
      key: 'name',
      header: 'Tên chương trình ưu đãi',
      render: (row, idx) => (
        <div className="flex items-center gap-2">
          <span className="font-mono text-brand-gold font-bold">{idx + 1}.</span>
          <span className="font-bold text-brand-text">{row.name}</span>
        </div>
      ),
    },
    {
      key: 'nature',
      header: 'Bản chất',
      render: row => {
        const vMap: Record<string, BadgeVariant> = {
          COMMERCIAL: 'nature-comm',
          INTERNAL: 'nature-int',
          PARTNER: 'nature-part',
          LOYALTY: 'nature-loy',
        };
        return <StatusBadge label={row.nature} variant={vMap[row.nature] || 'neutral'} />;
      },
    },
    {
      key: 'brands',
      header: 'Brand áp dụng',
      render: row => (
        <span className="text-brand-muted text-[11px]">{Array.from(row.brands).join(', ')}</span>
      ),
    },
    {
      key: 'rev',
      header: 'Doanh thu gắn CTKM',
      align: 'right',
      render: row => <span className="font-mono font-bold text-brand-goldLight">{formatVND(row.rev)}</span>,
    },
    {
      key: 'bills',
      header: 'Hoá đơn',
      align: 'right',
      render: row => <span className="font-mono">{formatNumber(row.bills)}</span>,
    },
    {
      key: 'aov',
      header: 'DT / Hoá đơn',
      align: 'right',
      render: row => (
        <span className="font-mono">
          {row.bills > 0 ? formatNumber(Math.round(row.rev / row.bills)) + ' đ' : '—'}
        </span>
      ),
    },
  ];


  const aggColumns: Column<(typeof AGG)[0]>[] = [
    {
      key: 'platform',
      header: 'Nền tảng',
      render: row => (
        <div>
          <div className="font-bold text-brand-text">{row.platform}</div>
          {row.store && <div className="text-[10px] text-brand-muted">{HUB_DATA.stores[row.store]?.name ?? row.store}</div>}
        </div>
      ),
    },
    { key: 'month', header: 'Tháng', render: row => <span className="font-mono text-xs">{formatMonthLabel(row.month)}</span> },
    { key: 'sales', header: 'Doanh thu', align: 'right', render: row => <span className="font-mono font-bold text-brand-goldLight">{formatVND(row.sales)}</span> },
    { key: 'orders', header: 'Đơn', align: 'right', render: row => <span className="font-mono">{formatNumber(row.orders)}</span> },
    { key: 'aov', header: 'AOV', align: 'right', render: row => <span className="font-mono">{row.aov === null ? '—' : formatVND(row.aov)}</span> },
    { key: 'discount', header: 'Discount', align: 'right', render: row => <span className="font-mono">{row.discount === null ? '—' : formatVND(row.discount)}</span> },
    { key: 'commission', header: 'Hoa hồng', align: 'right', render: row => <span className="font-mono">{row.commission === null ? '—' : formatVND(row.commission)}</span> },
    {
      key: 'take_rate',
      header: 'Nền tảng giữ',
      align: 'right',
      render: row =>
        row.take_rate === null
          ? <span className="font-mono text-brand-muted">—</span>
          : <StatusBadge variant={row.take_rate > 0.2 ? 'warning' : 'ok'} label={formatPercent(row.take_rate)} />,
    },
  ];

  return (
    <div className="space-y-5 p-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div>
        <span className="text-[10px] font-extrabold uppercase tracking-widest text-brand-gold">
          CHI PHÍ ƯU ĐÃI THẬT SỰ ĐI ĐÂU
        </span>
        <h2 className="text-xl font-extrabold text-brand-text font-display mt-0.5">
          M8 · Khuyến Mãi &amp; 4 Bản Chất Chi Phí
        </h2>
        <p className="text-xs text-brand-muted mt-1">
          Phân định rõ ràng giữa Marketing thương mại, Ưu đãi nội bộ ban lãnh đạo, Đối tác và Khách hàng thân thiết.
        </p>
      </div>

      {/* Nature Rule Banner */}
      <div className="rounded-xl border border-brand-border bg-brand-surface p-4 text-xs text-brand-muted space-y-1">
        <p>
          <b>Bốn bản chất — Tuyệt đối không gộp chung:</b> Chỉ có nhóm <b>COMMERCIAL</b> mới là Marketing thật sự.
          Nhóm <b>INTERNAL</b> (ưu đãi cổ đông/quản lý) là khoản mục P&amp;L nội bộ. Nhóm <b>PARTNER</b> ràng buộc hợp
          đồng đối tác và <b>LOYALTY</b> thuộc về retention. Gộp chung sẽ làm sai lệch nghiêm trọng đánh giá ROI.
        </p>
      </div>

      {/* 4 Natures KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {NAT.map(n => (
          <MetricCard
            key={n}
            label={n}
            subLabel="Doanh thu HĐ có gắn CTKM"
            value={formatVND(natTotals[n].rev)}
            customDeltaText={`${formatPercent(natTotals[n].rev / totalNatRev)} · ${formatNumber(natTotals[n].bills)} HĐ`}
            variant={n === 'INTERNAL' ? 'warning' : 'default'}
          />
        ))}
      </div>

      {/* Row 1: Stacked Bar & Donut */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card
          title="Doanh Thu Gắn CTKM Theo Tháng & Bản Chất"
          description="Theo dõi tỷ trọng ưu đãi nội bộ và thương mại qua các tháng"
          chip="CỘT CHỒNG"
          hero={true}
          className="lg:col-span-2"
        >
          <EChartWrapper option={stackedOption} height={280} />
        </Card>

        <Card
          title="Tỷ Trọng 4 Bản Chất"
          description={`Luỹ kế kỳ chọn (Tổng chạm: ${formatPercent(totalNatRev / totalPeriodNet)} Net Sales)`}
          chip="TỶ TRỌNG"
        >
          <EChartWrapper option={donutOption} height={280} />
        </Card>
      </div>

      {/* Top 25 Campaigns Table */}
      <Card
        title="Top 25 Chương Trình Khuyến Mãi Theo Doanh Thu Chạm"
        description="Sắp xếp theo quy mô doanh thu hoá đơn có áp dụng chương trình"
        chip="TOP CAMPAIGNS"
      >
        <DataTable
          columns={topCampColumns}
          data={topCampaignList}
          searchPlaceholder="Tìm chương trình khuyến mãi..."
          searchKeys={['name', 'nature']}
          pageSize={10}
          exportFilename="Noire_Top_25_Promotions"
        />
      </Card>

      {/* Nền tảng trung gian */}
      {AGG.length > 0 && (
        <Card
          title="Nền Tảng Trung Gian (Aggregator)"
          description="GrabFood · Dining City… — sales là doanh thu trên nền tảng, chưa trừ chiết khấu và hoa hồng"
          chip="AGGREGATOR"
        >
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MetricCard
              label="Doanh Thu Nền Tảng"
              subLabel="Σ sales trong kỳ"
              value={formatVND(aggSales)}
              customDeltaText={`${formatPercent(totalPeriodNet ? aggSales / totalPeriodNet : 0)} Net Sales chuỗi`}
            />
            <MetricCard
              label="Số Đơn"
              subLabel="Σ orders"
              value={formatNumber(aggOrders)}
              unit="đơn"
              customDeltaText={aggOrders > 0 ? `AOV ${formatVND(aggSales / aggOrders)}` : '—'}
            />
            <MetricCard
              label="Nền Tảng Giữ Lại"
              subLabel="discount + hoa hồng + ads"
              value={aggCut === null ? '—' : formatVND(aggCut)}
              variant={aggCut !== null && aggSales > 0 && aggCut / aggSales > 0.2 ? 'warning' : 'default'}
              customDeltaText={
                aggCut === null
                  ? 'Chưa khai discount / hoa hồng'
                  : aggSales > 0 ? `${formatPercent(aggCut / aggSales)} doanh thu nền tảng` : '—'
              }
            />
            <MetricCard
              label="Còn Lại Sau Chiết Khấu"
              subLabel="sales − phần giữ lại"
              value={aggCut === null ? '—' : formatVND(aggSales - aggCut)}
              customDeltaText="Chưa trừ giá vốn món"
            />
          </div>
          <DataTable
            columns={aggColumns}
            data={AGG}
            searchable={false}
            pageSize={8}
            exportFilename="Noire_Aggregator"
          />
        </Card>
      )}
    </div>
  );
};
