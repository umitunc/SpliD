import type { ReactNode } from 'react';

export interface SliderProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  label?: ReactNode;
  valueLabel?: ReactNode;
  className?: string;
}

/**
 * uxiGL-inspired tactile Slider primitive with active track fill and glass thumb.
 */
export function Slider({
  value,
  min = 0,
  max = 100,
  step = 1,
  onChange,
  disabled = false,
  label,
  valueLabel,
  className = ''
}: SliderProps) {
  const safeSpan = Math.max(1e-6, max - min);
  const clamped = Math.min(max, Math.max(min, value));
  const percent = ((clamped - min) / safeSpan) * 100;

  return (
    <div className={`flex flex-col gap-1.5 ${disabled ? 'opacity-45' : ''} ${className}`}>
      {(label !== undefined || valueLabel !== undefined) && (
        <div className="flex items-center justify-between text-xs">
          {label !== undefined && <span className="uxigl-text-secondary font-medium">{label}</span>}
          {valueLabel !== undefined && (
            <span className="uxigl-accent-text font-mono font-bold">{valueLabel}</span>
          )}
        </div>
      )}

      <div className="relative flex h-5 w-full items-center">
        {/* Track background */}
        <div className="uxigl-sunken relative h-2 w-full overflow-hidden rounded-full">
          {/* Active filled track */}
          <div
            className="h-full rounded-full transition-[width] duration-75"
            style={{
              width: `${percent}%`,
              background: 'linear-gradient(90deg, var(--uxigl-accent), var(--uxigl-accent-light))'
            }}
          />
        </div>

        {/* Tactile thumb */}
        <div
          className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-md transition-transform"
          style={{
            left: `${percent}%`,
            backgroundColor: 'var(--uxigl-accent)',
            boxShadow: '0 2px 8px var(--uxigl-accent-glow)'
          }}
        />

        {/* Accessible native range overlay */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={clamped}
          disabled={disabled}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (!Number.isNaN(v)) onChange(v);
          }}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        />
      </div>
    </div>
  );
}
