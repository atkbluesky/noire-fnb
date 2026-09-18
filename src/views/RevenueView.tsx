import React, { useMemo, useState } from 'react';
import { useFilters } from '../context/FilterContext';
import { HUB_DATA, BRAND_COLORS } from '../data';
import { DAILY, DAILY_PARTY, GUEST_SEGMENT } from '../data/daily';
import { MetricCard } from '../components/common/MetricCard';
import { Card } from '../components/common/Card';
import { EChartWrapper } from '../components/charts/EChartWrapper';
import { formatVND, formatNumber, formatMonthLabel, formatPercent } from '../utils/formatters';
import type { EChartsOption } from 'echarts';

type TrendMetric = 'tc' | 'ta' | 'aov';
type TrendGranularity = 'week' | 'month' | 'year';
type TrendBreakdown = 'brand' | 'store' | 'segment';
/** Phân khúc khách cấp hoá đơn — ranh giới ở data_contract.json → $guest_segment. */
type GuestSegment = 'all' | 'solo' | 'party';

interface TrendAggregate {
  net: number;
  guest: number;
  tc: number;
}

/** Tổng + phần tiệc của cùng một đơn vị. Khách lẻ = all − party, không lưu riêng. */
interface SegmentedAggregate {
  all: TrendAggregate;
  party: TrendAggregate;
}

interface TrendPeriod {
  key: string;
  label: string;
  start: string;
  end: string;
  days: number;
  expectedDays: number;
  partial: boolean;
  total: SegmentedAggregate;
  byBrand: Record<string, SegmentedAggregate>;
  byStore: Record<string, SegmentedAggregate>;
}

const DAY_MS = 86_400_000;
const EMPTY_TREND_AGG = (): TrendAggregate => ({ net: 0, guest: 0, tc: 0 });
const EMPTY_SEGMENTED = (): SegmentedAggregate => ({ all: EMPTY_TREND_AGG(), party: EMPTY_TREND_AGG() });

const addInto = (target: TrendAggregate, row: TrendAggregate) => {
  target.net += row.net;
  target.guest += row.guest;
  target.tc += row.tc;
};

const pickSegment = (agg: SegmentedAggregate | undefined, segment: GuestSegment): TrendAggregate => {
  if (!agg) return EMPTY_TREND_AGG();
  if (segment === 'all') return agg.all;
  if (segment === 'party') return agg.party;
  return {
    net: agg.all.net - agg.party.net,
    guest: agg.all.guest - agg.party.guest,
    tc: agg.all.tc - agg.party.tc,
  };
};

