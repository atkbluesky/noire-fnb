import React, { useMemo, useState } from 'react';
import type { EChartsOption } from 'echarts';
import { AlertTriangle, FlaskConical, Info, TrendingUp, TrendingDown } from 'lucide-react';
import { useFilters } from '../context/FilterContext';
import { CAMPAIGN } from '../data/campaign';
import { BRAND_COLORS, HUB_DATA } from '../data';
import { MetricCard } from '../components/common/MetricCard';
import { Card } from '../components/common/Card';
import { StatusBadge, BadgeVariant } from '../components/common/StatusBadge';
import { DataTable, Column } from '../components/common/DataTable';
import { EChartWrapper } from '../components/charts/EChartWrapper';
import { formatVND, formatNumber, formatPercent, formatMonthLabel } from '../utils/formatters';
import { PromotionTabs } from '../components/common/PromotionTabs';
import type { Campaign, TaxItem } from '../types/campaign';

/* M7.2 · PROMOTION TRACKING — mục con của M7 Promotion
   Mọi con số đã được tools/campaign.py tính sẵn. Hai cách chấm, ghi ở `eval_scope`:
     PROGRAM — chương trình có kế hoạch Pre-Analysis (pre_id): so HOÁ ĐƠN GẮN CTKM với
               Nền/Target của kế hoạch, đúng công thức P&L của file kế hoạch (cùng M7.1).
     STORE   — chương trình chưa có kế hoạch: lift CẢ CỬA HÀNG so kỳ nền × hệ số mùa vụ.
   Danh mục nhãn / đòn bẩy / cơ chế lấy từ data_contract.json → $campaign qua CAMPAIGN.taxonomy
   — màn hình không khai lại bất kỳ danh sách nào. */

