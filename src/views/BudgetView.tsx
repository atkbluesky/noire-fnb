import React from 'react';
import { BudgetQ3View } from './BudgetQ3View';
import { BudgetQ4View } from './BudgetQ4View';

/** Vỏ M4: tiêu đề + ô chọn kỳ. Mỗi quý có file ngân sách và cách thể hiện riêng. */
const PERIODS = [
  { key: 'Q4', label: 'Q4/2026', hint: 'Oct · Nov · Dec — Digital tới cửa hàng, hạng mục khác tới brand' },
  { key: 'Q3', label: 'Q3/2026', hint: 'Jul · Aug · Sep — cấu trúc hai tầng Brand MKT + Extra' },
] as const;

export const BudgetView: React.FC = () => {
  const [period, setPeriod] = React.useState<'Q3' | 'Q4'>('Q4');
  const cur = PERIODS.find(p => p.key === period)!;
  return (
    <div className="space-y-5 p-4 sm:p-6 max-w-[1600px] mx-auto">
      <div>
        <h2 className="text-xl font-extrabold text-brand-text font-display mt-0.5">M4 · Ngân Sách Marketing</h2>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-brand-muted">Kỳ</span>
          {PERIODS.map(p => (
            <button key={p.key} onClick={() => setPeriod(p.key)}
              className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${period === p.key ? 'border-brand-gold text-brand-gold' : 'border-brand-border text-brand-muted'}`}>
              {p.label}
            </button>
          ))}
          <span className="text-[11px] text-brand-faint">{cur.hint}</span>
        </div>
      </div>
      {period === 'Q4' ? <BudgetQ4View /> : <BudgetQ3View />}
    </div>
  );
};
