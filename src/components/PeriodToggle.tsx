interface PeriodOption<T extends string> {
  value: T
  label: string
}

interface PeriodToggleProps<T extends string> {
  options: PeriodOption<T>[]
  value: T
  onChange: (value: T) => void
}

/** Small pill-button row for switching a chart's time window - shared by every period-scoped graph. */
export function PeriodToggle<T extends string>({ options, value, onChange }: PeriodToggleProps<T>) {
  return (
    <div className="period-toggle">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`period-toggle__btn${value === option.value ? ' active' : ''}`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
