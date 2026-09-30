import React from 'react';
import type { Campaign, MetricRow, UnifiedRow } from '../../types/campaign';
import { CAMPAIGN } from '../../data/campaign';
import { formatVND, formatNumber, formatPercent } from '../../utils/formatters';

/* BẢNG CHUẨN M7 — Nền · Target · Thực tế · % đạt (dùng chung M7.1 "Thực tế" và M7.2 "Chi tiết").
   Mọi số đã được tools/promo_eval.py tính; tên/đơn vị/thứ tự dòng lấy từ data_contract.json → $metrics.rows
   (CAMPAIGN.taxonomy.metrics). Màn hình KHÔNG tự cộng trừ nhân chia số nghiệp vụ.
   Đặc tả: docs/modules/M7_QUY_CHUAN.md */

const dmy = (s: string | null | undefined) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(2, 4)}` : '—');

const fmt = (row: MetricRow, v: number | null | undefined): string => {
  if (v === null || v === undefined) return CAMPAIGN.taxonomy.metrics.empty.na;
  if (row.unit === 'count') return formatNumber(v);
  if (row.unit === 'x') return `${formatNumber(v, 2)}×`;
  if (row.unit === 'pct') return formatPercent(v, 1);
  return formatVND(v);
};

/** màu % đạt: chỉ tiêu "càng cao càng tốt" xanh ≥ 100%; chi phí đảo chiều (dùng ≤ ngân sách là tốt) */
const tone = (dir: MetricRow['dir'], p: number | null): string => {
  if (p === null) return '';
  if (dir === 'down') return p <= 1 ? 'text-status-ok' : p <= 1.2 ? 'text-status-warning' : 'text-status-bad';
  return p >= 1 ? 'text-status-ok' : p >= 0.8 ? 'text-status-warning' : 'text-status-bad';
};

export const PromoScoreTable: React.FC<{ c: Campaign }> = ({ c }) => {
  const M = CAMPAIGN.taxonomy.metrics;
  const u = c.u;
  if (!u) {
    return (
      <div className="rounded-lg border border-dashed border-brand-border p-4 text-xs text-brand-muted">
        Chưa có bảng chấm — {c.reason ?? 'chương trình chưa có hoá đơn gắn CTKM hoặc chưa ước tính được %cannib'}.
      </div>
    );
  }
  const est = M.empty.estimate;
  const planTxt = u.plan === 'M71' ? `kế hoạch M7.1 ${u.plan_id}` : u.plan === 'Q3' ? `kế hoạch Q3 ${u.plan_id} (quy về mẫu M7.1)` : 'chưa có kế hoạch';

  const cell = (row: MetricRow, r: UnifiedRow, k: 'n' | 't' | 'a') => {
    const v = r[k];
    if (k === 'a' && r.miss && v === null) {
      return <span className="text-status-warning" title="Có kế hoạch nhưng chưa khai chi phí thực — EBITDA tạm dùng số kế hoạch">{M.empty.undeclared}</span>;
    }
    if (v === null || v === undefined) return <span className="text-brand-faint">{M.empty.na}</span>;
    return <>{k === 'a' && r.est ? `${est} ` : ''}{fmt(row, v)}</>;
  };

  const pctCell = (row: MetricRow, r: UnifiedRow) => {
    if (r.est) return <span className="text-brand-faint">{M.empty.na}</span>;      // ≈ : % chỉ lặp lại DT thực ÷ DT target
    if (row.nopct || row.dir === 'memo' || row.dir === 'neutral') return <span className="text-brand-faint">{M.empty.na}</span>;
    if (r.p !== null) return <span className={`font-bold ${tone(row.dir, r.p)}`}>{formatPercent(r.p, 0)}</span>;
    // Target ≤ 0 (kế hoạch tự biết lỗ): % không có nghĩa → hiện chênh lệch tuyệt đối
    if (row.diff && r.d !== null) return <span className={`font-bold ${r.d >= 0 ? 'text-status-ok' : 'text-status-bad'}`} title="Target ≤ 0 nên không tính %; hiện chênh lệch Thực tế − Target">Δ {r.d > 0 ? '+' : ''}{formatVND(r.d)}</span>;
    return <span className="text-brand-faint">{M.empty.na}</span>;
  };

  const ck = u.check;
  return (
    <div className="rounded-xl border border-brand-gold/40 p-3 text-xs">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-[11px] font-bold uppercase tracking-wider text-brand-gold">Target · Thực tế — hoá đơn gắn CTKM</span>
        <span className="text-[10px] text-brand-muted">
          {planTxt}{u.locked_at ? ` · khoá ${dmy(u.locked_at)}` : ''}
        </span>
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${u.basis === 'DO' ? 'bg-status-okBg text-status-ok' : 'bg-status-warningBg text-status-warning'}`}
          title={u.basis === 'DO' ? 'Tăng thêm dùng %cannib ĐO từ TC cửa hàng (đủ tin cậy)' : `Tăng thêm ≈ ước tính theo %cannib của kế hoạch. Lý do không đo được: ${ck.why.join('; ') || '—'}`}>
          {u.basis === 'DO' ? 'ĐO' : `${est} ƯỚC TÍNH`}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-[11px]">
          <thead>
            <tr className="text-brand-muted">
              <th className="text-left font-semibold">Chỉ số</th>
              <th className="text-right font-semibold">Target</th>
              <th className="text-right font-semibold">Thực tế</th>
              <th className="text-right font-semibold" title="Thực tế ÷ Target. Chi phí: dùng ÷ ngân sách (≤ 100% là tốt)">% đạt</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {M.groups.map(g => (
              <React.Fragment key={g.code}>
                <tr className="border-t border-brand-border/70">
                  <td colSpan={4} className="pt-2 pb-0.5 font-sans">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-brand-gold">{g.label}</span>
                    <span className="ml-2 text-[10px] font-normal normal-case text-brand-faint">{g.note}</span>
                  </td>
                </tr>
                {M.rows.filter(r => r.group === g.code && !r.hide).map(row => {
                  const r = u.rows[row.code];
                  if (!r) return null;
                  const empty = (v: number | null) => v === null || v === 0;
                  // dòng chi phí trống cả Target lẫn Thực tế (và không phải "chưa khai") → ẩn cho gọn
                  if (['disc', 'ads', 'kol', 'posm', 'other', 'cost'].includes(row.code) && empty(r.t) && empty(r.a) && !r.miss) return null;
                  const memo = row.dir === 'memo';
                  return (
                    <tr key={row.code} className={`border-t border-brand-border/40 ${memo ? 'italic text-brand-muted' : ''}`}>
                      <td className={`py-1 font-sans ${row.bold ? 'font-bold' : ''}`} title={row.formula}>{row.label}</td>
                      <td className="text-right">{cell(row, r, 't')}</td>
                      <td className={`text-right ${row.bold ? 'font-bold' : ''}`}>{cell(row, r, 'a')}</td>
                      <td className="text-right">{pctCell(row, r)}</td>
                    </tr>
                  );
                })}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-2 space-y-1 text-[10px] text-brand-muted">
        <div>
          %cannib (khách vốn sẽ đến): kế hoạch <b>{formatPercent(u.cannib.plan, 0)}</b> · đo <b>{formatPercent(u.cannib.act, 0)}</b> · dùng <b>{formatPercent(u.cannib.used, 0)}</b> ({u.basis === 'DO' ? 'đo' : `${est} theo kế hoạch`}).
        </div>
        <div className={ck.reliable ? '' : 'text-status-warning'}>
          Kiểm chứng cửa hàng: CT = {formatPercent(ck.share, 1)} DT cửa hàng · TC cửa hàng {formatNumber(ck.store_tc_exp)} → {formatNumber(ck.store_tc_act)}
          {' — '}{ck.reliable ? 'đủ tin cậy để đo %cannib.' : 'không đủ tin cậy để kết luận.'}
        </div>
        {(u.flags.length > 0 || ck.why.length > 0 || u.breakeven_rev !== null) && (
          <details>
            <summary className="cursor-pointer text-brand-gold">Ghi chú ({u.flags.length + (u.breakeven_rev !== null ? 1 : 0) + (ck.why.length ? 1 : 0)})</summary>
            <div className="mt-1 space-y-0.5">
              {ck.why.length > 0 && <div>• Không đo được %cannib vì: {ck.why.join('; ')}.</div>}
              {u.breakeven_rev !== null && <div>• Hoà vốn (EBITDA = 0) khi DT CTKM ≥ {formatVND(u.breakeven_rev)} với %cannib đang dùng.</div>}
              {u.flags.map((f, i) => <div key={i}>• {f}</div>)}
            </div>
          </details>
        )}
      </div>
    </div>
  );
};
