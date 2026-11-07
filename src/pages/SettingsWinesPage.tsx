import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { EntityManager } from '../components/EntityManager'
import { useExtractWine } from '../hooks/useOpenAi'
import { useCreateWine, useDeleteWine, useSetWineActive, useUpdateWine, useWines } from '../hooks/useWines'
import type { WineCategory } from '../types'

export function SettingsWinesPage() {
  const [query, setQuery] = useState('')
  const [includeInactive, setIncludeInactive] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState<WineCategory | ''>('')
  const { data: wines, isLoading } = useWines({ query, includeInactive, category: categoryFilter || undefined })
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const autoOpenWineId = searchParams.get('wineId') ?? undefined
  const cameFromAlerts = searchParams.get('from') === 'alerts'
  // Captured once at mount, before onAutoOpened strips ?wineId= from the URL, so we can still navigate back to it on close.
  const [returnToWineId] = useState(() =>
    searchParams.get('from') === 'wine-detail' ? searchParams.get('wineId') : null,
  )

  const createWine = useCreateWine()
  const updateWine = useUpdateWine()
  const setWineActive = useSetWineActive()
  const deleteWine = useDeleteWine()
  const extractWine = useExtractWine()

  return (
    <EntityManager
      title="Wine SKUs"
      singularLabel="wine"
      items={wines ?? []}
      isLoading={isLoading}
      query={query}
      onQueryChange={setQuery}
      includeInactive={includeInactive}
      onIncludeInactiveChange={setIncludeInactive}
      categoryFilter={categoryFilter}
      onCategoryFilterChange={setCategoryFilter}
      onCreate={(input) => createWine.mutateAsync(input)}
      onUpdate={(id, input) => updateWine.mutateAsync({ id, ...input })}
      onSetActive={(id, active) => setWineActive.mutateAsync({ id, active })}
      onDelete={(id) => deleteWine.mutateAsync(id)}
      onScanWine={(imageDataUrls) => extractWine.mutateAsync(imageDataUrls)}
      showWineDetails
      autoOpenId={autoOpenWineId}
      onAutoOpened={() => {
        const next = new URLSearchParams(searchParams)
        next.delete('wineId')
        setSearchParams(next, { replace: true })
      }}
      onDetailClosed={() => {
        if (cameFromAlerts) navigate('/alerts/data-quality')
        else if (returnToWineId) navigate(`/wines/${returnToWineId}/data-quality`)
      }}
    />
  )
}
