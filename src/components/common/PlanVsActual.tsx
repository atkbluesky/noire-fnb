import React from 'react';
import type { Campaign } from '../../types/campaign';
import { CAMPAIGN } from '../../data/campaign';
import { formatVND, formatNumber, formatPercent } from '../../utils/formatters';

const pct = (x: number | null | undefined, d = 0) => (x === null || x === undefined ? '—' : formatPercent(x, d));
const dmy = (s: string | null) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(2, 4)}` : '—');

/* ─────────── KẾ HOẠCH M7.1 (ĐÃ KHOÁ) ↔ THỰC TẾ — cùng công thức EBITDA của M7.1 ─────────── */
export const PlanVsActual: React.FC<{ c: Campaign }> = ({ c }) => {
  const m = c.m71!;
  const sg = (x: number | null) => (x === null ? '—' : `${x > 0 ? '+' : ''}${formatVND(x)}`);
  const rows: [string, string, string, number | null, number | null][] = [
    ['Hoá đơn tham gia', formatNumber(m.plan.bills ?? 0), formatNumber(m.act.bills ?? 0), m.plan.bills, m.act.bills],
    ['% TC tham gia', pct(m.plan.part, 1), pct(m.act.part, 1), null, null],
    ['% khách vốn sẽ đến (cannib)', pct(m.plan.cannib), pct(m.act.cannib), null, null],
    ['DT thuần tăng thêm', sg(m.plan.net_incr), sg(m.act.net_incr), m.plan.net_incr, m.act.net_incr],
    ['EBITDA tăng thêm', sg(m.plan.ebitda), sg(m.act.ebitda), m.plan.ebitda, m.act.ebitda],
    ['ROI', m.plan.roi === null ? '—' : `${formatNumber(m.plan.roi, 2)}×`, m.act.roi === null ? '—' : `${formatNumber(m.act.roi, 2)}×`, null, null],
  ];
  return (
    <div className="mb-4 rounded-xl border border-brand-gold/40 p-3 text-xs">
      <div className="mb-2 flex flex-wrap items-baseline gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-brand-gold">Kế hoạch M7.1 ↔ Thực tế</span>
        <span className="text-[10px] text-brand-muted">
          {m.program_id} · khoá {m.locked_at ? dmy(m.locked_at) : '—'}{m.lock_reason === 'KHOA_MUON' ? ' (khoá sau ngày chạy — chỉ tham khảo)' : ''} · kế hoạch: {CAMPAIGN.preeval?.decisions.find(d => d.code === m.decision)?.label ?? m.decision ?? '—'}
          {' · '}thực tế = DT tăng thêm đo ở M7.2 × (1 − COGS% − opex%) − quà − chi phí (cùng công thức M7.1)
        </span>
      </div>
      <table className="w-full max-w-2xl font-mono text-[11px]">
        <thead><tr className="text-[10px] text-brand-muted"><th className="text-left font-sans">Chỉ số</th><th className="text-right">Kế hoạch (khoá)</th><th className="text-right">Thực tế</th><th className="text-right">Đạt</th></tr></thead>
        <tbody>
          {rows.map(([k, a, b, pa, pb]) => (
            <tr key={k} className="border-t border-brand-border">
              <td className="py-1 font-sans">{k}</td><td className="text-right text-brand-muted">{a}</td>
              <td className="text-right font-bold">{b}</td>
              <td className="text-right">{pa && pb !== null && pa > 0 ? pct(pb / pa) : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
