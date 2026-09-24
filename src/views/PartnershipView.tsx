import React from 'react';
import { Download } from 'lucide-react';
import { useFilters } from '../context/FilterContext';
import { HUB_DATA, MKT_DATA } from '../data';
import { MetricCard } from '../components/common/MetricCard';
import { Card } from '../components/common/Card';
import { StatusBadge } from '../components/common/StatusBadge';
import { DataTable, Column, columnsToRows } from '../components/common/DataTable';
import { EChartWrapper } from '../components/charts/EChartWrapper';
import { formatVND, formatNumber, formatPercent, formatMonthLabel } from '../utils/formatters';
import {
  CHANNELS, CHANNEL_META, PARTNERS, PARTNER_BY_CODE, PartnerTotals,
  emptyTotals, offerText, partnerRows, totals, totalsBy,
} from '../utils/partner';
import type { PartnerChannel, PartnerItem } from '../types/mkt';
import type { EChartsOption } from 'echarts';

/* M9 · PARTNERSHIP — Đối tác = AGGREGATOR + PARTNER.
   Số đọc từ MKT_DATA.partner_fact qua utils/partner.ts — cùng hàm với thẻ "Đối tác" ở M7.
   Danh mục · cơ chế ưu đãi · phí · kỳ hạn: L0 05_DOI_TAC/01_Danh_Muc (S15) · số aggregator tự thống kê:
   05_DOI_TAC/03_Aggregator (S19) · log eVoucher: 05_DOI_TAC/02_eVoucher_Doi_Tac (S21). Đặc tả: docs/modules/M9_Partnership.md */

const ChannelBadge: React.FC<{ ch: PartnerChannel }> = ({ ch }) => {
  const c = CHANNEL_META[ch];
  return (
    <span
      className="inline-block rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
      style={{ color: c?.color, borderColor: `${c?.color}66`, backgroundColor: `${c?.color}1A` }}
    >
      {c?.short ?? ch}
    </span>
  );
};

const statusVariant = (s: string | null) =>
  /đang chạy/i.test(s ?? '') ? 'ok' : /chuẩn bị/i.test(s ?? '') ? 'warning' : 'neutral';

const Flags: React.FC<{ flags: string[] }> = ({ flags }) =>
  flags.length ? (
    <div className="space-y-1 py-0.5 whitespace-normal">
      {flags.map(f => (
        <div key={f} className="text-[10px] text-status-warning leading-tight flex items-start gap-1">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-status-warning flex-shrink-0 mt-1" />
          <span>{f}</span>
        </div>
      ))}
    </div>
  ) : <span className="text-[12px] text-status-ok font-bold inline-block">✓</span>;

/* Ô chữ dài được xuống dòng — DataTable mặc định giữ mỗi hàng một dòng (whitespace-nowrap). */
const Wrap: React.FC<{ w?: string; children: React.ReactNode }> = ({ w = 'max-w-[260px]', children }) => (
  <div className={`${w} min-w-[120px] whitespace-normal`}>{children}</div>
);

