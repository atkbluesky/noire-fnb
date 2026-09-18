import React, { useMemo, useState } from 'react';
import type { EChartsOption } from 'echarts';
import { Printer, Search } from 'lucide-react';
import { CAMPAIGN } from '../data/campaign';
import { Card } from '../components/common/Card';
import { StatusBadge, BadgeVariant } from '../components/common/StatusBadge';
import { DataTable, Column } from '../components/common/DataTable';
import { EChartWrapper } from '../components/charts/EChartWrapper';
import { formatVND, formatNumber, formatPercent } from '../utils/formatters';
import type { PreEvalProgram, TaxItem } from '../types/campaign';

/* M7.1 · ĐÁNH GIÁ CHƯƠNG TRÌNH TRƯỚC KHI CHẠY — trình bày theo LUỒNG RA QUYẾT ĐỊNH
     0 Cách đọc (4 câu hỏi)  →  1 Lọc (quý · quyết định · tìm)  →  2 Tổng quan danh mục
     →  3 Ma trận quyết định (EBITDA Cơ sở × Thận trọng)  →  4 Bảng xếp hạng (không giới hạn số chương trình)
     →  5 Phiếu chi tiết: KẾT LUẬN trước · vì sao · rủi ro · chi tiết tính · giả định & nền · thực tế
   Mọi số tính ở tools/preeval.py từ sổ Pre_Analysis_2026.xlsx — màn hình chỉ trình bày. */

const byCode = (items: TaxItem[] = []) => Object.fromEntries(items.map(x => [x.code, x])) as Record<string, TaxItem>;
const vnd = (x: number | null | undefined) => (x === null || x === undefined ? '—' : formatVND(x));
const pct = (x: number | null | undefined, d = 0) => (x === null || x === undefined ? '—' : formatPercent(x, d));
const dmy = (s?: string | null) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : '—');
const tone = (x: number | null | undefined) => (x === null || x === undefined ? 'text-brand-muted' : x >= 0 ? 'text-status-ok' : 'text-status-bad');
const signed = (x: number | null | undefined) => (x === null || x === undefined ? '—' : `${x > 0 ? '+' : ''}${formatVND(x)}`);

interface Row {
  id: string; name: string; brand: string; stores: number; period: string; quarter: string; status: string | null;
  mode: string | null; objective: string | null; lever: string | null; bills: number; tc_share: number | null;
  net_incr: number; eb_cons: number; eb_base: number; eb_opt: number; safety: number | null; cannib: number | null;
  max_cannib: number | null; gates: string | null; decision: string; rank: number; spend: number;
}

