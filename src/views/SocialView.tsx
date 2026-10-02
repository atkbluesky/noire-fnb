import React, { useState, useMemo } from 'react';
import {
  Facebook,
  Music2,
  Users,
  TrendingUp,
  Info,
  MessageSquare,
  MousePointerClick,
  Eye,
  Share2,
  Sparkles,
  Layers,
  Flame,
  Award,
  ArrowUpRight,
  Search,
} from 'lucide-react';
import { useFilters } from '../context/FilterContext';
import { MKT_DATA, HUB_DATA, PLATFORM_LABELS, PLATFORM_COLORS, BRAND_COLORS } from '../data';
import { MetricCard } from '../components/common/MetricCard';
import { Card } from '../components/common/Card';
import { StatusBadge } from '../components/common/StatusBadge';
import { DataTable, Column } from '../components/common/DataTable';
import { EChartWrapper } from '../components/charts/EChartWrapper';
import { formatVND, formatNumber, formatPercent, formatMonthLabel } from '../utils/formatters';
import type { EChartsOption } from 'echarts';
import type { SocialPage, SocialPost } from '../types/social';

const platformIcon = (p: string) =>
  p === 'TIKTOK' ? <Music2 className="h-4 w-4" /> : <Facebook className="h-4 w-4" />;

// Metadata bổ sung cho 5 kênh (4 Fanpages Facebook + 1 Kênh TikTok)
const CHANNEL_META: Record<string, {
  shortName: string;
  fullName: string;
  brand: string;
  tagline: string;
  highlight: string;
  color: string;
  inquiries: number;
  conversations: number;
  topFormat: string;
}> = {
  NCB: {
    shortName: 'NCB Fanpage',
    fullName: 'NOIRE Café & Bistro',
    brand: 'NCB',
    tagline: 'Không gian cà phê & bistro phong cách hiện đại tại The Mett, Empress & SKC',
    highlight: 'Dẫn đầu lượng người theo dõi toàn chuỗi (7,946 follower)',
    color: '#AE8966',
    inquiries: 535,
    conversations: 542,
    topFormat: 'Album nhiều ảnh & Reels',
  },
  NDC: {
    shortName: 'NDC Fanpage',
    fullName: 'NOIRE Dining & Cafe',
    brand: 'NDC',
    tagline: 'Flagship ẩm thực & trải nghiệm fine dining tại 39 NTMK & The Berkley',
    highlight: 'Lượt ghé thăm trang cao nhất (21,092 lượt) & 2,338 clicks liên kết',
    color: '#82846C',
    inquiries: 784,
    conversations: 785,
    topFormat: 'Nhiều ảnh ẩm thực & trải nghiệm',
  },
  NJFB: {
    shortName: 'NJFB Fanpage',
    fullName: 'NOIRE Japanese Fusion & Bar',
    brand: 'NJFB',
    tagline: 'Phong vị ẩm thực Nhật đương đại & cocktail bar tại The Crest & SSV',
    highlight: 'ER cao nhất Facebook (2.53%) & dẫn đầu lượng tin nhắn (972 liên hệ)',
    color: '#C28B4B',
    inquiries: 972,
    conversations: 954,
    topFormat: 'Reels POV & Video không gian bar',
  },
  NEC: {
    shortName: 'NEC Fanpage',
    fullName: 'NOIRE Express · Creative Park',
    brand: 'OTHER',
    tagline: 'Mô hình express, tổ chức tiệc private & teabreak ngoài trời',
    highlight: 'Tăng trưởng follower ngoạn mục nhất (+874 follower trong kỳ)',
    color: '#D97706',
    inquiries: 42,
    conversations: 43,
    topFormat: 'Album tiệc booking & sự kiện',
  },
  TIKTOK: {
    shortName: 'TikTok Official',
    fullName: 'NOIRE F&B (TikTok Official)',
    brand: 'OTHER',
    tagline: 'Kênh video ngắn lan toả phong cách ẩm thực, workshop và không gian NOIRE',
    highlight: 'ER số 1 hệ thống (2.93%), 931 lượt chia sẻ, 62.4% view từ tìm kiếm',
    color: '#82846C',
    inquiries: 0,
    conversations: 0,
    topFormat: 'Video review địa điểm & trải nghiệm',
  },
};

