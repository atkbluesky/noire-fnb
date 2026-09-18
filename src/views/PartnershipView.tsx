import React from 'react';
import { useFilters } from '../context/FilterContext';
import { MKT_DATA } from '../data';
import { MetricCard } from '../components/common/MetricCard';
import { Card } from '../components/common/Card';
import { StatusBadge } from '../components/common/StatusBadge';
import { DataTable, Column } from '../components/common/DataTable';
import { EChartWrapper } from '../components/charts/EChartWrapper';
import { formatVND, formatNumber, formatPercent, formatMonthLabel } from '../utils/formatters';
import {
  BASIS_META, CHANNELS, CHANNEL_META, PARTNERS, PARTNER_BY_CODE, PartnerTotals,
  emptyTotals, partnerRows, totals, totalsBy,
} from '../utils/partner';
import type { PartnerBasis, PartnerChannel, PartnerItem } from '../types/mkt';
import type { EChartsOption } from 'echarts';

/* M9 · PARTNERSHIP — Đối tác = AGGREGATOR + PARTNER.
   Mọi số đọc từ MKT_DATA.partner_fact qua utils/partner.ts — cùng hàm với thẻ "Đối tác" ở M7,
   nên hai màn luôn ra một con số. Kênh và cách nhận hoá đơn: data_contract.json → $partner. */

const ChannelBadge: React.FC<{ ch: PartnerChannel }> = ({ ch }) => {
  const c = CHANNEL_META[ch];
  return (
    <span
      className="inline-block rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
      style={{ color: c?.color, borderColor: `${c?.color}66`, backgroundColor: `${c?.color}1A` }}
    >
      {c?.short ?? ch}
    </span>
  );
};

const BasisTags: React.FC<{ bases: PartnerBasis[] }> = ({ bases }) => (
  <div className="flex flex-wrap gap-1">
    {bases.map(b => (
      <span key={b} title={BASIS_META[b]?.desc}
        className={`rounded border px-1 py-0.5 text-[9px] font-semibold ${b === 'REPORT'
          ? 'border-status-warning/40 text-status-warning' : 'border-brand-border text-brand-muted'}`}>
        {BASIS_META[b]?.label ?? b}
      </span>
    ))}
  </div>
);

