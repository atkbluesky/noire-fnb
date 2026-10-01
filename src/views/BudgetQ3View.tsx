/**
 * M4 · Ngân sách Q3/2026 — PLAN vs THỰC TẾ.
 *
 * Plan   : MKT_DATA.budget (file Q3 "Checked", khai ở 01_master.xlsx).
 * Thực tế: Meta + Google Ads — /api/ads/performance (cùng nguồn M5); API chưa sẵn sàng thì rơi về Excel
 *          (MKT_DATA.ads_month / gads_month) cho phần kênh × tháng. Zalo Ads chưa có nguồn thực chi → chỉ hiện plan.
 *
 * Bố cục đi từ tổng thể xuống chi tiết:
 *   1. KPI  →  2. Digital theo kênh × tháng (plan vs thực)  →  3. Cấu trúc plan hai tầng
 *   →  4. Digital theo cửa hàng (plan vs thực)  →  5. Chi phí ngoài media.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useFilters } from '../context/FilterContext';
import { MKT_DATA, BRAND_COLORS } from '../data';
import { MetricCard } from '../components/common/MetricCard';
import { Card } from '../components/common/Card';
import { DataTable, Column } from '../components/common/DataTable';
import { EChartWrapper } from '../components/charts/EChartWrapper';
import { formatVND, formatPercent } from '../utils/formatters';
import type { EChartsOption } from 'echarts';
import { sum, dmy, monthEnd, yesterdayIct, PvA, TH, TD, HEAD, TOTAL_ROW } from './budgetShared';

const Q3_MONTHS = ['2026-07', '2026-08', '2026-09'];
const MONTH_LABEL: Record<string, string> = { '2026-07': 'Tháng 7', '2026-08': 'Tháng 8', '2026-09': 'Tháng 9' };
const BRANDS = ['NCB', 'NDC', 'NJFB'];

/* Tên cửa hàng ở file ngân sách Q3 → mẫu nhận diện trong TÊN chiến dịch. Không khớp thì để "cấp brand". */
const STORE_PAT: Array<[string, RegExp]> = [
  ['NOIRE ET', /empress|\bet\b/i],
  ['NOIRE The Mett', /\bmett\b/i],
  ['NOIRE SKC', /sonkim|son kim|\bskc\b/i],
  ['NOIRE 39 NTMK', /39\s?ntmk/i],
  ['NOIRE Berkley', /berkley/i],
  ['NOIRE JFB SSV', /\bssv\b/i],
  ['NOIRE JFB CREST', /crest/i],
];
const storeOf = (name: string) => STORE_PAT.find(([, p]) => p.test(name))?.[0] ?? null;

interface Actual {
  source: 'api' | 'excel';
  through: string | null;
  month: Record<string, { meta: number; google: number }>;                // theo tháng, toàn chuỗi (không gồm HR)
  store: Record<string, { meta: number; google: number }>;                // theo cửa hàng, cả quý
  brandLevel: Record<string, { meta: number; google: number }>;           // chạy cấp brand — chưa gán cửa hàng
  common: { meta: number; google: number };                               // page NEC / booking chung — không thuộc brand
  unknown: { meta: number; google: number };                              // chưa gán brand
}

