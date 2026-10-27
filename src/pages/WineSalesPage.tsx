import { useMemo, useState, type SubmitEvent } from 'react'
import { useParams } from 'react-router-dom'
import { Modal } from '../components/Modal'
import { PeriodToggle } from '../components/PeriodToggle'
import { SalesVelocityChart } from '../components/SalesVelocityChart'
import { usePourSizes } from '../hooks/usePourSizes'
import { useCreateSale, useDeleteSale, useSales, useUpdateSale } from '../hooks/useSales'
import { useWine } from '../hooks/useWines'
import type { Wine, WineSale } from '../types'
import {
  computeSalesVelocity,
  SALES_GRANULARITIES,
  SALES_PERIODS,
  type SalesGranularity,
  type SalesPeriod,
} from '../utils/salesVelocity'
import { formatCurrency, formatDateTime, formatVolumeMl } from '../utils/format'

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

function entryModeForSale(sale: WineSale, wine: Wine | null | undefined): EntryMode {
  if (sale.pourSizeId) return 'pour-size'
  if (wine?.volumeMl && sale.volumeMl === wine.volumeMl) return 'full-bottle'
  return 'custom'
}

export function WineSalesPage() {
  const { wineId } = useParams<{ wineId: string }>()
  const { data: wine } = useWine(wineId)
  const { data: sales, isLoading } = useSales(wineId)
  const { data: pourSizes } = usePourSizes({ includeInactive: true })

  const createSale = useCreateSale(wineId ?? '')
  const updateSale = useUpdateSale(wineId ?? '')
  const deleteSale = useDeleteSale(wineId ?? '')

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingSaleId, setEditingSaleId] = useState<string | null>(null)
  const [entryMode, setEntryMode] = useState<EntryMode>('pour-size')
  const [soldAt, setSoldAt] = useState('')
  const [pourSizeId, setPourSizeId] = useState('')
  const [customVolume, setCustomVolume] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [amount, setAmount] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const activePourSizes = (pourSizes ?? []).filter((p) => p.active)
  const pourSizeNameById = new Map((pourSizes ?? []).map((p) => [p.id, p.name]))

  const [velocityPeriod, setVelocityPeriod] = useState<SalesPeriod>('3mo')
  const [velocityGranularity, setVelocityGranularity] = useState<SalesGranularity>('week')
  const velocity = useMemo(
    () => (wine && sales ? computeSalesVelocity(sales, wine, velocityPeriod, velocityGranularity) : null),
    [wine, sales, velocityPeriod, velocityGranularity],
  )

  function openCreateModal() {
    setEditingSaleId(null)
    setSoldAt(toDateTimeLocalValue(new Date()))
    setEntryMode(activePourSizes.length ? 'pour-size' : wine?.volumeMl ? 'full-bottle' : 'custom')
    setPourSizeId(activePourSizes[0]?.id ?? '')
    setCustomVolume('')
    setQuantity('1')
    setAmount('')
    setFormError(null)
    setIsModalOpen(true)
  }

  function openEditModal(sale: WineSale) {
    const mode = entryModeForSale(sale, wine)
    setEditingSaleId(sale.id)
    setSoldAt(toDateTimeLocalValue(new Date(sale.soldAt)))
    setEntryMode(mode)
    setPourSizeId(mode === 'pour-size' ? (sale.pourSizeId ?? '') : (activePourSizes[0]?.id ?? ''))
    setCustomVolume(mode === 'custom' ? String(sale.volumeMl) : '')
    setQuantity(String(sale.quantity))
    setAmount(sale.amount != null ? String(sale.amount) : '')
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

    let amountNumber: number | null = null
    if (amount.trim() !== '') {
      amountNumber = Number(amount)
      if (!Number.isFinite(amountNumber) || amountNumber < 0) {
        setFormError('Enter a non-negative amount.')
        return
      }
    }

    let volumeFields: { pourSizeId: string } | { volumeMl: number }
    if (entryMode === 'pour-size') {
      if (!pourSizeId) {
        setFormError('Choose a pour size.')
        return
      }
      volumeFields = { pourSizeId }
    } else if (entryMode === 'full-bottle') {
      if (!wine?.volumeMl) {
        setFormError('This wine has no bottle volume set.')
        return
      }
      volumeFields = { volumeMl: wine.volumeMl }
    } else {
      const volumeMl = Number(customVolume)
      if (!customVolume || !Number.isFinite(volumeMl) || volumeMl <= 0) {
        setFormError('Enter a positive volume in ml.')
        return
      }
      volumeFields = { volumeMl }
    }

    setIsSaving(true)
    try {
      const saleInput = { soldAt: soldAtIso, ...volumeFields, quantity: quantityNumber, amount: amountNumber }
      if (editingSaleId) {
        await updateSale.mutateAsync({ id: editingSaleId, ...saleInput })
      } else {
        await createSale.mutateAsync(saleInput)
      }
      setIsModalOpen(false)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save the sale.')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete() {
    if (!editingSaleId) return
    if (!window.confirm('Delete this sale? This cannot be undone.')) return
    setIsDeleting(true)
    try {
      await deleteSale.mutateAsync(editingSaleId)
      setIsModalOpen(false)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div>
      {!!sales?.length && velocity && (
        <div className="card">
          <div className="detail-card__header">
            <h2>Sales velocity</h2>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <PeriodToggle options={SALES_GRANULARITIES} value={velocityGranularity} onChange={setVelocityGranularity} />
              <PeriodToggle options={SALES_PERIODS} value={velocityPeriod} onChange={setVelocityPeriod} />
            </div>
          </div>
          {velocity.length > 0 ? (
            <SalesVelocityChart data={velocity} granularity={velocityGranularity} />
          ) : (
            <p className="empty-state">No sales in this period.</p>
          )}
        </div>
      )}

      <div className="card">
        <div className="page-header">
          <h2>Sales</h2>
          <button type="button" className="btn btn--small btn--primary" onClick={openCreateModal}>
            + Record sale
          </button>
        </div>

        {isLoading && <p className="spinner-text">Loading...</p>}
        {!isLoading && sales?.length === 0 && <p className="empty-state">No sales recorded yet for this wine.</p>}
        {!!sales?.length && (
          <>
            <p className="page-header__meta" style={{ marginBottom: 8 }}>
              Click a sale to edit or delete it.
            </p>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Sold At</th>
                  <th>Type</th>
                  <th className="numeric">Volume</th>
                  <th className="numeric">Quantity</th>
                  <th className="numeric">Total</th>
                  <th className="numeric">Amount</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((sale) => (
                  <tr key={sale.id} className="data-table__row--clickable" onClick={() => openEditModal(sale)}>
                    <td>{formatDateTime(sale.soldAt)}</td>
                    <td>{saleTypeLabel(sale, pourSizeNameById, wine?.volumeMl ?? null)}</td>
                    <td className="numeric">{formatVolumeMl(sale.volumeMl)}</td>
                    <td className="numeric">{sale.quantity}</td>
                    <td className="numeric">{formatVolumeMl(sale.volumeMl * sale.quantity)}</td>
                    <td className="numeric">{formatCurrency(sale.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {isModalOpen && (
          <Modal title={editingSaleId ? 'Edit sale' : 'Record sale'} onClose={() => setIsModalOpen(false)}>
            <form className="stack" onSubmit={handleSubmit}>
              <div className="field">
                <label htmlFor="sale-sold-at">Sold at</label>
                <input
                  id="sale-sold-at"
                  type="datetime-local"
                  value={soldAt}
                  onChange={(event) => setSoldAt(event.target.value)}
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

              <div className="field">
                <label htmlFor="sale-amount">Amount ($)</label>
                <input
                  id="sale-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder="Optional"
                />
              </div>

              {formError && <p className="notice notice--error">{formError}</p>}

              <div className="picker" style={{ justifyContent: editingSaleId ? 'space-between' : 'flex-end' }}>
                {editingSaleId && (
                  <button type="button" className="btn btn--small btn--danger" disabled={isDeleting} onClick={handleDelete}>
                    {isDeleting ? 'Deleting...' : 'Delete'}
                  </button>
                )}
                <div className="picker">
                  <button type="button" className="btn" onClick={() => setIsModalOpen(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn--primary" disabled={isSaving}>
                    {editingSaleId ? (isSaving ? 'Saving...' : 'Save') : isSaving ? 'Recording...' : 'Record sale'}
                  </button>
                </div>
              </div>
            </form>
          </Modal>
        )}
      </div>
    </div>
  )
}
