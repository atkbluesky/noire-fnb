import React from 'react';
import { useFilters } from '../context/FilterContext';
import { HUB_DATA } from '../data';
import { MetricCard } from '../components/common/MetricCard';
import { Card } from '../components/common/Card';
import { DataTable, Column } from '../components/common/DataTable';
import { EChartWrapper } from '../components/charts/EChartWrapper';
import { formatVND, formatNumber, formatPercent } from '../utils/formatters';
import type { EChartsOption } from 'echarts';

export const CapacityView: React.FC = () => {
  const { selectedMonths, inScope } = useFilters();

  const ms = selectedMonths;
  const DP = HUB_DATA.daypart_order || ['Sáng', 'Trưa', 'Xế', 'Tối', 'Khuya'];

  // Daypart aggregation for selected months
  const dpMap: Record<string, { net: number; tc: number; guest: number }> = {};
  DP.forEach(d => {
    dpMap[d] = { net: 0, tc: 0, guest: 0 };
  });

  (HUB_DATA.daypart || []).forEach(r => {
    if (ms.includes(r.month) && dpMap[r.daypart]) {
      dpMap[r.daypart].net += r.net;
      dpMap[r.daypart].tc += r.tc;
      dpMap[r.daypart].guest += r.guest || 0;
    }
  });

  const totalDpNet = DP.reduce((a, d) => a + dpMap[d].net, 0);
  const peakDaypart = DP.reduce((a, b) => (dpMap[a].net > dpMap[b].net ? a : b));

  // Channel aggregation
  const channelMap: Record<string, { net: number; tc: number }> = {};
  (HUB_DATA.channel || []).forEach(r => {
    if (!ms.includes(r.month)) return;
    channelMap[r.channel] = channelMap[r.channel] || { net: 0, tc: 0 };
    channelMap[r.channel].net += r.net;
    channelMap[r.channel].tc += r.tc;
  });

  const sortedChannels = Object.keys(channelMap).sort((a, b) => channelMap[b].net - channelMap[a].net);
  const totalChannelNet = sortedChannels.reduce((a, k) => a + channelMap[k].net, 0);

  // 1. Capacity Heatmap (Day of Week vs Hour In)
  const daysOfWeek = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ Nhật'];
  const hours = Array.from({ length: 18 }, (_, i) => i + 6); // 6h to 23h
  const heatmapData: [number, number, number, number][] = []; // [hourIdx, dayIdx, net, tc]

  let maxHeatNet = 0;
  (HUB_DATA.heat || []).forEach(h => {
    if (h.net > maxHeatNet) maxHeatNet = h.net;
    const hourIdx = hours.indexOf(h.hour_in);
    if (hourIdx >= 0 && h.dow >= 0 && h.dow < 7) {
      heatmapData.push([hourIdx, h.dow, h.net, h.tc]);
    }
  });

  const heatmapOption: EChartsOption = {
    tooltip: {
      position: 'top',
      formatter: (params: any) => {
        const [hIdx, dIdx, net, tc] = params.data || [0, 0, 0, 0];
        return `<div class="text-xs font-mono">
          <div class="font-bold border-b border-brand-border pb-1 mb-1 text-brand-goldLight">
            ${daysOfWeek[dIdx]} · Khung ${hours[hIdx]}:00 - ${hours[hIdx] + 1}:00
          </div>
          <div class="flex items-center justify-between gap-3"><span>Doanh thu:</span> <b class="text-brand-goldLight">${formatVND(net)}</b></div>
          <div class="flex items-center justify-between gap-3"><span>Số hoá đơn:</span> <b>${formatNumber(tc)} HĐ</b></div>
        </div>`;
      },
    },
    grid: { top: 15, right: 20, bottom: 42, left: 65 },
    xAxis: {
      type: 'category',
      data: hours.map(h => `${h}h`),
      axisLine: { lineStyle: { color: '#2A2A33' } },
      axisLabel: { color: '#9E9B93', fontSize: 10 },
    },
    yAxis: {
      type: 'category',
      data: daysOfWeek,
      axisLine: { lineStyle: { color: '#2A2A33' } },
      axisLabel: { fontSize: 11, fontWeight: 'bold' },
    },
    visualMap: {
      dimension: 2,
      min: 0,
      max: maxHeatNet || 250000000,
      calculable: true,
      orient: 'horizontal',
      left: 'center',
      bottom: 0,
      itemWidth: 12,
      itemHeight: 140,
      text: ['Cao (Đông)', 'Thấp (Vắng)'],
      textStyle: { fontSize: 10 },
    },
    series: [
      {
        name: 'Công suất bán',
        type: 'heatmap',
        data: heatmapData,
        label: {
          show: false,
        },
        itemStyle: {
          borderRadius: 3,
          borderWidth: 1.5,
        },
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowColor: 'rgba(197, 160, 89, 0.6)',
            borderColor: '#C5A059',
          },
        },
      },
    ],
  };

  // 2. Daypart Dual-axis Chart
  const daypartOption: EChartsOption = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
      formatter: (params: any) => {
        let res = `<div class="font-bold text-xs mb-1">${params[0]?.axisValue}</div>`;
        params.forEach((item: any) => {
          res += `<div class="flex items-center justify-between gap-4 text-xs py-0.5 font-mono">
            <span>${item.marker} ${item.seriesName}:</span>
            <b>${item.seriesIndex === 0 ? formatVND(item.value) : formatNumber(item.value) + ' HĐ'}</b>
          </div>`;
        });
        return res;
      },
    },
    legend: {
      top: 0,
      textStyle: { color: '#9E9B93', fontSize: 11 },
    },
    grid: { top: 35, right: 45, bottom: 25, left: 60 },
    xAxis: {
      type: 'category',
      data: DP,
      axisLine: { lineStyle: { color: '#2A2A33' } },
      axisLabel: { color: '#F3F2EE', fontSize: 11 },
    },
    yAxis: [
      {
        type: 'value',
        name: 'Doanh thu (VNĐ)',
        nameTextStyle: { color: '#9E9B93', fontSize: 10 },
        axisLabel: {
          formatter: (val: number) => formatVND(val, 0),
          color: '#9E9B93',
          fontSize: 10,
        },
        splitLine: { lineStyle: { color: '#1F1F26', type: 'dashed' } },
      },
      {
        type: 'value',
        name: 'Hoá đơn',
        nameTextStyle: { color: '#9E9B93', fontSize: 10 },
        axisLabel: {
          formatter: (val: number) => formatNumber(val),
          color: '#9E9B93',
          fontSize: 10,
        },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: 'Doanh thu',
        type: 'bar',
        data: DP.map(d => dpMap[d].net),
        itemStyle: { color: '#C5A059', borderRadius: [4, 4, 0, 0] },
        barMaxWidth: 36,
      },
      {
        name: 'Số hoá đơn',
        type: 'line',
        yAxisIndex: 1,
        data: DP.map(d => dpMap[d].tc),
        lineStyle: { color: '#82846C', width: 2.5 },
        itemStyle: { color: '#82846C' },
        symbolSize: 6,
      },
    ],
  };

  // Channels Table Data
  const channelRows = sortedChannels.map(ch => ({
    channel: ch,
    tc: channelMap[ch].tc,
    net: channelMap[ch].net,
    share: totalChannelNet > 0 ? channelMap[ch].net / totalChannelNet : 0,
    aov: channelMap[ch].tc > 0 ? channelMap[ch].net / channelMap[ch].tc : 0,
  }));

  const channelColumns: Column<typeof channelRows[0]>[] = [
    {
      key: 'channel',
      header: 'Kênh bán',
      render: row => <span className="font-bold text-brand-text">{row.channel}</span>,
    },
    {
      key: 'tc',
      header: 'Hoá đơn',
      align: 'right',
      render: row => <span className="font-mono">{formatNumber(row.tc)}</span>,
    },
    {
      key: 'net',
      header: 'Doanh thu',
      align: 'right',
      render: row => <span className="font-mono font-bold text-brand-goldLight">{formatVND(row.net)}</span>,
    },
    {
      key: 'share',
      header: 'Tỷ trọng',
      align: 'right',
      render: row => <span className="font-mono">{formatPercent(row.share)}</span>,
    },
    {
      key: 'aov',
      header: 'AOV',
      align: 'right',
      render: row => <span className="font-mono">{formatNumber(Math.round(row.aov))} đ</span>,
    },
  ];

  // Staff Table Data
  const staffRows = (HUB_DATA.staff || [])
    .filter(s => inScope(s.store))
    .slice(0, 12)
    .map(s => ({
      ...s,
      storeName: HUB_DATA.stores[s.store]?.name || s.store,
    }));

  /* ── Thời gian ngồi bàn theo cửa hàng (khoá dwell_store) ─────────── */
  const dwellRows = (HUB_DATA.dwell_store || [])
    .filter(d => inScope(d.store) && d.dwell != null)
    .map(d => ({ ...d, storeName: HUB_DATA.stores[d.store]?.name || d.store }))
    .sort((a, b) => (b.dwell ?? 0) - (a.dwell ?? 0));

  const chainMean = HUB_DATA.dwell?.mean ?? 0;
  const dwellOption: EChartsOption = {
    grid: { top: 28, right: 46, bottom: 24, left: 110 },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (p: any) => {
        const r = dwellRows[p[0].dataIndex];
        const gap = (r.dwell ?? 0) - chainMean;
        return `<b>${r.storeName}</b><br/>Ngồi TB: ${r.dwell} phút`
          + `<br/>So chuỗi: ${gap > 0 ? '+' : ''}${gap.toFixed(0)} phút`;
      },
    },
    xAxis: {
      type: 'value',
      name: 'Phút',
      nameTextStyle: { fontSize: 10 },
      axisLabel: { fontSize: 10 },
    },
    yAxis: {
      type: 'category',
      inverse: true,
      data: dwellRows.map(d => d.storeName),
      axisLabel: { fontSize: 10 },
    },
    series: [{
      type: 'bar',
      barMaxWidth: 18,
      data: dwellRows.map(d => ({
        value: d.dwell,
        // Trên trung bình chuỗi = ngồi lâu hơn = vòng quay chậm hơn → tô cảnh báo
        itemStyle: { color: (d.dwell ?? 0) > chainMean ? '#B07A2B' : '#82846C' },
      })),
      markLine: {
        silent: true,
        symbol: 'none',
        lineStyle: { color: '#B0834B', type: 'dashed', width: 1 },
        label: { formatter: `TB chuỗi ${chainMean}′`, fontSize: 9, color: '#B0834B' },
        data: [{ xAxis: chainMean }],
      },
      label: {
        show: true, position: 'right', fontSize: 10, fontWeight: 'bold',
        formatter: (p: any) => `${p.value}′`,
      },
    }],
  };

  /* ── Phương thức thanh toán (khoá payment) ───────────────────────── */
  const payTotal = (HUB_DATA.payment || []).reduce((a, p) => a + p.net, 0);
  const payRows = (HUB_DATA.payment || []).map(p => ({
    ...p,
    share: payTotal > 0 ? p.net / payTotal : 0,
    aov: p.tc > 0 ? p.net / p.tc : null,
  }));

  const payColumns: Column<typeof payRows[0]>[] = [
    {
      key: 'pttt', header: 'Phương thức',
      render: r => <span className="font-semibold text-brand-text">{r.pttt || '(không rõ)'}</span>,
    },
    {
      key: 'net', header: 'Doanh thu', align: 'right', sortable: true,
      render: r => <span className="font-mono text-brand-goldLight">{formatVND(r.net)}</span>,
    },
    {
      key: 'share', header: 'Tỷ trọng', align: 'right', sortable: true,
      render: r => <span className="font-mono">{formatPercent(r.share)}</span>,
    },
    {
      key: 'tc', header: 'Hoá đơn', align: 'right', sortable: true,
      render: r => <span className="font-mono text-brand-muted">{formatNumber(r.tc)}</span>,
    },
    {
      key: 'aov', header: 'AOV', align: 'right', sortable: true,
      render: r => <span className="font-mono">{r.aov != null ? formatVND(r.aov) : '—'}</span>,
    },
  ];

  const staffColumns: Column<typeof staffRows[0]>[] = [
    {
      key: 'name',
      header: 'Nhân viên',
      render: row => <span className="font-semibold text-brand-text">{row.name}</span>,
    },
    {
      key: 'storeName',
      header: 'Cửa hàng',
      render: row => <span className="text-brand-muted text-[11px]">{row.storeName}</span>,
    },
    {
      key: 'tc',
      header: 'Hoá đơn',
      align: 'right',
      render: row => <span className="font-mono">{formatNumber(row.tc)}</span>,
    },
    {
      key: 'net',
      header: 'Doanh thu',
      align: 'right',
      render: row => <span className="font-mono font-bold text-brand-goldLight">{formatVND(row.net)}</span>,
    },
    {
      key: 'aov',
      header: 'AOV TB',
      align: 'right',
      render: row => <span className="font-mono">{formatNumber(Math.round(row.aov))} đ</span>,
    },
  ];

  // Zones Table Data
  const zoneRows = (HUB_DATA.zone || [])
    .filter(z => inScope(z.store))
    .slice(0, 14)
    .map(z => ({
      ...z,
      storeName: HUB_DATA.stores[z.store]?.name || z.store,
    }));

  const zoneColumns: Column<typeof zoneRows[0]>[] = [
    {
      key: 'zone',
      header: 'Khu vực bàn',
      render: row => (
        <div>
          <span className="font-bold text-brand-text">{row.zone}</span>
          <span className="ml-2 text-[10px] text-brand-muted font-mono">{row.storeName}</span>
        </div>
      ),
    },
    {
      key: 'tc',
      header: 'Hoá đơn',
      align: 'right',
      render: row => <span className="font-mono">{formatNumber(row.tc)}</span>,
    },
    {
      key: 'net',
      header: 'Doanh thu',
      align: 'right',
      render: row => <span className="font-mono font-bold text-brand-goldLight">{formatVND(row.net)}</span>,
    },
  ];

  return (
    <div className="space-y-5 p-4 sm:p-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div>
        <span className="text-[10px] font-extrabold uppercase tracking-widest text-brand-gold">
          BÁN LÚC NÀO, Ở ĐÂU, QUA KÊNH NÀO
        </span>
        <h2 className="text-xl font-extrabold text-brand-text font-display mt-0.5">
          M3 · Công Suất &amp; Kênh Bán
        </h2>
        <p className="text-xs text-brand-muted mt-1">
          F&amp;B bán công suất theo thời gian — chỗ ngồi trống lúc 15h không thể bán lại vào lúc 19h.
        </p>
      </div>

      {/* Dwell time note */}
      <div className="rounded-xl border border-brand-border bg-brand-surface p-4 text-xs text-brand-muted">
        <b>Thời gian ngồi bàn (Dwell Time):</b> Trung bình <b>{HUB_DATA.dwell?.mean} phút</b> (trung vị{' '}
        {HUB_DATA.dwell?.median} phút) tính trên {formatNumber(HUB_DATA.dwell?.n)} hoá đơn có đủ giờ vào / giờ ra.
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard
          label="Khung Giờ Mạnh Nhất"
          subLabel="Theo Net Sales"
          value={peakDaypart}
          customDeltaText={`${formatPercent(Math.max(...DP.map(d => dpMap[d].net)) / totalDpNet)} tổng doanh thu`}
          variant="hero"
        />
        <MetricCard
          label="Thời Gian Ngồi TB"
          subLabel="Giờ ra − Giờ vào"
          value={HUB_DATA.dwell?.mean || 0}
          unit="phút"
          customDeltaText={`Trung vị: ${HUB_DATA.dwell?.median || 0} phút`}
        />
        <MetricCard
          label="Kênh Tại Chỗ (Dine-in)"
          subLabel="Net tại chỗ ÷ Tổng"
          value={formatPercent((channelMap['TẠI CHỖ']?.net || 0) / totalChannelNet)}
          customDeltaText={`${formatNumber(channelMap['TẠI CHỖ']?.tc || 0)} hoá đơn`}
        />
        <MetricCard
          label="Vòng Quay Bàn"
          subLabel="Bill ÷ Bàn ÷ Ngày"
          value="—"
          isFlagged={true}
          flagMessage="Thiếu số ghế"
          variant="warning"
        />
      </div>

      {/* Row 1: Capacity Heatmap */}
      <Card
        title="Bản Đồ Nhiệt Công Suất: Thứ Trong Tuần × Giờ Vào"
        description="Ô đậm màu = doanh thu cao tập trung. Vùng nhạt kéo dài là công suất chưa được khai thác tối ưu."
        chip="HEATMAP 7x18"
        hero={true}
      >
        <EChartWrapper option={heatmapOption} height={280} />
      </Card>

      {/* Row 2: Daypart Breakdown & Sales Channels */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card
          title="Doanh Thu & Hoá Đơn Theo Khung Giờ (Daypart)"
          description="Cột thể hiện Doanh thu (trục trái), đường thể hiện Số lượng hoá đơn (trục phải)"
          chip="KHUNG GIỜ"
        >
          <EChartWrapper option={daypartOption} height={260} />
        </Card>

        <Card
          title="Cơ Cấu Kênh Bán Hàng"
          description="Doanh thu, số lượng hoá đơn và giá trị đơn hàng trung bình (AOV) từng kênh"
          chip="CHANNELS"
        >
          <DataTable
            columns={channelColumns}
            data={channelRows}
            searchable={false}
            pageSize={6}
            exportFilename="Noire_Sales_Channels"
          />
        </Card>
      </div>

      {/* Row 3: Staff & Zones Performance */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card
          title="Hiệu Suất Khu Vực Bàn (Top 14)"
          description="Doanh thu và lượt khách theo khu vực phục vụ"
          chip="ZONES"
        >
          <DataTable
            columns={zoneColumns}
            data={zoneRows}
            searchPlaceholder="Tìm khu vực..."
            pageSize={7}
            exportFilename="Noire_Zone_Performance"
          />
        </Card>

        <Card
          title="Năng Suất Nhân Viên Bán Hàng (Top 12)"
          description="Doanh thu và AOV nhân viên phụ trách bill"
          chip="STAFF"
        >
          <DataTable
            columns={staffColumns}
            data={staffRows}
            searchPlaceholder="Tìm nhân viên..."
            pageSize={7}
            exportFilename="Noire_Staff_Performance"
          />
        </Card>
      </div>

      {/* Row 4: Thời gian ngồi bàn theo cửa hàng & Phương thức thanh toán */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {dwellRows.length > 0 && (
          <Card
            title="Thời Gian Ngồi Bàn Theo Cửa Hàng"
            description="Ngồi lâu chưa chắc tốt: cùng số bàn, ngồi lâu hơn nghĩa là vòng quay thấp hơn. Đọc cùng doanh thu để biết đổi thời gian lấy được bao nhiêu."
            chip={`TB CHUỖI ${HUB_DATA.dwell?.mean ?? '—'} PHÚT`}
          >
            <EChartWrapper option={dwellOption} height={Math.max(200, dwellRows.length * 26)} />
          </Card>
        )}

        {payRows.length > 0 && (
          <Card
            title="Cơ Cấu Phương Thức Thanh Toán"
            description="AOV theo từng phương thức — chênh lệch lớn cho biết nhóm khách khác nhau, không chỉ là thói quen trả tiền."
            chip={`${payRows.length} PHƯƠNG THỨC`}
          >
            <DataTable
              columns={payColumns}
              data={payRows}
              searchable={false}
              pageSize={7}
              exportFilename="Noire_Payment_Methods"
            />
          </Card>
        )}
      </div>
    </div>
  );
};