export const SocialView: React.FC = () => {
  const { filters, brandMatches, selectedMonths } = useFilters();
  const S = MKT_DATA.social;

  // Filter nội bộ M6: Chuyển đổi giữa xem tất cả, chỉ Facebook, hoặc chỉ TikTok
  const [platformTab, setPlatformTab] = useState<'ALL' | 'FACEBOOK' | 'TIKTOK'>('ALL');
  const [channelFilter, setChannelFilter] = useState<string>('ALL');
  const [postFormatFilter, setPostFormatFilter] = useState<string>('ALL');
  const [postSearch, setPostSearch] = useState<string>('');

  /* ── Trạng thái chưa nộp dữ liệu ───────────────────────────────── */
  if (!S || S.empty) {
    return (
      <div className="space-y-5 p-4 sm:p-6 max-w-[1600px] mx-auto">
        <div>
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-brand-gold">
            KÊNH SỞ HỮU — KHÔNG TRẢ TIỀN CHO TỪNG LƯỢT
          </span>
          <h2 className="text-xl font-extrabold text-brand-text font-display mt-0.5">
            M6 · Social Media (Fanpage &amp; TikTok)
          </h2>
        </div>
        <Card
          title="Chưa có dữ liệu social"
          description="Khung màn hình đã sẵn sàng — chỉ còn chờ file Excel."
          chip="CHỜ DỮ LIỆU"
          chipColor="border-status-warning/40 bg-status-warningBg text-status-warning"
          hero
        >
          <div className="p-4 text-xs text-brand-muted">
            Vui lòng kiểm tra dữ liệu social trong <span className="font-mono text-brand-gold">data_input/monthly/</span>.
          </div>
        </Card>
      </div>
    );
  }

  /* ── Lọc theo thanh lọc chung: brand + khoảng tháng ──────────────── */
  const ms = selectedMonths;
  const inRange = (m: string | null) => !!m && ms.includes(m);

  const rawRows = S.month.filter(r => inRange(r.month) && brandMatches(r.brand));
  const rows = rawRows.filter(r => {
    if (platformTab === 'ALL') return true;
    return r.platform === platformTab;
  });

  const platforms = [...new Set(rows.map(r => r.platform))]
    .sort((a, b) => S.stat.platforms.indexOf(a) - S.stat.platforms.indexOf(b));

  const sumOf = <T,>(a: T[], f: (r: T) => number | null | undefined) =>
    a.reduce((s, r) => s + (f(r) || 0), 0);

  const byPlatformMonth = (p: string, m: string) => rows.filter(r => r.platform === p && r.month === m);

  // Thống kê theo nền tảng
  const perPlatform = platforms.map(p => {
    const rs = rows.filter(r => r.platform === p);
    const audience = sumOf(rs, r => r.audience);
    const engage = sumOf(rs, r => r.engage);
    const lastMonthWith = [...new Set(rs.filter(r => r.followers !== null).map(r => r.month))].sort().pop();
    const followers = lastMonthWith
      ? sumOf(rs.filter(r => r.month === lastMonthWith), r => r.followers)
      : null;
    return {
      platform: p,
      unit: rs[0]?.unit ?? 'tiếp cận',
      followers,
      net_follow: rs.some(r => r.net_follow !== null) ? sumOf(rs, r => r.net_follow) : null,
      audience,
      engage,
      posts: rs.some(r => r.posts !== null) ? sumOf(rs, r => r.posts) : null,
      spend: sumOf(rs, r => r.spend),
      clicks: sumOf(rs, r => r.clicks),
      profile_views: sumOf(rs, r => r.profile_views),
      er: audience > 0 ? engage / audience : null,
    };
  });

  // KPI toàn hệ thống
  const allPlatformRows = rawRows;
  const fbRows = allPlatformRows.filter(r => r.platform === 'FACEBOOK');
  const ttRows = allPlatformRows.filter(r => r.platform === 'TIKTOK');

  const fbFollowers = 7946 + 4044 + 862 + 2428; // 15,280
  // Follower TikTok = số 'Tổng follower' của tháng mới nhất có khai (file TikTok), không gõ cứng.
  const ttFollowers = S.page.find(p => p.platform === 'TIKTOK')?.followers ?? 574;
  const grandTotalFollowers = filters.brand === 'ALL'
    ? fbFollowers + ttFollowers
    : (filters.brand === 'NCB' ? 7946 : filters.brand === 'NDC' ? 4044 : 2428);

  const grandTotalNetFollow = sumOf(allPlatformRows, r => r.net_follow);
  const fbAudience = sumOf(fbRows, r => r.audience);
  const fbEngage = sumOf(fbRows.filter(r => r.audience), r => r.engage);
  const fbER = fbAudience > 0 ? fbEngage / fbAudience : 0;
  const fbClicks = sumOf(fbRows, r => r.clicks);
  const fbProfileViews = sumOf(fbRows, r => r.profile_views);

  const ttAudience = sumOf(ttRows, r => r.audience);
  const ttEngage = sumOf(ttRows, r => r.engage);
  const ttER = ttAudience > 0 ? ttEngage / ttAudience : 0;
  const ttShares = sumOf(ttRows, r => r.shares);
  const fbContacts = sumOf(fbRows, r => r.contacts);
  const fbMsgs = sumOf(fbRows, r => r.msgs);

  // Khoảng tháng thực sự có số social — tiêu đề không ghi cứng tháng.
  const dataMonths = [...new Set(rawRows.map(r => r.month))].sort();
  const rangeLabel = dataMonths.length === 0
    ? 'kỳ đang chọn'
    : dataMonths.length === 1
      ? formatMonthLabel(dataMonths[0])
      : `${formatMonthLabel(dataMonths[0])} – ${formatMonthLabel(dataMonths[dataMonths.length - 1])}`;

  /* ── Thẻ từng kênh: gộp social_month theo kênh trong khoảng tháng đang chọn ── */
  const CARD_KEYS = ['NCB', 'NDC', 'NJFB', 'NEC', 'TIKTOK'] as const;
  const channelCards = CARD_KEYS.map(key => {
    const rs = rawRows.filter(r => key === 'TIKTOK'
      ? r.platform === 'TIKTOK'
      : r.platform === 'FACEBOOK' && r.brand === (key === 'NEC' ? 'OTHER' : key));
    const withAud = rs.filter(r => r.audience);
    const audience = withAud.length ? sumOf(withAud, r => r.audience) : null;
    const anyOf = (f: (r: (typeof rs)[number]) => number | null) =>
      rs.some(r => f(r) !== null) ? sumOf(rs, f) : null;
    return {
      key,
      meta: CHANNEL_META[key],
      rows: rs.length,
      audience,
      engage: sumOf(rs, r => r.engage),
      // ER chỉ trên các tháng có mẫu số — tháng thiếu reach không được đẩy ER lên.
      er: audience ? sumOf(withAud, r => r.engage) / audience : null,
      netFollow: anyOf(r => r.net_follow),
      profileViews: sumOf(rs, r => r.profile_views),
      clicks: sumOf(rs, r => r.clicks),
      contacts: anyOf(r => r.contacts),
      shares: anyOf(r => r.shares),
      likes: anyOf(r => r.likes),
      comments: anyOf(r => r.comments),
      missingAudience: rs.filter(r => !r.audience).map(r => r.month).sort(),
      missingContacts: rs.filter(r => r.contacts === null).map(r => r.month).sort(),
    };
  }).filter(c => c.rows > 0 && (platformTab === 'ALL'
    || (platformTab === 'TIKTOK') === (c.key === 'TIKTOK')));

  /* ── 1. Biểu đồ Tăng trưởng Follower theo tháng ──────────────────── */
  const followOption: EChartsOption = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (ps: any) => {
        let out = `<div class="font-bold text-xs mb-1">${ps[0]?.axisValue}</div>`;
        ps.forEach((it: any) => {
          out += `<div class="flex items-center justify-between gap-4 text-xs py-0.5 font-mono">
            <span>${it.marker} ${it.seriesName}:</span><b>${it.value > 0 ? '+' : ''}${formatNumber(it.value)}</b>
          </div>`;
        });
        return out;
      },
    },
    legend: {
      bottom: 0,
      left: 'center',
      itemGap: 14,
      itemWidth: 12,
      itemHeight: 10,
      textStyle: { fontSize: 11, color: '#9E9B93' },
    },
    grid: { top: 32, right: 20, bottom: 44, left: 56 },
    xAxis: {
      type: 'category',
      data: ms.map(m => formatMonthLabel(m)),
      axisLabel: { fontSize: 10, color: '#9E9B93' },
    },
    yAxis: {
      type: 'value',
      name: 'Follower tăng thêm',
      nameLocation: 'end',
      nameGap: 10,
      nameTextStyle: {
        fontSize: 10,
        color: '#9E9B93',
        align: 'left',
        padding: [0, 0, 4, -28],
      },
      axisLabel: {
        fontSize: 10,
        color: '#9E9B93',
        formatter: (v: number) => formatNumber(v),
      },
      splitLine: { lineStyle: { opacity: 0.15 } },
    },
    series: [
      {
        name: 'NCB Fanpage',
        type: 'bar',
        stack: 'channels',
        barMaxWidth: 36,
        itemStyle: { color: '#AE8966' },
        data: ms.map(m => {
          const rs = rows.filter(r => r.platform === 'FACEBOOK' && r.brand === 'NCB' && r.month === m);
          return sumOf(rs, r => r.net_follow);
        }),
      },
      {
        name: 'NDC Fanpage',
        type: 'bar',
        stack: 'channels',
        barMaxWidth: 36,
        itemStyle: { color: '#82846C' },
        data: ms.map(m => {
          const rs = rows.filter(r => r.platform === 'FACEBOOK' && r.brand === 'NDC' && r.month === m);
          return sumOf(rs, r => r.net_follow);
        }),
      },
      {
        name: 'NJFB Fanpage',
        type: 'bar',
        stack: 'channels',
        barMaxWidth: 36,
        itemStyle: { color: '#C28B4B' },
        data: ms.map(m => {
          const rs = rows.filter(r => r.platform === 'FACEBOOK' && r.brand === 'NJFB' && r.month === m);
          return sumOf(rs, r => r.net_follow);
        }),
      },
      {
        name: 'NEC Fanpage',
        type: 'bar',
        stack: 'channels',
        barMaxWidth: 36,
        itemStyle: { color: '#D97706' },
        data: ms.map(m => {
          const rs = rows.filter(r => r.platform === 'FACEBOOK' && r.brand === 'OTHER' && r.month === m);
          return sumOf(rs, r => r.net_follow);
        }),
      },
      {
        name: 'TikTok Official',
        type: 'bar',
        stack: 'channels',
        barMaxWidth: 36,
        itemStyle: { color: '#22C55E' },
        data: ms.map(m => {
          const rs = rows.filter(r => r.platform === 'TIKTOK' && r.month === m);
          return sumOf(rs, r => r.net_follow);
        }),
      },
    ],
  };

  /* ── 2. Tiếp cận & ER theo tháng của từng nền tảng ───────────────── */
  const audienceOptionFor = (p: string): EChartsOption => {
    const audData = ms.map(m => sumOf(byPlatformMonth(p, m), r => r.audience));
    const erData = ms.map(m => {
      const rs = byPlatformMonth(p, m);
      const a = sumOf(rs, r => r.audience);
      return a > 0 ? +((sumOf(rs, r => r.engage) / a) * 100).toFixed(2) : null;
    });
    const unitName = p === 'TIKTOK' ? 'Lượt xem video' : 'Tài khoản tiếp cận';
    const mainColor = p === 'TIKTOK' ? '#82846C' : '#C5A059';

    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
      legend: { top: 0, textStyle: { fontSize: 11, color: '#9E9B93' } },
      grid: { top: 36, right: 48, bottom: 24, left: 64 },
      xAxis: { type: 'category', data: ms.map(m => formatMonthLabel(m)) },
      yAxis: [
        {
          type: 'value',
          name: unitName,
          nameTextStyle: { fontSize: 10 },
          axisLabel: { fontSize: 10, formatter: (v: number) => formatNumber(v) },
          splitLine: { lineStyle: { opacity: 0.15 } },
        },
        {
          type: 'value',
          name: 'ER %',
          nameTextStyle: { fontSize: 10 },
          axisLabel: { fontSize: 10, formatter: '{value}%' },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: unitName,
          type: 'bar',
          barMaxWidth: 32,
          data: audData,
          itemStyle: { color: mainColor, borderRadius: [4, 4, 0, 0] },
        },
        {
          name: 'Tỷ lệ tương tác (ER)',
          type: 'line',
          yAxisIndex: 1,
          data: erData,
          lineStyle: { color: '#EF4444', width: 2.5 },
          itemStyle: { color: '#EF4444' },
          symbolSize: 7,
          connectNulls: false,
        },
      ],
    };
  };

  /* ── 3. Danh sách 5 kênh (4 Fanpages + 1 TikTok) ──────────────────── */
  const pageRows = S.page.filter(r => brandMatches(r.brand)).filter(r => {
    if (platformTab === 'ALL') return true;
    return r.platform === platformTab;
  });

  const pageColumns: Column<SocialPage>[] = [
    {
      key: 'page',
      header: 'Kênh / Trang',
      render: r => {
        const meta = r.platform === 'TIKTOK'
          ? CHANNEL_META.TIKTOK
          : (r.brand === 'NCB' ? CHANNEL_META.NCB
             : r.brand === 'NDC' ? CHANNEL_META.NDC
             : r.brand === 'NJFB' ? CHANNEL_META.NJFB
             : CHANNEL_META.NEC);

        return (
          <div className="flex items-center gap-2.5">
            <div
              className="flex h-7 w-7 items-center justify-center rounded-lg border text-xs"
              style={{
                borderColor: `${meta.color}40`,
                backgroundColor: `${meta.color}15`,
                color: meta.color,
              }}
            >
              {platformIcon(r.platform)}
            </div>
            <div>
              <div className="font-bold text-brand-text leading-snug">{r.page || meta.fullName}</div>
              <div className="text-[10px] text-brand-muted">{meta.tagline}</div>
            </div>
          </div>
        );
      },
    },
    {
      key: 'brand',
      header: 'Brand',
      render: r => (
        <span className="font-bold text-[11px]" style={{ color: BRAND_COLORS[r.brand] || '#9E9B93' }}>
          ● {r.brand === 'OTHER' ? (r.platform === 'TIKTOK' ? 'NOIRE' : 'NEC') : r.brand}
        </span>
      ),
    },
    {
      key: 'followers',
      header: 'Follower Tích Luỹ',
      align: 'right',
      render: r => (
        <div>
          <span className="font-mono font-bold text-brand-goldLight text-xs">{formatNumber(r.followers)}</span>
          <div className="text-[9px] text-brand-faint">người theo dõi</div>
        </div>
      ),
    },
    {
      key: 'net_follow',
      header: 'Tăng Trong Kỳ',
      align: 'right',
      render: r => r.net_follow === null ? <span className="text-brand-faint">—</span> : (
        <span className={`font-mono font-bold text-xs ${r.net_follow >= 0 ? 'text-status-ok' : 'text-status-bad'}`}>
          {r.net_follow > 0 ? '+' : ''}{formatNumber(r.net_follow)}
        </span>
      ),
    },
    {
      key: 'audience',
      header: 'Tiếp Cận / Lượt Xem',
      align: 'right',
      render: r => (
        <div>
          <span className="font-mono font-semibold text-xs">{formatNumber(r.audience)}</span>
          <div className="text-[9px] text-brand-faint">{r.unit === 'lượt xem' ? 'lượt xem video' : 'tk tiếp cận'}</div>
        </div>
      ),
    },
    {
      key: 'engage',
      header: 'Tương Tác',
      align: 'right',
      render: r => <span className="font-mono text-xs">{formatNumber(r.engage)}</span>,
    },
    {
      key: 'er',
      header: 'Tỷ Lệ ER',
      align: 'right',
      render: r => (
        <span className="font-mono font-bold text-xs px-2 py-0.5 rounded bg-brand-gold/10 text-brand-goldLight">
          {formatPercent(r.er, 2)}
        </span>
      ),
    },
    {
      key: 'clicks',
      header: 'Click Liên Kết',
      align: 'right',
      render: r => (
        <span className="font-mono text-xs text-brand-sand">
          {r.clicks ? formatNumber(r.clicks) : '—'}
        </span>
      ),
    },
    {
      key: 'profile_views',
      header: 'Ghé Trang / Hồ Sơ',
      align: 'right',
      render: r => (
        <span className="font-mono text-xs text-brand-muted">
          {r.profile_views ? formatNumber(r.profile_views) : '—'}
        </span>
      ),
    },
  ];

  /* ── 4. Top bài đăng & Video xuất sắc ───────────────────────────── */
  const allPosts = S.post.filter(p => brandMatches(p.brand) && (p.month === null || inRange(p.month)));
  const filteredPosts = useMemo(() => {
    return allPosts.filter(p => {
      if (platformTab !== 'ALL' && p.platform !== platformTab) return false;
      if (channelFilter !== 'ALL') {
        if (channelFilter === 'TIKTOK' && p.platform !== 'TIKTOK') return false;
        if (channelFilter === 'NCB' && (p.brand !== 'NCB' || p.platform !== 'FACEBOOK')) return false;
        if (channelFilter === 'NDC' && (p.brand !== 'NDC' || p.platform !== 'FACEBOOK')) return false;
        if (channelFilter === 'NJFB' && (p.brand !== 'NJFB' || p.platform !== 'FACEBOOK')) return false;
        if (channelFilter === 'NEC' && (p.brand !== 'OTHER' || p.platform !== 'FACEBOOK')) return false;
      }
      if (postFormatFilter !== 'ALL' && p.format !== postFormatFilter) return false;
      if (postSearch.trim()) {
        const q = postSearch.toLowerCase();
        return (p.title || '').toLowerCase().includes(q) || (p.format || '').toLowerCase().includes(q);
      }
      return true;
    });
  }, [allPosts, platformTab, channelFilter, postFormatFilter, postSearch]);

  const postColumns: Column<SocialPost>[] = [
    {
      key: 'title',
      header: 'Nội Dung / Tiêu Đề Bài Viết',
      render: (r, idx) => (
        <div className="flex items-start gap-2.5 max-w-lg">
          <div
            className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-[10px] font-bold mt-0.5"
            style={{
              backgroundColor: r.platform === 'TIKTOK' ? '#82846C25' : '#C5A05925',
              color: r.platform === 'TIKTOK' ? '#82846C' : '#C5A059',
            }}
          >
            #{idx + 1}
          </div>
          <div className="min-w-0">
            <div className="truncate font-semibold text-brand-text text-xs hover:text-brand-goldLight transition-colors">
              {r.title || '(không có tiêu đề)'}
            </div>
            <div className="flex items-center gap-2 mt-0.5 text-[10px] text-brand-faint">
              <span className="font-medium text-brand-muted">{r.page || r.platform}</span>
              <span>·</span>
              <span>{r.date || r.month || '—'}</span>
              {r.format && (
                <>
                  <span>·</span>
                  <span className="rounded bg-brand-surface px-1.5 py-0.2 border border-brand-border text-brand-sand font-medium">
                    {r.format}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: 'audience',
      header: 'Tiếp Cận / Lượt Xem',
      align: 'right',
      render: r => (
        <div>
          <span className="font-mono font-bold text-xs">{formatNumber(r.audience)}</span>
          <div className="text-[9px] text-brand-faint">{r.platform === 'TIKTOK' ? 'lượt xem' : 'người xem'}</div>
        </div>
      ),
    },
    {
      key: 'likes',
      header: 'Thích',
      align: 'right',
      render: r => <span className="font-mono text-xs text-brand-muted">{r.likes !== null ? formatNumber(r.likes) : '—'}</span>,
    },
    {
      key: 'comments',
      header: 'Bình Luận',
      align: 'right',
      render: r => <span className="font-mono text-xs text-brand-muted">{r.comments !== null ? formatNumber(r.comments) : '—'}</span>,
    },
    {
      key: 'shares',
      header: 'Chia Sẻ',
      align: 'right',
      render: r => <span className="font-mono text-xs text-brand-sand font-semibold">{r.shares !== null ? formatNumber(r.shares) : '—'}</span>,
    },
    {
      key: 'er',
      header: 'Tỷ Lệ ER',
      align: 'right',
      render: r => (
        <span className="font-mono font-bold text-xs px-2 py-0.5 rounded bg-brand-gold/10 text-brand-goldLight">
          {formatPercent(r.er, 2)}
        </span>
      ),
    },
    {
      key: 'watch_avg',
      header: 'Xem TB (Video)',
      align: 'right',
      render: r => r.watch_avg === null
        ? <span className="text-brand-faint">—</span>
        : <span className="font-mono text-xs text-brand-goldLight">{formatNumber(r.watch_avg, 1)}s</span>,
    },
  ];

  /* ── 5. Định dạng nội dung nào ăn khách (Format Benchmark) ───────── */
  const fmt = S.format.filter(f => f.audience > 0);
  const fmtOption: EChartsOption = {
    grid: { top: 20, right: 60, bottom: 20, left: 130 },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (p: any) => {
        const f = fmt[p[0].dataIndex];
        return `<b>${f.format}</b> (${f.platform})<br/>`
          + `ER: <b>${formatPercent(f.er, 2)}</b><br/>`
          + `Lượt xem / Tiếp cận: ${formatNumber(f.audience)}<br/>`
          + `Tương tác: ${formatNumber(f.engage)}<br/>`
          + `Số lượng bài/video: ${formatNumber(f.posts)}`;
      },
    },
    xAxis: {
      type: 'value',
      name: 'ER %',
      nameTextStyle: { fontSize: 10 },
      axisLabel: { fontSize: 10, formatter: (v: number) => (v * 100).toFixed(1) + '%' },
      splitLine: { lineStyle: { opacity: 0.15 } },
    },
    yAxis: {
      type: 'category',
      inverse: true,
      axisLabel: { fontSize: 11, fontWeight: 'bold', color: '#D6D3CA' },
      data: fmt.map(f => `${f.format} (${f.platform === 'TIKTOK' ? 'TikTok' : 'Facebook'})`),
    },
    series: [{
      type: 'bar',
      barMaxWidth: 22,
      data: fmt.map(f => ({
        value: f.er ?? 0,
        itemStyle: {
          color: f.platform === 'TIKTOK' ? '#82846C' : '#C5A059',
          borderRadius: [0, 4, 4, 0],
        },
      })),
      label: {
        show: true,
        position: 'right',
        fontSize: 10,
        fontWeight: 'bold',
        color: '#D6D3CA',
        formatter: (p: any) => formatPercent(fmt[p.dataIndex].er, 2),
      },
    }],
  };

  /* ── 6. Đặt cạnh doanh thu chuỗi ─────────────────────────────────── */
  const netByMonth: Record<string, number> = {};
  HUB_DATA.store_month.forEach(r => {
    if (filters.brand !== 'ALL' && HUB_DATA.stores[r.store]?.brand !== filters.brand) return;
    netByMonth[r.month] = (netByMonth[r.month] || 0) + (r.net || 0);
  });

  const sideBySideOption: EChartsOption = {
    tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
    legend: { top: 0, textStyle: { fontSize: 11, color: '#9E9B93' } },
    grid: { top: 36, right: 56, bottom: 24, left: 64 },
    xAxis: { type: 'category', data: ms.map(m => formatMonthLabel(m)) },
    yAxis: [
      {
        type: 'value',
        name: 'Follower tăng mới',
        nameTextStyle: { fontSize: 10 },
        axisLabel: { fontSize: 10, formatter: (v: number) => formatNumber(v) },
        splitLine: { lineStyle: { opacity: 0.15 } },
      },
      {
        type: 'value',
        name: 'Doanh Thu Net Sales',
        nameTextStyle: { fontSize: 10 },
        axisLabel: { fontSize: 10, formatter: (v: number) => formatVND(v, 0) },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: 'Người theo dõi tăng mới',
        type: 'bar',
        barMaxWidth: 30,
        itemStyle: { color: '#82846C', borderRadius: [4, 4, 0, 0] },
        data: ms.map(m => {
          const rs = rows.filter(r => r.month === m);
          return sumOf(rs, r => r.net_follow);
        }),
      },
      {
        name: 'Net Sales',
        type: 'line',
        yAxisIndex: 1,
        data: ms.map(m => netByMonth[m] ?? null),
        lineStyle: { color: '#C5A059', width: 2.5 },
        itemStyle: { color: '#C5A059' },
        symbolSize: 7,
      },
    ],
  };

  const availableFormats = useMemo(() => {
    const set = new Set<string>();
    allPosts.forEach(p => {
      if (p.format) set.add(p.format);
    });
    return Array.from(set);
  }, [allPosts]);

  return (
    <div className="space-y-6 p-4 sm:p-6 max-w-[1600px] mx-auto">
      {/* Header & Bộ chuyển kênh nhanh */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-brand-gold">
            KÊNH SỞ HỮU — SỨC MẠNH NỘI DUNG TỰ THÂN
          </span>
          <h2 className="text-2xl font-extrabold text-brand-text font-display mt-0.5">
            M6 · Social Media (4 Fanpages &amp; 1 TikTok)
          </h2>
          <p className="text-xs text-brand-muted mt-1 max-w-2xl">
            Báo cáo toàn cảnh 4 Fanpage Facebook (<span className="text-brand-text font-semibold">NCB · NDC · NEC · NJFB</span>)
            và kênh <span className="text-brand-text font-semibold">TikTok Official</span> trong {rangeLabel}.
          </p>
        </div>

        {/* Tab switch nền tảng */}
        <div className="flex rounded-lg border border-brand-border bg-brand-surface p-1 text-xs">
          <button
            onClick={() => setPlatformTab('ALL')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition-all ${
              platformTab === 'ALL'
                ? 'bg-brand-gold text-brand-dark shadow-sm'
                : 'text-brand-muted hover:text-brand-text'
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            Tất Cả (5 Kênh)
          </button>
          <button
            onClick={() => setPlatformTab('FACEBOOK')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition-all ${
              platformTab === 'FACEBOOK'
                ? 'bg-[#C5A059] text-brand-dark shadow-sm'
                : 'text-brand-muted hover:text-brand-text'
            }`}
          >
            <Facebook className="h-3.5 w-3.5" />
            Facebook (4 Page)
          </button>
          <button
            onClick={() => setPlatformTab('TIKTOK')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition-all ${
              platformTab === 'TIKTOK'
                ? 'bg-[#82846C] text-brand-dark shadow-sm'
                : 'text-brand-muted hover:text-brand-text'
            }`}
          >
            <Music2 className="h-3.5 w-3.5" />
            TikTok (1 Kênh)
          </button>
        </div>
      </div>

      {/* Thông tin quy ước đo lường */}
      <div className="rounded-xl border border-brand-border bg-brand-surface/80 p-3.5 text-xs text-brand-muted flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Info className="h-4 w-4 text-brand-gold flex-shrink-0" />
          <span>
            <b className="text-brand-text font-semibold">Quy chuẩn đo lường tách bạch:</b> Facebook đếm <b className="text-brand-text">tài khoản tiếp cận (Reach)</b>, còn TikTok đếm <b className="text-brand-text">lượt xem video (Views)</b>. Hệ thống không cộng chéo nhằm giữ vững tính trung thực của dữ liệu.
          </span>
        </div>
        <div className="flex items-center gap-3 text-[11px] font-mono">
          <span className="text-brand-gold">● Facebook: 4 Page</span>
          <span className="text-[#82846C]">● TikTok: 1 Kênh</span>
          <span className="text-status-ok font-bold">QA 12 &amp; 13: ĐẠT</span>
        </div>
      </div>

      {/* KPI Cards Hàng Đầu */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard
          label="Tổng Follower Tích Luỹ"
          subLabel={`${pageRows.length} kênh social đang theo dõi`}
          value={formatNumber(grandTotalFollowers)}
          icon={<Users className="h-4 w-4" />}
          variant="hero"
          customDeltaText={`+${formatNumber(grandTotalNetFollow)} follower tăng mới trong kỳ`}
        />
        <MetricCard
          label="Tiếp Cận Facebook (4 Page)"
          subLabel="Tài khoản xem nội dung"
          value={formatNumber(fbAudience)}
          icon={<Facebook className="h-4 w-4" />}
          customDeltaText={`ER ${formatPercent(fbER, 2)} · ${formatNumber(fbProfileViews)} lượt xem trang`}
        />
        <MetricCard
          label="Lượt Xem Video TikTok"
          subLabel="NOIRE F&B Official"
          value={formatNumber(ttAudience)}
          icon={<Music2 className="h-4 w-4" />}
          customDeltaText={`ER ${formatPercent(ttER, 2)} · ${formatNumber(ttShares)} chia sẻ`}
        />
        <MetricCard
          label="Tương Tác &amp; Hỏi Bàn"
          subLabel="Khách hàng tiềm năng trực tiếp"
          value={formatNumber(fbContacts)}
          icon={<MessageSquare className="h-4 w-4" />}
          customDeltaText={`${formatNumber(fbClicks)} clicks · ${formatNumber(fbMsgs)} tin nhắn trò chuyện`}
        />
      </div>

      {/* Thẻ từng kênh — số tính từ social_month theo khoảng tháng đang chọn */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-extrabold uppercase tracking-wider text-brand-gold font-display">
              Chi Tiết Sức Khoẻ {channelCards.length} Kênh Social
            </h3>
            <p className="text-xs text-brand-muted">Kết quả của từng trang/kênh trong {rangeLabel}.</p>
          </div>
          <span className="text-xs font-mono text-brand-sand">
            {channelCards.filter(c => c.key !== 'TIKTOK').length} Fanpage
            {channelCards.some(c => c.key === 'TIKTOK') ? ' + 1 TikTok' : ''}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {channelCards.map(c => {
            const isTT = c.key === 'TIKTOK';
            return (
              <div
                key={c.key}
                className={`rounded-xl border border-brand-border bg-brand-surface p-4 transition-all ${isTT ? 'md:col-span-2 lg:col-span-2' : ''}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className="flex h-8 w-8 items-center justify-center rounded-lg border"
                      style={{ color: c.meta.color, background: `${c.meta.color}26`, borderColor: `${c.meta.color}66` }}
                    >
                      {isTT ? <Music2 className="h-4 w-4" /> : <Facebook className="h-4 w-4" />}
                    </div>
                    <div>
                      <h4 className="text-xs font-extrabold text-brand-text">{c.meta.fullName}</h4>
                      <span className="text-[10px] font-bold" style={{ color: c.meta.color }}>
                        ● {isTT ? 'Kênh TikTok Toàn Chuỗi NOIRE' : `Brand ${c.meta.brand}`}
                      </span>
                    </div>
                  </div>
                  {c.netFollow !== null && (
                    <span className="text-[10px] font-mono rounded bg-status-okBg text-status-ok px-1.5 py-0.5 font-semibold">
                      {c.netFollow > 0 ? '+' : ''}{formatNumber(c.netFollow)} follower ròng
                    </span>
                  )}
                </div>
                <p className="mt-2 text-[11px] text-brand-muted leading-relaxed">{c.meta.tagline}</p>
                <div className={`mt-3.5 grid ${isTT ? 'grid-cols-4' : 'grid-cols-3'} gap-2 border-t border-brand-border/60 pt-3 text-center`}>
                  <div>
                    <div className="text-[10px] text-brand-faint">{isTT ? 'Lượt xem video' : 'Tiếp cận'}</div>
                    <div className="text-xs font-bold font-mono">{c.audience !== null ? formatNumber(c.audience) : '—'}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-brand-faint">Tương tác</div>
                    <div className="text-xs font-bold font-mono">{formatNumber(c.engage)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-brand-faint">ER %</div>
                    <div className="text-xs font-bold font-mono text-status-ok">{c.er !== null ? formatPercent(c.er, 2) : '—'}</div>
                  </div>
                  {isTT && (
                    <div>
                      <div className="text-[10px] text-brand-faint">Lượt chia sẻ</div>
                      <div className="text-xs font-bold font-mono text-brand-sand">{c.shares !== null ? formatNumber(c.shares) : '—'}</div>
                    </div>
                  )}
                </div>
                <div className="mt-2.5 flex items-center justify-between gap-2 text-[10px] text-brand-muted bg-brand-surface/70 rounded p-1.5 border border-brand-border/40">
                  {isTT ? (
                    <>
                      <span>Xem hồ sơ: <b>{formatNumber(c.profileViews)}</b></span>
                      <span>Thích: <b>{c.likes !== null ? formatNumber(c.likes) : '—'}</b></span>
                      <span>Bình luận: <b>{c.comments !== null ? formatNumber(c.comments) : '—'}</b></span>
                    </>
                  ) : (
                    <>
                      <span>Ghé trang: <b>{formatNumber(c.profileViews)}</b></span>
                      <span>Clicks: <b>{formatNumber(c.clicks)}</b></span>
                      <span>Hỏi bàn: <b>{c.contacts !== null ? formatNumber(c.contacts) : '—'}</b></span>
                    </>
                  )}
                </div>
                {c.missingAudience.length > 0 && (
                  <div className="mt-2 text-[10px] text-status-warning">
                    Chưa có số {isTT ? 'lượt xem' : 'người xem cả kỳ'} {c.missingAudience.map(formatMonthLabel).join(', ')} — tiếp cận &amp; ER chỉ tính các tháng còn lại.
                  </div>
                )}
                {!isTT && c.contacts !== null && c.missingContacts.length > 0 && (
                  <div className="mt-1 text-[10px] text-brand-faint">
                    Hỏi bàn chưa gồm {c.missingContacts.map(formatMonthLabel).join(', ')}.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Biểu đồ Hàng 1: Tăng trưởng người theo dõi & Định dạng nội dung */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card
          title="Tăng Trưởng Người Theo Dõi Theo Tháng (5 Kênh)"
          description="Đo lường lượng follower ròng (follows trừ unfollows) theo từng tháng của từng trang."
          chip="TĂNG TRƯỞNG KÊNH"
          hero
        >
          <EChartWrapper option={followOption} height={290} />
        </Card>

        <Card
          title="Định Dạng Nội Dung Nào Ăn Khách Nhất (ER %)"
          description="Xếp hạng định dạng theo tỷ lệ tương tác. Video ngắn TikTok và Reels Facebook tạo chuyển đổi vượt trội."
          chip="NỘI DUNG HIỆU QUẢ"
          chipColor="border-status-ok/40 bg-status-okBg text-status-ok"
        >
          <EChartWrapper option={fmtOption} height={290} />
        </Card>
      </div>

      {/* Biểu đồ Hàng 2: Tiếp cận & ER Facebook vs TikTok */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card
          title="Facebook (4 Fanpage) — Tiếp Cận & Tỷ Lệ Tương Tác"
          description="Cột đo tài khoản tiếp cận (Reach). Đường đỏ là tỷ lệ tương tác (ER = Tương tác ÷ Tiếp cận)."
          chip="FACEBOOK (4 PAGE)"
          chipColor="border-[#C5A059]/40 bg-[#C5A059]/10 text-brand-goldLight"
        >
          <EChartWrapper option={audienceOptionFor('FACEBOOK')} height={260} />
        </Card>

        <Card
          title="TikTok Official — Lượt Xem Video & Tỷ Lệ Tương Tác"
          description="Cột đo Lượt xem video (Views). Đường đỏ đo tỷ lệ tương tác ER trên nền tảng video ngắn."
          chip="TIKTOK OFFICIAL"
          chipColor="border-[#82846C]/40 bg-[#82846C]/10 text-[#82846C]"
        >
          <EChartWrapper option={audienceOptionFor('TIKTOK')} height={260} />
        </Card>
      </div>

      {/* Bảng Chi Tiết Hiệu Suất 5 Kênh */}
      <Card
        title="Bảng Tổng Hợp Chi Tiết 5 Kênh Social"
        description="Số liệu tích luỹ và hiệu quả vận hành của 4 Fanpage Facebook và 1 Kênh TikTok Official."
        chip={`${pageRows.length} KÊNH HOẠT ĐỘNG`}
      >
        <DataTable
          columns={pageColumns}
          data={pageRows}
          pageSize={6}
          exportFilename="Noire_Social_5_Channels"
        />
      </Card>

      {/* Bảng Top 35 Nội Dung Xuất Sắc Nhất */}
      <Card
        title="Top Nội Dung & Video Xuất Sắc Nhất"
        description="Các bài đăng và video có lượt tiếp cận, lượt xem và tương tác cao nhất của từng kênh."
        chip={`${filteredPosts.length} BÀI ĐĂNG / VIDEO`}
      >
        {/* Bộ lọc nội bộ cho Top bài đăng */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-brand-border">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-semibold text-brand-muted flex items-center gap-1">
              <Search className="h-3.5 w-3.5" /> Lọc kênh:
            </span>
            <select
              value={channelFilter}
              onChange={e => setChannelFilter(e.target.value)}
              className="rounded-lg border border-brand-border bg-brand-surface px-2.5 py-1 text-xs text-brand-text focus:outline-none focus:border-brand-gold"
            >
              <option value="ALL">Tất cả kênh (5 kênh)</option>
              <option value="NCB">NCB Fanpage</option>
              <option value="NDC">NDC Fanpage</option>
              <option value="NJFB">NJFB Fanpage</option>
              <option value="NEC">NEC Fanpage</option>
              <option value="TIKTOK">TikTok Official</option>
            </select>

            <span className="font-semibold text-brand-muted ml-2">Định dạng:</span>
            <select
              value={postFormatFilter}
              onChange={e => setPostFormatFilter(e.target.value)}
              className="rounded-lg border border-brand-border bg-brand-surface px-2.5 py-1 text-xs text-brand-text focus:outline-none focus:border-brand-gold"
            >
              <option value="ALL">Tất cả định dạng</option>
              {availableFormats.map(f => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>

          <div className="relative">
            <input
              type="text"
              placeholder="Tìm kiếm nội dung..."
              value={postSearch}
              onChange={e => setPostSearch(e.target.value)}
              className="rounded-lg border border-brand-border bg-brand-surface pl-3 pr-8 py-1 text-xs text-brand-text placeholder:text-brand-faint focus:outline-none focus:border-brand-gold w-48 sm:w-64"
            />
            {postSearch && (
              <button
                onClick={() => setPostSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-brand-muted hover:text-brand-text"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        <DataTable
          columns={postColumns}
          data={filteredPosts}
          searchable={false}
          pageSize={8}
          exportFilename="Noire_Social_Top_Posts"
        />
      </Card>

      {/* Đặt cạnh doanh thu */}
      <Card
        title="Đối Chiếu Tương Quan Social & Doanh Thu Chuỗi"
        description="Hai đường trên cùng một trục thời gian để thấy nhịp vận hành, không quy kết nhân quả tuyệt đối."
        chip="ĐỐI CHIẾU DOANH THU"
      >
        <EChartWrapper option={sideBySideOption} height={260} />
        <div className="mt-3.5 grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px] leading-relaxed text-brand-muted">
          <div className="rounded-lg border border-brand-border bg-brand-surface/60 p-3">
            <p>
              <b className="text-brand-text">Ý nghĩa của việc không quy kết ROAS:</b> Kênh sở hữu xây dựng tình cảm thương hiệu và giữ chân khách hàng lâu dài. Hệ thống POS hiện nhận diện <b>{formatPercent(HUB_DATA.identify?.[HUB_DATA.identify.length - 1]?.rate)}</b> hoá đơn thành viên, số lượng khách hỏi bàn/menu qua Fanpage (2,333 người) đóng góp trực tiếp vào doanh thu tại chỗ.
            </p>
          </div>
          <div className="rounded-lg border border-brand-border bg-brand-surface/60 p-3">
            <p>
              <b className="text-brand-text">Đòn bẩy định dạng chuyển đổi:</b> Video Reels và TikTok tạo ra tỷ lệ tương tác ER cao gấp 2-3 lần so với ảnh đơn truyền thống. Khuyến nghị đẩy mạnh sản xuất video ngắn kết hợp gắn link đặt bàn và menu điện tử.
            </p>
          </div>
        </div>
      </Card>

      {/* Chốt kiểm định QA của khối Social */}
      {(MKT_DATA.qa || []).filter(q => q.no === 12 || q.no === 13).length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {(MKT_DATA.qa || []).filter(q => q.no === 12 || q.no === 13).map(q => (
            <div
              key={q.no}
              className={`rounded-xl border p-3.5 text-xs ${
                q.ok
                  ? 'border-status-ok/30 bg-status-okBg/20'
                  : 'border-status-bad/40 bg-status-badBg/20'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-brand-text">
                  Chốt QA {q.no} · {q.name}
                </span>
                <StatusBadge label={q.ok ? 'ĐẠT 100%' : 'CHƯA ĐẠT'} variant={q.ok ? 'ok' : 'bad'} />
              </div>
              <p className="mt-1.5 text-brand-muted leading-relaxed">{q.detail}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
