import React from 'react';
import {
  LayoutDashboard,
  TrendingUp,
  UtensilsCrossed,
  Clock,
  PiggyBank,
  Megaphone,
  Share2,
  LineChart,
  Tag,
  Target,
  Users,
  MessageCircle,
  Handshake,
  CalendarCheck,
  Lightbulb,
  ShieldCheck,
  Menu,
  X,
} from 'lucide-react';
import { useFilters } from '../../context/FilterContext';
import { HUB_DATA, MKT_DATA } from '../../data';

export interface NavItem {
  id: string;
  code: string;
  title: string;
  icon: React.ReactNode;
  status: 'ok' | 'warning' | 'bad';
  statusText: string;
  /** Mục con: id của mục mẹ — hiển thị thụt vào dưới mục mẹ (vd M7.1 · M7.2 dưới M7). */
  parent?: string;
}

export interface NavGroup {
  groupTitle: string;
  items: NavItem[];
}

/** M6 tự đổi nhãn trạng thái theo việc đã nộp `social_month` hay chưa —
 *  không phải sửa tay ở đây mỗi lần khối social có/chưa có số. */
const SOCIAL_READY = !(MKT_DATA.social?.empty ?? true);

/** KHỐI 0 · QUẢN TRỊ DỮ LIỆU (D1 Kho dữ liệu & QA · D2 Bản đồ hệ thống) — ẩn khỏi
 *  menu vì hệ thống có nhiều người xem, không cần lộ ra khối vận hành/kỹ thuật nội bộ.
 *  Route 'd1'/'d2' trong App.tsx vẫn giữ nguyên (không xoá màn hình) — chỉ gỡ lối vào
 *  từ Sidebar và CommandPalette (cả hai đều đọc từ NAVIGATION_GROUPS này). Muốn bật lại
 *  thì đưa khối này về trước 'I · KẾT QUẢ KINH DOANH'. */
export const NAVIGATION_GROUPS: NavGroup[] = [
  {
    groupTitle: 'I · KẾT QUẢ KINH DOANH',
    items: [
      {
        id: 'm0',
        code: 'M0',
        title: 'Scorecard điều hành',
        icon: <LayoutDashboard className="h-4 w-4" />,
        status: 'ok',
        statusText: 'Đủ số',
      },
      {
        id: 'm1',
        code: 'M1',
        title: 'Doanh thu & Tăng trưởng',
        icon: <TrendingUp className="h-4 w-4" />,
        status: 'ok',
        statusText: 'Đủ số',
      },
      {
        id: 'm2',
        code: 'M2',
        title: 'Menu & Biên lợi nhuận',
        icon: <UtensilsCrossed className="h-4 w-4" />,
        status: 'warning',
        statusText: 'COGS 46%',
      },
      {
        id: 'm3',
        code: 'M3',
        title: 'Công suất & Kênh bán',
        icon: <Clock className="h-4 w-4" />,
        status: 'ok',
        statusText: 'Đủ số',
      },
    ],
  },
  {
    groupTitle: 'II · MARKETING & TĂNG TRƯỞNG',
    items: [
      {
        id: 'm4',
        code: 'M4',
        title: 'Ngân sách Marketing',
        icon: <PiggyBank className="h-4 w-4" />,
        status: 'ok',
        statusText: 'Plan Q3',
      },
      {
        id: 'm5',
        code: 'M5',
        title: 'Digital Ads',
        icon: <Megaphone className="h-4 w-4" />,
        status: 'ok',
        statusText: 'Thực chi',
      },
      {
        id: 'm6',
        code: 'M6',
        title: 'Social Media',
        icon: <Share2 className="h-4 w-4" />,
        status: SOCIAL_READY ? 'ok' : 'warning',
        statusText: SOCIAL_READY ? 'Kênh sở hữu' : 'Chờ số',
      },
      /* M7 PROMOTION — mục mẹ + 2 mục con, cùng MỘT danh mục chương trình
         (L0_input/03_MARKETING/07_Campaign_Tracking) nối kế hoạch Pre-Analysis ↔ POS. */
      {
        id: 'm7',
        code: 'M7',
        title: 'Promotion',
        icon: <Tag className="h-4 w-4" />,
        status: 'ok',
        statusText: 'Tổng quan',
      },
      {
        id: 'm71',
        code: 'M7.1',
        title: 'Pre-Analytics · Plan',
        icon: <LineChart className="h-4 w-4" />,
        status: 'warning',
        statusText: 'Kế hoạch',
        parent: 'm7',
      },
      {
        id: 'm72',
        code: 'M7.2',
        title: 'Promotion Tracking',
        icon: <Target className="h-4 w-4" />,
        status: 'warning',
        statusText: 'Thực tế',
        parent: 'm7',
      },
      {
        id: 'm8',
        code: 'M8',
        title: 'CRM · Voucher',
        icon: <Users className="h-4 w-4" />,
        status: 'ok',
        statusText: 'iPOS Log',
      },
      {
        id: 'm81',
        code: 'M8.1',
        title: 'Zalo OA Performance',
        icon: <MessageCircle className="h-4 w-4" />,
        status: 'warning',
        statusText: 'OpenAPI',
        parent: 'm8',
      },
      {
        id: 'm9',
        code: 'M9',
        title: 'Partnership',
        icon: <Handshake className="h-4 w-4" />,
        status: 'ok',
        statusText: 'Aggregator + Partner',
      },
      {
        id: 'm10',
        code: 'M10',
        title: 'Booking & Sự kiện',
        icon: <CalendarCheck className="h-4 w-4" />,
        status: 'ok',
        statusText: 'Lead tiệc',
      },
    ],
  },
  {
    groupTitle: 'III · CHIẾN LƯỢC & CẢNH BÁO',
    items: [
      {
        id: 'r1',
        code: 'R1',
        title: 'Insight & Cảnh báo',
        icon: <Lightbulb className="h-4 w-4" />,
        status: 'ok',
        statusText: 'Tự động',
      },
    ],
  },
];

