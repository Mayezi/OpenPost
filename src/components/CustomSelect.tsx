import React, { useState, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown, Check } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
  sublabel?: string;
  colorDot?: string;
  textClassName?: string;
  badge?: string;
}

interface CustomSelectProps {
  value: string;
  options: SelectOption[];
  onChange: (nextValue: string) => void;
  prefixLabel?: string;
  icon?: React.ReactNode;
  align?: 'left' | 'right';
  size?: 'sm' | 'md';
  variant?: 'default' | 'ghost' | 'method';
  minWidth?: number;
  className?: string;
}

export const CustomSelect: React.FC<CustomSelectProps> = ({
  value,
  options,
  onChange,
  prefixLabel,
  icon,
  align = 'left',
  size = 'sm',
  variant = 'default',
  minWidth = 180,
  className = '',
}) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value) || options[0];

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const paddingClass =
    size === 'md' ? 'px-3.5 py-2 text-xs' : 'px-2.5 py-1.5 text-xs';

  return (
    <div ref={containerRef} className={`relative inline-flex ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`inline-flex items-center justify-between gap-2 font-medium zp-surface-transition whitespace-nowrap shrink-0 focus:outline-none ${paddingClass} ${
          variant === 'ghost'
            ? 'rounded-lg hover:bg-black/5 dark:hover:bg-white/5'
            : variant === 'method'
            ? 'rounded-l-[9px] border-r px-3.5 py-2.5 h-full'
            : 'rounded-lg border'
        }`}
        style={{
          backgroundColor:
            variant === 'ghost'
              ? open
                ? 'var(--zp-bg-elevated)'
                : 'transparent'
              : variant === 'method'
              ? 'var(--zp-bg-surface)'
              : open
              ? 'var(--zp-bg-elevated)'
              : 'var(--zp-bg-surface)',
          borderColor:
            variant === 'ghost'
              ? 'transparent'
              : open && variant !== 'method'
              ? 'var(--zp-accent)'
              : 'var(--zp-border)',
          color: 'var(--zp-text-primary)',
        }}
      >
        <div className="inline-flex items-center gap-1.5 min-w-0">
          {icon && (
            <span className="shrink-0" style={{ color: 'var(--zp-accent)' }}>
              {icon}
            </span>
          )}
          {prefixLabel && (
            <span className="opacity-70" style={{ color: 'var(--zp-text-secondary)' }}>
              {prefixLabel}
            </span>
          )}
          {selected?.colorDot && (
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: selected.colorDot }}
            />
          )}
          <span
            className={`truncate ${
              variant === 'method' ? 'font-mono-tabular font-bold tracking-tight' : ''
            } ${selected?.textClassName || ''}`}
          >
            {selected?.label || value}
          </span>
        </div>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          className="shrink-0 opacity-60"
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </motion.span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 3, scale: 0.97 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            style={{
              minWidth: `${minWidth}px`,
              backgroundColor: 'var(--zp-bg-surface)',
              borderColor: 'var(--zp-border)',
              color: 'var(--zp-text-primary)',
            }}
            className={`absolute z-50 top-full mt-1.5 rounded-xl border p-1.5 zp-popover-shadow max-h-80 overflow-y-auto ${
              align === 'right' ? 'right-0' : 'left-0'
            }`}
          >
            {options.map((opt) => {
              const isSelected = opt.value === value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                  className="w-full text-left flex items-center justify-between gap-3 px-2.5 py-2 rounded-lg text-xs transition-colors"
                  style={{
                    backgroundColor: isSelected ? 'var(--zp-accent-soft)' : 'transparent',
                    color: isSelected ? 'var(--zp-accent)' : 'var(--zp-text-primary)',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.backgroundColor = 'var(--zp-bg-elevated)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }
                  }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {opt.colorDot && (
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0 border border-black/10 dark:border-white/10"
                        style={{ backgroundColor: opt.colorDot }}
                      />
                    )}
                    <div className="truncate">
                      <span
                        className={`block truncate ${
                          variant === 'method'
                            ? 'font-mono-tabular font-bold'
                            : 'font-medium'
                        } ${opt.textClassName || ''}`}
                      >
                        {opt.label}
                      </span>
                      {opt.sublabel && (
                        <span
                          className="block text-[11px] truncate mt-0.5"
                          style={{ color: 'var(--zp-text-muted)' }}
                        >
                          {opt.sublabel}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {opt.badge && (
                      <span
                        className="text-[11px] font-mono-tabular"
                        style={{ color: 'var(--zp-text-muted)' }}
                      >
                        {opt.badge}
                      </span>
                    )}
                    {isSelected && (
                      <Check
                        className="w-3.5 h-3.5 shrink-0"
                        style={{ color: 'var(--zp-accent)' }}
                      />
                    )}
                  </div>
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