function useQ3Actual(): { status: 'loading' | 'ready'; data: Actual | null } {
  const [st, setSt] = useState<{ status: 'loading' | 'ready'; data: Actual | null }>({ status: 'loading', data: null });
  useEffect(() => {
    let alive = true;
    const y = yesterdayIct();
    const to = '2026-09-30' < y ? '2026-09-30' : y;

    const excel = (): Actual => ({
      source: 'excel', through: null,
      month: Object.fromEntries(Q3_MONTHS.map(m => [m, {
        meta: sum((MKT_DATA.ads_month ?? []).filter(a => a.month === m).map(a => a.spend || 0)),
        google: sum((MKT_DATA.gads_month ?? []).filter(a => a.month === m).map(a => a.spend || 0)),
      }])),
      store: {}, brandLevel: {}, common: { meta: 0, google: 0 }, unknown: { meta: 0, google: 0 },
    });

    fetch(`/api/ads/performance?from=2026-07-01&to=${to}`).then(r => r.json()).then(b => {
      if (!alive) return;
      if (!b?.ok || !Array.isArray(b.segmentMonthly)) { setSt({ status: 'ready', data: excel() }); return; }
      const A: Actual = { source: 'api', through: null, month: {}, store: {}, brandLevel: {}, common: { meta: 0, google: 0 }, unknown: { meta: 0, google: 0 } };
      Q3_MONTHS.forEach(m => { A.month[m] = { meta: 0, google: 0 }; });
      for (const r of b.segmentMonthly) if (A.month[r.month] && r.segment !== 'HR') A.month[r.month].meta += r.spend;
      for (const r of b.google?.monthly ?? []) if (A.month[r.month]) A.month[r.month].google += r.spend;

      const put = (platform: 'meta' | 'google', brand: string, name: string, v: number) => {
        if (brand === 'TIEC' || brand === 'NEC') { A.common[platform] += v; return; }
        if (!BRANDS.includes(brand)) { A.unknown[platform] += v; return; }
        const s = storeOf(name);
        const known = s && (MKT_DATA.budget?.store_ads ?? []).some(x => x.store === s && x.brand === brand);
        const bucket = known ? (A.store[s!] ??= { meta: 0, google: 0 }) : (A.brandLevel[brand] ??= { meta: 0, google: 0 });
        bucket[platform] += v;
      };
      for (const c of b.campaigns ?? []) if (c.platform === 'meta' && c.segment !== 'HR') put('meta', c.segment, c.campaignName, c.spend);
      for (const c of b.google?.campaigns ?? []) put('google', c.brand, `${c.campaign} ${c.store ?? ''}`, c.spend);
      const mt = b.syncedThrough as string | null, gt = b.google?.syncedThrough as string | null;
      A.through = mt && gt ? (mt < gt ? mt : gt) : mt ?? gt;
      setSt({ status: 'ready', data: A });
    }).catch(() => alive && setSt({ status: 'ready', data: excel() }));
    return () => { alive = false; };
  }, []);
  return st;
}