const byCode = (items: TaxItem[]) => Object.fromEntries(items.map(x => [x.code, x])) as Record<string, TaxItem>;
const pct = (x: number | null | undefined, d = 0) => (x === null || x === undefined ? '—' : formatPercent(x, d));
const vnd = (x: number | null | undefined) => (x === null || x === undefined ? '—' : formatVND(x));
const dmy = (s: string | null) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(2, 4)}` : '—');
const dayIndex = (s: string) => Math.round((Date.parse(s) - Date.parse('2026-01-01')) / 86400000);

export const CampaignTrackingView: React.FC = () => {
  const { brandMatches, selectedMonths, theme } = useFilters();
  const isDark = theme === 'dark';
  const T = CAMPAIGN.taxonomy;
  const LABEL = byCode(T.labels);
  const LEVER = byCode(T.levers);
  const MECH = byCode(T.mechanics);
  const WIN = byCode(T.windows);
  const OBJ = byCode(T.objectives);
  /** Mục tiêu · Phương án — khung TC_AOV_FnB_Marketing.pdf (thay cho "Nhịp") */
  const objOf = (c: Campaign) => OBJ[c.objective ?? LEVER[c.lever ?? '']?.group ?? ''];
  const NAT = byCode(T.natures);
  const COST = byCode(T.cost_types);

  const [labelFilter, setLabelFilter] = useState<string | null>(null);

  // chương trình giao với kỳ lọc + brand
  const mFrom = selectedMonths[0] ?? '0000-00';
  const mTo = selectedMonths[selectedMonths.length - 1] ?? '9999-99';
  /* PHẠM VI BÁO CÁO = tháng đang lọc × cửa hàng của brand đang lọc.
     Mọi số trên màn hình cộng từ campaign_month (số POS của chương trình theo tháng × cửa hàng) —
     KHÔNG cộng số cả kỳ chạy: chương trình chạy T1→T9 chỉ được tính phần của tháng đang lọc,
     chương trình ALL chỉ được tính phần ở cửa hàng của brand đang lọc. Nền so sánh = store_month
     của đúng các cửa hàng + tháng đó (cùng định nghĩa Tổng tiền, đã đối soát recon). */
  const inMonth = (m: string) => m >= mFrom && m <= mTo;
  const brandOfStore = (st: string) => (HUB_DATA.stores as any)[st]?.brand as string | undefined;
  const inBrand = (st: string) => { const b = brandOfStore(st); return !!b && brandMatches(b); };
  const scope = useMemo(() => {
    const by: Record<string, { bills: number; guests: number; net: number; disc: number; voucher: number; dup_bills: number; dup_guests: number; dup_net: number }> = {};
    const total: Record<string, number> = {};
    for (const r of CAMPAIGN.month) {
      total[r.id] = (total[r.id] ?? 0) + r.net;
      if (!inMonth(r.m) || !inBrand(r.s)) continue;
      const x = (by[r.id] ||= { bills: 0, guests: 0, net: 0, disc: 0, voucher: 0, dup_bills: 0, dup_guests: 0, dup_net: 0 });
      x.bills += r.bills; x.guests += r.guests; x.net += r.net; x.disc += r.disc; x.voucher += r.voucher;
      x.dup_bills += r.dup_bills; x.dup_guests += r.dup_guests; x.dup_net += r.dup_net;
    }
    // chương trình cùng kế hoạch chấm CHUNG → tỷ trọng phân bổ tính trên cả nhóm
    const gKey = (c: Campaign) => c.plan_group ?? c.id;
    const gTot: Record<string, number> = {}, gIn: Record<string, number> = {};
    for (const c of CAMPAIGN.campaigns) {
      gTot[gKey(c)] = (gTot[gKey(c)] ?? 0) + (total[c.id] ?? 0);
      gIn[gKey(c)] = (gIn[gKey(c)] ?? 0) + (by[c.id]?.net ?? 0);
    }
    const base = { net: 0, tc: 0, guest: 0, stores: new Set<string>() };
    for (const r of (HUB_DATA.store_month || []) as any[]) {
      if (inMonth(r.month) && inBrand(r.store)) { base.net += r.net; base.tc += r.tc; base.guest += r.guest; base.stores.add(r.store); }
    }
    /** phần kết quả (DT tăng thêm · lãi · chi phí) thuộc phạm vi lọc = tỷ trọng doanh thu CTKM trong phạm vi */
    const share = (c: Campaign) => {
      const t = gTot[gKey(c)] ?? 0;
      if (t > 0) return (gIn[gKey(c)] ?? 0) / t;
      // chương trình không có hoá đơn: nằm trọn trong phạm vi mới tính
      const f = (c.period_from ?? '').slice(0, 7), to = (c.period_to ?? c.period_from ?? '').slice(0, 7);
      return f && inMonth(f) && inMonth(to) && c.stores.every(inBrand) ? 1 : 0;
    };
    return { by, base, share };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandMatches, mFrom, mTo]);
  const inScope = useMemo(
    () =>
      CAMPAIGN.campaigns.filter(c => {
        if (scope.by[c.id]) return true;           // có hoá đơn trong tháng × cửa hàng đang lọc
        const f = (c.period_from ?? c.date_from ?? '').slice(0, 7);
        const t = (c.period_to ?? c.date_to ?? '9999-12').slice(0, 7);
        const stores = c.stores.length ? c.stores : [];
        const brandOk = stores.length ? stores.some(inBrand) : brandMatches(c.brand ?? 'ALL');
        return brandOk && f <= mTo && t >= mFrom;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scope, brandMatches, mFrom, mTo],
  );
  /** số của MỘT chương trình trong phạm vi lọc — mọi cột bảng + KPI đọc từ đây */
  const sc = (c: Campaign) => {
    const x = scope.by[c.id];
    const primary = c.plan_primary !== 0;           // dòng phụ của kế hoạch nhận kết quả ở dòng chính
    const f = scope.share(c);
    return {
      bills: x?.bills ?? 0, guests: x?.guests ?? 0, net: x?.net ?? 0, disc: (x?.disc ?? 0) + (x?.voucher ?? 0),
      dup_bills: x?.dup_bills ?? 0, dup_guests: x?.dup_guests ?? 0, dup_net: x?.dup_net ?? 0,
      share: f, primary,
      incr: primary && c.incr !== null ? c.incr * f : null,
      flow: primary && c.measurable && c.flow !== null ? c.flow * f : null,
      cost: primary ? (c.cost.total ?? 0) * f : 0,
    };
  };
  const B = scope.base;
  const bAov = B.tc ? B.net / B.tc : null;
  // Đã chấm lên đầu, kế hoạch chưa chạy xuống cuối (và ẩn khỏi "Tất cả" — xem ở M7.1)
  const RANK: Record<string, number> = { DAT: 0, DAT_LO: 0, GAN_DAT: 0, KHONG_DAT: 0, CHUA_TARGET: 1, CHUA_CHIN: 2, CHUA_DO: 3, KE_HOACH: 4 };
  type Row = Campaign & { rev: number; n_bills: number; aov: number | null; incr_s: number | null; flow_s: number | null; alloc: number };
  const list: Row[] = (labelFilter ? inScope.filter(c => c.label === labelFilter) : inScope.filter(c => c.label !== 'KE_HOACH'))
    .map(c => {
      const x = sc(c);
      return { ...c, rev: x.net, n_bills: x.bills, aov: x.bills ? x.net / x.bills : null, incr_s: x.incr, flow_s: x.flow, alloc: x.share };
    })
    .sort((a, b) => (RANK[a.label] ?? 5) - (RANK[b.label] ?? 5) || String(b.period_from).localeCompare(String(a.period_from)));
  const [selId, setSelId] = useState<string | null>(null);
  const sel: Campaign | undefined =
    CAMPAIGN.campaigns.find(c => c.id === selId) ?? list.find(c => c.measurable && c.label !== 'CHUA_CHIN') ?? list[0];
  const isProg = sel?.eval_scope === 'PROGRAM';

  if (CAMPAIGN.meta.empty) {
    return (
      <div className="p-6 max-w-[1600px] mx-auto">
        <Card title="M7.2 · Promotion Tracking" description="Chưa có dữ liệu">
          <p className="text-sm text-brand-muted">
            Thả file <b>Campaign_Tracking_2026.xlsx</b> (hoặc giữ file mẫu <b>_MAU_Campaign_Tracking.xlsx</b>) vào{' '}
            <code>L0_input/03_MARKETING/07_Campaign_Tracking/</code> rồi chạy CAP_NHAT.bat.
          </p>
        </Card>
      </div>
    );
  }

  /* ── KPI ─────────────────────────────────────────────────────── */
  // Tổng CHỈ cộng chương trình ĐÃ CHẤM (kết thúc + có target). Lift cửa hàng của các chương
  // trình chạy chồng kỳ trên cùng cửa hàng KHÔNG cộng được — cộng là đếm một đồng nhiều lần.
  // các tên POS cùng một kế hoạch nhận chung kết quả — chỉ dòng primary được cộng
  const withTarget = inScope.filter(c => ['DAT', 'DAT_LO', 'GAN_DAT', 'KHONG_DAT'].includes(c.label) && c.plan_primary !== 0);
  const measured = withTarget.filter(c => scope.share(c) > 0);
  const dat = withTarget.filter(c => c.label === 'DAT').length;
  const incr = measured.reduce((a, c) => a + (sc(c).incr ?? 0), 0);
  const costAll = inScope.reduce((a, c) => a + sc(c).cost, 0);
  const costMeasured = measured.reduce((a, c) => a + sc(c).cost, 0);
  const flow = measured.reduce((a, c) => a + (sc(c).flow ?? 0), 0);
  const nAlloc = measured.filter(c => scope.share(c) < 0.999).length;
  const running = inScope.filter(c => c.label !== 'KE_HOACH');
  const nProg = running.filter(c => c.eval_scope === 'PROGRAM').length;
  // Tổng nhiều chương trình: mỗi hoá đơn POS gắn MỘT tên CTKM nên cộng không trùng — trừ hoá đơn LTO
  // đồng thời gắn tên CTKM (dup_*), vốn đã nằm trong số của chương trình CTKM đó.
  const kpiNet = running.reduce((a, c) => a + sc(c).net - sc(c).dup_net, 0);
  const kpiBills = running.reduce((a, c) => a + sc(c).bills - sc(c).dup_bills, 0);
  const kpiGuests = running.reduce((a, c) => a + sc(c).guests - sc(c).dup_guests, 0);
  const kpiWith = running.filter(c => sc(c).bills > 0).length;
  const kpiLto = running.filter(c => c.prog.basis === 'ITEM' && sc(c).bills > 0).length;
  const kpiAov = kpiBills ? kpiNet / kpiBills : null;
  const counts = T.labels.map(l => ({ ...l, n: inScope.filter(c => c.label === l.code).length }));
  const periodTxt = mFrom === mTo ? formatMonthLabel(mFrom) : `${formatMonthLabel(mFrom)}–${formatMonthLabel(mTo)}`;

  /* ── BẢNG CHẤM ĐIỂM ─────────────────────────────────────────── */
  const attCell = (
    a: number | null,
    t: number | null | undefined,
    act: number | null | undefined,
    money = true,
    signed = false,
  ) => {
    if (t === null || t === undefined) {
      if (act === null || act === undefined) return <span className="text-brand-muted">—</span>;
      const color = signed
        ? act > 0
          ? 'text-status-ok'
          : act < 0
          ? 'text-status-bad'
          : 'text-brand-muted'
        : 'text-brand-text';
      const text = money
        ? signed && act > 0
          ? `+${formatVND(act)}`
          : formatVND(act)
        : formatNumber(act);
      return (
        <div className="text-right leading-tight">
          <div className={`font-mono font-bold ${color}`}>{text}</div>
          <div className="text-[10px] text-brand-muted font-mono">chưa target</div>
        </div>
      );
    }
    const color = a === null ? 'text-brand-muted' : a >= 1 ? 'text-status-ok' : a >= 0.8 ? 'text-status-warning' : 'text-status-bad';
    return (
      <div className="text-right leading-tight">
        <div className={`font-mono font-bold ${color}`}>{pct(a)}</div>
        <div className="text-[10px] text-brand-muted font-mono">
          {money ? (signed && (act ?? 0) > 0 ? `+${formatVND(act ?? 0)}` : formatVND(act ?? 0)) : formatNumber(act ?? 0)} / {money ? formatVND(t) : formatNumber(t)}
        </div>
      </div>
    );
  };

  const columns: Column<Row>[] = [
    {
      key: 'name',
      header: 'Chương trình',
      render: c => (
        <button className="block max-w-[230px] text-left" onClick={() => setSelId(c.id)} title={c.name}>
          <div className={`truncate font-bold ${sel?.id === c.id ? 'text-brand-gold' : 'text-brand-text'}`}>{c.name}</div>
          <div className="text-[10px] text-brand-muted">
            {c.brand} · {c.period_from ? `${dmy(c.period_from)} → ${c.date_to ? dmy(c.period_to) : 'đang chạy'} · ${c.days_run ?? 0} ngày` : 'chưa chạy'}
          </div>
          {(c.pre_id || c.prog.basis === 'ITEM') && (
            <div className="text-[10px] text-brand-gold">
              {c.pre_id ? `kế hoạch ${c.pre_id}` : ''}{c.pre_id && c.prog.basis === 'ITEM' ? ' · ' : ''}{c.prog.basis === 'ITEM' ? `theo món LTO · ${formatNumber(c.prog.lto_items ?? 0)} món` : ''}
            </div>
          )}
        </button>
      ),
    },
    {
      key: 'label',
      header: 'Trạng thái',
      render: c => <StatusBadge label={LABEL[c.label]?.label ?? c.label} variant={(LABEL[c.label]?.badge as BadgeVariant) ?? 'neutral'} />,
    },
    /* THỨ TỰ CỘT đi theo SALES = TC × AOV (TC_AOV_FnB_Marketing.pdf):
         quy mô (Doanh thu CTKM) → cấu thành (Hoá đơn × AOV) → hiệu quả (DT tăng thêm) → lợi nhuận.
       Mỗi ô 2 tầng: TRÊN là số tuyệt đối · DƯỚI là % so với CẢ cửa hàng cùng kỳ — đọc được ngay
       chương trình lớn hay nhỏ so với nền, không cần mở chi tiết.
       Doanh thu CTKM = Σ Tổng tiền CẢ hoá đơn (gồm món khác khách gọi kèm):
         · chương trình thường: hoá đơn gắn tên CTKM
         · chương trình LTO: hoá đơn chứa món đã nối ở sheet campaign_item */
    {
      key: 'lever',
      header: 'Phân loại',
      render: c => {
        const lv = LEVER[c.lever ?? ''];
        const ob = objOf(c);
        return (
          <div className="text-[10px] leading-tight">
            <StatusBadge label={NAT[c.nature ?? '']?.short ?? c.nature ?? '—'} variant={(NAT[c.nature ?? '']?.badge as BadgeVariant) ?? 'neutral'} />
            {(ob || lv) && (
              <div className="mt-1 whitespace-nowrap">
                {ob && <b style={{ color: ob.color }}>{ob.code}</b>}
                {ob && lv && <span className="text-brand-faint"> · </span>}
                {lv && <span className="text-brand-muted">{lv.label.split(' — ')[0]}</span>}
              </div>
            )}
          </div>
        );
      },
    },
    {
      key: 'rev', header: 'Doanh thu CTKM', align: 'right',
      render: c => c.n_bills ? (
        <div className="text-right leading-tight" title={`${c.prog.basis === 'ITEM'
          ? `Hoá đơn chứa món LTO (cả kỳ chạy: ${formatNumber(c.prog.lto_qty ?? 0)} món · DT riêng món LTO ${vnd(c.prog.lto_rev)})`
          : 'Hoá đơn gắn tên CTKM'} · trong ${periodTxt} × cửa hàng brand đang lọc · cả kỳ chạy ${vnd(c.promo.net)}`}>
          <div className="font-mono font-bold text-brand-text">
            {c.prog.basis === 'ITEM' && <span className="mr-1 rounded bg-brand-gold/15 px-1 text-[9px] text-brand-gold">LTO</span>}
            {vnd(c.rev)}
          </div>
          <div className="text-[10px] font-mono text-brand-muted">{B.net ? pct(c.rev / B.net, 1) : '—'} DT brand</div>
        </div>
      ) : <span className="text-[10px] text-brand-faint">{c.period_from ? 'không có HĐ trong kỳ' : 'chưa chạy'}</span>,
    },
    {
      key: 'n_bills', header: 'Hoá đơn', align: 'right',
      render: c => c.n_bills ? (
        <div className="text-right font-mono leading-tight">
          <div className="text-brand-text">{formatNumber(c.n_bills)}</div>
          <div className="text-[10px] text-brand-muted">{B.tc ? pct(c.n_bills / B.tc, 1) : '—'} HĐ brand</div>
        </div>
      ) : <span className="text-brand-faint">—</span>,
    },
    {
      key: 'aov', header: 'AOV', align: 'right',
      render: c => {
        if (c.aov === null) return <span className="text-brand-faint">—</span>;
        const d = bAov ? c.aov / bAov - 1 : null;
        return (
          <div className="text-right font-mono leading-tight" title={`AOV brand cùng kỳ ${vnd(bAov)}`}>
            <div className="text-brand-text">{formatVND(c.aov)}</div>
            <div className={`text-[10px] ${d === null ? 'text-brand-muted' : d >= 0 ? 'text-status-ok' : 'text-status-bad'}`}>
              {d === null ? '—' : `${d >= 0 ? '+' : ''}${pct(d, 0)} so AOV brand`}
            </div>
          </div>
        );
      },
    },
    {
      key: 'incr_s', header: 'DT tăng thêm', align: 'right',
      render: c => {
        if (c.plan_primary === 0 && c.incr !== null) {
          return <span className="text-[10px] text-brand-faint" title={c.eval_note ?? ''}>gộp ở dòng chính KH</span>;
        }
        if (c.incr_s === null) {
          return <span className="text-[10px] text-brand-faint" title={c.reason ?? ''}>—</span>;
        }
        // % = tăng thêm ÷ doanh thu brand cùng kỳ NẾU KHÔNG có phần tăng thêm này
        const d = B.net ? c.incr_s / (B.net - c.incr_s) : null;
        const col = c.incr_s >= 0 ? 'text-status-ok' : 'text-status-bad';
        return (
          <div className="text-right font-mono leading-tight"
            title={`${c.eval_scope === 'PROGRAM' ? `Theo kế hoạch ${c.pre_id} · đạt ${pct(c.att.incr)} target tăng thêm` : 'Lift cả cửa hàng so kỳ nền'} · cả kỳ chạy ${vnd(c.incr)}${c.alloc < 0.999 ? ` · phân bổ ${pct(c.alloc)} vào kỳ lọc theo tỷ trọng doanh thu CTKM` : ''}`}>
            <div className={`font-bold ${col}`}>{c.incr_s > 0 ? '+' : ''}{vnd(c.incr_s)}</div>
            <div className={`text-[10px] ${col}`}>
              {d === null ? '—' : `${d >= 0 ? '+' : ''}${pct(d, 1)} DT brand`}{c.alloc < 0.999 ? ' · pb' : ''}
            </div>
          </div>
        );
      },
    },
    {
      key: 'flow_s', header: 'Lãi thực thêm · ROI', align: 'right',
      render: c => {
        if (c.plan_primary === 0 && c.measurable) return <span className="text-[10px] text-brand-faint">gộp ở dòng chính KH</span>;
        return c.flow_s !== null ? (
          <div className="text-right leading-tight" title={`cả kỳ chạy ${vnd(c.flow)}${c.alloc < 0.999 ? ` · phân bổ ${pct(c.alloc)} vào kỳ lọc` : ''}`}>
            <div className={`font-mono font-bold ${c.flow_s >= 0 ? 'text-status-ok' : 'text-status-bad'}`}>{vnd(c.flow_s)}</div>
            <div className="text-[10px] text-brand-muted font-mono">ROI {c.roi === null ? '—' : `${formatNumber(c.roi, 1)}×`}</div>
          </div>
        ) : <span className="text-brand-faint">—</span>;
      },
    },
  ];

  /* ── DRILL: pre / during / post ─────────────────────────────── */
  const series = sel ? CAMPAIGN.daily.filter(d => d.id === sel.id) : [];
  const pIdx = series.map((d, i) => (d.p ? i : -1)).filter(i => i >= 0);
  const drillOption: EChartsOption = {
    tooltip: { trigger: 'axis' },
    legend: { top: 0, textStyle: { fontSize: 11 } },
    grid: { top: 48, left: 64, right: 48, bottom: 28 },
    xAxis: { type: 'category', data: series.map(d => dmy(d.date)), axisLabel: { fontSize: 10 } },
    yAxis: [
      { type: 'value', axisLabel: { formatter: (v: number) => formatVND(v, 0), fontSize: 10 } },
      { type: 'value', name: 'HĐ CTKM', axisLabel: { fontSize: 10 }, splitLine: { show: false } },
    ],
    series: [
      {
        name: 'Doanh thu cả cửa hàng',
        type: 'line',
        data: series.map(d => d.act),
        symbol: 'none',
        lineStyle: { width: 2, color: '#C5A059' },
        itemStyle: { color: '#C5A059' },
        markArea: pIdx.length
          ? {
              itemStyle: { color: isDark ? 'rgba(197,160,89,0.08)' : 'rgba(197,160,89,0.12)' },
              data: [[{ name: 'Kỳ chạy', xAxis: pIdx[0] }, { xAxis: pIdx[pIdx.length - 1] }]],
            }
          : undefined,
      },
      {
        name: 'Kỳ vọng (kỳ nền × mùa vụ)',
        type: 'line',
        data: series.map(d => d.exp),
        symbol: 'none',
        lineStyle: { width: 1.5, type: 'dashed', color: '#9E9B93' },
        itemStyle: { color: '#9E9B93' },
      },
      {
        name: 'Hoá đơn gắn CTKM',
        type: 'bar',
        yAxisIndex: 1,
        data: series.map(d => d.bills),
        itemStyle: { color: 'rgba(130,132,108,0.55)' },
        barMaxWidth: 6,
      },
    ],
  };

  const wf = sel?.measurable && sel.exp.net !== null
    ? [
        { name: 'Kỳ vọng', v: sel.exp.net ?? 0, total: true },
        { name: 'Δ TC', v: sel.dec.tc ?? 0 },
        { name: 'Δ nhóm', v: sel.dec.party ?? 0 },
        { name: 'Δ TA', v: sel.dec.ta ?? 0 },
        { name: 'Tương tác', v: sel.dec.mix ?? 0 },
        { name: 'Thực tế', v: sel.act.net ?? 0, total: true },
      ]
    : [];
  let run = 0;
  const wfBase: (number | string)[] = [];
  const wfUp: (number | string)[] = [];
  const wfDown: (number | string)[] = [];
  const wfTot: (number | string)[] = [];
  wf.forEach(s => {
    if (s.total) {
      wfBase.push('-'); wfUp.push('-'); wfDown.push('-'); wfTot.push(s.v); run = s.v;
    } else if (s.v >= 0) {
      wfBase.push(run); wfUp.push(s.v); wfDown.push('-'); wfTot.push('-'); run += s.v;
    } else {
      run += s.v; wfBase.push(run); wfUp.push('-'); wfDown.push(-s.v); wfTot.push('-');
    }
  });
  const minWf = Math.min(...wf.map(s => (s.total ? s.v : Infinity)), ...wfBase.filter((x): x is number => typeof x === 'number'));
  const wfOption: EChartsOption = {
    tooltip: {
      trigger: 'axis',
      formatter: (p: any) => {
        const i = p[0]?.dataIndex ?? 0;
        return `<b>${wf[i]?.name}</b><br/>${formatVND(wf[i]?.v)}`;
      },
    },
    grid: { top: 16, left: 64, right: 16, bottom: 28 },
    xAxis: { type: 'category', data: wf.map(s => s.name), axisLabel: { fontSize: 10, interval: 0 } },
    yAxis: { type: 'value', min: Math.floor((minWf * 0.9) / 1e6) * 1e6, axisLabel: { formatter: (v: number) => formatVND(v, 0), fontSize: 10 } },
    series: [
      { type: 'bar', stack: 'w', data: wfBase, itemStyle: { color: 'transparent' }, silent: true },
      { type: 'bar', stack: 'w', data: wfUp, itemStyle: { color: '#22C55E' }, barMaxWidth: 36 },
      { type: 'bar', stack: 'w', data: wfDown, itemStyle: { color: '#EF4444' }, barMaxWidth: 36 },
      { type: 'bar', stack: 'w', data: wfTot, itemStyle: { color: '#C5A059' }, barMaxWidth: 36 },
    ],
  };

  /* ── TIMELINE ───────────────────────────────────────────────── */
  const tl = inScope.filter(c => c.period_from).sort((a, b) => String(a.period_from).localeCompare(String(b.period_from)));
  const lastDay = CAMPAIGN.daily.reduce((m, d) => (d.date > m ? d.date : m), '2026-01-01');
  const tlStart = tl.map(c => dayIndex(c.period_from ?? c.date_from ?? '2026-01-01'));
  const tlLen = tl.map((c, i) => Math.max(1, dayIndex(c.period_to ?? c.date_to ?? lastDay) - tlStart[i] + 1));
  const tlOption: EChartsOption = {
    tooltip: {
      formatter: (p: any) => {
        const c = tl[p.dataIndex];
        return `<b>${c.name}</b><br/>${dmy(c.period_from)} → ${c.date_to ? dmy(c.period_to) : 'đang chạy'}<br/>${LABEL[c.label]?.label}`
          + (c.overlap.length ? `<br/>⚠ chồng kỳ: ${c.overlap.join(', ')}` : '');
      },
    },
    grid: { top: 8, left: 140, right: 16, bottom: 28 },
    xAxis: {
      type: 'value',
      min: Math.min(...tlStart, 0),
      axisLabel: {
        fontSize: 10,
        formatter: (v: number) => {
          const d = new Date(Date.parse('2026-01-01') + v * 86400000);
          return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
        },
      },
    },
    yAxis: { type: 'category', data: tl.map(c => c.name), axisLabel: { fontSize: 10, width: 130, overflow: 'truncate' }, inverse: true },
    series: [
      { type: 'bar', stack: 't', data: tlStart, itemStyle: { color: 'transparent' }, silent: true },
      {
        type: 'bar',
        stack: 't',
        barMaxWidth: 14,
        data: tl.map((c, i) => ({
          value: tlLen[i],
          itemStyle: { color: LABEL[c.label]?.color ?? '#9E9B93', borderColor: c.overlap.length ? '#EF4444' : undefined, borderWidth: c.overlap.length ? 1 : 0 },
        })),
      },
    ],
  };

  /* ── MA TRẬN: chi phí × ROI ─────────────────────────────────── */
  const bubbleOption: EChartsOption = {
    tooltip: {
      formatter: (p: any) => {
        const c = measured[p.dataIndex];
        return `<b>${c.name}</b><br/>${LEVER[c.lever ?? '']?.label ?? ''}<br/>Chi phí ${formatVND(c.cost.total)}<br/>ROI ${formatNumber(c.roi ?? 0, 1)}× · tăng thêm ${formatVND(c.incr)}`;
      },
    },
    grid: { top: 16, left: 56, right: 24, bottom: 36 },
    xAxis: { type: 'value', name: 'Chi phí', nameLocation: 'middle', nameGap: 24, axisLabel: { formatter: (v: number) => formatVND(v, 0), fontSize: 10 } },
    yAxis: { type: 'value', name: 'ROI (×)', axisLabel: { fontSize: 10 } },
    series: [
      {
        type: 'scatter',
        data: measured.map(c => ({
          value: [c.cost.total ?? 0, c.roi ?? 0],
          symbolSize: Math.max(10, Math.min(48, Math.sqrt(Math.abs(c.incr ?? 0)) / 600)),
          itemStyle: { color: NAT[c.nature ?? '']?.color ?? '#9E9B93', opacity: 0.8, borderColor: (c.incr ?? 0) < 0 ? '#EF4444' : undefined, borderWidth: (c.incr ?? 0) < 0 ? 2 : 0 },
        })),
        markLine: { silent: true, symbol: 'none', lineStyle: { type: 'dashed', color: '#9E9B93' }, data: [{ yAxis: 0 }] },
      },
    ],
  };

  /* ── LỊCH CỬA SỔ MARKETING: tháng × brand, khoảng trống > 14 ngày ── */
  const months = Array.from(new Set(CAMPAIGN.daily.map(d => d.date.slice(0, 7)).concat(selectedMonths))).sort();
  const brands = ['NCB', 'NDC', 'NJFB'].filter(b => brandMatches(b));
  const commercial = CAMPAIGN.campaigns.filter(c => c.nature === 'COMMERCIAL');
  const heat: [number, number, number][] = [];
  const gaps: string[] = [];
  brands.forEach((b, bi) => {
    months.forEach((m, mi) => {
      const n = commercial.filter(
        c => (c.brand === b || c.brand === 'ALL') && (c.period_from ?? '').slice(0, 7) <= m && (c.period_to ?? c.date_to ?? '9999').slice(0, 7) >= m,
      ).length;
      heat.push([mi, bi, n]);
    });
    const spans = commercial
      .filter(c => c.brand === b && c.period_from)
      .map(c => [dayIndex(c.period_from!), dayIndex(c.period_to ?? lastDay)] as [number, number])
      .sort((x, y) => x[0] - y[0]);
    let cur = spans.length ? spans[0][1] : null;
    spans.slice(1).forEach(([s, e]) => {
      if (cur !== null && s - cur > 14) gaps.push(`${b}: ${s - cur} ngày không có chương trình thương mại`);
      cur = Math.max(cur ?? e, e);
    });
  });
  const heatOption: EChartsOption = {
    tooltip: { formatter: (p: any) => `${brands[p.value[1]]} · ${formatMonthLabel(months[p.value[0]])}: ${p.value[2]} chương trình` },
    grid: { top: 8, left: 56, right: 16, bottom: 40 },
    xAxis: { type: 'category', data: months.map(formatMonthLabel), axisLabel: { fontSize: 10 } },
    yAxis: { type: 'category', data: brands, axisLabel: { fontSize: 11 } },
    visualMap: { min: 0, max: Math.max(2, ...heat.map(h => h[2])), show: false, inRange: { color: [isDark ? '#1F1F26' : '#EAE7DF', '#C5A059'] } },
    series: [{ type: 'heatmap', data: heat, label: { show: true, fontSize: 10 } }],
  };

  /* ── BẢNG PHỤ ───────────────────────────────────────────────── */
  const unmeasured = inScope.filter(c => c.label === 'CHUA_DO' || c.label === 'CHUA_CHIN' || c.label === 'CHUA_TARGET');
  const issueSummary = Object.entries(CAMPAIGN.issues.reduce((m, r) => {
    const k = `${r.level} · ${r.field}`;
    m[k] = (m[k] ?? 0) + 1;
    return m;
  }, {} as Record<string, number>)).sort((a, b) => b[1] - a[1]);
  const unmapped = CAMPAIGN.unmapped.filter(u => brandMatches(u.brand) && u.last.slice(0, 7) >= mFrom && u.first.slice(0, 7) <= mTo);

  return (
    <div className="space-y-5 p-4 sm:p-6 max-w-[1600px] mx-auto">
      <PromotionTabs />

      {/* Header */}
      <div>
        <span className="text-[10px] font-extrabold uppercase tracking-widest text-brand-gold">
          CHƯƠNG TRÌNH TẠO THÊM ĐƯỢC BAO NHIÊU · TỐN BAO NHIÊU · LÃI HAY LỖ
        </span>
        <h2 className="text-xl font-extrabold text-brand-text font-display mt-0.5">M7.2 · Promotion Tracking</h2>
      </div>

      {CAMPAIGN.meta.demo && (
        <div className="flex gap-3 rounded-xl border border-status-warning/40 bg-status-warningBg p-4 text-xs">
          <FlaskConical className="h-5 w-5 shrink-0 text-status-warning" />
          <div>
            <b className="text-status-warning">ĐANG HIỂN THỊ DỮ LIỆU MẪU.</b>{' '}
            Khai báo chương trình, target và chi phí lấy từ <code>_MAU_Campaign_Tracking.xlsx</code> — là chương trình thật trên POS,
            nhưng <b>target, chi phí quà tặng / KOL / in ấn là số mẫu</b>. Doanh thu, hoá đơn, giảm giá là số POS thật.
            Lưu thành <code>Campaign_Tracking_2026.xlsx</code> trong <code>L0_input/03_MARKETING/07_Campaign_Tracking/</code> để thay bằng số thật.
          </div>
        </div>
      )}

      {/* KPI — cùng thứ tự và định nghĩa với cột bảng chấm điểm: quy mô → TC × AOV → hiệu quả → lợi nhuận */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <MetricCard label="Doanh thu CTKM" subLabel={`${periodTxt} · Tổng tiền hóa đơn CTKM`} value={formatVND(kpiNet)}
          customDeltaText={
            B.net ? (
              <span className="flex flex-wrap items-center gap-1 font-semibold text-status-ok">
                <TrendingUp className="h-3 w-3" />
                {pct(kpiNet / B.net, 1)} so vs DT brand
                <span className="text-brand-faint text-[10px] font-normal ml-1">
                  · {kpiWith} CT có HĐ{kpiLto ? ` · ${kpiLto} LTO` : ''}
                </span>
              </span>
            ) : '—'
          } />
        <MetricCard label="Hoá đơn" subLabel="Hóa đơn CTKM" value={formatNumber(kpiBills)}
          customDeltaText={
            B.tc ? (
              <span className="flex flex-wrap items-center gap-1 font-semibold text-status-ok">
                <TrendingUp className="h-3 w-3" />
                {pct(kpiBills / B.tc, 1)} so vs HĐ brand
              </span>
            ) : '—'
          } />
        <MetricCard label="Guest" subLabel="Khách CTKM" value={formatNumber(kpiGuests)}
          customDeltaText={
            B.guest ? (
              <span className="flex flex-wrap items-center gap-1 font-semibold text-status-ok">
                <TrendingUp className="h-3 w-3" />
                {pct(kpiGuests / B.guest, 1)} so vs khách brand
              </span>
            ) : '—'
          } />
        <MetricCard label="AOV" subLabel="Doanh thu CTKM ÷ Hóa đơn CTKM" value={kpiAov === null ? '—' : formatVND(kpiAov)}
          customDeltaText={
            kpiAov !== null && bAov ? (
              <span className={`flex flex-wrap items-center gap-1 font-semibold ${kpiAov >= bAov ? 'text-status-ok' : 'text-status-bad'}`}>
                {kpiAov >= bAov ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {kpiAov >= bAov ? '+' : ''}{pct(kpiAov / bAov - 1, 0)} so vs AOV brand
              </span>
            ) : ''
          } />
        <MetricCard label="DT tăng thêm"
          subLabel={measured.length > 0 ? `${measured.length} CT đã chấm` : 'chưa có CT nào đủ điều kiện chấm'}
          value={measured.length > 0 ? `${incr > 0 ? '+' : ''}${formatVND(incr)}` : '—'}
          variant={incr < 0 ? 'warning' : 'default'}
          customDeltaText={
            measured.length === 0 ? (
              <span className="text-brand-faint text-[10px]">CT cần có target + kết thúc để chấm</span>
            ) : B.net ? (
              <span className={`flex flex-wrap items-center gap-1 font-semibold ${incr >= 0 ? 'text-status-ok' : 'text-status-bad'}`}>
                {incr >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {incr >= 0 ? '+' : ''}{pct(incr / (B.net - incr), 1)} so vs DT brand
                {nAlloc > 0 && <span className="text-brand-faint text-[10px] font-normal ml-1">· {nAlloc} CT phân bổ theo kỳ</span>}
              </span>
            ) : '—'
          } />
        <MetricCard label="Lãi thực thêm" subLabel="tăng thêm × biên LN − chi phí"
          value={measured.length > 0 ? formatVND(flow) : '—'}
          variant={flow < 0 ? 'critical' : measured.length > 0 ? 'hero' : 'default'}
          customDeltaText={
            measured.length === 0
              ? <span className="text-brand-faint text-[10px]">Chưa có CT đã chấm trong kỳ</span>
              : `ROI ${costMeasured ? formatNumber(flow / costMeasured, 1) : '—'}× · chi phí ${formatVND(costMeasured)}`
          } />
      </div>

      {/* Nhãn */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setLabelFilter(null)}
          className={`rounded-full border px-3 py-1 text-[11px] ${!labelFilter ? 'border-brand-gold text-brand-gold' : 'border-brand-border text-brand-muted'}`}>
          Tất cả · {inScope.length}
        </button>
        {counts.filter(l => l.n).map(l => (
          <button key={l.code} title={l.desc} onClick={() => setLabelFilter(labelFilter === l.code ? null : l.code)}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] ${labelFilter === l.code ? 'border-brand-gold text-brand-text' : 'border-brand-border text-brand-muted'}`}>
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: l.color }} />
            {l.label} · {l.n}
          </button>
        ))}
      </div>

      {/* Scorecard */}
      <Card title="Bảng Chấm Điểm Chương Trình" description={`Số trong ${periodTxt} × ${B.stores.size} cửa hàng của brand đang lọc · dòng dưới = % so với brand cùng kỳ (DT ${formatVND(B.net)} · ${formatNumber(B.tc)} HĐ · AOV ${vnd(bAov)}) · DT tăng thêm & lãi của chương trình chạy dài được phân bổ theo tỷ trọng doanh thu CTKM trong kỳ (ký hiệu pb) · trạng thái ĐẠT chấm trên cả kỳ chạy · bấm tên để xem chi tiết`} chip="SCORECARD" hero>
        <DataTable columns={columns} data={list} searchKeys={['name', 'id', 'brand'] as any} pageSize={10}
          exportFilename="m7_2_scorecard" emptyMessage="Không có chương trình trong kỳ lọc" />
      </Card>

      {/* Drill */}
      {sel && (
        <Card title={`Chi Tiết · ${sel.name}`}
          description={`${sel.id} · SỐ CẢ KỲ CHẠY ${sel.period_from ? `${dmy(sel.period_from)} → ${sel.date_to ? dmy(sel.period_to) : 'đang chạy'}` : ''} × mọi cửa hàng của chương trình (${sel.stores.join(', ')})${scope.by[sel.id] ? ` · trong ${periodTxt} × brand đang lọc: ${formatVND(scope.by[sel.id].net)} · ${formatNumber(scope.by[sel.id].bills)} HĐ` : ''}`}
          chip={LABEL[sel.label]?.label}>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="space-y-3 text-xs">
              <div className="rounded-lg border border-brand-border p-3">
                <div className="text-[10px] uppercase tracking-wider text-brand-muted">Nội dung chương trình</div>
                <div className="mt-1 whitespace-pre-line text-brand-text">
                  {sel.content ?? <i className="text-status-warning">chưa nhập — cột <b>content</b> ở Campaign_Tracking_2026.xlsx</i>}
                </div>
                <div className="mt-2.5 text-[10px] uppercase tracking-wider text-brand-muted">Giả thuyết (viết trước khi chạy)</div>
                <div className="mt-1 text-brand-text">
                  {sel.hypothesis ?? <i className="text-status-warning">chưa nhập — cột <b>hypothesis</b> ở Campaign_Tracking_2026.xlsx</i>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2">
                  <span className="text-brand-muted">Phân loại:</span>{' '}
                  {objOf(sel) ? (
                    <span className="inline-flex flex-wrap items-center gap-1.5 ml-1">
                      <span className="rounded px-1.5 py-0.5 text-[10px] font-bold text-white" style={{ backgroundColor: objOf(sel)?.color }}>
                        {objOf(sel)?.label}
                      </span>
                      {LEVER[sel.lever ?? ''] && <span className="text-brand-text">→ <b>{LEVER[sel.lever ?? '']?.label}</b></span>}
                      {sel.lever2 && LEVER[sel.lever2] && <span className="text-brand-muted">· phụ: {LEVER[sel.lever2]?.label.split(' — ')[0]}</span>}
                    </span>
                  ) : (
                    <i className="text-status-warning ml-1">chưa chọn mục tiêu (TC · AOV · BRANDING)</i>
                  )}
                </div>
                <div><span className="text-brand-muted">Cơ chế:</span> {MECH[sel.mechanic ?? '']?.label ?? '—'}</div>
                <div><span className="text-brand-muted">Cửa sổ:</span> {WIN[sel.window ?? '']?.label ?? '—'}</div>
                <div className="col-span-2"><span className="text-brand-muted">Ưu đãi:</span> {sel.discount_rule ?? '—'}</div>
                {sel.plan_group && <div className="col-span-2"><span className="text-brand-muted">Kế hoạch:</span> {sel.plan_group}{sel.plan_primary === 0 ? ' — chấm chung với tên POS khác của kế hoạch này (không cộng lại vào tổng)' : ''}</div>}
                <div className="col-span-2"><span className="text-brand-muted">Kỳ nền:</span> {sel.base_from ? `${dmy(sel.base_from)} → ${dmy(sel.base_to)}` : '—'}</div>
                <div className="col-span-2"><span className="text-brand-muted">Đối chứng:</span> {sel.control ?? '—'}{sel.control_factor !== null ? ` · hệ số mùa vụ ${formatNumber(sel.control_factor, 2)}` : ''}</div>
              </div>
              {(sel.reason || sel.lever_note || (sel.measurable && sel.overlap.length > 0) || sel.ramp_warning) && (
                <div className="space-y-1.5 rounded-lg border border-status-warning/40 bg-status-warningBg p-3">
                  {sel.reason && <div className="flex gap-2"><Info className="h-4 w-4 shrink-0 text-status-warning" />{sel.reason}</div>}
                  {sel.lever_note && <div className="flex gap-2"><AlertTriangle className="h-4 w-4 shrink-0 text-status-warning" />{sel.lever_note}</div>}
                  {sel.measurable && sel.overlap.length > 0 && <div className="flex gap-2"><AlertTriangle className="h-4 w-4 shrink-0 text-status-warning" />Chạy CHỒNG KỲ với {sel.overlap.join(', ')} trên cùng cửa hàng — lift không tách được cho từng chương trình.</div>}
                  {sel.ramp_warning && <div className="flex gap-2"><AlertTriangle className="h-4 w-4 shrink-0 text-status-warning" />Cửa hàng mới mở chưa lâu — doanh thu tự tăng theo đà mở mới, lift có thể bị thổi phồng.</div>}
                </div>
              )}
              {!isProg && (
                <div className="rounded-lg border border-brand-border p-3">
                  <div className="text-[10px] uppercase tracking-wider text-brand-muted">{sel.prog.basis === 'ITEM' ? 'Hoá đơn chứa món LTO — doanh thu của chương trình' : 'Hoá đơn gắn CTKM — doanh thu của chương trình'}</div>
                  <div className="overflow-x-auto">
                    <table className="mt-1 w-full text-[11px] font-mono whitespace-nowrap">
                      <tbody>
                        <tr><td className="font-sans">Số hoá đơn · khách</td><td className="text-right">{formatNumber(sel.prog.bills ?? 0)} · {formatNumber(sel.promo.guests ?? 0)}</td></tr>
                        <tr><td className="font-sans">Doanh thu CTKM (Tổng tiền, gồm VAT)</td><td className="text-right font-bold">{vnd(sel.promo.net)}</td></tr>
                        {sel.prog.basis === 'ITEM' && (
                          <>
                            <tr><td className="font-sans">└ riêng món LTO ({formatNumber(sel.prog.lto_qty ?? 0)} món)</td><td className="text-right">{vnd(sel.prog.lto_rev)}</td></tr>
                            <tr><td className="font-sans">└ món khác gọi kèm</td><td className="text-right">{vnd((sel.promo.net ?? 0) - (sel.prog.lto_rev ?? 0))}</td></tr>
                          </>
                        )}
                        <tr><td className="font-sans">Trước ưu đãi (gồm VAT)</td><td className="text-right">{vnd(sel.prog.sales)}</td></tr>
                        <tr><td className="font-sans">Giảm giá + chiết khấu</td><td className="text-right">{vnd(sel.prog.disc)}</td></tr>
                        <tr><td className="font-sans">Khách trả bằng phiếu GG</td><td className="text-right">{vnd(sel.prog.voucher)}</td></tr>
                        <tr><td className="font-sans">Tỷ trọng trong doanh thu cửa hàng</td><td className="text-right">{pct(sel.prog.share, 1)}</td></tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {isProg && (
                <div className="rounded-lg border border-brand-gold/40 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-brand-gold">
                    Chấm theo kế hoạch Pre-Analysis {sel.pre_id} — phạm vi chương trình
                  </div>
                  <div className="overflow-x-auto">
                    <table className="mt-1 w-full text-[11px] whitespace-nowrap">
                      <thead><tr className="text-brand-muted"><th className="text-left">Chỉ số</th><th className="text-right">Nền KH</th><th className="text-right">Target KH</th><th className="text-right">Thực tế</th><th className="text-right">% đạt</th></tr></thead>
                      <tbody className="font-mono">
                        {([
                          ['Doanh thu hoá đơn CTKM', sel.prog.base, sel.prog.plan, sel.prog.sales, sel.att.net, true],
                          ['Số hoá đơn (TC)', null, sel.prog.plan_tc, sel.prog.bills, sel.att.tc, false],
                          ['AOV', null, sel.prog.plan && sel.prog.plan_tc ? sel.prog.plan / sel.prog.plan_tc : null, sel.prog.bills ? (sel.prog.sales ?? 0) / sel.prog.bills : null, sel.att.aov, true],
                          ['Tăng thêm', null, sel.prog.plan !== null && sel.prog.base !== null ? sel.prog.plan - sel.prog.base : null, sel.incr, sel.att.incr, true],
                        ] as [string, number | null, number | null, number | null, number | null, boolean][]).map(([k, b, t, a, at, money]) => (
                          <tr key={k} className="border-t border-brand-border">
                            <td className="py-1 font-sans">{k}</td>
                            <td className="text-right text-brand-muted">{b == null ? '—' : formatVND(b)}</td>
                            <td className="text-right">{t == null ? '—' : money ? formatVND(t) : formatNumber(t)}</td>
                            <td className="text-right">{a == null ? '—' : money ? formatVND(a) : formatNumber(a)}</td>
                            <td className={`text-right ${at == null ? '' : at >= 1 ? 'text-status-ok' : 'text-status-bad'}`}>{pct(at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-1.5 text-[10px] text-brand-muted">
                    Doanh thu = hoá đơn gắn CTKM trước ưu đãi, gồm VAT = thanh toán trước giảm giá × hệ số thuế/phí (Tổng tiền {vnd(sel.promo.net)} · giảm giá {vnd(sel.prog.disc)}; phiếu GG {vnd(sel.prog.voucher)} là cách thanh toán, đã nằm trong Tổng tiền).
                    {sel.eval_note ? ` ${sel.eval_note}.` : ''}
                  </div>
                </div>
              )}
              <div className="text-[10px] uppercase tracking-wider text-brand-muted">
                {isProg ? 'Kiểm chứng ở cấp cửa hàng — doanh thu CẢ cửa hàng' : 'Lift cả cửa hàng — doanh thu CẢ cửa hàng trong kỳ'}
              </div>
              {isProg && sel.prog.share !== null && (
                <div className={`text-[11px] ${sel.prog.share < 0.05 ? 'text-status-warning' : 'text-brand-muted'}`}>
                  Hoá đơn CTKM = {pct(sel.prog.share, 1)} doanh thu các cửa hàng trong kỳ
                  {sel.prog.share < 0.05 ? ' — quá nhỏ để thấy ở cấp cửa hàng, lift cửa hàng bên dưới chủ yếu là dao động ngày, KHÔNG dùng để kết luận.' : '.'}
                  {sel.store.lift !== null && ` Lift cửa hàng ${pct(sel.store.lift, 1)} (${vnd(sel.store.incr)}).`}
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-[11px] whitespace-nowrap">
                  <thead><tr className="text-brand-muted"><th className="text-left">Chỉ số</th><th className="text-right">Target</th><th className="text-right">Kỳ vọng</th><th className="text-right">Thực tế</th><th className="text-right">% đạt</th></tr></thead>
                  <tbody className="font-mono">
                    {[
                      ['Doanh thu cả cửa hàng', sel.target?.net, sel.exp.net, sel.act.net, isProg ? null : sel.att.net, true],
                      ['TC (hoá đơn)', sel.target?.tc, sel.exp.tc, sel.act.tc, sel.att.tc, false],
                      ['AOV', sel.target?.aov, sel.exp.tc ? (sel.exp.net ?? 0) / sel.exp.tc : null, sel.act.tc ? (sel.act.net ?? 0) / sel.act.tc : null, sel.att.aov, true],
                      ['TA (/khách)', sel.target?.ta, sel.exp.guest ? (sel.exp.net ?? 0) / sel.exp.guest : null, sel.act.guest ? (sel.act.net ?? 0) / sel.act.guest : null, sel.att.ta, true],
                      ['Tăng thêm', sel.target?.incr, null, isProg ? sel.store.incr : sel.incr, isProg ? null : sel.att.incr, true],
                    ].filter(r => !isProg || r[0] !== 'Tăng thêm' || sel.store.incr !== null)
                      .map(r => (isProg ? [r[0], null, r[2], r[3], null, r[5]] : r))
                      .map(([k, t, e, a, at, money]) => (
                      <tr key={k as string} className="border-t border-brand-border">
                        <td className="py-1 font-sans">{k as string}</td>
                        <td className="text-right">{t == null ? '—' : money ? formatVND(t as number) : formatNumber(t as number)}</td>
                        <td className="text-right text-brand-muted">{e == null ? '—' : money ? formatVND(e as number) : formatNumber(e as number)}</td>
                        <td className="text-right">{a == null ? '—' : money ? formatVND(a as number) : formatNumber(a as number)}</td>
                        <td className={`text-right ${at == null ? '' : (at as number) >= 1 ? 'text-status-ok' : 'text-status-bad'}`}>{pct(at as number | null)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {sel.target?.verified === false && <div className="text-status-bad">Target nộp SAU ngày chạy — không dùng để chấm ĐẠT.</div>}
              <div>
                <div className="text-[10px] uppercase tracking-wider text-brand-muted mb-1">Chi phí</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px] font-mono whitespace-nowrap">
                    <tbody>
                      {isProg ? (
                        <tr><td className="font-sans">Chi phí khuyến mãi (theo loại {sel.pre_id})</td><td className="text-right">{vnd(sel.cost.promo_actual)}</td></tr>
                      ) : (
                        <>
                          <tr><td className="font-sans">Giảm giá (POS)</td><td className="text-right">{vnd(sel.cost.discount)}</td></tr>
                          <tr><td className="font-sans">Phiếu giảm giá (POS)</td><td className="text-right">{vnd(sel.cost.voucher)}</td></tr>
                        </>
                      )}
                      {sel.cost.lines.filter(l => !(isProg && l.type === 'GIFT_COGS' && sel.mechanic === 'GIFT_ITEM')).map(l => (
                        <tr key={l.type}><td className="font-sans">{COST[l.type]?.label ?? l.type}{l.actual === null ? ' (kế hoạch)' : ''}</td><td className="text-right">{vnd(l.actual ?? l.planned)}</td></tr>
                      ))}
                      {(sel.cost.ads_auto ?? 0) > 0 && <tr><td className="font-sans">Meta Ads (ghép tự động)</td><td className="text-right">{vnd(sel.cost.ads_auto)}</td></tr>}
                      <tr className="border-t border-brand-border font-bold"><td className="font-sans">Tổng</td><td className="text-right">{vnd(sel.cost.total)}</td></tr>
                    </tbody>
                  </table>
                </div>
                <div className="mt-1 text-[10px] text-brand-muted">
                  Biên LN {pct(sel.cm_pct)}{isProg ? ' (= (1 − COGS% kế hoạch) ÷ 1,08)' : ''} · Hoá đơn gắn CTKM {formatNumber(sel.promo.bills ?? 0)} · Doanh thu chạm {vnd(sel.promo.net)}
                </div>
                {sel.match_note && <div className="mt-1 text-[10px] text-brand-faint">Ghép dữ liệu: {sel.match_note}</div>}
              </div>
            </div>
            <div className="lg:col-span-2 space-y-4">
              {series.length ? (
                <div>
                  <div className="text-[11px] text-brand-muted mb-1">Doanh thu CẢ cửa hàng (không phải doanh thu CTKM) — trước · trong · sau kỳ chạy, thực tế vs kỳ vọng (vùng tô = kỳ chạy)</div>
                  <EChartWrapper option={drillOption} height={260} />
                </div>
              ) : (
                <div className="flex h-[260px] items-center justify-center rounded-lg border border-dashed border-brand-border text-xs text-brand-muted">
                  Chưa có chuỗi kỳ vọng — {sel.reason ?? 'chương trình chưa đo được'}
                </div>
              )}
              {sel.measurable && (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div className="md:col-span-2">
                    {wf.length ? (
                      <>
                        <div className="text-[11px] text-brand-muted mb-1">
                          {isProg ? 'Kiểm chứng cửa hàng — ' : ''}Tăng thêm đến từ đâu — SALES = TC × quy mô nhóm × chi tiêu/khách
                        </div>
                        <EChartWrapper option={wfOption} height={220} />
                      </>
                    ) : (
                      <div className="flex h-[220px] items-center justify-center rounded-lg border border-dashed border-brand-border p-4 text-center text-xs text-brand-muted">
                        Cửa hàng chưa đủ kỳ nền để bóc tách TC · quy mô nhóm · chi tiêu/khách — kết quả chấm dựa trên kế hoạch bên trái.
                      </div>
                    )}
                  </div>
                  <div className="space-y-2 text-xs">
                    <MetricCard label={isProg ? 'Tăng so nền kế hoạch' : 'Lift'} value={pct(sel.lift, 1)}
                      customDeltaText={isProg ? `hoà vốn khi doanh thu ≥ ${vnd(sel.prog.breakeven)}` : `cần ≥ ${pct(sel.breakeven, 1)} để hoà vốn`}
                      variant={isProg ? ((sel.prog.sales ?? 0) >= (sel.prog.breakeven ?? 0) ? 'default' : 'warning') : (sel.lift ?? 0) >= (sel.breakeven ?? 0) ? 'default' : 'warning'} />
                    <MetricCard label="Lãi thực thêm" value={vnd(sel.flow)} customDeltaText={`ROI ${sel.roi === null ? '—' : formatNumber(sel.roi, 1) + '×'}`}
                      variant={(sel.flow ?? 0) >= 0 ? 'hero' : 'critical'} />
                  </div>
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Timeline + bubble */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card title="Timeline Chương Trình" description="Màu = trạng thái · viền đỏ = chạy chồng kỳ trên cùng cửa hàng" chip="GANTT" className="lg:col-span-2">
          <EChartWrapper option={tlOption} height={Math.max(220, tl.length * 28 + 40)} onEvents={{ click: (p: any) => setSelId(tl[p.dataIndex]?.id ?? null) }} />
        </Card>
        <Card title="Chi Phí × ROI" description="Số cả kỳ chạy · chỉ chương trình đã chốt số · màu = bản chất · kích thước = doanh thu tăng thêm · viền đỏ = tăng thêm âm" chip="MA TRẬN">
          {measured.length ? <EChartWrapper option={bubbleOption} height={Math.max(220, tl.length * 28 + 40)} /> : <div className="text-xs text-brand-muted p-6">Chưa có chương trình đo được.</div>}
        </Card>
      </div>

      {/* Marketing windows */}
      <Card title="Lịch Cửa Sổ Marketing" description="Số chương trình THƯƠNG MẠI đang chạy mỗi tháng · nguyên tắc: không để quá 14 ngày không có chương trình" chip="MARKETING WINDOWS">
        <EChartWrapper option={heatOption} height={60 + brands.length * 44} />
        {gaps.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
            {gaps.map(g => <span key={g} className="rounded-full border border-status-warning/40 bg-status-warningBg px-2 py-0.5 text-status-warning">⚠ {g}</span>)}
          </div>
        )}
        <div className="mt-2 text-[10px] text-brand-muted">Chỉ tính chương trình ĐÃ KHAI BÁO — độ phủ khai báo hiện {pct(CAMPAIGN.coverage.mapped_pct)}, khoảng trống có thể là do chưa khai chứ không phải không chạy.</div>
      </Card>

      {/* Chưa đo được + CTKM chưa khai + lỗi */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card title="Chưa Chấm Được" description="Chưa đo được · chưa đủ chín · chưa có target — hệ thống tự khai phần nó CHƯA chấm được" chip={`${unmeasured.length}`}>
          <DataTable
            data={unmeasured}
            pageSize={6}
            searchable={false}
            columns={[
              { key: 'name', header: 'Chương trình', render: c => <button className="text-left font-bold" onClick={() => setSelId(c.id)}>{c.name}</button> },
              { key: 'label', header: 'Trạng thái', render: c => <StatusBadge label={LABEL[c.label]?.label ?? c.label} variant="neutral" /> },
              { key: 'reason', header: 'Vì sao · cần làm gì', render: c => <span className="text-[11px] text-brand-muted">{c.label === 'CHUA_TARGET'
                ? `đã đo được (lift cửa hàng ${pct(c.lift, 1)}) nhưng chưa có target nộp trước ngày chạy — nối pre_id nếu có trong Pre-Analysis, hoặc điền campaign_target`
                : c.reason ?? (c.cadence === 'BURST' ? 'đợt đang chạy — số tạm, tự chốt khi hết ngày kết thúc' : 'chương trình lặp chưa đủ 2 lần để so')}</span> },
            ]}
          />
        </Card>
        <Card title="Việc Cần Khai Báo" description="Từ Campaign_Tracking_2026.xlsx — điền ô CAM trong file rồi chạy lại CAP_NHAT.bat" chip={`${CAMPAIGN.issues.length}`}>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {issueSummary.map(([k, n]) => (
              <span key={k} className="rounded-full border border-brand-border px-2 py-0.5 text-[10px] text-brand-muted">
                {k} · <b className="text-brand-text">{n}</b>
              </span>
            ))}
          </div>
          <DataTable
            data={CAMPAIGN.issues}
            pageSize={6}
            searchable={false}
            emptyMessage="Không có lỗi khai báo"
            columns={[
              { key: 'id', header: 'Mã', render: r => <span className="font-mono text-[11px]">{r.id}</span> },
              { key: 'level', header: 'Mức', render: r => <StatusBadge label={r.level} variant={r.level === 'LỖI' ? 'bad' : r.level === 'THIẾU' ? 'warning' : 'neutral'} /> },
              { key: 'msg', header: 'Nội dung', render: r => <span className="text-[11px]"><b>{r.field}</b> · {r.msg}</span> },
            ]}
          />
        </Card>
      </div>

      <Card title="CTKM Trên POS Chưa Khai Thành Chương Trình" description="Thương mại · Loyalty · Đối tác — chưa gắn vào danh mục nên chưa được đo · xếp theo doanh thu chạm" chip={`${unmapped.length} TÊN`}>
        <DataTable
          emptyMessage="Mọi tên CTKM thương mại · loyalty · đối tác trên POS đã nằm trong danh mục chương trình"
          data={unmapped}
          pageSize={8}
          searchKeys={['name_pos'] as any}
          exportFilename="m7_2_ctkm_chua_khai"
          columns={[
            { key: 'name_pos', header: 'Tên CTKM trên POS', render: u => <span className="font-bold">{u.name_pos}</span> },
            { key: 'nature', header: 'Bản chất', render: u => <StatusBadge label={NAT[u.nature]?.short ?? u.nature} variant={(NAT[u.nature]?.badge as BadgeVariant) ?? 'neutral'} /> },
            { key: 'brand', header: 'Brand', render: u => <span style={{ color: BRAND_COLORS[u.brand] }}>{u.brand}</span> },
            { key: 'first', header: 'Có trên POS', render: u => <span className="font-mono text-[11px]">{dmy(u.first)} → {dmy(u.last)} · {u.days} ngày</span> },
            { key: 'bills', header: 'Hoá đơn', align: 'right', render: u => <span className="font-mono">{formatNumber(u.bills ?? 0)}</span> },
            { key: 'net', header: 'Doanh thu chạm', align: 'right', render: u => <span className="font-mono">{vnd(u.net)}</span> },
            { key: 'disc', header: 'Chi phí ưu đãi', align: 'right', render: u => <span className="font-mono">{vnd(u.disc)}</span> },
          ]}
        />
      </Card>
    </div>
  );
};
