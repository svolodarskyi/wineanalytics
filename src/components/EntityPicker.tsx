import { useMemo, useState } from 'react'

interface EntityPickerProps {
  items: { id: string; name: string }[]
  onSelect: (id: string) => void
  searchLabel: string
  /** Singular noun used in create-new copy, e.g. "vendor" or "wine". */
  entityLabel: string
  /** Creates a brand-new entity with this name. Offered any time the user has typed a name, whether or not it also matches something on the list. */
  onCreateNew?: (name: string) => Promise<{ id: string }>
}

/**
 * Search-or-browse picker used to change a suggested vendor/SKU match, with
 * a fallback to create a new entity at any time. Meant to be rendered inside
 * a centered Modal, so it only ever appears once the user opens it.
 */
export function EntityPicker({ items, onSelect, searchLabel, entityLabel, onCreateNew }: EntityPickerProps) {
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? items.filter((item) => item.name.toLowerCase().includes(q)) : items
  }, [items, query])

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
        <ul className="picker-list" aria-label="Choose match">
          {filtered.map((item) => (
            <li key={item.id}>
              <button type="button" className="picker-list__item" onClick={() => onSelect(item.id)}>
                {item.name}
              </button>
            </li>
          ))}
        </ul>
      )}

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