export const BudgetQ3View: React.FC = () => {
  const { brandMatches, filters, selectedMonths, theme } = useFilters();
  const allBrands = filters.brand === 'ALL';
  const isDark = theme === 'dark';
  const { data: A } = useQ3Actual();

  const B = MKT_DATA.budget || {
    total: 0, plan: 0, file: '', brand: [], extra: [], channel: [], store_ads: [], nonmedia: [],
    nonmedia_stat: { months: [], budget: 0, actual: 0, use_rate: null },
  };
  const brandBudgets = (B.brand || []).filter(b => brandMatches(b.brand));
  const extraBudgets = B.extra || [];
  const storeAds = (B.store_ads || []).filter(s => brandMatches(s.brand));
  const sumQuarter = (obj: any) => Q3_MONTHS.reduce((acc, m) => acc + (obj[m] || 0), 0);

  /* ── Plan theo kênh × tháng (toàn chuỗi) ── */
  const planCh = useMemo(() => {
    const out: Record<'meta' | 'google' | 'zalo', Record<string, number>> = { meta: {}, google: {}, zalo: {} };
    (B.channel || []).forEach(c => {
      const k = /meta/i.test(c.channel) ? 'meta' : /google/i.test(c.channel) ? 'google' : 'zalo';
      Q3_MONTHS.forEach(m => { out[k][m] = (out[k][m] || 0) + ((c as any)[m] || 0); });
    });
    return out;
  }, [B]);
  const pm = (k: 'meta' | 'google' | 'zalo', ms = Q3_MONTHS) => sum(ms.map(m => planCh[k][m] || 0));

  const brandPlanSum = brandBudgets.reduce((a, b) => a + sumQuarter(b), 0);
  const extraPlanSum = extraBudgets.reduce((a, e) => a + sumQuarter(e), 0);
  const adsPlanTotal = pm('meta') + pm('google') + pm('zalo');
  const mgPlan = pm('meta') + pm('google');
  const actM = (k: 'meta' | 'google', ms = Q3_MONTHS) => (A ? sum(ms.map(m => A.month[m]?.[k] ?? 0)) : 0);
  const mgAct = actM('meta') + actM('google');

  /* ── Biểu đồ plan vs thực theo tháng ── */
  const chartOption: EChartsOption = {
    tooltip: {
      trigger: 'axis', axisPointer: { type: 'shadow' },
      formatter: (p: any) => `<div class="font-bold text-xs mb-1">${p[0]?.axisValue}</div>` +
        p.map((i: any) => `<div class="flex justify-between gap-4 text-xs font-mono"><span>${i.marker} ${i.seriesName}</span><b>${formatVND(i.value)}</b></div>`).join(''),
    },
    legend: { top: 0, textStyle: { color: '#9E9B93', fontSize: 11 } },
    grid: { top: 40, right: 15, bottom: 25, left: 60 },
    xAxis: { type: 'category', data: Q3_MONTHS.map(m => MONTH_LABEL[m]), axisLabel: { color: isDark ? '#F3F2EE' : '#18181B', fontSize: 11 } },
    yAxis: { type: 'value', axisLabel: { formatter: (v: number) => formatVND(v, 0), color: '#9E9B93', fontSize: 10 }, splitLine: { lineStyle: { color: '#1F1F26', type: 'dashed' } } },
    series: [
      { name: 'Plan Meta + Google', type: 'bar', stack: 'p', barMaxWidth: 34, itemStyle: { color: isDark ? '#3A3A44' : '#D6D3CA' }, data: Q3_MONTHS.map(m => (planCh.meta[m] || 0) + (planCh.google[m] || 0)) },
      { name: 'Thực · Meta', type: 'bar', stack: 'a', barMaxWidth: 34, itemStyle: { color: '#C5A059' }, data: Q3_MONTHS.map(m => A?.month[m]?.meta ?? 0) },
      { name: 'Thực · Google', type: 'bar', stack: 'a', barMaxWidth: 34, itemStyle: { color: '#22C55E' }, data: Q3_MONTHS.map(m => A?.month[m]?.google ?? 0) },
    ],
  };

  /* ── Chi phí ngoài media (giữ nguyên) ── */
  const NM = (B.nonmedia || []).filter(r => selectedMonths.includes(r.month));
  const nmBudget = NM.reduce((a, b) => a + (b.budget || 0), 0);
  const nmActual = NM.reduce((a, b) => a + (b.actual || 0), 0);
  const nmColumns: Column<(typeof NM)[0]>[] = [
    { key: 'item', header: 'Hạng mục', render: r => <span className="font-bold text-brand-text">{r.item}</span> },
    { key: 'month', header: 'Tháng', render: r => <span className="font-mono text-xs">{r.month}</span> },
    { key: 'budget', header: 'Ngân sách', align: 'right', render: r => <span className="font-mono">{r.budget === null ? '—' : formatVND(r.budget)}</span> },
    { key: 'actual', header: 'Thực chi', align: 'right', render: r => <span className="font-mono font-bold text-brand-goldLight">{r.actual === null ? '—' : formatVND(r.actual)}</span> },
    {
      key: 'use_rate', header: '% sử dụng', align: 'right',
      render: r => <span className={`font-mono ${r.use_rate !== null && r.use_rate > 1 ? 'text-status-bad' : ''}`}>{r.use_rate === null ? '—' : formatPercent(r.use_rate)}</span>,
    },
  ];

  const statusText = !A ? 'đang gọi API Meta/Google…'
    : A.source === 'api' ? `Meta + Google API · đồng bộ tới ${A.through ? dmy(A.through) : '—'}`
      : 'API chưa nối — dùng Excel export (chỉ có kênh × tháng, chưa có cửa hàng)';
  const hasStore = A?.source === 'api';
  const act = (n: number) => (A ? n : null);

  return (
    <div className="space-y-5">
      {!A && (
        <div className="animate-pulse rounded-lg border border-brand-gold/40 bg-brand-surface p-2 text-[11px] text-brand-gold">
          Đang tải thực chi Meta + Google từ API (khoảng 30 giây)… plan hiển thị trước, ô thực tế sẽ điền khi xong.
        </div>
      )}
      <p className="text-xs text-brand-muted">
        Ngân sách quý 3/2026 (Jul · Aug · Sep) — plan đã duyệt so với thực chi Meta + Google.{' '}
        <b className={A?.source === 'excel' ? 'text-status-warning' : 'text-brand-muted'}>{statusText}</b>
        {' · '}Zalo Ads chưa có nguồn thực chi nên chỉ hiện plan.
      </p>

      {/* 1. KPI */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Ngân Sách Gốc Q3" subLabel="Đã duyệt toàn chuỗi" value={formatVND(B.total)} variant="hero" />
        <MetricCard label="Tổng Plan Đã Phân Bổ" subLabel="Brand MKT + Extra" value={formatVND(B.plan)}
          customDeltaText={`${formatPercent(B.plan / (B.total || 1))} ngân sách gốc`} />
        <MetricCard label="Plan Ads 3 Kênh" subLabel="Meta + Google + Zalo" value={formatVND(adsPlanTotal)}
          customDeltaText={`${formatPercent(adsPlanTotal / (B.plan || 1))} tổng plan`} />
        <MetricCard label="Thực Chi Meta + Google" subLabel={`Plan ${formatVND(mgPlan)}`} value={A ? formatVND(mgAct) : '—'}
          variant={mgPlan > 0 && mgAct > mgPlan ? 'warning' : 'default'}
          customDeltaText={A && mgPlan > 0 ? `${formatPercent(mgAct / mgPlan)} plan · ${mgAct > mgPlan ? 'vượt' : 'còn'} ${formatVND(Math.abs(mgPlan - mgAct))}` : undefined} />
      </div>

      {/* 2. Digital theo kênh × tháng */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Card title="Digital · Plan vs Thực Tế Theo Tháng" description="Cột xám = plan Meta + Google · cột chồng = thực chi" chip="CỘT" className="lg:col-span-2">
          <EChartWrapper option={chartOption} height={280} />
        </Card>
        <Card title="Digital Theo Kênh × Tháng" description="Mỗi ô: dòng trên = thực chi · dòng dưới = plan · % sử dụng (đỏ khi vượt). Plan tính cho toàn chuỗi (gồm Brand MKT + Extra Tiệc/CRM)." chip="KÊNH × THÁNG" className="lg:col-span-3">
          <div className="overflow-x-auto rounded-lg border border-brand-border bg-brand-surface/50">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className={HEAD}>
                  <th className="p-2.5">Kênh</th>
                  {Q3_MONTHS.map(m => <th key={m} className={TH}>{MONTH_LABEL[m]}</th>)}
                  <th className={TH}>Q3</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border/40 font-mono">
                {(['meta', 'google'] as const).map(k => (
                  <tr key={k} className="hover:bg-brand-cardHover">
                    <td className="p-2.5 align-top font-sans font-bold text-brand-text">{k === 'meta' ? 'Meta Ads' : 'Google Ads'}</td>
                    {Q3_MONTHS.map(m => <td key={m} className={TD}><PvA a={act(actM(k, [m]))} p={pm(k, [m])} /></td>)}
                    <td className={TD}><PvA a={act(actM(k))} p={pm(k)} strong /></td>
                  </tr>
                ))}
                <tr className={TOTAL_ROW}>
                  <td className="p-2.5 align-top font-sans">Meta + Google</td>
                  {Q3_MONTHS.map(m => <td key={m} className={TD}><PvA a={act(actM('meta', [m]) + actM('google', [m]))} p={pm('meta', [m]) + pm('google', [m])} /></td>)}
                  <td className={TD}><PvA a={act(mgAct)} p={mgPlan} strong /></td>
                </tr>
                <tr className="italic text-brand-muted">
                  <td className="p-2.5 align-top font-sans">Zalo Ads<div className="text-[10px] not-italic text-brand-faint">chưa có thực chi</div></td>
                  {Q3_MONTHS.map(m => <td key={m} className={TD}><PvA a={null} p={pm('zalo', [m])} /></td>)}
                  <td className={TD}><PvA a={null} p={pm('zalo')} /></td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* 3. Cấu trúc plan hai tầng */}
      <Card title="Cấu Trúc Plan Hai Tầng (Q3/2026)" description="Tầng 1: Brand MKT (2% doanh thu mục tiêu) · Tầng 2: Extra (Chạy Tiệc, CRM). Đây là plan — thực chi từng hạng mục xem ở các bảng Digital và Ngoài media." chip="PLAN" hero>
        <div className="overflow-x-auto rounded-lg border border-brand-border bg-brand-surface/50">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className={HEAD}>
                <th className="p-2.5">Tầng</th><th className="p-2.5">Hạng mục</th>
                <th className={TH}>Ngân sách gốc</th><th className={TH}>Plan Q3</th>
                {Q3_MONTHS.map(m => <th key={m} className={TH}>{MONTH_LABEL[m]}</th>)}
                <th className={TH}>Plan / gốc</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-border/40 font-mono">
              {brandBudgets.map(b => (
                <tr key={b.brand} className="hover:bg-brand-cardHover">
                  <td className="p-2.5"><span className="rounded bg-status-okBg px-1.5 py-0.5 text-[9px] text-status-ok font-sans font-semibold">Brand MKT</span></td>
                  <td className="p-2.5 font-sans font-bold" style={{ color: BRAND_COLORS[b.brand] }}>● {b.brand}</td>
                  <td className="p-2.5 text-right text-brand-muted">{formatVND(b.budget)}</td>
                  <td className="p-2.5 text-right font-bold text-brand-goldLight">{formatVND(sumQuarter(b))}</td>
                  {Q3_MONTHS.map(m => <td key={m} className="p-2.5 text-right">{formatVND((b as any)[m] || 0)}</td>)}
                  <td className="p-2.5 text-right font-bold">{formatPercent(sumQuarter(b) / b.budget)}</td>
                </tr>
              ))}
              {extraBudgets.map(e => (
                <tr key={e.name} className="hover:bg-brand-cardHover">
                  <td className="p-2.5"><span className="rounded bg-status-warningBg px-1.5 py-0.5 text-[9px] text-status-warning font-sans font-semibold">Extra</span></td>
                  <td className="p-2.5 font-sans font-semibold text-brand-text">{e.name}</td>
                  <td className="p-2.5 text-right text-brand-faint">—</td>
                  <td className="p-2.5 text-right font-bold text-brand-goldLight">{formatVND(sumQuarter(e))}</td>
                  {Q3_MONTHS.map(m => <td key={m} className="p-2.5 text-right">{formatVND((e as any)[m] || 0)}</td>)}
                  <td className="p-2.5 text-right text-brand-faint">—</td>
                </tr>
              ))}
              <tr className={TOTAL_ROW}>
                <td colSpan={2} className="p-2.5 font-sans">TỔNG CỘNG PLAN Q3</td>
                <td className="p-2.5 text-right text-brand-muted">{formatVND(brandBudgets.reduce((a, b) => a + b.budget, 0))}</td>
                <td className="p-2.5 text-right text-brand-gold">{formatVND(brandPlanSum + extraPlanSum)}</td>
                {Q3_MONTHS.map(m => (
                  <td key={m} className="p-2.5 text-right">{formatVND(brandBudgets.reduce((a, b) => a + ((b as any)[m] || 0), 0) + extraBudgets.reduce((a, e) => a + ((e as any)[m] || 0), 0))}</td>
                ))}
                <td className="p-2.5 text-right text-brand-faint">—</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      {/* 4. Digital theo cửa hàng */}
      <Card title="Digital Ads Theo Cửa Hàng · Plan vs Thực Tế (cả quý)"
        description="Plan là phần ads của từng cửa hàng (đã gồm phần Extra chia xuống). Thực chi gán cửa hàng theo tên chiến dịch — phần lớn chiến dịch Meta chạy chung cả brand nên so sánh có nghĩa nhất ở dòng Σ của brand. Page NEC (tiệc) ở dòng riêng cuối bảng."
        chip="STORE ADS">
        {!hasStore && <div className="mb-2 rounded-lg border border-status-warning/40 bg-status-warningBg/20 p-2 text-[11px] text-status-warning">Chưa có số thực chi theo cửa hàng — cần API Meta/Google.</div>}
        <div className="overflow-x-auto rounded-lg border border-brand-border bg-brand-surface/50">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className={HEAD}>
                <th className="p-2.5">Brand</th><th className="p-2.5">Cửa hàng</th>
                <th className={TH}>Meta</th><th className={TH}>Google</th>
                <th className={TH}>Meta + Google</th><th className={TH}>Zalo (plan)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-border/40 font-mono">
              {BRANDS.filter(b => brandMatches(b)).map(b => {
                const ss = storeAds.filter(s => s.brand === b);
                const bl = A?.brandLevel[b] ?? { meta: 0, google: 0 };
                const bMeta = bl.meta + sum(ss.map(s => A?.store[s.store]?.meta ?? 0));
                const bGg = bl.google + sum(ss.map(s => A?.store[s.store]?.google ?? 0));
                return (
                  <React.Fragment key={b}>
                    {ss.map(s => {
                      const a = A?.store[s.store] ?? { meta: 0, google: 0 };
                      return (
                        <tr key={s.store} className="hover:bg-brand-cardHover">
                          <td className="p-2.5 align-top font-sans font-bold" style={{ color: BRAND_COLORS[b] }}>● {b}</td>
                          <td className="p-2.5 align-top font-sans font-semibold text-brand-text">{s.store}<div className="text-[10px] font-normal text-brand-faint">Target DT {formatVND(s.target)}</div></td>
                          <td className={TD}><PvA a={hasStore && a.meta > 0 ? a.meta : null} p={s.meta} /></td>
                          <td className={TD}><PvA a={hasStore && a.google > 0 ? a.google : null} p={s.google || null} /></td>
                          <td className={TD}><PvA a={hasStore && a.meta + a.google > 0 ? a.meta + a.google : null} p={(s.meta || 0) + (s.google || 0)} strong /></td>
                          <td className={`${TD} text-brand-muted`}>{s.zalo ? formatVND(s.zalo) : <span className="text-brand-faint">—</span>}</td>
                        </tr>
                      );
                    })}
                    <tr className="italic">
                      <td className="p-2.5" />
                      <td className="p-2.5 align-top font-sans text-brand-muted">Chạy cấp brand<div className="text-[10px] not-italic">chưa gán cửa hàng</div></td>
                      <td className={TD}><PvA a={hasStore && bl.meta > 0 ? bl.meta : null} p={null} /></td>
                      <td className={TD}><PvA a={hasStore && bl.google > 0 ? bl.google : null} p={null} /></td>
                      <td className={TD}><PvA a={hasStore && bl.meta + bl.google > 0 ? bl.meta + bl.google : null} p={null} /></td>
                      <td className={TD} />
                    </tr>
                    <tr className="border-b-2 border-brand-border font-bold text-brand-text">
                      <td className="p-2.5 font-sans" colSpan={2}>Σ {b}<div className="text-[10px] font-normal text-brand-muted">cửa hàng + cấp brand · so plan cả brand</div></td>
                      <td className={TD}><PvA a={hasStore ? bMeta : null} p={sum(ss.map(s => s.meta || 0))} /></td>
                      <td className={TD}><PvA a={hasStore ? bGg : null} p={sum(ss.map(s => s.google || 0))} /></td>
                      <td className={TD}><PvA a={hasStore ? bMeta + bGg : null} p={sum(ss.map(s => (s.meta || 0) + (s.google || 0)))} strong /></td>
                      <td className={`${TD} text-brand-muted`}>{formatVND(sum(ss.map(s => s.zalo || 0)))}</td>
                    </tr>
                  </React.Fragment>
                );
              })}
              {hasStore && A && allBrands && (A.common.meta + A.common.google > 0 || A.unknown.meta + A.unknown.google > 0) && (
                <>
                  {A.common.meta + A.common.google > 0 && (
                    <tr className="italic">
                      <td className="p-2.5" /><td className="p-2.5 font-sans text-brand-muted">Booking Tiệc chung (page NEC)</td>
                      <td className={TD}><PvA a={A.common.meta} p={null} /></td><td className={TD}><PvA a={A.common.google} p={null} /></td>
                      <td className={TD}><PvA a={A.common.meta + A.common.google} p={null} /></td><td className={TD} />
                    </tr>
                  )}
                  {A.unknown.meta + A.unknown.google > 0 && (
                    <tr className="italic">
                      <td className="p-2.5" /><td className="p-2.5 font-sans text-status-warning">Chưa gán brand</td>
                      <td className={TD}><PvA a={A.unknown.meta} p={null} /></td><td className={TD}><PvA a={A.unknown.google} p={null} /></td>
                      <td className={TD}><PvA a={A.unknown.meta + A.unknown.google} p={null} /></td><td className={TD} />
                    </tr>
                  )}
                </>
              )}
              <tr className={TOTAL_ROW}>
                <td className="p-2.5 font-sans" colSpan={2}>TỔNG {allBrands ? 'TOÀN CHUỖI' : 'BRAND ĐANG LỌC'}</td>
                {(() => {
                  const pMeta = sum(storeAds.map(s => s.meta || 0)), pGg = sum(storeAds.map(s => s.google || 0));
                  const all = allBrands;
                  const aMeta = A ? (all ? actM('meta') : sum(storeAds.map(s => A.store[s.store]?.meta ?? 0)) + sum(BRANDS.filter(b => brandMatches(b)).map(b => A.brandLevel[b]?.meta ?? 0))) : 0;
                  const aGg = A ? (all ? actM('google') : sum(storeAds.map(s => A.store[s.store]?.google ?? 0)) + sum(BRANDS.filter(b => brandMatches(b)).map(b => A.brandLevel[b]?.google ?? 0))) : 0;
                  return (
                    <>
                      <td className={TD}><PvA a={A ? aMeta : null} p={pMeta} /></td>
                      <td className={TD}><PvA a={A ? aGg : null} p={pGg} /></td>
                      <td className={TD}><PvA a={A ? aMeta + aGg : null} p={pMeta + pGg} strong /></td>
                      <td className={`${TD} text-brand-muted`}>{formatVND(sum(storeAds.map(s => s.zalo || 0)))}</td>
                    </>
                  );
                })()}
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      {/* 5. Chi phí ngoài media */}
      {NM.length > 0 && (
        <Card title="Chi Phí Ngoài Media · Ngân Sách vs Thực Chi" description="KOL/KOC · POSM & in ấn · sản xuất nội dung · sự kiện — KHÔNG cộng vào media spend khi tính Ad Cost Ratio" chip="NON-MEDIA">
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <MetricCard label="Ngân sách" subLabel="Σ hạng mục trong kỳ" value={formatVND(nmBudget)} />
            <MetricCard label="Thực chi" subLabel="Σ actual" value={formatVND(nmActual)} variant={nmBudget > 0 && nmActual > nmBudget ? 'warning' : 'default'} />
            <MetricCard label="% Sử dụng" subLabel="actual ÷ budget" value={nmBudget > 0 ? formatPercent(nmActual / nmBudget) : '—'}
              customDeltaText={nmBudget > 0 ? `Chênh ${formatVND(nmActual - nmBudget)}` : 'chưa khai ngân sách'} />
          </div>
          <DataTable columns={nmColumns} data={NM} searchable={false} pageSize={8} exportFilename="Noire_NonMedia_Cost" />
        </Card>
      )}
    </div>
  );
};
