import React, { useEffect, useMemo, useState } from 'react';
import {
  MessageCircle, Send, Users, MessagesSquare, RefreshCw, ShieldCheck, Eye, MousePointerClick, UserPlus, FileSpreadsheet,
} from 'lucide-react';
import type { EChartsOption } from 'echarts';
import { MetricCard } from '../components/common/MetricCard';
import { Card } from '../components/common/Card';
import { EChartWrapper } from '../components/charts/EChartWrapper';
import { formatMonthLabel, formatNumber, formatPercent } from '../utils/formatters';
import { MKT_DATA } from '../data';
import type { ZaloPerformanceResponse, ZaloPeriod } from '../types/zalo';
import type { ZaloOADaily } from '../types/mkt';

/* M8.1 có HAI nguồn, cùng một bố cục:
   · API    — OpenAPI getoa (tổng follower) + Webhook (chat realtime). Cần App liên kết OA.
   · EXPORT — OA Manager › Thống kê › Tổng quan (S12, theo ngày) + sổ tay Tổng người quan tâm (S26).
   API chưa nối được (OA đã đủ số App liên kết) thì màn hình tự chạy bằng EXPORT thay vì để trống. */
type Source = 'api' | 'export';
type ExportPeriod = '7d' | '30d' | 'month' | 'ytd';

const PERIODS: { id: ZaloPeriod; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: '7d', label: '7D' },
  { id: 'mtd', label: 'MTD' },
  { id: 'month', label: 'Month' },
];
const EXPORT_PERIODS: { id: ExportPeriod; label: string }[] = [
  { id: '7d', label: '7D' },
  { id: '30d', label: '30D' },
  { id: 'month', label: 'Month' },
  { id: 'ytd', label: 'YTD' },
];

const TYPE_LABELS: Record<string, string> = {
  text: 'Văn bản', image: 'Hình ảnh', audio: 'Âm thanh', video: 'Video',
  file: 'Tệp', sticker: 'Sticker', gif: 'GIF', location: 'Vị trí', link: 'Liên kết', other: 'Khác',
};