export const Sidebar: React.FC = () => {
  const { activeView, setActiveView, isSidebarOpen, setSidebarOpen } = useFilters();

  // Đếm trên CẢ HAI khối — trước đây chỉ đếm khối POS nên số hiển thị thiếu 2 chốt marketing.
  const allQA = [...(HUB_DATA.qa || []), ...(MKT_DATA.qa || [])];
  const totalQA = allQA.length;
  const passedQA = allQA.filter(q => q.ok).length;

  // Đóng drawer bằng phím Esc — cùng thói quen với Command Palette.
  React.useEffect(() => {
    if (!isSidebarOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSidebarOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isSidebarOpen, setSidebarOpen]);

  return (
    <>
      {/* Lớp phủ — chỉ hiện dưới breakpoint lg khi drawer đang mở. Chạm vào để đóng. */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 backdrop-blur-[1px] lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 max-w-[85vw] flex-col border-r border-brand-border bg-brand-surface text-brand-text select-none transition-transform duration-200 ease-in-out lg:z-30 lg:translate-x-0 ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="border-b border-brand-border px-5 py-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand-goldLight to-brand-gold text-brand-dark font-bold text-xs shadow-glow-sm">
                N
              </div>
              <div className="min-w-0">
                <h1 className="font-display text-sm font-extrabold tracking-wider text-brand-text">
                  NOIRE HUB
                </h1>
                <p className="text-[10px] text-brand-muted tracking-wide truncate">
                  NCB · NDC · NJFB — Highgate
                </p>
              </div>
            </div>
            {/* Nút đóng — chỉ hiện trên di động/tablet, desktop không cần vì sidebar
                luôn cố định và không chiếm chỗ nội dung. */}
            <button
              onClick={() => setSidebarOpen(false)}
              className="flex-shrink-0 rounded-lg p-1.5 text-brand-muted hover:bg-brand-cardHover hover:text-brand-text lg:hidden"
              aria-label="Đóng menu"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-3 flex items-center justify-between">
            <span className="inline-flex items-center gap-1 rounded bg-brand-gold/10 px-2 py-0.5 text-[9px] font-bold text-brand-goldLight border border-brand-gold/30">
              DỮ LIỆU THẬT · {HUB_DATA.meta.months.length} THÁNG
            </span>
            <span className="text-[10px] font-mono text-brand-faint">
              v3.0 Vercel
            </span>
          </div>
        </div>

      {/* Navigation List */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {NAVIGATION_GROUPS.map(group => (
          <div key={group.groupTitle} className="space-y-1">
            <h2 className="px-2 text-[9px] font-bold uppercase tracking-widest text-brand-faint">
              {group.groupTitle}
            </h2>
            <div className="space-y-0.5">
              {group.items.map(item => {
                const isActive = activeView === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveView(item.id);
                      setSidebarOpen(false);
                    }}
                    className={`group flex w-full items-center justify-between rounded-lg py-2 text-left text-xs transition-all duration-150 ${item.parent
                      ? 'pl-7 pr-2.5 relative before:absolute before:left-4 before:top-0 before:bottom-0 before:w-px before:bg-brand-border'
                      : 'px-2.5'} ${isActive
                      ? 'bg-brand-card text-brand-goldLight font-semibold border-l-2 border-brand-gold shadow-sm'
                      : 'text-brand-muted hover:bg-brand-card/60 hover:text-brand-text'
                      }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className={`${isActive ? 'text-brand-gold' : 'text-brand-muted group-hover:text-brand-text'}`}>
                        {item.icon}
                      </span>
                      <span className="font-mono text-[10px] opacity-70">
                        {item.code}
                      </span>
                      <span className="truncate text-xs">
                        {item.title}
                      </span>
                    </div>

                    <span
                      className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border ${item.status === 'ok'
                        ? 'border-status-ok/30 bg-status-okBg text-status-ok'
                        : item.status === 'warning'
                          ? 'border-status-warning/30 bg-status-warningBg text-status-warning'
                          : 'border-status-bad/30 bg-status-badBg text-status-bad'
                        }`}
                    >
                      {item.statusText}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer metadata */}
      <div className="border-t border-brand-border p-3.5 text-[10px] text-brand-muted bg-brand-dark/40 space-y-1">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1">
            <ShieldCheck className="h-3.5 w-3.5 text-status-ok" />
            <span>Chất lượng QA:</span>
          </span>
          <span className="font-semibold text-status-ok">
            {passedQA}/{totalQA} Chốt Đạt
          </span>
        </div>
        <p className="text-brand-faint text-[9px]">
          {HUB_DATA.meta.rows_bill?.toLocaleString()} HĐ · {HUB_DATA.meta.rows_item?.toLocaleString()} dòng món
        </p>
      </div>
      </aside>
    </>
  );
};
