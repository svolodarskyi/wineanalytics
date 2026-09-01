import { useMemo, useState } from 'react'

interface EntityPickerProps {
  items: { id: string; name: string }[]
  onSelect: (id: string) => void
  onCancel: () => void
  submitLabel?: string
  searchLabel: string
  /** Singular noun used in create-new copy, e.g. "vendor" or "wine". */
  entityLabel: string
  /** Creates a brand-new entity with this name. Offered any time the user has typed a name, whether or not it also matches something on the list. */
  onCreateNew?: (name: string) => Promise<{ id: string }>
}

/** Search-or-browse picker used to change a suggested vendor/SKU match, with a fallback to create a new entity at any time. */
export function EntityPicker({
  items,
  onSelect,
  onCancel,
  submitLabel = 'Select',
  searchLabel,
  entityLabel,
  onCreateNew,
}: EntityPickerProps) {
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? items.filter((item) => item.name.toLowerCase().includes(q)) : items
  }, [items, query])

  const [selectedId, setSelectedId] = useState('')
  const effectiveSelectedId = filtered.some((item) => item.id === selectedId) ? selectedId : (filtered[0]?.id ?? '')

  const [isCreating, setIsCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const trimmedQuery = query.trim()
  const noMatches = filtered.length === 0

  async function handleCreateNew() {
    if (!onCreateNew || !trimmedQuery) return
    setCreateError(null)
    setIsCreating(true)
    try {
      const created = await onCreateNew(trimmedQuery)
      onSelect(created.id)
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : `Could not create the ${entityLabel}.`)
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <div className="stack">
      <div className="picker">
        <input
          type="search"
          className="search-input"
          aria-label={searchLabel}
          placeholder={searchLabel}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          autoFocus
        />
        {!noMatches && (
          <>
            <select
              aria-label="Choose match"
              value={effectiveSelectedId}
              onChange={(event) => setSelectedId(event.target.value)}
            >
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
          </>
        )}
        <button type="button" className="btn btn--small" onClick={onCancel}>
          Cancel
        </button>
      </div>

      {noMatches && (
        <p className="page-header__meta">
          {trimmedQuery
            ? `No ${entityLabel} found matching "${trimmedQuery}".`
            : `No ${entityLabel}s yet. Type a name to search or create one.`}
        </p>
      )}

      {onCreateNew && trimmedQuery && (
        <div className="stack">
          <button type="button" className="btn btn--small btn--primary" disabled={isCreating} onClick={handleCreateNew}>
            {isCreating ? 'Creating...' : `+ Add "${trimmedQuery}" as a new ${entityLabel}`}
          </button>
          {createError && <p className="notice notice--error">{createError}</p>}
        </div>
      )}
    </div>
  )
}
