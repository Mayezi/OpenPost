import React from 'react';
import { motion } from 'motion/react';
import { Check, Minus } from 'lucide-react';

/* ============================================================================
   1. UNIFIED TOGGLE SWITCH (ON / OFF BOOLEAN SETTINGS)
   ============================================================================ */
interface ToggleSwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label?: string;
  description?: string;
  size?: 'sm' | 'md';
  id?: string;
}

export const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
  checked,
  onChange,
  disabled = false,
  label,
  description,
  size = 'md',
  id,
}) => {
  const isSmall = size === 'sm';
  const trackCls = isSmall ? 'w-8 h-[18px]' : 'w-9 h-5';
  const thumbSize = isSmall ? 14 : 16;
  const travel = isSmall ? 14 : 16;

  const switchEl = (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) onChange(!checked);
      }}
      className={`relative inline-flex items-center shrink-0 rounded-full p-[2px] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--zp-accent)]/40 disabled:opacity-45 ${trackCls}`}
      style={{
        backgroundColor: checked ? 'var(--zp-accent)' : 'var(--zp-border)',
      }}
    >
      <motion.span
        initial={false}
        animate={{ x: checked ? travel : 0 }}
        transition={{ type: 'spring', stiffness: 520, damping: 34 }}
        className="block rounded-full bg-white shadow-sm"
        style={{
          width: `${thumbSize}px`,
          height: `${thumbSize}px`,
        }}
      />
    </button>
  );

  if (!label && !description) {
    return switchEl;
  }

  return (
    <div
      onClick={() => {
        if (!disabled) onChange(!checked);
      }}
      className={`flex items-center justify-between gap-3 select-none ${
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
      }`}
    >
      <div className="min-w-0">
        {label && (
          <div
            className="text-xs font-medium leading-snug"
            style={{ color: 'var(--zp-text-primary)' }}
          >
            {label}
          </div>
        )}
        {description && (
          <div
            className="text-[11px] leading-snug mt-0.5"
            style={{ color: 'var(--zp-text-muted)' }}
          >
            {description}
          </div>
        )}
      </div>
      {switchEl}
    </div>
  );
};

/* ============================================================================
   2. UNIFIED CHECKBOX (ROW ENABLE/DISABLE & BULK SELECTION)
   ============================================================================ */
interface UiCheckboxProps {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  title?: string;
  label?: string;
}

export const UiCheckbox: React.FC<UiCheckboxProps> = ({
  checked,
  indeterminate = false,
  onChange,
  disabled = false,
  title,
  label,
}) => {
  const isActive = checked || indeterminate;

  const box = (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
      disabled={disabled}
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) onChange(!checked);
      }}
      className="inline-flex items-center justify-center w-4 h-4 rounded-[4px] border transition-colors duration-150 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--zp-accent)]/40 disabled:opacity-45"
      style={{
        backgroundColor: isActive ? 'var(--zp-accent)' : 'var(--zp-bg-input)',
        borderColor: isActive ? 'var(--zp-accent)' : 'var(--zp-border)',
        color: isActive ? 'var(--zp-accent-fg)' : 'transparent',
      }}
    >
      {indeterminate ? (
        <Minus className="w-3 h-3 stroke-[2.75]" />
      ) : checked ? (
        <Check className="w-3 h-3 stroke-[2.75]" />
      ) : null}
    </button>
  );

  if (!label) return box;

  return (
    <div
      onClick={() => {
        if (!disabled) onChange(!checked);
      }}
      className={`inline-flex items-center gap-2 text-xs select-none ${
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
      }`}
    >
      {box}
      <span style={{ color: 'var(--zp-text-secondary)' }}>{label}</span>
    </div>
  );
};

/* ============================================================================
   3. UNIFIED SEGMENTED CONTROL (MODE / FORMAT / EXCLUSIVE SWITCHER)
   ============================================================================ */
