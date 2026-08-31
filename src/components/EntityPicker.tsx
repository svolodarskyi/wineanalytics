import { useMemo, useState } from 'react'

interface EntityPickerProps {
  items: { id: string; name: string }[]
  onSelect: (id: string) => void
  onCancel: () => void
  submitLabel?: string
  searchLabel: string
}

/** Search-or-browse picker used to change a suggested vendor/SKU match. */
export function EntityPicker({ items, onSelect, onCancel, submitLabel = 'Select', searchLabel }: EntityPickerProps) {
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? items.filter((item) => item.name.toLowerCase().includes(q)) : items
  }, [items, query])

  const [selectedId, setSelectedId] = useState('')
  const effectiveSelectedId = filtered.some((item) => item.id === selectedId) ? selectedId : (filtered[0]?.id ?? '')

  return (
    <div className="picker">
      <input
        type="search"
        className="search-input"
        aria-label={searchLabel}
        placeholder={searchLabel}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <select
        aria-label="Choose match"
        value={effectiveSelectedId}
        onChange={(event) => setSelectedId(event.target.value)}
        disabled={filtered.length === 0}
      >
        {filtered.length === 0 && <option value="">No matches</option>}
        {filtered.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="btn btn--small btn--primary"
        disabled={!effectiveSelectedId}
        onClick={() => onSelect(effectiveSelectedId)}
      >
        {submitLabel}
      </button>
      <button type="button" className="btn btn--small" onClick={onCancel}>
        Cancel
      </button>
    </div>
  )
}