export const PreEvalSection: React.FC<{ brandMatches: (b: string) => boolean; isDark?: boolean }> = ({ brandMatches, isDark }) => {
  const PE = CAMPAIGN.preeval;
  const DEC = byCode(PE?.decisions);
  const LEVER = byCode(CAMPAIGN.taxonomy.levers);
  const OBJ = byCode(CAMPAIGN.taxonomy.objectives);
  const ORDER: Record<string, number> = { DUYET: 0, CHAY_THU: 1, BRANDING: 2, SUA_CO_CHE: 3, THIEU_SO: 4 };

  const all = useMemo(() => (PE?.programs || []).filter(p => p.brand === 'ALL' || brandMatches(p.brand)), [PE, brandMatches]);
  const quarters = Array.from(new Set(all.map(p => p.quarter).filter(Boolean) as string[])).sort();
  const [q, setQ] = useState<string>('ALL');
  const [decF, setDecF] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selId, setSelId] = useState<string | null>(null);
  const [scn, setScn] = useState('CO_SO');

  const inQ = all.filter(p => q === 'ALL' || p.quarter === q);
  const list = inQ
    .filter(p => !decF || p.decision === decF)
    .filter(p => !search.trim() || `${p.name} ${p.id} ${p.brand}`.toLowerCase().includes(search.trim().toLowerCase()));
  const rows: Row[] = list.map(p => ({
    id: p.id, name: p.name, brand: p.brand, stores: p.stores.length, period: `${dmy(p.date_from)}→${dmy(p.date_to)} · ${p.days}n`,
    quarter: p.quarter ?? '', status: p.status, mode: p.scheme_mode, objective: p.objective, lever: p.lever,
    bills: p.scn.CO_SO?.bills ?? 0, tc_share: p.scn.CO_SO?.tc_share ?? null, net_incr: p.scn.CO_SO?.net_incr ?? 0,
    eb_cons: p.scn.THAN_TRONG?.ebitda ?? 0, eb_base: p.scn.CO_SO?.ebitda ?? 0, eb_opt: p.scn.LAC_QUAN?.ebitda ?? 0,
    safety: p.scn.CO_SO?.safety_bills ?? null, cannib: p.scn.CO_SO?.cannib ?? null, max_cannib: p.scn.CO_SO?.max_cannib ?? null,
    gates: p.scn.CO_SO?.gate_flags ?? null, decision: p.decision, rank: ORDER[p.decision] ?? 9, spend: p.scn.CO_SO?.promo_cost ?? 0,
  })).sort((a, b) => a.rank - b.rank || b.eb_base - a.eb_base);
  const sel: PreEvalProgram | undefined = list.find(p => p.id === selId) ?? list.find(p => p.id === rows[0]?.id);

  if (!PE || !all.length) {
    return (
      <Card title="Đánh Giá Chương Trình" description="Chưa có sổ đánh giá">
        <p className="text-sm text-brand-muted">
          Tạo sổ: <code>python tools/preeval_template.py</code> → điền ở{' '}
          <code>L0_input/03_MARKETING/05_Promotion_Ke_Hoach/01_So_Danh_Gia/Pre_Analysis_2026.xlsx</code> → CAP_NHAT.bat.
        </p>
      </Card>
    );
  }

  const count = (code: string) => inQ.filter(p => p.decision === code).length;
  const pos = rows.filter(r => r.decision === 'DUYET' || r.decision === 'CHAY_THU');

  /* ── MA TRẬN QUYẾT ĐỊNH ── */
  const xs = rows.map(r => r.eb_base), ys = rows.map(r => r.eb_cons);
  const pad = (a: number[]) => {
    const mn = Math.min(0, ...a), mx = Math.max(0, ...a), d = (mx - mn) * 0.15 || 1e6;
    return [mn - d, mx + d];
  };
  const [x0, x1] = pad(xs), [y0, y1] = pad(ys);
  const matrix: EChartsOption = {
    tooltip: {
      formatter: (p: any) => {
        const r = rows[p.dataIndex];
        return r ? `<b>${r.name}</b><br/>${DEC[r.decision]?.label}<br/>EBITDA Cơ sở ${signed(r.eb_base)}<br/>EBITDA Thận trọng ${signed(r.eb_cons)}<br/>Chi ưu đãi ${vnd(r.spend)}` : '';
      },
    },
    grid: { top: 16, left: 64, right: 16, bottom: 44 },
    xAxis: { type: 'value', min: x0, max: x1, name: 'EBITDA tăng thêm · Cơ sở →', nameLocation: 'middle', nameGap: 28,
      axisLabel: { formatter: (v: number) => formatVND(v, 0), fontSize: 10 }, splitLine: { show: false } },
    yAxis: { type: 'value', min: y0, max: y1, name: 'Thận trọng', axisLabel: { formatter: (v: number) => formatVND(v, 0), fontSize: 10 }, splitLine: { show: false } },
    series: [{
      type: 'scatter',
      data: rows.map(r => ({
        value: [r.eb_base, r.eb_cons],
        symbolSize: Math.max(10, Math.min(40, Math.sqrt(Math.max(r.spend, 1)) / 250)),
        itemStyle: { color: DEC[r.decision]?.color ?? '#9E9B93', borderColor: r.id === sel?.id ? '#C5A059' : undefined, borderWidth: r.id === sel?.id ? 3 : 0 },
        label: { show: rows.length <= 12, formatter: r.name.length > 18 ? r.name.slice(0, 17) + '…' : r.name, position: 'right', fontSize: 9, color: isDark ? '#9E9B93' : '#52525B' },
      })),
      markArea: {
        silent: true,
        data: [
          [{ xAxis: 0, yAxis: 0, itemStyle: { color: 'rgba(34,197,94,0.07)' }, name: 'DUYỆT' }, { xAxis: x1, yAxis: y1 }],
          [{ xAxis: 0, yAxis: y0, itemStyle: { color: 'rgba(245,158,11,0.08)' }, name: 'CHẠY THỬ' }, { xAxis: x1, yAxis: 0 }],
          [{ xAxis: x0, yAxis: y0, itemStyle: { color: 'rgba(239,68,68,0.07)' }, name: 'SỬA CƠ CHẾ' }, { xAxis: 0, yAxis: y1 }],
        ] as any,
        label: { fontSize: 10, color: '#9E9B93', position: 'insideTop' },
      },
      markLine: { silent: true, symbol: 'none', lineStyle: { type: 'dashed', color: '#9E9B93' }, data: [{ xAxis: 0 }, { yAxis: 0 }] },
    }],
  };

  const columns: Column<Row>[] = [
    {
      key: 'name', header: 'Chương trình',
      render: r => (
        <button className="block max-w-[220px] text-left" onClick={() => setSelId(r.id)} title={r.name}>
          <div className={`truncate font-bold ${sel?.id === r.id ? 'text-brand-gold' : 'text-brand-text'}`}>{r.name}</div>
          <div className="text-[10px] text-brand-muted">
            {r.brand} · {r.stores} CH · {r.period} · {r.quarter}
            {r.status === 'MAU' && <span className="ml-1 rounded bg-brand-border px-1 text-[9px]">MẪU</span>}
            {r.mode === 'NHANH' && <span className="ml-1 rounded bg-brand-border px-1 text-[9px]">1 DÒNG</span>}
          </div>
        </button>
      ),
    },
    {
      key: 'lever', header: 'Mục tiêu',
      render: r => (
        <div className="text-[10px] leading-tight">
          <b style={{ color: OBJ[r.objective ?? '']?.color }}>{r.objective ?? '—'}</b>
          <div className="text-brand-muted">{LEVER[r.lever ?? '']?.label.split(' — ')[0] ?? ''}</div>
        </div>
      ),
    },
    {
      key: 'bills', header: 'Hoá đơn', align: 'right',
      render: r => (
        <div className="text-right font-mono leading-tight">
          <div>{formatNumber(r.bills)}</div>
          <div className="text-[10px] text-brand-muted">{pct(r.tc_share, 1)} TC</div>
        </div>
      ),
    },
    { key: 'net_incr', header: 'DT tăng thêm', align: 'right', render: r => <span className={`font-mono ${tone(r.net_incr)}`}>{signed(r.net_incr)}</span> },
    { key: 'eb_base', header: '① EBITDA', align: 'right', render: r => <span className={`font-mono font-bold ${tone(r.eb_base)}`}>{signed(r.eb_base)}</span> },
    { key: 'eb_cons', header: '② Thận trọng', align: 'right', render: r => <span className={`font-mono ${tone(r.eb_cons)}`}>{signed(r.eb_cons)}</span> },
    {
      key: 'safety', header: '③ An toàn', align: 'right',
      render: r => (
        <div className="text-right font-mono leading-tight" title="Hoá đơn dự kiến ÷ hoá đơn cần để hoà vốn · %cannib giả định / tối đa còn hoà vốn">
          <div className={r.safety === null ? 'text-brand-muted' : r.safety >= 1.5 ? 'text-status-ok' : r.safety >= 1 ? 'text-status-warning' : 'text-status-bad'}>
            {r.safety === null ? (r.eb_base >= 0 ? 'không phí cố định' : '—') : `×${formatNumber(r.safety, 1)}`}
          </div>
          <div className="text-[10px] text-brand-muted">cannib {pct(r.cannib)} / {pct(r.max_cannib)}</div>
        </div>
      ),
    },
    {
      key: 'rank', header: '④ Quyết định',
      render: r => (
        <div className="leading-tight">
          <StatusBadge label={DEC[r.decision]?.label ?? r.decision} variant={(DEC[r.decision]?.badge as BadgeVariant) ?? 'neutral'} />
          {r.gates && <div className="mt-0.5 text-[10px] text-status-warning" title={r.gates}>⚠ {r.gates.split(' · ').length} cảnh báo</div>}
        </div>
      ),
    },
  ];

  const todo = rows.map(r => {
    const b = list.find(x => x.id === r.id)?.scn.CO_SO;
    let act = list.find(x => x.id === r.id)?.decision_note ?? '';
    if (r.decision === 'DUYET') act = 'Đủ điều kiện — in phiếu trình ký; khi chạy điền campaign_id để đối chiếu thực tế';
    else if (r.decision === 'SUA_CO_CHE')
      act = b?.breakeven_bills === null
        ? 'Không hoà vốn ở số hoá đơn nào — đổi ưu đãi / ngưỡng hoá đơn / chi phí'
        : `Cần ≥ ${formatNumber(b?.breakeven_bills ?? 0)} hoá đơn (dự kiến ${formatNumber(r.bills)}) hoặc %cannib ≤ ${pct(r.max_cannib)} (đang ${pct(r.cannib)}) — đổi ưu đãi / ngưỡng`;
    else if (r.decision === 'CHAY_THU')
      act = `Chạy thử 1–2 tuần · dừng nếu nhịp hoá đơn không đạt ${b?.breakeven_bills ? formatNumber(b.breakeven_bills) : '—'} cả kỳ hoặc %cannib > ${pct(r.max_cannib)}`;
    return { ...r, act };
  });

  return (
    <div className="space-y-4">
      {/* 0 · CÁCH ĐỌC */}
      <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
        {[
          ['1', 'Có lãi không?', 'EBITDA tăng thêm ở kịch bản Cơ sở > 0'],
          ['2', 'Chịu được rủi ro?', 'Kịch bản Thận trọng (ít khách hơn 30%, cannib +15pp) vẫn ≥ 0'],
          ['3', 'Dư địa an toàn?', 'Hoá đơn dự kiến ≥ 1,5 lần mức hoà vốn · %cannib giả định còn cách mức tối đa'],
          ['4', 'Vượt cổng?', `%COGS ≤ ${pct(PE.gates.max_cogs_pct)} · chi ưu đãi ≤ ${pct(PE.gates.max_promo_cost_pct_net)} doanh thu thuần`],
        ].map(([n, t, d]) => (
          <div key={n} className="rounded-xl border border-brand-border bg-brand-surface p-3">
            <div className="text-[10px] font-bold text-brand-gold">BƯỚC {n}</div>
            <div className="text-xs font-bold text-brand-text">{t}</div>
            <div className="mt-0.5 text-[10px] text-brand-muted">{d}</div>
          </div>
        ))}
        <div className="rounded-xl border border-brand-gold/50 bg-brand-surface p-3 text-[10px] leading-relaxed">
          <div className="font-bold text-brand-gold">→ QUYẾT ĐỊNH</div>
          <div><b className="text-status-ok">DUYỆT</b>: đạt 1 + 2</div>
          <div><b className="text-status-warning">CHẠY THỬ</b>: đạt 1, trượt 2</div>
          <div><b className="text-status-bad">SỬA CƠ CHẾ</b>: trượt 1</div>
          <div className="text-brand-muted">Bước 3–4 nói đổi gì</div>
        </div>
      </div>

      {/* 1 · LỌC */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-brand-border bg-brand-surface p-3">
        <span className="text-[10px] font-bold uppercase tracking-wider text-brand-muted">Kỳ</span>
        {['ALL', ...quarters].map(x => (
          <button key={x} onClick={() => setQ(x)}
            className={`rounded-full border px-2.5 py-0.5 text-[11px] ${q === x ? 'border-brand-gold text-brand-gold' : 'border-brand-border text-brand-muted'}`}>
            {x === 'ALL' ? `Tất cả · ${all.length}` : `${x.replace('-', ' ')} · ${all.filter(p => p.quarter === x).length}`}
          </button>
        ))}
        <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-brand-muted">Quyết định</span>
        {PE.decisions.filter(d => count(d.code)).map(d => (
          <button key={d.code} onClick={() => setDecF(decF === d.code ? null : d.code)}
            className={`flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] ${decF === d.code ? 'border-brand-gold text-brand-text' : 'border-brand-border text-brand-muted'}`}>
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: d.color }} />{d.label} · {count(d.code)}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1 rounded-lg border border-brand-border px-2 py-1">
          <Search className="h-3.5 w-3.5 text-brand-muted" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm chương trình…"
            className="w-40 bg-transparent text-xs text-brand-text outline-none" />
        </div>
      </div>

      {/* 2 · TỔNG QUAN */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {[
          ['Chương trình', formatNumber(rows.length), `${q === 'ALL' ? 'mọi kỳ' : q}${decF ? ' · đã lọc' : ''}`, ''],
          ['Duyệt chạy', formatNumber(rows.filter(r => r.decision === 'DUYET').length), 'lãi cả khi thận trọng', 'text-status-ok'],
          ['Chạy thử', formatNumber(rows.filter(r => r.decision === 'CHAY_THU').length), 'lãi cơ sở, lỗ thận trọng', 'text-status-warning'],
          ['Sửa cơ chế', formatNumber(rows.filter(r => r.decision === 'SUA_CO_CHE').length), 'lỗ ở kịch bản cơ sở', 'text-status-bad'],
          ['EBITDA tăng thêm', signed(pos.reduce((a, r) => a + r.eb_base, 0)), `cơ sở · ${pos.length} CT duyệt + chạy thử`, tone(pos.reduce((a, r) => a + r.eb_base, 0))],
          ['Chi ưu đãi', vnd(pos.reduce((a, r) => a + r.spend, 0)), 'giảm giá + quà + chi phí (CT duyệt + chạy thử)', ''],
        ].map(([l, v, sub, c]) => (
          <div key={l} className="rounded-xl border border-brand-border bg-brand-card p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-brand-muted">{l}</div>
            <div className={`mt-1 font-display text-xl font-extrabold ${c || 'text-brand-text'}`}>{v}</div>
            <div className="text-[10px] text-brand-faint">{sub}</div>
          </div>
        ))}
      </div>

      {/* 3 · MA TRẬN + VIỆC CẦN LÀM */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <Card title="Ma Trận Quyết Định" description="Mỗi chấm = 1 chương trình · phải = có lãi (bước 1) · trên = chịu được rủi ro (bước 2) · cỡ chấm = chi ưu đãi · bấm chấm để mở phiếu" chip="MATRIX" className="xl:col-span-3">
          {rows.length ? <EChartWrapper option={matrix} height={340} onEvents={{ click: (p: any) => setSelId(rows[p.dataIndex]?.id ?? null) }} />
            : <div className="p-6 text-xs text-brand-muted">Không có chương trình trong bộ lọc.</div>}
        </Card>
        <Card title="Việc Cần Làm" description="Mỗi chương trình một hành động — đọc từ điểm hoà vốn & %cannib tối đa" chip={`${todo.filter(t => t.decision !== 'DUYET').length} CẦN XỬ LÝ`} className="xl:col-span-2">
          <div className="max-h-[340px] space-y-2 overflow-y-auto pr-1">
            {todo.map(t => (
              <button key={t.id} onClick={() => setSelId(t.id)}
                className={`block w-full rounded-lg border p-2 text-left text-[11px] ${sel?.id === t.id ? 'border-brand-gold' : 'border-brand-border'}`}>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: DEC[t.decision]?.color }} />
                  <span className="truncate font-bold text-brand-text">{t.name}</span>
                  <span className={`ml-auto shrink-0 font-mono ${tone(t.eb_base)}`}>{signed(t.eb_base)}</span>
                </div>
                <div className="mt-0.5 pl-4 text-brand-muted">{t.act}</div>
                {t.gates && <div className="pl-4 text-[10px] text-status-warning">⚠ {t.gates}</div>}
              </button>
            ))}
          </div>
        </Card>
      </div>

      {/* 4 · BẢNG XẾP HẠNG — không giới hạn số chương trình */}
      <Card title="Bảng Xếp Hạng Chương Trình" description="Đọc cột ① → ④ từ trái sang phải · mặc định: quyết định rồi EBITDA cơ sở · bấm tiêu đề cột để sắp lại · bấm tên để mở phiếu · 10 dòng/trang" chip={`${rows.length} CT`}>
        <DataTable columns={columns} data={rows} searchable={false} pageSize={10} exportFilename="m7_1_xep_hang" emptyMessage="Không có chương trình trong bộ lọc" />
      </Card>

      {/* 5 · PHIẾU CHI TIẾT */}
      {sel && <EvalCard p={sel} scn={scn} setScn={setScn} DEC={DEC} LEVER={LEVER} OBJ={OBJ} />}
    </div>
  );
};

/* ───────────────────────────── PHIẾU ĐÁNH GIÁ 1 CHƯƠNG TRÌNH ───────────────────────────── */
const EvalCard: React.FC<{
  p: PreEvalProgram; scn: string; setScn: (s: string) => void;
  DEC: Record<string, TaxItem>; LEVER: Record<string, TaxItem>; OBJ: Record<string, TaxItem>;
}> = ({ p, scn, setScn, DEC, LEVER, OBJ }) => {
  const PE = CAMPAIGN.preeval;
  const S = p.scn[scn];
  const B = p.scn.CO_SO;
  const C = p.scn.THAN_TRONG;
  const dec = DEC[p.decision];
  const F = Object.fromEntries((p.fin[scn] || []).map(r => [r.row, r]));
  const actual = p.campaign_id ? CAMPAIGN.campaigns.find(c => c.id === p.campaign_id) : undefined;
  const scnLabel = PE.scenarios.find(s => s.code === scn)?.label ?? scn;
  if (!S || !B) return null;

  const H = ({ n, t, sub }: { n: string; t: string; sub?: string }) => (
    <div className="mb-2 flex items-baseline gap-2 border-b border-brand-border pb-1">
      <span className="font-mono text-[11px] font-bold text-brand-gold">{n}</span>
      <span className="text-[11px] font-bold uppercase tracking-wider text-brand-text">{t}</span>
      {sub && <span className="text-[10px] text-brand-muted">{sub}</span>}
    </div>
  );
  const Scn = () => (
    <div className="flex gap-1">
      {PE.scenarios.map(s => (
        <button key={s.code} onClick={() => setScn(s.code)}
          className={`rounded-full border px-2.5 py-0.5 text-[10px] ${scn === s.code ? 'border-brand-gold text-brand-gold' : 'border-brand-border text-brand-muted'}`}>{s.label}</button>
      ))}
    </div>
  );
  const finRow = (key: string, money = true, showCannib = false) => {
    const r = F[key];
    if (!r) return null;
    const f = (x: number | null) => (x === null ? '—' : money ? formatVND(x) : formatNumber(x));
    return (
      <tr key={key} className="border-t border-brand-border">
        <td className="py-1.5 pr-2 font-sans text-brand-text">{r.label}</td>
        <td className="text-right text-brand-muted">{f(r.base)}</td>
        <td className="text-right">{f(r.without)}</td>
        <td className="text-right text-brand-gold">{f(r.with)}</td>
        <td className="text-right font-bold">{f(r.total)}</td>
        <td className="text-right text-brand-muted">{showCannib ? pct(r.cannib, 1) : ''}</td>
        <td className={`text-right font-bold ${tone(r.incr)}`}>{r.incr === null ? '—' : `${r.incr > 0 ? '+' : ''}${f(r.incr)}`}</td>
        <td className={`text-right ${tone(r.incr_pct)}`}>{pct(r.incr_pct, 1)}</td>
      </tr>
    );
  };
  const ratioRow = (label: string, num: string, den: string) => {
    const a = F[num], b = F[den];
    if (!a || !b) return null;
    const r = (x: number | null, y: number | null) => (x !== null && y ? x / y : null);
    return (
      <tr className="border-t border-brand-border text-brand-muted">
        <td className="py-1 pr-2 font-sans italic">{label}</td>
        <td className="text-right">{pct(r(a.base, b.base), 1)}</td><td className="text-right">{pct(r(a.without, b.without), 1)}</td>
        <td className="text-right">{pct(r(a.with, b.with), 1)}</td><td className="text-right">{pct(r(a.total, b.total), 1)}</td>
        <td /><td /><td />
      </tr>
    );
  };
  const safetyTone = B.safety_bills === null ? 'text-brand-muted' : B.safety_bills >= 1.5 ? 'text-status-ok' : B.safety_bills >= 1 ? 'text-status-warning' : 'text-status-bad';

  return (
    <Card title={`Phiếu Đánh Giá · ${p.name}`} description={`${p.id} · ${p.brand} · ${p.stores.join(', ')} · ${p.date_from} → ${p.date_to} (${p.days} ngày) · ${p.quarter ?? ''}`}
      chip={dec?.label}
      headerAction={
        <button onClick={() => window.print()} className="flex items-center gap-1 rounded-lg border border-brand-border px-2 py-1 text-[11px] text-brand-muted hover:text-brand-text">
          <Printer className="h-3.5 w-3.5" /> In phiếu
        </button>
      }>
      <div className="space-y-6 text-xs">
        {/* A · KẾT LUẬN */}
        <section>
          <H n="A" t="Kết luận" sub="đọc 4 ô từ trái sang phải → quyết định" />
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
            {[
              ['1 · Có lãi không?', signed(B.ebitda), 'EBITDA tăng thêm · Cơ sở', tone(B.ebitda)],
              ['2 · Chịu rủi ro?', signed(C?.ebitda), 'EBITDA tăng thêm · Thận trọng', tone(C?.ebitda)],
              ['3a · Dư địa hoá đơn', B.safety_bills === null ? (B.breakeven_bills === 0 ? 'không phí cố định' : 'không hoà vốn') : `×${formatNumber(B.safety_bills, 1)}`,
                `dự kiến ${formatNumber(B.bills ?? 0)} · hoà vốn ${B.breakeven_bills === null ? '—' : formatNumber(B.breakeven_bills)} hoá đơn`, safetyTone],
              ['3b · Dư địa cannib', `${pct(B.cannib)} / ${pct(B.max_cannib)}`, 'giả định / tối đa còn hoà vốn',
                (B.max_cannib ?? 0) - (B.cannib ?? 0) >= 0.1 ? 'text-status-ok' : (B.max_cannib ?? 0) >= (B.cannib ?? 0) ? 'text-status-warning' : 'text-status-bad'],
            ].map(([l, v, sub, c]) => (
              <div key={l} className="rounded-xl border border-brand-border p-3">
                <div className="text-[10px] font-bold uppercase text-brand-muted">{l}</div>
                <div className={`mt-1 font-mono text-lg font-extrabold ${c}`}>{v}</div>
                <div className="text-[10px] text-brand-faint">{sub}</div>
              </div>
            ))}
            <div className="rounded-xl border-2 p-3" style={{ borderColor: dec?.color }}>
              <div className="text-[10px] font-bold uppercase text-brand-muted">→ Quyết định</div>
              <div className="mt-0.5 text-base font-extrabold leading-tight" style={{ color: dec?.color }}>{dec?.label ?? p.decision}</div>
              <div className="mt-1 text-[11px] text-brand-text">{p.decision_note}</div>
            </div>
          </div>
          {B.gate_flags && <div className="mt-2 rounded-lg bg-status-warningBg p-2 text-[11px] text-status-warning">⚠ Bước 4 · cổng: {B.gate_flags}</div>}
        </section>

        {/* B · VÌ SAO */}
        <section>
          <div className="flex items-start justify-between gap-2"><H n="B" t="Vì sao ra con số này" sub={`EBITDA tăng thêm · ${scnLabel}`} /><Scn /></div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <table className="w-full font-mono text-[11px]">
              <tbody>
                <tr><td className="py-1 font-sans">Hoá đơn tham gia</td><td className="text-right">{formatNumber(S.bills ?? 0)} <span className="text-brand-muted">({pct(S.tc_share, 1)} TC nền)</span></td></tr>
                <tr><td className="py-1 font-sans">└ khách vốn sẽ đến (cannib {pct(S.cannib)})</td><td className="text-right text-brand-muted">{formatNumber((S.bills ?? 0) - (S.bills_incr ?? 0))}</td></tr>
                <tr><td className="py-1 font-sans">└ khách mới thật sự</td><td className="text-right font-bold">{formatNumber(S.bills_incr ?? 0)}</td></tr>
                <tr className="border-t border-brand-border"><td className="py-1 font-sans">Doanh thu thuần tăng thêm</td><td className={`text-right ${tone(S.net_incr)}`}>{signed(S.net_incr)}</td></tr>
                <tr><td className="py-1 font-sans">Lợi nhuận gộp tăng thêm</td><td className={`text-right ${tone(S.gp_incr)}`}>{signed(S.gp_incr)}</td></tr>
                <tr><td className="py-1 font-sans">(−) Quà vật phẩm + chi phí chương trình</td><td className="text-right text-status-bad">−{vnd(S.program_cost)}</td></tr>
                <tr><td className="py-1 font-sans">(−) Chi phí vận hành biến đổi ({pct(p.opex_pct, 1)} DT tăng thêm)</td><td className="text-right text-status-bad">−{vnd(S.opex_incr)}</td></tr>
                <tr className="border-t border-brand-border font-bold"><td className="py-1.5 font-sans">= EBITDA tăng thêm</td><td className={`text-right text-sm ${tone(S.ebitda)}`}>{signed(S.ebitda)}</td></tr>
              </tbody>
            </table>
            <div className="space-y-2 text-[11px] text-brand-muted">
              <p>
                <b className="text-brand-text">Chỉ khách mới thật sự tạo ra lãi.</b> {formatNumber(S.bills_incr ?? 0)} trong {formatNumber(S.bills ?? 0)} hoá đơn tham gia là
                khách không có chương trình sẽ không đến; phần còn lại vốn đã đến, nay nhận ưu đãi nên chỉ tốn thêm chi phí.
              </p>
              <p>Tổng chi ưu đãi (giảm giá + quà + chi phí): <b className="text-brand-text">{vnd(S.promo_cost)}</b> · ROI = EBITDA ÷ tổng chi = <b className="text-brand-text">{S.roi === null ? '—' : `${formatNumber(S.roi, 2)}×`}</b></p>
              <p>
                Mục tiêu · phương án: <b style={{ color: OBJ[p.objective ?? '']?.color }}>{OBJ[p.objective ?? '']?.label ?? p.objective ?? '—'}</b>
                {p.lever && <> → {LEVER[p.lever]?.label ?? p.lever}</>}
              </p>
            </div>
          </div>
        </section>

        {/* C · RỦI RO */}
        <section>
          <H n="C" t="Rủi ro — 3 kịch bản & điểm hoà vốn" />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] font-mono text-[11px]">
              <thead>
                <tr className="text-[10px] text-brand-muted">
                  <th className="text-left font-sans">Chỉ số</th>
                  {PE.scenarios.map(s => (
                    <th key={s.code} className="text-right" title={`hoá đơn ×${s.bills_mult} · cannib ${s.cannib_add >= 0 ? '+' : ''}${Math.round(s.cannib_add * 100)}pp · COGS +${Math.round(s.cogs_add * 100)}pp`}>
                      {s.label}<div className="font-normal text-brand-faint">×{s.bills_mult} HĐ · cannib {s.cannib_add >= 0 ? '+' : ''}{Math.round(s.cannib_add * 100)}pp</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {([
                  ['Hoá đơn tham gia', (x: any) => formatNumber(x.bills ?? 0)],
                  ['%Cannib', (x: any) => pct(x.cannib)],
                  ['DT thuần tăng thêm', (x: any) => signed(x.net_incr)],
                  ['EBITDA tăng thêm', (x: any) => <span className={`font-bold ${tone(x.ebitda)}`}>{signed(x.ebitda)}</span>],
                  ['Hoá đơn cần để hoà vốn', (x: any) => (x.breakeven_bills === null ? 'không hoà vốn' : x.breakeven_bills === 0 ? '0 · không phí cố định' : formatNumber(x.breakeven_bills))],
                  ['%Cannib tối đa còn hoà vốn', (x: any) => pct(x.max_cannib)],
                  ['% TC cần tham gia để hết quà', (x: any) => pct(x.redemption_needed, 1)],
                  ['Số ngày hết quà', (x: any) => (x.stock_days ? `${formatNumber(x.stock_days, 0)} ngày` : '—')],
                ] as [string, (x: any) => React.ReactNode][]).map(([label, fn]) => (
                  <tr key={label} className="border-t border-brand-border">
                    <td className="py-1 font-sans">{label}</td>
                    {PE.scenarios.map(s => <td key={s.code} className="text-right">{p.scn[s.code] ? fn(p.scn[s.code]) : '—'}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* D · CHI TIẾT TÍNH */}
        <section>
          <div className="flex items-start justify-between gap-2"><H n="D" t="Chi tiết tính — khung PP672" sub={scnLabel} /><Scn /></div>
          <div className="mb-1 text-[10px] font-bold text-brand-muted">D1 · Program's details — kinh tế 1 hoá đơn tham gia</div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] font-mono text-[11px]">
              <thead>
                <tr className="text-[10px] text-brand-muted">
                  <th className="text-left font-sans">Scheme</th><th className="text-right">TC</th><th className="text-right">Giá trị HĐ</th>
                  <th className="text-right">Giảm / tặng</th><th className="text-right">TA (sau giảm)</th><th className="text-right">Giá vốn</th>
                  <th className="text-right">%COGS</th><th className="text-right">%Margin</th><th className="text-right">Quà / HĐ</th>
                </tr>
              </thead>
              <tbody>
                {p.schemes.map(s => (
                  <tr key={s.id} className="border-t border-brand-border align-top">
                    <td className="py-1.5 pr-2 font-sans">
                      <div className="font-bold text-brand-text">{s.id} · {s.name}</div>
                      <div className="text-[10px] text-brand-faint">{s.condition} → {s.benefit}{s.note ? ` · ${s.note}` : ''}</div>
                    </td>
                    <td className="text-right">{formatNumber(s.bills ?? 0)}</td><td className="text-right">{vnd(s.bill_value)}</td>
                    <td className="text-right">{vnd(s.discount)}</td><td className="text-right font-bold">{vnd(s.ta)}</td>
                    <td className="text-right">{vnd(s.cogs)}</td>
                    <td className={`text-right ${(s.cogs_pct ?? 0) > PE.gates.max_cogs_pct ? 'text-status-bad' : ''}`}>{pct(s.cogs_pct, 1)}</td>
                    <td className="text-right">{pct(s.margin_pct, 1)}</td><td className="text-right">{vnd(s.merch)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mb-1 mt-3 text-[10px] font-bold text-brand-muted">D2 · Financial evaluation — {p.days} ngày chạy</div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] font-mono text-[11px]">
              <thead>
                <tr className="text-[10px] text-brand-muted">
                  <th className="text-left font-sans">Chỉ tiêu</th>
                  <th className="text-right" title="Kỳ nền quy về số ngày chạy">Base (nền)</th>
                  <th className="text-right" title="Base trừ khách vốn sẽ đến nay chuyển sang dùng ưu đãi">Không KM</th>
                  <th className="text-right">Có KM</th><th className="text-right">Tổng khi chạy</th>
                  <th className="text-right" title="(Base − Không KM) ÷ Không KM">%Cannib</th>
                  <th className="text-right">Tăng thêm</th><th className="text-right">%Tăng thêm</th>
                </tr>
              </thead>
              <tbody>
                {finRow('tc', false, true)}{finRow('gross')}{finRow('disc')}{finRow('net', true, true)}
                {finRow('cogs')}{ratioRow('%COGS', 'cogs', 'net')}{finRow('gp')}{ratioRow('%Margin', 'gp', 'net')}
              </tbody>
            </table>
          </div>
        </section>

        {/* E · GIẢ ĐỊNH & NỀN */}
        <section>
          <H n="E" t="Giả định & dữ liệu nền" sub="đổi giả định ở sổ Pre_Analysis_2026.xlsx → CAP_NHAT.bat" />
          <div className="grid grid-cols-1 gap-x-6 gap-y-1 md:grid-cols-2 xl:grid-cols-3">
            <div><span className="text-brand-muted">Nhập liệu:</span> {p.scheme_mode === 'NHANH' ? '1 dòng — cơ chế nhanh' : `chi tiết — ${p.schemes.length} scheme`}</div>
            <div><span className="text-brand-muted">Khách tham gia:</span> {p.participation_src}</div>
            <div><span className="text-brand-muted">%Cannib:</span> {pct(B.cannib)} — {p.cannib_src}</div>
            <div><span className="text-brand-muted">COGS món khác:</span> {pct(p.other_cogs_pct)} (mặc định brand, Kế toán khoá)</div>
            <div><span className="text-brand-muted">Chi phí vận hành biến đổi:</span> {pct(p.opex_pct, 1)} DT thuần tăng thêm</div>
            <div><span className="text-brand-muted">Hệ số mùa vụ:</span> ×{formatNumber(p.season_factor ?? 1, 2)} · <span className="text-brand-muted">Kỳ nền:</span> {p.base_note}</div>
          </div>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[720px] font-mono text-[11px]">
              <thead>
                <tr className="text-[10px] text-brand-muted">
                  <th className="text-left font-sans">Cửa hàng</th><th className="text-left font-sans">Kỳ nền</th><th className="text-right">Ngày</th>
                  <th className="text-right">TC / ngày</th><th className="text-right">AOV</th><th className="text-right">TA</th>
                  <th className="text-right">Doanh thu / ngày</th><th className="text-right">% giảm giá</th><th className="text-right">Hệ số thuế/phí</th>
                </tr>
              </thead>
              <tbody>
                {p.base.map(b => (
                  <tr key={b.store} className="border-t border-brand-border">
                    <td className="py-1 font-sans font-bold">{b.store}</td>
                    <td className="font-sans text-[10px] text-brand-muted">{b.from ? `${b.from} → ${b.to}` : b.note}</td>
                    <td className="text-right">{b.days ?? '—'}</td><td className="text-right">{b.tc_day === null ? '—' : formatNumber(b.tc_day, 1)}</td>
                    <td className="text-right">{vnd(b.aov)}</td><td className="text-right">{vnd(b.ta)}</td>
                    <td className="text-right">{b.net !== null && b.days ? formatVND(b.net / b.days) : '—'}</td>
                    <td className="text-right">{pct(b.disc_share, 1)}</td><td className="text-right">{b.tax_factor === null ? '—' : formatNumber(b.tax_factor, 3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* F · THỰC TẾ */}
        {actual && (
          <section>
            <H n="F" t="Đã chạy — thực tế (M7.2) cạnh dự báo" />
            <table className="w-full max-w-xl font-mono text-[11px]">
              <thead><tr className="text-[10px] text-brand-muted"><th className="text-left font-sans">Chỉ số</th><th className="text-right">Dự báo (cơ sở)</th><th className="text-right">Thực tế</th></tr></thead>
              <tbody>
                <tr className="border-t border-brand-border"><td className="py-1 font-sans">Hoá đơn tham gia</td><td className="text-right">{formatNumber(B.bills ?? 0)}</td><td className="text-right font-bold">{formatNumber(actual.prog.bills ?? 0)}</td></tr>
                <tr className="border-t border-brand-border"><td className="py-1 font-sans">Doanh thu CTKM (gồm VAT)</td><td className="text-right">{vnd(B.rev_incl)}</td><td className="text-right font-bold">{vnd(actual.promo.net)}</td></tr>
                <tr className="border-t border-brand-border"><td className="py-1 font-sans">AOV hoá đơn tham gia</td>
                  <td className="text-right">{B.bills ? formatVND((B.rev_incl ?? 0) / B.bills) : '—'}</td>
                  <td className="text-right font-bold">{actual.prog.bills ? formatVND((actual.promo.net ?? 0) / actual.prog.bills) : '—'}</td></tr>
                <tr className="border-t border-brand-border"><td className="py-1 font-sans">DT tăng thêm</td><td className="text-right">{signed(B.net_incr)}</td><td className={`text-right font-bold ${tone(actual.incr)}`}>{signed(actual.incr)}</td></tr>
              </tbody>
            </table>
            <div className="mt-1 text-[10px] text-brand-faint">{actual.name} · {actual.label}{actual.reason ? ` · ${actual.reason}` : ''}</div>
          </section>
        )}
      </div>
    </Card>
  );
};
