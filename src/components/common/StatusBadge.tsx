import React from 'react';

export type BadgeVariant = 
  | 'ok' 
  | 'warning' 
  | 'bad' 
  | 'neutral' 
  | 'brand-ncb' 
  | 'brand-ndc' 
  | 'brand-njfb'
  | 'nature-comm'
  | 'nature-int'
  | 'nature-part'
  | 'nature-loy';

interface StatusBadgeProps {
  label: string;
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  label,
  variant = 'neutral',
  size = 'sm',
  className = '',
}) => {
  const getStyles = () => {
    switch (variant) {
      case 'ok':
        return 'bg-status-okBg text-status-ok border-status-ok/30';
      case 'warning':
        return 'bg-status-warningBg text-status-warning border-status-warning/30';
      case 'bad':
        return 'bg-status-badBg text-status-bad border-status-bad/30';
      case 'brand-ncb':
        return 'bg-[#AE8966]/15 text-[#DFBF7A] border-[#AE8966]/40';
      case 'brand-ndc':
        return 'bg-[#82846C]/20 text-[#A3A68B] border-[#82846C]/40';
      case 'brand-njfb':
        return 'bg-[#C28B4B]/15 text-[#E0A865] border-[#C28B4B]/40';
      case 'nature-comm':
        return 'bg-status-okBg text-status-ok border-status-ok/30';
      case 'nature-int':
        return 'bg-status-badBg text-status-bad border-status-bad/30';
      case 'nature-part':
        return 'bg-status-warningBg text-status-warning border-status-warning/30';
      case 'nature-loy':
        return 'bg-[#82846C]/20 text-[#D6D3CA] border-[#82846C]/30';
      case 'neutral':
      default:
        return 'bg-brand-surface text-brand-muted border-brand-border';
    }
  };

  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded font-semibold border ${sizeClasses} ${getStyles()} ${className}`}
    >
      {label}
    </span>
  );
};
