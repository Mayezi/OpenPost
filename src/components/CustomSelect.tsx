import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
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

interface PopoverCoords {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
  maxHeight: number;
  minWidth: number;
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
  minWidth = 160,
  className = '',
}) => {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<PopoverCoords>({
    top: 0,
    left: 0,
    maxHeight: 460,
    minWidth,
  });

  const selected = options.find((o) => o.value === value) || options[0];

  const updateCoords = useCallback(() => {
    const btn = triggerRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const gap = variant === 'method' ? 8 : 6;
    const margin = 12;
    const spaceBelow = window.innerHeight - rect.bottom - margin;
    const spaceAbove = rect.top - margin;
    const openUpward = spaceBelow < 220 && spaceAbove > spaceBelow;

    const baseWidth = Math.max(minWidth, rect.width);
    const effectiveMinWidth = variant === 'method' ? baseWidth + 1 : baseWidth;
    const next: PopoverCoords = {
      minWidth: effectiveMinWidth,
      maxHeight: Math.max(180, Math.min(480, (openUpward ? spaceAbove : spaceBelow) - gap)),
    };

    if (openUpward) {
      next.bottom = window.innerHeight - rect.top + gap;
    } else {
      next.top = rect.bottom + gap;
    }

    if (align === 'right') {
      const rightVal = Math.max(margin, window.innerWidth - rect.right);
      next.right = rightVal;
    } else {
      const targetLeft = variant === 'method' ? rect.left - 1 : rect.left;
      const maxLeft = Math.max(margin, window.innerWidth - effectiveMinWidth - margin);
      next.left = Math.min(Math.max(margin, targetLeft), maxLeft);
    }

    setCoords(next);
  }, [align, minWidth, variant]);

  useLayoutEffect(() => {
    if (!open) return;
    updateCoords();
  }, [open, updateCoords]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const handleReposition = () => updateCoords();

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [open, updateCoords]);

  const paddingClass =
    size === 'md' ? 'px-3 py-1.5 text-xs' : 'px-2.5 py-1.5 text-xs';

  const menuNode = (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={menuRef}
          initial={{ opacity: 0, y: 3, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 2, scale: 0.98 }}
          transition={{ duration: 0.12, ease: [0.16, 1, 0.3, 1] }}
          style={{
            position: 'fixed',
            zIndex: 9999,
            top: coords.top,
            bottom: coords.bottom,
            left: coords.left,
            right: coords.right,
            minWidth: `${coords.minWidth}px`,
            width: variant === 'method' ? `${coords.minWidth}px` : undefined,
            maxHeight: `${coords.maxHeight}px`,
            backgroundColor: 'var(--zp-bg-canvas)',
            borderColor: 'var(--zp-border-subtle)',
            color: 'var(--zp-text-primary)',
          }}
          className="rounded-[10px] border p-1.5 zp-popover-shadow overflow-y-auto space-y-0.5"
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
                className="w-full text-left flex items-center justify-between gap-2 px-2.5 h-7 rounded-[6px] text-xs transition-colors"
                style={{
                  backgroundColor: isSelected ? 'var(--zp-bg-elevated)' : 'transparent',
                  color: 'var(--zp-text-primary)',
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.backgroundColor = 'var(--zp-bg-surface)';
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
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: opt.colorDot }}
                    />
                  )}
                  <div className="truncate">
                    <span
                      className={`block truncate ${
                        variant === 'method'
                          ? 'font-mono-tabular font-bold text-[11px] tracking-tight'
                          : isSelected
                          ? 'font-semibold'
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
                      style={{ color: 'var(--zp-text-secondary)' }}
                    />
                  )}
                </div>
              </button>
            );
          })}
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <div
      className={`relative inline-flex shrink-0 ${className}`}
      style={variant === 'method' ? { width: `${minWidth}px` } : undefined}
    >
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`w-full inline-flex items-center justify-between gap-1.5 font-medium zp-surface-transition whitespace-nowrap shrink-0 focus-visible:outline-none ${paddingClass} ${
          variant === 'ghost'
            ? 'rounded-[6px] hover:bg-black/5 dark:hover:bg-white/5'
            : variant === 'method'
            ? 'rounded-l-[5px] border-r px-3 h-full'
            : 'rounded-[6px] border'
        }`}
        style={{
          backgroundColor:
            variant === 'ghost'
              ? open
                ? 'var(--zp-bg-elevated)'
                : 'transparent'
              : variant === 'method'
              ? 'transparent'
              : open
              ? 'var(--zp-bg-elevated)'
              : 'var(--zp-bg-surface)',
          borderColor:
            variant === 'ghost'
              ? 'transparent'
              : variant === 'method'
              ? 'var(--zp-border-subtle)'
              : open
              ? 'var(--zp-accent)'
              : 'var(--zp-border-subtle)',
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
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: selected.colorDot }}
            />
          )}
          <span
            className={`truncate ${
              variant === 'method'
                ? 'font-mono-tabular font-bold text-[11px] tracking-tight'
                : ''
            } ${selected?.textClassName || ''}`}
          >
            {selected?.label || value}
          </span>
        </div>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
          className="shrink-0 opacity-55"
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </motion.span>
      </button>

      {typeof document !== 'undefined' ? createPortal(menuNode, document.body) : null}
    </div>
  );
};
