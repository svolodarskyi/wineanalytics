import { useState } from 'react'
import { EntityManager } from '../components/EntityManager'
import { useCreateWine, useDeleteWine, useSetWineActive, useUpdateWine, useWines } from '../hooks/useWines'

export function SettingsWinesPage() {
  const [query, setQuery] = useState('')
  const [includeInactive, setIncludeInactive] = useState(false)
  const { data: wines, isLoading } = useWines({ query, includeInactive })

  const createWine = useCreateWine()
  const updateWine = useUpdateWine()
  const setWineActive = useSetWineActive()
  const deleteWine = useDeleteWine()

  return (
    <EntityManager
      title="Settings: Wine SKUs"
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
    />
  )
}
