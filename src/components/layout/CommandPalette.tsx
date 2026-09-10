import React, { useState, useEffect } from 'react';
import { Search, X, ArrowRight, Layout, Store } from 'lucide-react';
import { useFilters } from '../../context/FilterContext';
import { NAVIGATION_GROUPS } from './Sidebar';
import { HUB_DATA } from '../../data';

export const CommandPalette: React.FC = () => {
  const { isCommandPaletteOpen, setIsCommandPaletteOpen, setActiveView } = useFilters();
  const [query, setQuery] = useState('');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen(!isCommandPaletteOpen);
      }
      if (e.key === 'Escape' && isCommandPaletteOpen) {
        setIsCommandPaletteOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCommandPaletteOpen, setIsCommandPaletteOpen]);

  if (!isCommandPaletteOpen) return null;

  // Search items across modules, stores, categories
  const allModules = NAVIGATION_GROUPS.flatMap(g => g.items);
  const matchedModules = allModules.filter(m => 
    m.title.toLowerCase().includes(query.toLowerCase()) || 
    m.code.toLowerCase().includes(query.toLowerCase())
  );

  const matchedStores = Object.values(HUB_DATA.stores).filter(s =>
    s.name.toLowerCase().includes(query.toLowerCase()) ||
    s.code.toLowerCase().includes(query.toLowerCase()) ||
    s.brand.toLowerCase().includes(query.toLowerCase())
  );

  const handleSelectModule = (viewId: string) => {
    setActiveView(viewId);
    setIsCommandPaletteOpen(false);
    setQuery('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-brand-dark/80 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-xl rounded-xl border border-brand-border bg-brand-surface shadow-2xl overflow-hidden">
        {/* Search Input */}
        <div className="relative flex items-center border-b border-brand-border px-4 py-3">
          <Search className="h-4 w-4 text-brand-gold mr-3" />
          <input
            type="text"
            placeholder="Tìm kiếm màn hình, cửa hàng, chỉ số hoặc SKU..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            autoFocus
            className="w-full bg-transparent text-sm text-brand-text placeholder-brand-muted outline-none"
          />
          <button
            onClick={() => setIsCommandPaletteOpen(false)}
            className="rounded p-1 text-brand-muted hover:bg-brand-cardHover hover:text-brand-text"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Results List */}
        <div className="max-h-80 overflow-y-auto p-2 divide-y divide-brand-border/30 text-xs">
          {/* Modules Section */}
          {matchedModules.length > 0 && (
            <div className="py-2">
              <span className="px-3 text-[10px] font-bold uppercase tracking-wider text-brand-faint">
                Màn hình Báo cáo
              </span>
              <div className="mt-1 space-y-0.5">
                {matchedModules.map(m => (
                  <button
                    key={m.id}
                    onClick={() => handleSelectModule(m.id)}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left hover:bg-brand-card text-brand-text group transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <Layout className="h-3.5 w-3.5 text-brand-gold" />
                      <span className="font-mono text-brand-gold">{m.code}</span>
                      <span className="font-medium">{m.title}</span>
                    </div>
                    <ArrowRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 text-brand-gold transition-opacity" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Stores Section */}
          {matchedStores.length > 0 && (
            <div className="py-2">
              <span className="px-3 text-[10px] font-bold uppercase tracking-wider text-brand-faint">
                Cửa hàng trong chuỗi ({matchedStores.length})
              </span>
              <div className="mt-1 space-y-0.5">
                {matchedStores.slice(0, 5).map(s => (
                  <button
                    key={s.code}
                    onClick={() => handleSelectModule('m0')}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left hover:bg-brand-card text-brand-text group transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <Store className="h-3.5 w-3.5 text-brand-olive" />
                      <span className="font-mono text-[11px] text-brand-muted">{s.code}</span>
                      <span className="font-semibold">{s.name}</span>
                      <span className="rounded bg-brand-surface border border-brand-border px-1.5 py-0.5 text-[9px] text-brand-muted">
                        {s.brand}
                      </span>
                    </div>
                    <ArrowRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 text-brand-gold transition-opacity" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {matchedModules.length === 0 && matchedStores.length === 0 && (
            <div className="py-8 text-center text-xs text-brand-muted">
              Không tìm thấy kết quả phù hợp với từ khóa &ldquo;{query}&rdquo;.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-brand-border bg-brand-dark/40 px-4 py-2 flex items-center justify-between text-[10px] text-brand-faint">
          <span>Nhấn ESC để đóng</span>
          <span>Dùng ↑ ↓ để chọn, Enter để mở</span>
        </div>
      </div>
    </div>
  );
};
