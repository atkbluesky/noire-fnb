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
  /** Net chỉ của các cặp (cửa hàng × tháng) có giao target — tử số của % Đạt Kế hoạch,
   *  tránh cộng doanh thu của cửa hàng chưa giao target vào tỷ lệ đạt. */
  netTargeted: number;
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
  /** Cộng dồn toàn bộ kỳ chọn (Từ → Đến). */
  periodAgg: AggregatedMonth;
  /** Kỳ liền trước cùng số tháng (T7–T8 → T5–T6). Rỗng nếu dữ liệu không đủ. */
  prevPeriodMonths: string[];
  prevPeriodAgg: AggregatedMonth | null;
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

  const [activeView, setActiveViewState] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash.replace('#', '').trim();
      if (hash) return hash;
    }
    return 'm0';
  });

  const setActiveView = (view: string) => {
    setActiveViewState(view);
    if (typeof window !== 'undefined' && window.location.hash !== `#${view}`) {
      window.location.hash = view;
    }
  };

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '').trim();
      if (hash) setActiveViewState(hash);
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

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

  // Kỳ liền trước cùng độ dài — chỉ lấy khi đủ tháng, không so kỳ lệch độ dài.
  const prevPeriodMonths = useMemo(() => {
    const start = allMonths.indexOf(selectedMonths[0]);
    const n = selectedMonths.length;
    if (start < 0 || n === 0 || start - n < 0) return [];
    return allMonths.slice(start - n, start);
  }, [allMonths, selectedMonths]);

  // Aggregated data according to current filters
  const buildAggByMonth = (months: string[]): Record<string, AggregatedMonth> => {
    const out: Record<string, AggregatedMonth> = {};
    months.forEach(m => {
      out[m] = {
        net: 0,
        gross: 0,
        disc: 0,
        voucher: 0,
        guest: 0,
        tc: 0,
        target: 0,
        netTargeted: 0,
        ta: null,
        aov: null,
        days: HUB_DATA.days[m] || 30,
        dcov: HUB_DATA.coverage[m]?.days_data || HUB_DATA.days[m] || 30,
        netday: 0,
      };
    });

    const netByKey: Record<string, number> = {};
    HUB_DATA.store_month.forEach((r: StoreMonth) => {
      if (!out[r.month] || !inScope(r.store)) return;
      const o = out[r.month];
      o.net += r.net || 0;
      o.gross += r.gross || 0;
      o.disc += r.disc || 0;
      o.voucher += r.voucher || 0;
      o.guest += r.guest || 0;
      o.tc += r.tc || 0;
      netByKey[`${r.month}|${r.store}`] = (netByKey[`${r.month}|${r.store}`] || 0) + (r.net || 0);
    });

    (HUB_DATA.target || []).forEach(t => {
      if (out[t.month] && inScope(t.store) && (t.target || 0) > 0) {
        out[t.month].target += t.target;
        out[t.month].netTargeted += netByKey[`${t.month}|${t.store}`] || 0;
      }
    });

    months.forEach(m => {
      const o = out[m];
      o.ta = o.guest > 0 ? o.net / o.guest : null;
      o.aov = o.tc > 0 ? o.net / o.tc : null;
      o.netday = o.net / (filters.perday ? o.dcov : 1);
    });

    return out;
  };

  const sumAgg = (rows: AggregatedMonth[]): AggregatedMonth => {
    const s = rows.reduce(
      (a, o) => ({
        ...a,
        net: a.net + o.net,
        gross: a.gross + o.gross,
        disc: a.disc + o.disc,
        voucher: a.voucher + o.voucher,
        guest: a.guest + o.guest,
        tc: a.tc + o.tc,
        target: a.target + o.target,
        netTargeted: a.netTargeted + o.netTargeted,
        days: a.days + o.days,
        dcov: a.dcov + o.dcov,
      }),
      { net: 0, gross: 0, disc: 0, voucher: 0, guest: 0, tc: 0, target: 0, netTargeted: 0,
        ta: null, aov: null, days: 0, dcov: 0, netday: 0 } as AggregatedMonth
    );
    s.ta = s.guest > 0 ? s.net / s.guest : null;
    s.aov = s.tc > 0 ? s.net / s.tc : null;
    s.netday = filters.perday ? (s.dcov > 0 ? s.net / s.dcov : 0) : s.net;
    return s;
  };

  const aggByMonth = useMemo(
    () => buildAggByMonth(selectedMonths),
    [selectedMonths, filters.scope, filters.brand, filters.perday]
  );

  const periodAgg = useMemo(
    () => sumAgg(selectedMonths.map(m => aggByMonth[m])),
    [aggByMonth, selectedMonths]
  );

  const prevPeriodAgg = useMemo(() => {
    if (!prevPeriodMonths.length) return null;
    const byMonth = buildAggByMonth(prevPeriodMonths);
    return sumAgg(prevPeriodMonths.map(m => byMonth[m]));
  }, [prevPeriodMonths, filters.scope, filters.brand, filters.perday]);

  /* Cột lấy theo HỢP các khoá của MỌI dòng — dòng đầu thiếu một khoá thì cột đó từng
     biến mất khỏi cả file. Giá trị không phải số/chuỗi được làm phẳng: mảng nối bằng " · ",
     object bỏ qua — trước đây đổ thẳng ra thành "[object Object]", mất sạch số bên trong. */
  const exportToCSV = (filename: string, rows: Record<string, any>[]) => {
    if (!rows || !rows.length) return;
    const keys: string[] = [];
    rows.forEach(r => Object.keys(r).forEach(k => { if (!keys.includes(k)) keys.push(k); }));
    const cell = (v: any): string => {
      if (v === null || v === undefined) return '""';
      if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '""';
      if (typeof v === 'boolean') return v ? '"x"' : '""';
      if (Array.isArray(v)) return cell(v.map(x => (x && typeof x === 'object' ? '' : x)).filter(Boolean).join(' · '));
      if (typeof v === 'object') return '""';
      return `"${String(v).replace(/"/g, '""')}"`;
    };
    const header = keys.map(k => `"${k.replace(/"/g, '""')}"`).join(',');
    const csvContent = rows.map(r => keys.map(k => cell(r[k])).join(',')).join('\r\n');

    const blob = new Blob(['\uFEFF' + header + '\r\n' + csvContent], { type: 'text/csv;charset=utf-8;' });
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
        periodAgg,
        prevPeriodMonths,
        prevPeriodAgg,
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
