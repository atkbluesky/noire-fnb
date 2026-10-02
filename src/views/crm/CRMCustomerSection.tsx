import React, { useMemo } from 'react';
import { useFilters } from '../../context/FilterContext';
import { HUB_DATA, MKT_DATA } from '../../data';
import { MetricCard } from '../../components/common/MetricCard';
import { DeltaText } from '../../components/common/DeltaText';
import { Card } from '../../components/common/Card';
import { StatusBadge } from '../../components/common/StatusBadge';
import { DataTable, Column } from '../../components/common/DataTable';
import { EChartWrapper } from '../../components/charts/EChartWrapper';
import { formatNumber, formatPercent, formatVND, formatMonthLabel } from '../../utils/formatters';
import type { CrmMonth, CrmStore } from '../../types/mkt';
import type { EChartsOption } from 'echarts';

/**
 * M8 · CRM iPOS — khách hàng & doanh thu thành viên theo THÁNG.
 * Nguồn: tools/crm_reader.py (S27 file CRM tháng · S28 lịch sử · S29 CSV) → crm_* trong data_mkt.json.
 * Quy tắc: null = nguồn không có số, hiện "—", KHÔNG vẽ thành 0.
 */
const rate = (a: number | null | undefined, b: number | null | undefined) =>
  a == null || b == null || b === 0 ? null : a / b;

const sub = (a: number | null | undefined, b: number | null | undefined) =>
  a == null || b == null ? null : a - b;

const RANK_ORDER = ['Bronze', 'Silver', 'Gold', 'Black Diamond'];

const GRP_TITLE: Record<string, string> = {
  gender: 'Giới tính', age: 'Độ tuổi', channel: 'Kênh kết nối', spend: 'Mức chi tiêu tích luỹ',
};

