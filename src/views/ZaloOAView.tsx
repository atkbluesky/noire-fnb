import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  MessageCircle, Send, Users, MessagesSquare, RefreshCw, ShieldCheck, Eye, MousePointerClick, UserPlus, UserMinus, FileSpreadsheet,
} from 'lucide-react';
import type { EChartsOption } from 'echarts';
import { MetricCard } from '../components/common/MetricCard';
import { Card } from '../components/common/Card';
import { EChartWrapper } from '../components/charts/EChartWrapper';
import { formatMonthLabel, formatNumber, formatPercent } from '../utils/formatters';
import { MKT_DATA } from '../data';
import type { ZaloPerformanceResponse } from '../types/zalo';
import {
  apiSpans, followerOf, ictToday, mergeDays, oaWindow, shiftDays, summarize,
  type OaDay, type OaPeriod, type OaSummary, type Range,
} from './zalo/oaModel';

/* M8.1 — MỘT màn hình gộp hai nguồn (luật gộp: ./zalo/oaModel.ts):
   · Export OA Manager › Thống kê › Tổng quan (S12) — thả file hằng tháng, số chính thức + 3 chỉ số chỉ export có.
   · OpenAPI getoa + Webhook — tổng follower, chat 2 chiều, và bù Quan tâm/Tin nhắn cho những ngày chưa có file. */

const PERIODS: { id: OaPeriod; label: string }[] = [
  { id: '7d', label: '7D' },
  { id: '30d', label: '30D' },
  { id: 'month', label: 'Tháng' },
  { id: 'ytd', label: 'YTD' },
];

const TYPE_LABELS: Record<string, string> = {
  text: 'Văn bản', image: 'Hình ảnh', audio: 'Âm thanh', video: 'Video',
  file: 'Tệp', sticker: 'Sticker', gif: 'GIF', location: 'Vị trí', link: 'Liên kết', other: 'Khác',
};

/* Bảng luật gộp hiển thị cho người xem — trùng khớp với oaModel.ts. */
const SOURCE_RULES: [string, string, string][] = [
  ['Quan tâm mới · Gửi tin nhắn đến OA', 'Export (ngày có file)', 'API webhook — ngày chưa có file'],
  ['Xem trang OA · Tương tác menu · Xem nội dung', 'Export', '— API không có'],
  ['Tổng follower', 'API getoa (snapshot 00:05)', 'Sổ tay S26'],
  ['Bỏ quan tâm', 'API webhook unfollow', 'Sổ tay S26'],
  ['Tin OA gửi đi · Người chat · Hội thoại · Loại tin', 'API webhook', '— export không có'],
];

const shortDate = (value: string) => `${value.slice(8, 10)}/${value.slice(5, 7)}`;
const fullDate = (value: string) => `${shortDate(value)}/${value.slice(0, 4)}`;
const freshnessLabel = (value: string | null | undefined) => value
  ? new Intl.DateTimeFormat('vi-VN', {
      timeZone: 'Asia/Bangkok', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    }).format(new Date(value))
  : 'Chưa có';

const SegButton: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
  <button
    onClick={onClick}
    className={`rounded-md px-3 py-1.5 text-[11px] font-bold transition-colors ${
      active ? 'bg-brand-gold text-brand-dark' : 'text-brand-muted hover:text-brand-text'
    }`}
  >
    {children}
  </button>
);

async function fetchPerf(range: Range, signal: AbortSignal): Promise<ZaloPerformanceResponse> {
  const params = new URLSearchParams({ period: 'range', ...range });
  const response = await fetch(`/api/zalo/performance?${params}`, { signal });
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok || body.ok !== true) {
    throw Object.assign(new Error(String(body.message ?? body.error ?? 'Không tải được dữ liệu Zalo OA')), { code: body.code });
  }
  return body as unknown as ZaloPerformanceResponse;
}

type ApiState =
  | { state: 'checking' }
  | { state: 'off'; code?: string; message: string }
  | { state: 'live'; cur: ZaloPerformanceResponse; prev: ZaloPerformanceResponse | null; at: Date };

/** So kỳ chỉ khi cả hai kỳ đủ số — kỳ thiếu ngày thì so sẽ ra "giảm" giả. */
const compare = (cur: OaSummary, prev: OaSummary | null, key: keyof OaSummary, needExport = false) => {
  if (!prev) return { customDeltaText: 'Không có kỳ so sánh' };
  const gap = needExport ? cur.noExportDays + prev.noExportDays : cur.gapDays + prev.gapDays;
  if (gap > 0) return { customDeltaText: 'Kỳ so sánh chưa đủ số' };
  return { curRawValue: cur[key] as number | null, prevValue: prev[key] as number | null };
};

