import React from 'react';
import { useFilters } from '../context/FilterContext';
import { MKT_DATA, HUB_DATA, BRAND_COLORS } from '../data';
import { MetricCard } from '../components/common/MetricCard';
import { Card } from '../components/common/Card';
import { StatusBadge } from '../components/common/StatusBadge';
import { DataTable, Column } from '../components/common/DataTable';
import { EChartWrapper } from '../components/charts/EChartWrapper';
import { formatVND, formatNumber, formatPercent, formatMonthLabel } from '../utils/formatters';
import type { EChartsOption } from 'echarts';

export const DigitalAdsView: React.FC = () => {
  const { filters, brandMatches, selectedMonths, isPartialMonth } = useFilters();

  const AMall = MKT_DATA.ads_month || [];
  const AB = MKT_DATA.ads_brand || [];
  const AOall = MKT_DATA.ads_objective || [];
  const ACall = MKT_DATA.ads_campaign || [];
  const AS = MKT_DATA.ads_stat || { spend: 0, reach: 0, campaigns: 0, hr_spend: 0, missing: [] };

  const ms = selectedMonths;
  const lastMonth = ms[ms.length - 1] || '2026-08';

  // Monthly ads spend
  const AM = ms.map(m => {
    if (filters.brand === 'ALL') {
      return AMall.find(a => a.month === m) || { month: m, spend: 0, reach: 0, n: 0 };
    }
    const rs = AB.filter(r => r.month === m && r.brand === filters.brand);
    return {
      month: m,
      spend: rs.reduce((a, r) => a + r.spend, 0),
      reach: rs.reduce((a, r) => a + r.reach, 0),
      n: ACall.filter(c => c.brand === filters.brand).length,
    };
  });

  // Calculate Ad Cost Ratio = Media Spend ÷ Net Sales
  const netByMonth: Record<string, number> = {};
  HUB_DATA.store_month.forEach(r => {
    if (filters.brand !== 'ALL' && HUB_DATA.stores[r.store]?.brand !== filters.brand) return;
    netByMonth[r.month] = (netByMonth[r.month] || 0) + (r.net || 0);
  });

  const hrByMonth: Record<string, number> = {};
  AB.forEach(r => {
    if (r.brand === 'Tuyển dụng') {
      hrByMonth[r.month] = (hrByMonth[r.month] || 0) + r.spend;
    }
  });

  const acrSeries = ms.map(m => {
    const a = AM.find(x => x.month === m);
    const mediaSpend = (a?.spend || 0) - (hrByMonth[m] || 0);
    const net = netByMonth[m];
    return net > 0 ? (mediaSpend / net) * 100 : null;
  });

  // Last full month for ACR reference
  const fullMonths = ms.filter(m => !isPartialMonth(m));
  const acrFullMonth = fullMonths[fullMonths.length - 1] || lastMonth;
  const lastFullAds = AM.find(x => x.month === acrFullMonth);
  const lastFullNet = netByMonth[acrFullMonth] || 0;
  const lastFullACR =
    lastFullNet > 0 ? (((lastFullAds?.spend || 0) - (hrByMonth[acrFullMonth] || 0)) / lastFullNet) * 100 : null;

  const totalPeriodMedia = ms.reduce((acc, m) => {
    const x = AM.find(y => y.month === m);
    return acc + (x ? (x.spend || 0) - (filters.brand === 'ALL' ? hrByMonth[m] || 0 : 0) : 0);
  }, 0);

  // Message objective metrics
  const msgResults = AOall
    .filter(o => o.month === lastMonth && o.objective === 'Tin nhắn')
    .reduce((a, b) => a + b.result, 0);
  const msgSpend = AOall
    .filter(o => o.month === lastMonth && o.objective === 'Tin nhắn')
    .reduce((a, b) => a + b.spend, 0);
  const cpmMessage = msgResults > 0 ? msgSpend / msgResults : 0;

  // 1. ACR Trend Chart
  const acrOption: EChartsOption = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
      formatter: (params: any) => {
        let res = `<div class="font-bold text-xs mb-1">${params[0]?.axisValue}</div>`;
        params.forEach((item: any) => {
          res += `<div class="flex items-center justify-between gap-4 text-xs py-0.5 font-mono">
            <span>${item.marker} ${item.seriesName}:</span>
            <b>${item.seriesIndex === 0 ? formatVND(item.value) : item.value?.toFixed(2) + '%'}</b>
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
      data: ms.map(m => formatMonthLabel(m)),
      axisLine: { lineStyle: { color: '#2A2A33' } },
      axisLabel: { color: '#9E9B93', fontSize: 11 },
    },
    yAxis: [
      {
        type: 'value',
        name: 'Chi tiêu Media (VNĐ)',
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
        name: 'ACR %',
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
        name: 'Chi tiêu Media',
        type: 'bar',
        data: ms.map(m => {
          const a = AM.find(x => x.month === m);
          return (a?.spend || 0) - (filters.brand === 'ALL' ? hrByMonth[m] || 0 : 0);
        }),
        itemStyle: { color: '#C5A059', borderRadius: [4, 4, 0, 0] },
        barMaxWidth: 32,
      },
      {
        name: 'Ad Cost Ratio (ACR)',
        type: 'line',
        yAxisIndex: 1,
        data: acrSeries,
        lineStyle: { color: '#EF4444', width: 2.5 },
        itemStyle: { color: '#EF4444' },
        symbolSize: 6,
      },
    ],
  };

  // 2. Budget vs Actual Realization Table
  const B = MKT_DATA.budget || { channel: [] };
  const CH = B.channel || [];
  const GS = MKT_DATA.gads_stat || { spend: 0, period: '', n: 0, conv: 0 };

  const getPlanQ3 = (channelName: string) =>
    CH.filter(c => c.channel === channelName).reduce((a, c) => a + c.plan, 0);

  const getPlanToAug = (channelName: string) =>
    CH.filter(c => c.channel === channelName).reduce(
      (a, c) => a + (c['2026-07'] || 0) + (c['2026-08'] || 0),
      0
    );

  const metaQ3Spend = ['2026-07', '2026-08'].reduce((acc, m) => {
    const x = AMall.find(y => y.month === m);
    return acc + (x ? (x.spend || 0) - (hrByMonth[m] || 0) : 0);
  }, 0);

  const gadsQ3Spend = GS.spend || 0;

  const planRealizationRows = [
    {
      channel: 'Meta Ads',
      planQ3: getPlanQ3('Meta Ads'),
      planToAug: getPlanToAug('Meta Ads'),
      actual: metaQ3Spend,
      status: 'Đang chạy · 8 tháng dữ liệu',
      statusOk: true,
    },
    {
      channel: 'Google Ads',
      planQ3: getPlanQ3('Google Ads'),
      planToAug: getPlanToAug('Google Ads'),
      actual: gadsQ3Spend,
      status: `Kỳ ${GS.period || '—'} · ${GS.n || 0} chiến dịch Performance Max`,
      statusOk: true,
    },
    {
      channel: 'Zalo Ads',
      planQ3: getPlanQ3('Zalo Ads'),
      planToAug: getPlanToAug('Zalo Ads'),
      actual: 0,
      status: 'Chưa phát sinh dòng chi tiêu thực tế',
      statusOk: false,
    },
  ];

  /* 3. Google Ads — nay có chiều THÁNG, nên phải lọc theo kỳ đang chọn rồi
        gộp lại theo chiến dịch. Không gộp thì chọn hai tháng sẽ thấy mỗi chiến
        dịch hai dòng và bảng xếp hạng chi phí sai hoàn toàn. */
  const gadsInPeriod = (MKT_DATA.gads || []).filter(
    g => !g.month || selectedMonths.includes(g.month));
  const gadsRows = [...gadsInPeriod.reduce((m, g) => {
    const o = m.get(g.campaign) ?? {
      ...g, spend: 0, conv: 0, clicks: 0, impr: 0,
      storeName: HUB_DATA.stores[g.store]?.name || g.store,
    };
    o.spend += g.spend; o.conv += g.conv; o.clicks += g.clicks; o.impr += g.impr;
    o.status = g.status;
    return m.set(g.campaign, o);
  }, new Map<string, any>()).values()]
    .map(g => ({ ...g, cpa: g.conv > 0 ? g.spend / g.conv : null }))
    .sort((a, b) => b.spend - a.spend);

  /* ── Kênh hiển thị Google: xếp theo CP/chuyển đổi tăng dần ──────────
     Kênh nào có 0 chuyển đổi thì CP/chuyển đổi là "—", không phải 0. */
  const gch = [...(MKT_DATA.gads_channel || [])
    .filter(c => !c.month || selectedMonths.includes(c.month))
    .reduce((m, c) => {
      const o = m.get(c.channel) ?? { ...c, impr: 0, clicks: 0, conv: 0, spend: 0 };
      o.impr += c.impr; o.clicks += c.clicks; o.conv += c.conv; o.spend += c.spend;
      return m.set(c.channel, o);
    }, new Map<string, any>()).values()]
    .map(c => ({ ...c, cpa: c.conv > 0 ? c.spend / c.conv : null }))
    .sort((a, b) => (a.cpa ?? Infinity) - (b.cpa ?? Infinity));
  const gchRanked = gch.filter(c => c.cpa != null) as (typeof gch[0] & { cpa: number })[];
  const bestChannel = gchRanked[0];
  const worstChannel = gchRanked[gchRanked.length - 1];

  const gchOption: EChartsOption = {
    grid: { top: 30, right: 58, bottom: 24, left: 96 },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (p: any) => {
        const c = gch[p[0].dataIndex];
        return `<b>${c.channel}</b><br/>Chi phí: ${formatNumber(c.spend)} đ`
          + `<br/>Chuyển đổi: ${formatNumber(c.conv)}`
          + `<br/>CP/chuyển đổi: ${c.cpa != null ? formatNumber(c.cpa) + ' đ' : '—'}`
          + `<br/>Lượt nhấp: ${formatNumber(c.clicks)}`;
      },
    },
    xAxis: {
      type: 'value',
      name: 'CP / chuyển đổi (đ)',
      nameTextStyle: { fontSize: 10 },
      axisLabel: { fontSize: 10, formatter: (v: number) => formatNumber(v) },
    },
    yAxis: {
      type: 'category',
      inverse: true,
      data: gch.map(c => c.channel),
      axisLabel: { fontSize: 10 },
    },
    series: [{
      type: 'bar',
      barMaxWidth: 20,
      data: gch.map((c, i) => ({
        value: c.cpa ?? 0,
        itemStyle: { color: c.cpa == null ? '#3A3A44' : i === 0 ? '#4A7C59' : '#B0834B' },
      })),
      label: {
        show: true, position: 'right', fontSize: 10, fontWeight: 'bold',
        formatter: (p: any) => {
          const c = gch[p.dataIndex];
          return c.cpa != null ? formatNumber(c.cpa) + 'đ' : '—';
        },
      },
    }],
  };

  const gkwInPeriod = (MKT_DATA.gads_kw || [])
    .filter(k => !k.month || selectedMonths.includes(k.month));
  const gkw = [...gkwInPeriod.reduce((m, k) => {
    const o = m.get(k.kw) ?? { ...k, clicks: 0, impr: 0, spend: 0, conv: 0 };
    o.clicks += k.clicks; o.impr += k.impr; o.spend += k.spend; o.conv += k.conv;
    return m.set(k.kw, o);
  }, new Map<string, any>()).values()].sort((a, b) => b.clicks - a.clicks);
  /* `terms` đếm trên tập ĐANG hiện: từ 09/2026 gói tháng chỉ giữ cụm từ CÓ hoạt
     động (nhấp/chuyển đổi/chi phí), phần đuôi 0 lượt nhấp đã bị loại từ ETL. */
  const KWS = {
    terms: gkw.length,
    brand_terms: gkw.filter(k => /noire/i.test(String(k.kw))).length,
  };

  const kwColumns: Column<typeof gkw[0]>[] = [
    {
      key: 'kw',
      header: 'Cụm từ tìm kiếm',
      render: row => <span className="text-brand-text">{row.kw}</span>,
    },
    {
      key: 'clicks', header: 'Nhấp', align: 'right', sortable: true,
      render: row => <span className="font-mono">{formatNumber(row.clicks)}</span>,
    },
    {
      key: 'impr', header: 'Hiển thị', align: 'right', sortable: true,
      render: row => <span className="font-mono text-brand-muted">{formatNumber(row.impr)}</span>,
    },
    {
      key: 'conv', header: 'Chuyển đổi', align: 'right', sortable: true,
      render: row => (
        <span className={`font-mono font-bold ${row.conv > 0 ? 'text-status-ok' : 'text-brand-faint'}`}>
          {row.conv > 0 ? formatNumber(row.conv) : '—'}
        </span>
      ),
    },
  ];

  const gadsColumns: Column<typeof gadsRows[0]>[] = [
    {
      key: 'campaign',
      header: 'Chiến dịch',
      render: row => <span className="font-bold text-brand-text">{row.campaign}</span>,
    },
    {
      key: 'storeName',
      header: 'Cửa hàng',
      render: row => <span className="text-brand-muted text-[11px]">{row.storeName}</span>,
    },
    {
      key: 'status',
      header: 'Trạng thái',
      render: row => (
        <StatusBadge
          label={row.status}
          variant={/tạm dừng/i.test(row.status) ? 'bad' : 'ok'}
        />
      ),
    },
    {
      key: 'budget_day',
      header: 'NS / Ngày',
      align: 'right',
      render: row => <span className="font-mono">{formatNumber(row.budget_day)} đ</span>,
    },
    {
      key: 'spend',
      header: 'Chi phí',
      align: 'right',
      render: row => <span className="font-mono font-bold text-brand-goldLight">{formatNumber(row.spend)} đ</span>,
    },
    {
      key: 'conv',
      header: 'Chuyển đổi',
      align: 'right',
      render: row => <span className="font-mono font-bold text-status-ok">{formatNumber(row.conv)}</span>,
    },
    {
      key: 'cpa',
      header: 'CP / Chuyển đổi',
      align: 'right',
      render: row => <span className="font-mono">{row.cpa ? formatNumber(Math.round(row.cpa)) + ' đ' : '—'}</span>,
    },
    {
      key: 'clicks',
      header: 'Lượt nhấp',
      align: 'right',
      render: row => <span className="font-mono">{formatNumber(row.clicks)}</span>,
    },
  ];

  // Top Meta Campaigns Table
  const topCampaigns = ACall.filter(c => brandMatches(c.brand)).slice(0, 15);
  const metaColumns: Column<typeof topCampaigns[0]>[] = [
    {
      key: 'campaign',
      header: 'Chiến dịch Meta',
      render: row => <span className="font-bold text-brand-text">{row.campaign}</span>,
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
      key: 'objective',
      header: 'Mục tiêu',
      render: row => (
        <span className="rounded bg-brand-dark px-1.5 py-0.5 text-[10px] text-brand-muted border border-brand-border">
          {row.objective}
        </span>
      ),
    },
    {
      key: 'spend',
      header: 'Chi tiêu',
      align: 'right',
      render: row => <span className="font-mono font-bold text-brand-goldLight">{formatVND(row.spend)}</span>,
    },
    {
      key: 'result',
      header: 'Kết quả',
      align: 'right',
      render: row => <span className="font-mono">{formatNumber(row.result)}</span>,
    },
    {
      key: 'cpr',
      header: 'CP / Kết quả',
      align: 'right',
      render: row => <span className="font-mono">{row.cpr ? formatNumber(Math.round(row.cpr)) + ' đ' : '—'}</span>,
    },
    {
      key: 'reach',
      header: 'Tiếp cận',
      align: 'right',
      render: row => <span className="font-mono">{formatNumber(row.reach)}</span>,
    },
  ];

  return (
    <div className="space-y-5 p-4 sm:p-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div>
        <span className="text-[10px] font-extrabold uppercase tracking-widest text-brand-gold">
          TỐN BAO NHIÊU ĐỂ BÁN
        </span>
        <h2 className="text-xl font-extrabold text-brand-text font-display mt-0.5">
          M5 · Digital Ads (Meta &amp; Google Performance Max)
        </h2>
        <p className="text-xs text-brand-muted mt-1">
          Đo lường hiệu quả chi tiêu quảng cáo qua Ad Cost Ratio (ACR) và các hành động chuyển đổi có ý nghĩa kinh doanh.
        </p>
      </div>

      {/* ROAS Policy Notice */}
      <div className="rounded-xl border border-brand-border bg-brand-surface p-4 text-xs text-brand-muted space-y-1">
        <p>
          <b>Quy ước đo lường — Không dùng chỉ số ROAS:</b> Meta chỉ đo được tới bước tin nhắn/tương tác và hệ thống POS
          mới nhận diện được 8,6% hoá đơn. Hệ thống dùng <b>Ad Cost Ratio (ACR = Chi Media ÷ Net Sales)</b> và chi phí
          trên mỗi chuyển đổi làm thước đo chuẩn mực.
        </p>
        <p className="text-brand-faint text-[11px]">
          Chi tiêu tuyển dụng nhân sự ({formatVND(AS.hr_spend)}) đã được tách riêng khỏi chi phí quảng cáo thương hiệu.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard
          label={`Ad Cost Ratio — ${formatMonthLabel(acrFullMonth)}`}
          subLabel="Chi Media ÷ Net Sales (Tháng trọn kỳ)"
          value={lastFullACR != null ? lastFullACR.toFixed(2) : '—'}
          unit="%"
          variant="hero"
        />
        <MetricCard
          label="Chi Tiêu Media Trong Kỳ"
          subLabel={`Tổng chi trừ tuyển dụng (${ms.length} tháng)`}
          value={formatVND(totalPeriodMedia)}
        />
        <MetricCard
          label={`Tin Nhắn Meta — ${formatMonthLabel(lastMonth)}`}
          subLabel={`Mục tiêu Tin nhắn (${formatMonthLabel(lastMonth)})`}
          value={formatNumber(msgResults)}
          unit="tin"
          customDeltaText={`CPTB: ${cpmMessage ? formatNumber(Math.round(cpmMessage)) + ' đ/tin' : '—'}`}
        />
        <MetricCard
          label="Google Ads (T8/2026)"
          subLabel="Performance Max - Google Maps"
          value={formatNumber(GS.conv)}
          unit="chuyển đổi"
          customDeltaText={`Chi phí: ${formatNumber(GS.spend)} đ`}
        />
      </div>

      {/* Plan vs Actual Realization Table */}
      <Card
        title="Ba Kênh Quảng Cáo — Kế Hoạch So Với Thực Chi Q3"
        description="Đánh giá tiến độ giải ngân quảng cáo so với kế hoạch đã tới hạn (Jul + Aug)"
        chip="PACING"
        hero={true}
      >
        <div className="overflow-x-auto rounded-lg border border-brand-border bg-brand-surface/50">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="border-b border-brand-border bg-brand-surface text-[10px] font-bold uppercase tracking-wider text-brand-muted">
                <th className="p-2.5">Kênh quảng cáo</th>
                <th className="p-2.5 text-right">Plan cả Quý 3</th>
                <th className="p-2.5 text-right">Plan tới Tháng 8</th>
                <th className="p-2.5 text-right">Thực chi tới T8</th>
                <th className="p-2.5 text-right">Đạt / Plan T8</th>
                <th className="p-2.5">Trạng thái triển khai</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-border/40 font-mono">
              {planRealizationRows.map(r => {
                const achieve = r.planToAug > 0 ? r.actual / r.planToAug : 0;
                return (
                  <tr key={r.channel} className="hover:bg-brand-cardHover">
                    <td className="p-2.5 font-sans font-bold text-brand-text">{r.channel}</td>
                    <td className="p-2.5 text-right text-brand-muted">{formatVND(r.planQ3)}</td>
                    <td className="p-2.5 text-right font-medium">{formatVND(r.planToAug)}</td>
                    <td className="p-2.5 text-right font-bold text-brand-goldLight">
                      {r.actual > 0 ? formatVND(r.actual) : <span className="text-status-bad">0 đ</span>}
                    </td>
                    <td className="p-2.5 text-right">
                      {r.planToAug > 0 ? (
                        <StatusBadge
                          label={formatPercent(achieve)}
                          variant={achieve >= 0.95 && achieve <= 1.05 ? 'ok' : achieve >= 0.7 ? 'warning' : 'bad'}
                        />
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="p-2.5 font-sans text-brand-muted text-[11px]">{r.status}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Row 2: ACR Trend & Top Meta Campaigns */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card
          title="Diễn Biến Chi Tiêu Media & Ad Cost Ratio (%)"
          description="Đo lường tỷ trọng ngân sách quảng cáo trên doanh thu thuần theo tháng"
          chip="ACR TREND"
        >
          <EChartWrapper option={acrOption} height={280} />
        </Card>

        <Card
          title="Top Chiến Dịch Meta Ads Theo Chi Tiêu"
          description="Hiệu suất chuyển đổi tin nhắn, tương tác và tiếp cận"
          chip="META ADS"
        >
          <DataTable
            columns={metaColumns}
            data={topCampaigns}
            searchable={false}
            pageSize={6}
            exportFilename="Noire_Meta_Ads_Campaigns"
          />
        </Card>
      </div>

      {/* Row 3: Google Ads Section */}
      <Card
        title="Google Ads — Performance Max Hướng Google Maps (Từ T8/2026)"
        description={`Kỳ ${GS.period} · ${GS.n} chiến dịch · ${formatNumber(GS.conv)} lượt chuyển đổi (cuộc gọi, chỉ đường trên Maps)`}
        chip="GOOGLE ADS"
      >
        <DataTable
          columns={gadsColumns}
          data={gadsRows}
          searchable={false}
          pageSize={6}
          exportFilename="Noire_Google_Ads_PMax"
        />

        {GS.paused_spend > 0 && (
          <div className="mt-3 rounded-lg border border-status-bad/40 bg-status-badBg/20 p-3 text-xs text-status-bad">
            <b>Cờ đỏ 1 — Chiến dịch tạm dừng vẫn phát sinh chi phí:</b> Đã tiêu {formatNumber(GS.paused_spend)} đ với 0
            lượt chuyển đổi (Chiến dịch: {GS.unmapped?.join(', ')}). Cần kiểm tra lại tài khoản quảng cáo.
          </div>
        )}
      </Card>

      {/* Row 4: Kênh hiển thị Google & Cụm từ tìm kiếm */}
      {(gch.length > 0 || gkw.length > 0) && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {gch.length > 0 && (
            <Card
              title="Google Ads — Hiệu Quả Theo Kênh Hiển Thị"
              description="Chi phí trên mỗi lượt chuyển đổi, xếp tăng dần. Kênh rẻ nhất là nơi nên dồn ngân sách."
              chip={bestChannel ? `${bestChannel.channel} RẺ NHẤT` : 'KÊNH HIỂN THỊ'}
              chipColor="border-status-ok/40 bg-status-okBg text-status-ok"
            >
              <EChartWrapper option={gchOption} height={250} />
              <p className="mt-2 text-[11px] leading-relaxed text-brand-muted">
                {bestChannel ? (
                  <>
                    <b className="text-brand-text">{bestChannel.channel}</b> dẫn đầu với{' '}
                    <b className="text-status-ok">{formatNumber(bestChannel.cpa)}đ</b> mỗi lượt chuyển đổi
                    {worstChannel && worstChannel.channel !== bestChannel.channel && (
                      <> — rẻ hơn <b>{(worstChannel.cpa / bestChannel.cpa).toFixed(1)}×</b> so với {worstChannel.channel}</>
                    )}
                    . Hợp lý với mô hình F&amp;B tại chỗ, và giải thích vì sao chạy được khi ba brand chưa có website.
                  </>
                ) : '—'}
              </p>
            </Card>
          )}

          {gkw.length > 0 && (
            <Card
              title="Cụm Từ Khách Dùng Để Tìm"
              description="Đầu vào cho nội dung và đặt tên món — khách tìm theo nhu cầu, không tìm theo tên thương hiệu."
              chip={KWS.terms ? `${formatNumber(KWS.terms)} CỤM TỪ` : 'SEARCH TERMS'}
            >
              {KWS.terms != null && KWS.brand_terms != null && (
                <div className="mb-3 grid grid-cols-2 gap-2.5">
                  <div className="rounded-lg border border-brand-border bg-brand-surface/60 p-2.5">
                    <div className="text-[10px] uppercase tracking-wider text-brand-muted">Tìm theo nhu cầu</div>
                    <div className="mt-0.5 font-display text-lg font-extrabold text-brand-goldLight">
                      {formatNumber(KWS.terms - KWS.brand_terms)}
                    </div>
                    <div className="text-[10px] text-brand-faint">
                      {formatPercent((KWS.terms - KWS.brand_terms) / KWS.terms)} tổng cụm từ
                    </div>
                  </div>
                  <div className="rounded-lg border border-brand-border bg-brand-surface/60 p-2.5">
                    <div className="text-[10px] uppercase tracking-wider text-brand-muted">Có chữ &ldquo;noire&rdquo;</div>
                    <div className="mt-0.5 font-display text-lg font-extrabold text-brand-sand">
                      {formatNumber(KWS.brand_terms)}
                    </div>
                    <div className="text-[10px] text-brand-faint">
                      {formatPercent(KWS.brand_terms / KWS.terms)} tổng cụm từ
                    </div>
                  </div>
                </div>
              )}
              <DataTable
                columns={kwColumns}
                data={gkw}
                searchable
                searchPlaceholder="Tìm cụm từ..."
                searchKeys={['kw']}
                pageSize={8}
                exportFilename="Noire_Google_Search_Terms"
              />
            </Card>
          )}
        </div>
      )}
    </div>
  );
};
