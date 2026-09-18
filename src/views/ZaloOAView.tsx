import React, { useEffect, useMemo, useState } from 'react';
import { MessageCircle, Send, Users, MessagesSquare, RefreshCw, ShieldCheck } from 'lucide-react';
import type { EChartsOption } from 'echarts';
import { MetricCard } from '../components/common/MetricCard';
import { Card } from '../components/common/Card';
import { EChartWrapper } from '../components/charts/EChartWrapper';
import { formatNumber } from '../utils/formatters';
import type { ZaloPerformanceResponse, ZaloPeriod } from '../types/zalo';

const PERIODS: { id: ZaloPeriod; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: '7d', label: '7D' },
  { id: 'mtd', label: 'MTD' },
  { id: 'month', label: 'Month' },
];

const TYPE_LABELS: Record<string, string> = {
  text: 'Văn bản', image: 'Hình ảnh', audio: 'Âm thanh', video: 'Video',
  file: 'Tệp', sticker: 'Sticker', gif: 'GIF', location: 'Vị trí', link: 'Liên kết', other: 'Khác',
};

const shortDate = (value: string) => {
  const [, month, day] = value.split('-');
  return `${day}/${month}`;
};

const freshnessLabel = (value: string | null) => value
  ? new Intl.DateTimeFormat('vi-VN', {
      timeZone: 'Asia/Bangkok', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    }).format(new Date(value))
  : 'Chưa có';

export const ZaloOAView: React.FC = () => {
  const [period, setPeriod] = useState<ZaloPeriod>('7d');
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [data, setData] = useState<ZaloPerformanceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ code?: string; message: string } | null>(null);

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
        if (err.name !== 'AbortError') setError({ code: err.code, message: err.message });
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [period, month]);

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

  const metrics = data?.metrics;
  const empty = !loading && data && data.daily.length === 0;

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
            Theo dõi follower snapshot và luồng chat realtime. Không lưu nội dung tin nhắn, không CRM, không tự động gửi tin.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-brand-border bg-brand-surface p-1">
            {PERIODS.map(item => (
              <button
                key={item.id}
                onClick={() => setPeriod(item.id)}
                className={`rounded-md px-3 py-1.5 text-[11px] font-bold transition-colors ${
                  period === item.id ? 'bg-brand-gold text-brand-dark' : 'text-brand-muted hover:text-brand-text'
                }`}
              >
                {item.label}
              </button>
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
        </div>
      </div>

      {error?.code === 'NOT_CONFIGURED' ? (
        <div className="rounded-xl border border-status-warning/40 bg-status-warningBg/20 p-5">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 text-status-warning" />
            <div>
              <h3 className="font-display text-sm font-bold text-brand-text">Khung M8.1 đã sẵn sàng — chờ kết nối OA</h3>
              <p className="mt-1 text-xs leading-relaxed text-brand-muted">
                Chạy migration PostgreSQL, khai báo biến môi trường Zalo/Vercel và đăng ký webhook để bắt đầu nhận số thật.
                Chi tiết nằm trong <span className="font-mono text-brand-sand">docs/modules/M8_1_Zalo_OA.md</span>.
              </p>
            </div>
          </div>
        </div>
      ) : error ? (
        <div className="rounded-xl border border-status-bad/40 bg-status-badBg/20 p-4 text-xs text-status-bad">
          {error.message}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <MetricCard
          label="Tổng follower"
          subLabel="Snapshot cuối kỳ"
          value={loading ? '…' : formatNumber(metrics?.followerTotal)}
          customDeltaText={metrics?.followerNet == null ? 'Chưa đủ snapshot đối chiếu' : `${metrics.followerNet >= 0 ? '+' : ''}${formatNumber(metrics.followerNet)} trong kỳ`}
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
    </div>
  );
};