export const CRMCustomerSection: React.FC = () => {
  const { theme, selectedMonths, filters } = useFilters();
  const isDark = theme === 'dark';
  const CM = (MKT_DATA.crm_month ?? []) as CrmMonth[];
  const CS = (MKT_DATA.crm_store ?? []) as CrmStore[];
  const SN = MKT_DATA.crm_snapshot ?? [];
  const DI = MKT_DATA.crm_dist ?? [];
  const RK = MKT_DATA.crm_rank ?? [];
  const MM = MKT_DATA.member_month ?? [];
  const CT = MKT_DATA.crm_target ?? [];

  const allMonths = useMemo(() => CM.map(r => r.month).sort(), [CM]);

  // Đồng bộ tiêu điểm tháng với thanh Nav phía trên: ưu tiên tháng 'Đến' (filters.to) hoặc tháng cuối kỳ chọn
  const curMonth = useMemo(() => {
    if (filters.to && allMonths.includes(filters.to)) return filters.to;
    const inRange = allMonths.filter(m => selectedMonths.includes(m));
    if (inRange.length > 0) return inRange[inRange.length - 1];
    return allMonths[allMonths.length - 1] ?? '';
  }, [allMonths, filters.to, selectedMonths]);

  // Các tháng trong kỳ chọn để vẽ biểu đồ và bảng
  const activeMonths = useMemo(() => {
    const filtered = allMonths.filter(m => selectedMonths.includes(m));
    return filtered.length > 0 ? filtered : allMonths;
  }, [allMonths, selectedMonths]);

  const activeCM = useMemo(() => CM.filter(r => activeMonths.includes(r.month)), [CM, activeMonths]);

  if (!CM.length) return null;

  const cur = CM.find(r => r.month === curMonth) ?? CM[CM.length - 1];
  const prevM = allMonths[allMonths.indexOf(cur.month) - 1];
  const prev = CM.find(r => r.month === prevM) ?? null;
  const snapCur = SN.find(r => r.month === cur.month) ?? null;
  const snapPrev = SN.filter(r => r.month < cur.month).slice(-1)[0] ?? null;
  const memCur = MM.find(r => r.month === cur.month)?.member ?? null;
  const memPrev = MM.find(r => r.month === prevM)?.member ?? null;
  const memTarget = CT.find(t => t.month === cur.month && t.kpi === 'member')?.target ?? null;

  const returnRate = (r: CrmMonth | null) =>
    r && r.spend_first != null && r.spend_second != null && r.spend_third != null
      ? (r.spend_second + r.spend_third) / (r.spend_first + r.spend_second + r.spend_third) : null;
  const discRate = (r: CrmMonth | null) =>
    r && r.mem_rev != null && r.mem_disc != null ? r.mem_disc / (r.mem_rev + r.mem_disc) : null;
  const aov = (r: CrmMonth | null) => rate(r?.mem_rev, r?.mem_inv);
  const mom = (a: number | null | undefined, b: number | null | undefined) => {
    const x = rate(sub(a, b), b);
    return x == null ? null : x;
  };
  // So tháng trước theo quy chuẩn QT2 (AGENTS.md): icon + xanh khi tăng, icon + đỏ khi giảm.
  const momLabel = `vs ${prevM ? formatMonthLabel(prevM) : 'kỳ trước'}`;
  const momDelta = (a: number | null | undefined, b: number | null | undefined) =>
    <DeltaText change={mom(a, b)} label={momLabel} />;

  const storeName = (c: string) => HUB_DATA.stores?.[c]?.name ?? c;
  const stores = CS.filter(r => r.month === cur.month);
  const prevStores = new Map(CS.filter(r => r.month === prevM).map(r => [r.store, r]));

  /* ── Biểu đồ 1: doanh thu thành viên + AOV ── */
  const revOption: EChartsOption = {
    grid: { top: 36, right: 52, bottom: 24, left: 58 },
    legend: { top: 0, textStyle: { fontSize: 10 } },
    tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
    xAxis: { type: 'category', data: activeMonths.map(formatMonthLabel), axisLabel: { fontSize: 10 } },
    yAxis: [
      { type: 'value', name: 'Doanh thu', nameTextStyle: { fontSize: 10 },
        axisLabel: { fontSize: 10, formatter: (v: number) => (v / 1e6).toFixed(0) + 'tr' },
        splitLine: { lineStyle: { color: isDark ? '#1F1F26' : '#EAE7DF', type: 'dashed' } } },
      { type: 'value', name: 'AOV (VNĐ)', nameTextStyle: { fontSize: 10 },
        axisLabel: { fontSize: 10, formatter: (v: number) => (v / 1e3).toFixed(0) + 'k' }, splitLine: { show: false } },
    ],
    series: [
      { name: 'Doanh thu thành viên', type: 'bar', barMaxWidth: 30,
        data: activeCM.map(r => r.mem_rev), itemStyle: { color: '#C5A059', borderRadius: [4, 4, 0, 0] },
        label: { show: true, position: 'top', fontSize: 9, formatter: (p: any) => (p.value == null ? '' : (p.value / 1e6).toFixed(0)) } },
      { name: 'AOV hoá đơn thành viên', type: 'line', yAxisIndex: 1, symbolSize: 5,
        data: activeCM.map(r => aov(r)), lineStyle: { color: '#EF4444', width: 2 }, itemStyle: { color: '#EF4444' } },
    ],
  };

  /* ── Biểu đồ 2: cơ cấu lượt chi tiêu (null = thiếu, để hở) ── */
  const mixOption: EChartsOption = {
    grid: { top: 36, right: 16, bottom: 24, left: 50 },
    legend: { top: 0, textStyle: { fontSize: 10 } },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    xAxis: { type: 'category', data: activeMonths.map(formatMonthLabel), axisLabel: { fontSize: 10 } },
    yAxis: { type: 'value', axisLabel: { fontSize: 10 },
      splitLine: { lineStyle: { color: isDark ? '#1F1F26' : '#EAE7DF', type: 'dashed' } } },
    series: [
      { name: 'Lần đầu', key: 'spend_first', color: '#82846C' },
      { name: 'Lần 2', key: 'spend_second', color: '#C28B4B' },
      { name: 'Từ 3 lần', key: 'spend_third', color: '#C5A059' },
    ].map(s => ({
      name: s.name, type: 'bar' as const, stack: 'mix', barMaxWidth: 30,
      data: activeCM.map(r => (r as any)[s.key]), itemStyle: { color: s.color },
    })),
  };

  /* ── Bảng theo cửa hàng ── */
  const storeCols: Column<CrmStore>[] = [
    { key: 'store', header: 'Cửa hàng', render: r => <span className="font-bold text-brand-text">{storeName(r.store)}</span>,
      exportValue: r => storeName(r.store) },
    { key: 'spend_first', header: 'Lần đầu', align: 'right', sortable: true, render: r => <span className="font-mono">{formatNumber(r.spend_first)}</span> },
    { key: 'spend_second', header: 'Lần 2', align: 'right', sortable: true, render: r => <span className="font-mono">{formatNumber(r.spend_second)}</span> },
    { key: 'spend_third', header: 'Từ 3 lần', align: 'right', sortable: true, render: r => <span className="font-mono">{formatNumber(r.spend_third)}</span> },
    { key: 'mem_inv', header: 'HĐ thành viên', align: 'right', sortable: true, render: r => <span className="font-mono font-bold text-brand-goldLight">{formatNumber(r.mem_inv)}</span> },
    { key: 'mem_rev', header: 'Doanh thu', align: 'right', sortable: true, render: r => <span className="font-mono">{formatVND(r.mem_rev)}</span>,
      exportValue: r => r.mem_rev },
    { key: 'disc', header: '% giảm giá', align: 'right',
      render: r => {
        const d = r.mem_rev != null && r.mem_disc != null ? r.mem_disc / (r.mem_rev + r.mem_disc) : null;
        return d == null ? <span className="text-brand-faint">—</span>
          : <StatusBadge label={formatPercent(d)} variant={d >= 0.4 ? 'bad' : d >= 0.25 ? 'warning' : 'ok'} />;
      },
      exportValue: r => (r.mem_rev != null && r.mem_disc != null ? r.mem_disc / (r.mem_rev + r.mem_disc) : null) },
    { key: 'aov', header: 'AOV', align: 'right', sortable: true,
      render: r => <span className="font-mono">{formatVND(rate(r.mem_rev, r.mem_inv))}</span>,
      exportValue: r => rate(r.mem_rev, r.mem_inv) },
    { key: 'mom', header: `DT vs ${prevM ? formatMonthLabel(prevM) : '—'}`, align: 'right',
      render: r => {
        const x = mom(r.mem_rev, prevStores.get(r.store)?.mem_rev);
        return <DeltaText className="font-mono" change={x}
          text={x == null ? undefined : `${x > 0 ? '+' : ''}${(x * 100).toFixed(0)}%`} />;
      },
      exportValue: r => mom(r.mem_rev, prevStores.get(r.store)?.mem_rev) },
  ];
  const storeRows = [...stores].sort((a, b) => (b.mem_rev ?? 0) - (a.mem_rev ?? 0))
    .filter(r => r.mem_rev != null || r.spend_total != null);

  /* ── Bức tranh khách hàng (ảnh chụp luỹ kế) ── */
  const snapRows = SN.filter(r => activeMonths.includes(r.month)).length > 0
    ? SN.filter(r => activeMonths.includes(r.month)).slice(-3)
    : SN.slice(-3);
  const dist = (grp: string, m: string) => DI.filter(d => d.month === m && d.grp === grp);
  const segTotal = (s: typeof SN[0] | null) =>
    s ? (s.seg1_n ?? 0) + (s.seg2_n ?? 0) + (s.seg3_n ?? 0) : null;

  /* ── Hạng thành viên ── */
  const upgrades = RK.filter(r => r.month === cur.month && r.kind === 'upgrade');
  const txns = RK.filter(r => r.month === cur.month && r.kind === 'txn')
    .sort((a, b) => (b.n ?? 0) - (a.n ?? 0));
  const txnTotal = txns.reduce((s, r) => s + (r.n ?? 0), 0);
  const internalTxn = txns.filter(r => /nội bộ/i.test(r.from_rank ?? '')).reduce((s, r) => s + (r.n ?? 0), 0);

  /* ── Voucher (báo cáo CRM iPOS) ── */
  const vRows = activeCM.filter(r => r.v_used != null || r.note?.includes('voucher'));
  const vStores = stores.filter(r => r.v_used != null);

  const memPct = memCur != null && memTarget ? memCur / memTarget : null;

  return (
    <section className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Khách đăng ký mới" subLabel="Member iPOS đăng ký trong tháng"
          value={formatNumber(memCur)} unit="khách" variant="hero"
          customDeltaText={memTarget
            ? <>{formatPercent(memPct)} KPI {formatNumber(memTarget)} · {momDelta(memCur, memPrev)}</>
            : momDelta(memCur, memPrev)} />
        <MetricCard label="Lượt chi tiêu thành viên" subLabel="= hoá đơn có member"
          value={formatNumber(cur.spend_total)} unit="lượt"
          customDeltaText={momDelta(cur.spend_total, prev?.spend_total)} />
        <MetricCard label="Doanh thu thành viên" subLabel="Sau giảm · trong tháng"
          value={formatVND(cur.mem_rev)}
          customDeltaText={momDelta(cur.mem_rev, prev?.mem_rev)} />
        <MetricCard label="AOV thành viên" subLabel="Doanh thu ÷ hoá đơn"
          value={formatVND(aov(cur))}
          customDeltaText={momDelta(aov(cur), aov(prev))} />
        <MetricCard label="% lượt quay lại" subLabel="Lần 2 + từ 3 lần ÷ tổng lượt"
          value={formatPercent(returnRate(cur))}
          customDeltaText={cur.spend_first == null ? 'Thiếu cơ cấu lượt tháng này' : `${formatNumber(cur.spend_first)} lượt lần đầu`} />
        <MetricCard label="% giảm giá" subLabel="Giảm ÷ (doanh thu + giảm)"
          value={formatPercent(discRate(cur))}
          customDeltaText={`${formatVND(cur.mem_disc)} giảm giá`} />
        <MetricCard label="Tổng khách (luỹ kế)" subLabel="Ảnh chụp cuối tháng"
          value={formatNumber(snapCur?.customers)} unit="khách"
          customDeltaText={snapPrev ? (() => {
            // Chênh tuyệt đối số khách; trước đây luôn ghép "+" kể cả khi giảm.
            const diff = snapCur?.customers != null && snapPrev.customers != null ? snapCur.customers - snapPrev.customers : null;
            return <DeltaText change={diff} text={diff == null ? undefined : `${diff > 0 ? '+' : ''}${formatNumber(diff)}`}
              label={`vs ${formatMonthLabel(snapPrev.month)}`} />;
          })() : '—'} />
        <MetricCard label="Chi tiêu luỹ kế" subLabel="Ảnh chụp cuối tháng"
          value={formatVND(snapCur?.cum_rev)}
          customDeltaText={snapCur ? `${formatNumber(snapCur.cum_inv)} HĐ · AOV ${formatVND(snapCur.aov)}` : '—'} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Doanh thu thành viên & AOV theo tháng" chip="TỪ T1" description="Doanh thu sau giảm (triệu) và giá trị hoá đơn bình quân">
          <EChartWrapper option={revOption} height={250} />
        </Card>
        <Card title="Cơ cấu lượt chi tiêu: lần đầu · lần 2 · từ 3 lần" chip="LƯỢT"
          description="Tháng thiếu cơ cấu (nguồn n.a.) để hở — không vẽ thành 0">
          <EChartWrapper option={mixOption} height={250} />
        </Card>
      </div>

      <Card title={`Theo cửa hàng · ${formatMonthLabel(cur.month)}`} chip={`${storeRows.length} CỬA HÀNG`}
        description="Lượt chi tiêu theo lần, doanh thu thành viên, % giảm giá và AOV. % giảm ≥40% tô đỏ (Empress Tower, The 9 Stellars thường vượt).">
        <DataTable columns={storeCols} data={storeRows} searchable={false} pageSize={10}
          exportFilename={`Noire_CRM_CuaHang_${cur.month}`} />
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Bức tranh khách hàng — ảnh chụp luỹ kế" chip="LUỸ KẾ"
          description="Khác grain với số trong tháng: không cộng, không so trực tiếp với doanh thu tháng.">
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-left text-brand-muted">
                  <th className="py-1.5 pr-3 font-semibold">Chỉ số</th>
                  {snapRows.map(r => <th key={r.month} className="py-1.5 px-2 text-right font-semibold">{formatMonthLabel(r.month)}</th>)}
                </tr>
              </thead>
              <tbody className="font-mono">
                {([
                  ['Tổng khách', (r: any) => formatNumber(r.customers)],
                  ['Chi tiêu luỹ kế', (r: any) => formatVND(r.cum_rev)],
                  ['Hoá đơn luỹ kế', (r: any) => formatNumber(r.cum_inv)],
                  ['AOV luỹ kế', (r: any) => formatVND(r.aov)],
                  ['Khách ăn ≥3 lần', (r: any) => `${formatNumber(r.seg3_n)} · ${formatPercent(rate(r.seg3_rev, r.cum_rev), 0)} DT`],
                  ['Khách ăn 2 lần', (r: any) => `${formatNumber(r.seg2_n)} · ${formatPercent(rate(r.seg2_rev, r.cum_rev), 0)} DT`],
                  ['Khách lần đầu', (r: any) => `${formatNumber(r.seg1_n)} · ${formatPercent(rate(r.seg1_rev, r.cum_rev), 0)} DT`],
                  ['Ngoài 3 nhóm', (r: any) => formatNumber(r.customers != null ? r.customers - (segTotal(r) ?? 0) : null)],
                ] as [string, (r: any) => string][]).map(([lb, f]) => (
                  <tr key={lb} className="border-t border-brand-border/50">
                    <td className="py-1.5 pr-3 font-sans text-brand-muted">{lb}</td>
                    {snapRows.map(r => <td key={r.month} className="py-1.5 px-2 text-right text-brand-text">{f(r)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title={`Chân dung khách · ${formatMonthLabel(cur.month)}`} chip="PHÂN BỐ"
          description="Một khách có thể nối nhiều kênh — không cộng kênh thành tổng khách.">
          {DI.some(d => d.month === cur.month) ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {(['gender', 'channel', 'spend', 'age'] as const).map(g => {
                const rows = dist(g, cur.month);
                if (!rows.length) return null;
                const base = Math.max(...rows.map(r => r.n ?? 0), 1);
                return (
                  <div key={g}>
                    <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-brand-muted">{GRP_TITLE[g]}</div>
                    <div className="space-y-1">
                      {rows.map(r => (
                        <div key={r.label} className="text-[11px]">
                          <div className="flex justify-between">
                            <span className="text-brand-text">{r.label}</span>
                            <span className="font-mono text-brand-muted">
                              {formatNumber(r.n)}{snapCur?.customers ? ` · ${formatPercent((r.n ?? 0) / snapCur.customers, 0)}` : ''}
                            </span>
                          </div>
                          <div className="h-1 rounded bg-brand-border/60">
                            <div className="h-1 rounded bg-brand-gold" style={{ width: `${((r.n ?? 0) / base) * 100}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="py-6 text-center text-xs text-brand-muted">Tháng này chưa có phân bố giới tính / kênh / chi tiêu.</p>
          )}
        </Card>
      </div>

      {(upgrades.length > 0 || txns.length > 0) && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card title={`Lên hạng thành viên · ${formatMonthLabel(cur.month)}`} chip={`${formatNumber(upgrades.reduce((s, r) => s + (r.n ?? 0), 0))} KHÁCH`}
            description="Số khách đổi hạng trong tháng.">
            <div className="space-y-1.5">
              {[...upgrades].sort((a, b) => (b.n ?? 0) - (a.n ?? 0)).map((r, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border border-brand-border bg-brand-surface/60 px-3 py-1.5 text-[11px]">
                  <span className="text-brand-text">{r.from_rank} <span className="text-brand-faint">→</span> <b>{r.to_rank}</b></span>
                  <span className="font-mono font-bold text-brand-goldLight">{formatNumber(r.n)}</span>
                </div>
              ))}
            </div>
          </Card>
          <Card title="Giao dịch theo hạng thành viên" chip={`${formatNumber(txnTotal)} GD`}
            description={`Gồm cả giao dịch NỘI BỘ (${formatNumber(internalTxn)} = ${formatPercent(rate(internalTxn, txnTotal), 0)}). Tổng khác lượt chi tiêu thành viên — hai nguồn đếm khác nhau.`}>
            <div className="space-y-1.5">
              {[...txns].sort((a, b) => RANK_ORDER.indexOf(a.from_rank ?? '') - RANK_ORDER.indexOf(b.from_rank ?? '') || (b.n ?? 0) - (a.n ?? 0)).map((r, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border border-brand-border bg-brand-surface/60 px-3 py-1.5 text-[11px]">
                  <span className="text-brand-text">{r.from_rank}</span>
                  <span className="font-mono text-brand-text">{formatNumber(r.n)} <span className="text-brand-faint">· {formatPercent(rate(r.n, txnTotal), 0)}</span></span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      <Card title="Báo cáo voucher của CRM iPOS" chip="PHÁT HÀNH → DÙNG"
        description="Số THEO THÁNG, mọi loại voucher trong báo cáo CRM iPOS. KHÁC 'Phễu Voucher' bên dưới (nhật ký S11: chỉ 11 chiến dịch đã xuất log, luỹ kế từ 06/2025) — hai khối không cùng phạm vi nên không so thẳng. Tháng sheet voucher trùng tháng trước bị loại, hiện ⚠.">
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-left text-brand-muted">
                {['Tháng', 'Phát hành', 'Đã dùng', 'Dùng ÷ phát', 'DT trước giảm', 'DT sau giảm', 'Chi phí giảm', '% giảm'].map((h, i) => (
                  <th key={h} className={`py-1.5 px-2 font-semibold ${i ? 'text-right' : ''}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="font-mono">
              {vRows.map(r => (
                <tr key={r.month} className="border-t border-brand-border/50">
                  <td className="py-1.5 px-2 font-sans font-bold text-brand-text">{formatMonthLabel(r.month)}</td>
                  {r.v_used == null ? (
                    <td colSpan={7} className="py-1.5 px-2 text-right font-sans text-status-warning">⚠ chưa có số — sheet voucher trùng tháng trước, cần xuất lại</td>
                  ) : (
                    <>
                      <td className="py-1.5 px-2 text-right">{formatNumber(r.v_issued)}</td>
                      <td className="py-1.5 px-2 text-right">{formatNumber(r.v_used)}</td>
                      <td className="py-1.5 px-2 text-right">{formatPercent(rate(r.v_used, r.v_issued))}{r.v_used! > r.v_issued! ? ' ⚠' : ''}</td>
                      <td className="py-1.5 px-2 text-right">{formatVND(r.v_rev_before)}</td>
                      <td className="py-1.5 px-2 text-right">{formatVND(r.v_rev_after)}</td>
                      <td className="py-1.5 px-2 text-right">{formatVND(r.v_disc)}</td>
                      <td className="py-1.5 px-2 text-right">{formatPercent(rate(r.v_disc, r.v_rev_before))}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {vStores.length > 0 && (
          <p className="mt-2 text-[10px] text-brand-faint">Chi tiết theo chi nhánh {formatMonthLabel(cur.month)}: {vStores.length} cửa hàng có số voucher.</p>
        )}
      </Card>
    </section>
  );
};

/**
 * Khung kiểm tra độ đồng nhất các tháng — QA dữ liệu CRM iPOS
 */
export const CRMConsistencyCard: React.FC = () => {
  const { selectedMonths } = useFilters();
  const CM = (MKT_DATA.crm_month ?? []) as CrmMonth[];
  const CS = (MKT_DATA.crm_store ?? []) as CrmStore[];
  const SN = MKT_DATA.crm_snapshot ?? [];
  const DI = MKT_DATA.crm_dist ?? [];
  const RK = MKT_DATA.crm_rank ?? [];
  const MM = MKT_DATA.member_month ?? [];

  const allMonths = useMemo(() => CM.map(r => r.month).sort(), [CM]);
  const activeMonths = useMemo(() => {
    const filtered = allMonths.filter(m => selectedMonths.includes(m));
    return filtered.length > 0 ? filtered : allMonths;
  }, [allMonths, selectedMonths]);

  const has = (m: string, f: (r: CrmMonth) => unknown) => {
    const r = CM.find(x => x.month === m);
    return !!r && f(r) != null;
  };

  const checks: { label: string; ok: (m: string) => 'ok' | 'miss' | 'warn' }[] = [
    { label: 'Member đăng ký mới', ok: m => (MM.find(r => r.month === m)?.member ? 'ok' : 'miss') },
    { label: 'Lượt chi tiêu (tổng)', ok: m => (has(m, r => r.spend_total) ? 'ok' : 'miss') },
    { label: 'Cơ cấu lần đầu / lần 2 / ≥3', ok: m => (has(m, r => r.spend_first)
      ? (CM.find(r => r.month === m)?.note?.includes('thiếu') ? 'warn' : 'ok') : 'miss') },
    { label: 'Doanh thu thành viên', ok: m => (has(m, r => r.mem_rev) ? 'ok' : 'miss') },
    { label: 'DT thành viên theo cửa hàng', ok: m => (CS.some(r => r.month === m && r.mem_rev != null) ? 'ok' : 'miss') },
    { label: 'Lượt chi tiêu theo cửa hàng', ok: m => (CS.some(r => r.month === m && r.spend_first != null) ? 'ok' : 'miss') },
    { label: 'Voucher: phát hành / dùng', ok: m => (has(m, r => r.v_used) ? 'ok'
      : CM.find(r => r.month === m)?.note?.includes('voucher') ? 'warn' : 'miss') },
    { label: 'Voucher theo chi nhánh', ok: m => (CS.some(r => r.month === m && r.v_used != null) ? 'ok' : 'miss') },
    { label: 'Ảnh chụp khách hàng (luỹ kế)', ok: m => (SN.some(r => r.month === m) ? 'ok' : 'miss') },
    { label: 'Giới tính · kênh · mức chi tiêu', ok: m => (DI.some(r => r.month === m && r.grp === 'gender') ? 'ok'
      : DI.some(r => r.month === m) ? 'warn' : 'miss') },
    { label: 'Hạng thành viên', ok: m => (RK.some(r => r.month === m) ? 'ok' : 'miss') },
  ];

  const cell = (s: 'ok' | 'miss' | 'warn') =>
    s === 'ok' ? <span className="text-status-ok font-bold">✔</span>
      : s === 'warn' ? <span className="text-status-warning font-bold" title="có nhưng thiếu / trùng tháng khác">⚠</span>
        : <span className="text-brand-faint">—</span>;

  if (!CM.length) return null;

  return (
    <Card title="Kiểm tra độ đồng nhất các tháng" chip="QA DỮ LIỆU"
      description="Mỗi tháng có đủ các chỉ số như tháng mới nhất không? ✔ có · ⚠ có nhưng thiếu/trùng · — chưa có nguồn.">
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-left text-brand-muted">
              <th className="py-1.5 pr-3 font-semibold">Chỉ số CRM</th>
              {activeMonths.map(m => <th key={m} className="py-1.5 px-2 text-center font-semibold">{formatMonthLabel(m)}</th>)}
            </tr>
          </thead>
          <tbody>
            {checks.map(c => (
              <tr key={c.label} className="border-t border-brand-border/50">
                <td className="py-1.5 pr-3 text-brand-text">{c.label}</td>
                {activeMonths.map(m => <td key={m} className="py-1.5 px-2 text-center">{cell(c.ok(m))}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
};
