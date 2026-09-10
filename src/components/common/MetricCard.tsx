import React from 'react';
import { TrendingUp, TrendingDown, Minus, AlertCircle } from 'lucide-react';
import { calculateDelta } from '../../utils/formatters';

interface MetricCardProps {
  label: string;
  subLabel?: string;
  value: string | number;
  unit?: string;
  prevValue?: number | null;
  curRawValue?: number | null;
  customDeltaText?: string;
  isFlagged?: boolean;
  flagMessage?: string;
  icon?: React.ReactNode;
  variant?: 'default' | 'hero' | 'warning' | 'critical';
}

export const MetricCard: React.FC<MetricCardProps> = ({
  label,
  subLabel,
  value,
  unit,
  prevValue,
  curRawValue,
  customDeltaText,
  isFlagged,
  flagMessage,
  icon,
  variant = 'default',
}) => {
  const delta = (curRawValue != null && prevValue != null) 
    ? calculateDelta(curRawValue, prevValue) 
    : null;

  const isCritical = variant === 'critical' || isFlagged;

  return (
    <div
      className={`relative overflow-hidden rounded-xl p-4 transition-all duration-200 ${
        isCritical
          ? 'bg-status-badBg/20 border border-status-bad/40 shadow-lg shadow-status-bad/5'
          : variant === 'hero'
          ? 'glass-card border-brand-gold/40 shadow-glow-sm'
          : 'glass-panel hover:border-brand-borderLight'
      }`}
    >
      <div className="flex items-start justify-between">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-brand-muted">
            {label}
          </span>
          {subLabel && (
            <p className="mt-0.5 font-mono text-[10px] text-brand-faint">
              {subLabel}
            </p>
          )}
        </div>
        {icon && <div className="text-brand-muted/70">{icon}</div>}
      </div>

      <div className="my-2.5 flex items-baseline gap-1.5">
        <span className="text-2xl font-extrabold tracking-tight text-brand-text font-display">
          {value}
        </span>
        {unit && (
          <span className="text-xs font-semibold text-brand-muted">
            {unit}
          </span>
        )}
      </div>

      <div className="flex items-center justify-between text-[11px]">
        {customDeltaText ? (
          <div className="flex items-center gap-1 font-medium text-brand-muted">
            <span>{customDeltaText}</span>
          </div>
        ) : delta && delta.val != null ? (
          <div
            className={`flex items-center gap-1 font-semibold ${
              delta.trend === 'up'
                ? 'text-status-ok'
                : delta.trend === 'down'
                ? 'text-status-bad'
                : 'text-brand-muted'
            }`}
          >
            {delta.trend === 'up' && <TrendingUp className="h-3 w-3" />}
            {delta.trend === 'down' && <TrendingDown className="h-3 w-3" />}
            {delta.trend === 'neutral' && <Minus className="h-3 w-3" />}
            <span>{delta.text}</span>
            <span className="text-[10px] font-normal text-brand-faint">vs kỳ trước</span>
          </div>
        ) : (
          <span className="text-brand-faint text-[10px]">—</span>
        )}

        {isFlagged && flagMessage && (
          <div className="flex items-center gap-1 text-[10px] font-medium text-status-bad">
            <AlertCircle className="h-3 w-3" />
            <span>{flagMessage}</span>
          </div>
        )}
      </div>
    </div>
  );
};
