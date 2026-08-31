import { useState } from 'react'
import { EntityManager } from '../components/EntityManager'
import { useCreateWine, useDeleteWine, useSetWineActive, useUpdateWine, useWines } from '../hooks/useWines'
import type { WineSortBy } from '../services'

const SORT_OPTIONS: { value: WineSortBy; label: string }[] = [
  { value: 'name', label: 'name' },
  { value: 'country', label: 'country' },
]

export function SettingsWinesPage() {
  const [query, setQuery] = useState('')
  const [includeInactive, setIncludeInactive] = useState(false)
  const [sortBy, setSortBy] = useState<WineSortBy>('name')
  const { data: wines, isLoading } = useWines({ query, includeInactive, sortBy })

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
      showImage
      sortBy={sortBy}
      sortOptions={SORT_OPTIONS}
      onSortByChange={(value) => setSortBy(value as WineSortBy)}
    />
  )
}
