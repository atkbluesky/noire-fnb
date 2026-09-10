import React from 'react';
import { Search, Printer, Calendar, Sun, Moon } from 'lucide-react';
import { useFilters } from '../../context/FilterContext';
import { NAVIGATION_GROUPS } from './Sidebar';
import { HUB_DATA } from '../../data';

export const TopHeader: React.FC = () => {
  const { activeView, setIsCommandPaletteOpen, theme, toggleTheme } = useFilters();

  // Find active item info
  let currentGroup = '';
  let currentItem: any = null;

  for (const group of NAVIGATION_GROUPS) {
    const found = group.items.find(it => it.id === activeView);
    if (found) {
      currentGroup = group.groupTitle;
      currentItem = found;
      break;
    }
  }

  const handlePrint = () => {
    window.print();
  };

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-brand-border bg-brand-surface/90 px-6 backdrop-blur-md">
      {/* Breadcrumbs */}
      <div className="flex items-center gap-2 text-xs">
        <span className="text-brand-muted font-medium">
          {currentGroup.split('·')[0].trim()}
        </span>
        <span className="text-brand-faint">/</span>
        <span className="font-bold text-brand-text flex items-center gap-1.5">
          <span className="font-mono text-brand-gold">{currentItem?.code}</span>
          <span>{currentItem?.title}</span>
        </span>
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-2">
        {/* Quick Search */}
        <button
          onClick={() => setIsCommandPaletteOpen(true)}
          className="flex items-center gap-2 rounded-lg border border-brand-border bg-brand-dark/40 px-3 py-1.5 text-xs text-brand-muted hover:border-brand-gold hover:text-brand-text transition-colors"
          title="Tìm kiếm nhanh (⌘K)"
        >
          <Search className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Tìm kiếm</span>
          <kbd className="hidden sm:inline-block rounded bg-brand-surface px-1.5 py-0.5 text-[9px] font-mono text-brand-faint border border-brand-border">
            ⌘K
          </kbd>
        </button>

        {/* Print / Report */}
        <button
          onClick={handlePrint}
          className="flex items-center gap-1.5 rounded-lg border border-brand-border bg-brand-dark/40 px-3 py-1.5 text-xs font-semibold text-brand-muted hover:border-brand-gold hover:text-brand-gold transition-colors"
          title="In báo cáo / Lưu PDF"
        >
          <Printer className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">In Báo Cáo</span>
        </button>

        {/* Update date timestamp */}
        <div className="hidden md:flex items-center gap-1 text-[11px] font-mono text-brand-muted border-l border-brand-border pl-2.5 pr-1">
          <Calendar className="h-3.5 w-3.5 text-brand-faint" />
          <span>Cập nhật: {HUB_DATA.meta.built || '25/08/2026'}</span>
        </div>

        {/* Theme Toggle Button - Placed at the furthest right corner (Góc phải trong cùng) */}
        <button
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Chuyển sang Giao diện Sáng (Light Mode)' : 'Chuyển sang Giao diện Tối (Dark Mode)'}
          title={theme === 'dark' ? 'Chuyển sang Giao diện Sáng (Light Mode)' : 'Chuyển sang Giao diện Tối (Dark Mode)'}
          className="group relative flex h-8 w-8 items-center justify-center rounded-lg border border-brand-border bg-brand-dark/50 text-brand-muted hover:border-brand-gold hover:bg-brand-surface hover:text-brand-gold hover:shadow-glow-sm transition-all duration-200"
        >
          <span className="sr-only">
            {theme === 'dark' ? 'Giao diện Sáng' : 'Giao diện Tối'}
          </span>
          {theme === 'dark' ? (
            <Sun className="h-4 w-4 text-brand-goldLight transition-transform duration-300 group-hover:rotate-45" />
          ) : (
            <Moon className="h-4 w-4 text-brand-gold transition-transform duration-300 group-hover:-rotate-12" />
          )}
        </button>
      </div>
    </header>
  );
};
