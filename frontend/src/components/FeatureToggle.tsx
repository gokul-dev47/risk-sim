interface FeatureToggleProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  autoSynced?: boolean;
  disabled?: boolean;
}

export default function FeatureToggle({ label, checked, onChange, autoSynced, disabled }: FeatureToggleProps) {
  return (
    <div className="flex w-full items-center justify-between">
      <div className="flex items-baseline gap-1.5">
        <label className="text-xs font-medium text-soc-text">{label}</label>
        {autoSynced && (
          <span className="text-[10px] text-soc-muted" title="Auto-set from the amount slider">
            (auto)
          </span>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-block h-5 w-9 flex-shrink-0 rounded-full transition-colors duration-200 disabled:opacity-50 ${
          checked ? 'bg-soc-primary' : 'bg-white/10'
        }`}
      >
        <span
          className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${
            checked ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}
