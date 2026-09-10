import React from 'react';
import { useFilters } from '../context/FilterContext';
import { MKT_DATA, BRAND_COLORS } from '../data';
import { MetricCard } from '../components/common/MetricCard';
import { Card } from '../components/common/Card';
import { StatusBadge } from '../components/common/StatusBadge';
import { DataTable, Column } from '../components/common/DataTable';
import { EChartWrapper } from '../components/charts/EChartWrapper';
import { formatVND, formatPercent } from '../utils/formatters';
import type { EChartsOption } from 'echarts';

export const PreAnalyticsView: React.FC = () => {
  const { brandMatches, theme } = useFilters();
  const isDark = theme === 'dark';

  const P = (MKT_DATA.pre_q3 || []).filter(p => brandMatches(p.brand));
  const isNum = (p: any): p is { roi: number; nc: number; name: string; brand: string; kind: string } =>
    p.roi !== null && p.roi !== undefined && isFinite(p.roi);

  const neg = P.filter(p => isNum(p) && p.roi < 0);
  const pos = P.filter(p => isNum(p) && p.roi >= 0);
  const branding = P.filter(p => !isNum(p));

  const negNC = neg.reduce((a, b) => a + b.nc, 0);
  const posNC = pos.reduce((a, b) => a + b.nc, 0);

  // Group by mechanism kind
  const byKind: Record<string, { n: number; nc: number; neg: number }> = {};
  P.forEach(p => {
    const k = p.kind || 'Khác';
    byKind[k] = byKind[k] || { n: 0, nc: 0, neg: 0 };
    byKind[k].n++;
    byKind[k].nc += p.nc;
    if (isNum(p) && p.roi < 0) byKind[k].neg++;
  });

  const kinds = Object.keys(byKind).sort((a, b) => byKind[b].n - byKind[a].n);

  // 1. Net Contribution Distribution Horizontal Bar Chart
  const sortedP = [...P].sort((a, b) => a.nc - b.nc);
  const preDistOption: EChartsOption = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: any) => {
        const item = params[0];
        const p = sortedP[item?.dataIndex];
        const hasRoi = p && isNum(p);
        return `<div class="text-xs">
          <div class="font-bold border-b border-brand-border pb-1 mb-1 text-brand-goldLight">${p?.name || ''}</div>
          <div class="space-y-0.5 font-mono text-[11px]">
            <div>Brand: <b>${p?.brand || ''}</b> · Loại: <b>${p?.kind || ''}</b></div>
            <div>Dự báo ROI: <b>${hasRoi ? (p.roi * 100).toFixed(1) + '%' : 'Branding'}</b></div>
            <div>Net Contribution: <b class="${(p?.nc || 0) < 0 ? 'text-status-bad' : 'text-status-ok'}">${formatVND(p?.nc)}</b></div>
          </div>
        </div>`;
      },
    },
    grid: { top: 15, right: 25, bottom: 25, left: 180 },
    xAxis: {
      type: 'value',
      axisLabel: {
        formatter: (val: number) => formatVND(val, 0),
        color: '#9E9B93',
        fontSize: 10,
      },
      splitLine: { lineStyle: { color: '#1F1F26', type: 'dashed' } },
    },
    yAxis: {
      type: 'category',
      data: sortedP.map(p => p.name.length > 24 ? p.name.slice(0, 22) + '...' : p.name),
      axisLine: { lineStyle: { color: '#2A2A33' } },
      axisLabel: { color: isDark ? '#F3F2EE' : '#18181B', fontSize: 10 },
    },
    series: [
      {
        name: 'Net Contribution Dự Báo',
        type: 'bar',
        data: sortedP.map(p => ({
          value: p.nc,
          itemStyle: {
            color: p.nc < 0 ? '#EF4444' : isNum(p) && p.roi >= 0.1 ? '#22C55E' : '#F59E0B',
            borderRadius: p.nc < 0 ? [4, 0, 0, 4] : [0, 4, 4, 0],
          },
        })),
        barMaxWidth: 16,
      },
    ],
  };

  // Columns for Pre-Analytics Table
  const tableData = [...P].sort((a, b) => b.nc - a.nc);
  const columns: Column<typeof tableData[0]>[] = [
    {
      key: 'name',
      header: 'Tên chương trình đề xuất',
      render: row => <span className="font-bold text-brand-text">{row.name}</span>,
    },
    {
      key: 'brand',
      header: 'Brand',
      render: row => (
        <span className="font-semibold text-[11px]" style={{ color: BRAND_COLORS[row.brand] }}>
          ● {row.brand}
        </span>
      ),
    },
    {
      key: 'kind',
      header: 'Loại cơ chế',
      render: row => (
        <span className="rounded bg-brand-dark/60 px-1.5 py-0.5 text-[10px] text-brand-sand border border-brand-border font-medium">
          {row.kind}
        </span>
      ),
    },
    {
      key: 'roi',
      header: 'ROI Dự báo',
      align: 'right',
      render: row => (
        <span className="font-mono font-bold">
          {row.roi != null && isFinite(row.roi) ? (row.roi * 100).toFixed(1) + '%' : <span className="text-brand-muted">Branding</span>}
        </span>
      ),
    },
    {
      key: 'nc',
      header: 'Net Contribution',
      align: 'right',
      render: row => (
        <span
          className={`font-mono font-bold ${
            row.nc < 0 ? 'text-status-bad' : row.nc > 0 ? 'text-status-ok' : 'text-brand-muted'
          }`}
        >
          {formatVND(row.nc)}
        </span>
      ),
    },
    {
      key: 'decision',
      header: 'Cổng duyệt',
      align: 'center',
      render: row => {
        if (row.roi == null || !isFinite(row.roi)) return <StatusBadge label="Đo bằng nhận diện" variant="neutral" />;
        if (row.roi >= 0.1) return <StatusBadge label="Nên duyệt chạy" variant="ok" />;
        if (row.roi >= 0) return <StatusBadge label="Biên mỏng" variant="warning" />;
        return <StatusBadge label="Xem lại cơ chế" variant="bad" />;
      },
    },
  ];

  return (
    <div className="space-y-5 p-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div>
        <span className="text-[10px] font-extrabold uppercase tracking-widest text-brand-gold">
          TRƯỚC KHI CHẠY — DỰ BÁO CÓ LÃI KHÔNG
        </span>
        <h2 className="text-xl font-extrabold text-brand-text font-display mt-0.5">
          M7 · Pre-Analytics — Kế Hoạch CTKM Q3/2026
        </h2>
        <p className="text-xs text-brand-muted mt-1">
          {P.length} chương trình đề xuất trong file Pre-Analysis Master sheet. Đóng vai trò bộ lọc tài chính trước khi duyệt chạy.
        </p>
      </div>

      {/* Pre-analytics Disclaimer */}
      <div className="rounded-xl border border-brand-border bg-brand-surface p-4 text-xs text-brand-muted space-y-1">
        <p>
          <b>Lưu ý phương pháp:</b> Toàn bộ con số dưới đây là mô phỏng dự báo trước khi triển khai, dựa trên giả định{' '}
          <span className="font-mono text-brand-gold">Growth %</span> do team lập kế hoạch nhập và độ phủ COGS hiện tại.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard
          label="Chương Trình Đề Xuất"
          subLabel="Đếm dòng sheet Master"
          value={P.length}
          unit="CTKM"
          variant="hero"
        />
        <MetricCard
          label="Dự Báo Hiệu Quả Âm"
          subLabel="ROI < 0 (Lỗ tài chính)"
          value={neg.length}
          unit="chương trình"
          customDeltaText={`${formatPercent(neg.length / (neg.length + pos.length))} số CTKM có tính ROI`}
          isFlagged={neg.length > 0}
          flagMessage="Cần sửa cơ chế"
          variant="critical"
        />
        <MetricCard
          label="Đóng Góp Âm Ước Tính"
          subLabel="Σ Net Contribution < 0"
          value={formatVND(Math.abs(negNC))}
          isFlagged={true}
          flagMessage="Rủi ro hao hụt"
          variant="warning"
        />
        <MetricCard
          label="Đóng Góp Dương Ước Tính"
          subLabel="Σ Net Contribution ≥ 0"
          value={formatVND(posNC)}
          customDeltaText={`${pos.length} chương trình có lãi`}
        />
      </div>

      {/* Net Contribution Distribution Chart */}
      <Card
        title="Phân Bố Hiệu Quả Đóng Góp Ròng Dự Báo (Net Contribution)"
        description="Mỗi cột đại diện một chương trình. Cột đỏ là chương trình dự báo lỗ cần điều chỉnh cơ chế trước khi duyệt."
        chip="SIMULATION"
        hero={true}
      >
        <EChartWrapper option={preDistOption} height={380} />
      </Card>

      {/* Gatekeeper Decision Table */}
      <Card
        title="Danh Sách Chi Tiết & Khuyến Nghị Cổng Duyệt CTKM"
        description="Sắp xếp theo Net Contribution dự báo giảm dần"
        chip="GATEKEEPER"
      >
        <DataTable
          columns={columns}
          data={tableData}
          searchPlaceholder="Tìm chương trình khuyến mãi..."
          searchKeys={['name', 'brand', 'kind']}
          pageSize={10}
          exportFilename="Noire_PreAnalytics_Q3"
        />
      </Card>
    </div>
  );
};
