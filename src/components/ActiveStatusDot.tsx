/** Compact "A"/"D" round indicator placed before a name in a list row, instead of a separate Status column. */
export function ActiveStatusDot({ active }: { active: boolean }) {
  return (
    <span
      className={`status-dot ${active ? 'status-dot--active' : 'status-dot--inactive'}`}
      title={active ? 'Active' : 'Deactivated'}
      aria-label={active ? 'Active' : 'Deactivated'}
    >
      {active ? 'A' : 'D'}
    </span>
  )
}