export const ZaloOAView: React.FC = () => {
  const exportDaily = MKT_DATA.oa_daily ?? [];
  const follower = MKT_DATA.oa_follower ?? [];
  const lastExport = exportDaily.at(-1)?.date ?? null;

  const [period, setPeriod] = useState<OaPeriod>('month');
  const [monthPick, setMonthPick] = useState<string | null>(null);
  const [api, setApi] = useState<ApiState>({ state: 'checking' });

  // API sống → kỳ neo vào hôm nay; API tắt → neo vào ngày cuối có export (không để kỳ rỗng).
  const today = ictToday();
  const anchor = api.state === 'off' ? lastExport ?? today : today;
  const month = monthPick ?? anchor.slice(0, 7);
  const win = useMemo(() => oaWindow(period, month, anchor), [period, month, anchor]);

  // Tự làm mới ngầm 60 giây/lần khi API sống và tab đang mở — webhook ghi số realtime.
  const [tick, setTick] = useState(0);
  const lastTick = useRef(0);
  const live = api.state === 'live';
  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => document.visibilityState === 'visible' && setTick(t => t + 1), 60_000);
    return () => window.clearInterval(id);
  }, [live]);

  const off = api.state === 'off';
  useEffect(() => {
    if (off) return;
    const controller = new AbortController();
    const silent = tick !== lastTick.current;
    lastTick.current = tick;
    Promise.all([fetchPerf(win, controller.signal), win.prev ? fetchPerf(win.prev, controller.signal) : null])
      .then(([cur, prev]) => setApi({ state: 'live', cur, prev, at: new Date() }))
      // Lỗi khi làm mới ngầm thì GIỮ số cũ; lỗi lần đầu thì màn hình chạy bằng export.
      .catch(err => { if (err.name !== 'AbortError' && !silent) setApi({ state: 'off', code: err.code, message: err.message }); });
    return () => controller.abort();
  }, [win, tick, off]);

  const cur = live ? api.cur : null;
  const firstApi = cur?.freshness.first_metric ?? null;

  const view = useMemo(() => {
    const days = mergeDays(win, { exportDaily, follower, api: cur });
    const prevDays = win.prev ? mergeDays(win.prev, { exportDaily, follower, api: live ? api.prev : null }) : null;
    return {
      days,
      sum: summarize(days),
      prev: prevDays ? summarize(prevDays) : null,
      follower: followerOf(win, follower, cur),
    };
  }, [win, exportDaily, follower, cur, live, api]);

  const monthOptions = useMemo(() => {
    const set = new Set(exportDaily.map(row => row.date.slice(0, 7)));
    if (firstApi) for (let m = firstApi.slice(0, 7); m <= today.slice(0, 7); m = shiftDays(`${m}-28`, 7).slice(0, 7)) set.add(m);
    set.add(month);
    return [...set].sort();
  }, [exportDaily, firstApi, today, month]);

  /* ───── Biểu đồ gộp: ngày (YTD gom theo tháng) ───── */
  const trendOption = useMemo<EChartsOption>(() => {
    const byMonth = period === 'ytd';
    const buckets: (Pick<OaDay, 'follows' | 'msgs' | 'views' | 'menu' | 'content' | 'followerTotal'> & { label: string })[] = byMonth
      ? [...new Set(view.days.map(d => d.date.slice(0, 7)))].map(m => {
          const rows = view.days.filter(d => d.date.startsWith(m));
          const s = summarize(rows);
          return { label: formatMonthLabel(m), ...s, followerTotal: [...rows].reverse().find(d => d.followerTotal != null)?.followerTotal ?? null };
        })
      : view.days.map(d => ({ ...d, label: shortDate(d.date) }));
    const hasFollower = buckets.some(b => b.followerTotal != null);
    const spans = byMonth ? [] : apiSpans(view.days);
    const line = (name: string, key: 'views' | 'menu' | 'content', color: string, dashed = false) => ({
      name, type: 'line' as const, smooth: true, data: buckets.map(b => b[key]),
      lineStyle: { color, width: dashed ? 1.5 : 2, ...(dashed ? { type: 'dashed' as const } : {}) }, itemStyle: { color },
    });
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
      legend: { top: 0, type: 'scroll' },
      grid: { top: 56, right: hasFollower ? 58 : 20, bottom: 28, left: 48 },
      xAxis: { type: 'category', data: buckets.map(b => b.label) },
      yAxis: [
        { type: 'value', minInterval: 1, name: 'Lượt' },
        ...(hasFollower ? [{ type: 'value' as const, minInterval: 1, name: 'Follower', scale: true, splitLine: { show: false } }] : []),
      ],
      series: [
        {
          name: 'Quan tâm mới', type: 'bar', barMaxWidth: 22, data: buckets.map(b => b.follows),
          itemStyle: { color: '#C5A059', borderRadius: [3, 3, 0, 0] },
          markArea: spans.length ? {
            silent: true, itemStyle: { color: 'rgba(96,165,250,0.08)' },
            label: { color: '#60A5FA', fontSize: 10, position: 'insideTop' },
            data: spans.map(([a, b]) => [{ name: 'API · chờ export', xAxis: shortDate(a) }, { xAxis: shortDate(b) }]),
          } : undefined,
        },
        { name: 'Gửi tin nhắn đến OA', type: 'bar', barMaxWidth: 22, data: buckets.map(b => b.msgs), itemStyle: { color: '#82846C', borderRadius: [3, 3, 0, 0] } },
        line('Xem trang OA', 'views', '#60A5FA'),
        line('Tương tác menu', 'menu', '#22C55E'),
        line('Xem nội dung', 'content', '#A78BFA', true),
        ...(hasFollower ? [{
          name: 'Tổng follower', type: 'line' as const, yAxisIndex: 1, connectNulls: true,
          data: buckets.map(b => b.followerTotal),
          lineStyle: { color: '#F97316', width: 2, type: 'dashed' as const }, itemStyle: { color: '#F97316' },
        }] : []),
      ],
    };
  }, [view, period]);

  const mix = useMemo(() => Object.entries(cur?.messageTypes ?? {})
    .map(([name, value]) => ({ name: TYPE_LABELS[name] ?? name, value }))
    .sort((a, b) => b.value - a.value), [cur]);

  const mixOption = useMemo<EChartsOption>(() => ({
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: { type: 'scroll', orient: 'vertical', right: 0, top: 'middle' },
    series: [{
      type: 'pie', radius: ['48%', '72%'], center: ['36%', '52%'], data: mix, label: { show: false },
      itemStyle: { borderWidth: 2, borderColor: '#141417' },
      color: ['#C5A059', '#82846C', '#22C55E', '#60A5FA', '#A78BFA', '#F97316', '#EC4899', '#94A3B8'],
    }],
  }), [mix]);

  const { sum, prev, follower: fol } = view;
  const checking = api.state === 'checking';
  const val = (v: number | null | undefined) => (checking ? '…' : formatNumber(v));
  const exportNote = sum.noExportDays ? `${sum.noExportDays} ngày chờ file export` : 'export OA Manager';
  const apiSince = firstApi && firstApi > win.start ? ` · từ ${shortDate(firstApi)}` : '';
  // Chỉ số chỉ API có: so kỳ khi kỳ trước nằm trọn sau ngày nối API.
  const apiCompare = (key: 'outgoingMessages' | 'uniqueChatUsers' | 'conversations') => {
    const before = live ? api.prev : null;
    if (!cur || !before || !firstApi || before.window.start < firstApi) return { customDeltaText: 'Chưa đủ kỳ API để so' };
    return { curRawValue: cur.metrics[key], prevValue: before.metrics[key] };
  };

  if (!lastExport && off) {
    return (
      <div className="mx-auto max-w-[1600px] p-4 sm:p-6">
        <div className="rounded-xl border border-brand-border bg-brand-surface/60 p-5 text-xs text-brand-muted">
          Chưa có số Zalo OA: API chưa đọc được ({api.message}) và chưa có file export trong L0_input/04_CRM/02_Zalo_OA —
          thả file OA Manager › Thống kê › Tổng quan rồi chạy CAP_NHAT.bat.
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-5 p-4 sm:p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-brand-gold">OWNED CHANNEL PERFORMANCE</span>
          <h2 className="mt-0.5 font-display text-xl font-extrabold text-brand-text">
            M8.1 · Zalo Official Account
            {cur?.oaName && (
              <span className="ml-2 rounded-md border border-brand-gold/40 px-2 py-0.5 align-middle text-[11px] font-bold text-brand-gold">
                OA: {cur.oaName}
              </span>
            )}
          </h2>
          <p className="mt-1 text-xs text-brand-muted">
            Export OA Manager {lastExport ? `đến ${fullDate(lastExport)}` : 'chưa có'} + {live
              ? `API realtime · cập nhật ${api.at.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`
              : checking ? 'đang kiểm tra API…' : 'API chưa đọc được'}
            {' · '}{fullDate(win.start)} → {fullDate(win.end)}
            {sum.gapDays > 0 && <span className="text-status-warning"> · {sum.gapDays} ngày chưa có số</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-brand-border bg-brand-surface p-1">
            {PERIODS.map(item => (
              <SegButton key={item.id} active={period === item.id} onClick={() => setPeriod(item.id)}>{item.label}</SegButton>
            ))}
          </div>
          {period === 'month' && (
            <select
              value={month}
              onChange={event => setMonthPick(event.target.value)}
              className="rounded-lg border border-brand-border bg-brand-surface px-3 py-2 text-xs text-brand-text outline-none focus:border-brand-gold"
            >
              {monthOptions.map(m => <option key={m} value={m}>{formatMonthLabel(m)}</option>)}
            </select>
          )}
        </div>
      </div>

      {off && (
        <div className="flex items-start gap-3 rounded-xl border border-status-warning/40 bg-status-warningBg/20 p-4">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-status-warning" />
          <p className="text-xs leading-relaxed text-brand-muted">
            <span className="font-bold text-brand-text">API chưa đọc được</span>
            {api.code === 'NOT_CONFIGURED' ? ' — chưa khai ZALO_OA_ID / DATABASE_URL.' : ` — ${api.message}.`}
            {' '}Đang hiện số export; tổng follower lấy sổ tay S26, các chỉ số chat 2 chiều tạm ẩn.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <MetricCard
          label="Tổng follower"
          subLabel={fol.source === 'api' ? 'API · snapshot cuối kỳ' : fol.date ? `Sổ tay · ${fullDate(fol.date)}` : 'Tổng người quan tâm'}
          value={val(fol.total)}
          customDeltaText={fol.total == null
            ? <span className="text-status-warning">Chưa có — API hoặc sổ S26</span>
            : fol.net == null ? 'Chưa đủ mốc để tính ròng'
            : `${fol.net >= 0 ? '+' : ''}${formatNumber(fol.net)} ${fol.netSince ? `từ ${shortDate(fol.netSince)}` : 'trong kỳ'}`}
          icon={<Users className="h-4 w-4" />}
          variant="hero"
        />
        <MetricCard label="Quan tâm mới" subLabel="Lượt · export + API" value={val(sum.follows)}
          {...compare(sum, prev, 'follows')} icon={<UserPlus className="h-4 w-4" />} />
        <MetricCard label="Gửi tin nhắn đến OA" subLabel="Lượt · User → OA" value={val(sum.msgs)}
          {...compare(sum, prev, 'msgs')} icon={<MessageCircle className="h-4 w-4" />} />
        <MetricCard label="Xem trang OA" subLabel={`Quan tâm/Xem trang: ${formatPercent(sum.followRate)} · ${exportNote}`}
          value={val(sum.views)} {...compare(sum, prev, 'views', true)} icon={<Eye className="h-4 w-4" />} />
        <MetricCard label="Tương tác menu" subLabel={`Xem nội dung: ${formatNumber(sum.content)} · ${exportNote}`}
          value={val(sum.menu)} {...compare(sum, prev, 'menu', true)} icon={<MousePointerClick className="h-4 w-4" />} />
      </div>

      {cur && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricCard label="Tin OA gửi đi" subLabel={`OA → User · API${apiSince}`} value={formatNumber(cur.metrics.outgoingMessages)}
            {...apiCompare('outgoingMessages')}
            icon={<Send className="h-4 w-4" />} />
          <MetricCard label="Người chat" subLabel={`Khử trùng toàn kỳ · API${apiSince}`} value={formatNumber(cur.metrics.uniqueChatUsers)}
            {...apiCompare('uniqueChatUsers')}
            icon={<Users className="h-4 w-4" />} />
          <MetricCard label="Cuộc hội thoại" subLabel={`Cách nhau ≥24 giờ · API${apiSince}`} value={formatNumber(cur.metrics.conversations)}
            {...apiCompare('conversations')}
            icon={<MessagesSquare className="h-4 w-4" />} />
          <MetricCard label="Bỏ quan tâm" subLabel={`Webhook unfollow${apiSince}`} value={formatNumber(sum.unfollows)}
            {...compare(sum, prev, 'unfollows')} icon={<UserMinus className="h-4 w-4" />} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card
          title={period === 'ytd' ? 'Tương tác OA theo tháng' : 'Tương tác OA theo ngày'}
          description="Cột = Quan tâm mới, Gửi tin nhắn. Đường = hành vi trên trang OA (chỉ export có). Nền xanh = ngày lấy số API vì chưa có file export."
          chip="EXPORT + API"
          className={mix.length ? 'lg:col-span-2' : 'lg:col-span-3'}
        >
          <EChartWrapper option={trendOption} height={300} loading={checking} />
        </Card>
        {mix.length > 0 && (
          <Card title="Mix loại tin nhắn" description={`Phân loại theo event_name của Zalo${apiSince}.`} chip="API">
            <EChartWrapper option={mixOption} height={300} />
          </Card>
        )}
      </div>

      <Card title="Nguồn & độ tươi dữ liệu" description="Mỗi chỉ số lấy từ nguồn nào, nguồn đó mới đến đâu." chip="DATA HEALTH">
        <div className="grid gap-3 text-xs sm:grid-cols-3">
          <div className="rounded-lg border border-brand-border bg-brand-surface/60 p-3">
            <div className="flex items-center gap-1.5 text-brand-muted"><FileSpreadsheet className="h-3.5 w-3.5" /> Export Tổng quan (S12)</div>
            <div className="mt-1 font-mono font-bold text-brand-text">{lastExport ? `đến ${fullDate(lastExport)}` : 'Chưa có file'}</div>
            <div className="mt-0.5 text-[10px] text-brand-faint">Thả file tháng mới vào L0_input/04_CRM/02_Zalo_OA → CAP_NHAT.bat</div>
          </div>
          <div className="rounded-lg border border-brand-border bg-brand-surface/60 p-3">
            <div className="flex items-center gap-1.5 text-brand-muted"><RefreshCw className="h-3.5 w-3.5" /> API · webhook / snapshot</div>
            <div className={`mt-1 font-mono font-bold ${cur ? 'text-brand-text' : 'text-status-warning'}`}>
              {cur ? `${freshnessLabel(cur.freshness.last_webhook)} · ${freshnessLabel(cur.freshness.last_snapshot)}` : checking ? '…' : 'Chưa đọc được'}
            </div>
            <div className="mt-0.5 text-[10px] text-brand-faint">{firstApi ? `Có số từ ${fullDate(firstApi)}` : 'Tự động — không cần thao tác'}</div>
          </div>
          <div className="rounded-lg border border-brand-border bg-brand-surface/60 p-3">
            <div className="flex items-center gap-1.5 text-brand-muted"><Users className="h-3.5 w-3.5" /> Sổ tay tổng follower (S26)</div>
            <div className="mt-1 font-mono font-bold text-brand-text">
              {follower.length ? `${follower.length} mốc · đến ${fullDate(follower.at(-1)!.date)}` : 'Trống'}
            </div>
            <div className="mt-0.5 text-[10px] text-brand-faint">Chỉ cần cho các tháng trước ngày nối API</div>
          </div>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-[11px]">
            <thead>
              <tr className="border-b border-brand-border text-brand-muted">
                <th className="py-1.5 pr-3 font-bold">Chỉ số</th>
                <th className="py-1.5 pr-3 font-bold">Nguồn chính</th>
                <th className="py-1.5 font-bold">Bù khi thiếu</th>
              </tr>
            </thead>
            <tbody>
              {SOURCE_RULES.map(([field, main, fallback]) => (
                <tr key={field} className="border-b border-brand-border/50">
                  <td className="py-1.5 pr-3 text-brand-text">{field}</td>
                  <td className="py-1.5 pr-3 font-mono text-status-ok">{main}</td>
                  <td className={`py-1.5 font-mono ${fallback.startsWith('—') ? 'text-brand-faint' : 'text-brand-sand'}`}>{fallback}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[10px] leading-relaxed text-brand-faint">
            Ngày có file export thì dùng số export (số chính thức của OA Manager), kể cả khi API cũng có. Số là LƯỢT hành động.
            API không lưu nội dung tin nhắn; user ID được HMAC trước khi lưu.
          </p>
        </div>
      </Card>
    </div>
  );
};