export const PartnershipView: React.FC = () => {
  const { selectedMonths, brandMatches, aggByMonth, theme, filters } = useFilters();
  const isDark = theme === 'dark';
  const ms = selectedMonths;

  const rows = partnerRows(ms, brandMatches);
  const T = totals(rows);
  const byCh = totalsBy(rows, r => r.channel);
  const byP = totalsBy(rows, r => r.partner);
  const chainNet = ms.reduce((a, m) => a + (aggByMonth[m]?.net || 0), 0);
  const chainTc = ms.reduce((a, m) => a + (aggByMonth[m]?.tc || 0), 0);
  const chainAov = chainTc ? chainNet / chainTc : null;
  const cost = (t: PartnerTotals) => t.cost + t.fee;

  /* Danh mục hiển thị: đối tác áp dụng cho brand đang lọc, hoặc đã phát sinh ở brand đó. */
  const catalog = PARTNERS.filter(p =>
    filters.brand === 'ALL' || !p.brand || /tất cả/i.test(p.brand) || p.brand.includes(filters.brand) || byP[p.code]);

  /* Kế hoạch (sheet 3. Kế Hoạch của danh mục) trong kỳ lọc. */
  const planBy: Record<string, number> = {};
  (MKT_DATA.partner_plan || []).forEach(r => {
    if (ms.includes(r.month) && r.rev !== null) planBy[r.code] = (planBy[r.code] || 0) + r.rev;
  });

  type Row = PartnerItem & { t: PartnerTotals; plan: number | null };
  const table: Row[] = catalog
    .map(p => ({ ...p, t: byP[p.code] ?? emptyTotals(), plan: planBy[p.code] ?? null }))
    .sort((a, b) => a.channel.localeCompare(b.channel) || b.t.net - a.t.net);
  const active = table.filter(r => r.t.bills > 0);
  const flagged = table.filter(r => r.flags.length);

  /* ── Biểu đồ 1: doanh thu đối tác theo tháng × kênh ─────────────────── */
  const barOption: EChartsOption = {
    tooltip: {
      trigger: 'axis', axisPointer: { type: 'shadow' },
      formatter: (ps: any) => {
        const m = ms[ps[0]?.dataIndex];
        const base = aggByMonth[m]?.net || 0;
        let tot = 0;
        let s = `<div class="font-bold text-xs mb-1 border-b border-brand-border pb-1">${ps[0]?.axisValue}</div>`;
        ps.forEach((p: any) => {
          tot += p.value || 0;
          s += `<div class="flex justify-between gap-4 text-xs font-mono py-0.5"><span>${p.marker} ${p.seriesName}</span><b>${formatVND(p.value)}</b></div>`;
        });
        s += `<div class="flex justify-between gap-4 text-xs font-mono pt-1 mt-1 border-t border-brand-border"><span>Tổng · ${base ? formatPercent(tot / base) : '—'} DT chuỗi</span><b>${formatVND(tot)}</b></div>`;
        return s;
      },
    },
    legend: { top: 0, textStyle: { color: '#9E9B93', fontSize: 11 } },
    grid: { top: 35, right: 20, bottom: 25, left: 65 },
    xAxis: {
      type: 'category', data: ms.map(formatMonthLabel),
      axisLine: { lineStyle: { color: '#2A2A33' } },
      axisLabel: { color: isDark ? '#F3F2EE' : '#18181B', fontSize: 11 },
    },
    yAxis: {
      type: 'value',
      axisLabel: { formatter: (v: number) => formatVND(v, 0), color: '#9E9B93', fontSize: 10 },
      splitLine: { lineStyle: { color: '#1F1F26', type: 'dashed' } },
    },
    series: CHANNELS.map(c => ({
      name: c.short, type: 'bar' as const, stack: 'ch', barMaxWidth: 38,
      itemStyle: { color: c.color },
      data: ms.map(m => rows.filter(r => r.month === m && r.channel === c.code).reduce((a, r) => a + r.net, 0)),
    })),
  };

  /* ── Biểu đồ 2: xếp hạng đối tác theo doanh thu, tô theo kênh ──────── */
  const ranked = active.slice().sort((a, b) => a.t.net - b.t.net);
  const rankOption: EChartsOption = {
    tooltip: {
      trigger: 'item',
      formatter: (p: any) => {
        const r = ranked[p.dataIndex];
        return `<div class="text-xs"><b>${r.name}</b><br/>${formatVND(r.t.net)} · ${formatNumber(r.t.bills)} HĐ<br/>Chi phí ${formatVND(cost(r.t))}</div>`;
      },
    },
    grid: { top: 10, right: 60, bottom: 20, left: 150 },
    xAxis: {
      type: 'value',
      axisLabel: { formatter: (v: number) => formatVND(v, 0), color: '#9E9B93', fontSize: 10 },
      splitLine: { lineStyle: { color: '#1F1F26', type: 'dashed' } },
    },
    yAxis: {
      type: 'category', data: ranked.map(r => (r.name.length > 24 ? r.name.slice(0, 22) + '…' : r.name)),
      axisLabel: { color: isDark ? '#F3F2EE' : '#18181B', fontSize: 10 },
      axisLine: { lineStyle: { color: '#2A2A33' } },
    },
    series: [{
      type: 'bar', barMaxWidth: 16,
      data: ranked.map(r => ({ value: r.t.net, itemStyle: { color: CHANNEL_META[r.channel]?.color } })),
      label: {
        show: true, position: 'right', fontSize: 10, color: '#9E9B93',
        formatter: (p: any) => (T.net ? formatPercent(p.value / T.net, 0) : ''),
      },
    }],
  };

  /* ── Bảng chính: kết quả theo đối tác ─────────────────────────────── */
  const columns: Column<Row>[] = [
    { key: 'channel', header: 'Kênh', render: r => <ChannelBadge ch={r.channel} /> },
    {
      key: 'name', header: 'Đối tác',
      render: r => (
        <div className="leading-tight">
          <div className="font-bold text-brand-text">{r.name}</div>
          <div className="text-[10px] text-brand-faint"><span className="font-mono text-brand-gold">{r.code}</span> · {r.kind ?? '—'}</div>
        </div>
      ),
    },
    {
      key: 'status', header: 'Hợp đồng',
      render: r => (
        <div className="space-y-0.5 leading-tight">
          <StatusBadge label={r.status ?? 'Chưa khai'}
            variant={/đang chạy/i.test(r.status ?? '') ? 'ok' : /chuẩn bị/i.test(r.status ?? '') ? 'warning' : 'neutral'} />
          <div className="font-mono text-[10px] text-brand-faint">{r.start ?? '…'} → {r.end ?? '…'}</div>
          <div className="text-[10px] text-brand-muted">{r.brand ?? '—'}</div>
        </div>
      ),
    },
    {
      key: 'bills', header: 'Hoá đơn', align: 'right',
      render: r => (
        <div className="text-right font-mono leading-tight">
          <div>{r.t.bills ? formatNumber(r.t.bills) : '—'}</div>
          <div className="text-[10px] text-brand-muted">{r.t.guests ? `${formatNumber(r.t.guests)} khách` : ''}</div>
        </div>
      ),
    },
    {
      key: 'net', header: 'Doanh thu', align: 'right',
      render: r => (
        <div className="text-right font-mono leading-tight">
          <div className="font-bold text-brand-goldLight">{r.t.net ? formatVND(r.t.net) : '—'}</div>
          <div className="text-[10px] text-brand-muted">{r.t.net && chainNet ? `${formatPercent(r.t.net / chainNet, 2)} DT chuỗi` : ''}</div>
        </div>
      ),
    },
    {
      key: 'aov', header: 'AOV', align: 'right',
      render: r => {
        const aov = r.t.bills ? r.t.net / r.t.bills : null;
        const d = aov !== null && chainAov ? aov / chainAov - 1 : null;
        return (
          <div className="text-right font-mono leading-tight">
            <div>{aov === null ? '—' : formatVND(aov)}</div>
            <div className={`text-[10px] ${d === null ? 'text-brand-muted' : d >= 0 ? 'text-status-ok' : 'text-status-bad'}`}>
              {d === null ? '' : `${d >= 0 ? '+' : ''}${formatPercent(d, 0)} so chuỗi`}
            </div>
          </div>
        );
      },
    },
    {
      key: 'cost', header: 'Chi phí', align: 'right',
      render: r => {
        const c = cost(r.t);
        return (
          <div className="text-right font-mono leading-tight">
            <div>{c ? formatVND(c) : '—'}</div>
            <div className="text-[10px] text-brand-muted">
              {r.t.cost ? `ưu đãi ${formatVND(r.t.cost)}` : ''}{r.t.cost && r.t.fee ? ' · ' : ''}
              {r.t.fee ? `phí ${formatVND(r.t.fee)}${r.t.fee_est ? '*' : ''}` : ''}
            </div>
            {c > 0 && r.t.net > 0 && (
              <div className={`text-[10px] ${c / r.t.net > 0.3 ? 'text-status-bad' : 'text-brand-faint'}`}>{formatPercent(c / r.t.net)} DT</div>
            )}
          </div>
        );
      },
    },
    {
      key: 'plan', header: 'Kế hoạch DT', align: 'right',
      render: r => (
        <div className="text-right font-mono leading-tight">
          <div>{r.plan === null ? '—' : formatVND(r.plan)}</div>
          {r.plan ? (
            <div className={`text-[10px] ${r.t.net >= r.plan ? 'text-status-ok' : 'text-status-bad'}`}>đạt {formatPercent(r.t.net / r.plan, 0)}</div>
          ) : null}
        </div>
      ),
    },
    { key: 'bases', header: 'Nguồn số', render: r => (r.bases.length ? <BasisTags bases={r.bases} /> : <span className="text-brand-faint">—</span>) },
    {
      key: 'flags', header: 'Cần xử lý',
      render: r => r.flags.length ? (
        <ul className="space-y-0.5 text-[10px] text-status-warning">
          {r.flags.map(f => <li key={f}>• {f}</li>)}
        </ul>
      ) : <span className="text-[10px] text-status-ok">✓</span>,
    },
  ];

  /* ── Theo tháng × đối tác ─────────────────────────────────────────── */
  const monthRows = Object.entries(totalsBy(rows, r => `${r.month}|${r.partner}`))
    .map(([k, t]) => {
      const [month, code] = k.split('|');
      const p = PARTNER_BY_CODE[code];
      const plan = (MKT_DATA.partner_plan || []).find(x => x.month === month && x.code === code)?.rev ?? null;
      return { month, code, name: p?.name ?? code, channel: (p?.channel ?? 'PARTNER') as PartnerChannel, t, plan };
    })
    .sort((a, b) => b.month.localeCompare(a.month) || a.channel.localeCompare(b.channel) || b.t.net - a.t.net);
  type MRow = (typeof monthRows)[0];
  const monthCols: Column<MRow>[] = [
    { key: 'month', header: 'Tháng', render: r => <span className="font-mono text-xs">{formatMonthLabel(r.month)}</span> },
    { key: 'channel', header: 'Kênh', render: r => <ChannelBadge ch={r.channel} /> },
    { key: 'name', header: 'Đối tác', render: r => <span className="font-semibold text-brand-text">{r.name}</span> },
    { key: 'bills', header: 'Hoá đơn', align: 'right', render: r => <span className="font-mono">{formatNumber(r.t.bills)}</span> },
    {
      key: 'net', header: 'Doanh thu', align: 'right',
      render: r => {
        const base = aggByMonth[r.month]?.net || 0;
        return (
          <div className="text-right font-mono leading-tight">
            <div className="font-bold text-brand-goldLight">{formatVND(r.t.net)}</div>
            <div className="text-[10px] text-brand-muted">{base ? `${formatPercent(r.t.net / base, 2)} DT chuỗi` : ''}</div>
          </div>
        );
      },
    },
    { key: 'aov', header: 'AOV', align: 'right', render: r => <span className="font-mono">{r.t.bills ? formatVND(r.t.net / r.t.bills) : '—'}</span> },
    { key: 'cost', header: 'Ưu đãi NOIRE chịu', align: 'right', render: r => <span className="font-mono">{r.t.cost ? formatVND(r.t.cost) : '—'}</span> },
    { key: 'fee', header: 'Phí nền tảng', align: 'right', render: r => <span className="font-mono">{r.t.fee ? `${formatVND(r.t.fee)}${r.t.fee_est ? '*' : ''}` : '—'}</span> },
    {
      key: 'plan', header: 'KH · đạt', align: 'right',
      render: r => r.plan === null ? <span className="font-mono text-brand-faint">—</span> : (
        <div className="text-right font-mono leading-tight">
          <div>{formatVND(r.plan)}</div>
          <div className={`text-[10px] ${r.t.net >= r.plan ? 'text-status-ok' : 'text-status-bad'}`}>{formatPercent(r.t.net / r.plan, 0)}</div>
        </div>
      ),
    },
  ];

  /* ── Nhận diện trên POS: tên CTKM thật · cách nhận · Campaign ID ───── */
  const camp = MKT_DATA.partner_camp || [];
  const traceRows = catalog.map(p => ({
    ...p,
    cids: camp.filter((c: any) => c.code === p.code && c.cid).map((c: any) => c.cid as string),
    mech: camp.filter((c: any) => c.code === p.code).map((c: any) => [c.mech, c.rate ? formatPercent(c.rate, 0) : null].filter(Boolean).join(' ')).filter(Boolean),
  }));
  type TRow = (typeof traceRows)[0];
  const traceCols: Column<TRow>[] = [
    { key: 'channel', header: 'Kênh', render: r => <ChannelBadge ch={r.channel} /> },
    { key: 'name', header: 'Đối tác', render: r => <span className="font-semibold text-brand-text">{r.name}</span> },
    {
      key: 'names', header: 'Tên CTKM thật trên POS',
      render: r => r.names.length
        ? <ul className="space-y-0.5 text-[11px] text-brand-muted">{r.names.map(n => <li key={n}>{n}</li>)}</ul>
        : <span className="text-[10px] text-brand-faint">{r.bases.some(b => b !== 'CTKM') ? 'không gắn CTKM — nhận qua Nguồn / PTTT / báo cáo' : 'chưa thấy trên POS'}</span>,
    },
    { key: 'bases', header: 'Cách nhận', render: r => (r.bases.length ? <BasisTags bases={r.bases} /> : <span className="text-brand-faint">—</span>) },
    { key: 'mech', header: 'Cơ chế', render: r => <span className="text-[11px]">{r.mech.join(' · ') || '—'}</span> },
    {
      key: 'cids', header: 'Campaign ID iPOS', align: 'center',
      render: r => r.cids.length
        ? r.cids.map(c => <span key={c} className="rounded border border-brand-border bg-brand-surface px-1.5 py-0.5 font-mono text-[10px] text-brand-goldLight">{c}</span>)
        : <span className="text-brand-faint">—</span>,
    },
  ];

  /* ── Kho mã đối tác phát ↔ đã dùng ─────────────────────────────────── */
  const codeRows = (MKT_DATA.partner_month || []).filter(r => ms.includes(r.month))
    .map(r => ({ ...r, name: PARTNER_BY_CODE[r.code]?.name ?? r.code }));
  type CRow = (typeof codeRows)[0];
  const codeCols: Column<CRow>[] = [
    { key: 'name', header: 'Đối tác', render: r => <span className="font-bold text-brand-text">{r.name}</span> },
    { key: 'month', header: 'Tháng', render: r => <span className="font-mono text-xs">{formatMonthLabel(r.month)}</span> },
    { key: 'issued', header: 'Mã đã phát', align: 'right', render: r => <span className="font-mono">{r.issued === null ? '—' : formatNumber(r.issued)}</span> },
    { key: 'used', header: 'Đã dùng (HĐ)', align: 'right', render: r => <span className="font-mono">{formatNumber(r.used)}</span> },
    {
      key: 'use_rate', header: 'Tỷ lệ dùng', align: 'right',
      render: r => r.use_rate === null ? <span className="font-mono text-brand-muted">—</span>
        : <StatusBadge variant={r.use_rate < 0.05 ? 'bad' : r.use_rate < 0.2 ? 'warning' : 'ok'} label={formatPercent(r.use_rate, 1)} />,
    },
    { key: 'rev', header: 'Doanh thu', align: 'right', render: r => <span className="font-mono">{r.rev ? formatVND(r.rev) : '—'}</span> },
  ];

  /* ── Đối soát số team báo cáo (S19) với POS ───────────────────────── */
  const recon = (MKT_DATA.partner_recon || []).filter(r => ms.includes(r.month));

  const chCard = (ch: PartnerChannel) => {
    const t = byCh[ch] ?? emptyTotals();
    const meta = CHANNEL_META[ch];
    return (
      <MetricCard
        key={ch}
        label={meta?.short ?? ch}
        subLabel={meta?.label}
        value={formatVND(t.net)}
        customDeltaText={`${formatNumber(t.bills)} HĐ · ${T.net ? formatPercent(t.net / T.net, 0) : '—'} doanh thu đối tác${t.net_report ? ` · ${formatVND(t.net_report)} từ báo cáo` : ''}`}
      />
    );
  };

  return (
    <div className="space-y-5 p-4 sm:p-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div>
        <span className="text-[10px] font-extrabold uppercase tracking-widest text-brand-gold">ĐỐI TÁC MANG LẠI GÌ</span>
        <h2 className="text-xl font-extrabold text-brand-text font-display mt-0.5">
          M9 · Partnership — Aggregator + Partner
        </h2>
        <p className="text-xs text-brand-muted mt-1">
          Đối tác gồm hai kênh. Mỗi hoá đơn thuộc MỘT đối tác, nhận trên bảng kê POS theo thứ tự: tên CTKM → Nguồn đơn → thanh toán qua nền tảng.
          Cùng một bảng số với thẻ “Đối tác” ở M7.
        </p>
      </div>

      {/* Hai kênh */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {CHANNELS.map(c => (
          <div key={c.code} className="rounded-xl border bg-brand-surface p-3 text-xs" style={{ borderColor: `${c.color}55` }}>
            <div className="mb-1 flex items-center gap-2">
              <ChannelBadge ch={c.code} />
              <b className="text-brand-text">{c.label}</b>
            </div>
            <p className="text-brand-muted">{c.desc}</p>
          </div>
        ))}
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <MetricCard
          label="Doanh Thu Đối Tác"
          subLabel="Tổng tiền cả hoá đơn · Aggregator + Partner"
          value={formatVND(T.net)}
          variant="hero"
          customDeltaText={`${chainNet ? formatPercent(T.net / chainNet, 1) : '—'} DT chuỗi · ${formatNumber(T.bills)} HĐ · AOV ${T.bills ? formatVND(T.net / T.bills) : '—'}`}
        />
        {CHANNELS.map(c => chCard(c.code))}
        <MetricCard
          label="Chi Phí Đối Tác"
          subLabel="Ưu đãi NOIRE chịu + phí nền tảng"
          value={formatVND(cost(T))}
          variant={T.net && cost(T) / T.net > 0.3 ? 'warning' : 'default'}
          customDeltaText={`${T.net ? formatPercent(cost(T) / T.net) : '—'} DT đối tác · ưu đãi ${formatVND(T.cost)} · phí ${formatVND(T.fee)}${T.fee_est ? ` (ước tính ${formatVND(T.fee_est)})` : ''}`}
        />
        <MetricCard
          label="Đối Tác Phát Sinh"
          subLabel="Có hoá đơn trong kỳ / danh mục"
          value={`${active.length}/${table.length}`}
          variant={flagged.length ? 'warning' : 'default'}
          customDeltaText={flagged.length ? `${flagged.length} đối tác cần xử lý danh mục` : 'Danh mục khớp thực tế'}
        />
      </div>

      {/* Biểu đồ */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card
          title="Doanh Thu Đối Tác Theo Tháng & Kênh"
          description="Tổng tiền cả hoá đơn đối tác — cột chồng Aggregator + Partner, di chuột xem % doanh thu chuỗi"
          chip="THEO THÁNG" hero className="lg:col-span-2"
        >
          <EChartWrapper option={barOption} height={280} />
        </Card>
        <Card title="Xếp Hạng Đối Tác" description="Doanh thu kỳ lọc · màu theo kênh · nhãn = % tổng đối tác" chip="XẾP HẠNG">
          {ranked.length ? <EChartWrapper option={rankOption} height={280} /> : <p className="py-10 text-center text-xs text-brand-muted">Không có hoá đơn đối tác trong kỳ lọc</p>}
        </Card>
      </div>

      {/* Bảng chính */}
      <Card
        title="Kết Quả Theo Đối Tác"
        description="Mỗi dòng một đối tác trong danh mục (L0 · 05_DOI_TAC/01_Danh_Muc). Doanh thu = Tổng tiền cả hoá đơn · Chi phí = ưu đãi NOIRE chịu (giảm giá + phiếu GG × % NOIRE chịu) + phí nền tảng · * = phí ước tính theo % hoa hồng danh mục vì POS không ghi."
        chip={`${active.length} ĐANG PHÁT SINH`} hero
      >
        <DataTable
          columns={columns}
          data={table}
          searchPlaceholder="Tìm đối tác, loại, kênh..."
          searchKeys={['name', 'code', 'kind', 'channel', 'brand']}
          pageSize={12}
          exportFilename="Noire_Doi_Tac"
        />
      </Card>

      {/* Theo tháng */}
      <Card title="Kết Quả Đối Tác Theo Tháng" description="Lát cắt tháng × đối tác — so với kế hoạch ở sheet 3. Kế Hoạch của danh mục" chip="ĐỐI TÁC × THÁNG">
        <DataTable columns={monthCols} data={monthRows} searchable={false} pageSize={10} exportFilename="Noire_Doi_Tac_Thang" />
      </Card>

      {/* Nhận diện */}
      <Card
        title="Nhận Diện Hoá Đơn Đối Tác Trên POS"
        description="Truy vết: tên CTKM thật trên bảng kê đã được gắn cho đối tác nào. Luật nhận khai một chỗ ở data_contract.json ($promo_nature.rules[].partner · $partner.pos) — mọi biến thể tên theo brand tự nhận."
        chip="TRUY VẾT"
      >
        <DataTable columns={traceCols} data={traceRows} searchable={false} pageSize={12} exportFilename="Noire_Doi_Tac_Nhan_Dien" />
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Kho mã */}
        <Card
          title="Kho Mã Đối Tác: Đã Phát ↔ Đã Dùng"
          description="Mã phát = file eVoucher đối tác gửi · Đã dùng = số hoá đơn gắn CTKM của đối tác cùng tháng. Phát mã không đồng nghĩa có khách."
          chip="EVOUCHER"
        >
          {codeRows.length
            ? <DataTable columns={codeCols} data={codeRows} searchable={false} pageSize={6} exportFilename="Noire_Doi_Tac_Kho_Ma" />
            : <p className="py-6 text-center text-xs text-brand-muted">Kỳ lọc chưa có file eVoucher đối tác</p>}
        </Card>

        {/* Đối soát báo cáo team */}
        <Card
          title="Đối Soát Báo Cáo Team ↔ POS"
          description="Báo cáo Promotion-AGG (S19) ghi Sales = trước giảm giá − giảm giá của đơn có Nguồn nền tảng. POS còn có đơn trả qua ví nền tảng mà thu ngân chưa chọn Nguồn."
          chip="ĐỐI SOÁT"
        >
          {recon.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-brand-border text-[10px] uppercase text-brand-muted">
                    <th className="p-2 text-left">Tháng · đối tác</th>
                    <th className="p-2 text-right">Báo cáo team</th>
                    <th className="p-2 text-right">POS · Nguồn</th>
                    <th className="p-2 text-right">POS · gồm PTTT</th>
                  </tr>
                </thead>
                <tbody>
                  {recon.map(r => {
                    const same = Math.abs(r.report_sales - r.pos_sales_src) < 1 && r.report_orders === r.pos_orders_src;
                    const miss = r.pos_sales_all - r.report_sales;
                    return (
                      <tr key={r.month + r.partner} className="border-b border-brand-border/50 align-top">
                        <td className="p-2">
                          <div className="font-mono">{formatMonthLabel(r.month)}</div>
                          <div className="font-semibold text-brand-text">{PARTNER_BY_CODE[r.partner]?.name ?? r.partner}</div>
                        </td>
                        <td className="p-2 text-right font-mono">{formatVND(r.report_sales)}<div className="text-[10px] text-brand-muted">{formatNumber(r.report_orders)} đơn</div></td>
                        <td className="p-2 text-right font-mono">
                          {formatVND(r.pos_sales_src)}
                          <div className={`text-[10px] ${same ? 'text-status-ok' : 'text-status-bad'}`}>{formatNumber(r.pos_orders_src)} đơn · {same ? 'khớp' : 'lệch'}</div>
                        </td>
                        <td className="p-2 text-right font-mono">
                          {formatVND(r.pos_sales_all)}
                          <div className={`text-[10px] ${miss > 0 ? 'text-status-warning' : 'text-brand-muted'}`}>
                            {formatNumber(r.pos_orders_all)} đơn{miss > 0 ? ` · báo cáo thiếu ${formatVND(miss)}` : ''}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : <p className="py-6 text-center text-xs text-brand-muted">Kỳ lọc không có báo cáo team để đối soát</p>}
        </Card>
      </div>

      {/* Voucher iPOS — tham khảo */}
      <VoucherProgCard isDark={isDark} />

      <p className="text-[10px] text-brand-faint">
        Doanh thu chuỗi dùng làm mẫu số: {formatVND(chainNet)} ({ms.length ? `${formatMonthLabel(ms[0])} → ${formatMonthLabel(ms[ms.length - 1])}` : '—'} · theo brand và phạm vi cửa hàng đang lọc).
      </p>
    </div>
  );
};

/* Kho mã voucher iPOS của chính NOIRE (log voucher S11) — tham khảo, KHÔNG phải số đối tác. */
const VoucherProgCard: React.FC<{ isDark: boolean }> = ({ isDark }) => {
  const { filters } = useFilters();
  const VP = (MKT_DATA.voucher_prog || [])
    .filter(v => filters.brand === 'ALL' || v.brand === filters.brand || v.brand === 'Nhiều brand')
    .slice(0, 10);
  if (!VP.length) return null;
  const option: EChartsOption = {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { top: 0, textStyle: { color: '#9E9B93', fontSize: 11 } },
    grid: { top: 35, right: 25, bottom: 25, left: 160 },
    xAxis: {
      type: 'value',
      axisLabel: { formatter: (v: number) => formatNumber(v), color: '#9E9B93', fontSize: 10 },
      splitLine: { lineStyle: { color: '#1F1F26', type: 'dashed' } },
    },
    yAxis: {
      type: 'category', data: VP.map(v => (v.prog.length > 22 ? v.prog.slice(0, 20) + '…' : v.prog)),
      axisLine: { lineStyle: { color: '#2A2A33' } },
      axisLabel: { color: isDark ? '#F3F2EE' : '#18181B', fontSize: 10 },
    },
    series: [
      { name: 'Đã sử dụng', type: 'bar', stack: 'v', data: VP.map(v => v.used), itemStyle: { color: '#22C55E' }, barMaxWidth: 16 },
      { name: 'Chưa sử dụng', type: 'bar', stack: 'v', data: VP.map(v => v.issued - v.used), itemStyle: { color: '#82846C' }, barMaxWidth: 16 },
    ],
  };
  return (
    <Card
      title="Kho Mã Voucher iPOS (tham khảo)"
      description="Chương trình voucher NOIRE tự phát qua iPOS (log voucher) — gồm cả loyalty, không phải số đối tác. Đối tác chỉ đọc ở các bảng phía trên."
      chip="VOUCHER IPOS"
    >
      <EChartWrapper option={option} height={280} />
    </Card>
  );
};
