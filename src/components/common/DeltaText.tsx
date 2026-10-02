import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

/**
 * Quy chuẩn QT2 (AGENTS.md) cho phép so sánh nằm NGOÀI phần delta tự động của MetricCard:
 * dòng chữ trong customDeltaText, ô bảng, khối tóm tắt.
 *   Tăng      → TrendingUp   + xanh `text-status-ok`
 *   Giảm      → TrendingDown + đỏ   `text-status-bad`
 *   Không đổi → Minus        + xám  (|Δ| < 0,01%, cùng ngưỡng với calculateDelta)
 *   Không so được → "—"
 * `inverse` dành cho chỉ số càng thấp càng tốt (CPA, CPL, CPM, % huỷ…): icon vẫn theo hướng thật, màu đảo.
 */
interface DeltaTextProps {
  /** Biến động — dấu quyết định hướng. Là tỷ lệ (0.053 = +5,3%) khi không truyền `text`. */
  change: number | null | undefined;
  /** Chữ hiển thị thay cho % mặc định, vd. "+492" hay "+2%". */
  text?: React.ReactNode;
  /** Nhãn kỳ / mốc so sánh, vd. "vs T8/26". */
  label?: React.ReactNode;
  inverse?: boolean;
  className?: string;
  iconClassName?: string;
}

export const DeltaText: React.FC<DeltaTextProps> = ({
  change,
  text,
  label,
  inverse = false,
  className = '',
  iconClassName = 'h-3 w-3',
}) => {
  const labelEl = label != null && label !== '' && (
    <span className="text-[10px] font-normal text-brand-faint">{label}</span>
  );
  if (change == null || !Number.isFinite(change)) {
    return (
      <span className={`inline-flex flex-wrap items-center gap-1 text-brand-faint ${className}`}>
        <span>—</span>
        {labelEl}
      </span>
    );
  }
  const dir = Math.abs(change) < 0.0001 ? 'flat' : change > 0 ? 'up' : 'down';
  const color = dir === 'flat'
    ? 'text-brand-muted'
    : (dir === 'up') !== inverse ? 'text-status-ok' : 'text-status-bad';
  const Icon = dir === 'up' ? TrendingUp : dir === 'down' ? TrendingDown : Minus;
  const shown = text ?? `${dir === 'up' ? '+' : dir === 'down' ? '-' : ''}${(Math.abs(change) * 100).toFixed(1)}%`;
  return (
    <span className={`inline-flex flex-wrap items-center gap-1 font-semibold ${color} ${className}`}>
      <Icon className={`flex-shrink-0 ${iconClassName}`} />
      <span>{shown}</span>
      {labelEl}
    </span>
  );
};
