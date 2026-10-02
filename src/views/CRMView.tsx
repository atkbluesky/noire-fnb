import React, { useMemo } from 'react';
import { useFilters } from '../context/FilterContext';
import { MKT_DATA } from '../data';
import { Card } from '../components/common/Card';
import { StatusBadge } from '../components/common/StatusBadge';
import { DataTable, Column } from '../components/common/DataTable';
import { EChartWrapper } from '../components/charts/EChartWrapper';
import { formatNumber, formatPercent, formatMonthLabel } from '../utils/formatters';
import { CRMCustomerSection, CRMConsistencyCard } from './crm/CRMCustomerSection';
import type { EChartsOption } from 'echarts';

export const CRMView: React.FC = () => {
  const { selectedMonths, theme } = useFilters();
  const isDark = theme === 'dark';

  /* ── Phễu voucher (khoá voucher_stat · voucher_month) ────────────── */
  const VS = MKT_DATA.voucher_stat || { issued: 0, used: 0, rate: 0 };
  const VM = MKT_DATA.voucher_month || [];
  const allVmMonths = useMemo(() => [...new Set(VM.map(v => v.m))].sort(), [VM]);
  const vmMonths = useMemo(() => {
    const inRange = allVmMonths.filter(m => selectedMonths.includes(m));
    return inRange.length > 0 ? inRange : allVmMonths;
  }, [allVmMonths, selectedMonths]);

  const vmUsed = useMemo(() => vmMonths.map(m => VM.filter(v => v.m === m).reduce((a, v) => a + v.used, 0)), [VM, vmMonths]);
  const vmDisc = useMemo(() => vmMonths.map(m => VM.filter(v => v.m === m).reduce((a, v) => a + v.disc, 0)), [VM, vmMonths]);

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
  const MM = MKT_DATA.member_month || [];
  const CT = MKT_DATA.crm_target || [];
  const filteredMM = useMemo(() => {
    const inRange = MM.filter(r => selectedMonths.includes(r.month));
    return inRange.length > 0 ? inRange : MM;
  }, [MM, selectedMonths]);

  const MS = useMemo(() => {
    const filled = filteredMM.filter(r => (r.member ?? 0) > 0).length;
    const templateTargets = CT.filter(t => selectedMonths.includes(t.month) && t.kpi === 'member');
    const totalTemplate = new Set((templateTargets.length > 0 ? templateTargets : CT.filter(t => t.kpi === 'member')).map(t => t.month)).size;
    return {
      months_filled: filled,
      months_template: totalTemplate,
      total: filteredMM.reduce((a, r) => a + (r.member || 0), 0),
    };
  }, [filteredMM, CT, selectedMonths]);

  const memberRows = useMemo(() => {
    return filteredMM.filter(r => (r.member ?? 0) > 0).map(r => {
      const tg = CT.find(t => t.month === r.month && t.kpi === 'member')?.target ?? null;
      return { ...r, target: tg, achv: tg ? r.member / tg : null };
    }).sort((a, b) => String(a.month).localeCompare(String(b.month)));
  }, [filteredMM, CT]);

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
  ];

  return (
    <div className="space-y-5 p-4 sm:p-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div>
        <span className="text-[10px] font-extrabold uppercase tracking-widest text-brand-gold">
          BÁN CHO AI, HỌ CÓ QUAY LẠI
        </span>
        <h2 className="text-xl font-extrabold text-brand-text font-display mt-0.5">
          M8 · CRM · Khách Hàng &amp; Voucher
        </h2>
        <p className="text-xs text-brand-muted mt-1">
          Theo dõi doanh thu thành viên, cơ cấu lượt chi tiêu và hiệu quả các chương trình voucher.
        </p>
      </div>

      {/* CRM iPOS theo tháng: khách đăng ký · lượt chi tiêu · doanh thu thành viên · voucher · hạng */}
      <CRMCustomerSection />

      {/* Phễu voucher & Member đăng ký */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card
          title="Phễu Voucher — Phát Ra So Với Dùng Thật"
          description="Nhật ký voucher iPOS (S11): 11 chiến dịch đã xuất log, luỹ kế 06/2025 → 10/09/2026. Khác báo cáo voucher CRM iPOS ở khối trên (theo tháng, mọi loại voucher)."
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

      {/* Kiểm tra độ đồng nhất các tháng — đưa xuống cuối cùng */}
      <CRMConsistencyCard />
    </div>
  );
};
