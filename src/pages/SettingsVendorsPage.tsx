import { useState } from 'react'
import { EntityManager } from '../components/EntityManager'
import { useCreateVendor, useDeleteVendor, useSetVendorActive, useUpdateVendor, useVendors } from '../hooks/useVendors'

export function SettingsVendorsPage() {
  const [query, setQuery] = useState('')
  const [includeInactive, setIncludeInactive] = useState(false)
  const { data: vendors, isLoading } = useVendors({ query, includeInactive })

  const createVendor = useCreateVendor()
  const updateVendor = useUpdateVendor()
  const setVendorActive = useSetVendorActive()
  const deleteVendor = useDeleteVendor()

  return (
    <EntityManager
      title="Settings: Vendors"
      singularLabel="vendor"
      items={vendors ?? []}
      isLoading={isLoading}
      query={query}
      onQueryChange={setQuery}
      includeInactive={includeInactive}
      onIncludeInactiveChange={setIncludeInactive}
      onCreate={(input) => createVendor.mutateAsync({ name: input.name, invoiceName: input.invoiceName })}
      onUpdate={(id, input) => updateVendor.mutateAsync({ id, name: input.name, invoiceName: input.invoiceName })}
      onSetActive={(id, active) => setVendorActive.mutateAsync({ id, active })}
      onDelete={(id) => deleteVendor.mutateAsync(id)}
    />
  )
}
