import React from 'react';
import { useFilters } from '../context/FilterContext';
import { MKT_DATA, BRAND_COLORS } from '../data';
import { MetricCard } from '../components/common/MetricCard';
import { Card } from '../components/common/Card';
import { DataTable, Column } from '../components/common/DataTable';
import { EChartWrapper } from '../components/charts/EChartWrapper';
import { formatVND, formatPercent } from '../utils/formatters';
import type { EChartsOption } from 'echarts';

export const BudgetView: React.FC = () => {
  const { filters, brandMatches, selectedMonths, theme } = useFilters();
  const isDark = theme === 'dark';

  const B = MKT_DATA.budget || {
    total: 0,
    plan: 0,
    file: '',
    brand: [],
    extra: [],
    channel: [],
    store_ads: [],
    nonmedia: [],
    nonmedia_stat: { months: [], budget: 0, actual: 0, use_rate: null },
  };

  const Q3_MONTHS = ['2026-07', '2026-08', '2026-09'];

  const brandBudgets = (B.brand || []).filter(b => brandMatches(b.brand));
  const extraBudgets = B.extra || [];
  const channels = B.channel || [];
  const storeAds = (B.store_ads || []).filter(s => brandMatches(s.brand));

  const sumQuarter = (obj: any) =>
    Q3_MONTHS.reduce((acc, m) => acc + (obj[m] || 0), 0);

  const brandBudgetSum = brandBudgets.reduce((acc, b) => acc + b.budget, 0);
  const brandPlanSum = brandBudgets.reduce((acc, b) => acc + sumQuarter(b), 0);
  const extraPlanSum = extraBudgets.reduce((acc, e) => acc + sumQuarter(e), 0);

  // Group by channel
  const channelBy: Record<string, { plan: number; months: Record<string, number> }> = {};
  channels.forEach(c => {
    channelBy[c.channel] = channelBy[c.channel] || { plan: 0, months: {} };
    channelBy[c.channel].plan += sumQuarter(c);
    Q3_MONTHS.forEach(m => {
      channelBy[c.channel].months[m] = (channelBy[c.channel].months[m] || 0) + (c[m] || 0);
    });
  });

  const channelKeys = Object.keys(channelBy).sort((a, b) => channelBy[b].plan - channelBy[a].plan);
  const totalAdsBudget = channelKeys.reduce((a, k) => a + channelBy[k].plan, 0);

  const noGoogleStores = storeAds.filter(s => !s.google);

  // 1. Channel Donut Chart
  const channelColors: Record<string, string> = {
    'Meta Ads': '#C5A059',
    'Google Ads': '#22C55E',
    'Zalo Ads': '#82846C',
  };

  const channelDonutOption: EChartsOption = {
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
        name: 'Kênh Quảng Cáo',
        type: 'pie',
        radius: ['50%', '75%'],
        center: ['50%', '45%'],
        itemStyle: { borderRadius: 4, borderColor: isDark ? '#141417' : '#FFFFFF', borderWidth: 2 },
        label: { show: false },
        data: channelKeys.map(k => ({
          name: k,
          value: channelBy[k].plan,
          itemStyle: { color: channelColors[k] || '#D6D3CA' },
        })),
      },
    ],
  };

  // 2. Channel Monthly Stacked Bar Chart
  const channelBarOption: EChartsOption = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: any) => {
        let res = `<div class="font-bold text-xs mb-1">${params[0]?.axisValue}</div>`;
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
    grid: { top: 35, right: 15, bottom: 25, left: 65 },
    xAxis: {
      type: 'category',
      data: ['Tháng 7', 'Tháng 8', 'Tháng 9'],
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
    series: channelKeys.map(k => ({
      name: k,
      type: 'bar' as const,
      stack: 'ads',
      data: Q3_MONTHS.map(m => channelBy[k].months[m] || 0),
      itemStyle: { color: channelColors[k] || '#D6D3CA' },
      barMaxWidth: 38,
    })),
  };

  // Columns for Store Ads Allocation Table
  const storeAdsColumns: Column<typeof storeAds[0]>[] = [
    {
      key: 'store',
      header: 'Cửa hàng',
      render: row => <span className="font-bold text-brand-text">{row.store}</span>,
    },
    {
      key: 'brand',
      header: 'Brand',
      render: row => (
        <span className="font-semibold" style={{ color: BRAND_COLORS[row.brand] }}>
          ● {row.brand}
        </span>
      ),
    },
    {
      key: 'target',
      header: 'Target Q3',
      align: 'right',
      render: row => <span className="font-mono text-brand-muted">{formatVND(row.target)}</span>,
    },
    {
      key: 'meta',
      header: 'Meta Ads',
      align: 'right',
      render: row => <span className="font-mono">{formatVND(row.meta)}</span>,
    },
    {
      key: 'google',
      header: 'Google Ads',
      align: 'right',
      render: row => (
        <span className="font-mono">
          {row.google ? formatVND(row.google) : <span className="text-status-bad font-bold">0</span>}
        </span>
      ),
    },
    {
      key: 'zalo',
      header: 'Zalo Ads',
      align: 'right',
      render: row => (
        <span className="font-mono">
          {row.zalo ? formatVND(row.zalo) : <span className="text-status-bad font-bold">0</span>}
        </span>
      ),
    },
    {
      key: 'total',
      header: 'Tổng Ads Plan',
      align: 'right',
      render: row => <span className="font-mono font-bold text-brand-goldLight">{formatVND(row.total)}</span>,
    },
    {
      key: 'pct',
      header: '% / Target',
      align: 'right',
      render: row => <span className="font-mono font-bold">{formatPercent(row.pct, 2)}</span>,
    },
  ];

  /* ── Chi phí NGOÀI media ────────────────────────────────────────────
     KOL/KOC · POSM & in ấn · sản xuất nội dung · sự kiện.
     Tách riêng vì Ad Cost Ratio chỉ được tính trên tiền MUA lượt tiếp cận;
     gộp tiền in POSM vào media spend là thổi phồng chi phí quảng cáo. */
  const NM = (B.nonmedia || []).filter(r => selectedMonths.includes(r.month));
  const nmBudget = NM.reduce((a, b) => a + (b.budget || 0), 0);
  const nmActual = NM.reduce((a, b) => a + (b.actual || 0), 0);

  const nmColumns: Column<(typeof NM)[0]>[] = [
    { key: 'item', header: 'Hạng mục', render: r => <span className="font-bold text-brand-text">{r.item}</span> },
    { key: 'month', header: 'Tháng', render: r => <span className="font-mono text-xs">{r.month}</span> },
    { key: 'budget', header: 'Ngân sách', align: 'right', render: r => <span className="font-mono">{r.budget === null ? '—' : formatVND(r.budget)}</span> },
    { key: 'actual', header: 'Thực chi', align: 'right', render: r => <span className="font-mono font-bold text-brand-goldLight">{r.actual === null ? '—' : formatVND(r.actual)}</span> },
    {
      key: 'use_rate', header: '% sử dụng', align: 'right',
      render: r => (
        <span className={`font-mono ${r.use_rate !== null && r.use_rate > 1 ? 'text-status-bad' : ''}`}>
          {r.use_rate === null ? '—' : formatPercent(r.use_rate)}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-5 p-4 sm:p-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div>
        <h2 className="text-xl font-extrabold text-brand-text font-display mt-0.5">
          M4 · Ngân Sách Marketing
        </h2>
        <p className="text-xs text-brand-muted mt-1">
          Khung tham chiếu kế hoạch ngân sách quý 3/2026 (Jul · Aug · Sep) cho toàn bộ chiến dịch Marketing và Ads.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard
          label="Ngân Sách Gốc Q3"
          subLabel="Đã duyệt toàn chuỗi"
          value={formatVND(B.total)}
          variant="hero"
        />
        <MetricCard
          label="Tổng Plan Đã Phân Bổ"
          subLabel="Brand MKT + Extra"
          value={formatVND(B.plan)}
          customDeltaText={`${formatPercent(B.plan / B.total)} ngân sách gốc`}
        />
        <MetricCard
          label="Plan Brand Đã Chọn"
          subLabel={filters.brand === 'ALL' ? 'Toàn bộ 3 brand' : `Brand ${filters.brand}`}
          value={formatVND(brandPlanSum + (filters.brand === 'ALL' ? extraPlanSum : 0))}
        />
        <MetricCard
          label="Ngân Sách Ads 3 Kênh"
          subLabel="Meta + Google + Zalo"
          value={formatVND(totalAdsBudget)}
          customDeltaText={`${formatPercent(totalAdsBudget / B.plan)} tổng plan`}
        />
      </div>

      {/* Two-Tier Budget Table */}
      <Card
        title="Cấu Trúc Ngân Sách Hai Tầng (Q3/2026)"
        description="Tầng 1: Brand MKT (2% doanh thu mục tiêu) · Tầng 2: Extra Projects (Ngân sách chuyên đề)"
        chip="BIỂU ĐỒ TRỤ CỘT"
        hero={true}
      >
        <div className="overflow-x-auto rounded-lg border border-brand-border bg-brand-surface/50">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="border-b border-brand-border bg-brand-surface text-[10px] font-bold uppercase tracking-wider text-brand-muted">
                <th className="p-2.5">Tầng</th>
                <th className="p-2.5">Hạng mục</th>
                <th className="p-2.5 text-right">Ngân sách gốc</th>
                <th className="p-2.5 text-right">Plan Q3</th>
                <th className="p-2.5 text-right">Tháng 7</th>
                <th className="p-2.5 text-right">Tháng 8</th>
                <th className="p-2.5 text-right">Tháng 9</th>
                <th className="p-2.5 text-right">Tỷ lệ dùng</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-border/40 font-mono">
              {brandBudgets.map(b => (
                <tr key={b.brand} className="hover:bg-brand-cardHover">
                  <td className="p-2.5">
                    <span className="rounded bg-status-okBg px-1.5 py-0.5 text-[9px] text-status-ok font-sans font-semibold">
                      Brand MKT
                    </span>
                  </td>
                  <td className="p-2.5 font-sans font-bold text-brand-text">{b.brand}</td>
                  <td className="p-2.5 text-right text-brand-muted">{formatVND(b.budget)}</td>
                  <td className="p-2.5 text-right font-bold text-brand-goldLight">{formatVND(sumQuarter(b))}</td>
                  <td className="p-2.5 text-right">{formatVND(b['2026-07'] || 0)}</td>
                  <td className="p-2.5 text-right">{formatVND(b['2026-08'] || 0)}</td>
                  <td className="p-2.5 text-right">{formatVND(b['2026-09'] || 0)}</td>
                  <td className="p-2.5 text-right font-bold">{formatPercent(sumQuarter(b) / b.budget)}</td>
                </tr>
              ))}

              {extraBudgets.map(e => (
                <tr key={e.name} className="hover:bg-brand-cardHover">
                  <td className="p-2.5">
                    <span className="rounded bg-status-warningBg px-1.5 py-0.5 text-[9px] text-status-warning font-sans font-semibold">
                      Extra
                    </span>
                  </td>
                  <td className="p-2.5 font-sans font-semibold text-brand-text">{e.name}</td>
                  <td className="p-2.5 text-right text-brand-faint">—</td>
                  <td className="p-2.5 text-right font-bold text-brand-goldLight">{formatVND(sumQuarter(e))}</td>
                  <td className="p-2.5 text-right">{formatVND(e['2026-07'] || 0)}</td>
                  <td className="p-2.5 text-right">{formatVND(e['2026-08'] || 0)}</td>
                  <td className="p-2.5 text-right">{formatVND(e['2026-09'] || 0)}</td>
                  <td className="p-2.5 text-right text-brand-faint">—</td>
                </tr>
              ))}

              <tr className="border-t-2 border-brand-gold bg-brand-dark/70 font-bold text-brand-text">
                <td colSpan={2} className="p-2.5 font-sans">
                  TỔNG CỘNG PLAN Q3
                </td>
                <td className="p-2.5 text-right font-mono text-brand-muted">{formatVND(brandBudgetSum)}</td>
                <td className="p-2.5 text-right font-mono text-brand-gold">{formatVND(brandPlanSum + extraPlanSum)}</td>
                <td className="p-2.5 text-right font-mono">
                  {formatVND(
                    brandBudgets.reduce((a, b) => a + (b['2026-07'] || 0), 0) +
                    extraBudgets.reduce((a, e) => a + (e['2026-07'] || 0), 0)
                  )}
                </td>
                <td className="p-2.5 text-right font-mono">
                  {formatVND(
                    brandBudgets.reduce((a, b) => a + (b['2026-08'] || 0), 0) +
                    extraBudgets.reduce((a, e) => a + (e['2026-08'] || 0), 0)
                  )}
                </td>
                <td className="p-2.5 text-right font-mono">
                  {formatVND(
                    brandBudgets.reduce((a, b) => a + (b['2026-09'] || 0), 0) +
                    extraBudgets.reduce((a, e) => a + (e['2026-09'] || 0), 0)
                  )}
                </td>
                <td className="p-2.5 text-right text-brand-faint">—</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      {/* Row 2: Channel Monthly Pacing & Donut */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card
          title="Ngân Sách Quảng Cáo Theo Kênh & Tháng"
          description="Tiến độ phân bổ ngân sách 3 kênh Meta, Google và Zalo trong Q3"
          chip="CỘT CHỒNG"
          className="lg:col-span-2"
        >
          <EChartWrapper option={channelBarOption} height={270} />
        </Card>

        <Card
          title="Tỷ Trọng 3 Kênh Quảng Cáo"
          description="Luỹ kế phân bổ ngân sách Q3"
          chip="TỶ TRỌNG"
        >
          <EChartWrapper option={channelDonutOption} height={270} />
        </Card>
      </div>

      {/* Row 3: Store Ads Allocation Table */}
      <Card
        title="Phân Bổ Ngân Sách Quảng Cáo Theo Cửa Hàng"
        description="Định mức chi phí quảng cáo so với doanh thu mục tiêu từng địa điểm"
        chip="STORE ADS ALLOCATION"
      >
        <DataTable
          columns={storeAdsColumns}
          data={storeAds}
          searchable={false}
          pageSize={8}
          exportFilename="Noire_Store_Ads_Allocation"
        />

        {noGoogleStores.length > 0 && (
          <div className="mt-3 rounded-lg border border-status-bad/40 bg-status-badBg/20 p-3 text-xs text-status-bad">
            <b>Cảnh báo phân bổ:</b> Có {noGoogleStores.length} cửa hàng không được phân bổ ngân sách Google/Zalo (
            {noGoogleStores.map(s => s.store).join(', ')}). Cần đối chiếu với thực chi ở màn hình M5 Digital Ads để
            tránh chi ngoài kế hoạch.
          </div>
        )}
      </Card>

      {/* Chi phí ngoài media */}
      {NM.length > 0 && (
        <Card
          title="Chi Phí Ngoài Media"
          description="KOL/KOC · POSM & in ấn · sản xuất nội dung · sự kiện — KHÔNG cộng vào media spend khi tính Ad Cost Ratio"
          chip="NON-MEDIA"
        >
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <MetricCard label="Ngân sách" subLabel="Σ hạng mục trong kỳ" value={formatVND(nmBudget)} />
            <MetricCard
              label="Thực chi"
              subLabel="Σ actual"
              value={formatVND(nmActual)}
              variant={nmBudget > 0 && nmActual > nmBudget ? 'warning' : 'default'}
            />
            <MetricCard
              label="% Sử dụng"
              subLabel="actual ÷ budget"
              value={nmBudget > 0 ? formatPercent(nmActual / nmBudget) : '—'}
              customDeltaText={nmBudget > 0 ? `Chênh ${formatVND(nmActual - nmBudget)}` : 'chưa khai ngân sách'}
            />
          </div>
          <DataTable
            columns={nmColumns}
            data={NM}
            searchable={false}
            pageSize={8}
            exportFilename="Noire_NonMedia_Cost"
          />
        </Card>
      )}
    </div>
  );
};
