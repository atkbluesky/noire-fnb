import React from 'react';
import { useFilters } from '../context/FilterContext';
import { HUB_DATA } from '../data';
import { MetricCard } from '../components/common/MetricCard';
import { Card } from '../components/common/Card';
import { DataTable, Column } from '../components/common/DataTable';
import { EChartWrapper } from '../components/charts/EChartWrapper';
import { formatVND, formatNumber, formatPercent, formatMonthLabel } from '../utils/formatters';
import type { EChartsOption } from 'echarts';

export const BookingView: React.FC = () => {
  const { selectedMonths, theme } = useFilters();
  const isDark = theme === 'dark';

  const ms = selectedMonths;
  const LM = (HUB_DATA.lead_month || []).filter(x => ms.includes(x.m));

  /* lead_source · lead_type nay có chiều THÁNG (sinh từ sheet booking), nên phải
     lọc rồi gộp lại — bản trước hiện số của cả năm bên cạnh biểu đồ đã lọc tháng. */
  const rollup = <T extends { month?: string | null; leads: number; exp: number }>(
    rows: T[], key: keyof T,
  ) => {
    const m = new Map<string, T & { leads: number; exp: number }>();
    for (const r of rows) {
      if (r.month && !ms.includes(r.month)) continue;
      const k = String(r[key] ?? '').trim();
      if (!k || k === 'nan') continue;
      const o = m.get(k) ?? ({ ...r, [key]: k, leads: 0, exp: 0 } as T & { leads: number; exp: number });
      o.leads += r.leads; o.exp += r.exp;
      m.set(k, o);
    }
    return [...m.values()].sort((a, b) => b.leads - a.leads);
  };

  const LS = rollup(HUB_DATA.lead_source || [], 'src');
  const LT = rollup(HUB_DATA.lead_type || [], 'etype');

  /* ── Phễu booking: chỉ `Confirmed` mới là chốt ──────────────────────────
     `Tentative` nghe như sắp chốt nhưng thực tế vẫn rơi; gộp vào sẽ thổi
     phồng tỷ lệ thắng và làm dự báo doanh thu tiệc lạc quan giả. */
  const BK = (HUB_DATA.booking || []).filter(b => ms.includes(b.month));
  const sumBy = (rows: typeof BK, k: 'leads' | 'exp' | 'closed' | 'guests') =>
    rows.reduce((a, b) => a + (b[k] || 0), 0);
  const won = BK.filter(b => /confirmed/i.test(b.status || ''));
  const openBk = BK.filter(b => /pending|tentative/i.test(b.status || ''));
  const lostBk = BK.filter(b => /lost/i.test(b.status || ''));
  const bkLeads = sumBy(BK, 'leads');
  const wonLeads = sumBy(won, 'leads');
  const winRate = bkLeads > 0 ? wonLeads / bkLeads : null;
  const closedRev = sumBy(won, 'closed');
  const pipeline = sumBy(openBk, 'exp');

  const totalLeads = LM.reduce((a, b) => a + b.leads, 0);
  const totalExpRev = LM.reduce((a, b) => a + b.exp, 0);

  const mktSource = LS.find(s => /mkt/i.test(s.src)) || { leads: 0, exp: 0 };
  const avgRevPerLead = totalLeads > 0 ? totalExpRev / totalLeads : 0;
  const avgMktLeadRev = mktSource.leads > 0 ? mktSource.exp / mktSource.leads : 0;

  const statusRows = [
    { label: 'Confirmed — đã chốt', n: wonLeads, exp: sumBy(won, 'exp'), closed: closedRev },
    { label: 'Pending / Tentative — còn treo', n: sumBy(openBk, 'leads'), exp: pipeline, closed: 0 },
    { label: 'Lost — đã mất', n: sumBy(lostBk, 'leads'), exp: sumBy(lostBk, 'exp'), closed: 0 },
  ].filter(r => r.n > 0);

  // 1. Monthly Lead Trend & Expected Revenue (Dual axis)
  const leadMonthOption: EChartsOption = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
      formatter: (params: any) => {
        let res = `<div class="font-bold text-xs mb-1">${params[0]?.axisValue}</div>`;
        params.forEach((item: any) => {
          res += `<div class="flex items-center justify-between gap-4 text-xs py-0.5 font-mono">
            <span>${item.marker} ${item.seriesName}:</span>
            <b>${item.seriesIndex === 0 ? formatNumber(item.value) + ' lead' : formatVND(item.value)}</b>
          </div>`;
        });
        return res;
      },
    },
    legend: {
      top: 0,
      textStyle: { color: '#9E9B93', fontSize: 11 },
    },
    grid: { top: 35, right: 55, bottom: 25, left: 55 },
    xAxis: {
      type: 'category',
      data: LM.map(x => formatMonthLabel(x.m)),
      axisLine: { lineStyle: { color: '#2A2A33' } },
      axisLabel: { color: isDark ? '#F3F2EE' : '#18181B', fontSize: 11 },
    },
    yAxis: [
      {
        type: 'value',
        name: 'Số Lead Tiệc',
        nameTextStyle: { color: '#9E9B93', fontSize: 10 },
        axisLabel: {
          formatter: (val: number) => formatNumber(val),
          color: '#9E9B93',
          fontSize: 10,
        },
        splitLine: { lineStyle: { color: '#1F1F26', type: 'dashed' } },
      },
      {
        type: 'value',
        name: 'Doanh Thu Kỳ Vọng',
        nameTextStyle: { color: '#9E9B93', fontSize: 10 },
        axisLabel: {
          formatter: (val: number) => formatVND(val, 0),
          color: '#9E9B93',
          fontSize: 10,
        },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: 'Số Lead',
        type: 'bar',
        data: LM.map(x => x.leads),
        itemStyle: { color: '#82846C', borderRadius: [4, 4, 0, 0] },
        barMaxWidth: 32,
      },
      {
        name: 'Doanh thu kỳ vọng',
        type: 'line',
        yAxisIndex: 1,
        data: LM.map(x => x.exp),
        lineStyle: { color: '#C5A059', width: 2.5 },
        itemStyle: { color: '#C5A059' },
        symbolSize: 6,
      },
    ],
  };

  // 2. Lead Source Donut Chart
  const sourceColors = ['#C5A059', '#82846C', '#AE8966', '#DFBF7A', '#9E9B93'];
  const leadSourceOption: EChartsOption = {
    tooltip: {
      trigger: 'item',
      formatter: (params: any) => {
        return `<div class="text-xs">
          <b>${params.name}</b>: ${formatNumber(params.value)} lead (${params.percent}%)
        </div>`;
      },
    },
    legend: {
      bottom: 0,
      textStyle: { color: '#9E9B93', fontSize: 10 },
    },
    series: [
      {
        name: 'Nguồn Lead',
        type: 'pie',
        radius: ['48%', '74%'],
        center: ['50%', '45%'],
        itemStyle: { borderRadius: 4, borderColor: isDark ? '#141417' : '#FFFFFF', borderWidth: 2 },
        label: { show: false },
        data: LS.map((s, idx) => ({
          name: s.src,
          value: s.leads,
          itemStyle: { color: sourceColors[idx % sourceColors.length] },
        })),
      },
    ],
  };

  // 3. Event Type Horizontal Bar Chart
  const leadTypeOption: EChartsOption = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: any) => {
        const item = params[0];
        const t = LT[item?.dataIndex];
        return `<div class="text-xs">
          <b>${item?.axisValue}</b><br/>
          Số lead: ${formatNumber(item?.value)}<br/>
          Doanh thu kỳ vọng: ${formatVND(t?.exp)}
        </div>`;
      },
    },
    grid: { top: 15, right: 25, bottom: 25, left: 140 },
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
      data: LT.map(x => String(x.etype).length > 20 ? String(x.etype).slice(0, 18) + '...' : String(x.etype)),
      axisLine: { lineStyle: { color: '#2A2A33' } },
      axisLabel: { color: isDark ? '#F3F2EE' : '#18181B', fontSize: 10 },
    },
    series: [
      {
        name: 'Số Lead',
        type: 'bar',
        data: LT.map(x => x.leads),
        itemStyle: { color: '#C5A059', borderRadius: [0, 4, 4, 0] },
        barMaxWidth: 16,
      },
    ],
  };

  // Columns for Lead Source Table
  const sourceColumns: Column<typeof LS[0]>[] = [
    {
      key: 'src',
      header: 'Nguồn Lead',
      render: row => <span className="font-bold text-brand-text">{row.src}</span>,
    },
    {
      key: 'leads',
      header: 'Số Lead',
      align: 'right',
      render: row => <span className="font-mono">{formatNumber(row.leads)}</span>,
    },
    {
      key: 'share',
      header: 'Tỷ trọng Lead',
      align: 'right',
      render: row => (
        <span className="font-mono">
          {totalLeads > 0 ? formatPercent(row.leads / totalLeads) : '—'}
        </span>
      ),
    },
    {
      key: 'exp',
      header: 'Doanh thu kỳ vọng',
      align: 'right',
      render: row => <span className="font-mono font-bold text-brand-goldLight">{formatVND(row.exp)}</span>,
    },
    {
      key: 'avgLead',
      header: 'TB / Lead',
      align: 'right',
      render: row => (
        <span className="font-mono">
          {row.leads > 0 ? formatVND(row.exp / row.leads) : '—'}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-5 p-4 sm:p-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div>
        <span className="text-[10px] font-extrabold uppercase tracking-widest text-brand-gold">
          MẢNG TIỆC RA SAO
        </span>
        <h2 className="text-xl font-extrabold text-brand-text font-display mt-0.5">
          M11 · Booking &amp; Tiệc Sự Kiện
        </h2>
        <p className="text-xs text-brand-muted mt-1">
          Nguồn duy nhất trong hệ thống cho phép trực tiếp quy kết doanh thu về Marketing nhờ trường thông tin Source.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard
          label="Tổng Lead Tiệc"
          subLabel={`Σ Inquiry ${ms.length} tháng`}
          value={formatNumber(totalLeads)}
          unit="lead"
          variant="hero"
        />
        <MetricCard
          label="Doanh Thu Kỳ Vọng"
          subLabel="Σ Expected Revenue"
          value={formatVND(totalExpRev)}
          customDeltaText={`TB ${formatVND(avgRevPerLead)}/lead`}
        />
        <MetricCard
          label="Lead Từ Marketing"
          subLabel="Source = MKT"
          value={formatNumber(mktSource.leads)}
          unit="lead"
          customDeltaText={`${totalLeads > 0 ? formatPercent(mktSource.leads / totalLeads) : '—'} số lead · ${formatVND(mktSource.exp)}`}
        />
        <MetricCard
          label="Giá Trị TB Lead MKT"
          subLabel="Exp ÷ Leads MKT"
          value={formatVND(avgMktLeadRev)}
          unit="/lead"
          customDeltaText={`So với TB toàn chuỗi: ${formatVND(avgRevPerLead)}`}
        />
      </div>

      {/* Phễu chốt tiệc */}
      {bkLeads > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MetricCard
            label="Lead Trong Kỳ"
            subLabel="Theo tháng DIỄN RA sự kiện"
            value={formatNumber(bkLeads)}
            unit="lead"
          />
          <MetricCard
            label="Đã Chốt"
            subLabel="Status = Confirmed"
            value={formatNumber(wonLeads)}
            unit="lead"
            customDeltaText={`Tỷ lệ chốt ${winRate === null ? '—' : formatPercent(winRate)}`}
          />
          <MetricCard
            label="Doanh Thu Đã Chốt"
            subLabel="Closed Revenue"
            value={formatVND(closedRev)}
            customDeltaText={
              sumBy(won, 'exp') > 0
                ? `${formatPercent(closedRev / sumBy(won, 'exp'))} so với kỳ vọng của nhóm đã chốt`
                : 'chưa điền Closed Revenue'
            }
          />
          <MetricCard
            label="Pipeline Còn Treo"
            subLabel="Pending + Tentative"
            value={formatVND(pipeline)}
            customDeltaText={`${formatNumber(sumBy(openBk, 'leads'))} lead chưa có kết luận`}
          />
        </div>
      )}

      {/* Row 1: Monthly Lead Trend & Source Donut */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card
          title="Lead Tiệc & Doanh Thu Kỳ Vọng Theo Tháng"
          description="Cột số lượng lead (trục trái) và đường Doanh thu kỳ vọng (trục phải)"
          chip="FACT_LEAD"
          hero={true}
          className="lg:col-span-2"
        >
          <EChartWrapper option={leadMonthOption} height={280} />
        </Card>

        <Card
          title="Cơ Cấu Nguồn Lead (Source)"
          description="Tỷ trọng số lượng lead theo từng kênh tiếp cận"
          chip="NGUỒN LEAD"
        >
          <EChartWrapper option={leadSourceOption} height={280} />
        </Card>
      </div>

      {/* Row 2: Event Type & Source Table */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card
          title="Phân Loại Theo Loại Sự Kiện (Event Type)"
          description="Số lượng inquiry theo loại hình tiệc (Tiệc công ty, Sinh nhật, v.v.)"
          chip="EVENT TYPE"
        >
          <EChartWrapper option={leadTypeOption} height={280} />
        </Card>

        <Card
          title="Chi Tiết Nguồn Lead & Giá Trị Kỳ Vọng"
          description="So sánh hiệu quả chuyển đổi và quy mô doanh thu giữa các kênh"
          chip="LEAD SOURCES"
        >
          <DataTable
            columns={sourceColumns}
            data={LS}
            searchable={false}
            pageSize={6}
            exportFilename="Noire_Lead_Sources"
          />
        </Card>
      </div>

      {/* Row 3: Trạng thái chốt */}
      {statusRows.length > 0 && (
        <Card
          title="Trạng Thái Chốt Tiệc"
          description="Chỉ Confirmed mới tính là chốt — Tentative vẫn nằm trong pipeline"
          chip="STATUS"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {statusRows.map(r => (
              <div key={r.label} className="rounded-lg border border-brand-line p-3">
                <div className="text-[11px] font-bold uppercase tracking-wide text-brand-muted">
                  {r.label}
                </div>
                <div className="mt-1 font-mono text-lg font-extrabold text-brand-text">
                  {formatNumber(r.n)} <span className="text-xs font-normal text-brand-muted">lead</span>
                </div>
                <div className="mt-0.5 font-mono text-xs text-brand-muted">
                  kỳ vọng {formatVND(r.exp)}
                  {r.closed > 0 && ` · đã chốt ${formatVND(r.closed)}`}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};
