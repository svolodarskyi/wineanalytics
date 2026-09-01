import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { EntityManager } from '../components/EntityManager'
import { useCreateWine, useDeleteWine, useSetWineActive, useUpdateWine, useWines } from '../hooks/useWines'

export function SettingsWinesPage() {
  const [query, setQuery] = useState('')
  const [includeInactive, setIncludeInactive] = useState(false)
  const { data: wines, isLoading } = useWines({ query, includeInactive })
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const autoOpenWineId = searchParams.get('wineId') ?? undefined
  const cameFromAlerts = searchParams.get('from') === 'alerts'

  const createWine = useCreateWine()
  const updateWine = useUpdateWine()
  const setWineActive = useSetWineActive()
  const deleteWine = useDeleteWine()

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
      onCreate={(input) => createWine.mutateAsync(input)}
      onUpdate={(id, input) => updateWine.mutateAsync({ id, ...input })}
      onSetActive={(id, active) => setWineActive.mutateAsync({ id, active })}
      onDelete={(id) => deleteWine.mutateAsync(id)}
      showCountry
      showWineDetails
      showImage
      autoOpenId={autoOpenWineId}
      onAutoOpened={() => {
        const next = new URLSearchParams(searchParams)
        next.delete('wineId')
        setSearchParams(next, { replace: true })
      }}
      onDetailClosed={() => {
        if (cameFromAlerts) navigate('/alerts/data-quality')
      }}
    />
  )
}
