import React, { useMemo } from 'react';
import type { EChartsOption } from 'echarts';
import { useFilters } from '../context/FilterContext';
import { CAMPAIGN } from '../data/campaign';
import { MetricCard } from '../components/common/MetricCard';
import { Card } from '../components/common/Card';
import { StatusBadge, BadgeVariant } from '../components/common/StatusBadge';
import { DataTable, Column } from '../components/common/DataTable';
import { EChartWrapper } from '../components/charts/EChartWrapper';
import { PromotionTabs } from '../components/common/PromotionTabs';
import { formatVND, formatNumber, formatPercent } from '../utils/formatters';
import type { PlanRow, TaxItem } from '../types/campaign';
import { PreEvalSection } from './PreEvalSection';

/* M7.1 · PRE-ANALYTICS · PLAN
   Nguồn DUY NHẤT: file Pre-Analysis (L0_input/03_MARKETING/05_Promotion_Ke_Hoach) đọc qua
   tools/pre_analysis.py → pre_plan. Cùng một danh mục chương trình với M7 và M7.2: dòng nào đã
   chạy thì nối campaign_id và hiện luôn kết quả thực tế — kế hoạch và thực tế nằm cạnh nhau,
   cùng công thức P&L của file kế hoạch (TC_AOV_FnB_Marketing.pdf · slide 8). */

const byCode = (items: TaxItem[] = []) => Object.fromEntries(items.map(x => [x.code, x])) as Record<string, TaxItem>;
const vnd = (x: number | null | undefined) => (x === null || x === undefined ? '—' : formatVND(x));

