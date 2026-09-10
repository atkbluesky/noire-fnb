import React, { createContext, useContext, useState, useMemo, useEffect } from 'react';
import { HUB_DATA, CORE_STORES, LAST_FULL_MONTH, BrandType } from '../data';
import { StoreMonth } from '../types/hub';

export type ThemeMode = 'dark' | 'light';

export interface FilterState {
  scope: 'main' | 'all';
  brand: BrandType;
  from: string;
  to: string;
  perday: boolean;
}

export interface AggregatedMonth {
  net: number;
  gross: number;
  disc: number;
  voucher: number;
  guest: number;
  tc: number;
  target: number;
  ta: number | null;
  aov: number | null;
  days: number;
  dcov: number;
  netday: number;
}

export interface FilterContextType {
  filters: FilterState;
  setScope: (scope: 'main' | 'all') => void;
  setBrand: (brand: BrandType) => void;
  setFrom: (from: string) => void;
  setTo: (to: string) => void;
  setPerday: (perday: boolean) => void;
  togglePerday: () => void;
  inScope: (storeCode: string) => boolean;
  brandMatches: (brand: string) => boolean;
  selectedMonths: string[];
  isPartialMonth: (month: string) => boolean;
  aggByMonth: Record<string, AggregatedMonth>;
  activeView: string;
  setActiveView: (viewId: string) => void;
  isCommandPaletteOpen: boolean;
  setIsCommandPaletteOpen: (open: boolean) => void;
  /** Drawer sidebar trên di động (< lg). Ở desktop sidebar luôn hiện bằng CSS
   *  (lg:translate-x-0), cờ này chỉ có tác dụng dưới breakpoint lg. */
  isSidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
  exportToCSV: (filename: string, rows: Record<string, any>[]) => void;
}

const FilterContext = createContext<FilterContextType | undefined>(undefined);

export const FilterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const allMonths = HUB_DATA.meta.months;
  
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('noire-theme');
      if (saved === 'light' || saved === 'dark') return saved;
    }
    return 'dark';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
      root.classList.remove('light');
    } else {
      root.classList.remove('dark');
      root.classList.add('light');
    }
    if (typeof window !== 'undefined') {
      localStorage.setItem('noire-theme', theme);
    }
  }, [theme]);

  const setTheme = (t: ThemeMode) => setThemeState(t);
  const toggleTheme = () => setThemeState(prev => (prev === 'dark' ? 'light' : 'dark'));

  const [filters, setFilters] = useState<FilterState>({
    scope: 'main',
    brand: 'ALL',
    from: allMonths[0] || '2026-01',
    to: LAST_FULL_MONTH,
    perday: false,
  });

  const [activeView, setActiveView] = useState<string>('m0');
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState<boolean>(false);
  const [isSidebarOpen, setSidebarOpen] = useState<boolean>(false);
  const toggleSidebar = () => setSidebarOpen(prev => !prev);

  // Đổi màn hình thì tự đóng drawer — trên di động, mở lại menu để chọn tab khác
  // mà không cần bấm nút đóng trước, đúng hành vi người dùng mong đợi.
  useEffect(() => {
    setSidebarOpen(false);
  }, [activeView]);

  // Khoá cuộn nền khi drawer đang mở trên di động, tránh cảnh vừa cuộn sidebar
  // vừa cuộn nội dung phía sau nó cùng lúc.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.style.overflow = isSidebarOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isSidebarOpen]);

  const setScope = (scope: 'main' | 'all') => setFilters(prev => ({ ...prev, scope }));
  const setBrand = (brand: BrandType) => setFilters(prev => ({ ...prev, brand }));
  const setFrom = (from: string) => setFilters(prev => ({ ...prev, from, to: from > prev.to ? from : prev.to }));
  const setTo = (to: string) => setFilters(prev => ({ ...prev, to, from: to < prev.from ? to : prev.from }));
  const setPerday = (perday: boolean) => setFilters(prev => ({ ...prev, perday }));
  const togglePerday = () => setFilters(prev => ({ ...prev, perday: !prev.perday }));

  const inScope = (storeCode: string): boolean => {
    const store = HUB_DATA.stores[storeCode];
    if (!store) return false;
    const matchesScope = filters.scope === 'all' ? true : CORE_STORES.includes(storeCode);
    const matchesBrand = filters.brand === 'ALL' || store.brand === filters.brand;
    return matchesScope && matchesBrand;
  };

  const brandMatches = (brandName: string): boolean => {
    if (filters.brand === 'ALL') return true;
    return brandName === filters.brand;
  };

  const selectedMonths = useMemo(() => {
    return allMonths.filter(m => m >= filters.from && m <= filters.to);
  }, [allMonths, filters.from, filters.to]);

  const isPartialMonth = (month: string): boolean => {
    return !!HUB_DATA.coverage[month]?.partial;
  };

  // Aggregated data according to current filters
  const aggByMonth = useMemo(() => {
    const out: Record<string, AggregatedMonth> = {};
    selectedMonths.forEach(m => {
      out[m] = {
        net: 0,
        gross: 0,
        disc: 0,
        voucher: 0,
        guest: 0,
        tc: 0,
        target: 0,
        ta: null,
        aov: null,
        days: HUB_DATA.days[m] || 30,
        dcov: HUB_DATA.coverage[m]?.days_data || HUB_DATA.days[m] || 30,
        netday: 0,
      };
    });

    HUB_DATA.store_month.forEach((r: StoreMonth) => {
      if (!out[r.month] || !inScope(r.store)) return;
      const o = out[r.month];
      o.net += r.net || 0;
      o.gross += r.gross || 0;
      o.disc += r.disc || 0;
      o.voucher += r.voucher || 0;
      o.guest += r.guest || 0;
      o.tc += r.tc || 0;
    });

    (HUB_DATA.target || []).forEach(t => {
      if (out[t.month] && inScope(t.store)) {
        out[t.month].target += t.target || 0;
      }
    });

    selectedMonths.forEach(m => {
      const o = out[m];
      o.ta = o.guest > 0 ? o.net / o.guest : null;
      o.aov = o.tc > 0 ? o.net / o.tc : null;
      o.netday = o.net / (filters.perday ? o.dcov : 1);
    });

    return out;
  }, [selectedMonths, filters.scope, filters.brand, filters.perday]);

  const exportToCSV = (filename: string, rows: Record<string, any>[]) => {
    if (!rows || !rows.length) return;
    const keys = Object.keys(rows[0]);
    const header = keys.join(',');
    const csvContent = rows.map(r => {
      return keys.map(k => {
        let v = r[k];
        if (v == null) return '""';
        if (typeof v === 'string') {
          return `"${v.replace(/"/g, '""')}"`;
        }
        return v;
      }).join(',');
    }).join('\n');

    const blob = new Blob(['\uFEFF' + header + '\n' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${filename}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <FilterContext.Provider
      value={{
        filters,
        setScope,
        setBrand,
        setFrom,
        setTo,
        setPerday,
        togglePerday,
        inScope,
        brandMatches,
        selectedMonths,
        isPartialMonth,
        aggByMonth,
        activeView,
        setActiveView,
        isCommandPaletteOpen,
        setIsCommandPaletteOpen,
        isSidebarOpen,
        setSidebarOpen,
        toggleSidebar,
        theme,
        setTheme,
        toggleTheme,
        exportToCSV,
      }}
    >
      {children}
    </FilterContext.Provider>
  );
};

export const useFilters = () => {
  const context = useContext(FilterContext);
  if (!context) {
    throw new Error('useFilters must be used within a FilterProvider');
  }
  return context;
};
