import React from 'react';
import { useFilters } from '../context/FilterContext';
import { MKT_DATA } from '../data';
import { MetricCard } from '../components/common/MetricCard';
import { Card } from '../components/common/Card';
import { StatusBadge } from '../components/common/StatusBadge';
import { DataTable, Column } from '../components/common/DataTable';
import { EChartWrapper } from '../components/charts/EChartWrapper';
import { formatVND, formatNumber, formatPercent } from '../utils/formatters';
import type { EChartsOption } from 'echarts';

export const PartnershipView: React.FC = () => {
  const { filters, selectedMonths, theme } = useFilters();
  const isDark = theme === 'dark';

  const PT = (MKT_DATA.partners || []).filter(p =>
    filters.brand === 'ALL' || !p.brand || p.brand === 'TẤT CẢ' || p.brand.includes(filters.brand)
  );

  const VP = (MKT_DATA.voucher_prog || []).filter(v =>
    filters.brand === 'ALL' || v.brand === filters.brand || v.brand === 'Nhiều brand'
  );

  const runningPartners = PT.filter(p => /đang chạy/i.test(p.status));
  const totalMedia = PT.reduce((a, b) => a + (b.media || 0), 0);
  const totalIssued = PT.reduce((a, b) => a + (b.issued || 0), 0);
  const totalUsed = PT.reduce((a, b) => a + (b.used || 0), 0);
  const overallUseRate = totalIssued > 0 ? totalUsed / totalIssued : null;

  // 1. Voucher Program Usage Bar Chart
  const topVP = VP.slice(0, 10);
  /* ── Bản đồ mã CTKM ↔ Campaign ID iPOS (khoá partner_camp) ───────── */
  const campRows = (MKT_DATA.partner_camp || []).map((c: any) => ({
    ...c,
    partnerName: (MKT_DATA.partners || []).find(p => p.code === c.code)?.name ?? '—',
  }));

  /* ── Kết quả đối tác THEO THÁNG ──────────────────────────────────────
     Sheet `partners` giữ con số LUỸ KẾ cả chương trình; bảng dưới đây là lát
     cắt từng tháng, nên thanh lọc Từ–Đến mới có tác dụng thật với khối này.
     Ô trống = chưa đo được (file eVoucher chỉ có danh sách mã đã phát,
     không có lượt dùng) — cố ý KHÔNG điền 0. */
  const PM = (MKT_DATA.partner_month || [])
    .filter(r => selectedMonths.includes(r.month))
    .map(r => ({ ...r, name: (MKT_DATA.partners || []).find(p => p.code === r.code)?.name ?? r.code }));

  const pmColumns: Column<(typeof PM)[0]>[] = [
    { key: 'name', header: 'Đối tác', render: r => <span className="font-bold text-brand-text">{r.name}</span> },
    { key: 'month', header: 'Tháng', render: r => <span className="font-mono text-xs">{r.month}</span> },
    { key: 'issued', header: 'Mã đã phát', align: 'right', render: r => <span className="font-mono">{r.issued === null ? '—' : formatNumber(r.issued)}</span> },
    { key: 'used', header: 'Đã dùng', align: 'right', render: r => <span className="font-mono">{r.used === null ? '—' : formatNumber(r.used)}</span> },
    {
      key: 'use_rate', header: 'Tỷ lệ dùng', align: 'right',
      render: r => r.use_rate === null
        ? <span className="font-mono text-brand-muted">—</span>
        : <StatusBadge variant={r.use_rate < 0.05 ? 'bad' : r.use_rate < 0.2 ? 'warning' : 'ok'} label={formatPercent(r.use_rate)} />,
    },
    { key: 'rev', header: 'Doanh thu', align: 'right', render: r => <span className="font-mono">{r.rev === null ? '—' : formatVND(r.rev)}</span> },
  ];

  const campColumns: Column<typeof campRows[0]>[] = [
    {
      key: 'partnerName', header: 'Đối tác',
      render: r => (
        <div>
          <div className="font-semibold text-brand-text">{r.partnerName}</div>
          <div className="font-mono text-[10px] text-brand-faint">{r.code}</div>
        </div>
      ),
    },
    {
      key: 'name', header: 'Tên CTKM trên bảng kê',
      render: r => <span className="text-brand-muted text-[11px]">{r.name}</span>,
    },
    {
      key: 'cid', header: 'Campaign ID iPOS', align: 'center',
      render: r => r.cid && r.cid !== 'nan'
        ? <span className="rounded border border-brand-border bg-brand-surface px-1.5 py-0.5 font-mono text-[10px] text-brand-goldLight">{r.cid}</span>
        : <span className="text-brand-faint">—</span>,
    },
    {
      key: 'mech', header: 'Cơ chế',
      render: r => <span className="text-[11px]">{r.mech || '—'}</span>,
    },
    {
      key: 'rate', header: 'Mức giảm', align: 'right', sortable: true,
      render: r => <span className="font-mono">{r.rate ? formatPercent(r.rate) : '—'}</span>,
    },
  ];

  const vpOption: EChartsOption = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: any) => {
        let res = `<div class="font-bold text-xs mb-1 border-b border-brand-border pb-1">${params[0]?.axisValue}</div>`;
        params.forEach((item: any) => {
          res += `<div class="flex items-center justify-between gap-4 text-xs py-0.5 font-mono">
            <span>${item.marker} ${item.seriesName}:</span>
            <b>${formatNumber(item.value)} mã</b>
          </div>`;
        });
        return res;
      },
    },
    legend: {
      top: 0,
      textStyle: { color: '#9E9B93', fontSize: 11 },
    },
    grid: { top: 35, right: 25, bottom: 25, left: 160 },
    xAxis: {
      type: 'value',
      axisLabel: {
        formatter: (val: number) => formatNumber(val),
        color: '#9E9B93',
        fontSize: 10,
      },
      splitLine: { lineStyle: { color: '#1F1F26', type: 'dashed' } },
    },
    yAxis: {
      type: 'category',
      data: topVP.map(v => v.prog.length > 22 ? v.prog.slice(0, 20) + '...' : v.prog),
      axisLine: { lineStyle: { color: '#2A2A33' } },
      axisLabel: { color: isDark ? '#F3F2EE' : '#18181B', fontSize: 10 },
    },
    series: [
      {
        name: 'Đã sử dụng',
        type: 'bar',
        stack: 'vouchers',
        data: topVP.map(v => v.used),
        itemStyle: { color: '#22C55E' },
        barMaxWidth: 16,
      },
      {
        name: 'Chưa sử dụng',
        type: 'bar',
        stack: 'vouchers',
        data: topVP.map(v => v.issued - v.used),
        itemStyle: { color: '#82846C' },
        barMaxWidth: 16,
      },
    ],
  };

  // Columns for Partner Table
  const partnerColumns: Column<typeof PT[0]>[] = [
    {
      key: 'code',
      header: 'Mã',
      render: row => <span className="font-mono text-brand-gold font-bold text-[10px]">{row.code}</span>,
    },
    {
      key: 'name',
      header: 'Đối tác',
      render: row => <span className="font-bold text-brand-text">{row.name}</span>,
    },
    {
      key: 'kind',
      header: 'Loại',
      render: row => (
        <span className="rounded bg-brand-dark/60 px-1.5 py-0.5 text-[10px] text-brand-sand border border-brand-border font-medium">
          {row.kind}
        </span>
      ),
    },
    {
      key: 'brand',
      header: 'Brand',
      render: row => <span className="text-brand-muted text-[11px]">{row.brand}</span>,
    },
    {
      key: 'period',
      header: 'Kỳ áp dụng',
      render: row => <span className="font-mono text-[10px] text-brand-faint">{row.start} → {row.end}</span>,
    },
    {
      key: 'status',
      header: 'Trạng thái',
      render: row => (
        <StatusBadge
          label={row.status}
          variant={/đang chạy/i.test(row.status) ? 'ok' : /chuẩn bị/i.test(row.status) ? 'warning' : 'neutral'}
        />
      ),
    },
    {
      key: 'media',
      header: 'Media quy đổi',
      align: 'right',
      render: row => <span className="font-mono">{row.media ? formatVND(row.media) : '—'}</span>,
    },
    {
      key: 'issued',
      header: 'Mã phát',
      align: 'right',
      render: row => <span className="font-mono">{row.issued ? formatNumber(row.issued) : '—'}</span>,
    },
    {
      key: 'used',
      header: 'Đã dùng',
      align: 'right',
      render: row => <span className="font-mono font-bold text-status-ok">{row.used ? formatNumber(row.used) : '—'}</span>,
    },
    {
      key: 'use_rate',
      header: 'Tỷ lệ',
      align: 'right',
      render: row => (
        <span className="font-mono font-bold">
          {row.use_rate != null ? formatPercent(row.use_rate) : '—'}
        </span>
      ),
    },
    {
      key: 'rev',
      header: 'Doanh thu phát sinh',
      align: 'right',
      render: row => <span className="font-mono font-bold text-brand-goldLight">{row.rev ? formatVND(row.rev) : '—'}</span>,
    },
  ];

  return (
    <div className="space-y-5 p-4 sm:p-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div>
        <span className="text-[10px] font-extrabold uppercase tracking-widest text-brand-gold">
          ĐỐI TÁC MANG LẠI GÌ
        </span>
        <h2 className="text-xl font-extrabold text-brand-text font-display mt-0.5">
          M10 · Hợp Tác Đối Tác &amp; Kênh Voucher
        </h2>
        <p className="text-xs text-brand-muted mt-1">
          Theo dõi {PT.length} đối tác chiến lược và tỷ lệ quy đổi doanh thu từ các chương trình phát mã ưu đãi.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard
          label="Đối Tác Danh Mục"
          subLabel="Đếm dòng hợp tác"
          value={PT.length}
          customDeltaText={`${runningPartners.length} đang chạy · ${PT.length - runningPartners.length} chuẩn bị / đã dừng`}
          variant="hero"
        />
        <MetricCard
          label="Giá Trị Media Quy Đổi"
          subLabel="Σ Theo cam kết đối tác"
          value={formatVND(totalMedia)}
        />
        <MetricCard
          label="Tổng Mã Voucher Phát"
          subLabel="Kho mã đối tác cấp"
          value={formatNumber(totalIssued)}
          unit="mã"
          customDeltaText={`Đã dùng ${formatNumber(totalUsed)} mã`}
        />
        <MetricCard
          label="Tỷ Lệ Sử Dụng Mã"
          subLabel="Đã dùng ÷ Đã phát"
          value={overallUseRate != null ? formatPercent(overallUseRate) : '—'}
          isFlagged={overallUseRate != null && overallUseRate < 0.2}
          flagMessage="Phân phối thấp"
          variant="warning"
        />
      </div>

      {/* Partners Table */}
      <Card
        title="Danh Mục Hợp Tác Đối Tác Chiến Lược"
        description="Theo dõi toàn diện đối tác đang chạy, đang chuẩn bị và đã dừng để không khoản hợp tác nào bị bỏ quên"
        chip="PARTNERSHIP PORTFOLIO"
        hero={true}
      >
        <DataTable
          columns={partnerColumns}
          data={PT}
          searchPlaceholder="Tìm đối tác..."
          searchKeys={['name', 'code', 'kind', 'brand']}
          pageSize={6}
          exportFilename="Noire_Partnerships"
        />
      </Card>

      {/* Voucher Program Utilization Chart */}
      <Card
        title="Tỷ Lệ Sử Dụng Kho Mã Theo Từng Chương Trình"
        description="Kho mã lớn mà tỷ lệ dùng thấp là tín hiệu kênh phân phối mã voucher chưa tiếp cận đúng tệp khách"
        chip="VOUCHER USAGE"
      >
        <EChartWrapper option={vpOption} height={280} />
      </Card>

      {/* Bản đồ mã CTKM — giải thích kết quả của mỗi đối tác đến từ đâu */}
      {campRows.length > 0 && (
        <Card
          title="Bản Đồ Mã CTKM ↔ Campaign ID iPOS"
          description="Cầu nối truy vết: kết quả voucher của mỗi đối tác được gắn qua đúng Campaign ID này. Đây là lý do attribution qua voucher đo được, khác với attribution quảng cáo."
          chip={`${campRows.length} CHƯƠNG TRÌNH`}
        >
          <DataTable
            columns={campColumns}
            data={campRows}
            searchable
            searchPlaceholder="Tìm chương trình hoặc mã đối tác..."
            searchKeys={['name', 'code', 'partnerName']}
            pageSize={8}
            exportFilename="Noire_Partner_Campaign_Map"
          />
        </Card>
      )}

      {/* Kết quả đối tác theo tháng */}
      {PM.length > 0 && (
        <Card
          title="Kết Quả Đối Tác Theo Tháng"
          description="Lát cắt từng tháng — ô trống nghĩa là chưa đo được, không phải bằng không"
          chip="PARTNER × THÁNG"
        >
          <DataTable
            columns={pmColumns}
            data={PM}
            searchable={false}
            pageSize={8}
            exportFilename="Noire_Partner_Month"
          />
        </Card>
      )}
    </div>
  );
};
