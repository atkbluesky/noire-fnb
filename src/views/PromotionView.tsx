import React from 'react';
import { useFilters } from '../context/FilterContext';
import { HUB_DATA } from '../data';
import { MetricCard } from '../components/common/MetricCard';
import { Card } from '../components/common/Card';
import { StatusBadge, BadgeVariant } from '../components/common/StatusBadge';
import { DataTable, Column } from '../components/common/DataTable';
import { EChartWrapper } from '../components/charts/EChartWrapper';
import { formatVND, formatNumber, formatPercent, formatMonthLabel } from '../utils/formatters';
import type { EChartsOption } from 'echarts';
import { PromotionTabs } from '../components/common/PromotionTabs';
import { CAMPAIGN } from '../data/campaign';
import { CHANNELS, CHANNEL_META, PARTNER_BY_CODE, BASIS_META, partnerRows, totals, totalsBy, PartnerTotals } from '../utils/partner';
import type { PartnerChannel } from '../types/mkt';

export const PromotionView: React.FC = () => {
  const { filters, brandMatches, selectedMonths, aggByMonth, theme, setActiveView } = useFilters();
  const isDark = theme === 'dark';

  const ms = selectedMonths;

  /* Danh sách bản chất, nhãn, màu và THỨ TỰ đều đến từ data_contract.json →
     $promo_nature, loader chuyển xuống thành HUB_DATA.nature_meta. Trước đây ba
     thứ này được gõ cứng ngay tại đây và ở bốn file khác — thêm nhãn CARE phải
     sửa năm chỗ, quên một chỗ là màn hình nuốt mất cả một nhóm chi phí. */
  const NATURE_META = HUB_DATA.nature_meta ?? [];
  const NAT = NATURE_META.map(n => n.code);

  /* ── Đối tác = Aggregator + Partner ───────────────────────────────────
     Thẻ bản chất "Đối tác" (HUB_DATA.nature · PARTNER) đã gồm cả hoá đơn nền tảng không gắn
     CTKM (Grab Dine Out · GrabFood · Dining City). Tách kênh đọc từ partner_fact qua CÙNG hàm
     với M9 — tổng hai kênh bằng đúng thẻ Đối tác. */
  const PR = partnerRows(ms, brandMatches);
  const PT = totals(PR);
  const PCH = totalsBy(PR, r => r.channel);
  const PBY = totalsBy(PR, r => r.partner);
  const pCost = (t: PartnerTotals) => t.cost + t.fee;
  const partnerTop = Object.entries(PBY)
    .map(([code, t]) => ({ code, t, p: PARTNER_BY_CODE[code] }))
    .sort((a, b) => (a.p?.channel ?? '').localeCompare(b.p?.channel ?? '') || b.t.net - a.t.net);

  const natureColors: Record<string, string> = Object.fromEntries(
    NATURE_META.map(n => [n.code, n.color]),
  );
  const natureLabel: Record<string, string> = Object.fromEntries(
    NATURE_META.map(n => [n.code, n.short]),
  );
  const natureBadge: Record<string, BadgeVariant> = Object.fromEntries(
    NATURE_META.map(n => [n.code, n.badge as BadgeVariant]),
  );

  const keepRow = (r: any) => ms.includes(r.month) && brandMatches(r.brand);

  const natTotals: Record<string, { rev: number; bills: number }> = {};
  NAT.forEach(n => {
    natTotals[n] = { rev: 0, bills: 0 };
  });

  (HUB_DATA.nature || []).forEach(r => {
    if (keepRow(r) && natTotals[r.nature]) {
      natTotals[r.nature].rev += r.rev;
      natTotals[r.nature].bills += r.bills;
    }
  });

  const totalNatRev = NAT.reduce((acc, n) => acc + natTotals[n].rev, 0);
  const totalPeriodNet = ms.reduce((acc, m) => acc + (aggByMonth[m]?.net || 0), 0);

  // Group by month for stacked bar
  const byMonthNat: Record<string, Record<string, number>> = {};
  ms.forEach(m => {
    byMonthNat[m] = {};
    NAT.forEach(n => {
      byMonthNat[m][n] = 0;
    });
  });

  (HUB_DATA.nature || []).forEach(r => {
    if (keepRow(r) && byMonthNat[r.month]) {
      byMonthNat[r.month][r.nature] += r.rev;
    }
  });

  // 1. Stacked Bar Chart
  const stackedOption: EChartsOption = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: any) => {
        let res = `<div class="font-bold text-xs mb-1 border-b border-brand-border pb-1">${params[0]?.axisValue}</div>`;
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
    grid: { top: 35, right: 20, bottom: 25, left: 65 },
    xAxis: {
      type: 'category',
      data: ms.map(m => formatMonthLabel(m)),
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
    series: NAT.map(n => ({
      name: natureLabel[n] ?? n,
      type: 'bar' as const,
      stack: 'nature',
      data: ms.map(m => byMonthNat[m][n] || 0),
      itemStyle: { color: natureColors[n] },
      barMaxWidth: 38,
    })),
  };

  // 2. Donut Chart
  const donutOption: EChartsOption = {
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
        name: 'Bản chất CTKM',
        type: 'pie',
        radius: ['50%', '75%'],
        center: ['50%', '45%'],
        itemStyle: { borderRadius: 4, borderColor: isDark ? '#141417' : '#FFFFFF', borderWidth: 2 },
        label: { show: false },
        data: NAT.map(n => ({
          name: natureLabel[n] ?? n,
          value: natTotals[n].rev,
          itemStyle: { color: natureColors[n] },
        })),
      },
    ],
  };

  // Top 25 chương trình — CÙNG ĐỊNH NGHĨA với M7.2, theo tháng + brand đang lọc
  const PM = (HUB_DATA.promo_month || []).filter(r => ms.includes(r.month) && brandMatches(r.brand));
  const aggregatedCamp: Record<string, { name: string; nature: string; net: number; bills: number; cost: number; brands: Set<string> }> = {};
  PM.forEach(r => {
    const k = `${r.name}|${r.nature}`;
    const x = (aggregatedCamp[k] ||= { name: r.name, nature: r.nature, net: 0, bills: 0, cost: 0, brands: new Set() });
    x.net += r.net;
    x.bills += r.bills;
    x.cost += r.disc + r.voucher;
    x.brands.add(r.brand);
  });
  // nền so sánh: cả cửa hàng của đúng brand + tháng đang lọc
  const storeBase = (brands: Set<string>) => {
    let net = 0, tc = 0;
    (HUB_DATA.store_month || []).forEach((r: any) => {
      if (ms.includes(r.month) && brands.has(HUB_DATA.stores[r.store]?.brand)) { net += r.net; tc += r.tc; }
    });
    return { net, tc };
  };
  const topCampaignList = Object.values(aggregatedCamp)
    .sort((a, b) => b.net - a.net)
    .slice(0, 25)
    .map(x => ({ ...x, base: storeBase(x.brands) }));

  /* Danh mục chương trình chung của cụm M7 (Campaign_Tracking · L0_input): tên CTKM trên POS
     tra ngược ra chương trình, mã kế hoạch Pre-Analysis và trạng thái chấm ở M7.2. */
  const CAMP_BY_ID = Object.fromEntries(CAMPAIGN.campaigns.map(c => [c.id, c]));
  const LABEL_META = Object.fromEntries(CAMPAIGN.taxonomy.labels.map(l => [l.code, l]));
  const campOf = (posName: string) => CAMP_BY_ID[CAMPAIGN.pos_map[posName.trim().toLowerCase()] ?? ''];
  const cat = CAMPAIGN.campaigns.filter(c => !c.brand || c.brand === 'ALL' || brandMatches(c.brand));
  const catPlan = (CAMPAIGN.plan || []).filter(p => !p.brand || brandMatches(p.brand));
  const catLinked = cat.filter(c => c.source === 'PRE_POS').length;
  const catPosOnly = cat.filter(c => c.source === 'POS' || c.source === 'REPORT').length;

  const topCampColumns: Column<typeof topCampaignList[0]>[] = [
    {
      key: 'name',
      header: 'Tên chương trình ưu đãi',
      render: (row, idx) => (
        <div className="flex items-center gap-2">
          <span className="font-mono text-brand-gold font-bold">{idx + 1}.</span>
          <span className="font-bold text-brand-text">{row.name}</span>
        </div>
      ),
    },
    {
      key: 'program',
      header: 'Chương trình (M7.2)',
      render: row => {
        const c = campOf(row.name);
        if (!c) {
          return (
            <span className="text-[10px] text-brand-muted">
              {row.nature === 'INTERNAL' ? 'ưu đãi nội bộ · không phải CT marketing' : 'chưa khai trong danh mục'}
            </span>
          );
        }
        const L = LABEL_META[c.label];
        return (
          <button className="text-left leading-tight" onClick={() => setActiveView('m72')} title="Mở M7.2">
            <div className="text-[11px] font-semibold text-brand-text">
              {c.pre_id && <span className="mr-1 font-mono text-brand-gold">{c.pre_id}</span>}{c.name}
            </div>
            <StatusBadge label={L?.label ?? c.label} variant={(L?.badge as BadgeVariant) ?? 'neutral'} />
          </button>
        );
      },
    },
    {
      key: 'nature',
      header: 'Bản chất',
      render: row => {
        return (
          <StatusBadge
            label={natureLabel[row.nature] ?? row.nature}
            variant={natureBadge[row.nature] ?? 'neutral'}
          />
        );
      },
    },
    {
      key: 'net', header: 'Doanh thu CTKM', align: 'right',
      render: row => (
        <div className="text-right font-mono leading-tight">
          <div className="font-bold text-brand-goldLight">{formatVND(row.net)}</div>
          <div className="text-[10px] text-brand-muted">
            {row.base.net ? formatPercent(row.net / row.base.net, 1) : '—'} DT {Array.from(row.brands).join('·')}
          </div>
        </div>
      ),
    },
    {
      key: 'bills', header: 'Hoá đơn', align: 'right',
      render: row => (
        <div className="text-right font-mono leading-tight">
          <div>{formatNumber(row.bills)}</div>
          <div className="text-[10px] text-brand-muted">{row.base.tc ? formatPercent(row.bills / row.base.tc, 1) : '—'} HĐ cửa hàng</div>
        </div>
      ),
    },
    {
      key: 'aov', header: 'AOV', align: 'right',
      render: row => {
        const aov = row.bills ? row.net / row.bills : 0;
        const sa = row.base.tc ? row.base.net / row.base.tc : 0;
        const d = sa ? aov / sa - 1 : null;
        return (
          <div className="text-right font-mono leading-tight">
            <div>{row.bills ? formatVND(aov) : '—'}</div>
            <div className={`text-[10px] ${d === null ? 'text-brand-muted' : d >= 0 ? 'text-status-ok' : 'text-status-bad'}`}>
              {d === null ? '—' : `${d >= 0 ? '+' : ''}${formatPercent(d, 0)} so AOV CH`}
            </div>
          </div>
        );
      },
    },
    {
      key: 'cost', header: 'Chi phí ưu đãi', align: 'right',
      render: row => (
        <div className="text-right font-mono leading-tight">
          <div>{formatVND(row.cost)}</div>
          <div className="text-[10px] text-brand-muted">{row.net ? formatPercent(row.cost / row.net, 1) : '—'} DT CTKM</div>
        </div>
      ),
    },
  ];


  type PRow = (typeof partnerTop)[0];
  const partnerColumns: Column<PRow>[] = [
    {
      key: 'channel', header: 'Kênh',
      render: r => {
        const c = CHANNEL_META[(r.p?.channel ?? 'PARTNER') as PartnerChannel];
        return <span className="rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase"
          style={{ color: c?.color, borderColor: `${c?.color}66`, backgroundColor: `${c?.color}1A` }}>{c?.short}</span>;
      },
    },
    {
      key: 'name', header: 'Đối tác',
      render: r => (
        <div className="leading-tight">
          <div className="font-bold text-brand-text">{r.p?.name ?? r.code}</div>
          <div className="text-[10px] text-brand-faint">{r.p?.kind ?? '—'}</div>
        </div>
      ),
    },
    { key: 'bills', header: 'Hoá đơn', align: 'right', render: r => <span className="font-mono">{formatNumber(r.t.bills)}</span> },
    {
      key: 'net', header: 'Doanh thu', align: 'right',
      render: r => (
        <div className="text-right font-mono leading-tight">
          <div className="font-bold text-brand-goldLight">{formatVND(r.t.net)}</div>
          <div className="text-[10px] text-brand-muted">{totalPeriodNet ? formatPercent(r.t.net / totalPeriodNet, 2) : '—'} DT brand</div>
        </div>
      ),
    },
    { key: 'aov', header: 'AOV', align: 'right', render: r => <span className="font-mono">{r.t.bills ? formatVND(r.t.net / r.t.bills) : '—'}</span> },
    {
      key: 'cost', header: 'Chi phí', align: 'right',
      render: r => (
        <div className="text-right font-mono leading-tight">
          <div>{pCost(r.t) ? formatVND(pCost(r.t)) : '—'}</div>
          <div className="text-[10px] text-brand-muted">
            {r.t.cost ? `ưu đãi ${formatVND(r.t.cost)}` : ''}{r.t.cost && r.t.fee ? ' · ' : ''}{r.t.fee ? `phí ${formatVND(r.t.fee)}${r.t.fee_est ? '*' : ''}` : ''}
          </div>
        </div>
      ),
    },
    {
      key: 'basis', header: 'Nguồn số',
      render: r => (
        <span className="text-[10px] text-brand-muted">
          {[...new Set(PR.filter(x => x.partner === r.code).map(x => BASIS_META[x.basis]?.label ?? x.basis))].join(' · ')}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-5 p-4 sm:p-6 max-w-[1600px] mx-auto">
      <PromotionTabs />

      {/* Header */}
      <div>
        <span className="text-[10px] font-extrabold uppercase tracking-widest text-brand-gold">
          CHI PHÍ ƯU ĐÃI THẬT SỰ ĐI ĐÂU
        </span>
        <h2 className="text-xl font-extrabold text-brand-text font-display mt-0.5">
          M7 · Promotion — Tổng Quan &amp; {NAT.length} Bản Chất Chi Phí
        </h2>
        <p className="text-xs text-brand-muted mt-1">
          Phân định theo AI TRẢ TIỀN: {NATURE_META.map(n => n.label).join(' | ')}.
        </p>
      </div>

      {/* Danh mục chương trình — master chung M7 · M7.1 · M7.2 */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricCard label="Danh mục chương trình" subLabel="Campaign_Tracking · L0_input" value={cat.length} unit="CT"
          customDeltaText="một danh mục cho M7 · M7.1 · M7.2" />
        <MetricCard label="Kế hoạch Pre-Analysis" subLabel="M7.1" value={catPlan.length} unit="CT"
          customDeltaText={`${catPlan.filter(p => p.label && p.label !== 'KE_HOACH').length} đã chạy trên POS`} />
        <MetricCard label="Khớp kế hoạch ↔ POS" subLabel="chấm theo kế hoạch ở M7.2" value={catLinked} unit="CT"
          customDeltaText="đã soát brand · kỳ · ưu đãi" />
        <MetricCard label="Chỉ có trên POS" subLabel="chưa có kế hoạch" value={catPosOnly} unit="CT"
          variant={catPosOnly ? 'warning' : 'default'}
          customDeltaText={`${formatPercent(CAMPAIGN.coverage.mapped_pct ?? 0)} doanh thu CTKM đã gắn chương trình`} />
      </div>

      {/* Nature Rule Banner */}
      <div className="rounded-xl border border-brand-border bg-brand-surface p-4 text-xs text-brand-muted space-y-1">
        <p className="mb-2">
          <b>{NAT.length} bản chất — tuyệt đối không gộp chung.</b> Gộp lại là mọi con số ROI marketing đều sai,
          và sai theo hướng làm marketing trông tệ hơn thực tế.
        </p>
        <ul className="space-y-1">
          {NATURE_META.map(n => (
            <li key={n.code} className="flex gap-2">
              <span
                className="mt-1 h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: n.color }}
              />
              <span>
                <b style={{ color: n.color }}>{n.label}</b>
                <span className="text-brand-muted"> — {n.desc}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Thẻ KPI — một thẻ mỗi bản chất, số cột theo số bản chất đang khai */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {NATURE_META.map(n => (
          <MetricCard
            key={n.code}
            label={n.short}
            subLabel={n.code === 'PARTNER' ? 'Tổng tiền hoá đơn đối tác (CTKM + đơn nền tảng)' : 'Tổng tiền cả hoá đơn gắn CTKM'}
            value={formatVND(natTotals[n.code].rev)}
            customDeltaText={n.code === 'PARTNER'
              ? `${totalPeriodNet ? formatPercent(natTotals[n.code].rev / totalPeriodNet) : '—'} DT brand · ${CHANNELS.map(c => `${c.short} ${formatVND(PCH[c.code]?.net ?? 0)}`).join(' · ')}`
              : `${totalPeriodNet ? formatPercent(natTotals[n.code].rev / totalPeriodNet) : '—'} DT brand · ${formatNumber(natTotals[n.code].bills)} HĐ · ${formatPercent(natTotals[n.code].rev / totalNatRev)} tổng CTKM`}
            /* Cảnh báo cam cho nhóm KHÔNG vào ROI marketing — `roi` khai ở hợp đồng,
               không đoán theo tên nhãn. */
            variant={n.roi === 'none' ? 'warning' : 'default'}
          />
        ))}
      </div>

      {/* Row 1: Stacked Bar & Donut */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card
          title="Doanh Thu Gắn CTKM Theo Tháng & Bản Chất"
          description="Theo dõi tỷ trọng ưu đãi nội bộ và thương mại qua các tháng"
          chip="CỘT CHỒNG"
          hero={true}
          className="lg:col-span-2"
        >
          <EChartWrapper option={stackedOption} height={280} />
        </Card>

        <Card
          title={`Tỷ Trọng ${NAT.length} Bản Chất`}
          description={`Luỹ kế kỳ chọn · tổng doanh thu CTKM & đối tác ${formatVND(totalNatRev)} = ${formatPercent(totalNatRev / totalPeriodNet)} DT brand ${formatVND(totalPeriodNet)}`}
          chip="TỶ TRỌNG"
        >
          <EChartWrapper option={donutOption} height={280} />
        </Card>
      </div>

      {/* Top 25 Campaigns Table */}
      <Card
        title="Top 25 Chương Trình Theo Doanh Thu CTKM"
        description="Doanh thu CTKM = Tổng tiền CẢ hoá đơn gắn tên CTKM (cùng định nghĩa M7.2) · dòng dưới = % so với cả cửa hàng của brand trong tháng đang lọc · chi phí ưu đãi = giảm giá + phiếu GG"
        chip="TOP CAMPAIGNS"
      >
        <DataTable
          columns={topCampColumns}
          data={topCampaignList}
          searchPlaceholder="Tìm chương trình khuyến mãi..."
          searchKeys={['name', 'nature'] as any}
          pageSize={10}
          exportFilename="Noire_Top_25_Promotions"
        />
      </Card>

      {/* Đối tác = Aggregator + Partner — cùng bảng số với M9 */}
      {PR.length > 0 && (
        <Card
          title="Đối Tác = Aggregator + Partner"
          description="Thẻ “Đối tác” ở trên tách theo hai kênh · Doanh thu = Tổng tiền cả hoá đơn · Chi phí = ưu đãi NOIRE chịu + phí nền tảng (* = ước tính theo % hoa hồng danh mục) · chi tiết, kế hoạch, cờ danh mục ở M9"
          chip="ĐỐI TÁC"
          headerAction={
            <button onClick={() => setActiveView('m9')}
              className="rounded-lg border border-brand-border px-2.5 py-1 text-[11px] font-semibold text-brand-goldLight hover:bg-brand-card">
              Mở M9 →
            </button>
          }
        >
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MetricCard
              label="Tổng Đối Tác"
              subLabel="Aggregator + Partner"
              value={formatVND(PT.net)}
              customDeltaText={`${formatNumber(PT.bills)} HĐ · ${totalPeriodNet ? formatPercent(PT.net / totalPeriodNet) : '—'} DT brand`}
            />
            {CHANNELS.map(c => (
              <MetricCard
                key={c.code}
                label={c.short}
                subLabel={c.label}
                value={formatVND(PCH[c.code]?.net ?? 0)}
                customDeltaText={`${formatNumber(PCH[c.code]?.bills ?? 0)} HĐ · ${PT.net ? formatPercent((PCH[c.code]?.net ?? 0) / PT.net, 0) : '—'} đối tác`}
              />
            ))}
            <MetricCard
              label="Chi Phí Đối Tác"
              subLabel="ưu đãi NOIRE chịu + phí nền tảng"
              value={formatVND(pCost(PT))}
              variant={PT.net && pCost(PT) / PT.net > 0.3 ? 'warning' : 'default'}
              customDeltaText={`${PT.net ? formatPercent(pCost(PT) / PT.net) : '—'} DT đối tác · phí ${formatVND(PT.fee)}${PT.fee_est ? ` (ước tính ${formatVND(PT.fee_est)})` : ''}`}
            />
          </div>
          <DataTable
            columns={partnerColumns}
            data={partnerTop}
            searchable={false}
            pageSize={8}
            exportFilename="Noire_M7_Doi_Tac"
          />
        </Card>
      )}
    </div>
  );
};
