import React, { useMemo, useState } from 'react';
import { useFilters } from '../context/FilterContext';
import { HUB_DATA, BRAND_COLORS } from '../data';
import { DAILY } from '../data/daily';
import { MetricCard } from '../components/common/MetricCard';
import { Card } from '../components/common/Card';
import { EChartWrapper } from '../components/charts/EChartWrapper';
import { formatVND, formatNumber, formatMonthLabel, formatPercent } from '../utils/formatters';
import type { EChartsOption } from 'echarts';

type TrendMetric = 'tc' | 'ta' | 'aov';
type TrendGranularity = 'week' | 'month' | 'year';
type TrendBreakdown = 'brand' | 'store';

interface TrendAggregate {
  net: number;
  guest: number;
  tc: number;
}

interface TrendPeriod extends TrendAggregate {
  key: string;
  label: string;
  start: string;
  end: string;
  days: number;
  expectedDays: number;
  partial: boolean;
  byBrand: Record<string, TrendAggregate>;
  byStore: Record<string, TrendAggregate>;
}

const DAY_MS = 86_400_000;
const EMPTY_TREND_AGG = (): TrendAggregate => ({ net: 0, guest: 0, tc: 0 });
const STORE_COLORS = [
  '#AE8966', '#D6B37A', '#8D6E63', '#82846C', '#A9AA8D', '#66705D',
  '#C28B4B', '#E0A969', '#8D6238', '#7C8798', '#A88AA0', '#6E6C65',
];

const parseIsoDate = (date: string) => new Date(`${date}T00:00:00Z`);

const toIsoDate = (date: Date) => date.toISOString().slice(0, 10);

const addDays = (date: string, amount: number) => {
  const value = parseIsoDate(date);
  value.setUTCDate(value.getUTCDate() + amount);
  return toIsoDate(value);
};

const daysBetweenInclusive = (start: string, end: string) =>
  Math.round((parseIsoDate(end).getTime() - parseIsoDate(start).getTime()) / DAY_MS) + 1;

const startOfIsoWeek = (date: string) => {
  const value = parseIsoDate(date);
  const day = value.getUTCDay() || 7;
  value.setUTCDate(value.getUTCDate() - day + 1);
  return toIsoDate(value);
};

