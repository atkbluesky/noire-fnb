import React from 'react';

interface CardProps {
  title: string;
  description?: string;
  chip?: string;
  chipColor?: string;
  children: React.ReactNode;
  hero?: boolean;
  className?: string;
  headerAction?: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({
  title,
  description,
  chip,
  chipColor,
  children,
  hero,
  className = '',
  headerAction,
}) => {
  return (
    <div
      className={`relative rounded-xl transition-all duration-200 ${
        hero
          ? 'glass-card border-brand-gold/30 shadow-card p-5'
          : 'glass-panel p-4 hover:border-brand-borderLight'
      } ${className}`}
    >
      <div className="mb-3 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold text-brand-text font-display flex items-center gap-2">
            {title}
          </h3>
          {description && (
            <p className="mt-0.5 text-xs text-brand-muted leading-relaxed">
              {description}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {chip && (
            <span
              className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider border ${
                chipColor || 'border-brand-border bg-brand-surface text-brand-sand'
              }`}
            >
              {chip}
            </span>
          )}
          {headerAction}
        </div>
      </div>

      <div className="relative">{children}</div>
    </div>
  );
};
