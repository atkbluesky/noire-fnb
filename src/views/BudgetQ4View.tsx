/**
 * M4 · Ngân sách Q4/2026 — PLAN vs THỰC TẾ.
 *
 * Plan   : src/data/budget_q4.json (scripts/build-budget-q4.mjs ← file phân bổ Q4 trong L0_input).
 * Thực tế:
 *   · Digital → /api/ads/performance (Meta + Google API, cùng nguồn M5). Không nhập tay.
 *       Meta Promo  = segment NCB/NDC/NJFB của Meta (phễu store)
 *       Google      = Google theo brand
 *       Booking Tiệc = phễu booking theo PAGE chạy; page NEC không chia được brand → dòng riêng
 *       Cửa hàng    = gán theo TÊN chiến dịch; chiến dịch chạy cấp brand → dòng "chưa gán cửa hàng"
 *   · Ngoài Digital → budget_q4.json.actual (file NOIRE_Q4_ThucChi_*.xlsx nhập tay).
 *
 * Hai cấp chi tiết theo đúng file ngân sách: Digital tới cửa hàng × tháng; hạng mục khác tới brand × cả quý.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useFilters } from '../context/FilterContext';
import { BRAND_COLORS } from '../data';
import { MetricCard } from '../components/common/MetricCard';
import { Card } from '../components/common/Card';
import { EChartWrapper } from '../components/charts/EChartWrapper';
import { formatVND, formatPercent } from '../utils/formatters';
import type { EChartsOption } from 'echarts';
import Q4 from '../data/budget_q4.json';
import { sum, dmy, monthEnd, yesterdayIct, PvA, TH, TD, HEAD, TOTAL_ROW } from './budgetShared';

const MONTH_LABEL: Record<string, string> = { '2026-10': 'Tháng 10', '2026-11': 'Tháng 11', '2026-12': 'Tháng 12' };
const BRANDS = ['NCB', 'NDC', 'NJFB'];
const Q_START = '2026-10-01';
const Q_END = '2026-12-31';
const Q_DAYS = 92;

/* Gán chiến dịch → cửa hàng theo tên. Không khớp thì để "chưa gán" chứ không đoán. */
const STORE_PAT: Array<[string, RegExp]> = [
  ['Empress Tower', /empress/i],
  ['The Mett', /\bmett\b/i],
  ['SonKim Capital', /sonkim|son kim|\bskc\b/i],
  ['39NTMK', /39\s?ntmk/i],
  ['The Berkley', /berkley/i],
  ['SSV', /\bssv\b/i],
  ['The Crest', /crest/i],
];
const storeOf = (name: string) => STORE_PAT.find(([, p]) => p.test(name))?.[0] ?? null;

type Ch = { meta: number; google: number; booking: number };
const ZERO: Ch = { meta: 0, google: 0, booking: 0 };
interface Actual {
  through: string | null;                                       // ngày cuối đã đồng bộ (min Meta/Google)
  brandMonth: Record<string, Ch>;                               // `${brand}|${month}`
  commonBooking: Record<string, number>;                        // booking page NEC / không thuộc brand — theo tháng
  other: number;                                                // chi KHAC (chưa gán brand) — chỉ để cảnh báo
  store: Record<string, { meta: number; google: number }>;      // `${store}|${month}`
  unassigned: Record<string, { meta: number; google: number }>; // `${brand}|${month}`
}

