import React, { Suspense, lazy, useEffect } from 'react';
import { FilterProvider, useFilters } from './context/FilterContext';
import { Sidebar } from './components/layout/Sidebar';
import { TopHeader } from './components/layout/TopHeader';
import { FilterBar } from './components/layout/FilterBar';
import { CommandPalette } from './components/layout/CommandPalette';

/* Mỗi màn hình là một chunk riêng — trước đây cả 14 màn (kèm toàn bộ ECharts
   và bảng dữ liệu của chúng) nằm chung một file 537 KB phải tải xong mới vẽ
   được màn đầu tiên. Người dùng gần như luôn chỉ mở vài tab trong một phiên. */
const ScorecardView = lazy(() => import('./views/ScorecardView').then(m => ({ default: m.ScorecardView })));
const RevenueView = lazy(() => import('./views/RevenueView').then(m => ({ default: m.RevenueView })));
const MenuView = lazy(() => import('./views/MenuView').then(m => ({ default: m.MenuView })));
const CapacityView = lazy(() => import('./views/CapacityView').then(m => ({ default: m.CapacityView })));
const BudgetView = lazy(() => import('./views/BudgetView').then(m => ({ default: m.BudgetView })));
const DigitalAdsView = lazy(() => import('./views/DigitalAdsView').then(m => ({ default: m.DigitalAdsView })));
const SocialView = lazy(() => import('./views/SocialView').then(m => ({ default: m.SocialView })));
const PreAnalyticsView = lazy(() => import('./views/PreAnalyticsView').then(m => ({ default: m.PreAnalyticsView })));
const PromotionView = lazy(() => import('./views/PromotionView').then(m => ({ default: m.PromotionView })));
const CRMView = lazy(() => import('./views/CRMView').then(m => ({ default: m.CRMView })));
const PartnershipView = lazy(() => import('./views/PartnershipView').then(m => ({ default: m.PartnershipView })));
const BookingView = lazy(() => import('./views/BookingView').then(m => ({ default: m.BookingView })));
const InsightsView = lazy(() => import('./views/InsightsView').then(m => ({ default: m.InsightsView })));
const DataWarehouseView = lazy(() => import('./views/DataWarehouseView').then(m => ({ default: m.DataWarehouseView })));
const SystemMapView = lazy(() => import('./views/SystemMapView').then(m => ({ default: m.SystemMapView })));

const ViewFallback: React.FC = () => (
  <div className="flex items-center justify-center p-16 text-xs text-brand-muted">
    <div className="h-4 w-4 animate-spin rounded-full border-2 border-brand-border border-t-brand-gold" />
    <span className="ml-2.5">Đang mở màn hình…</span>
  </div>
);

const DashboardContent: React.FC = () => {
  const { activeView } = useFilters();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [activeView]);

  const renderView = () => {
    switch (activeView) {
      case 'd1':
        return <DataWarehouseView />;
      case 'd2':
        return <SystemMapView />;
      case 'm0':
        return <ScorecardView />;
      case 'm1':
        return <RevenueView />;
      case 'm2':
        return <MenuView />;
      case 'm3':
        return <CapacityView />;
      case 'm4':
        return <BudgetView />;
      case 'm5':
        return <DigitalAdsView />;
      case 'm6':
        return <SocialView />;
      case 'm7':
        return <PreAnalyticsView />;
      case 'm8':
        return <PromotionView />;
      case 'm9':
        return <CRMView />;
      case 'm10':
        return <PartnershipView />;
      case 'm11':
        return <BookingView />;
      case 'r1':
        return <InsightsView />;
      default:
        return <ScorecardView />;
    }
  };

  // Determine whether to show the filter bar and its options
  const showFilterBar = !['d1', 'd2'].includes(activeView);
  const showScopeFilter = ['m0', 'm1', 'm3', 'r1'].includes(activeView);
  const showPerDayFilter = ['m0', 'm1', 'r1'].includes(activeView);

  let customNote = '';
  let allowedMonths: string[] | undefined = undefined;

  if (['m4', 'm7'].includes(activeView)) {
    customNote = 'Dữ liệu chỉ áp dụng cho Kế hoạch Quý 3/2026 (Tháng 7 · 8 · 9).';
    allowedMonths = ['2026-07', '2026-08', '2026-09'];
  } else if (activeView === 'm11') {
    customNote = 'Lead tiệc hiện ghi nhận chủ yếu cho thương hiệu NDC.';
  } else if (activeView === 'm9') {
    customNote = 'Tỷ lệ nhận diện khách và Zalo OA là số liệu toàn chuỗi.';
  } else if (activeView === 'm6') {
    customNote = 'Reach của Facebook và views của TikTok không cộng chung được — mỗi nền tảng một khung riêng.';
  }

  return (
    <div className="min-h-screen bg-brand-dark text-brand-text flex">
      {/* Sidebar navigation */}
      <Sidebar />

      {/* Main content area. pl-72 chỉ áp dụng từ lg trở lên — dưới đó sidebar là
          drawer trượt đè lên nội dung (position: fixed), không đẩy layout. */}
      <main className="flex-1 min-w-0 flex flex-col lg:pl-72">
        <TopHeader />

        {showFilterBar && (
          <FilterBar
            showScope={showScopeFilter}
            showPerDay={showPerDayFilter}
            customNote={customNote}
            allowedMonths={allowedMonths}
          />
        )}

        <div className="flex-1 pb-16">
          <Suspense fallback={<ViewFallback />}>{renderView()}</Suspense>
        </div>
      </main>

      {/* Command Palette Search Modal */}
      <CommandPalette />
    </div>
  );
};

export function App() {
  return (
    <FilterProvider>
      <DashboardContent />
    </FilterProvider>
  );
}

export default App;
