import React from 'react';
import { useFilters } from '../context/FilterContext';
import { HUB_DATA, MKT_DATA } from '../data';
import { MetricCard } from '../components/common/MetricCard';
import { Card } from '../components/common/Card';
import { StatusBadge } from '../components/common/StatusBadge';
import { DataTable, Column } from '../components/common/DataTable';
import { EChartWrapper } from '../components/charts/EChartWrapper';
import { formatNumber, formatPercent, formatMonthLabel } from '../utils/formatters';
import type { EChartsOption } from 'echarts';

export const CRMView: React.FC = () => {
  const { selectedMonths, theme } = useFilters();
  const isDark = theme === 'dark';

  const ms = selectedMonths;
  const ID = HUB_DATA.identify.filter(x => ms.includes(x.month));
  const R = HUB_DATA.repeat || [];
  const RS = HUB_DATA.repeat_stat || { customers: 0, repeat: 0, rate: 0, max: 0 };
  const totalR = R.reduce((a, b) => a + b.n, 0);

  const totalBills = ID.reduce((a, b) => a + b.bills, 0);
  const totalIdBills = ID.reduce((a, b) => a + b.id_bills, 0);
  const overallIdRate = totalBills > 0 ? totalIdBills / totalBills : 0;

  const OA = (MKT_DATA.oa || []).filter(o => ms.includes(o.month));
  const VJ = MKT_DATA.voucher_join || { rate: 0, window: [], out_window: 0, by_month: [] };

  // 1. Identification Rate by Month Chart
  const idOption: EChartsOption = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
      formatter: (params: any) => {
        let res = `<div class="font-bold text-xs mb-1">${params[0]?.axisValue}</div>`;
        params.forEach((item: any) => {
          res += `<div class="flex items-center justify-between gap-4 text-xs py-0.5 font-mono">
            <span>${item.marker} ${item.seriesName}:</span>
            <b>${item.seriesIndex === 0 ? formatNumber(item.value) + ' HĐ' : item.value?.toFixed(1) + '%'}</b>
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
      data: ID.map(x => formatMonthLabel(x.month)),
      axisLine: { lineStyle: { color: '#2A2A33' } },
      axisLabel: { color: isDark ? '#F3F2EE' : '#18181B', fontSize: 11 },
    },
    yAxis: [
      {
        type: 'value',
        name: 'HĐ có SĐT',
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
        name: 'Tỷ lệ (%)',
        max: 30,
        nameTextStyle: { color: '#9E9B93', fontSize: 10 },
        axisLabel: {
          formatter: '{value}%',
          color: '#9E9B93',
          fontSize: 10,
        },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: 'Số HĐ có SĐT',
        type: 'bar',
        data: ID.map(x => x.id_bills),
        itemStyle: { color: '#C5A059', borderRadius: [4, 4, 0, 0] },
        barMaxWidth: 32,
      },
      {
        name: 'Tỷ lệ nhận diện',
        type: 'line',
        yAxisIndex: 1,
        data: ID.map(x => x.rate * 100),
        lineStyle: { color: '#EF4444', width: 2.5 },
        itemStyle: { color: '#EF4444' },
        symbolSize: 6,
      },
    ],
  };

  // 2. Repeat Frequency Bar Chart
  const repeatOption: EChartsOption = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: any) => {
        const item = params[0];
        const val = item?.value || 0;
        return `<div class="text-xs">
          <b>${item?.axisValue}</b>: ${formatNumber(val)} khách (${formatPercent(totalR > 0 ? val / totalR : 0)})
        </div>`;
      },
    },
    grid: { top: 20, right: 20, bottom: 25, left: 55 },
    xAxis: {
      type: 'category',
      data: R.map(x => x.label),
      axisLine: { lineStyle: { color: '#2A2A33' } },
      axisLabel: { color: '#F3F2EE', fontSize: 11 },
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        formatter: (val: number) => formatNumber(val),
        color: '#9E9B93',
        fontSize: 10,
      },
      splitLine: { lineStyle: { color: '#1F1F26', type: 'dashed' } },
    },
    series: [
      {
        name: 'Số khách',
        type: 'bar',
        data: R.map(x => x.n),
        itemStyle: {
          color: (params: any) =>
            ['#82846C', '#C5A059', '#22C55E', '#DFBF7A'][params.dataIndex % 4],
          borderRadius: [4, 4, 0, 0],
        },
        barMaxWidth: 38,
      },
    ],
  };

  // 3. Zalo OA Chart
  const oaOption: EChartsOption = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
    },
    legend: {
      top: 0,
      textStyle: { color: '#9E9B93', fontSize: 11 },
    },
    grid: { top: 35, right: 20, bottom: 25, left: 55 },
    xAxis: {
      type: 'category',
      data: OA.map(o => formatMonthLabel(o.month)),
      axisLine: { lineStyle: { color: '#2A2A33' } },
      axisLabel: { color: '#F3F2EE', fontSize: 11 },
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        formatter: (val: number) => formatNumber(val),
        color: '#9E9B93',
        fontSize: 10,
      },
      splitLine: { lineStyle: { color: '#1F1F26', type: 'dashed' } },
    },
    series: [
      {
        name: 'Quan tâm mới',
        type: 'bar',
        data: OA.map(o => o.follows),
        itemStyle: { color: '#C5A059' },
        barMaxWidth: 28,
      },
      {
        name: 'Tin nhắn tới OA',
        type: 'bar',
        data: OA.map(o => o.msgs),
        itemStyle: { color: '#82846C' },
        barMaxWidth: 28,
      },
      {
        name: 'Lượt xem trang',
        type: 'line',
        data: OA.map(o => o.views),
        lineStyle: { color: '#EF4444', width: 2 },
        itemStyle: { color: '#EF4444' },
      },
    ],
  };

  // Voucher Join Table
  /* ── Phễu voucher (khoá voucher_stat · voucher_month) ────────────── */
  const VS = MKT_DATA.voucher_stat || { issued: 0, used: 0, rate: 0 };
  const VM = MKT_DATA.voucher_month || [];
  const vmMonths = [...new Set(VM.map(v => v.m))].sort();
  const vmUsed = vmMonths.map(m => VM.filter(v => v.m === m).reduce((a, v) => a + v.used, 0));
  const vmDisc = vmMonths.map(m => VM.filter(v => v.m === m).reduce((a, v) => a + v.disc, 0));

  const voucherTrendOption: EChartsOption = {
    grid: { top: 32, right: 58, bottom: 24, left: 54 },
    legend: { top: 0, textStyle: { fontSize: 10 } },
    tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
    xAxis: {
      type: 'category',
      data: vmMonths.map(formatMonthLabel),
      axisLabel: { fontSize: 10 },
    },
    yAxis: [
      {
        type: 'value', name: 'Lượt dùng',
        nameTextStyle: { fontSize: 10 }, axisLabel: { fontSize: 10 },
        splitLine: { lineStyle: { color: isDark ? '#1F1F26' : '#EAE7DF', type: 'dashed' } },
      },
      {
        type: 'value', name: 'Chi phí ưu đãi (VNĐ)',
        nameTextStyle: { fontSize: 10 },
        axisLabel: { fontSize: 10, formatter: (v: number) => (v / 1e6).toFixed(0) + 'tr' },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: 'Lượt dùng', type: 'bar', data: vmUsed, barMaxWidth: 28,
        itemStyle: { color: '#82846C', borderRadius: [4, 4, 0, 0] },
        label: { show: true, position: 'top', fontSize: 9, formatter: (p: any) => formatNumber(p.value) },
      },
      {
        name: 'Chi phí ưu đãi', type: 'line', yAxisIndex: 1, data: vmDisc,
        lineStyle: { color: '#C28B4B', width: 2 }, itemStyle: { color: '#C28B4B' }, symbolSize: 5,
      },
    ],
  };

  /* ── Member đăng ký so KPI (khoá member_month · member_stat · crm_target) ── */
  const MS = MKT_DATA.member_stat || { months_filled: 0, months_template: 0, total: 0 };
  const MM = MKT_DATA.member_month || [];
  const CT = MKT_DATA.crm_target || [];
  const memberRows = MM.map(r => {
    const tg = CT.find(t => t.month === r.month && t.kpi === 'member')?.target ?? null;
    return { ...r, target: tg, achv: tg ? r.member / tg : null };
  }).sort((a, b) => String(a.month).localeCompare(String(b.month)));

  const memberColumns: Column<typeof memberRows[0]>[] = [
    { key: 'month', header: 'Tháng', render: r => formatMonthLabel(r.month) },
    {
      key: 'member', header: 'Member mới', align: 'right', sortable: true,
      render: r => <span className="font-mono font-bold text-brand-goldLight">{formatNumber(r.member)}</span>,
    },
    {
      key: 'target', header: 'KPI', align: 'right', sortable: true,
      render: r => <span className="font-mono text-brand-muted">{r.target != null ? formatNumber(r.target) : '—'}</span>,
    },
    {
      key: 'achv', header: '% Đạt', align: 'right', sortable: true,
      render: r => r.achv == null ? <span className="text-brand-faint">—</span> : (
        <StatusBadge
          label={formatPercent(r.achv)}
          variant={r.achv >= 1 ? 'ok' : r.achv >= 0.9 ? 'warning' : 'bad'}
        />
      ),
    },
    {
      key: 'oa', header: 'OA follow', align: 'right', sortable: true,
      render: r => <span className="font-mono text-brand-muted">{formatNumber(r.oa)}</span>,
    },
  ];

  const voucherJoinColumns: Column<typeof VJ.by_month[0]>[] = [
    {
      key: 'm',
      header: 'Tháng',
      render: row => <span className="font-bold text-brand-text">{formatMonthLabel(row.m)}</span>,
    },
    {
      key: 'n',
      header: 'Lượt dùng voucher',
      align: 'right',
      render: row => <span className="font-mono">{formatNumber(row.n)}</span>,
    },
    {
      key: 'hit',
      header: 'Khớp hoá đơn POS',
      align: 'right',
      render: row => <span className="font-mono text-status-ok font-bold">{formatNumber(row.hit)}</span>,
    },
    {
      key: 'rate',
      header: 'Tỷ lệ khớp',
      align: 'right',
      render: row => (
        <StatusBadge
          label={formatPercent(row.rate)}
          variant={row.rate >= 0.95 ? 'ok' : 'warning'}
        />
      ),
    },
  ];

  return (
    <div className="space-y-5 p-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div>
        <span className="text-[10px] font-extrabold uppercase tracking-widest text-brand-gold">
          BÁN CHO AI, HỌ CÓ QUAY LẠI
        </span>
        <h2 className="text-xl font-extrabold text-brand-text font-display mt-0.5">
          M9 · CRM · Tần Suất Khách &amp; Zalo OA
        </h2>
        <p className="text-xs text-brand-muted mt-1">
          Chỉ số sống còn của F&amp;B không chỉ nằm ở doanh thu một lần mà là tỷ lệ khách hàng trung thành quay lại.
        </p>
      </div>

      {/* ID Bottleneck Alert */}
      <div className="rounded-xl border border-status-bad/40 bg-status-badBg/20 p-4 text-xs text-status-bad flex items-start gap-3">
        <span className="font-extrabold uppercase text-[11px] rounded bg-status-bad/20 px-2 py-0.5 mt-0.5">
          Điểm Nghẽn CRM
        </span>
        <div className="space-y-1 text-brand-text">
          <p>
            Chỉ có <b>{formatPercent(overallIdRate)}</b> hoá đơn có số điện thoại ({formatNumber(totalIdBills)}/
            {formatNumber(totalBills)} HĐ). Trong nhóm nhận diện được, <b>{formatPercent(RS.rate)}</b> khách quay lại
            từ 2 lần trở lên.
          </p>
          <p className="text-brand-muted text-[11px]">
            Nâng tỷ lệ nhận diện khách lên mức 30–40% tại quầy thu ngân là điều kiện tiên quyết để phân tích CRM có ý nghĩa
            thống kê toàn diện.
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard
          label="Tỷ Lệ Nhận Diện"
          subLabel="Bill có SĐT ÷ Tổng bill"
          value={formatPercent(overallIdRate)}
          isFlagged={true}
          flagMessage="Mục tiêu ≥30%"
          variant="critical"
        />
        <MetricCard
          label="Khách Nhận Diện Được"
          subLabel="Số điện thoại duy nhất"
          value={formatNumber(RS.customers)}
          unit="khách"
        />
        <MetricCard
          label="Tỷ Lệ Quay Lại"
          subLabel="Khách ≥2 lượt ghé"
          value={formatPercent(RS.rate)}
          customDeltaText={`${formatNumber(RS.repeat)} khách hàng thân thiết`}
          variant="hero"
        />
        <MetricCard
          label="Khách Đi Nhiều Nhất"
          subLabel="Khách văn phòng ghé thường nhật"
          value={RS.max}
          unit="lượt"
        />
      </div>

      {/* Row 1: Identification Rate & Repeat Distribution */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card
          title="Tỷ Lệ Nhận Diện Khách Theo Tháng"
          description="Số lượng hoá đơn có số điện thoại và tỷ lệ % nhận diện qua thời gian"
          chip="TỶ LỆ NHẬN DIỆN"
        >
          <EChartWrapper option={idOption} height={260} />
        </Card>

        <Card
          title="Phân Bố Tần Suất Khách Ghé Thăm"
          description="Số lượng khách hàng theo số lần quay lại trong kỳ"
          chip="REPEAT FREQUENCY"
        >
          <EChartWrapper option={repeatOption} height={260} />
        </Card>
      </div>

      {/* Row 2: Zalo OA & Voucher Matching */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card
          title="Zalo Official Account (Kênh Riêng NCB)"
          description="Tăng trưởng lượng người quan tâm, tin nhắn và lượt xem trang OA"
          chip="ZALO OA"
        >
          <EChartWrapper option={oaOption} height={260} />
        </Card>

        <Card
          title="Độ Khớp Voucher ↔ Hoá Đơn POS"
          description={`Tỷ lệ khớp thực tế đạt ${formatPercent(VJ.rate)} trong kỳ có dữ liệu (${VJ.window?.map(formatMonthLabel).join('–')})`}
          chip="CHỐT QA #11"
        >
          <DataTable
            columns={voucherJoinColumns}
            data={VJ.by_month}
            searchable={false}
            pageSize={6}
            exportFilename="Noire_Voucher_Join_Audit"
          />
        </Card>
      </div>

      {/* Row 3: Phễu voucher & Member đăng ký */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card
          title="Phễu Voucher — Phát Ra So Với Dùng Thật"
          description="Phát mã không đồng nghĩa với có khách. Tỷ lệ dùng mới là chỉ số đáng đàm phán."
          chip={`REDEEM ${formatPercent(VS.rate ?? 0)}`}
          chipColor={
            (VS.rate ?? 0) >= 0.5
              ? 'border-status-ok/40 bg-status-okBg text-status-ok'
              : 'border-status-warning/40 bg-status-warningBg text-status-warning'
          }
        >
          <div className="mb-3 grid grid-cols-3 gap-2.5">
            {[
              { lb: 'Mã đã phát', v: formatNumber(VS.issued ?? 0), c: 'text-brand-sand' },
              { lb: 'Mã đã dùng', v: formatNumber(VS.used ?? 0), c: 'text-status-ok' },
              { lb: 'Còn nằm im', v: formatNumber((VS.issued ?? 0) - (VS.used ?? 0)), c: 'text-status-warning' },
            ].map(x => (
              <div key={x.lb} className="rounded-lg border border-brand-border bg-brand-surface/60 p-2.5">
                <div className="text-[10px] uppercase tracking-wider text-brand-muted">{x.lb}</div>
                <div className={`mt-0.5 font-display text-lg font-extrabold ${x.c}`}>{x.v}</div>
              </div>
            ))}
          </div>
          {vmMonths.length > 0
            ? <EChartWrapper option={voucherTrendOption} height={220} />
            : <p className="py-6 text-center text-xs text-brand-muted">Chưa có dữ liệu voucher theo tháng.</p>}
        </Card>

        <Card
          title="Member Đăng Ký Mới So Với KPI"
          description="Số liệu lấy từ bảng theo dõi tay — độ đầy đủ của bảng này quyết định module CRM có đọc được hay không."
          chip={
            MS.months_template
              ? `ĐIỀN ${MS.months_filled}/${MS.months_template} THÁNG`
              : `${MS.months_filled ?? 0} THÁNG CÓ SỐ`
          }
          chipColor={
            MS.months_template && (MS.months_filled ?? 0) / MS.months_template >= 0.8
              ? 'border-status-ok/40 bg-status-okBg text-status-ok'
              : 'border-status-bad/40 bg-status-badBg text-status-bad'
          }
        >
          {MS.months_template && (MS.months_filled ?? 0) < MS.months_template && (
            <div className="mb-3 rounded-lg border border-status-bad/40 bg-status-badBg/20 p-2.5 text-[11px] leading-relaxed text-status-bad">
              <b>Bảng theo dõi chưa được điền đủ:</b> mới có {MS.months_filled}/{MS.months_template} tháng có số.
              Các tháng còn trống là <b>chưa đo được</b>, không phải bằng không — hệ thống để trống chứ không vẽ thành 0.
            </div>
          )}
          {memberRows.length > 0 ? (
            <DataTable
              columns={memberColumns}
              data={memberRows}
              searchable={false}
              pageSize={7}
              exportFilename="Noire_Member_vs_KPI"
            />
          ) : (
            <p className="py-6 text-center text-xs text-brand-muted">
              Chưa có tháng nào được điền số member đăng ký.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
};