export interface SegmentedOption<T extends string = string> {
  id: T;
  label: string;
  icon?: React.ReactNode;
}

interface SegmentedControlProps<T extends string = string> {
  value: T;
  options: ReadonlyArray<SegmentedOption<T>>;
  onChange: (next: T) => void;
  layoutId?: string;
  size?: 'sm' | 'md';
  fullWidth?: boolean;
  tone?: 'surface' | 'canvas';
  variant?: 'tonal' | 'quiet';
  activeStyle?: 'accent' | 'soft-accent' | 'elevated';
  className?: string;
}

export function SegmentedControl<T extends string = string>({
  value,
  options,
  onChange,
  layoutId,
  size = 'sm',
  fullWidth = false,
  tone = 'surface',
  variant = 'tonal',
  activeStyle = 'elevated',
  className = '',
}: SegmentedControlProps<T>) {
  const heightCls = size === 'md' ? 'h-7 px-3' : 'h-[26px] px-2.5';
  const isQuiet = variant === 'quiet';

  const getActiveBackground = () => {
    if (activeStyle === 'accent') return 'var(--zp-accent)';
    if (activeStyle === 'soft-accent') return 'var(--zp-accent-soft)';
    return tone === 'canvas' ? 'var(--zp-bg-canvas)' : 'var(--zp-bg-elevated)';
  };

  const getActiveColor = () => {
    if (activeStyle === 'accent') return 'var(--zp-accent-fg)';
    if (activeStyle === 'soft-accent') return 'var(--zp-accent)';
    return 'var(--zp-text-primary)';
  };

  const getActiveShadow = () => {
    if (activeStyle === 'elevated' && !isQuiet) {
      return '0 1px 2px rgba(0, 0, 0, 0.06)';
    }
    return 'none';
  };

  return (
    <div
      className={`${
        fullWidth ? 'grid' : 'inline-flex'
      } items-center ${
        isQuiet ? 'gap-1 p-0' : 'gap-0.5 p-[3px] rounded-[8px]'
      } text-xs shrink-0 ${className}`}
      style={{
        gridTemplateColumns: fullWidth
          ? `repeat(${options.length}, minmax(0, 1fr))`
          : undefined,
        backgroundColor: isQuiet
          ? 'transparent'
          : tone === 'canvas'
          ? 'var(--zp-bg-elevated)'
          : 'var(--zp-bg-surface)',
      }}
    >
      {options.map((opt) => {
        const active = opt.id === value;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className={`relative inline-flex items-center justify-center gap-1.5 ${heightCls} ${
              isQuiet ? 'rounded-[6px]' : 'rounded-[5px]'
            } font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--zp-accent)]/35 ${
              !active && isQuiet ? 'hover:bg-black/[0.04] dark:hover:bg-white/[0.04]' : ''
            }`}
            style={{
              color: active ? getActiveColor() : 'var(--zp-text-secondary)',
            }}
          >
            {active && layoutId ? (
              <motion.span
                layoutId={layoutId}
                transition={{ type: 'spring', stiffness: 460, damping: 34 }}
                className={`absolute inset-0 ${isQuiet ? 'rounded-[6px]' : 'rounded-[5px]'}`}
                style={{
                  backgroundColor: getActiveBackground(),
                  boxShadow: getActiveShadow(),
                }}
              />
            ) : (
              active && (
                <span
                  className={`absolute inset-0 ${isQuiet ? 'rounded-[6px]' : 'rounded-[5px]'}`}
                  style={{
                    backgroundColor: getActiveBackground(),
                    boxShadow: getActiveShadow(),
                  }}
                />
              )
            )}
            {opt.icon && (
              <span
                className="relative z-10 shrink-0"
                style={{
                  color: active
                    ? activeStyle === 'accent'
                      ? 'var(--zp-accent-fg)'
                      : 'var(--zp-accent)'
                    : 'currentColor',
                }}
              >
                {opt.icon}
              </span>
            )}
            <span className="relative z-10">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
