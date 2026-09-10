import React from 'react';
import { Calendar, Filter, AlertTriangle } from 'lucide-react';
import { useFilters } from '../../context/FilterContext';
import { HUB_DATA, BRANDS, BRAND_NAMES, CORE_STORES, ALL_STORES, BrandType } from '../../data';
import { formatMonthLabel } from '../../utils/formatters';

interface FilterBarProps {
  showScope?: boolean;
  showBrand?: boolean;
  showDateRange?: boolean;
  showPerDay?: boolean;
  customNote?: string;
  allowedMonths?: string[];
}

export const FilterBar: React.FC<FilterBarProps> = ({
  showScope = true,
  showBrand = true,
  showDateRange = true,
  showPerDay = true,
  customNote,
  allowedMonths,
}) => {
  const {
    filters,
    setScope,
    setBrand,
    setFrom,
    setTo,
    togglePerday,
    isPartialMonth,
  } = useFilters();

  const months = allowedMonths || HUB_DATA.meta.months;
  const isEndPartial = isPartialMonth(filters.to);

  return (
    <div className="sticky top-14 z-10 border-b border-brand-border bg-brand-surface/95 px-6 py-2.5 backdrop-blur-md">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Left Filter Group */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* Scope Selector */}
          {showScope && (
            <div className="flex items-center gap-1.5 rounded-lg border border-brand-border bg-brand-dark/50 px-2.5 py-1.5 text-brand-text">
              <span className="text-brand-muted font-medium">Phạm vi:</span>
              <select
                value={filters.scope}
                onChange={e => setScope(e.target.value as 'main' | 'all')}
                className="bg-transparent font-semibold text-brand-text outline-none cursor-pointer"
              >
                <option value="main" className="bg-brand-surface text-brand-text">
                  Cửa hàng chính ({CORE_STORES.length})
                </option>
                <option value="all" className="bg-brand-surface text-brand-text">
                  Tất cả ({ALL_STORES.length})
                </option>
              </select>
            </div>
          )}

          {/* Brand Selector */}
          {showBrand && (
            <div className="flex items-center gap-1.5 rounded-lg border border-brand-border bg-brand-dark/50 px-2.5 py-1.5 text-brand-text">
              <span className="text-brand-muted font-medium">Brand:</span>
              <select
                value={filters.brand}
                onChange={e => setBrand(e.target.value as BrandType)}
                className="bg-transparent font-semibold text-brand-gold outline-none cursor-pointer"
              >
                <option value="ALL" className="bg-brand-surface text-brand-text">
                  Tất cả 3 brand
                </option>
                {BRANDS.map(b => (
                  <option key={b} value={b} className="bg-brand-surface text-brand-text">
                    {b} — {BRAND_NAMES[b]}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Date Range */}
          {showDateRange && (
            <div className="flex items-center gap-1.5 rounded-lg border border-brand-border bg-brand-dark/50 px-2.5 py-1.5 text-brand-text">
              <Calendar className="h-3.5 w-3.5 text-brand-muted" />
              <span className="text-brand-muted font-medium">Từ:</span>
              <select
                value={filters.from}
                onChange={e => setFrom(e.target.value)}
                className="bg-transparent font-semibold text-brand-text outline-none cursor-pointer"
              >
                {months.map(m => (
                  <option key={m} value={m} className="bg-brand-surface text-brand-text">
                    {formatMonthLabel(m)}
                  </option>
                ))}
              </select>

              <span className="text-brand-faint mx-0.5">→</span>

              <span className="text-brand-muted font-medium">Đến:</span>
              <select
                value={filters.to}
                onChange={e => setTo(e.target.value)}
                className="bg-transparent font-semibold text-brand-text outline-none cursor-pointer"
              >
                {months.map(m => (
                  <option key={m} value={m} className="bg-brand-surface text-brand-text">
                    {formatMonthLabel(m)}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Per-day Normalization Toggle */}
          {showPerDay && (
            <button
              onClick={togglePerday}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-semibold transition-all duration-150 border ${
                filters.perday
                  ? 'border-brand-gold bg-brand-gold/15 text-brand-gold shadow-glow-sm'
                  : 'border-brand-border bg-brand-dark/50 text-brand-muted hover:text-brand-text'
              }`}
            >
              <div
                className={`h-2 w-2 rounded-full ${
                  filters.perday ? 'bg-brand-gold' : 'bg-brand-faint'
                }`}
              />
              <span>Chuẩn hoá / ngày</span>
            </button>
          )}
        </div>

        {/* Right Note / Warning */}
        <div className="flex items-center gap-2 text-xs">
          {isEndPartial ? (
            <div className="flex items-center gap-1.5 rounded-md bg-status-badBg px-2 py-1 text-status-bad font-medium text-[11px]">
              <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
              <span>
                Tháng {formatMonthLabel(filters.to)} chưa trọn kỳ (mới có{' '}
                {HUB_DATA.coverage[filters.to]?.days_data}/31 ngày). Nên bật chế độ{' '}
                <b>/ngày</b>.
              </span>
            </div>
          ) : customNote ? (
            <div className="text-[11px] text-brand-muted italic">
              {customNote}
            </div>
          ) : (
            <div className="text-[11px] text-brand-muted">
              Đang xem từ {formatMonthLabel(filters.from)} đến {formatMonthLabel(filters.to)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
