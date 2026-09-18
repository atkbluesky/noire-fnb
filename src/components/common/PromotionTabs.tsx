import React from 'react';
import { useFilters } from '../../context/FilterContext';

/** Thanh chuyển giữa 3 màn của cụm M7 PROMOTION — cùng một danh mục chương trình:
 *  M7 tổng quan chi phí ưu đãi · M7.1 kế hoạch (Pre-Analysis) · M7.2 thực tế (Tracking). */
const TABS = [
  { id: 'm7', code: 'M7', title: 'Tổng quan', hint: 'Chi phí ưu đãi theo bản chất' },
  { id: 'm71', code: 'M7.1', title: 'Pre-Analytics · Plan', hint: 'Kế hoạch trước khi chạy' },
  { id: 'm72', code: 'M7.2', title: 'Promotion Tracking', hint: 'Thực tế so với kế hoạch' },
];

export const PromotionTabs: React.FC = () => {
  const { activeView, setActiveView } = useFilters();
  return (
    <div className="flex flex-wrap items-stretch gap-1 rounded-xl border border-brand-border bg-brand-surface p-1">
      {TABS.map((t, i) => {
        const on = activeView === t.id;
        return (
          <React.Fragment key={t.id}>
            {i > 0 && <span className="hidden self-center text-brand-faint sm:inline">→</span>}
            <button
              onClick={() => setActiveView(t.id)}
              className={`flex-1 min-w-[140px] rounded-lg px-3 py-1.5 text-left transition-colors ${on
                ? 'bg-brand-card text-brand-goldLight shadow-sm'
                : 'text-brand-muted hover:bg-brand-card/60 hover:text-brand-text'}`}
            >
              <div className="text-xs font-bold">
                <span className="font-mono text-[10px] opacity-70 mr-1.5">{t.code}</span>
                {t.title}
              </div>
              <div className="text-[10px] text-brand-faint">{t.hint}</div>
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
};
