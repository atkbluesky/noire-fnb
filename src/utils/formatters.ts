/**
 * Tiện ích định dạng số, tiền tệ VNĐ, tỷ lệ % và so sánh
 */

export function formatVND(x: number | null | undefined, decimals?: number): string {
  if (x == null || isNaN(x)) return '—';
  const val = +x;
  if (Math.abs(val) >= 1e9) {
    return (val / 1e9).toFixed(decimals ?? 2) + ' tỷ';
  }
  if (Math.abs(val) >= 1e6) {
    return (val / 1e6).toFixed(decimals ?? 1) + ' tr';
  }
  if (Math.abs(val) >= 1e3) {
    return (val / 1e3).toFixed(0) + ' k';
  }
  return val.toFixed(0);
}

export function formatNumber(x: number | null | undefined, maxDecimals: number = 0): string {
  if (x == null || isNaN(x)) return '—';
  return (+x).toLocaleString('vi-VN', { maximumFractionDigits: maxDecimals });
}

export function formatPercent(x: number | null | undefined, decimals: number = 1): string {
  if (x == null || isNaN(x)) return '—';
  return ((+x) * 100).toFixed(decimals) + '%';
}

export function formatMonthLabel(m: string): string {
  if (!m) return '—';
  // e.g. "2026-08" -> "T8/26"
  const parts = m.split('-');
  if (parts.length < 2) return m;
  return `T${parseInt(parts[1], 10)}/${parts[0].slice(2)}`;
}

export function calculateDelta(cur: number | null | undefined, prev: number | null | undefined): {
  val: number | null;
  text: string;
  trend: 'up' | 'down' | 'neutral';
} {
  if (cur == null || prev == null || !isFinite(prev) || prev === 0) {
    return { val: null, text: '—', trend: 'neutral' };
  }
  const d = (cur - prev) / Math.abs(prev);
  const pctText = (Math.abs(d) * 100).toFixed(1) + '%';
  if (d > 0.0001) {
    return { val: d, text: `+${pctText}`, trend: 'up' };
  } else if (d < -0.0001) {
    return { val: d, text: `-${pctText}`, trend: 'down' };
  }
  return { val: 0, text: '0.0%', trend: 'neutral' };
}
