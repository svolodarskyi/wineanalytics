import { useState, type SubmitEvent } from 'react'
import { Modal } from './Modal'

interface Entity {
  id: string
  name: string
  active: boolean
  country?: string | null
}

interface SortOption {
  value: string
  label: string
}

interface EntityManagerProps {
  title: string
  singularLabel: string
  items: Entity[]
  isLoading: boolean
  query: string
  onQueryChange: (query: string) => void
  includeInactive: boolean
  onIncludeInactiveChange: (includeInactive: boolean) => void
  onCreate: (input: { name: string; country?: string }) => Promise<unknown>
  onUpdate: (id: string, input: { name: string; country?: string }) => Promise<unknown>
  onSetActive: (id: string, active: boolean) => Promise<unknown>
  /** Permanently removes the item. Rejects if it has invoice history - the caller should deactivate instead. */
  onDelete: (id: string) => Promise<unknown>
  /** Shows a Country field/column and enables sorting by it. Wines only. */
  showCountry?: boolean
  sortBy?: string
  sortOptions?: SortOption[]
  onSortByChange?: (value: string) => void
}

/** Shared search/create/edit/activate-deactivate UI for Wine SKUs and Vendors. */
export function EntityManager({
  title,
  singularLabel,
  items,
  isLoading,
  query,
  onQueryChange,
  includeInactive,
  onIncludeInactiveChange,
  onCreate,
  onUpdate,
  onSetActive,
  onDelete,
  showCountry,
  sortBy,
  sortOptions,
  onSortByChange,
}: EntityManagerProps) {
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newCountry, setNewCountry] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [editingCountry, setEditingCountry] = useState('')
  const [editError, setEditError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  function openCreateModal() {
    setNewName('')
    setNewCountry('')
    setCreateError(null)
    setIsCreateOpen(true)
  }

  async function handleCreate(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    setCreateError(null)
    setIsCreating(true)
    try {
      await onCreate({ name: newName, country: newCountry })
      setIsCreateOpen(false)
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Could not create.')
    } finally {
      setIsCreating(false)
    }
  }

  function startEditing(entity: Entity) {
    setEditingId(entity.id)
    setEditingName(entity.name)
    setEditingCountry(entity.country ?? '')
    setEditError(null)
  }

  async function handleSaveEdit(id: string) {
    setEditError(null)
    setIsSaving(true)
    try {
      await onUpdate(id, { name: editingName, country: editingCountry })
      setEditingId(null)
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Could not save.')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete(entity: Entity) {
    if (!window.confirm(`Delete "${entity.name}"? This cannot be undone.`)) return
    setDeleteError(null)
    setDeletingId(entity.id)
    try {
      await onDelete(entity.id)
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Could not delete.')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>{title}</h1>
        <button type="button" className="btn btn--primary" onClick={openCreateModal}>
          + New {singularLabel}
        </button>
      </div>

      {isCreateOpen && (
        <Modal title={`New ${singularLabel}`} onClose={() => setIsCreateOpen(false)}>
          <form className="stack" onSubmit={handleCreate}>
            <div className="field">
              <label htmlFor="new-entity-name">Name</label>
              <input
                id="new-entity-name"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                autoFocus
              />
            </div>
            {showCountry && (
              <div className="field">
                <label htmlFor="new-entity-country">Country</label>
                <input
                  id="new-entity-country"
                  value={newCountry}
                  onChange={(event) => setNewCountry(event.target.value)}
                />
              </div>
            )}
            {createError && <p className="notice notice--error">{createError}</p>}
            <div className="picker" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn" onClick={() => setIsCreateOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn--primary" disabled={isCreating || !newName.trim()}>
                {isCreating ? 'Creating...' : `Create ${singularLabel}`}
              </button>
            </div>
          </form>
        </Modal>
      )}

      <div className="inline-form">
        <input
          type="search"
          className="search-input"
          placeholder={`Search ${singularLabel}s`}
          aria-label={`Search ${singularLabel}s`}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
        {sortOptions && onSortByChange && (
          <select aria-label="Sort by" value={sortBy} onChange={(event) => onSortByChange(event.target.value)}>
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                Sort by {option.label}
              </option>
            ))}
          </select>
        )}
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(event) => onIncludeInactiveChange(event.target.checked)}
          />
          Show inactive
        </label>
      </div>

      {editError && <p className="notice notice--error">{editError}</p>}
      {deleteError && <p className="notice notice--error">{deleteError}</p>}

      <div className="card">
        {isLoading && <p className="spinner-text">Loading...</p>}
        {!isLoading && items.length === 0 && <p className="empty-state">No {singularLabel}s found.</p>}
        {items.length > 0 && (
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                {showCountry && <th className="col-country">Country</th>}
                <th>Status</th>
                <th className="numeric">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    {editingId === item.id ? (
                      <input value={editingName} onChange={(event) => setEditingName(event.target.value)} autoFocus />
                    ) : (
                      item.name
                    )}
                  </td>
                  {showCountry && (
                    <td className="col-country">
                      {editingId === item.id ? (
                        <input
                          value={editingCountry}
                          onChange={(event) => setEditingCountry(event.target.value)}
                          placeholder="Country"
                        />
                      ) : (
                        (item.country ?? '-')
                      )}
                    </td>
                  )}
                  <td>
                    <span className={`badge ${item.active ? 'badge--confirmed' : 'badge--neutral'}`}>
                      {item.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="numeric">
                    {editingId === item.id ? (
                      <>
                        <button
                          type="button"
                          className="btn btn--small btn--primary"
                          disabled={isSaving}
                          onClick={() => handleSaveEdit(item.id)}
                        >
                          Save
                        </button>{' '}
                        <button type="button" className="btn btn--small" onClick={() => setEditingId(null)}>
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button type="button" className="btn btn--small" onClick={() => startEditing(item)}>
                          Edit
                        </button>{' '}
                        <button
                          type="button"
                          className="btn btn--small"
                          onClick={() => onSetActive(item.id, !item.active)}
                        >
                          {item.active ? 'Deactivate' : 'Activate'}
                        </button>{' '}
                        <button
                          type="button"
                          className="btn btn--small btn--danger"
                          disabled={deletingId === item.id}
                          onClick={() => handleDelete(item)}
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