const shortDate = (value: string) => {
  const [, month, day] = value.split('-');
  return `${day}/${month}`;
};
const fullDate = (value: string) => {
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
};
const shiftDays = (value: string, days: number) => {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
const monthEnd = (month: string) => {
  const date = new Date(`${month}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  return shiftDays(date.toISOString().slice(0, 10), -1);
};

const freshnessLabel = (value: string | null) => value
  ? new Intl.DateTimeFormat('vi-VN', {
      timeZone: 'Asia/Bangkok', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    }).format(new Date(value))
  : 'Chưa có';

const SegButton: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode; disabled?: boolean; title?: string }> = ({
  active, onClick, children, disabled, title,
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={`rounded-md px-3 py-1.5 text-[11px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
      active ? 'bg-brand-gold text-brand-dark' : 'text-brand-muted hover:text-brand-text'
    }`}
  >
    {children}
  </button>
);

/* ───────────── Nguồn EXPORT: gom theo kỳ ───────────── */
type OaSums = Pick<ZaloOADaily, 'follows' | 'msgs' | 'views' | 'menu' | 'content'>;
const OA_KEYS: (keyof OaSums)[] = ['follows', 'msgs', 'views', 'menu', 'content'];

const sumRows = (rows: ZaloOADaily[]): OaSums => {
  const out: OaSums = { follows: 0, msgs: 0, views: 0, menu: 0, content: 0 };
  for (const row of rows) for (const key of OA_KEYS) out[key] += row[key] ?? 0;
  return out;
};

function exportWindow(period: ExportPeriod, month: string, lastDate: string) {
  if (period === '7d') return { start: shiftDays(lastDate, -6), end: lastDate, prev: { start: shiftDays(lastDate, -13), end: shiftDays(lastDate, -7) } };
  if (period === '30d') return { start: shiftDays(lastDate, -29), end: lastDate, prev: { start: shiftDays(lastDate, -59), end: shiftDays(lastDate, -30) } };
  if (period === 'ytd') return { start: `${lastDate.slice(0, 4)}-01-01`, end: lastDate, prev: null };
  const end = monthEnd(month) < lastDate ? monthEnd(month) : lastDate;
  const prevMonth = shiftDays(`${month}-01`, -1).slice(0, 7);
  return { start: `${month}-01`, end, prev: { start: `${prevMonth}-01`, end: monthEnd(prevMonth) } };
}

/* Bảng trường dữ liệu × nguồn — trả lời "OA có những trường gì, lấy ở đâu". */
const FIELD_MATRIX: { field: string; exp: string; manual: string; api: string }[] = [
  { field: 'Tổng người quan tâm (follower)', exp: '—', manual: '✓ nhập tay', api: '✓ getoa · num_follower' },
  { field: 'Quan tâm mới', exp: '✓ theo ngày', manual: '—', api: '✓ Webhook follow*' },
  { field: 'Bỏ quan tâm', exp: '—', manual: '✓ nếu có', api: '✓ Webhook unfollow*' },
  { field: 'Gửi tin nhắn đến OA', exp: '✓ lượt/ngày', manual: '—', api: '✓ user_send_*' },
  { field: 'Tin OA gửi đi', exp: '—', manual: '—', api: '✓ oa_send_*' },
  { field: 'Unique chat user · Hội thoại · Loại tin', exp: '—', manual: '—', api: '✓ tính từ event' },
  { field: 'Xem trang thông tin OA', exp: '✓ theo ngày', manual: '—', api: '— API không trả' },
  { field: 'Tương tác thanh menu', exp: '✓ theo ngày', manual: '—', api: '— API không trả' },
  { field: 'Xem nội dung', exp: '✓ theo ngày', manual: '—', api: '— API không trả' },
];

const ExportFieldMatrix: React.FC = () => (
  <div className="mt-4 overflow-x-auto">
    <table className="w-full min-w-[560px] text-left text-[11px]">
      <thead>
        <tr className="border-b border-brand-border text-brand-muted">
          <th className="py-1.5 pr-3 font-bold">Trường dữ liệu OA</th>
          <th className="py-1.5 pr-3 font-bold">Export Tổng quan (S12)</th>
          <th className="py-1.5 pr-3 font-bold">Sổ tay follower (S26)</th>
          <th className="py-1.5 font-bold">OpenAPI + Webhook</th>
        </tr>
      </thead>
      <tbody>
        {FIELD_MATRIX.map(row => (
          <tr key={row.field} className="border-b border-brand-border/50">
            <td className="py-1.5 pr-3 text-brand-text">{row.field}</td>
            {[row.exp, row.manual, row.api].map((cell, i) => (
              <td key={i} className={`py-1.5 pr-3 font-mono ${cell.startsWith('✓') ? 'text-status-ok' : 'text-brand-faint'}`}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
    <p className="mt-2 text-[10px] leading-relaxed text-brand-faint">
      * Cần chạy thêm migration 002 (đếm follow/unfollow vào bảng ngày) và bật event follow/unfollow khi đăng ký webhook.
      Ba chỉ số hành vi trang OA chỉ có trong export — sau khi nối API vẫn nên giữ nhịp xuất file hằng tháng.
    </p>
  </div>
);

export const ZaloOAView: React.FC = () => {
  const [period, setPeriod] = useState<ZaloPeriod>('7d');
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [data, setData] = useState<ZaloPerformanceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ code?: string; message: string } | null>(null);
  const [preferExport, setPreferExport] = useState(false);

  const oaDaily = MKT_DATA.oa_daily ?? [];
  const oaFollower = MKT_DATA.oa_follower ?? [];
  const oaMonths = useMemo(() => [...new Set(oaDaily.map(row => row.date.slice(0, 7)))], [oaDaily]);
  const lastExportDate = oaDaily.at(-1)?.date ?? null;
  const [expPeriod, setExpPeriod] = useState<ExportPeriod>('month');
  const [expMonth, setExpMonth] = useState(() => oaMonths.at(-1) ?? '');

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ period });
    if (period === 'month') params.set('month', month);
    fetch(`/api/zalo/performance?${params}`, { signal: controller.signal })
      .then(async response => {
        const body = await response.json().catch(() => ({})) as Record<string, unknown>;
        if (!response.ok || body.ok !== true) {
          throw Object.assign(new Error(String(body.message ?? body.error ?? 'Không tải được dữ liệu Zalo OA')), {
            code: body.code,
          });
        }
        setData(body as unknown as ZaloPerformanceResponse);
      })
      .catch(err => {
        if (err.name !== 'AbortError') {
          setData(null);
          setError({ code: err.code, message: err.message });
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [period, month]);

  const apiReady = data != null;
  const source: Source = apiReady && !preferExport ? 'api' : 'export';
  const hasExport = oaDaily.length > 0 && lastExportDate != null;

  /* ───── Nguồn EXPORT ───── */
  const exp = useMemo(() => {
    if (!hasExport || !lastExportDate) return null;
    const win = exportWindow(expPeriod, expMonth || lastExportDate.slice(0, 7), lastExportDate);
    const rows = oaDaily.filter(row => row.date >= win.start && row.date <= win.end);
    const prevRows = win.prev ? oaDaily.filter(row => row.date >= win.prev!.start && row.date <= win.prev!.end) : [];
    const snaps = oaFollower.filter(row => row.follower_total != null);
    const current = [...snaps].reverse().find(row => row.date <= win.end) ?? null;
    const before = [...snaps].reverse().find(row => row.date < win.start) ?? null;
    const unf = oaFollower.filter(row => row.date >= win.start && row.date <= win.end && row.unfollows != null);
    return {
      win,
      rows,
      sums: sumRows(rows),
      prev: prevRows.length ? sumRows(prevRows) : null,
      follower: current,
      followerNet: current && before ? (current.follower_total ?? 0) - (before.follower_total ?? 0) : null,
      unfollows: unf.length ? unf.reduce((sum, row) => sum + (row.unfollows ?? 0), 0) : null,
      lastSnapshot: snaps.at(-1) ?? null,
    };
  }, [hasExport, lastExportDate, expPeriod, expMonth, oaDaily, oaFollower]);

  /* ───── Biểu đồ nguồn API (giữ nguyên) ───── */
  const trendOption = useMemo<EChartsOption>(() => ({
    tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
    legend: { top: 0 },
    grid: { top: 38, right: 58, bottom: 28, left: 48 },
    xAxis: { type: 'category', data: data?.daily.map(row => shortDate(row.date)) ?? [] },
    yAxis: [
      { type: 'value', minInterval: 1, name: 'Tin nhắn' },
      { type: 'value', minInterval: 1, name: 'Follower', splitLine: { show: false } },
    ],
    series: [
      {
        name: 'Incoming', type: 'bar', stack: 'message', barMaxWidth: 28,
        data: data?.daily.map(row => row.incomingMessages) ?? [],
        itemStyle: { color: '#C5A059', borderRadius: [3, 3, 0, 0] },
      },
      {
        name: 'Outgoing', type: 'bar', stack: 'message', barMaxWidth: 28,
        data: data?.daily.map(row => row.outgoingMessages) ?? [],
        itemStyle: { color: '#82846C', borderRadius: [3, 3, 0, 0] },
      },
      {
        name: 'Unique user/ngày', type: 'line', smooth: true,
        data: data?.daily.map(row => row.uniqueChatUsers) ?? [],
        lineStyle: { color: '#22C55E', width: 2 }, itemStyle: { color: '#22C55E' },
      },
      {
        name: 'Tổng follower', type: 'line', yAxisIndex: 1, connectNulls: true,
        data: data?.daily.map(row => row.followerTotal) ?? [],
        lineStyle: { color: '#60A5FA', width: 2, type: 'dashed' }, itemStyle: { color: '#60A5FA' },
      },
    ],
  }), [data]);

  const mix = useMemo(() => Object.entries(data?.messageTypes ?? {})
    .map(([name, value]) => ({ name: TYPE_LABELS[name] ?? name, value }))
    .sort((a, b) => b.value - a.value), [data]);

  const mixOption = useMemo<EChartsOption>(() => ({
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: { type: 'scroll', orient: 'vertical', right: 0, top: 'middle' },
    series: [{
      type: 'pie', radius: ['48%', '72%'], center: ['36%', '52%'],
      data: mix,
      label: { show: false },
      itemStyle: { borderWidth: 2, borderColor: '#141417' },
      color: ['#C5A059', '#82846C', '#22C55E', '#60A5FA', '#A78BFA', '#F97316', '#EC4899', '#94A3B8'],
    }],
  }), [mix]);

  /* ───── Biểu đồ nguồn EXPORT ───── */
  const expTrendOption = useMemo<EChartsOption>(() => {
    if (!exp) return {};
    // YTD gom theo tháng — 240+ cột ngày không đọc được.
    const byMonth = expPeriod === 'ytd';
    const buckets = byMonth
      ? oaMonths.filter(m => m >= exp.win.start.slice(0, 7) && m <= exp.win.end.slice(0, 7))
          .map(m => ({ label: formatMonthLabel(m), key: m, ...sumRows(exp.rows.filter(row => row.date.startsWith(m))) }))
      : exp.rows.map(row => ({ label: shortDate(row.date), key: row.date, ...row }));
    const snapByKey = new Map<string, number>();
    for (const row of oaFollower) {
      if (row.follower_total == null) continue;
      snapByKey.set(byMonth ? row.date.slice(0, 7) : row.date, row.follower_total);
    }
    const hasSnap = buckets.some(b => snapByKey.has(b.key));
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
      legend: { top: 0, type: 'scroll' },
      grid: { top: 38, right: hasSnap ? 58 : 20, bottom: 28, left: 48 },
      xAxis: { type: 'category', data: buckets.map(b => b.label) },
      yAxis: [
        { type: 'value', minInterval: 1, name: 'Lượt' },
        ...(hasSnap ? [{ type: 'value' as const, minInterval: 1, name: 'Follower', splitLine: { show: false } }] : []),
      ],
      series: [
        { name: 'Quan tâm', type: 'bar', barMaxWidth: 22, data: buckets.map(b => b.follows), itemStyle: { color: '#C5A059', borderRadius: [3, 3, 0, 0] } },
        { name: 'Gửi tin nhắn đến OA', type: 'bar', barMaxWidth: 22, data: buckets.map(b => b.msgs), itemStyle: { color: '#82846C', borderRadius: [3, 3, 0, 0] } },
        { name: 'Xem trang OA', type: 'line', smooth: true, data: buckets.map(b => b.views), lineStyle: { color: '#60A5FA', width: 2 }, itemStyle: { color: '#60A5FA' } },
        { name: 'Tương tác menu', type: 'line', smooth: true, data: buckets.map(b => b.menu), lineStyle: { color: '#22C55E', width: 2 }, itemStyle: { color: '#22C55E' } },
        { name: 'Xem nội dung', type: 'line', smooth: true, data: buckets.map(b => b.content), lineStyle: { color: '#A78BFA', width: 1.5, type: 'dashed' }, itemStyle: { color: '#A78BFA' } },
        ...(hasSnap ? [{
          name: 'Tổng follower (sổ tay)', type: 'line' as const, yAxisIndex: 1, connectNulls: true, symbolSize: 8,
          data: buckets.map(b => snapByKey.get(b.key) ?? null),
          lineStyle: { color: '#F97316', width: 2, type: 'dashed' as const }, itemStyle: { color: '#F97316' },
        }] : []),
      ],
    };
  }, [exp, expPeriod, oaMonths, oaFollower]);

  // Ô phải: Quan tâm theo tháng + tỷ lệ Quan tâm / Xem trang OA — bối cảnh tăng trưởng toàn năm.
  const expMonthlyOption = useMemo<EChartsOption>(() => {
    const rows = MKT_DATA.oa ?? [];
    return {
      tooltip: { trigger: 'axis' },
      legend: { top: 0 },
      grid: { top: 38, right: 44, bottom: 28, left: 40 },
      xAxis: { type: 'category', data: rows.map(r => formatMonthLabel(r.month)) },
      yAxis: [
        { type: 'value', minInterval: 1 },
        { type: 'value', axisLabel: { formatter: '{value}%' }, splitLine: { show: false } },
      ],
      series: [
        {
          name: 'Quan tâm', type: 'bar', barMaxWidth: 26, itemStyle: { color: '#C5A059' },
          data: rows.map(r => ({
            value: r.follows,
            itemStyle: { color: r.month === expMonth ? '#C5A059' : '#6E6C65', borderRadius: [3, 3, 0, 0] },
          })),
        },
        {
          name: 'Quan tâm / Xem trang (%)', type: 'line', yAxisIndex: 1, smooth: true,
          data: rows.map(r => (r.views > 0 ? +((r.follows / r.views) * 100).toFixed(1) : null)),
          lineStyle: { color: '#22C55E', width: 2 }, itemStyle: { color: '#22C55E' },
        },
      ],
    };
  }, [expMonth]);

  const metrics = data?.metrics;
  const empty = !loading && data && data.daily.length === 0;
  const apiBlocked = !loading && !apiReady;

  return (
    <div className="mx-auto max-w-[1600px] space-y-5 p-4 sm:p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-brand-gold">
            OWNED CHANNEL PERFORMANCE
          </span>
          <h2 className="mt-0.5 font-display text-xl font-extrabold text-brand-text">
            M8.1 · Zalo Official Account
          </h2>
          <p className="mt-1 text-xs text-brand-muted">
            {source === 'api'
              ? 'Theo dõi follower snapshot và luồng chat realtime. Không lưu nội dung tin nhắn, không CRM, không tự động gửi tin.'
              : 'Đang chạy bằng file export OA Manager (Thống kê › Tổng quan) + sổ tay tổng follower — tự chuyển sang OpenAPI khi kết nối xong.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-brand-border bg-brand-surface p-1" title="Nguồn số liệu">
            <SegButton active={source === 'api'} onClick={() => setPreferExport(false)} disabled={!apiReady}
              title={apiReady ? 'OpenAPI + Webhook' : 'OpenAPI chưa kết nối'}>API</SegButton>
            <SegButton active={source === 'export'} onClick={() => setPreferExport(true)} disabled={!hasExport}>Export</SegButton>
          </div>
          {source === 'api' ? (
            <>
              <div className="inline-flex rounded-lg border border-brand-border bg-brand-surface p-1">
                {PERIODS.map(item => (
                  <SegButton key={item.id} active={period === item.id} onClick={() => setPeriod(item.id)}>{item.label}</SegButton>
                ))}
              </div>
              {period === 'month' && (
                <input
                  type="month"
                  value={month}
                  onChange={event => setMonth(event.target.value)}
                  className="rounded-lg border border-brand-border bg-brand-surface px-3 py-2 text-xs text-brand-text outline-none focus:border-brand-gold"
                />
              )}
            </>
          ) : hasExport && (
            <>
              <div className="inline-flex rounded-lg border border-brand-border bg-brand-surface p-1">
                {EXPORT_PERIODS.map(item => (
                  <SegButton key={item.id} active={expPeriod === item.id} onClick={() => setExpPeriod(item.id)}>{item.label}</SegButton>
                ))}
              </div>
              {expPeriod === 'month' && (
                <select
                  value={expMonth}
                  onChange={event => setExpMonth(event.target.value)}
                  className="rounded-lg border border-brand-border bg-brand-surface px-3 py-2 text-xs text-brand-text outline-none focus:border-brand-gold"
                >
                  {oaMonths.map(m => <option key={m} value={m}>{formatMonthLabel(m)}</option>)}
                </select>
              )}
            </>
          )}
        </div>
      </div>

      {apiBlocked && (
        <div className="rounded-xl border border-status-warning/40 bg-status-warningBg/20 p-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-status-warning" />
            <div>
              <h3 className="font-display text-sm font-bold text-brand-text">
                OpenAPI chưa kết nối{error?.code === 'NOT_CONFIGURED' ? '' : ' — lỗi đọc API'}
                {hasExport ? ' · đang hiển thị số từ file export' : ''}
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-brand-muted">
                {error?.code === 'NOT_CONFIGURED'
                  ? 'Chưa có App liên kết OA (OA đã chạm giới hạn số App). Code API/Webhook/DB đã sẵn — khai báo ZALO_* + DATABASE_URL là màn hình tự chuyển sang realtime.'
                  : error?.message}
                {' '}Chi tiết: <span className="font-mono text-brand-sand">docs/modules/M8_1_Zalo_OA.md</span>.
              </p>
            </div>
          </div>
        </div>
      )}

      {source === 'api' ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <MetricCard
              label="Tổng follower"
              subLabel="Snapshot cuối kỳ"
              value={loading ? '…' : formatNumber(metrics?.followerTotal)}
              customDeltaText={`${metrics?.followerNet == null ? 'Chưa đủ snapshot đối chiếu' : `${metrics.followerNet >= 0 ? '+' : ''}${formatNumber(metrics.followerNet)} trong kỳ`}${
                metrics && (metrics.newFollowers || metrics.unfollowers) ? ` · +${formatNumber(metrics.newFollowers)} / −${formatNumber(metrics.unfollowers)}` : ''}`}
              icon={<Users className="h-4 w-4" />}
              variant="hero"
            />
            <MetricCard label="Incoming" subLabel="User → OA" value={loading ? '…' : formatNumber(metrics?.incomingMessages)} icon={<MessageCircle className="h-4 w-4" />} />
            <MetricCard label="Outgoing" subLabel="OA → User" value={loading ? '…' : formatNumber(metrics?.outgoingMessages)} icon={<Send className="h-4 w-4" />} />
            <MetricCard label="Unique chat user" subLabel="Khử trùng toàn kỳ" value={loading ? '…' : formatNumber(metrics?.uniqueChatUsers)} icon={<Users className="h-4 w-4" />} />
            <MetricCard label="Cuộc hội thoại" subLabel="Session gap 24 giờ" value={loading ? '…' : formatNumber(metrics?.conversations)} icon={<MessagesSquare className="h-4 w-4" />} />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card
              title="Lưu lượng chat theo ngày"
              description="Incoming, outgoing, unique user và snapshot tổng follower theo ngày; unique KPI được khử trùng lại cho toàn kỳ."
              chip="WEBHOOK REALTIME"
              className="lg:col-span-2"
            >
              <EChartWrapper option={trendOption} height={300} loading={loading} />
            </Card>
            <Card title="Mix loại tin nhắn" description="Phân loại theo event_name của Zalo." chip="MESSAGE TYPE">
              {mix.length > 0
                ? <EChartWrapper option={mixOption} height={300} loading={loading} />
                : <div className="flex h-[300px] items-center justify-center text-xs text-brand-muted">Chưa có event tin nhắn trong kỳ.</div>}
            </Card>
          </div>

          <Card
            title="Độ tươi & định nghĩa dữ liệu"
            description="Mốc vận hành để biết số đang realtime hay snapshot đã trễ."
            chip={empty ? 'CHƯA CÓ DỮ LIỆU' : 'DATA HEALTH'}
            chipColor={empty ? 'border-status-warning/40 bg-status-warningBg text-status-warning' : undefined}
          >
            <div className="grid gap-3 text-xs sm:grid-cols-3">
              <div className="rounded-lg border border-brand-border bg-brand-surface/60 p-3">
                <div className="flex items-center gap-1.5 text-brand-muted"><RefreshCw className="h-3.5 w-3.5" /> Webhook gần nhất</div>
                <div className="mt-1 font-mono font-bold text-brand-text">{freshnessLabel(data?.freshness.last_webhook ?? null)}</div>
              </div>
              <div className="rounded-lg border border-brand-border bg-brand-surface/60 p-3">
                <div className="flex items-center gap-1.5 text-brand-muted"><RefreshCw className="h-3.5 w-3.5" /> Snapshot follower</div>
                <div className="mt-1 font-mono font-bold text-brand-text">{freshnessLabel(data?.freshness.last_snapshot ?? null)}</div>
              </div>
              <div className="rounded-lg border border-brand-border bg-brand-surface/60 p-3">
                <div className="text-brand-muted">Phạm vi hiển thị</div>
                <div className="mt-1 font-mono font-bold text-brand-text">
                  {data ? `${data.window.start} → ${data.window.end}` : '—'}
                </div>
              </div>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-brand-faint">
              Conversation = phiên bắt đầu bằng incoming message sau ≥24 giờ không tương tác. User ID được HMAC trước khi lưu;
              nội dung text và attachment không được ghi vào database.
            </p>
          </Card>
        </>
      ) : !exp ? (
        <div className="rounded-xl border border-brand-border bg-brand-surface/60 p-5 text-xs text-brand-muted">
          {loading ? 'Đang kiểm tra kết nối OpenAPI…' : 'Chưa có file export OA Zalo trong L0_input/04_CRM/02_Zalo_OA — thả file OA Manager › Thống kê › Tổng quan rồi chạy CAP_NHAT.bat.'}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <MetricCard
              label="Tổng follower"
              subLabel={exp.follower ? `Sổ tay · chụp ${fullDate(exp.follower.date)}` : 'Tổng người quan tâm'}
              value={formatNumber(exp.follower?.follower_total)}
              customDeltaText={exp.follower
                ? (exp.followerNet != null
                    ? `${exp.followerNet >= 0 ? '+' : ''}${formatNumber(exp.followerNet)} ròng trong kỳ${exp.unfollows != null ? ` · bỏ ${formatNumber(exp.unfollows)}` : ''}`
                    : 'Cần thêm 1 mốc trước đầu kỳ để tính ròng')
                : <span className="text-status-warning">Cần nhập — sổ Zalo_OA_Follower (S26)</span>}
              icon={<Users className="h-4 w-4" />}
              variant="hero"
            />
            <MetricCard label="Quan tâm mới" subLabel="Lượt · export OA" value={formatNumber(exp.sums.follows)}
              curRawValue={exp.sums.follows} prevValue={exp.prev?.follows ?? null}
              customDeltaText={exp.prev ? undefined : 'Không có kỳ so sánh'} icon={<UserPlus className="h-4 w-4" />} />
            <MetricCard label="Gửi tin nhắn đến OA" subLabel="Lượt · User → OA" value={formatNumber(exp.sums.msgs)}
              curRawValue={exp.sums.msgs} prevValue={exp.prev?.msgs ?? null}
              customDeltaText={exp.prev ? undefined : 'Không có kỳ so sánh'} icon={<MessageCircle className="h-4 w-4" />} />
            <MetricCard label="Xem trang OA" subLabel={`Quan tâm / Xem trang: ${exp.sums.views ? formatPercent(exp.sums.follows / exp.sums.views) : '—'}`}
              value={formatNumber(exp.sums.views)} curRawValue={exp.sums.views} prevValue={exp.prev?.views ?? null}
              customDeltaText={exp.prev ? undefined : 'Không có kỳ so sánh'} icon={<Eye className="h-4 w-4" />} />
            <MetricCard label="Tương tác menu" subLabel={`Xem nội dung: ${formatNumber(exp.sums.content)}`}
              value={formatNumber(exp.sums.menu)} curRawValue={exp.sums.menu} prevValue={exp.prev?.menu ?? null}
              customDeltaText={exp.prev ? undefined : 'Không có kỳ so sánh'} icon={<MousePointerClick className="h-4 w-4" />} />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card
              title={expPeriod === 'ytd' ? 'Tương tác OA theo tháng' : 'Tương tác OA theo ngày'}
              description="Quan tâm và tin nhắn (cột) cùng hành vi trên trang OA (đường). Số là LƯỢT hành động, không phải người duy nhất."
              chip="EXPORT OA MANAGER"
              className="lg:col-span-2"
            >
              <EChartWrapper option={expTrendOption} height={300} />
            </Card>
            <Card title="Quan tâm mới theo tháng" description="Cột vàng = tháng đang chọn. Đường = tỷ lệ Quan tâm / Xem trang OA." chip="GROWTH">
              <EChartWrapper option={expMonthlyOption} height={300} />
            </Card>
          </div>

          <Card
            title="Độ tươi & định nghĩa dữ liệu"
            description="Nguồn nào đang cấp số, đến ngày nào, và trường nào còn thiếu."
            chip={exp.follower ? 'DATA HEALTH' : 'THIẾU TỔNG FOLLOWER'}
            chipColor={exp.follower ? undefined : 'border-status-warning/40 bg-status-warningBg text-status-warning'}
          >
            <div className="grid gap-3 text-xs sm:grid-cols-3">
              <div className="rounded-lg border border-brand-border bg-brand-surface/60 p-3">
                <div className="flex items-center gap-1.5 text-brand-muted"><FileSpreadsheet className="h-3.5 w-3.5" /> Export Tổng quan (S12)</div>
                <div className="mt-1 font-mono font-bold text-brand-text">đến {fullDate(lastExportDate!)}</div>
                <div className="mt-0.5 text-[10px] text-brand-faint">{oaMonths.length} tháng · {oaDaily.length} ngày</div>
              </div>
              <div className="rounded-lg border border-brand-border bg-brand-surface/60 p-3">
                <div className="flex items-center gap-1.5 text-brand-muted"><Users className="h-3.5 w-3.5" /> Sổ tay tổng follower (S26)</div>
                <div className={`mt-1 font-mono font-bold ${exp.lastSnapshot ? 'text-brand-text' : 'text-status-warning'}`}>
                  {exp.lastSnapshot ? `${formatNumber(exp.lastSnapshot.follower_total)} · ${fullDate(exp.lastSnapshot.date)}` : 'Chưa nhập'}
                </div>
                <div className="mt-0.5 text-[10px] text-brand-faint">L0_input/04_CRM/05_Zalo_OA_Follower</div>
              </div>
              <div className="rounded-lg border border-brand-border bg-brand-surface/60 p-3">
                <div className="text-brand-muted">Phạm vi hiển thị</div>
                <div className="mt-1 font-mono font-bold text-brand-text">{exp.win.start} → {exp.win.end}</div>
                <div className="mt-0.5 text-[10px] text-brand-faint">
                  {exp.win.prev ? `so với ${exp.win.prev.start} → ${exp.win.prev.end}` : 'YTD không so kỳ'}
                </div>
              </div>
            </div>
            <ExportFieldMatrix />
          </Card>
        </>
      )}
    </div>
  );
};