export const PreAnalyticsView: React.FC = () => {
  const { brandMatches, theme, setActiveView } = useFilters();
  const isDark = theme === 'dark';
  const KIND = byCode(CAMPAIGN.taxonomy.pre_kinds);
  const LABEL = byCode(CAMPAIGN.taxonomy.labels);

  const P = useMemo(() => (CAMPAIGN.plan || []).filter(p => !p.brand || brandMatches(p.brand)), [brandMatches]);
  const file = P.find(p => p.file)?.file ?? '—';

  if (!P.length) {
    return (
      <div className="space-y-5 p-4 sm:p-6 max-w-[1600px] mx-auto">
        <PromotionTabs />
        <Card title="M7.1 · Pre-Analytics · Plan" description="Chưa có file kế hoạch">
          <p className="text-sm text-brand-muted">
            Thả file <b>NOIRE_Promotion_Pre-Analysis_*.xlsx</b> vào <code>L0_input/03_MARKETING/05_Promotion_Ke_Hoach/</code> rồi chạy CAP_NHAT.bat.
          </p>
        </Card>
      </div>
    );
  }

  const hasRoi = (p: PlanRow) => p.roi !== null && p.kind !== 'ACTIVATION';
  const neg = P.filter(p => hasRoi(p) && (p.roi as number) < 0);
  const ran = P.filter(p => p.label && p.label !== 'KE_HOACH');
  const scored = ran.filter(p => ['DAT', 'DAT_LO', 'GAN_DAT', 'KHONG_DAT'].includes(p.label ?? ''));
  const ncPlan = P.reduce((a, p) => a + (p.nc ?? 0), 0);
  const costPlan = P.reduce((a, p) => a + (p.total_cost ?? 0), 0);
  const ncActual = scored.reduce((a, p) => a + (p.act_nc ?? 0), 0);

  /* ── theo loại chương trình ── */
  const kinds = (CAMPAIGN.taxonomy.pre_kinds || []).map(k => {
    const rs = P.filter(p => p.kind === k.code);
    return {
      ...k, n: rs.length, neg: rs.filter(p => hasRoi(p) && (p.roi as number) < 0).length,
      target: rs.reduce((a, p) => a + (p.target ?? 0), 0), cost: rs.reduce((a, p) => a + (p.total_cost ?? 0), 0),
      nc: rs.reduce((a, p) => a + (p.nc ?? 0), 0), ran: rs.filter(p => p.label && p.label !== 'KE_HOACH').length,
    };
  }).filter(k => k.n);

  /* ── biểu đồ: đóng góp ròng kế hoạch vs thực tế ── */
  const sorted = [...P].sort((a, b) => (a.nc ?? 0) - (b.nc ?? 0));
  const ncOption: EChartsOption = {
    tooltip: {
      trigger: 'axis', axisPointer: { type: 'shadow' },
      formatter: (params: any) => {
        const p = sorted[params[0]?.dataIndex];
        if (!p) return '';
        return `<b>${p.pre_id} · ${p.name}</b><br/>${p.brand ?? ''} · ${KIND[p.kind]?.label ?? p.kind}`
          + `<br/>Kế hoạch: ${formatVND(p.nc ?? 0)}${hasRoi(p) ? ` · ROI ${formatNumber(p.roi as number, 2)}` : ' · branding'}`
          + (p.act_nc !== null ? `<br/>Thực tế: ${formatVND(p.act_nc)} · ${LABEL[p.label ?? '']?.label ?? ''}` : '<br/>Chưa có thực tế');
      },
    },
    legend: { top: 0, textStyle: { fontSize: 11 } },
    grid: { top: 28, right: 24, bottom: 24, left: 210 },
    xAxis: { type: 'value', axisLabel: { formatter: (v: number) => formatVND(v, 0), fontSize: 10 } },
    yAxis: {
      type: 'category',
      data: sorted.map(p => `${p.pre_id} · ${p.name.length > 26 ? p.name.slice(0, 24) + '…' : p.name}`),
      axisLabel: { fontSize: 10, color: isDark ? '#F3F2EE' : '#18181B' },
    },
    series: [
      {
        name: 'Đóng góp ròng · kế hoạch', type: 'bar', barGap: '10%', barMaxWidth: 10, color: '#9E9B93',
        data: sorted.map(p => ({ value: p.nc ?? 0, itemStyle: { color: (p.nc ?? 0) < 0 ? '#EF4444' : '#22C55E', opacity: 0.55 } })),
      },
      {
        name: 'Đóng góp ròng · thực tế', type: 'bar', barMaxWidth: 10, color: '#C5A059',
        data: sorted.map(p => (p.act_nc === null ? '-' : { value: p.act_nc, itemStyle: { color: p.act_nc < 0 ? '#B91C1C' : '#C5A059' } })),
      },
    ],
  };

  const verdict = (p: PlanRow): { text: string; variant: BadgeVariant } => {
    if (p.kind === 'ACTIVATION') return { text: 'Branding', variant: 'neutral' };
    const a = p.assessment ?? '';
    if (p.roi === null) return { text: a || '—', variant: 'neutral' };
    return { text: a || (p.roi >= 1 ? 'Tốt' : p.roi >= 0 ? 'Cận biên' : 'Âm'), variant: p.roi >= 1 ? 'ok' : p.roi >= 0 ? 'warning' : 'bad' };
  };

  const columns: Column<PlanRow>[] = [
    {
      key: 'name', header: 'Chương trình · kế hoạch',
      render: p => (
        <div className="leading-tight">
          <div className="font-bold text-brand-text"><span className="font-mono text-brand-gold mr-1.5">{p.pre_id}</span>{p.name}</div>
          <div className="text-[10px] text-brand-muted">{p.brand ?? '—'} · {KIND[p.kind]?.label ?? p.kind}{p.plan_status ? ` · ${p.plan_status}` : ''}</div>
        </div>
      ),
    },
    {
      key: 'target', header: 'Nền → Target', align: 'right',
      render: p => p.target === null ? <span className="text-brand-muted">—</span> : (
        <div className="text-right font-mono leading-tight">
          <div>{formatVND(p.target)}</div>
          <div className="text-[10px] text-brand-muted">nền {vnd(p.base)} · +{formatPercent(p.growth ?? 0)}</div>
        </div>
      ),
    },
    {
      key: 'est_tc', header: 'TC · AOV', align: 'right',
      render: p => p.est_tc === null ? <span className="text-brand-muted">—</span> : (
        <div className="text-right font-mono leading-tight">
          <div>{formatNumber(p.est_tc)} lượt</div>
          <div className="text-[10px] text-brand-muted">{vnd(p.aov)}</div>
        </div>
      ),
    },
    {
      key: 'total_cost', header: 'Chi phí KH', align: 'right',
      render: p => (
        <div className="text-right font-mono leading-tight">
          <div>{vnd(p.total_cost)}</div>
          <div className="text-[10px] text-brand-muted">KM {vnd(p.promo_cost)} · CĐ {vnd(p.fixed_cost)}</div>
        </div>
      ),
    },
    {
      key: 'nc', header: 'Đóng góp · ROI (KH)', align: 'right',
      render: p => {
        const v = verdict(p);
        return (
          <div className="text-right leading-tight">
            <div className={`font-mono font-bold ${(p.nc ?? 0) < 0 ? 'text-status-bad' : 'text-status-ok'}`}>{vnd(p.nc)}</div>
            <div className="mt-0.5 flex justify-end gap-1 items-center">
              {hasRoi(p) && <span className="font-mono text-[10px] text-brand-muted">{formatNumber(p.roi as number, 2)}</span>}
              <StatusBadge label={v.text} variant={v.variant} />
            </div>
          </div>
        );
      },
    },
    {
      key: 'label', header: 'Thực tế (M7.2)',
      render: p => {
        const L = LABEL[p.label ?? ''];
        if (!p.label || p.label === 'KE_HOACH') {
          return <span className="text-[11px] text-brand-muted">Chưa chạy / chưa thấy trên POS</span>;
        }
        return (
          <button className="text-left leading-tight" onClick={() => setActiveView('m72')} title="Mở M7.2 Promotion Tracking">
            <StatusBadge label={L?.label ?? p.label} variant={(L?.badge as BadgeVariant) ?? 'neutral'} />
            <div className="mt-1 text-[10px] font-mono text-brand-muted">
              {p.act_promo_net !== null ? `DT CTKM ${formatVND(p.act_promo_net)} · ${formatNumber(p.act_bills ?? 0)} HĐ` : '—'}
            </div>
            {p.act_nc !== null && (
              <div className={`text-[10px] font-mono ${p.act_nc < 0 ? 'text-status-bad' : 'text-status-ok'}`}>
                đóng góp {formatVND(p.act_nc)}{p.act_roi !== null ? ` · ROI ${formatNumber(p.act_roi, 1)}` : ''}
              </div>
            )}
          </button>
        );
      },
    },
  ];

  return (
    <div className="space-y-5 p-4 sm:p-6 max-w-[1600px] mx-auto">
      <PromotionTabs />

      <div>
        <span className="text-[10px] font-extrabold uppercase tracking-widest text-brand-gold">
          TRƯỚC KHI CHẠY — DỰ BÁO CÓ LÃI KHÔNG · SAU KHI CHẠY — CÓ ĐÚNG NHƯ DỰ BÁO KHÔNG
        </span>
        <h2 className="text-xl font-extrabold text-brand-text font-display mt-0.5">M7.1 · Pre-Analytics · Plan</h2>
        <p className="text-xs text-brand-muted mt-1">
          Đánh giá TRƯỚC khi chạy theo khung PP672 × SALES = TC × AOV: dữ liệu nền tự lấy từ POS, 3 kịch bản, điểm hoà vốn,
          quyết định DUYỆT · CHẠY THỬ · SỬA CƠ CHẾ. Chương trình đã chạy đặt thực tế cạnh dự báo.
        </p>
      </div>

      <PreEvalSection brandMatches={brandMatches} />

      <details className="group rounded-xl border border-brand-border">
        <summary className="cursor-pointer select-none p-3 text-xs text-brand-muted">
          <b className="text-brand-text">Tham khảo · kế hoạch Q3/2026 (file lập tay cũ)</b> — {P.length} chương trình · {ran.length} đã chạy · bấm để mở
        </summary>
        <div className="space-y-4 p-3 pt-0">
          <div className="border-t border-brand-border pt-4">
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-brand-muted">Tham khảo · file kế hoạch cũ</span>
            <h3 className="text-base font-bold text-brand-text">Kế hoạch Q3/2026 — {P.length} chương trình trong <span className="font-mono">{file}</span></h3>
            <p className="text-xs text-brand-muted mt-1">
              File lập tay trước khi có sổ đánh giá chuẩn · nối sang M7.2 qua mã kế hoạch ({ran.length} đã chạy trên POS).
              Chương trình mới: lập trong sổ Pre_Analysis_2026.xlsx.
            </p>
          </div>

          <div className="rounded-xl border border-brand-border bg-brand-surface p-4 text-xs text-brand-muted space-y-1.5">
            <p><b className="text-brand-text">Công thức (từ file kế hoạch, áp chung cho kế hoạch và thực tế):</b></p>
            <p className="font-mono text-[11px]">
              Target = Nền × (1 + Growth%) · Tăng thêm = Target − Nền · Đóng góp ròng = Tăng thêm ÷ 1,08 × (1 − COGS%) − (Chi phí KM + Cố định) · ROI = Đóng góp ÷ Chi phí
            </p>
            <p>
              <b className="text-brand-text">Thực tế</b> dùng đúng công thức đó, thay Target bằng giá trị các hoá đơn gắn CTKM trên POS
              (trước ưu đãi, gồm VAT) và chi phí KM bằng giảm giá thật trên POS (quà tặng: đơn giá quà × số hoá đơn thực).
            </p>
            <p>
              <b className="text-brand-text">Cổng duyệt:</b> chỉ chạy khi đã thay hết ô đề xuất bằng số thật, ROI ≥ 0 ở kịch bản thận trọng;
              chương trình giảm giá sâu phải có nhóm đối chứng để chứng minh doanh thu tăng thêm là thật.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <MetricCard label="Chương trình kế hoạch" subLabel={`${kinds.length} loại cơ chế`} value={P.length} unit="CT" variant="hero"
              customDeltaText={`${ran.length} đã chạy · ${P.length - ran.length} chưa chạy`} />
            <MetricCard label="Đóng góp ròng dự báo" subLabel="Σ kế hoạch" value={formatVND(ncPlan)}
              variant={ncPlan < 0 ? 'critical' : 'default'} customDeltaText={`chi phí kế hoạch ${formatVND(costPlan)}`} />
            <MetricCard label="Dự báo lỗ" subLabel="ROI kế hoạch < 0" value={neg.length} unit="CT" variant={neg.length ? 'warning' : 'default'}
              customDeltaText={`Σ ${formatVND(neg.reduce((a, p) => a + (p.nc ?? 0), 0))} — sửa cơ chế trước khi duyệt`} />
            <MetricCard label="Đã chấm thực tế" subLabel="đã kết thúc, có target" value={`${scored.length} / ${ran.length}`}
              customDeltaText={`${scored.filter(p => p.label === 'DAT').length} đạt · ${scored.filter(p => p.label !== 'DAT').length} chưa đạt`} />
            <MetricCard label="Đóng góp ròng thực tế" subLabel="CT đã chấm" value={scored.length ? formatVND(ncActual) : '—'}
              variant={ncActual < 0 ? 'critical' : 'default'}
              customDeltaText={scored.length ? `kế hoạch cùng nhóm ${formatVND(scored.reduce((a, p) => a + (p.nc ?? 0), 0))}` : 'chưa có chương trình kết thúc'} />
          </div>

          <Card title="Theo Loại Cơ Chế" description="Mỗi loại một cách tính chi phí khuyến mãi — đúng sheet trong file Pre-Analysis" chip="6 LOẠI">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {kinds.map(k => (
                <div key={k.code} className="rounded-lg border border-brand-border p-3 text-xs">
                  <div className="flex items-center justify-between">
                    <b className="text-brand-text">{k.label}</b>
                    <span className="font-mono text-[10px] text-brand-muted">{k.prefix}# · {k.n} CT · {k.ran} đã chạy</span>
                  </div>
                  <div className="mt-1.5 grid grid-cols-3 gap-2 font-mono text-[11px]">
                    <div><div className="text-[9px] text-brand-faint">TARGET</div>{formatVND(k.target)}</div>
                    <div><div className="text-[9px] text-brand-faint">CHI PHÍ</div>{formatVND(k.cost)}</div>
                    <div><div className="text-[9px] text-brand-faint">ĐÓNG GÓP</div>
                      <span className={k.nc < 0 ? 'text-status-bad' : 'text-status-ok'}>{formatVND(k.nc)}</span></div>
                  </div>
                  {k.neg > 0 && <div className="mt-1 text-[10px] text-status-bad">{k.neg} chương trình dự báo lỗ</div>}
                </div>
              ))}
            </div>
          </Card>

          <Card title="Đóng Góp Ròng · Kế Hoạch vs Thực Tế" description="Cột nhạt = kế hoạch · cột đậm = thực tế (chỉ chương trình đã chạy)" chip="PLAN vs ACTUAL" hero>
            <EChartWrapper option={ncOption} height={Math.max(320, sorted.length * 22 + 60)} />
          </Card>

          <Card title="Danh Sách Kế Hoạch & Cổng Duyệt" description="Bấm cột Thực tế để mở M7.2 · đánh giá lấy nguyên cột 'Đánh giá' của file kế hoạch" chip="GATEKEEPER">
            <DataTable columns={columns} data={[...P].sort((a, b) => (a.nc ?? 0) - (b.nc ?? 0))}
              searchPlaceholder="Tìm chương trình…" searchKeys={['name', 'brand', 'kind', 'pre_id'] as any}
              pageSize={12} exportFilename="Noire_M7_1_PreAnalytics" />
          </Card>
        </div>
      </details>
    </div>
  );
};
