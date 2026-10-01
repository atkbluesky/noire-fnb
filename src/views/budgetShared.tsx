/** Phần dùng chung của M4 (Q3 + Q4): ô Plan-vs-Thực tế và các hằng số bảng. */
import React from 'react';
import { formatVND } from '../utils/formatters';

export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
export const dmy = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
export const monthEnd = (m: string) => { const [y, mo] = m.split('-').map(Number); return new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10); };
export function yesterdayIct(): string {
  const now = new Date(Date.now() + 7 * 3600_000);
  now.setUTCDate(now.getUTCDate() - 1);
  return now.toISOString().slice(0, 10);
}

export const TH = 'p-2.5 text-right';
export const TD = 'p-2.5 text-right align-top';
export const HEAD = 'border-b border-brand-border bg-brand-surface text-[10px] font-bold uppercase tracking-wider text-brand-muted';
export const TOTAL_ROW = 'border-t-2 border-brand-gold bg-brand-dark/70 font-bold text-brand-text';

/** Ô Plan vs Thực tế: dòng trên thực chi, dòng dưới "/ plan · %". Đỏ khi vượt plan. */
export const PvA: React.FC<{ a: number | null; p: number | null; strong?: boolean }> = ({ a, p, strong }) => {
  const r = a != null && p ? a / p : null;
  return (
    <div className="leading-tight">
      <div className={a == null ? 'text-brand-faint' : strong ? 'font-bold text-brand-goldLight' : ''}>{a == null ? '—' : formatVND(a)}</div>
      <div className="text-[10px] text-brand-muted">
        / {p ? formatVND(p) : '—'}
        {r != null && <span className={r > 1 ? 'font-bold text-status-bad' : 'text-brand-text'}> · {Math.round(r * 100)}%</span>}
      </div>
    </div>
  );
};