/** Kéo thực chi Digital Q4: số theo tháng (cả lịch sử) + chiến dịch từng tháng để gán cửa hàng. */
function useDigitalActual() {
  const [state, setState] = useState<{ status: 'loading' | 'ready' | 'none' | 'error'; data: Actual | null }>({ status: 'loading', data: null });
  useEffect(() => {
    const y = yesterdayIct();
    const started = Q4.months.filter(m => `${m}-01` <= y);
    if (!started.length) { setState({ status: 'none', data: null }); return; }
    let alive = true;
    Promise.all(started.map(m => {
      const to = monthEnd(m) < y ? monthEnd(m) : y;
      return fetch(`/api/ads/performance?from=${m}-01&to=${to}`).then(r => r.json()).then(b => ({ m, b }));
    })).then(rs => {
      if (!alive) return;
      if (rs.some(r => !r.b?.ok)) { setState({ status: 'error', data: null }); return; }
      const b0 = rs[0].b;
      const A: Actual = { through: null, brandMonth: {}, commonBooking: {}, other: 0, store: {}, unassigned: {} };
      const bm = (b: string, m: string) => (A.brandMonth[`${b}|${m}`] ??= { ...ZERO });
      const inQ = (m: string) => Q4.months.includes(m);
      for (const r of b0.segmentMonthly ?? []) {
        if (!inQ(r.month)) continue;
        if (BRANDS.includes(r.segment)) bm(r.segment, r.month).meta += r.spend;
        else if (r.segment === 'KHAC') A.other += r.spend;
      }
      for (const r of b0.tiecByPage ?? []) {
        if (!inQ(r.month)) continue;
        if (BRANDS.includes(r.page)) bm(r.page, r.month).booking += r.spend;
        else A.commonBooking[r.month] = (A.commonBooking[r.month] ?? 0) + r.spend;
      }
      for (const r of b0.google?.monthly ?? []) {
        if (!inQ(r.month)) continue;
        if (BRANDS.includes(r.brand)) bm(r.brand, r.month).google += r.spend;
        else if (r.brand === 'TIEC') A.commonBooking[r.month] = (A.commonBooking[r.month] ?? 0) + r.spend;
        else A.other += r.spend;
      }
      for (const { m, b } of rs) {
        const put = (brand: string, name: string, k: 'meta' | 'google', v: number) => {
          const s = storeOf(name);
          const sObj = s && Q4.stores.find(x => x.store === s && x.brand === brand);
          const bucket = sObj ? (A.store[`${s}|${m}`] ??= { meta: 0, google: 0 }) : (A.unassigned[`${brand}|${m}`] ??= { meta: 0, google: 0 });
          bucket[k] += v;
        };
        for (const c of b.campaigns ?? []) if (c.platform === 'meta' && BRANDS.includes(c.segment)) put(c.segment, c.campaignName, 'meta', c.spend);
        for (const c of b.google?.campaigns ?? []) if (BRANDS.includes(c.brand)) put(c.brand, `${c.campaign} ${c.store ?? ''}`, 'google', c.spend);
      }
      const meta = b0.syncedThrough as string | null;
      const goo = b0.google?.syncedThrough as string | null;
      A.through = meta && goo ? (meta < goo ? meta : goo) : meta ?? goo;
      setState({ status: 'ready', data: A });
    }).catch(() => alive && setState({ status: 'error', data: null }));
    return () => { alive = false; };
  }, []);
  return state;
}


