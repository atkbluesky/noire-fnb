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
  Users,
  Handshake,
  CalendarCheck,
  Lightbulb,
  Database,
  Network,
  ShieldCheck,
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
}

export interface NavGroup {
  groupTitle: string;
  items: NavItem[];
}

/** M6 tự đổi nhãn trạng thái theo việc đã nộp `social_month` hay chưa —
 *  không phải sửa tay ở đây mỗi lần khối social có/chưa có số. */
const SOCIAL_READY = !(MKT_DATA.social?.empty ?? true);

export const NAVIGATION_GROUPS: NavGroup[] = [
  {
    groupTitle: 'KHỐI 0 · QUẢN TRỊ DỮ LIỆU',
    items: [
      {
        id: 'd1',
        code: 'D1',
        title: 'Kho dữ liệu & QA',
        icon: <Database className="h-4 w-4" />,
        status: 'ok',
        statusText: 'Chốt QA',
      },
      {
        id: 'd2',
        code: 'D2',
        title: 'Bản đồ hệ thống',
        icon: <Network className="h-4 w-4" />,
        status: 'warning',
        statusText: 'Phân mảnh',
      },
    ],
  },
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
      {
        id: 'm7',
        code: 'M7',
        title: 'Pre-Analytics — Plan',
        icon: <LineChart className="h-4 w-4" />,
        status: 'warning',
        statusText: 'Dự báo',
      },
      {
        id: 'm8',
        code: 'M8',
        title: 'Promotion',
        icon: <Tag className="h-4 w-4" />,
        status: 'ok',
        statusText: 'Gắn món',
      },
      {
        id: 'm9',
        code: 'M9',
        title: 'CRM · Voucher · Zalo OA',
        icon: <Users className="h-4 w-4" />,
        status: 'ok',
        statusText: 'iPOS Log',
      },
      {
        id: 'm10',
        code: 'M10',
        title: 'Partnership',
        icon: <Handshake className="h-4 w-4" />,
        status: 'warning',
        statusText: 'Đối tác',
      },
      {
        id: 'm11',
        code: 'M11',
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

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = () => {
  const { activeView, setActiveView } = useFilters();

  // Đếm trên CẢ HAI khối — trước đây chỉ đếm khối POS nên số hiển thị thiếu 2 chốt marketing.
  const allQA = [...(HUB_DATA.qa || []), ...(MKT_DATA.qa || [])];
  const totalQA = allQA.length;
  const passedQA = allQA.filter(q => q.ok).length;

  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-72 flex-col border-r border-brand-border bg-brand-surface text-brand-text select-none">
      {/* Brand Header */}
      <div className="border-b border-brand-border px-5 py-4">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-brand-goldLight to-brand-gold text-brand-dark font-bold text-xs shadow-glow-sm">
            N
          </div>
          <div>
            <h1 className="font-display text-sm font-extrabold tracking-wider text-brand-text">
              NOIRE HUB
            </h1>
            <p className="text-[10px] text-brand-muted tracking-wide">
              NCB · NDC · NJFB — Highgate
            </p>
          </div>
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
                    onClick={() => setActiveView(item.id)}
                    className={`group flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs transition-all duration-150 ${isActive
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
  );
};