const PARTY_BY_DAY_STORE = new Map(DAILY_PARTY.map(r => [`${r.date}|${r.store}`, r]));
const PARTY_MIN = GUEST_SEGMENT?.party_min_guests ?? 10;
const MIN_PARTY_SAMPLE = GUEST_SEGMENT?.min_sample_bills ?? 5;
const SEGMENT_LABEL: Record<GuestSegment, string> = {
  all: 'Tất cả khách',
  solo: GUEST_SEGMENT?.labels.solo ?? 'Khách lẻ',
  party: GUEST_SEGMENT?.labels.party ?? 'Khách tiệc',
};
const SEGMENT_HINT: Record<GuestSegment, string> = {
  all: 'lẻ + tiệc',
  solo: `HĐ < ${PARTY_MIN} khách`,
  party: `HĐ ≥ ${PARTY_MIN} khách`,
};
const SEGMENT_COLORS: Record<Exclude<GuestSegment, 'all'>, string> = { solo: '#82846C', party: '#C5A059' };
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
  const [trendSegment, setTrendSegment] = useState<GuestSegment>('all');
  // Phân rã Lẻ · Tiệc đã tự tách hai phân khúc → bộ lọc phân khúc quay về "tất cả".
  const activeSegment: GuestSegment = trendBreakdown === 'segment' ? 'all' : trendSegment;
  const segmentMode = trendBreakdown === 'segment';

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
          total: EMPTY_SEGMENTED(),
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
      const partyRow = PARTY_BY_DAY_STORE.get(`${row.date}|${row.store}`);
      const party: TrendAggregate = {
        net: partyRow?.net || 0,
        guest: partyRow?.guest || 0,
        tc: partyRow?.tc || 0,
      };

      for (const target of [
        period.total,
        period.byBrand[brand] ||= EMPTY_SEGMENTED(),
        period.byStore[row.store] ||= EMPTY_SEGMENTED(),
      ]) {
        addInto(target.all, values);
        addInto(target.party, party);
      }
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
    if (trendBreakdown === 'segment') {
      return (['solo', 'party'] as const).map(segment => ({
        id: segment as string,
        label: `${SEGMENT_LABEL[segment]} (${SEGMENT_HINT[segment]})`,
        color: SEGMENT_COLORS[segment],
      }));
    }

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

  /** Toàn phạm vi của một kỳ, theo phân khúc khách (mặc định: phân khúc đang lọc). */
  const periodAggregate = (period: TrendPeriod | undefined, segment: GuestSegment = activeSegment) =>
    period ? pickSegment(period.total, segment) : EMPTY_TREND_AGG();

  /** Một đơn vị phân rã (brand · cửa hàng · phân khúc) trong một kỳ. */
  const unitAggregate = (period: TrendPeriod | undefined, id: string): TrendAggregate => {
    if (!period) return EMPTY_TREND_AGG();
    if (segmentMode) return pickSegment(period.total, id as GuestSegment);
    return pickSegment(trendBreakdown === 'brand' ? period.byBrand[id] : period.byStore[id], activeSegment);
  };

  // TA/AOV của tiệc chỉ có nghĩa khi đủ mẫu — vài hoá đơn một tuần là nhiễu, không phải xu hướng.
  const thinSample = (segment: GuestSegment, agg: TrendAggregate) =>
    segment === 'party' && trendMetric !== 'tc' && agg.tc < MIN_PARTY_SAMPLE;

  // TA/AOV của lẻ và tiệc chênh nhau cả chục lần và KHÔNG cộng được → ở phân rã Lẻ · Tiệc
  // vẽ tỷ lệ THẬT của từng phân khúc (tiệc ở trục phải) thay vì cột chồng đóng góp.
  const segmentRatioMode = segmentMode && trendMetric !== 'tc';

  const trendSeries = segmentRatioMode
    ? [
        {
          name: `${SEGMENT_LABEL.solo} (${SEGMENT_HINT.solo})`,
          type: 'bar' as const,
          barMaxWidth: 46,
          itemStyle: { color: SEGMENT_COLORS.solo },
          data: trendPeriods.map(period => {
            const agg = periodAggregate(period, 'solo');
            return { value: metricValue(trendMetric, agg), bills: agg.tc, periodLabel: period.label };
          }),
        },
        {
          name: `Tổng (${SEGMENT_HINT.all})`,
          type: 'line' as const,
          symbol: 'circle',
          symbolSize: 5,
          lineStyle: { color: '#E8E4DA', width: 1.5, type: 'dashed' as const },
          itemStyle: { color: '#E8E4DA' },
          data: trendPeriods.map(period => {
            const agg = periodAggregate(period, 'all');
            return { value: metricValue(trendMetric, agg), bills: agg.tc, periodLabel: period.label };
          }),
        },
        {
          name: `${SEGMENT_LABEL.party} (${SEGMENT_HINT.party}) · trục phải`,
          type: 'line' as const,
          yAxisIndex: 1,
          symbolSize: 7,
          lineStyle: { color: SEGMENT_COLORS.party, width: 2 },
          itemStyle: { color: SEGMENT_COLORS.party },
          data: trendPeriods.map(period => {
            const agg = periodAggregate(period, 'party');
            const thin = thinSample('party', agg);
            return {
              value: agg.tc > 0 ? metricValue(trendMetric, agg) : null,
              bills: agg.tc,
              thin,
              periodLabel: period.label,
              symbol: thin ? 'emptyCircle' : 'circle',
              itemStyle: thin ? { opacity: 0.45 } : undefined,
            };
          }),
        },
      ]
    : trendSegments.map(segment => ({
        name: segment.label,
        type: 'bar' as const,
        stack: 'driver-total',
        barMaxWidth: 46,
        emphasis: { focus: 'series' as const },
        itemStyle: { color: segment.color },
        data: trendPeriods.map(period => {
          const segmentData = unitAggregate(period, segment.id);
          const scope = periodAggregate(period);
          const actual = metricValue(trendMetric, segmentData);
          const value = trendMetric === 'tc'
            ? segmentData.tc
            : trendMetric === 'ta'
              ? (scope.guest > 0 ? segmentData.net / scope.guest : 0)
              : (scope.tc > 0 ? segmentData.net / scope.tc : 0);

          return {
            value,
            actual,
            bills: segmentData.tc,
            thin: thinSample(segmentMode ? segment.id as GuestSegment : activeSegment, segmentData),
            total: metricValue(trendMetric, scope),
            periodLabel: period.label,
          };
        }),
      }));

  const tooltipRow = (left: string, right: string) =>
    `<div class="flex items-center justify-between gap-4 py-0.5"><span>${left}</span><span class="font-mono">${right}</span></div>`;

  const trendOption: EChartsOption = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: any) => {
        const list: any[] = params || [];
        const first = list[0];
        let html = `<div class="text-xs min-w-[240px]">
          <div class="font-bold border-b border-brand-border pb-1 mb-1">${first?.data?.periodLabel || first?.axisValue || ''}</div>`;

        if (segmentRatioMode) {
          list.forEach((item: any) => {
            const d = item.data || {};
            if (d.value == null) return;
            html += tooltipRow(
              `${item.marker} ${String(item.seriesName).replace(' · trục phải', '')}`,
              `${formatMetric(trendMetric, d.value)} · ${formatNumber(d.bills)} HĐ${d.thin ? ' · mẫu nhỏ' : ''}`,
            );
          });
          return `${html}</div>`;
        }

        html += tooltipRow(
          `${metricShortLabel[trendMetric]} toàn phạm vi · ${SEGMENT_LABEL[activeSegment].toLowerCase()}`,
          `<b class="text-brand-goldLight">${formatMetric(trendMetric, first?.data?.total || 0)}</b>`,
        );
        list.filter((item: any) => Number(item.value) !== 0).forEach((item: any) => {
          const d = item.data || {};
          const detail = trendMetric === 'tc'
            ? formatMetric('tc', d.actual || 0)
            : `${formatMetric(trendMetric, d.actual || 0)} · đóng góp ${formatMetric(trendMetric, Number(item.value) || 0)}${d.thin ? ` · ${d.bills} HĐ, mẫu nhỏ` : ''}`;
          html += tooltipRow(`${item.marker} ${item.seriesName}`, detail);
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
      right: segmentRatioMode ? 64 : 18,
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
    yAxis: [
      {
        type: 'value',
        axisLabel: {
          formatter: (value: number) => trendMetric === 'tc' ? formatNumber(value) : formatVND(value, 0),
          color: '#9E9B93',
          fontSize: 10,
        },
        splitLine: { lineStyle: { color: '#1F1F26', type: 'dashed' } },
      },
      ...(segmentRatioMode
        ? [{
            type: 'value' as const,
            name: SEGMENT_LABEL.party,
            nameTextStyle: { color: SEGMENT_COLORS.party, fontSize: 10 },
            axisLabel: {
              formatter: (value: number) => formatVND(value, 0),
              color: SEGMENT_COLORS.party,
              fontSize: 10,
            },
            splitLine: { show: false },
          }]
        : []),
    ],
    series: trendSeries as EChartsOption['series'],
  };

  const currentTrendPeriod = trendPeriods[trendPeriods.length - 1];
  const previousTrendPeriod = trendPeriods[trendPeriods.length - 2];
  // Kỳ dở dang ở ĐẦU hoặc CUỐI khoảng lọc → TC so trên bình quân/ngày. Bản cũ chỉ xét
  // kỳ cuối, nên tuần đầu thiếu ngày làm tuần sau trông như tăng vọt.
  const comparePerDay = trendMetric === 'tc'
    && (!!currentTrendPeriod?.partial || !!previousTrendPeriod?.partial);
  const comparableValue = (period: TrendPeriod | undefined, agg: TrendAggregate) => {
    const value = metricValue(trendMetric, agg);
    return comparePerDay && period?.days ? value / period.days : value;
  };
  const hasDenominator = (agg: TrendAggregate) =>
    trendMetric === 'tc' || (trendMetric === 'ta' ? agg.guest > 0 : agg.tc > 0);

  /** % biến động kỳ mới nhất so với kỳ trước của một phân khúc; null nếu không so được. */
  const segmentDelta = (segment: GuestSegment) => {
    if (!currentTrendPeriod || !previousTrendPeriod) return null;
    const current = periodAggregate(currentTrendPeriod, segment);
    const previous = periodAggregate(previousTrendPeriod, segment);
    if (thinSample(segment, current) || thinSample(segment, previous)) return null;
    if (!hasDenominator(current) || !hasDenominator(previous)) return null;
    const a = comparableValue(currentTrendPeriod, current);
    const b = comparableValue(previousTrendPeriod, previous);
    return b !== 0 ? (a - b) / Math.abs(b) : null;
  };

  const currentAgg = periodAggregate(currentTrendPeriod);
  const currentTrendValue = metricValue(trendMetric, currentAgg);
  const currentComparable = currentTrendPeriod ? comparableValue(currentTrendPeriod, currentAgg) : null;
  const currentThin = thinSample(activeSegment, currentAgg);
  const trendDelta = segmentDelta(activeSegment);
  const partyThin = activeSegment === 'party' && trendMetric !== 'tc'
    && [currentTrendPeriod, previousTrendPeriod].some(p => p && thinSample('party', periodAggregate(p)));

  const segmentChanges = previousTrendPeriod
    ? trendSegments
        .map(segment => {
          const current = unitAggregate(currentTrendPeriod, segment.id);
          const previous = unitAggregate(previousTrendPeriod, segment.id);
          const seg = segmentMode ? segment.id as GuestSegment : activeSegment;
          const comparable = hasDenominator(current) && hasDenominator(previous)
            && !thinSample(seg, current) && !thinSample(seg, previous);
          const delta = comparableValue(currentTrendPeriod, current) - comparableValue(previousTrendPeriod, previous);
          return { ...segment, delta, comparable };
        })
        .filter(segment => segment.comparable)
    : [];
  const alignedSegmentChanges = trendDelta == null || trendDelta === 0
    ? segmentChanges
    : segmentChanges.filter(segment => segment.delta === 0 || Math.sign(segment.delta) === Math.sign(trendDelta));
  const driverSegment = [...(alignedSegmentChanges.length ? alignedSegmentChanges : segmentChanges)]
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0] || null;

  // ---- Lẻ vs Tiệc của kỳ mới nhất: tách biến động thật của khách lẻ khỏi tác động của tiệc ----
  const signedPercent = (d: number | null) =>
    d == null ? '—' : `${d > 0 ? '+' : d < 0 ? '-' : ''}${formatPercent(Math.abs(d))}`;
  const mixCells = (['all', 'solo', 'party'] as GuestSegment[]).map(segment => {
    const agg = periodAggregate(currentTrendPeriod, segment);
    return {
      segment,
      agg,
      value: metricValue(trendMetric, agg),
      delta: segmentDelta(segment),
      thin: thinSample(segment, agg),
    };
  });
  const [mixAll, mixSolo, mixParty] = mixCells;
  const partyNetShare = mixAll.agg.net > 0 ? mixParty.agg.net / mixAll.agg.net : 0;
  const partyTcShare = mixAll.agg.tc > 0 ? mixParty.agg.tc / mixAll.agg.tc : 0;
  const mixGap = mixAll.delta != null && mixSolo.delta != null ? mixAll.delta - mixSolo.delta : null;
  // Tổng = khách lẻ + tác động tiệc (giá trị tiệc lẫn tỷ trọng tiệc). Phần tiệc lớn hơn
  // biến động của khách lẻ → biến động tổng chủ yếu do tiệc.
  const partyDriven = mixGap != null && Math.abs(mixGap) > Math.abs(mixSolo.delta ?? 0);
  const mixText = trendMetric === 'tc'
    ? `Tiệc chiếm ${formatPercent(partyTcShare)} số hoá đơn nhưng ${formatPercent(partyNetShare)} Net kỳ này — đếm TC gần như chỉ phản ánh khách lẻ.`
    : mixGap == null
      ? 'Cần ít nhất 2 kỳ để tách tác động của tiệc khỏi khách lẻ.'
      : `${metricShortLabel[trendMetric]} tổng ${signedPercent(mixAll.delta)}, khách lẻ ${signedPercent(mixSolo.delta)} → tiệc và cơ cấu lẻ/tiệc góp ${mixGap >= 0 ? '+' : '-'}${Math.abs(mixGap * 100).toFixed(1)} điểm %. `
        + (partyDriven
          ? 'Biến động chủ yếu do tiệc — đừng đọc thành khách lẻ chi tiêu khác đi.'
          : 'Biến động chủ yếu đến từ khách lẻ.');

  // Ở phân rã Lẻ · Tiệc, so chênh lệch tuyệt đối giữa hai phân khúc là sai thang đo
  // (AOV tiệc gấp ~12 lần lẻ) → điểm biến động lấy theo phép tách tổng = lẻ + tiệc ở trên.
  const driverName = segmentMode
    ? SEGMENT_LABEL.solo.toLowerCase()
    : driverSegment?.label
      || (trendBreakdown === 'brand' ? 'brand đang chọn' : 'cửa hàng đang chọn');
  const driverLine = segmentMode
    ? `${SEGMENT_LABEL.solo} ${signedPercent(mixSolo.delta)} · ${SEGMENT_LABEL.party} ${mixParty.thin ? 'mẫu nhỏ' : signedPercent(mixParty.delta)}`
    : driverSegment
      ? `${driverSegment.label}: ${driverSegment.delta >= 0 ? '+' : ''}${comparePerDay ? `${formatNumber(driverSegment.delta, 1)} HĐ/ngày` : formatMetric(trendMetric, driverSegment.delta)}`
      : null;
  const actionText = trendDelta == null
    ? partyThin
      ? `Có kỳ dưới ${MIN_PARTY_SAMPLE} HĐ tiệc — ${metricShortLabel[trendMetric]} tiệc chưa đủ mẫu để kết luận. Chuyển nhịp Tháng hoặc xem TC tiệc.`
      : 'Cần ít nhất 2 kỳ trong phạm vi lọc để xác định xu hướng và điểm cần hành động.'
    : segmentMode && partyDriven
      ? `${metricShortLabel[trendMetric]} tổng lệch chủ yếu vì tiệc (${mixParty.thin ? 'mẫu nhỏ' : signedPercent(mixParty.delta)}) — theo dõi pipeline booking và set menu tiệc ở M10; khách lẻ thực tế ${signedPercent(mixSolo.delta)}.`
    : activeSegment === 'party'
      ? trendMetric === 'tc'
        ? trendDelta < 0
          ? `Số tiệc giảm — kiểm tra pipeline booking (M10) và lead chưa chốt tại ${driverName}.`
          : `Số tiệc tăng — kiểm tra năng lực phục vụ đoàn và lịch sảnh tại ${driverName}.`
        : trendDelta < 0
          ? `Giá trị mỗi tiệc giảm — rà soát set menu tiệc, mức cọc và chiết khấu đoàn tại ${driverName}.`
          : `Giá trị tiệc tăng — chuẩn hoá gói menu tiệc đang bán tốt tại ${driverName}.`
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
        description={`Doanh số = khách lẻ + khách tiệc (hoá đơn ≥ ${PARTY_MIN} khách). Xem riêng từng phân khúc hoặc phân rã theo brand, cửa hàng; kỳ có ký hiệu ⚠ chưa đủ ngày`}
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

            <span className="ml-1 text-[10px] font-bold uppercase tracking-wider text-brand-faint">Khách</span>
            <div
              className={`flex rounded-lg border border-brand-border bg-brand-surface p-0.5 ${segmentMode ? 'opacity-40' : ''}`}
              title={segmentMode ? 'Đang phân rã Lẻ · Tiệc — hai phân khúc đã hiện cùng lúc' : undefined}
            >
              {(['all', 'solo', 'party'] as GuestSegment[]).map(segment => (
                <button
                  key={segment}
                  type="button"
                  disabled={segmentMode}
                  aria-pressed={activeSegment === segment}
                  onClick={() => setTrendSegment(segment)}
                  title={SEGMENT_HINT[segment]}
                  className={`rounded-md px-3 py-1.5 text-[11px] font-semibold transition-colors disabled:cursor-not-allowed ${
                    activeSegment === segment
                      ? 'bg-brand-cardHover text-brand-goldLight'
                      : 'text-brand-muted hover:text-brand-text'
                  }`}
                >
                  {segment === 'all' ? 'Tất cả' : segment === 'solo' ? `Lẻ <${PARTY_MIN}` : `Tiệc ≥${PARTY_MIN}`}
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
                ['segment', 'Lẻ · Tiệc'],
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
            {metricLabel[trendMetric]} · {SEGMENT_LABEL[activeSegment]} theo {trendGranularity === 'week' ? 'tuần ISO' : trendGranularity === 'month' ? 'tháng' : 'năm'}
          </span>
          <span className="text-brand-muted">
            {segmentRatioMode
              ? `Cột = ${SEGMENT_LABEL.solo.toLowerCase()} · nét đứt = tổng · đường vàng = tiệc (trục phải); khoảng cách cột ↔ nét đứt là phần tiệc kéo lệch`
              : trendMetric === 'tc'
                ? 'Chiều cao cột = tổng số hoá đơn'
                : `Chiều cao cột = ${metricShortLabel[trendMetric]} toàn phạm vi; mỗi lớp là đóng góp có trọng số`}
          </span>
        </div>

        <EChartWrapper option={trendOption} height={375} />

        <div className="mt-3 grid grid-cols-1 gap-3 border-t border-brand-border/70 pt-4 md:grid-cols-3">
          <div className="rounded-lg border border-brand-border bg-brand-surface/70 p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-brand-faint">
              Kỳ mới nhất · {currentTrendPeriod?.label || '—'} · {SEGMENT_LABEL[activeSegment]}
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
              {currentThin ? ` · chỉ ${currentAgg.tc} HĐ, mẫu nhỏ` : ''}
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
              {signedPercent(trendDelta)}
            </div>
            <div className="mt-0.5 text-[10px] text-brand-muted">
              {driverLine
                ? driverLine
                : partyThin
                  ? `Chưa đủ ${MIN_PARTY_SAMPLE} HĐ tiệc mỗi kỳ để so sánh`
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

        {/* Lẻ vs Tiệc — tách biến động thật của khách lẻ khỏi tác động của tiệc */}
        <div className="mt-3 rounded-lg border border-brand-border bg-brand-surface/40 p-3">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-brand-faint">
              Lẻ vs Tiệc · {metricShortLabel[trendMetric]} · {currentTrendPeriod?.label || '—'}
            </span>
            <span className="text-[10px] text-brand-muted">
              Tiệc: {formatNumber(mixParty.agg.tc)} HĐ · {formatPercent(partyTcShare)} TC · {formatPercent(partyNetShare)} Net
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {mixCells.map(cell => (
              <div key={cell.segment} className="rounded-md border border-brand-border/70 bg-brand-surface/70 px-2.5 py-2">
                <div className="flex items-center gap-1.5 text-[10px] text-brand-muted">
                  {cell.segment !== 'all' && (
                    <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: SEGMENT_COLORS[cell.segment] }} />
                  )}
                  {cell.segment === 'all' ? 'Tổng' : SEGMENT_LABEL[cell.segment]}
                </div>
                <div className="mt-0.5 font-mono text-sm font-bold text-brand-text">
                  {cell.agg.tc > 0 ? formatMetric(trendMetric, cell.value) : '—'}
                </div>
                <div className={`font-mono text-[10px] ${
                  cell.delta == null ? 'text-brand-faint' : cell.delta > 0 ? 'text-status-ok' : cell.delta < 0 ? 'text-status-bad' : 'text-brand-muted'
                }`}>
                  {cell.thin ? `mẫu nhỏ · ${cell.agg.tc} HĐ` : `${signedPercent(cell.delta)} vs kỳ trước`}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-brand-text">{mixText}</p>
        </div>

        <p className="mt-3 text-[10px] leading-relaxed text-brand-faint">
          Khách tiệc = hoá đơn có từ {PARTY_MIN} khách trở lên; khách lẻ = phần còn lại (kể cả đơn giao hàng 0 khách) — luật ở data_contract.json → $guest_segment. Lẻ + tiệc luôn cộng đúng bằng tổng.
          {trendMetric !== 'tc' && ' TA và AOV là tỷ lệ nên không cộng trực tiếp giữa các đơn vị: phân rã brand/cửa hàng chồng phần đóng góp doanh thu trên mẫu số chung của kỳ; phân rã Lẻ · Tiệc vẽ tỷ lệ thật của từng phân khúc.'}
          {trendMetric !== 'tc' && ` Tỷ lệ tiệc của kỳ dưới ${MIN_PARTY_SAMPLE} HĐ bị đánh dấu mẫu nhỏ và không dùng để tính biến động.`}
        </p>
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