export const BudgetQ4View: React.FC = () => {
  const { brandMatches, filters, theme } = useFilters();
  const isDark = theme === 'dark';
  const [mo, setMo] = useState<string | null>(null); // null = cả quý
  const months = mo ? [mo] : Q4.months;
  const kyLabel = mo ? MONTH_LABEL[mo] : 'Q4';
  const showCommon = filters.brand === 'ALL';

  const act = useDigitalActual();
  const A = act.data;
  const hasDigital = act.status === 'ready' || act.status === 'none';
  const dA = (b: string, ms: string[]): Ch => {
    if (!A) return { ...ZERO };
    return ms.reduce((acc, m) => { const x = A.brandMonth[`${b}|${m}`] ?? ZERO; return { meta: acc.meta + x.meta, google: acc.google + x.google, booking: acc.booking + x.booking }; }, { ...ZERO });
  };
  const commonBk = (ms: string[]) => (A ? sum(ms.map(m => A.commonBooking[m] ?? 0)) : 0);

  /* Thực chi ngoài Digital (file nhập tay). Chưa có file → null (không phải 0). */
  const hasNonDigitalFile = Boolean(Q4.actualFile);
  const ndActual = (b: string, item: string) =>
    hasNonDigitalFile ? sum((Q4.actual as Array<{ brand: string; item: string; amount: number }>).filter(r => r.brand === b && r.item === item).map(r => r.amount)) : null;

  const brands = Q4.brands.filter(b => brandMatches(b.brand));
  const brandList = brands.map(b => b.brand);
  const planOf = (b: typeof brands[0], item: string) => (b.items as Record<string, number>)[item] ?? 0;
  const digitalActualQ = (b: string) => { const x = dA(b, Q4.months); return x.meta + x.google + x.booking; };
  const actualOf = (b: string, item: string): number | null =>
    item === 'Digital Ads' ? (hasDigital ? digitalActualQ(b) : null) : ndActual(b, item);

  /* ── KPI ─────────────────────────────────────────────────────────────── */
  const planQ = sum(brands.map(b => b.total));
  const digPlanQ = sum(brands.map(b => planOf(b, 'Digital Ads')));
  const digActQ = sum(brandList.map(digitalActualQ)) + (showCommon ? commonBk(Q4.months) : 0);
  const ndPlanQ = planQ - digPlanQ;
  const ndActQ = hasNonDigitalFile ? sum(brands.flatMap(b => Q4.items.filter(i => i !== 'Digital Ads').map(i => ndActual(b.brand, i) ?? 0))) : 0;
  const actQ = digActQ + ndActQ;
  const bmSel = Q4.brandMonth.filter(r => brandMatches(r.brand) && months.includes(r.month));
  const digPlanSel = sum(bmSel.map(r => r.meta + r.google + r.booking));
  const digActSel = sum(brandList.map(b => { const x = dA(b, months); return x.meta + x.google + x.booking; })) + (showCommon ? commonBk(months) : 0);
  const through = A?.through ?? null;
  const elapsed = through && through >= Q_START ? Math.min(1, (Date.parse(through) - Date.parse(Q_START)) / 86_400_000 / Q_DAYS + 1 / Q_DAYS) : 0;

  /* ── Biểu đồ: plan (cột xám) vs thực tế (cột chồng theo kênh) mỗi tháng ── */
  const chartOption: EChartsOption = useMemo(() => {
    const planM = (m: string) => sum(Q4.brandMonth.filter(r => brandMatches(r.brand) && r.month === m).map(r => r.meta + r.google + r.booking));
    const actM = (m: string, k: keyof Ch) => sum(brandList.map(b => dA(b, [m])[k])) + (k === 'booking' && showCommon ? commonBk([m]) : 0);
    return {
      tooltip: {
        trigger: 'axis', axisPointer: { type: 'shadow' },
        formatter: (p: any) => `<div class="font-bold text-xs mb-1">${p[0]?.axisValue}</div>` +
          p.map((i: any) => `<div class="flex justify-between gap-4 text-xs font-mono"><span>${i.marker} ${i.seriesName}</span><b>${formatVND(i.value)}</b></div>`).join(''),
      },
      legend: { top: 0, textStyle: { color: '#9E9B93', fontSize: 11 } },
      grid: { top: 40, right: 15, bottom: 25, left: 60 },
      xAxis: { type: 'category', data: Q4.months.map(m => MONTH_LABEL[m]), axisLabel: { color: isDark ? '#F3F2EE' : '#18181B', fontSize: 11 } },
      yAxis: { type: 'value', axisLabel: { formatter: (v: number) => formatVND(v, 0), color: '#9E9B93', fontSize: 10 }, splitLine: { lineStyle: { color: '#1F1F26', type: 'dashed' } } },
      series: [
        { name: 'Plan Digital', type: 'bar' as const, stack: 'p', barMaxWidth: 34, itemStyle: { color: isDark ? '#3A3A44' : '#D6D3CA' }, data: Q4.months.map(planM) },
        ...([['Thực · Meta Promo', 'meta', '#C5A059'], ['Thực · Google', 'google', '#22C55E'], ['Thực · Booking Tiệc', 'booking', '#82846C']] as const)
          .map(([name, k, color]) => ({ name, type: 'bar' as const, stack: 'a', barMaxWidth: 34, itemStyle: { color }, data: Q4.months.map(m => actM(m, k)) })),
      ],
    };
  }, [A, filters.brand, isDark]);

  /* ── Cửa hàng ─────────────────────────────────────────────────────────── */
  const sPlan = (s: typeof Q4.stores[0], ms: string[]) => ({
    meta: sum(ms.map(m => s.months[m as keyof typeof s.months].meta)),
    google: sum(ms.map(m => s.months[m as keyof typeof s.months].google)),
  });
  const sAct = (store: string, ms: string[]) => ({
    meta: A ? sum(ms.map(m => A.store[`${store}|${m}`]?.meta ?? 0)) : 0,
    google: A ? sum(ms.map(m => A.store[`${store}|${m}`]?.google ?? 0)) : 0,
  });
  const uAct = (b: string, ms: string[]) => ({
    meta: A ? sum(ms.map(m => A.unassigned[`${b}|${m}`]?.meta ?? 0)) : 0,
    google: A ? sum(ms.map(m => A.unassigned[`${b}|${m}`]?.google ?? 0)) : 0,
  });
  const av = (x: number) => (hasDigital ? x : null);

  const statusText = act.status === 'loading' ? 'đang gọi API Meta/Google…'
    : act.status === 'error' ? 'API chưa sẵn sàng — chưa có số thực tế Digital'
      : act.status === 'none' ? 'quý chưa có ngày nào chốt số — thực tế = 0'
        : `Meta + Google API · đồng bộ tới ${through ? dmy(through) : '—'}`;

  return (
    <div className="space-y-5">
      {/* Thanh điều khiển */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-brand-muted">Tháng</span>
        {[null, ...Q4.months].map(m => (
          <button key={m ?? 'ALL'} onClick={() => setMo(m)}
            className={`rounded-full border px-3 py-1 text-[11px] ${mo === m ? 'border-brand-gold text-brand-gold' : 'border-brand-border text-brand-muted'}`}>
            {m ? MONTH_LABEL[m] : 'Cả quý'}
          </button>
        ))}
        <span className="text-[11px] text-brand-faint">
          Thực tế Digital: <b className={act.status === 'error' ? 'text-status-bad' : 'text-brand-muted'}>{statusText}</b>
          {' · '}Ngoài Digital: {hasNonDigitalFile ? `${Q4.actualFile} (${Q4.actual.length} dòng)` : <b className="text-status-warning">chưa có file thực chi</b>}
        </span>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Đã Dùng / Ngân Sách Q4" subLabel={`Plan ${formatVND(planQ)} · ${brands.length} brand`} value={formatVND(actQ)} variant="hero"
          customDeltaText={`${formatPercent(actQ / (planQ || 1))} plan · còn ${formatVND(planQ - actQ)}`} />
        <MetricCard label={`Digital · ${kyLabel}`} subLabel={`Plan ${formatVND(digPlanSel)} · Meta + Google + Booking`} value={hasDigital ? formatVND(digActSel) : '—'}
          variant={digPlanSel > 0 && digActSel > digPlanSel ? 'warning' : 'default'}
          customDeltaText={digPlanSel > 0 && hasDigital ? `${formatPercent(digActSel / digPlanSel)} plan ${kyLabel}` : undefined} />
        <MetricCard label="Ngoài Digital · Q4" subLabel={`Plan ${formatVND(ndPlanQ)} · KOC · FOC · Decor · POSM · Activation · DP`} value={hasNonDigitalFile ? formatVND(ndActQ) : '—'}
          customDeltaText={hasNonDigitalFile ? `${formatPercent(ndActQ / (ndPlanQ || 1))} plan` : 'chưa nhập thực chi'} />
        <MetricCard label="Tiến Độ Quý" subLabel="thời gian đã qua vs ngân sách đã dùng" value={formatPercent(elapsed)}
          variant={actQ / (planQ || 1) > elapsed + 0.1 ? 'warning' : 'default'}
          customDeltaText={`đã dùng ${formatPercent(actQ / (planQ || 1))} ngân sách`} />
      </div>

      {/* Brand × hạng mục */}
      <Card title="Plan vs Thực Tế · Brand × Hạng Mục (cả quý)" description="Mỗi ô: dòng trên = thực chi, dòng dưới = plan · % sử dụng (đỏ khi vượt plan). Digital tự động từ API; hạng mục khác từ file thực chi." chip="BRAND × HẠNG MỤC" hero>
        <div className="overflow-x-auto rounded-lg border border-brand-border bg-brand-surface/50">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className={HEAD}>
                <th className="p-2.5">Brand</th>
                {Q4.items.map(i => <th key={i} className={TH}>{i}</th>)}
                <th className={TH}>Tổng Q4</th>
                <th className={TH} title="Mức MKT Budget 2% doanh thu mục tiêu — tham chiếu">Plan vs mức 2% DT</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-border/40 font-mono">
              {brands.map(b => {
                const tot = sum(Q4.items.map(i => actualOf(b.brand, i) ?? 0));
                return (
                  <tr key={b.brand} className="hover:bg-brand-cardHover">
                    <td className="p-2.5 align-top font-sans font-bold" style={{ color: BRAND_COLORS[b.brand] }}>● {b.brand}</td>
                    {Q4.items.map(i => <td key={i} className={TD}>{planOf(b, i) || actualOf(b.brand, i) ? <PvA a={actualOf(b.brand, i)} p={planOf(b, i)} /> : <span className="text-brand-faint">—</span>}</td>)}
                    <td className={TD}><PvA a={tot} p={b.total} strong /></td>
                    <td className={`${TD} ${b.cap2pct && b.total > b.cap2pct ? 'text-status-bad' : 'text-brand-muted'}`}>
                      <div>{b.cap2pct ? formatVND(b.cap2pct) : '—'}</div>
                      {b.cap2pct ? <div className="text-[10px]">{b.total > b.cap2pct ? 'vượt' : 'dư'} {formatVND(Math.abs(b.total - b.cap2pct))}</div> : null}
                    </td>
                  </tr>
                );
              })}
              {showCommon && commonBk(Q4.months) > 0 && (
                <tr className="italic">
                  <td className="p-2.5 align-top font-sans text-brand-muted">Booking Tiệc chung<div className="text-[10px] not-italic">page NEC · không chia brand</div></td>
                  <td className={TD}><PvA a={commonBk(Q4.months)} p={null} /></td>
                  {Q4.items.slice(1).map(i => <td key={i} className={`${TD} text-brand-faint`}>—</td>)}
                  <td className={TD}><PvA a={commonBk(Q4.months)} p={null} strong /></td><td />
                </tr>
              )}
              <tr className={TOTAL_ROW}>
                <td className="p-2.5 align-top font-sans">TỔNG CỘNG</td>
                {Q4.items.map(i => {
                  const a = i === 'Digital Ads' ? (hasDigital ? digActQ : null) : hasNonDigitalFile ? sum(brandList.map(b => ndActual(b, i) ?? 0)) : null;
                  return <td key={i} className={TD}><PvA a={a} p={sum(brands.map(b => planOf(b, i)))} /></td>;
                })}
                <td className={TD}><PvA a={actQ} p={planQ} strong /></td>
                <td className={`${TD} text-brand-muted`}>{formatVND(sum(brands.map(b => b.cap2pct ?? 0)))}</td>
              </tr>
            </tbody>
          </table>
        </div>
        {!hasNonDigitalFile && (
          <p className="mt-2 text-[11px] text-status-warning">
            Chưa có thực chi ngoài Digital — nhập ở <b>L0_input/03_MARKETING/04_Ngan_Sach/NOIRE_Q4_ThucChi_2026.xlsx</b> rồi chạy <code>npm run build:budget-q4</code>.
          </p>
        )}
      </Card>

      {/* Digital: tháng × kênh */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Card title="Digital · Plan vs Thực Tế Theo Tháng" description="Cột xám = plan · cột chồng = thực chi theo kênh" chip="CỘT" className="lg:col-span-2">
          <EChartWrapper option={chartOption} height={300} />
        </Card>
        <Card title={`Digital Theo Brand × Kênh · ${kyLabel}`} description="Store Media (Meta Promo + Google) chia tới cửa hàng · Booking Tiệc quản lý ở cấp brand" chip="BRAND × KÊNH" className="lg:col-span-3">
          <div className="overflow-x-auto rounded-lg border border-brand-border bg-brand-surface/50">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className={HEAD}>
                  <th className="p-2.5">Brand</th><th className="p-2.5">Tháng</th>
                  <th className={TH}>Meta Promo</th><th className={TH}>Google</th><th className={TH}>Booking Tiệc</th><th className={TH}>Tổng Digital</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border/40 font-mono">
                {bmSel.map(r => {
                  const x = dA(r.brand, [r.month]);
                  return (
                    <tr key={r.brand + r.month} className="hover:bg-brand-cardHover" title={r.focus}>
                      <td className="p-2.5 align-top font-sans font-bold" style={{ color: BRAND_COLORS[r.brand] }}>● {r.brand}</td>
                      <td className="p-2.5 align-top">{MONTH_LABEL[r.month]}<div className="max-w-[180px] truncate font-sans text-[10px] text-brand-faint">{r.focus}</div></td>
                      <td className={TD}><PvA a={av(x.meta)} p={r.meta} /></td>
                      <td className={TD}><PvA a={av(x.google)} p={r.google} /></td>
                      <td className={TD}><PvA a={av(x.booking)} p={r.booking} /></td>
                      <td className={TD}><PvA a={av(x.meta + x.google + x.booking)} p={r.meta + r.google + r.booking} strong /></td>
                    </tr>
                  );
                })}
                {showCommon && commonBk(months) > 0 && (
                  <tr className="italic">
                    <td className="p-2.5 font-sans text-brand-muted" colSpan={2}>Booking Tiệc chung (page NEC)</td>
                    <td className={TD} /><td className={TD} />
                    <td className={TD}><PvA a={commonBk(months)} p={null} /></td><td className={TD}><PvA a={commonBk(months)} p={null} strong /></td>
                  </tr>
                )}
                <tr className={TOTAL_ROW}>
                  <td className="p-2.5 font-sans" colSpan={2}>TỔNG {kyLabel.toUpperCase()}</td>
                  {(['meta', 'google', 'booking'] as const).map(k => (
                    <td key={k} className={TD}>
                      <PvA a={av(sum(brandList.map(b => dA(b, months)[k])) + (k === 'booking' && showCommon ? commonBk(months) : 0))} p={sum(bmSel.map(r => r[k]))} />
                    </td>
                  ))}
                  <td className={TD}><PvA a={av(digActSel)} p={digPlanSel} strong /></td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Digital theo cửa hàng */}
      <Card title={`Digital Ads Theo Cửa Hàng · ${kyLabel}`} description="Thực chi gán cửa hàng theo tên chiến dịch (VD “NDC-39NTMK-…”, “Local SSV”). Chiến dịch chạy cấp brand không gán được cửa hàng → dòng “Chạy cấp brand”. Dòng Σ = Digital của brand." chip="STORE ADS">
        <div className="overflow-x-auto rounded-lg border border-brand-border bg-brand-surface/50">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className={HEAD}>
                <th className="p-2.5">Brand</th><th className="p-2.5">Cửa hàng</th>
                <th className={TH}>Meta Promo</th><th className={TH}>Google</th>
                {!mo && Q4.months.map(m => <th key={m} className={TH}>{MONTH_LABEL[m]}</th>)}
                <th className={TH}>Tổng {kyLabel}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-border/40 font-mono">
              {brandList.map(b => {
                const ss = Q4.stores.filter(s => s.brand === b);
                const bkPlan = (ms: string[]) => sum(Q4.brandMonth.filter(r => r.brand === b && ms.includes(r.month)).map(r => r.booking));
                const bkAct = (ms: string[]) => dA(b, ms).booking;
                const u = uAct(b, months);
                const digPlan = (ms: string[]) => sum(Q4.brandMonth.filter(r => r.brand === b && ms.includes(r.month)).map(r => r.meta + r.google + r.booking));
                const digAct = (ms: string[]) => { const x = dA(b, ms); return x.meta + x.google + x.booking; };
                return (
                  <React.Fragment key={b}>
                    {ss.map(s => {
                      const p = sPlan(s, months); const a = sAct(s.store, months);
                      return (
                        <tr key={s.store} className="hover:bg-brand-cardHover">
                          <td className="p-2.5 align-top font-sans font-bold" style={{ color: BRAND_COLORS[b] }}>● {b}</td>
                          <td className="p-2.5 align-top font-sans font-semibold text-brand-text">{s.store}<div className="text-[10px] font-normal text-brand-faint">Digital gốc {formatVND(s.base)}</div></td>
                          <td className={TD}><PvA a={av(a.meta)} p={p.meta} /></td>
                          <td className={TD}><PvA a={av(a.google)} p={p.google} /></td>
                          {!mo && Q4.months.map(m => { const pm = sPlan(s, [m]); const am = sAct(s.store, [m]); return <td key={m} className={TD}><PvA a={av(am.meta + am.google)} p={pm.meta + pm.google} /></td>; })}
                          <td className={TD}><PvA a={av(a.meta + a.google)} p={p.meta + p.google} strong /></td>
                        </tr>
                      );
                    })}
                    <tr className="italic">
                      <td className="p-2.5" />
                      <td className="p-2.5 align-top font-sans text-brand-muted">Chạy cấp brand<div className="text-[10px] not-italic">chưa gán cửa hàng</div></td>
                      <td className={TD}><PvA a={av(u.meta)} p={null} /></td>
                      <td className={TD}><PvA a={av(u.google)} p={null} /></td>
                      {!mo && Q4.months.map(m => { const x = uAct(b, [m]); return <td key={m} className={TD}><PvA a={av(x.meta + x.google)} p={null} /></td>; })}
                      <td className={TD}><PvA a={av(u.meta + u.google)} p={null} /></td>
                    </tr>
                    <tr className="italic">
                      <td className="p-2.5" />
                      <td className="p-2.5 align-top font-sans text-brand-muted">Meta Booking Tiệc<div className="text-[10px] not-italic">pool chung {b}</div></td>
                      <td className={TD}><PvA a={av(bkAct(months))} p={bkPlan(months)} /></td>
                      <td className={`${TD} text-brand-faint`}>—</td>
                      {!mo && Q4.months.map(m => <td key={m} className={TD}><PvA a={av(bkAct([m]))} p={bkPlan([m])} /></td>)}
                      <td className={TD}><PvA a={av(bkAct(months))} p={bkPlan(months)} /></td>
                    </tr>
                    <tr className="border-b-2 border-brand-border font-bold text-brand-text">
                      <td className="p-2.5 font-sans" colSpan={2}>Σ {b} Digital</td>
                      <td className={TD}><PvA a={av(dA(b, months).meta + dA(b, months).booking)} p={sum(Q4.brandMonth.filter(r => r.brand === b && months.includes(r.month)).map(r => r.meta + r.booking))} /></td>
                      <td className={TD}><PvA a={av(dA(b, months).google)} p={sum(Q4.brandMonth.filter(r => r.brand === b && months.includes(r.month)).map(r => r.google))} /></td>
                      {!mo && Q4.months.map(m => <td key={m} className={TD}><PvA a={av(digAct([m]))} p={digPlan([m])} /></td>)}
                      <td className={TD}><PvA a={av(digAct(months))} p={digPlan(months)} strong /></td>
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        {A && A.other > 0 && (
          <p className="mt-2 text-[11px] text-status-warning">
            Có {formatVND(A.other)} chi Digital trong Q4 chưa gán được brand — chỉnh brand của chiến dịch ở M5 để số vào đúng dòng.
          </p>
        )}
      </Card>

      {/* Chi tiết thực chi ngoài Digital */}
      <Card title="Thực Chi Ngoài Digital · Chi Tiết" description="KOC & PR · FOC Production · Decoration Xmas · POSM & Merchandise · Activation · Dự phòng — nhập tay theo tháng × brand × hạng mục" chip="NHẬP TAY">
        {Q4.actual.length ? (
          <div className="overflow-x-auto rounded-lg border border-brand-border bg-brand-surface/50">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className={HEAD}><th className="p-2.5">Tháng</th><th className="p-2.5">Brand</th><th className="p-2.5">Hạng mục</th><th className={TH}>Số tiền</th><th className="p-2.5">Ghi chú</th></tr>
              </thead>
              <tbody className="divide-y divide-brand-border/40">
                {(Q4.actual as Array<{ month: string; brand: string; item: string; amount: number; note: string }>)
                  .filter(r => brandMatches(r.brand) && months.includes(r.month))
                  .map((r, i) => (
                    <tr key={i} className="hover:bg-brand-cardHover">
                      <td className="p-2.5 font-mono">{MONTH_LABEL[r.month]}</td>
                      <td className="p-2.5 font-bold" style={{ color: BRAND_COLORS[r.brand] }}>● {r.brand}</td>
                      <td className="p-2.5">{r.item}</td>
                      <td className="p-2.5 text-right font-mono font-bold text-brand-goldLight">{formatVND(r.amount)}</td>
                      <td className="p-2.5 text-brand-muted">{r.note}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-brand-border p-4 text-xs text-brand-muted">
            Chưa có khoản thực chi nào. Nhập vào <b>L0_input/03_MARKETING/04_Ngan_Sach/NOIRE_Q4_ThucChi_2026.xlsx</b> (sheet <b>ThucChi</b>: Tháng · Brand · Hạng mục · Số tiền · Ghi chú),
            rồi chạy <code>npm run build:budget-q4</code>. Digital Ads không cần nhập — lấy tự động từ API.
          </div>
        )}
      </Card>
    </div>
  );
};