export const PartnershipView: React.FC = () => {
  const { selectedMonths, brandMatches, aggByMonth, theme, filters, exportToCSV } = useFilters();
  const isDark = theme === 'dark';
  const ms = selectedMonths;

  const rows = partnerRows(ms, brandMatches);
  const T = totals(rows);
  const byCh = totalsBy(rows, r => r.channel);
  const byP = totalsBy(rows, r => r.partner);
  const chainNet = ms.reduce((a, m) => a + (aggByMonth[m]?.net || 0), 0);
  const chainTc = ms.reduce((a, m) => a + (aggByMonth[m]?.tc || 0), 0);
  const chainAov = chainTc ? chainNet / chainTc : null;
  const cost = (t: PartnerTotals) => t.cost + t.fee;
  const pctChain = (v: number) => (v && chainNet ? `${formatPercent(v / chainNet, 2)} DT chuỗi` : '');

  /* Danh mục hiện: đối tác áp dụng cho brand đang lọc, hoặc đã phát sinh ở brand đó. */
  const inBrand = (p: PartnerItem) =>
    filters.brand === 'ALL' || !p.brand || /tất cả/i.test(p.brand) || p.brand.includes(filters.brand) || !!byP[p.code];

  /* Kế hoạch doanh thu trong kỳ lọc (danh mục · 4_KE_HOACH). */
  const planBy: Record<string, number> = {};
  (MKT_DATA.partner_plan || []).forEach(r => {
    if (ms.includes(r.month) && r.rev !== null) planBy[r.code] = (planBy[r.code] || 0) + r.rev;
  });

  /* eVoucher trong kỳ lọc: mã PHÁT theo tháng phát hành · mã DÙNG theo tháng sử dụng. */
  const vRows = (MKT_DATA.partner_voucher || []).filter(r =>
    ms.includes(r.month) && (filters.brand === 'ALL' || (r.kind === 'DUNG' ? brandOfStore(r.store) : r.brand) === filters.brand));
  const vBy: Record<string, { issued: number; used: number }> = {};
  vRows.forEach(r => {
    const x = (vBy[r.partner ?? ''] ||= { issued: 0, used: 0 });
    x.issued += r.issued; x.used += r.used;
  });
  const vIssued = vRows.reduce((a, r) => a + r.issued, 0);
  const vUsed = vRows.reduce((a, r) => a + r.used, 0);

  type Row = PartnerItem & { t: PartnerTotals; plan: number | null };
  const mk = (ch: PartnerChannel): Row[] => PARTNERS
    .filter(p => p.channel === ch && inBrand(p))
    .map(p => ({ ...p, t: byP[p.code] ?? emptyTotals(), plan: planBy[p.code] ?? null }))
    .sort((a, b) => b.t.net - a.t.net || a.code.localeCompare(b.code));
  const aggTable = mk('AGGREGATOR');
  const partTable = mk('PARTNER');
  const all = [...aggTable, ...partTable];
  const active = all.filter(r => r.t.bills > 0 || r.t.net > 0);

  /* ── Biểu đồ: doanh thu theo tháng × kênh ─────────────────────────── */
  const barOption: EChartsOption = {
    tooltip: {
      trigger: 'axis', axisPointer: { type: 'shadow' },
      formatter: (ps: any) => {
        const m = ms[ps[0]?.dataIndex];
        const base = aggByMonth[m]?.net || 0;
        let tot = 0;
        let s = `<div class="font-bold text-xs mb-1 border-b border-brand-border pb-1">${ps[0]?.axisValue}</div>`;
        ps.forEach((p: any) => {
          tot += p.value || 0;
          s += `<div class="flex justify-between gap-4 text-xs font-mono py-0.5"><span>${p.marker} ${p.seriesName}</span><b>${formatVND(p.value)}</b></div>`;
        });
        s += `<div class="flex justify-between gap-4 text-xs font-mono pt-1 mt-1 border-t border-brand-border"><span>Tổng · ${base ? formatPercent(tot / base, 2) : '—'} DT chuỗi</span><b>${formatVND(tot)}</b></div>`;
        return s;
      },
    },
    legend: { top: 0, textStyle: { color: '#9E9B93', fontSize: 11 } },
    grid: { top: 35, right: 20, bottom: 25, left: 65 },
    xAxis: {
      type: 'category', data: ms.map(formatMonthLabel),
      axisLine: { lineStyle: { color: '#2A2A33' } },
      axisLabel: { color: isDark ? '#F3F2EE' : '#18181B', fontSize: 11 },
    },
    yAxis: {
      type: 'value',
      axisLabel: { formatter: (v: number) => formatVND(v, 0), color: '#9E9B93', fontSize: 10 },
      splitLine: { lineStyle: { color: '#1F1F26', type: 'dashed' } },
    },
    series: CHANNELS.map(c => ({
      name: c.short, type: 'bar' as const, stack: 'ch', barMaxWidth: 38,
      itemStyle: { color: c.color },
      data: ms.map(m => rows.filter(r => r.month === m && r.channel === c.code).reduce((a, r) => a + r.net, 0)),
    })),
  };

  /* Tên file CSV mang kỳ lọc: mở file ra là biết số của tháng nào, không lẫn với lần xuất trước. */
  const csvPeriod = ms.length ? (ms.length === 1 ? ms[0] : `${ms[0]}_${ms[ms.length - 1]}`) : 'khong_ky';



  const ranked = active.slice().sort((a, b) => a.t.net - b.t.net);
  const rankOption: EChartsOption = {
    tooltip: {
      trigger: 'item',
      formatter: (p: any) => {
        const r = ranked[p.dataIndex];
        const progDesc = r.programs?.length ? offerText(r.programs[0]) : '';
        return `
          <div class="text-xs space-y-1">
            <div class="font-bold text-brand-gold">${r.name}</div>
            ${progDesc ? `<div class="text-[11px] text-brand-muted">${progDesc}</div>` : ''}
            <div class="pt-1 border-t border-brand-border/60 font-mono text-[11px]">
              <div>Doanh thu: <b>${formatVND(r.t.net)}</b> ${T.net ? `(${formatPercent(r.t.net / T.net, 1)})` : ''}</div>
              <div>Số HĐ: <b>${formatNumber(r.t.bills)}</b> HĐ</div>
              <div>Chi phí: <b>${formatVND(cost(r.t))}</b></div>
            </div>
          </div>
        `;
      },
    },
    grid: { top: 10, right: 45, bottom: 20, left: 10, containLabel: true },
    xAxis: {
      type: 'value',
      axisLabel: { formatter: (v: number) => formatVND(v, 0), color: '#9E9B93', fontSize: 10 },
      splitLine: { lineStyle: { color: isDark ? '#1F1F26' : '#EAE7DF', type: 'dashed' } },
    },
    yAxis: {
      type: 'category',
      data: ranked.map(r => r.name),
      axisLabel: {
        color: isDark ? '#F3F2EE' : '#18181B',
        fontSize: 11,
        fontWeight: 500,
        margin: 10,
      },
      axisLine: { lineStyle: { color: isDark ? '#2A2A33' : '#D8D4CA' } },
      axisTick: { show: false },
    },
    series: [{
      type: 'bar',
      barMaxWidth: 16,
      itemStyle: {
        borderRadius: [0, 4, 4, 0],
      },
      data: ranked.map(r => ({
        value: r.t.net,
        itemStyle: {
          color: CHANNEL_META[r.channel]?.color,
          borderRadius: [0, 4, 4, 0],
        },
      })),
      label: {
        show: true,
        position: 'right',
        fontSize: 10,
        color: isDark ? '#9E9B93' : '#6B6963',
        formatter: (p: any) => (T.net ? formatPercent(p.value / T.net, 0) : ''),
      },
    }],
  };

  /* ── Cột dùng chung — gọn: kỳ hạn nằm trong ô tên, AOV + kế hoạch nằm trong ô doanh thu,
        ô chữ dài được xuống dòng (DataTable mặc định giữ mỗi hàng một dòng) ── */
  /* ── Cột dùng chung: Đối tác và Kỳ hạn tách riêng, Doanh thu và AOV tách riêng ── */
  /* ── Cột dùng chung: Đối tác và Kỳ hạn tách riêng, Doanh thu và AOV tách riêng ── */
  const colPartner: Column<Row> = {
    key: 'name', header: 'ĐỐI TÁC',
    width: '180px',
    exportValue: r => ({ 'Mã ĐT': r.code, 'Đối tác': r.name, 'Kênh': r.channel, 'Loại': r.kind ?? '',
      'Brand áp dụng': r.brand ?? '', 'Cửa hàng áp dụng': r.stores ?? '', 'Nguồn số': r.source,
      'Người phụ trách': r.owner ?? '', 'Ghi chú': r.note ?? '' }),
    render: r => (
      <div className="py-1 min-w-[120px] max-w-[200px] whitespace-normal break-words">
        <div className="font-bold text-[13px] leading-tight text-brand-text">{r.name}</div>
      </div>
    ),
  };

  const colTerm: Column<Row> = {
    key: 'term', header: 'KỲ HẠN',
    width: '125px',
    exportValue: r => ({ 'Trạng thái': r.status ?? '', 'Bắt đầu HĐ': r.start ?? '', 'Kết thúc HĐ': r.end ?? '' }),
    render: r => {
      const validStart = r.start && r.start !== '—' && r.start !== '-' ? r.start : null;
      const validEnd = r.end && r.end !== '—' && r.end !== '-' ? r.end : null;
      const dateText = validStart && validEnd ? `${validStart} → ${validEnd}` : validStart ? `Từ ${validStart}` : validEnd ? `Đến ${validEnd}` : null;
      return (
        <div className="space-y-1 py-1 min-w-[105px] whitespace-normal">
          <StatusBadge label={r.status ?? 'Chưa khai'} variant={statusVariant(r.status)} />
          {dateText ? (
            <div className="font-mono text-[10px] text-brand-faint">{dateText}</div>
          ) : (
            <div className="text-[10px] text-brand-faint italic">—</div>
          )}
        </div>
      );
    },
  };

  const colOffer: Column<Row> = {
    key: 'offer', header: 'CHƯƠNG TRÌNH · CƠ CHẾ ƯU ĐÃI',
    width: '280px',
    exportValue: r => ({
      'Số chương trình': r.programs.length,
      'Chương trình · ưu đãi': r.programs.map(g =>
        [g.brand, offerText(g), g.mech, g.start || g.end ? `${g.start ?? '…'} → ${g.end ?? '…'}` : '', g.condition]
          .filter(Boolean).join(' · ')).join(' | '),
      'Campaign ID iPOS': r.programs.map(g => g.cid).filter(Boolean).join(' · '),
      'Tên CTKM trên POS': r.programs.map(g => g.pos_name).filter(Boolean).join(' · '),
    }),
    render: r => r.programs.length ? (
      <div className="max-w-[300px] min-w-[200px] space-y-2 py-1 whitespace-normal break-words">
        {r.programs.map((g, idx) => {
          const validStart = g.start && g.start !== '—' && g.start !== '-' ? g.start : null;
          const validEnd = g.end && g.end !== '—' && g.end !== '-' ? g.end : null;
          const hasDates = validStart || validEnd;
          const dateStr = validStart && validEnd ? `${validStart} → ${validEnd}` : validStart ? `Từ ${validStart}` : validEnd ? `Đến ${validEnd}` : '';
          return (
            <div key={g.prog} className={`text-[11px] leading-snug ${idx > 0 ? 'pt-1.5 border-t border-brand-border/30' : ''}`}>
              <div className="text-brand-text font-medium break-words">
                {g.brand && (
                  <span className={`inline-block mr-1.5 px-1 py-0.2 rounded text-[9px] font-semibold uppercase tracking-wider align-middle ${
                    g.brand === 'TẤT CẢ'
                      ? 'bg-brand-surface border border-brand-border text-brand-muted'
                      : 'bg-brand-gold/15 border border-brand-gold/30 text-brand-gold'
                  }`}>
                    {g.brand}
                  </span>
                )}
                <span>{offerText(g)}</span>
              </div>
              {(g.mech || hasDates || g.condition) && (
                <div className="text-[10px] text-brand-muted mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                  {g.mech && <span className="text-brand-muted font-normal">{g.mech}</span>}
                  {g.mech && (dateStr || g.condition) && <span className="text-brand-faint">·</span>}
                  {dateStr && <span className="font-mono text-brand-faint">{dateStr}</span>}
                  {dateStr && g.condition && <span className="text-brand-faint">·</span>}
                  {g.condition && <span className="text-brand-faint">{g.condition}</span>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    ) : <span className="text-[11px] text-brand-faint italic py-1 inline-block">Chưa khai chương trình</span>,
  };

  const colNetOnly = (withPlan: boolean): Column<Row> => ({
    key: 'net', header: 'DOANH THU', align: 'right',
    exportValue: r => ({
      'Doanh thu (đ)': r.t.net,
      '% DT chuỗi': chainNet ? r.t.net / chainNet : '',
      ...(withPlan ? { 'Kế hoạch DT (đ)': r.plan ?? '', '% đạt kế hoạch': r.plan ? r.t.net / r.plan : '' } : {}),
    }),
    render: r => (
      <div className="text-right font-mono leading-tight py-1 min-w-[90px]">
        <div className="font-bold text-brand-goldLight text-[13px]">{r.t.net ? formatVND(r.t.net) : '—'}</div>
        {r.t.net > 0 && <div className="text-[10px] text-brand-muted mt-0.5">{pctChain(r.t.net)}</div>}
        {withPlan && r.plan ? (
          <div className={`text-[10px] mt-0.5 ${r.t.net >= r.plan ? 'text-status-ok' : 'text-status-bad'}`}>
            KH {formatVND(r.plan)} · đạt {formatPercent(r.t.net / r.plan, 0)}
          </div>
        ) : null}
      </div>
    ),
  });

  const colAov: Column<Row> = {
    key: 'aov', header: 'AOV', align: 'right',
    exportValue: r => ({
      'AOV (đ)': r.t.bills ? r.t.net / r.t.bills : '',
      'AOV vs chuỗi': r.t.bills && chainAov ? r.t.net / r.t.bills / chainAov - 1 : '',
    }),
    render: r => {
      const aov = r.t.bills ? r.t.net / r.t.bills : null;
      const d = aov !== null && chainAov ? aov / chainAov - 1 : null;
      return (
        <div className="text-right font-mono leading-tight py-1 min-w-[80px]">
          <div className="font-semibold text-brand-text">{aov !== null ? formatVND(aov) : '—'}</div>
          {d !== null && (
            <div className={`text-[10px] mt-0.5 font-medium ${d >= 0 ? 'text-status-ok' : 'text-status-bad'}`}>
              {d >= 0 ? '+' : ''}{formatPercent(d, 0)} vs chuỗi
            </div>
          )}
        </div>
      );
    },
  };

  const colCost = (header: string): Column<Row> => ({
    key: 'cost', header, align: 'right',
    exportValue: r => ({
      'Tổng chi phí (đ)': cost(r.t),
      'Ưu đãi NOIRE chịu (đ)': r.t.cost,
      'Phí nền tảng / hợp tác (đ)': r.t.fee,
      'Trong đó phí ƯỚC TÍNH (đ)': r.t.fee_est,
      'Hoa hồng đã trừ trong DT (đ)': r.t.fee_netted,
      '% chi phí / DT': r.t.net ? cost(r.t) / r.t.net : '',
    }),
    render: r => {
      const c = cost(r.t);
      return (
        <div className="text-right font-mono leading-tight py-1 min-w-[90px]">
          <div className="font-bold text-brand-text">{c ? formatVND(c) : '—'}</div>
          {r.t.cost > 0 && r.t.fee > 0 && <div className="text-[10px] text-brand-muted mt-0.5">Ưu đãi {formatVND(r.t.cost)}</div>}
          {r.t.fee > 0 && <div className="text-[10px] text-brand-muted mt-0.5">Phí {formatVND(r.t.fee)}{r.t.fee_est ? '*' : ''}</div>}
          {r.t.fee_netted > 0 && <div className="text-[10px] text-brand-faint mt-0.5">HH {formatVND(r.t.fee_netted)} đã trừ trong DT</div>}
          {c > 0 && r.t.net > 0 && (
            <div className={`text-[10px] mt-0.5 ${c / r.t.net > 0.3 ? 'text-status-bad font-semibold' : 'text-brand-faint'}`}>
              {formatPercent(c / r.t.net)} DT
            </div>
          )}
        </div>
      );
    },
  });

  const colFlags: Column<Row> = {
    key: 'flags', header: 'CẦN XỬ LÝ',
    width: '120px',
    exportValue: r => ({ 'Cần xử lý': r.flags.join(' · '), 'Cách nhận số': r.bases.join(' · '),
      'Tháng đầu': r.first ?? '', 'Tháng cuối': r.last ?? '' }),
    render: r => <div className="max-w-[160px] min-w-[70px] whitespace-normal"><Flags flags={r.flags} /></div>,
  };

  /* ── AGGREGATOR — 8 cột: Đối tác, Kỳ hạn, Cơ chế, Hoa hồng/phí, Booking/HĐ/khách, DOANH THU, AOV, Chi phí, Cần xử lý ── */
  const aggCols: Column<Row>[] = [
    colPartner,
    colTerm,
    colOffer,
    {
      key: 'terms', header: 'HOA HỒNG · PHÍ HĐ',
      width: '150px',
      exportValue: r => ({ 'Hoa hồng nền tảng (%)': r.commission_pct ?? '', 'Phí cố định/tháng (đ)': r.fee_month ?? '',
        'Phí theo': r.fee_unit ?? '', 'Phí mỗi booking/khách (đ)': r.fee_unit_amount ?? '',
        'Ai tài trợ ưu đãi': r.sponsor ?? '', '% NOIRE chịu ưu đãi': r.noire_share,
        'Media quy đổi (đ)': r.media ?? '' }),
      render: r => (
        <div className="space-y-0.5 text-[11px] leading-tight py-1 min-w-[100px] whitespace-normal">
          {r.commission_pct ? (
            <div className="font-semibold text-brand-text">HH {formatPercent(r.commission_pct, 1)}</div>
          ) : null}
          {r.fee_unit_amount ? (
            <div className="font-semibold text-brand-text">
              {formatNumber(r.fee_unit_amount)}đ / {String(r.fee_unit ?? '').replace(/^theo /i, '')}
            </div>
          ) : null}
          {!r.commission_pct && !r.fee_unit_amount ? (
            <div className="text-brand-muted">Không phí HH</div>
          ) : null}
          {r.fee_month ? <div className="text-brand-muted">{formatVND(r.fee_month)} / tháng</div> : null}
          {r.sponsor && <div className="text-[10px] text-brand-faint">Ưu đãi: {r.sponsor}</div>}
        </div>
      ),
    },
    {
      key: 'bills', header: 'BOOKING · HĐ · KHÁCH', align: 'right',
      exportValue: r => ({ 'Hoá đơn': r.t.bills, 'Booking': r.t.bookings, 'Huỷ / không đến': r.t.cancels,
        'Khách': r.t.guests, 'Doanh thu tự thống kê (đ)': r.t.net_self }),
      render: r => (
        <div className="text-right font-mono leading-tight py-1 min-w-[90px]">
          <div className="font-bold text-brand-text">{r.t.bills ? `${formatNumber(r.t.bills)} HĐ` : '—'}</div>
          {r.t.bookings > 0 && (
            <div className="text-[10px] text-brand-muted">
              {formatNumber(r.t.bookings)} booking{r.t.cancels ? ` · huỷ ${formatPercent(r.t.cancels / r.t.bookings, 0)}` : ''}
            </div>
          )}
          {r.t.guests > 0 && <div className="text-[10px] text-brand-muted">{formatNumber(r.t.guests)} khách</div>}
        </div>
      ),
    },
    colNetOnly(false),
    colAov,
    colCost('CHI PHÍ'),
    colFlags,
  ];

  /* ── PARTNER — 9 cột: Đối tác, Kỳ hạn, Cơ chế, Phí/CK, Mã phát→dùng, HĐ/khách, DOANH THU, AOV, Ưu đãi, Cần xử lý ── */
  const partCols: Column<Row>[] = [
    colPartner,
    colTerm,
    colOffer,
    {
      key: 'terms', header: 'PHÍ HĐ · CHIẾT KHẤU',
      width: '160px',
      exportValue: r => ({ 'Phí hợp tác (đ)': r.fee ?? '', 'Kỳ tính phí': r.fee_period ?? '',
        'Chiết khấu cho đối tác (%)': r.commission_pct ?? '', '% NOIRE chịu ưu đãi': r.noire_share,
        'Media quy đổi (đ)': r.media ?? '' }),
      render: r => (
        <div className="space-y-0.5 text-[11px] leading-tight py-1 min-w-[110px] whitespace-normal">
          <div className="font-medium text-brand-text">
            {r.fee ? `${formatVND(r.fee)}${r.fee_period ? ` · ${r.fee_period.toLowerCase()}` : ''}` : 'Không phí HĐ'}
          </div>
          <div className="text-brand-muted">
            {r.commission_pct ? `CK đối tác ${formatPercent(r.commission_pct, 1)}` : 'Không CK'}
          </div>
          <div className="text-[10px] text-brand-faint">NOIRE chịu {formatPercent(r.noire_share, 0)} ưu đãi</div>
        </div>
      ),
    },
    {
      key: 'codes', header: 'MÃ PHÁT → DÙNG', align: 'right',
      exportValue: r => ({ 'Mã phát (kỳ lọc)': vBy[r.code]?.issued ?? '', 'Mã đã dùng (kỳ lọc)': vBy[r.code]?.used ?? '',
        'Tỷ lệ dùng mã': vBy[r.code]?.issued ? (vBy[r.code]!.used / vBy[r.code]!.issued) : '' }),
      render: r => {
        const v = vBy[r.code];
        if (!v || (!v.issued && !v.used)) return <span className="font-mono text-brand-faint py-1 inline-block">—</span>;
        const rate = v.issued ? v.used / v.issued : null;
        return (
          <div className="text-right font-mono leading-tight py-1 min-w-[90px]">
            <div className="font-medium text-brand-text">{formatNumber(v.issued)} → {formatNumber(v.used)}</div>
            {rate !== null && (
              <div className="mt-0.5">
                <StatusBadge variant={rate < 0.05 ? 'bad' : rate < 0.2 ? 'warning' : 'ok'} label={formatPercent(rate, 1)} />
              </div>
            )}
          </div>
        );
      },
    },
    {
      key: 'bills', header: 'HĐ · KHÁCH', align: 'right',
      exportValue: r => ({ 'Hoá đơn': r.t.bills, 'Khách': r.t.guests }),
      render: r => (
        <div className="text-right font-mono leading-tight py-1 min-w-[80px]">
          <div className="font-bold text-brand-text">{r.t.bills ? formatNumber(r.t.bills) : '—'}</div>
          {r.t.guests > 0 && <div className="text-[10px] text-brand-muted">{formatNumber(r.t.guests)} khách</div>}
        </div>
      ),
    },
    colNetOnly(true),
    colAov,
    colCost('ƯU ĐÃI NOIRE CHỊU'),
    colFlags,
  ];

  /* ── eVoucher theo chiến dịch (toàn log) ──────────────────────────── */
  const camps = (MKT_DATA.partner_campaigns || []).filter(c => filters.brand === 'ALL' || c.brand === filters.brand);
  type CRow = (typeof camps)[0];
  const campCols: Column<CRow>[] = [
    {
      key: 'campaign', header: 'CHIẾN DỊCH',
      exportValue: c => ({ 'Campaign ID': c.cid ?? '', 'Đối tác': PARTNER_BY_CODE[c.partner ?? '']?.name ?? c.partner ?? '',
        'Mã ĐT': c.partner ?? '', 'Brand': c.brand ?? '', 'Tháng phát': c.first ?? '', 'Hết hạn': c.expire ?? '',
        'Tháng dùng gần nhất': c.last_use ?? '' }),
      render: c => (
        <div className="leading-tight py-1 min-w-[140px]">
          <div className="font-semibold text-brand-text">{PARTNER_BY_CODE[c.partner ?? '']?.name ?? c.partner ?? '—'}</div>
          <div className="text-[10px] text-brand-faint mt-0.5">
            <span className="font-mono text-brand-gold">{c.cid}</span> · {c.brand ?? '—'} · phát {c.first ? formatMonthLabel(c.first) : '—'} · hạn {c.expire ?? '—'}
          </div>
        </div>
      ),
    },
    {
      key: 'offer', header: 'ƯU ĐÃI',
      exportValue: c => ({ 'Ưu đãi': c.offer ?? '', 'Mã chương trình': c.prog ?? '' }),
      render: c => <div className="max-w-[260px] whitespace-normal text-[11px] py-1 leading-snug">{c.offer ?? '—'}</div>,
    },
    {
      key: 'used', header: 'PHÁT → DÙNG', align: 'right',
      exportValue: c => ({ 'Mã phát': c.issued, 'Mã đã dùng': c.used, 'Tỷ lệ dùng': c.use_rate ?? '', 'Mã tạm khoá': c.locked }),
      render: c => (
        <div className="text-right font-mono leading-tight py-1 min-w-[90px]">
          <div className="font-semibold text-brand-text">{formatNumber(c.issued)} → {formatNumber(c.used)}</div>
          {c.use_rate !== null && (
            <div className="mt-0.5">
              <StatusBadge variant={c.use_rate < 0.05 ? 'bad' : c.use_rate < 0.2 ? 'warning' : 'ok'} label={formatPercent(c.use_rate, 1)} />
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'gross', header: 'HĐ TRƯỚC GIẢM · TIỀN GIẢM', align: 'right',
      exportValue: c => ({ 'HĐ trước giảm (đ)': c.gross, 'Tiền giảm (đ)': c.disc }),
      render: c => (
        <div className="text-right font-mono leading-tight py-1 min-w-[110px]">
          <div className="font-bold text-brand-text">{c.gross ? formatVND(c.gross) : '—'}</div>
          <div className="text-[10px] text-brand-muted mt-0.5">{c.disc ? `giảm ${formatVND(c.disc)}` : ''}</div>
        </div>
      ),
    },
  ];

  const chCard = (ch: PartnerChannel) => {
    const t = byCh[ch] ?? emptyTotals();
    const meta = CHANNEL_META[ch];
    return (
      <MetricCard
        key={ch}
        label={meta?.short ?? ch}
        subLabel={meta?.label}
        value={formatVND(t.net)}
        customDeltaText={`${formatNumber(t.bills)} HĐ · ${T.net ? formatPercent(t.net / T.net, 0) : '—'} đối tác${t.net_self ? ` · ${formatVND(t.net_self)} ngoài POS` : ''}`}
      />
    );
  };

  return (
    <div className="space-y-5 p-4 sm:p-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div>
        <span className="text-[10px] font-extrabold uppercase tracking-widest text-brand-gold">ĐỐI TÁC MANG LẠI GÌ</span>
        <h2 className="text-xl font-extrabold text-brand-text font-display mt-0.5">M9 · Partnership — Aggregator + Partner</h2>
        <p className="text-xs text-brand-muted mt-1">
          {CHANNELS.map(c => `${c.short}: ${c.label.split('·').slice(1).join('·').trim() || c.label}`).join(' — ')}.
          {' '}Theo dõi hiệu quả doanh thu, chi phí ưu đãi và hoa hồng đối tác theo thời gian thực.
        </p>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <MetricCard
          label="Doanh Thu Đối Tác"
          subLabel="Aggregator + Partner"
          value={formatVND(T.net)}
          variant="hero"
          customDeltaText={`${chainNet ? formatPercent(T.net / chainNet, 2) : '—'} DT chuỗi · ${formatNumber(T.bills)} HĐ`}
        />
        {CHANNELS.map(c => chCard(c.code))}
        <MetricCard
          label="Chi Phí Đối Tác"
          subLabel="Ưu đãi NOIRE chịu + phí hợp tác"
          value={formatVND(cost(T))}
          variant={T.net && cost(T) / T.net > 0.3 ? 'warning' : 'default'}
          customDeltaText={`${T.net ? formatPercent(cost(T) / T.net) : '—'} DT đối tác · Ưu đãi ${formatVND(T.cost)} · Phí ${formatVND(T.fee)}${T.fee_est ? ` (ước tính ${formatVND(T.fee_est)})` : ''}`}
        />
        <MetricCard
          label="Mã eVoucher Đối Tác"
          subLabel="Phát → Dùng trong kỳ"
          value={vIssued || vUsed ? `${formatNumber(vUsed)} / ${formatNumber(vIssued)}` : '—'}
          variant={vIssued && vUsed / vIssued < 0.05 ? 'warning' : 'default'}
          customDeltaText={vIssued ? `Tỷ lệ dùng ${formatPercent(vUsed / vIssued, 1)} · ${active.length}/${all.length} đối tác phát sinh` : `${active.length}/${all.length} đối tác phát sinh`}
        />
      </div>

      {/* Biểu đồ */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card title="Doanh Thu Đối Tác Theo Tháng" chip="THEO THÁNG" hero className="lg:col-span-2">
          <EChartWrapper option={barOption} height={260} />
        </Card>
        <Card title="Cơ Cấu Theo Đối Tác" description="Doanh thu kỳ lọc · màu theo kênh · nhãn = % tổng đối tác" chip="XẾP HẠNG">
          {ranked.length ? <EChartWrapper option={rankOption} height={260} /> : <p className="py-10 text-center text-xs text-brand-muted">Không có số đối tác trong kỳ lọc</p>}
        </Card>
      </div>

      {/* AGGREGATOR */}
      <Card
        title="Aggregator"
        hero
        headerAction={
          <button
            onClick={() => exportToCSV(`Noire_M9_Aggregator_${csvPeriod}`, columnsToRows(aggCols, aggTable))}
            className="flex items-center gap-1.5 rounded-lg border border-brand-border bg-brand-surface/60 hover:bg-brand-surface px-2.5 py-1 text-xs font-semibold text-brand-muted hover:border-brand-gold/50 hover:text-brand-gold transition-all"
            title="Xuất bảng Aggregator ra CSV"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Xuất CSV ({aggTable.length})</span>
          </button>
        }
      >
        <DataTable columns={aggCols} data={aggTable} searchable={false} pageSize={10} />
      </Card>

      {/* PARTNER */}
      <Card
        title="Partner — Ngân Hàng · Ví · Thẻ"
        hero
        headerAction={
          <button
            onClick={() => exportToCSV(`Noire_M9_Partner_${csvPeriod}`, columnsToRows(partCols, partTable))}
            className="flex items-center gap-1.5 rounded-lg border border-brand-border bg-brand-surface/60 hover:bg-brand-surface px-2.5 py-1 text-xs font-semibold text-brand-muted hover:border-brand-gold/50 hover:text-brand-gold transition-all"
            title="Xuất bảng Partner ra CSV"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Xuất CSV ({partTable.length})</span>
          </button>
        }
      >
        <DataTable columns={partCols} data={partTable} searchable={false} pageSize={10} />
      </Card>

      {/* eVoucher */}
      <Card
        title="eVoucher Đối Tác Theo Chiến Dịch"
        headerAction={
          camps.length ? (
            <button
              onClick={() => exportToCSV('Noire_M9_eVoucher_theo_chien_dich', columnsToRows(campCols, camps))}
              className="flex items-center gap-1.5 rounded-lg border border-brand-border bg-brand-surface/60 hover:bg-brand-surface px-2.5 py-1 text-xs font-semibold text-brand-muted hover:border-brand-gold/50 hover:text-brand-gold transition-all"
              title="Xuất danh sách eVoucher ra CSV"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Xuất CSV ({camps.length})</span>
            </button>
          ) : undefined
        }
      >
        {camps.length
          ? <DataTable columns={campCols} data={camps} searchable={false} pageSize={6} />
          : <p className="py-6 text-center text-xs text-brand-muted">Chưa có log eVoucher</p>}
      </Card>

      <p className="text-[10px] text-brand-faint">
        * Tỷ lệ % DT chuỗi được tính trên tổng doanh thu chuỗi {formatVND(chainNet)} ({ms.length ? `${formatMonthLabel(ms[0])} → ${formatMonthLabel(ms[ms.length - 1])}` : '—'} theo phạm vi đang lọc).
      </p>
    </div>
  );
};

/* Mã cửa hàng → brand (dim_store), để lọc lượt dùng eVoucher theo brand nơi khách dùng mã. */
function brandOfStore(store: string | null): string | null {
  return store ? HUB_DATA.stores[store]?.brand ?? null : null;
}
