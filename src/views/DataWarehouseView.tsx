import React from 'react';
import { useFilters } from '../context/FilterContext';
import { HUB_DATA, MKT_DATA, BRAND_COLORS } from '../data';
import { MetricCard } from '../components/common/MetricCard';
import { Card } from '../components/common/Card';
import { StatusBadge } from '../components/common/StatusBadge';
import { DataTable, Column } from '../components/common/DataTable';
import { EChartWrapper } from '../components/charts/EChartWrapper';
import { formatVND, formatNumber, formatMonthLabel } from '../utils/formatters';
import type { EChartsOption } from 'echarts';

export const DataWarehouseView: React.FC = () => {
  const { theme } = useFilters();
  const isDark = theme === 'dark';

  /* Hai khối sinh chốt riêng nên mảng gộp không theo thứ tự số — sắp lại để
     bảng đọc được từ trên xuống thay vì nhảy 9 → 15 → 14 → 10. */
  const qa = [...(HUB_DATA.qa || []), ...(MKT_DATA.qa || [])].sort((a, b) => a.no - b.no);
  const passedQA = qa.filter(q => q.ok).length;
  const cov = HUB_DATA.cogs_cov || [];
  const rec = (HUB_DATA.recon || []).filter(r => !HUB_DATA.coverage[r.month]?.partial);
  const badRec = rec.filter(r => Math.abs(r.d_bill || 0) >= 0.005).length;

  // 1. Reconciliation Chart (Khớp vs Lệch)
  const recByMonth: Record<string, { ok: number; total: number }> = {};
  rec.forEach(r => {
    recByMonth[r.month] = recByMonth[r.month] || { ok: 0, total: 0 };
    recByMonth[r.month].total++;
    if (Math.abs(r.d_bill || 0) < 0.005) {
      recByMonth[r.month].ok++;
    }
  });

  const recMonths = Object.keys(recByMonth).sort();
  const recOption: EChartsOption = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
    },
    legend: {
      top: 0,
      textStyle: { color: '#9E9B93', fontSize: 11 },
    },
    grid: { top: 35, right: 20, bottom: 25, left: 45 },
    xAxis: {
      type: 'category',
      data: recMonths.map(formatMonthLabel),
      axisLine: { lineStyle: { color: '#2A2A33' } },
      axisLabel: { color: isDark ? '#F3F2EE' : '#18181B', fontSize: 11 },
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: '#9E9B93', fontSize: 10 },
      splitLine: { lineStyle: { color: '#1F1F26', type: 'dashed' } },
    },
    series: [
      {
        name: 'Khớp (≤0.5%)',
        type: 'bar',
        stack: 'rec',
        data: recMonths.map(m => recByMonth[m].ok),
        itemStyle: { color: '#22C55E' },
        barMaxWidth: 32,
      },
      {
        name: 'Lệch (>0.5%)',
        type: 'bar',
        stack: 'rec',
        data: recMonths.map(m => recByMonth[m].total - recByMonth[m].ok),
        itemStyle: { color: '#EF4444' },
        barMaxWidth: 32,
      },
    ],
  };

  // 2. COGS Coverage Chart
  const covOption: EChartsOption = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: any) => {
        const item = params[0];
        return `<div class="text-xs">
          <b>${item?.axisValue}</b>: ${item?.value?.toFixed(1)}% doanh thu có BOM
        </div>`;
      },
    },
    grid: { top: 25, right: 20, bottom: 25, left: 50 },
    xAxis: {
      type: 'category',
      data: cov.map(c => formatMonthLabel(c.month)),
      axisLine: { lineStyle: { color: '#2A2A33' } },
      axisLabel: { color: isDark ? '#F3F2EE' : '#18181B', fontSize: 11 },
    },
    yAxis: {
      type: 'value',
      max: 100,
      axisLabel: {
        formatter: '{value}%',
        color: '#9E9B93',
        fontSize: 10,
      },
      splitLine: { lineStyle: { color: '#1F1F26', type: 'dashed' } },
    },
    series: [
      {
        name: 'Độ phủ giá vốn',
        type: 'bar',
        data: cov.map(c => c.pct * 100),
        itemStyle: { color: '#C5A059', borderRadius: [4, 4, 0, 0] },
        barMaxWidth: 32,
      },
    ],
  };

  // QA Gates Table
  const qaColumns: Column<typeof qa[0]>[] = [
    {
      key: 'no',
      header: '#',
      render: row => <span className="font-mono font-bold text-brand-gold">{row.no}</span>,
      width: '45px',
    },
    {
      key: 'name',
      header: 'Nội dung kiểm tra',
      render: row => <span className="font-bold text-brand-text">{row.name}</span>,
    },
    {
      key: 'detail',
      header: 'Kết quả chi tiết',
      render: row => <span className="text-brand-muted font-mono text-[11px]">{row.detail}</span>,
    },
    {
      key: 'ok',
      header: 'Trạng thái',
      align: 'center',
      render: row => (
        <StatusBadge
          label={row.ok ? 'ĐẠT CHUẨN' : 'KHÔNG ĐẠT'}
          variant={row.ok ? 'ok' : 'bad'}
        />
      ),
    },
  ];

  // Store Master Table
  const storeRows = Object.keys(HUB_DATA.stores).map(code => {
    const s = HUB_DATA.stores[code];
    const storeMonths = HUB_DATA.store_month.filter(r => r.store === code);
    const totalNet = storeMonths.reduce((a, b) => a + (b.net || 0), 0);
    return {
      code,
      name: s.name,
      brand: s.brand,
      tier: s.tier,
      open: s.open,
      monthCount: storeMonths.length,
      totalNet,
    };
  }).sort((a, b) => b.totalNet - a.totalNet);

  const storeColumns: Column<typeof storeRows[0]>[] = [
    {
      key: 'code',
      header: 'Mã POS',
      render: row => <span className="font-mono font-bold text-brand-gold">{row.code}</span>,
    },
    {
      key: 'name',
      header: 'Tên cửa hàng (Alias chuẩn)',
      render: row => <span className="font-bold text-brand-text">{row.name}</span>,
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
      key: 'tier',
      header: 'Phân hạng',
      render: row => (
        <span className="rounded bg-brand-dark px-1.5 py-0.5 text-[10px] text-brand-muted border border-brand-border">
          {row.tier}
        </span>
      ),
    },
    {
      key: 'open',
      header: 'Mở từ',
      render: row => <span className="font-mono text-brand-faint text-[10px]">{row.open}</span>,
    },
    {
      key: 'monthCount',
      header: 'Tháng có số',
      align: 'right',
      render: row => <span className="font-mono">{row.monthCount}</span>,
    },
    {
      key: 'totalNet',
      header: 'Net Luỹ Kế',
      align: 'right',
      render: row => <span className="font-mono font-bold text-brand-goldLight">{formatVND(row.totalNet)}</span>,
    },
  ];

  return (
    <div className="space-y-5 p-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div>
        <span className="text-[10px] font-extrabold uppercase tracking-widest text-brand-gold">
          KIỂM SOÁT CHẤT LƯỢNG NGUỒN
        </span>
        <h2 className="text-xl font-extrabold text-brand-text font-display mt-0.5">
          D1 · Kho Dữ Liệu &amp; Kiểm Soát Chất Lượng (QA)
        </h2>
        <p className="text-xs text-brand-muted mt-1">
          Toàn bộ số liệu trên hệ thống được xây dựng và kiểm định qua {qa.length} chốt QA và đối soát ba tầng.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard
          label="Kỳ Dữ Liệu"
          subLabel="Từ FACT_BILL"
          value={`${HUB_DATA.meta.months.length} tháng`}
          customDeltaText={`${formatMonthLabel(HUB_DATA.meta.months[0])} → ${formatMonthLabel(
            HUB_DATA.meta.months[HUB_DATA.meta.months.length - 1]
          )}`}
          variant="hero"
        />
        <MetricCard
          label="Dòng Món Đã Xử Lý"
          subLabel="FACT_ITEM"
          value={formatNumber(HUB_DATA.meta.rows_item)}
          unit="dòng"
        />
        <MetricCard
          label="Hoá Đơn Đã Xử Lý"
          subLabel="FACT_BILL"
          value={formatNumber(HUB_DATA.meta.rows_bill)}
          unit="hoá đơn"
        />
        <MetricCard
          label="Chốt QA Đạt Chuẩn"
          subLabel={`${qa.length} chốt kiểm soát`}
          value={`${passedQA}/${qa.length}`}
          isFlagged={passedQA < qa.length}
          flagMessage={`Còn ${qa.length - passedQA} chốt`}
          variant={passedQA === qa.length ? 'default' : 'warning'}
        />
      </div>

      {/* 9 QA Gates Table */}
      <Card
        title={`${qa.length} Chốt Kiểm Tra Chất Lượng Dữ Liệu (QA Gates)`}
        description="Pipeline dừng xử lý nếu các chốt bắt buộc không đạt yêu cầu"
        chip="QA LOG"
        hero={true}
      >
        <DataTable
          columns={qaColumns}
          data={qa}
          searchable={false}
          pageSize={12}
          exportFilename="Noire_QA_Gates_Audit"
        />
      </Card>

      {/* Row 2: Reconciliation & COGS Coverage */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card
          title="Đối Soát Rollup Hoá Đơn ↔ Báo Cáo Tháng"
          description={`Khớp ${rec.length - badRec}/${rec.length} dòng dữ liệu trong ngưỡng sai số 0,5%`}
          chip="ĐỐI SOÁT"
        >
          <EChartWrapper option={recOption} height={260} />
        </Card>

        <Card
          title="Độ Phủ Giá Vốn (COGS Coverage) Theo Tháng"
          description="Tỷ lệ % doanh thu món có thông tin giá vốn trong bảng BOM chuẩn"
          chip="COGS %"
        >
          <EChartWrapper option={covOption} height={260} />
        </Card>
      </div>

      {/* Store Master Dimension Table */}
      <Card
        title="Bảng Master Cửa Hàng (DIM_STORE)"
        description="Danh sách alias POS đã chuẩn hoá — loại trừ hoàn toàn rủi ro sai lệch tên viết khác nhau"
        chip="DIM_STORE"
      >
        <DataTable
          columns={storeColumns}
          data={storeRows}
          searchPlaceholder="Tìm cửa hàng..."
          searchKeys={['name', 'code', 'brand']}
          pageSize={10}
          exportFilename="Noire_Dim_Store"
        />
      </Card>
    </div>
  );
};
