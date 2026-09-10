import React, { useState } from 'react';
import { HUB_DATA } from '../data';
import { PRODUCT } from '../data/product';
import { MetricCard } from '../components/common/MetricCard';
import { Card } from '../components/common/Card';
import { StatusBadge, BadgeVariant } from '../components/common/StatusBadge';
import { DataTable, Column } from '../components/common/DataTable';
import { EChartWrapper } from '../components/charts/EChartWrapper';
import { formatVND, formatNumber, formatPercent } from '../utils/formatters';
import type { EChartsOption } from 'echarts';

export const MenuView: React.FC = () => {
  const PS = HUB_DATA.product_stat;
  const products = PRODUCT.filter(p => p.cat !== 'NO SERVICE CHARGE');
  const totalRev = PS.rev;

  const [selectedQuadrant, setSelectedQuadrant] = useState<string | null>(null);

  const sortedProducts = [...products].sort((a, b) => b.rev - a.rev);

  // Products with valid COGS
  const withCogs = products.filter(p => p.has_cogs);

  // 1. Menu Engineering Scatter Chart (4 Quadrants)
  const medQty = HUB_DATA.menu_median.qty || 100;
  const medCm = (HUB_DATA.menu_median.cm_pct || 0.65) * 100;

  const quadrantColors: Record<string, string> = {
    Star: '#22C55E',
    'Plow-horse': '#F59E0B',
    Puzzle: '#82846C',
    Dog: '#EF4444',
  };

  const scatterOption: EChartsOption = {
    tooltip: {
      trigger: 'item',
      formatter: (params: any) => {
        const d = params.data;
        return `<div class="text-xs">
          <div class="font-bold border-b border-brand-border pb-1 mb-1 text-brand-goldLight">${d.name}</div>
          <div class="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] font-mono">
            <span>Phân loại:</span> <b style="color: ${quadrantColors[d.mclass] || '#9E9B93'}">${d.mclass}</b>
            <span>Số suất bán:</span> <b>${formatNumber(d.value[0])} suất</b>
            <span>Biên đóng góp:</span> <b>${d.value[1].toFixed(1)}%</b>
            <span>Doanh thu món:</span> <b>${formatVND(d.rev)}</b>
          </div>
        </div>`;
      },
    },
    legend: {
      top: 0,
      textStyle: { color: '#9E9B93', fontSize: 11 },
    },
    grid: { top: 35, right: 30, bottom: 35, left: 60 },
    xAxis: {
      type: 'log',
      name: 'Số suất bán (Log)',
      nameLocation: 'middle',
      nameGap: 24,
      nameTextStyle: { color: '#9E9B93', fontSize: 10 },
      axisLine: { lineStyle: { color: '#2A2A33' } },
      axisLabel: { color: '#9E9B93', fontSize: 10 },
      splitLine: { lineStyle: { color: '#1F1F26', type: 'dashed' } },
    },
    yAxis: {
      type: 'value',
      name: 'Biên đóng góp (CM %)',
      nameTextStyle: { color: '#9E9B93', fontSize: 10 },
      axisLabel: {
        formatter: '{value}%',
        color: '#9E9B93',
        fontSize: 10,
      },
      splitLine: { lineStyle: { color: '#1F1F26', type: 'dashed' } },
    },
    series: ['Star', 'Plow-horse', 'Puzzle', 'Dog'].map(k => {
      const items = withCogs.filter(p => p.mclass === k);
      return {
        name: k,
        type: 'scatter',
        data: items.map(p => ({
          value: [p.qty, p.cm_pct * 100],
          name: p.name,
          mclass: p.mclass,
          rev: p.rev,
          symbolSize: Math.max(6, Math.min(22, Math.sqrt(p.rev / 1e6) * 2.2)),
        })),
        itemStyle: {
          color: quadrantColors[k],
          opacity: selectedQuadrant && selectedQuadrant !== k ? 0.15 : 0.75,
        },
      };
    }),
  };

  // 2. Pareto Curve
  let cumSum = 0;
  const paretoData = sortedProducts.slice(0, 500).map((p, idx) => {
    cumSum += p.rev;
    return {
      index: idx + 1,
      cumPct: (cumSum / totalRev) * 100,
    };
  });

  const paretoOption: EChartsOption = {
    tooltip: {
      trigger: 'axis',
      formatter: (params: any) => {
        const item = params[0];
        return `<div class="text-xs">
          <b>SKU thứ ${item?.axisValue}</b>: ${Number(item?.value).toFixed(1)}% DT tích luỹ
        </div>`;
      },
    },
    grid: { top: 25, right: 20, bottom: 30, left: 55 },
    xAxis: {
      type: 'category',
      data: paretoData.filter((_, i) => i % 5 === 0).map(d => d.index),
      name: 'SKU xếp giảm dần',
      nameLocation: 'middle',
      nameGap: 20,
      nameTextStyle: { color: '#9E9B93', fontSize: 10 },
      axisLine: { lineStyle: { color: '#2A2A33' } },
      axisLabel: { color: '#9E9B93', fontSize: 10 },
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
        name: '% DT tích luỹ',
        type: 'line',
        data: paretoData.filter((_, i) => i % 5 === 0).map(d => d.cumPct),
        lineStyle: { color: '#C5A059', width: 2.2 },
        itemStyle: { color: '#C5A059' },
        showSymbol: false,
        smooth: true,
        markLine: {
          data: [{ yAxis: 80, name: 'Ngưỡng 80% Doanh thu', lineStyle: { color: '#EF4444', type: 'dashed' } }],
          label: { formatter: '80% DT', color: '#EF4444', fontSize: 10 },
        },
      },
    ],
  };

  // 3. Category Bar Chart
  const categories = HUB_DATA.category.filter(c => c.cat !== 'NO SERVICE CHARGE');
  /* ── Cơ cấu theo Nhóm món (khoá group) ───────────────────────────── */
  const grpRows = (HUB_DATA.group || []).slice(0, 18);
  const grpTotal = (HUB_DATA.group || []).reduce((a, g) => a + g.rev, 0);
  const catTotal = (HUB_DATA.category || []).reduce((a, c) => a + c.rev, 0);
  const grpShare = catTotal > 0 ? grpRows.reduce((a, g) => a + g.rev, 0) / catTotal : 0;

  const grpOption: EChartsOption = {
    grid: { top: 28, right: 64, bottom: 24, left: 156 },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (p: any) => {
        const g = grpRows[p[0].dataIndex];
        return `<b>${g.grp || '(không rõ)'}</b><br/>Doanh thu: ${formatVND(g.rev)}`
          + `<br/>Sản lượng: ${formatNumber(g.qty)} suất`
          + `<br/>Tỷ trọng: ${grpTotal ? formatPercent(g.rev / grpTotal) : '—'}`;
      },
    },
    xAxis: {
      type: 'value',
      name: 'Doanh thu món (VNĐ)',
      nameTextStyle: { fontSize: 10 },
      axisLabel: { fontSize: 10, formatter: (v: number) => formatVND(v, 0) },
    },
    yAxis: {
      type: 'category',
      inverse: true,
      data: grpRows.map(g => g.grp || '(không rõ)'),
      axisLabel: { fontSize: 10, width: 148, overflow: 'truncate' },
    },
    series: [{
      type: 'bar',
      barMaxWidth: 15,
      data: grpRows.map((g, i) => ({
        value: g.rev,
        itemStyle: { color: i < 3 ? '#B0834B' : '#82846C' },
      })),
      label: {
        show: true, position: 'right', fontSize: 9,
        formatter: (p: any) => formatVND(p.value, 0),
      },
    }],
  };

  const catOption: EChartsOption = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: any) => {
        const item = params[0];
        const cat = categories[item?.dataIndex];
        return `<div class="text-xs">
          <b>${item?.axisValue}</b><br/>
          Doanh thu: ${formatVND(item?.value)}<br/>
          Sản lượng: ${formatNumber(cat?.qty)} suất
        </div>`;
      },
    },
    grid: { top: 15, right: 25, bottom: 25, left: 75 },
    xAxis: {
      type: 'value',
      axisLabel: {
        formatter: (val: number) => formatVND(val, 0),
        color: '#9E9B93',
        fontSize: 10,
      },
      splitLine: { lineStyle: { color: '#1F1F26', type: 'dashed' } },
    },
    yAxis: {
      type: 'category',
      data: categories.map(c => c.cat),
      axisLine: { lineStyle: { color: '#2A2A33' } },
      axisLabel: { color: '#F3F2EE', fontSize: 11 },
    },
    series: [
      {
        name: 'Doanh thu',
        type: 'bar',
        data: categories.map(c => c.rev),
        itemStyle: { color: '#82846C', borderRadius: [0, 4, 4, 0] },
        barMaxWidth: 20,
      },
    ],
  };

  // Columns for Top 15 Products
  const topColumns: Column<typeof sortedProducts[0]>[] = [
    {
      key: 'name',
      header: 'Tên món',
      render: (row, idx) => (
        <div className="flex items-center gap-2">
          <span className="font-mono text-brand-gold font-bold">{idx + 1}.</span>
          <span className="font-semibold text-brand-text">{row.name}</span>
        </div>
      ),
    },
    {
      key: 'cat',
      header: 'Phân loại',
      render: row => (
        <span className="rounded bg-brand-dark px-1.5 py-0.5 text-[10px] text-brand-muted border border-brand-border">
          {row.cat}
        </span>
      ),
    },
    {
      key: 'qty',
      header: 'Số suất',
      align: 'right',
      render: row => <span className="font-mono">{formatNumber(row.qty)}</span>,
    },
    {
      key: 'rev',
      header: 'Doanh thu món',
      align: 'right',
      render: row => <span className="font-mono font-bold text-brand-goldLight">{formatVND(row.rev)}</span>,
    },
    {
      key: 'cm_pct',
      header: 'Biên CM %',
      align: 'right',
      render: row => (
        <span className="font-mono font-bold">
          {row.has_cogs ? formatPercent(row.cm_pct) : <span className="text-brand-faint">—</span>}
        </span>
      ),
    },
    {
      key: 'mclass',
      header: 'Phân hạng',
      align: 'center',
      render: row => {
        if (!row.has_cogs) return <StatusBadge label="Chưa có BOM" variant="neutral" />;
        const vMap: Record<string, BadgeVariant> = {
          Star: 'ok',
          'Plow-horse': 'warning',
          Puzzle: 'neutral',
          Dog: 'bad',
        };
        return <StatusBadge label={row.mclass} variant={vMap[row.mclass] || 'neutral'} />;
      },
    },
  ];

  // Columns for BOM Cogs Flags
  const flagColumns: Column<typeof HUB_DATA.cogs_flags[0]>[] = [
    {
      key: 'name',
      header: 'Món cờ đỏ',
      render: row => (
        <div>
          <span className="font-bold text-brand-text">{row.name}</span>
          <span className="ml-2 rounded bg-brand-surface px-1.5 py-0.5 text-[9px] text-brand-muted">
            {row.brand}
          </span>
        </div>
      ),
    },
    {
      key: 'cogs',
      header: 'Giá vốn',
      align: 'right',
      render: row => <span className="font-mono text-brand-muted">{formatNumber(row.cogs)} đ</span>,
    },
    {
      key: 'pct',
      header: '% Giá vốn',
      align: 'right',
      render: row => (
        <span className={`font-mono font-bold ${row.pct >= 1 ? 'text-status-bad' : 'text-status-warning'}`}>
          {formatPercent(row.pct)}
        </span>
      ),
    },
    {
      key: 'flag',
      header: 'Cảnh báo',
      align: 'center',
      render: row => (
        <StatusBadge
          label={row.pct >= 1.0 ? 'BÁN LỖ (≥100%)' : row.pct >= 0.6 ? 'Rất cao (≥60%)' : 'Cao (>45%)'}
          variant={row.pct >= 1.0 ? 'bad' : 'warning'}
        />
      ),
    },
  ];

  return (
    <div className="space-y-5 p-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div>
        <span className="text-[10px] font-extrabold uppercase tracking-widest text-brand-gold">
          MÓN NÀO ĐÁNG BÁN
        </span>
        <h2 className="text-xl font-extrabold text-brand-text font-display mt-0.5">
          M2 · Menu Engineering &amp; Biên Lợi Nhuận
        </h2>
        <p className="text-xs text-brand-muted mt-1">
          Luỹ kế {HUB_DATA.meta.months.length} tháng. Phân tích ma trận 4 góc phần tư món ăn và kiểm soát rủi ro giá vốn.
        </p>
        {/* Bảng món là tầng LUỸ KẾ: chỉ được dựng lại khi chạy lại toàn kỳ, nên có thể
            phủ ít ngày hơn khối doanh thu theo tháng. Nói thẳng ra thay vì để người đọc
            tưởng hai khối cùng kỳ. */}
        {PS.covers && (
          <p className="text-[11px] text-brand-faint mt-1">
            Bảng món phủ kỳ <b className="text-brand-muted font-mono">{PS.covers}</b> — dựng lại
            bằng lane luỹ kế, có thể lệch vài ngày so với khối doanh thu theo tháng.
          </p>
        )}
      </div>

      {/* COGS Alert Banner */}
      <div className="rounded-xl border border-status-bad/40 bg-status-badBg/20 p-4 text-xs text-status-bad flex items-start gap-3">
        <span className="font-extrabold uppercase text-[11px] rounded bg-status-bad/20 px-2 py-0.5 mt-0.5">
          Cảnh Báo COGS
        </span>
        <div className="space-y-1 text-brand-text">
          <p>
            Độ phủ giá vốn hiện mới đạt <b>{formatPercent(HUB_DATA.meta.cogs_coverage)}</b> ({PS.sku_cogs}/{PS.sku} SKU).
            Bảng BOM có {HUB_DATA.bom_stat.rows} dòng nhưng chỉ <b>{HUB_DATA.bom_stat.codes} mã duy nhất</b>.
          </p>
          <p className="text-brand-muted text-[11px]">
            Ma trận bên dưới chỉ xếp hạng những món đã có BOM. Phần còn lại được xếp vào nhóm &ldquo;Chưa xếp hạng&rdquo;.
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard
          label="SKU Đã Bán"
          subLabel={`Tổng SKU phát sinh (${PS.sku_cogs} có COGS)`}
          value={formatNumber(PS.sku)}
          unit="SKU"
          variant="hero"
        />
        <MetricCard
          label="SKU Bán Chậm"
          subLabel="< 10 suất / tháng"
          value={formatNumber(PS.slow)}
          customDeltaText={`= ${formatPercent(PS.slow / PS.sku)} SKU · chỉ ${formatPercent(PS.slow_rev)} DT`}
          isFlagged={true}
          flagMessage="Phình menu"
        />
        <MetricCard
          label="Tập Trung Pareto"
          subLabel="% Doanh thu từ 20% SKU đầu"
          value={formatPercent(PS.rev20)}
          customDeltaText={`${PS.n80} SKU tạo 80% doanh thu`}
        />
        <MetricCard
          label="Độ Phủ Giá Vốn"
          subLabel="DT có COGS ÷ Tổng DT"
          value={formatPercent(HUB_DATA.meta.cogs_coverage)}
          isFlagged={true}
          flagMessage="Chặn Prime Cost"
          variant="warning"
        />
      </div>

      {/* Row 1: Menu Matrix & 4 Quadrants Summary */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card
          title="Ma Trận Menu Engineering (4 Góc Phần Tư)"
          description="Trục X: Số suất bán (Log scale) · Trục Y: Biên đóng góp CM %. Kích thước bóng tỷ lệ với Doanh thu."
          chip={`${withCogs.length} SKU CÓ COGS`}
          hero={true}
          className="lg:col-span-2"
        >
          <EChartWrapper option={scatterOption} height={340} />
        </Card>

        <Card
          title="Bốn Phân Hạng Menu"
          description="Định hướng chiến lược cho từng nhóm món ăn"
          chip="CHIẾN LƯỢC"
        >
          <div className="space-y-3">
            {[
              {
                name: 'Star (Ngôi sao)',
                desc: 'Bán chạy · Lãi cao → Duy trì chất lượng, đẩy mạnh vị trí menu.',
                sku: PS.cls['Star'] || 0,
                rev: PS.cls_rev['Star'] || 0,
                color: 'text-status-ok',
                border: 'border-status-ok/30 bg-status-okBg/20',
              },
              {
                name: 'Plow-horse (Bò sữa)',
                desc: 'Bán chạy · Lãi thấp → Món kéo khách, cân nhắc tinh chỉnh định lượng hoặc giá.',
                sku: PS.cls['Plow-horse'] || 0,
                rev: PS.cls_rev['Plow-horse'] || 0,
                color: 'text-status-warning',
                border: 'border-status-warning/30 bg-status-warningBg/20',
              },
              {
                name: 'Puzzle (Câu đố)',
                desc: 'Lãi cao · Bán chậm → Đổi tên, đổi hình ảnh, train nhân viên gợi ý.',
                sku: PS.cls['Puzzle'] || 0,
                rev: PS.cls_rev['Puzzle'] || 0,
                color: 'text-brand-olive',
                border: 'border-brand-olive/30 bg-brand-olive/10',
              },
              {
                name: 'Dog (Chó cưng)',
                desc: 'Bán chậm · Lãi thấp → Cắt giảm khỏi menu để giải phóng kho & bếp.',
                sku: PS.cls['Dog'] || 0,
                rev: PS.cls_rev['Dog'] || 0,
                color: 'text-status-bad',
                border: 'border-status-bad/30 bg-status-badBg/20',
              },
            ].map(q => (
              <div
                key={q.name}
                onClick={() =>
                  setSelectedQuadrant(selectedQuadrant === q.name.split(' ')[0] ? null : q.name.split(' ')[0])
                }
                className={`rounded-lg border p-2.5 transition-all cursor-pointer ${q.border} hover:opacity-90`}
              >
                <div className="flex items-center justify-between text-xs">
                  <span className={`font-bold ${q.color}`}>{q.name}</span>
                  <span className="font-mono font-bold text-brand-text">
                    {formatVND(q.rev)} ({formatPercent(q.rev / totalRev)})
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-brand-muted leading-relaxed">
                  {q.desc}
                </p>
                <div className="mt-1 text-[10px] text-brand-faint">
                  {q.sku} SKU trong nhóm
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Row 2: Pareto Curve & Category Breakdown */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card
          title="Đường Cong Pareto 80/20"
          description="Doanh thu tích luỹ theo SKU xếp giảm dần — nhận diện độ tập trung menu"
          chip="PARETO"
        >
          <EChartWrapper option={paretoOption} height={260} />
        </Card>

        <Card
          title="Cơ Cấu Theo Loại Món (Category)"
          description="Doanh thu và sản lượng theo nhóm thức ăn / đồ uống / bánh"
          chip="CATEGORY"
        >
          <EChartWrapper option={catOption} height={260} />
        </Card>
      </div>

      {/* Cơ cấu theo Nhóm món — chi tiết hơn Category */}
      {grpRows.length > 0 && (
        <Card
          title={`Cơ Cấu Theo Nhóm Món — Top ${grpRows.length}`}
          description="Chi tiết hơn Category một bậc. Nhóm nào đông doanh thu nhưng ít mã món là nhóm đang gánh menu; nhóm nhiều mã mà ít doanh thu là nơi nên cắt trước."
          chip={`${formatPercent(grpShare)} DOANH THU MÓN`}
        >
          <EChartWrapper option={grpOption} height={Math.max(240, grpRows.length * 22)} />
        </Card>
      )}

      {/* Row 3: Top Products & BOM Red Flags */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card
          title="Top 15 Món Bán Chạy Nhất"
          description="Doanh thu, số suất bán và biên đóng góp thực tế"
          chip="BEST SELLERS"
        >
          <DataTable
            columns={topColumns}
            data={sortedProducts.slice(0, 15)}
            searchable={false}
            pageSize={8}
            exportFilename="Noire_Top_15_Products"
          />
        </Card>

        <Card
          title="Cảnh Báo Món Giá Vốn Bất Thường"
          description="Các món có giá vốn >45% hoặc bán lỗ (≥100%) trích xuất từ bảng BOM"
          chip="CỜ ĐỎ BOM"
        >
          <DataTable
            columns={flagColumns}
            data={HUB_DATA.cogs_flags}
            searchable={false}
            pageSize={8}
            exportFilename="Noire_COGS_Flags"
          />
          <div className="mt-2 text-[10px] text-brand-muted">
            Tổng cộng: {HUB_DATA.bom_stat.over45} món &gt;45% COGS, {HUB_DATA.bom_stat.loss} món bán lỗ (≥100%), {HUB_DATA.bom_stat.nocost} món thiếu cost.
          </div>
        </Card>
      </div>
    </div>
  );
};