const isoWeek = (date: string) => {
  const value = parseIsoDate(date);
  value.setUTCDate(value.getUTCDate() + 4 - (value.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(value.getUTCFullYear(), 0, 1));
  return Math.ceil(((value.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7);
};

const shortDate = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;

const getPeriodMeta = (date: string, granularity: TrendGranularity) => {
  if (granularity === 'week') {
    const start = startOfIsoWeek(date);
    const end = addDays(start, 6);
    return {
      key: start,
      label: `W${String(isoWeek(date)).padStart(2, '0')} · ${shortDate(start)}`,
      start,
      end,
    };
  }

  if (granularity === 'month') {
    const key = date.slice(0, 7);
    const [year, month] = key.split('-').map(Number);
    const end = toIsoDate(new Date(Date.UTC(year, month, 0)));
    return { key, label: formatMonthLabel(key), start: `${key}-01`, end };
  }

  const key = date.slice(0, 4);
  return { key, label: key, start: `${key}-01-01`, end: `${key}-12-31` };
};

const metricValue = (metric: TrendMetric, row: TrendAggregate) => {
  if (metric === 'tc') return row.tc;
  if (metric === 'ta') return row.guest > 0 ? row.net / row.guest : 0;
  return row.tc > 0 ? row.net / row.tc : 0;
};

const metricLabel: Record<TrendMetric, string> = {
  tc: 'TC · Số hoá đơn',
  ta: 'TA · Net / Guest',
  aov: 'AOV · Net / TC',
};

const metricShortLabel: Record<TrendMetric, string> = { tc: 'TC', ta: 'TA', aov: 'AOV' };

const formatMetric = (metric: TrendMetric, value: number) =>
  metric === 'tc' ? `${formatNumber(Math.round(value))} HĐ` : `${formatNumber(Math.round(value))} đ`;

export const RevenueView: React.FC = () => {
  const { filters, inScope, selectedMonths, aggByMonth } = useFilters();
  const [trendMetric, setTrendMetric] = useState<TrendMetric>('tc');
  const [trendGranularity, setTrendGranularity] = useState<TrendGranularity>('week');
  const [trendBreakdown, setTrendBreakdown] = useState<TrendBreakdown>('brand');

  const ms = selectedMonths;
  const lastMonth = ms[ms.length - 1] || '2026-07';

  const trendPeriods = useMemo<TrendPeriod[]>(() => {
    const periodMap = new Map<string, TrendPeriod>();
    const dates = [...new Set(
      DAILY
        .filter(r => {
          const month = r.date.slice(0, 7);
          return month >= filters.from && month <= filters.to;
        })
        .map(r => r.date),
    )].sort();

    const ensurePeriod = (date: string) => {
      const meta = getPeriodMeta(date, trendGranularity);
      let period = periodMap.get(meta.key);
      if (!period) {
        period = {
          ...meta,
          ...EMPTY_TREND_AGG(),
          days: 0,
          expectedDays: daysBetweenInclusive(meta.start, meta.end),
          partial: false,
          byBrand: {},
          byStore: {},
        };
        periodMap.set(meta.key, period);
      }
      return period;
    };

    // Dựng trục thời gian theo ngày có dữ liệu của toàn chuỗi. daily.json bỏ các
    // dòng cửa hàng bằng 0, nên không được đếm ngày chỉ từ riêng một cửa hàng.
    dates.forEach(date => {
      ensurePeriod(date).days += 1;
    });

    DAILY.forEach(row => {
      const month = row.date.slice(0, 7);
      if (month < filters.from || month > filters.to || !inScope(row.store)) return;

      const period = ensurePeriod(row.date);
      const storeInfo = HUB_DATA.stores[row.store];
      const brand = storeInfo?.brand || 'OTHER';
      const values: TrendAggregate = {
        net: row.net || 0,
        guest: row.guest || 0,
        tc: row.tc || 0,
      };

      period.net += values.net;
      period.guest += values.guest;
      period.tc += values.tc;

      const brandAgg = period.byBrand[brand] ||= EMPTY_TREND_AGG();
      brandAgg.net += values.net;
      brandAgg.guest += values.guest;
      brandAgg.tc += values.tc;

      const storeAgg = period.byStore[row.store] ||= EMPTY_TREND_AGG();
      storeAgg.net += values.net;
      storeAgg.guest += values.guest;
      storeAgg.tc += values.tc;
    });

    return [...periodMap.values()]
      .sort((a, b) => a.start.localeCompare(b.start))
      .map(period => {
        const partial = period.days < period.expectedDays;
        const label = trendGranularity === 'year' && partial
          ? `${period.label} YTD`
          : `${period.label}${partial ? ' ⚠' : ''}`;
        return { ...period, partial, label };
      });
  }, [filters.from, filters.to, filters.scope, filters.brand, trendGranularity]);

  const trendSegments = useMemo(() => {
    const stores = Object.keys(HUB_DATA.stores)
      .filter(inScope)
      .sort((a, b) => {
        const A = HUB_DATA.stores[a];
        const B = HUB_DATA.stores[b];
        return A.brand.localeCompare(B.brand) || A.name.localeCompare(B.name);
      });

    if (trendBreakdown === 'store') {
      return stores.map((store, index) => ({
        id: store,
        label: HUB_DATA.stores[store]?.name || store,
        color: STORE_COLORS[index % STORE_COLORS.length],
      }));
    }

    return [...new Set(stores.map(store => HUB_DATA.stores[store]?.brand || 'OTHER'))]
      .map(brand => ({ id: brand, label: brand, color: BRAND_COLORS[brand] || BRAND_COLORS.OTHER }));
  }, [filters.scope, filters.brand, trendBreakdown]);

  const trendSeries = trendSegments.map(segment => ({
    name: segment.label,
    type: 'bar' as const,
    stack: 'driver-total',
    barMaxWidth: 46,
    emphasis: { focus: 'series' as const },
    itemStyle: { color: segment.color },
    data: trendPeriods.map(period => {
      const segmentData = trendBreakdown === 'brand'
        ? period.byBrand[segment.id] || EMPTY_TREND_AGG()
        : period.byStore[segment.id] || EMPTY_TREND_AGG();
      const actual = metricValue(trendMetric, segmentData);
      const value = trendMetric === 'tc'
        ? segmentData.tc
        : trendMetric === 'ta'
          ? (period.guest > 0 ? segmentData.net / period.guest : 0)
          : (period.tc > 0 ? segmentData.net / period.tc : 0);

      return {
        value,
        actual,
        total: metricValue(trendMetric, period),
        periodLabel: period.label,
      };
    }),
  }));

  const trendOption: EChartsOption = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: any) => {
        const items = (params || []).filter((item: any) => Number(item.value) !== 0);
        const first = (params || [])[0];
        const total = first?.data?.total || 0;
        let html = `<div class="text-xs min-w-[220px]">
          <div class="font-bold border-b border-brand-border pb-1 mb-1">${first?.data?.periodLabel || first?.axisValue || ''}</div>
          <div class="flex items-center justify-between gap-4 py-0.5">
            <span>${metricShortLabel[trendMetric]} toàn phạm vi</span>
            <b class="font-mono text-brand-goldLight">${formatMetric(trendMetric, total)}</b>
          </div>`;

        items.forEach((item: any) => {
          const actual = item.data?.actual || 0;
          const contribution = Number(item.value) || 0;
          const detail = trendMetric === 'tc'
            ? formatMetric('tc', actual)
            : `${formatMetric(trendMetric, actual)} · đóng góp ${formatMetric(trendMetric, contribution)}`;
          html += `<div class="flex items-center justify-between gap-4 py-0.5">
            <span>${item.marker} ${item.seriesName}</span>
            <span class="font-mono">${detail}</span>
          </div>`;
        });
        return `${html}</div>`;
      },
    },
    legend: {
      type: 'scroll',
      top: 0,
      left: 0,
      right: 0,
      textStyle: { color: '#9E9B93', fontSize: 10 },
      itemWidth: 10,
      itemHeight: 7,
    },
    grid: {
      top: 48,
      right: 18,
      bottom: trendGranularity === 'week' ? 48 : 32,
      left: 68,
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      data: trendPeriods.map(period => period.label),
      axisLine: { lineStyle: { color: '#2A2A33' } },
      axisTick: { alignWithLabel: true, lineStyle: { color: '#2A2A33' } },
      axisLabel: {
        color: '#9E9B93',
        fontSize: 10,
        lineHeight: 14,
        margin: 10,
        interval: trendPeriods.length > 26 ? 'auto' : 0,
        hideOverlap: true,
        rotate: 0,
        formatter: (value: string) => {
          if (trendGranularity === 'week') {
            const hasWarning = value.includes('⚠');
            const clean = value.replace(' ⚠', '');
            const parts = clean.split(' · ');
            if (parts.length === 2) {
              return `${parts[0]}${hasWarning ? ' ⚠' : ''}\n${parts[1]}`;
            }
            return value.replace(' · ', '\n');
          }
          return value;
        },
      },
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        formatter: (value: number) => trendMetric === 'tc' ? formatNumber(value) : formatVND(value, 0),
        color: '#9E9B93',
        fontSize: 10,
      },
      splitLine: { lineStyle: { color: '#1F1F26', type: 'dashed' } },
    },
    series: trendSeries,
  };

  const currentTrendPeriod = trendPeriods[trendPeriods.length - 1];
  const previousTrendPeriod = trendPeriods[trendPeriods.length - 2];
  const currentTrendValue = currentTrendPeriod ? metricValue(trendMetric, currentTrendPeriod) : 0;
  const comparePerDay = trendMetric === 'tc' && !!currentTrendPeriod?.partial;
  const comparisonValue = (period?: TrendPeriod) => {
    if (!period) return null;
    const value = metricValue(trendMetric, period);
    return comparePerDay && period.days > 0 ? value / period.days : value;
  };
  const currentComparable = comparisonValue(currentTrendPeriod);
  const previousComparable = comparisonValue(previousTrendPeriod);
  const trendDelta = currentComparable != null && previousComparable != null && previousComparable !== 0
    ? (currentComparable - previousComparable) / Math.abs(previousComparable)
    : null;

  const segmentAggregate = (period: TrendPeriod | undefined, id: string) => {
    if (!period) return EMPTY_TREND_AGG();
    return trendBreakdown === 'brand'
      ? period.byBrand[id] || EMPTY_TREND_AGG()
      : period.byStore[id] || EMPTY_TREND_AGG();
  };
  const segmentChanges = previousTrendPeriod
    ? trendSegments
        .map(segment => {
          const current = segmentAggregate(currentTrendPeriod, segment.id);
          const previous = segmentAggregate(previousTrendPeriod, segment.id);
          const comparable = trendMetric === 'tc'
            || (trendMetric === 'ta' ? current.guest > 0 && previous.guest > 0 : current.tc > 0 && previous.tc > 0);
          const currentValue = comparePerDay && currentTrendPeriod?.days
            ? current.tc / currentTrendPeriod.days
            : metricValue(trendMetric, current);
          const previousValue = comparePerDay && previousTrendPeriod.days
            ? previous.tc / previousTrendPeriod.days
            : metricValue(trendMetric, previous);
          return { ...segment, delta: currentValue - previousValue, comparable };
        })
        .filter(segment => segment.comparable)
    : [];
  const alignedSegmentChanges = trendDelta == null || trendDelta === 0
    ? segmentChanges
    : segmentChanges.filter(segment => segment.delta === 0 || Math.sign(segment.delta) === Math.sign(trendDelta));
  const driverSegment = [...(alignedSegmentChanges.length ? alignedSegmentChanges : segmentChanges)]
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0] || null;

  const driverName = driverSegment?.label || (trendBreakdown === 'brand' ? 'brand đang chọn' : 'cửa hàng đang chọn');
  const actionText = trendDelta == null
    ? 'Cần ít nhất 2 kỳ trong phạm vi lọc để xác định xu hướng và điểm cần hành động.'
    : trendMetric === 'tc'
      ? trendDelta < 0
        ? `Kiểm tra traffic, kênh bán và lịch booking tại ${driverName}; ưu tiên phục hồi số hoá đơn.`
        : `Giữ nhịp chuyển đổi và kiểm tra công suất ca cao điểm tại ${driverName}.`
      : trendMetric === 'ta'
        ? trendDelta < 0
          ? `Rà soát menu mix, upsell theo khách và mức chiết khấu tại ${driverName}.`
          : `Nhân rộng menu mix và cách upsell đang nâng chi tiêu mỗi khách tại ${driverName}.`
        : trendDelta < 0
          ? `Kiểm tra số món mỗi hoá đơn, add-on và ưu đãi làm loãng giá trị giỏ tại ${driverName}.`
          : `Nhân rộng upsell và add-on đang nâng giá trị hoá đơn tại ${driverName}, đồng thời kiểm tra biên lợi nhuận.`;

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

      {/* TC / TA / AOV by week, month and year */}
      <Card
        title="Biến Động TC, TA & AOV Theo Kỳ"
        description="Theo dõi động lực doanh thu theo brand hoặc từng cửa hàng; kỳ có ký hiệu ⚠ chưa đủ ngày"
        chip="GROWTH DRIVERS"
        hero={true}
      >
        <div className="mb-4 flex flex-col gap-3 border-b border-brand-border/70 pb-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-brand-faint">Chỉ số</span>
            <div className="flex rounded-lg border border-brand-border bg-brand-surface p-0.5">
              {(['tc', 'ta', 'aov'] as TrendMetric[]).map(metric => (
                <button
                  key={metric}
                  type="button"
                  aria-pressed={trendMetric === metric}
                  onClick={() => setTrendMetric(metric)}
                  className={`rounded-md px-3 py-1.5 text-[11px] font-bold transition-colors ${
                    trendMetric === metric
                      ? 'bg-brand-gold text-[#141417] shadow-sm'
                      : 'text-brand-muted hover:bg-brand-cardHover hover:text-brand-text'
                  }`}
                >
                  {metricShortLabel[metric]}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-brand-faint">Nhịp</span>
            <div className="flex rounded-lg border border-brand-border bg-brand-surface p-0.5">
              {([
                ['week', 'Tuần'],
                ['month', 'Tháng'],
                ['year', 'Năm'],
              ] as [TrendGranularity, string][]).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={trendGranularity === value}
                  onClick={() => setTrendGranularity(value)}
                  className={`rounded-md px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                    trendGranularity === value
                      ? 'bg-brand-cardHover text-brand-goldLight'
                      : 'text-brand-muted hover:text-brand-text'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <span className="ml-1 text-[10px] font-bold uppercase tracking-wider text-brand-faint">Phân rã</span>
            <div className="flex rounded-lg border border-brand-border bg-brand-surface p-0.5">
              {([
                ['brand', 'Brand'],
                ['store', 'Cửa hàng'],
              ] as [TrendBreakdown, string][]).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={trendBreakdown === value}
                  onClick={() => setTrendBreakdown(value)}
                  className={`rounded-md px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                    trendBreakdown === value
                      ? 'bg-brand-cardHover text-brand-goldLight'
                      : 'text-brand-muted hover:text-brand-text'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <span className="font-semibold text-brand-text">
            {metricLabel[trendMetric]} theo {trendGranularity === 'week' ? 'tuần ISO' : trendGranularity === 'month' ? 'tháng' : 'năm'}
          </span>
          <span className="text-brand-muted">
            {trendMetric === 'tc'
              ? 'Chiều cao cột = tổng số hoá đơn'
              : `Chiều cao cột = ${metricShortLabel[trendMetric]} toàn phạm vi; mỗi lớp là đóng góp có trọng số`}
          </span>
        </div>

        <EChartWrapper option={trendOption} height={375} />

        <div className="mt-3 grid grid-cols-1 gap-3 border-t border-brand-border/70 pt-4 md:grid-cols-3">
          <div className="rounded-lg border border-brand-border bg-brand-surface/70 p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-brand-faint">
              Kỳ mới nhất · {currentTrendPeriod?.label || '—'}
            </div>
            <div className="mt-1 font-mono text-lg font-extrabold text-brand-text">
              {formatMetric(trendMetric, currentTrendValue)}
            </div>
            <div className="mt-0.5 text-[10px] text-brand-muted">
              {currentTrendPeriod?.partial
                ? `${currentTrendPeriod.days}/${currentTrendPeriod.expectedDays} ngày có dữ liệu`
                : `${currentTrendPeriod?.days || 0} ngày · kỳ đầy đủ`}
              {comparePerDay && currentComparable != null
                ? ` · ${formatNumber(currentComparable, 1)} HĐ/ngày`
                : ''}
            </div>
          </div>

          <div className="rounded-lg border border-brand-border bg-brand-surface/70 p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-brand-faint">
              So với kỳ trước{comparePerDay ? ' · bình quân/ngày' : ''}
            </div>
            <div className={`mt-1 font-mono text-lg font-extrabold ${
              trendDelta == null
                ? 'text-brand-muted'
                : trendDelta > 0
                  ? 'text-status-ok'
                  : trendDelta < 0
                    ? 'text-status-bad'
                    : 'text-brand-text'
            }`}>
              {trendDelta == null
                ? '—'
                : `${trendDelta > 0 ? '+' : trendDelta < 0 ? '-' : ''}${formatPercent(Math.abs(trendDelta))}`}
            </div>
            <div className="mt-0.5 text-[10px] text-brand-muted">
              {driverSegment
                ? `${driverSegment.label}: ${driverSegment.delta >= 0 ? '+' : ''}${formatMetric(trendMetric, driverSegment.delta)}`
                : 'Chưa có kỳ trước để xác định điểm biến động lớn nhất'}
            </div>
          </div>

          <div className="rounded-lg border border-brand-gold/25 bg-brand-gold/5 p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-brand-gold">
              Gợi ý hành động
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-brand-text">{actionText}</p>
          </div>
        </div>

        {trendMetric !== 'tc' && (
          <p className="mt-3 text-[10px] leading-relaxed text-brand-faint">
            TA và AOV là tỷ lệ nên không cộng trực tiếp giữa các đơn vị. Biểu đồ chồng phần đóng góp doanh thu trên mẫu số chung của từng kỳ; rê chuột để xem chỉ số thật của từng brand hoặc cửa hàng.
          </p>
        )}
      </Card>

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
