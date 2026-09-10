import React from 'react';
import { useFilters } from '../context/FilterContext';
import { HUB_DATA, BRANDS, BRAND_COLORS } from '../data';
import { MetricCard } from '../components/common/MetricCard';
import { Card } from '../components/common/Card';
import { StatusBadge } from '../components/common/StatusBadge';
import { DataTable, Column } from '../components/common/DataTable';
import { EChartWrapper } from '../components/charts/EChartWrapper';
import { formatVND, formatNumber, formatPercent, formatMonthLabel } from '../utils/formatters';
import type { EChartsOption } from 'echarts';

export const ScorecardView: React.FC = () => {
  const { filters, inScope, selectedMonths, aggByMonth, isPartialMonth, theme } = useFilters();
  const isDark = theme === 'dark';

  const ms = selectedMonths;
  const lastMonth = ms[ms.length - 1] || '2026-07';
  const prevMonth = ms[ms.length - 2] || null;

  const currentAgg = aggByMonth[lastMonth] || {
    net: 0,
    gross: 0,
    disc: 0,
    voucher: 0,
    guest: 0,
    tc: 0,
    target: 0,
    ta: null,
    aov: null,
    dcov: 30,
    days: 30,
    netday: 0,
  };

  const prevAgg = prevMonth ? aggByMonth[prevMonth] : null;

  const isPartial = isPartialMonth(lastMonth);
  const curNet = filters.perday ? currentAgg.net / currentAgg.dcov : currentAgg.net;
  const prevNet = prevAgg ? (filters.perday ? prevAgg.net / prevAgg.dcov : prevAgg.net) : null;

  const curGuest = filters.perday ? Math.round(currentAgg.guest / currentAgg.dcov) : currentAgg.guest;
  const prevGuest = prevAgg ? (filters.perday ? Math.round(prevAgg.guest / prevAgg.dcov) : prevAgg.guest) : null;

  const curTC = filters.perday ? Math.round(currentAgg.tc / currentAgg.dcov) : currentAgg.tc;
  const prevTC = prevAgg ? (filters.perday ? Math.round(prevAgg.tc / prevAgg.dcov) : prevAgg.tc) : null;

  const curTA = currentAgg.ta;
  const prevTA = prevAgg ? prevAgg.ta : null;

  const curAOV = currentAgg.aov;
  const prevAOV = prevAgg ? prevAgg.aov : null;

  const planAchieve = currentAgg.target > 0 ? currentAgg.net / currentAgg.target : null;
  const discountRate = currentAgg.gross > 0 ? currentAgg.disc / currentAgg.gross : null;
  const voucherRate = currentAgg.gross > 0 ? currentAgg.voucher / currentAgg.gross : null;
  const partySize = currentAgg.tc > 0 ? currentAgg.guest / currentAgg.tc : 0;
  const idRate = (HUB_DATA.identify.find(x => x.month === lastMonth) || {}).rate || 0;

  // Chart 1: Revenue trend by Brand + Total
  const brandSeriesData: Record<string, number[]> = {};
  BRANDS.forEach(b => {
    brandSeriesData[b] = ms.map(() => 0);
  });

  HUB_DATA.store_month.forEach(r => {
    const idx = ms.indexOf(r.month);
    if (idx < 0 || !inScope(r.store)) return;
    const b = HUB_DATA.stores[r.store]?.brand;
    if (b && brandSeriesData[b]) {
      brandSeriesData[b][idx] += r.net || 0;
    }
  });

  const trendOption: EChartsOption = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
      formatter: (params: any) => {
        let res = `<div class="font-bold text-xs mb-1.5 border-b border-brand-border pb-1">${params[0]?.axisValue}</div>`;
        params.forEach((item: any) => {
          res += `<div class="flex items-center justify-between gap-4 text-xs py-0.5">
            <span class="flex items-center gap-1.5">${item.marker} ${item.seriesName}:</span>
            <span class="font-mono font-bold">${formatVND(item.value)}</span>
          </div>`;
        });
        return res;
      },
    },
    legend: {
      top: 0,
      textStyle: { color: '#9E9B93', fontSize: 11 },
      itemWidth: 12,
      itemHeight: 8,
    },
    grid: { top: 40, right: 15, bottom: 25, left: 65 },
    xAxis: {
      type: 'category',
      data: ms.map(m => formatMonthLabel(m)),
      axisLine: { lineStyle: { color: '#2A2A33' } },
      axisLabel: { color: '#9E9B93', fontSize: 11 },
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        formatter: (val: number) => formatVND(val, 0),
        color: '#9E9B93',
        fontSize: 11,
      },
      splitLine: { lineStyle: { color: '#1F1F26', type: 'dashed' } },
    },
    series: [
      ...BRANDS.map(b => ({
        name: b,
        type: 'bar' as const,
        stack: 'brands',
        data: brandSeriesData[b].map((val, idx) =>
          filters.perday ? val / aggByMonth[ms[idx]].dcov : val
        ),
        itemStyle: { color: BRAND_COLORS[b] },
        barMaxWidth: 36,
      })),
      {
        name: 'Tổng chuỗi',
        type: 'line' as const,
        data: ms.map(m =>
          filters.perday ? aggByMonth[m].net / aggByMonth[m].dcov : aggByMonth[m].net
        ),
        lineStyle: { color: isDark ? '#F3F2EE' : '#18181B', width: 2.5 },
        itemStyle: { color: isDark ? '#F3F2EE' : '#18181B' },
        symbolSize: 6,
        smooth: 0.2,
      },
    ],
  };

  // Chart 2: Brand Distribution Donut (Latest month)
  const lastMonthBrandValues = BRANDS.map((b) => brandSeriesData[b][ms.length - 1] || 0);
  const totalBrandVal = lastMonthBrandValues.reduce((a, b) => a + b, 0);

  const pieOption: EChartsOption = {
    tooltip: {
      trigger: 'item',
      formatter: (params: any) => {
        return `<div class="text-xs font-medium">
          <b>${params.name}</b>: ${formatVND(params.value)} (${params.percent}%)
        </div>`;
      },
    },
    legend: {
      bottom: 0,
      textStyle: { color: '#9E9B93', fontSize: 11 },
      itemWidth: 10,
      itemHeight: 10,
    },
    series: [
      {
        name: 'Cơ cấu Brand',
        type: 'pie',
        radius: ['52%', '78%'],
        center: ['50%', '45%'],
        avoidLabelOverlap: false,
        itemStyle: {
          borderRadius: 4,
          borderColor: isDark ? '#141417' : '#FFFFFF',
          borderWidth: 2,
        },
        label: {
          show: false,
        },
        data: BRANDS.map((b, i) => ({
          value: lastMonthBrandValues[i],
          name: b,
          itemStyle: { color: BRAND_COLORS[b] },
        })),
      },
    ],
  };

  // Table: Store Ranking for Latest Month
  const storeRows = HUB_DATA.store_month
    .filter(r => r.month === lastMonth && inScope(r.store))
    .map(r => {
      const prevR = prevMonth 
        ? HUB_DATA.store_month.find(x => x.month === prevMonth && x.store === r.store)
        : null;
      const targetObj = (HUB_DATA.target || []).find(
        t => t.month === lastMonth && t.store === r.store
      );
      const tg = targetObj ? targetObj.target : 0;
      const achieve = tg > 0 ? r.net / tg : null;
      const storeInfo = HUB_DATA.stores[r.store];

      return {
        storeCode: r.store,
        storeName: storeInfo?.name || r.store,
        brand: storeInfo?.brand || 'OTHER',
        tier: storeInfo?.tier || 'core',
        net: r.net,
        prevNet: prevR ? prevR.net : null,
        guest: r.guest,
        tc: r.tc,
        ta: r.guest > 0 ? r.net / r.guest : 0,
        aov: r.tc > 0 ? r.net / r.tc : 0,
        target: tg,
        achieve,
      };
    })
    .sort((a, b) => b.net - a.net);

  const columns: Column<typeof storeRows[0]>[] = [
    {
      key: 'storeName',
      header: 'Cửa hàng',
      render: row => (
        <div>
          <span className="font-bold text-brand-text">{row.storeName}</span>
          <span className="ml-2 font-mono text-[10px] text-brand-faint">
            {row.storeCode}
          </span>
        </div>
      ),
    },
    {
      key: 'brand',
      header: 'Brand',
      render: row => (
        <span
          className="inline-flex items-center gap-1 font-semibold text-[11px]"
          style={{ color: BRAND_COLORS[row.brand] }}
        >
          ● {row.brand}
        </span>
      ),
    },
    {
      key: 'net',
      header: 'Net Sales',
      align: 'right',
      render: row => <span className="font-bold font-mono text-brand-goldLight">{formatVND(row.net)}</span>,
    },
    {
      key: 'guest',
      header: 'Guest',
      align: 'right',
      render: row => <span className="font-mono">{formatNumber(row.guest)}</span>,
    },
    {
      key: 'tc',
      header: 'TC (Hoá đơn)',
      align: 'right',
      render: row => <span className="font-mono">{formatNumber(row.tc)}</span>,
    },
    {
      key: 'ta',
      header: 'TA (Net÷Guest)',
      align: 'right',
      render: row => <span className="font-mono">{formatNumber(Math.round(row.ta))} đ</span>,
    },
    {
      key: 'aov',
      header: 'AOV (Net÷TC)',
      align: 'right',
      render: row => <span className="font-mono">{formatNumber(Math.round(row.aov))} đ</span>,
    },
    {
      key: 'target',
      header: 'Kế hoạch',
      align: 'right',
      render: row => <span className="font-mono text-brand-muted">{row.target ? formatVND(row.target) : '—'}</span>,
    },
    {
      key: 'achieve',
      header: '% Đạt Target',
      align: 'right',
      render: row => (
        <span className="font-bold font-mono">
          {row.achieve ? formatPercent(row.achieve) : '—'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Đánh giá',
      align: 'center',
      render: row => {
        if (row.achieve == null) return <StatusBadge label="Chưa có target" variant="neutral" />;
        if (row.achieve >= 1.0) return <StatusBadge label="Đạt Target" variant="ok" />;
        if (row.achieve >= 0.9) return <StatusBadge label="Cần theo dõi" variant="warning" />;
        return <StatusBadge label="Không đạt" variant="bad" />;
      },
    },
  ];

  return (
    <div className="space-y-5 p-4 sm:p-6 max-w-[1600px] mx-auto">
      {/* View Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-brand-gold">
            TỔNG THỂ ĐANG Ở ĐÂU
          </span>
          <h2 className="text-xl font-extrabold text-brand-text font-display mt-0.5">
            Scorecard Điều Hành — Kỳ {formatMonthLabel(lastMonth)}
          </h2>
          <p className="text-xs text-brand-muted mt-1">
            Hàng trên phản ánh quy mô (Volume), hàng dưới phản ánh chất lượng vận hành (Quality).
          </p>
        </div>

        {isPartial && (
          <div className="rounded-lg border border-status-bad/40 bg-status-badBg/30 px-3.5 py-2 text-xs text-status-bad flex items-center gap-2">
            <span className="font-bold">Lưu ý:</span>
            <span>
              Tháng {formatMonthLabel(lastMonth)} chưa trọn kỳ (đến{' '}
              {HUB_DATA.coverage[lastMonth]?.last}) — khuyến nghị xem theo chuẩn hoá <b>/ngày</b>.
            </span>
          </div>
        )}
      </div>

      {/* Row 1: Volume KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <MetricCard
          label="Net Sales"
          subLabel="Cột Tổng tiền POS"
          value={formatVND(curNet)}
          unit={filters.perday ? '/ngày' : ''}
          curRawValue={curNet}
          prevValue={prevNet}
          variant="hero"
        />
        <MetricCard
          label="Guest"
          subLabel="Tổng lượt khách"
          value={formatNumber(curGuest)}
          unit={filters.perday ? 'khách/ngày' : 'khách'}
          curRawValue={curGuest}
          prevValue={prevGuest}
        />
        <MetricCard
          label="TC (Transactions)"
          subLabel="Số lượng hoá đơn"
          value={formatNumber(curTC)}
          unit={filters.perday ? 'HĐ/ngày' : 'HĐ'}
          curRawValue={curTC}
          prevValue={prevTC}
        />
        <MetricCard
          label="TA (Net ÷ Guest)"
          subLabel="Chi tiêu TB / khách"
          value={formatNumber(Math.round(curTA || 0))}
          unit="đ"
          curRawValue={curTA}
          prevValue={prevTA}
        />
        <MetricCard
          label="AOV (Net ÷ TC)"
          subLabel="Chi tiêu TB / hoá đơn"
          value={formatNumber(Math.round(curAOV || 0))}
          unit="đ"
          curRawValue={curAOV}
          prevValue={prevAOV}
        />
      </div>

      {/* Row 2: Quality & Efficiency KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <MetricCard
          label="% Đạt Kế hoạch"
          subLabel="Net ÷ Target"
          value={planAchieve ? formatPercent(planAchieve) : '—'}
          customDeltaText={
            planAchieve
              ? planAchieve >= 1.0
                ? 'Đạt chỉ tiêu'
                : planAchieve >= 0.9
                ? 'Cần theo dõi'
                : 'Chưa đạt'
              : 'Chưa giao target'
          }
          isFlagged={planAchieve != null && planAchieve < 0.9}
          flagMessage="Dưới 90%"
        />
        <MetricCard
          label="Discount %"
          subLabel="(Giảm giá + Chiết khấu) ÷ Gross"
          value={discountRate ? formatPercent(discountRate) : '—'}
          customDeltaText={`Voucher: ${voucherRate ? formatPercent(voucherRate) : '—'}`}
        />
        <MetricCard
          label="Party Size"
          subLabel="Guest ÷ TC (Khách/bàn)"
          value={partySize.toFixed(2)}
          unit="khách"
          prevValue={prevAgg && prevAgg.tc > 0 ? prevAgg.guest / prevAgg.tc : null}
          curRawValue={partySize}
        />
        <MetricCard
          label="Độ phủ COGS"
          subLabel="DT món có giá vốn BOM"
          value={formatPercent(HUB_DATA.meta.cogs_coverage)}
          isFlagged={true}
          flagMessage="Chặn biên LN"
          variant="warning"
        />
        <MetricCard
          label="Nhận diện Khách"
          subLabel="HĐ có SĐT ÷ Tổng HĐ"
          value={formatPercent(idRate)}
          isFlagged={true}
          flagMessage="Rào cản CRM"
          variant="critical"
        />
      </div>

      {/* Row 3: Charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card
          title="Net Sales Theo Tháng & Brand"
          description="Cột chồng theo brand kết hợp đường tổng chuỗi"
          chip="FACT_BILL"
          hero={true}
          className="lg:col-span-2"
        >
          <EChartWrapper option={trendOption} height={310} />
        </Card>

        <Card
          title={`Cơ Cấu Doanh Thu Brand — ${formatMonthLabel(lastMonth)}`}
          description="Tỷ trọng đóng góp doanh thu của 3 thương hiệu"
          chip="TỶ TRỌNG"
        >
          <div className="relative">
            <EChartWrapper option={pieOption} height={260} />
            <div className="mt-2 text-center text-xs text-brand-muted">
              Tổng Net: <b className="text-brand-goldLight font-mono">{formatVND(totalBrandVal)}</b>
            </div>
          </div>
        </Card>
      </div>

      {/* Row 4: Store Leaderboard Table */}
      <Card
        title={`Bảng Xếp Hạng Cửa Hàng — Kỳ ${formatMonthLabel(lastMonth)}`}
        description="Sắp xếp theo Net Sales, đối chiếu kế hoạch và đánh giá hiệu quả vận hành"
        chip={`CORE (${storeRows.length})`}
      >
        <DataTable
          columns={columns}
          data={storeRows}
          searchPlaceholder="Tìm theo tên hoặc mã cửa hàng..."
          searchKeys={['storeName', 'storeCode', 'brand']}
          exportFilename={`Noire_Store_Scorecard_${lastMonth}`}
        />
        <div className="mt-3 flex items-center justify-between text-[11px] text-brand-muted border-t border-brand-border/40 pt-2">
          <span>Ngưỡng chuẩn: ≥100% Đạt · 90–99% Cần theo dõi · &lt;90% Không đạt.</span>
          <span className="italic">Cửa hàng không có target hiển thị &ldquo;—&rdquo;.</span>
        </div>
      </Card>
    </div>
  );
};
