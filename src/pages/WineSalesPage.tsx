import { useState, type SubmitEvent } from 'react'
import { useParams } from 'react-router-dom'
import { Modal } from '../components/Modal'
import { usePourSizes } from '../hooks/usePourSizes'
import { useCreateSale, useDeleteSale, useSales } from '../hooks/useSales'
import { useWine } from '../hooks/useWines'
import type { WineSale } from '../types'
import { formatDateTime, formatVolumeMl } from '../utils/format'

type EntryMode = 'pour-size' | 'full-bottle' | 'custom'

function toDateTimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function saleTypeLabel(sale: WineSale, pourSizeNameById: Map<string, string>, wineVolumeMl: number | null): string {
  if (sale.pourSizeId) return pourSizeNameById.get(sale.pourSizeId) ?? 'Pour size'
  if (wineVolumeMl && sale.volumeMl === wineVolumeMl) return 'Full bottle'
  return 'Custom'
}

export function WineSalesPage() {
  const { wineId } = useParams<{ wineId: string }>()
  const { data: wine } = useWine(wineId)
  const { data: sales, isLoading } = useSales(wineId)
  const { data: pourSizes } = usePourSizes({ includeInactive: true })

  const createSale = useCreateSale(wineId ?? '')
  const deleteSale = useDeleteSale(wineId ?? '')

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [entryMode, setEntryMode] = useState<EntryMode>('pour-size')
  const [soldAt, setSoldAt] = useState('')
  const [pourSizeId, setPourSizeId] = useState('')
  const [customVolume, setCustomVolume] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [formError, setFormError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const activePourSizes = (pourSizes ?? []).filter((p) => p.active)
  const pourSizeNameById = new Map((pourSizes ?? []).map((p) => [p.id, p.name]))

  function openModal() {
    setSoldAt(toDateTimeLocalValue(new Date()))
    setEntryMode(activePourSizes.length ? 'pour-size' : wine?.volumeMl ? 'full-bottle' : 'custom')
    setPourSizeId(activePourSizes[0]?.id ?? '')
    setCustomVolume('')
    setQuantity('1')
    setFormError(null)
    setIsModalOpen(true)
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!wineId) return
    setFormError(null)

    if (!soldAt) {
      setFormError('Date and time are required.')
      return
    }
    const soldAtIso = new Date(soldAt).toISOString()

    const quantityNumber = Number(quantity)
    if (!quantity || !Number.isInteger(quantityNumber) || quantityNumber <= 0) {
      setFormError('Enter a positive whole number for quantity.')
      return
    }

    setIsSaving(true)
    try {
      if (entryMode === 'pour-size') {
        if (!pourSizeId) {
          setFormError('Choose a pour size.')
          return
        }
        await createSale.mutateAsync({ soldAt: soldAtIso, pourSizeId, quantity: quantityNumber })
      } else if (entryMode === 'full-bottle') {
        if (!wine?.volumeMl) {
          setFormError('This wine has no bottle volume set.')
          return
        }
        await createSale.mutateAsync({ soldAt: soldAtIso, volumeMl: wine.volumeMl, quantity: quantityNumber })
      } else {
        const volumeMl = Number(customVolume)
        if (!customVolume || !Number.isFinite(volumeMl) || volumeMl <= 0) {
          setFormError('Enter a positive volume in ml.')
          return
        }
        await createSale.mutateAsync({ soldAt: soldAtIso, volumeMl, quantity: quantityNumber })
      }
      setIsModalOpen(false)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not record the sale.')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Delete this sale? This cannot be undone.')) return
    setDeletingId(id)
    try {
      await deleteSale.mutateAsync(id)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="card">
      <div className="page-header">
        <h2>Sales</h2>
        <button type="button" className="btn btn--small btn--primary" onClick={openModal}>
          + Record sale
        </button>
      </div>

      {isLoading && <p className="spinner-text">Loading...</p>}
      {!isLoading && sales?.length === 0 && <p className="empty-state">No sales recorded yet for this wine.</p>}
      {!!sales?.length && (
        <table className="data-table">
          <thead>
            <tr>
              <th>Sold At</th>
              <th>Type</th>
              <th className="numeric">Volume</th>
              <th className="numeric">Quantity</th>
              <th className="numeric">Total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sales.map((sale) => (
              <tr key={sale.id}>
                <td>{formatDateTime(sale.soldAt)}</td>
                <td>{saleTypeLabel(sale, pourSizeNameById, wine?.volumeMl ?? null)}</td>
                <td className="numeric">{formatVolumeMl(sale.volumeMl)}</td>
                <td className="numeric">{sale.quantity}</td>
                <td className="numeric">{formatVolumeMl(sale.volumeMl * sale.quantity)}</td>
                <td>
                  <button
                    type="button"
                    className="btn btn--small btn--danger"
                    disabled={deletingId === sale.id}
                    onClick={() => handleDelete(sale.id)}
                  >
                    {deletingId === sale.id ? 'Deleting...' : 'Delete'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {isModalOpen && (
        <Modal title="Record sale" onClose={() => setIsModalOpen(false)}>
          <form className="stack" onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="sale-sold-at">Sold at</label>
              <input
                id="sale-sold-at"
                type="datetime-local"
                value={soldAt}
                onChange={(event) => setSoldAt(event.target.value)}
                autoFocus
              />
            </div>

            <div className="field">
              <label htmlFor="sale-entry-mode">Volume entry</label>
              <select
                id="sale-entry-mode"
                value={entryMode}
                onChange={(event) => setEntryMode(event.target.value as EntryMode)}
              >
                <option value="pour-size" disabled={activePourSizes.length === 0}>
                  Pour size
                </option>
                <option value="full-bottle" disabled={!wine?.volumeMl}>
                  Full bottle{wine?.volumeMl ? ` (${formatVolumeMl(wine.volumeMl)})` : ' (no bottle volume set)'}
                </option>
                <option value="custom">Custom ml</option>
              </select>
            </div>

            {entryMode === 'pour-size' && (
              <div className="field">
                <label htmlFor="sale-pour-size">Pour size</label>
                <select id="sale-pour-size" value={pourSizeId} onChange={(event) => setPourSizeId(event.target.value)}>
                  {activePourSizes.map((pourSize) => (
                    <option key={pourSize.id} value={pourSize.id}>
                      {pourSize.name} ({formatVolumeMl(pourSize.volumeMl)})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {entryMode === 'custom' && (
              <div className="field">
                <label htmlFor="sale-custom-volume">Volume (ml)</label>
                <input
                  id="sale-custom-volume"
                  type="number"
                  min="1"
                  step="1"
                  value={customVolume}
                  onChange={(event) => setCustomVolume(event.target.value)}
                  placeholder="e.g. 100"
                />
              </div>
            )}

            <div className="field">
              <label htmlFor="sale-quantity">
                Quantity {entryMode === 'pour-size' ? '(glasses)' : entryMode === 'full-bottle' ? '(bottles)' : ''}
              </label>
              <input
                id="sale-quantity"
                type="number"
                min="1"
                step="1"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
              />
            </div>

            {formError && <p className="notice notice--error">{formError}</p>}

            <div className="picker" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn" onClick={() => setIsModalOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn--primary" disabled={isSaving}>
                {isSaving ? 'Recording...' : 'Record sale'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
