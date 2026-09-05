interface FeatureSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  formatValue: (value: number) => string;
  helperText?: string;
  disabled?: boolean;
}

export default function FeatureSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  formatValue,
  helperText,
  disabled,
}: FeatureSliderProps) {
  return (
    <div className="w-full">
      <div className="mb-1.5 flex items-baseline justify-between">
        <label className="text-xs font-medium text-soc-text">{label}</label>
        <div className="flex items-baseline gap-2">
          {helperText && <span className="text-[11px] text-soc-muted">{helperText}</span>}
          <span className="text-xs font-semibold tabular-nums text-soc-primary font-mono">
            {formatValue(value)}
          </span>
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-soc-primary disabled:opacity-50"
        aria-label={label}
      />
    </div>
  );
}
