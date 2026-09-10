import React from 'react';
import { useFilters } from '../context/FilterContext';
import { HUB_DATA, BRAND_COLORS } from '../data';
import { DAILY } from '../data/daily';
import { MetricCard } from '../components/common/MetricCard';
import { Card } from '../components/common/Card';
import { EChartWrapper } from '../components/charts/EChartWrapper';
import { formatVND, formatNumber, formatMonthLabel } from '../utils/formatters';
import type { EChartsOption } from 'echarts';

export const RevenueView: React.FC = () => {
  const { filters, inScope, selectedMonths, aggByMonth } = useFilters();

  const ms = selectedMonths;
  const lastMonth = ms[ms.length - 1] || '2026-07';

  // Calculate Cumulative Metrics
  const totalNet = ms.reduce((acc, m) => acc + (aggByMonth[m]?.net || 0), 0);
  const totalGuest = ms.reduce((acc, m) => acc + (aggByMonth[m]?.guest || 0), 0);
  const totalTC = ms.reduce((acc, m) => acc + (aggByMonth[m]?.tc || 0), 0);
  const totalDaysCovered = ms.reduce((acc, m) => acc + (aggByMonth[m]?.dcov || 0), 0);
  const avgNetPerDay = totalDaysCovered > 0 ? totalNet / totalDaysCovered : 0;

  // 1. Daily Sales series
  const dailyMap: Record<string, number> = {};
  DAILY.forEach(r => {
    if (!inScope(r.store)) return;
    const m = r.date.slice(0, 7);
    if (m < filters.from || m > filters.to) return;
    dailyMap[r.date] = (dailyMap[r.date] || 0) + (r.net || 0);
  });

  const sortedDates = Object.keys(dailyMap).sort();
  const dailyOption: EChartsOption = {
    tooltip: {
      trigger: 'axis',
      formatter: (params: any) => {
        const item = params[0];
        return `<div class="text-xs">
          <div class="font-bold border-b border-brand-border pb-1 mb-1">${item?.axisValue}</div>
          <div class="flex items-center justify-between gap-3 font-mono">
            <span>Doanh thu Net:</span>
            <b class="text-brand-goldLight">${formatVND(item?.value)}</b>
          </div>
        </div>`;
      },
    },
    grid: { top: 25, right: 20, bottom: 25, left: 65 },
    xAxis: {
      type: 'category',
      data: sortedDates,
      axisLine: { lineStyle: { color: '#2A2A33' } },
      axisLabel: {
        color: '#9E9B93',
        fontSize: 10,
        formatter: (val: string) => val.slice(5), // MM-DD
      },
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
      {
        name: 'Doanh thu ngày',
        type: 'line',
        data: sortedDates.map(d => dailyMap[d]),
        smooth: true,
        showSymbol: false,
        lineStyle: { color: '#C5A059', width: 2 },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(197, 160, 89, 0.35)' },
              { offset: 1, color: 'rgba(197, 160, 89, 0.02)' },
            ],
          },
        },
      },
    ],
  };

  // 2. Day of Week distribution
  const dowTotals = [0, 0, 0, 0, 0, 0, 0];
  const dowCounts = [0, 0, 0, 0, 0, 0, 0];
  sortedDates.forEach(d => {
    const w = (new Date(d).getDay() + 6) % 7; // 0=Mon..6=Sun
    dowTotals[w] += dailyMap[d];
    dowCounts[w]++;
  });

  const dowLabels = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ Nhật'];
  const dowAverages = dowTotals.map((tot, idx) => (dowCounts[idx] > 0 ? tot / dowCounts[idx] : 0));

  const dowOption: EChartsOption = {
    tooltip: {
      trigger: 'axis',
      formatter: (params: any) => {
        const item = params[0];
        return `<div class="text-xs">
          <b>${item?.axisValue}</b>: ${formatVND(item?.value)} / ngày
        </div>`;
      },
    },
    grid: { top: 25, right: 15, bottom: 25, left: 60 },
    xAxis: {
      type: 'category',
      data: dowLabels,
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
      {
        name: 'Doanh thu TB',
        type: 'bar',
        data: dowAverages,
        itemStyle: {
          color: (params: any) => (params.dataIndex >= 4 ? '#C5A059' : '#82846C'),
          borderRadius: [4, 4, 0, 0],
        },
        barMaxWidth: 38,
      },
    ],
  };

  // 3. TA vs AOV monthly trend
  const taAovOption: EChartsOption = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
      formatter: (params: any) => {
        let res = `<div class="font-bold text-xs mb-1">${params[0]?.axisValue}</div>`;
        params.forEach((item: any) => {
          res += `<div class="flex items-center justify-between gap-4 text-xs py-0.5">
            <span>${item.marker} ${item.seriesName}:</span>
            <span class="font-mono font-bold">${formatNumber(Math.round(item.value))} đ</span>
          </div>`;
        });
        return res;
      },
    },
    legend: {
      top: 0,
      textStyle: { color: '#9E9B93', fontSize: 11 },
    },
    grid: { top: 35, right: 20, bottom: 25, left: 60 },
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
      {
        name: 'TA (Net ÷ Guest)',
        type: 'bar',
        data: ms.map(m => aggByMonth[m]?.ta || 0),
        itemStyle: { color: '#82846C' },
        barMaxWidth: 28,
      },
      {
        name: 'AOV (Net ÷ TC)',
        type: 'line',
        data: ms.map(m => aggByMonth[m]?.aov || 0),
        lineStyle: { color: '#C5A059', width: 2.5 },
        itemStyle: { color: '#C5A059' },
        symbolSize: 6,
      },
    ],
  };

  // 4. Waterfall chart Gross -> Discount -> Net
  const lastAgg = aggByMonth[lastMonth] || { gross: 0, disc: 0, net: 0 };
  const waterfallOption: EChartsOption = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: any) => {
        const item = params[0];
        return `<div class="text-xs">
          <b>${item?.axisValue}</b>: ${formatVND(Math.abs(item?.value))}
        </div>`;
      },
    },
    grid: { top: 25, right: 20, bottom: 25, left: 65 },
    xAxis: {
      type: 'category',
      data: ['Gross Sales', 'Giảm giá & Chiết khấu', 'Net Sales'],
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
      {
        name: 'Giá trị',
        type: 'bar',
        data: [
          { value: lastAgg.gross, itemStyle: { color: '#82846C' } },
          { value: -lastAgg.disc, itemStyle: { color: '#EF4444' } },
          { value: lastAgg.net, itemStyle: { color: '#C5A059' } },
        ],
        barMaxWidth: 44,
      },
    ],
  };

  // 5. Store-by-store line trajectories
  const inScopeStores = Object.keys(HUB_DATA.stores).filter(inScope);
  const storeSeriesOption: EChartsOption = {
    tooltip: {
      trigger: 'axis',
      formatter: (params: any) => {
        let res = `<div class="font-bold text-xs mb-1 border-b border-brand-border pb-1">${params[0]?.axisValue}</div>`;
        params.forEach((item: any) => {
          if (item.value != null) {
            res += `<div class="flex items-center justify-between gap-4 text-xs py-0.5">
              <span>${item.marker} ${item.seriesName}:</span>
              <span class="font-mono font-bold">${formatVND(item.value)}</span>
            </div>`;
          }
        });
        return res;
      },
    },
    legend: {
      bottom: 0,
      textStyle: { color: '#9E9B93', fontSize: 10 },
      itemWidth: 10,
      itemHeight: 6,
    },
    grid: { top: 25, right: 20, bottom: 45, left: 65 },
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
    series: inScopeStores.map(st => {
      const storeInfo = HUB_DATA.stores[st];
      const isSatellite = storeInfo?.tier === 'satellite';
      return {
        name: storeInfo?.name || st,
        type: 'line' as const,
        data: ms.map(m => {
          const r = HUB_DATA.store_month.find(x => x.month === m && x.store === st);
          return r ? r.net : null;
        }),
        lineStyle: {
          color: BRAND_COLORS[storeInfo?.brand || 'OTHER'],
          width: isSatellite ? 1.5 : 2,
          type: isSatellite ? ('dashed' as const) : ('solid' as const),
        },
        itemStyle: { color: BRAND_COLORS[storeInfo?.brand || 'OTHER'] },
        symbolSize: 5,
        smooth: 0.25,
      };
    }),
  };

  return (
    <div className="space-y-5 p-4 sm:p-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div>
        <span className="text-[10px] font-extrabold uppercase tracking-widest text-brand-gold">
          BÁN ĐƯỢC BAO NHIÊU
        </span>
        <h2 className="text-xl font-extrabold text-brand-text font-display mt-0.5">
          M1 · Doanh Thu &amp; Tăng Trưởng
        </h2>
        <p className="text-xs text-brand-muted mt-1">
          Bóc tách động lực tăng trưởng theo chu kỳ ngày, thứ trong tuần, quy mô giỏ hàng và cửa hàng.
        </p>
      </div>

      {/* Cumulative KPI cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard
          label="Net Luỹ Kế Kỳ Chọn"
          subLabel={`Từ ${formatMonthLabel(ms[0])} → ${formatMonthLabel(lastMonth)}`}
          value={formatVND(totalNet)}
          variant="hero"
        />
        <MetricCard
          label="Guest Luỹ Kế"
          subLabel={`Tổng lượt khách ${ms.length} tháng`}
          value={formatNumber(totalGuest)}
          unit="lượt"
        />
        <MetricCard
          label="TC (Hoá đơn) Luỹ Kế"
          subLabel={`Tổng hoá đơn ${ms.length} tháng`}
          value={formatNumber(totalTC)}
          unit="HĐ"
        />
        <MetricCard
          label="Net Trung Bình / Ngày"
          subLabel="Loại trừ các ngày chưa có dữ liệu"
          value={formatVND(avgNetPerDay)}
          unit="/ngày"
        />
      </div>

      {/* Row 1: Daily Time-Series & Day of Week */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card
          title="Doanh Thu Theo Từng Ngày (Daily Trend)"
          description="Toàn bộ chuỗi thời gian — nhận diện chu kỳ tuần và các ngày cao điểm đột biến"
          chip="FACT_SALES_DAILY"
          hero={true}
          className="lg:col-span-2"
        >
          <EChartWrapper option={dailyOption} height={280} />
        </Card>

        <Card
          title="Doanh Thu TB Theo Thứ Trong Tuần"
          description="So sánh hiệu suất ngày trong tuần và ngày cuối tuần"
          chip="CHU KỲ TUẦN"
        >
          <EChartWrapper option={dowOption} height={280} />
        </Card>
      </div>

      {/* Row 2: TA/AOV Trend & Waterfall Chart */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card
          title="Diễn Biến TA & AOV Qua Các Tháng"
          description="TA (Chi tiêu / khách) và AOV (Chi tiêu / hoá đơn) định hình phân khúc brand"
          chip="TICKET SIZE"
        >
          <EChartWrapper option={taAovOption} height={270} />
        </Card>

        <Card
          title={`Phân Rã Doanh Thu: Gross → Net (${formatMonthLabel(lastMonth)})`}
          description="Đo lường mức độ chiết khấu và giảm giá ảnh hưởng tới doanh thu thuần"
          chip="WATERFALL"
        >
          <EChartWrapper option={waterfallOption} height={270} />
        </Card>
      </div>

      {/* Row 3: Store Trajectories */}
      <Card
        title="Quỹ Đạo Tăng Trưởng Từng Cửa Hàng"
        description="Diễn biến Net Sales theo tháng cho từng địa điểm kinh doanh"
        chip="STORE TRAJECTORY"
      >
        <EChartWrapper option={storeSeriesOption} height={320} />
      </Card>
    </div>
  );
};
