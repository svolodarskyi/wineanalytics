import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { services, type ListOptions } from '../services'
import { queryKeys } from './queryKeys'

export function useVendors(options?: ListOptions) {
  return useQuery({
    queryKey: queryKeys.vendors(options),
    queryFn: () => services.vendors.list(options),
  })
}

export function useVendor(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.vendor(id ?? ''),
    queryFn: () => services.vendors.get(id as string),
    enabled: Boolean(id),
  })
}

function useInvalidateVendors() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: ['vendors'] })
}

export function useCreateVendor() {
  const invalidate = useInvalidateVendors()
  return useMutation({
    mutationFn: (input: { name: string }) => services.vendors.create(input),
    onSuccess: invalidate,
  })
}

export function useUpdateVendor() {
  const invalidate = useInvalidateVendors()
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => services.vendors.update(id, { name }),
    onSuccess: invalidate,
  })
}

export function useSetVendorActive() {
  const invalidate = useInvalidateVendors()
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => services.vendors.setActive(id, active),
    onSuccess: invalidate,
  })
}

export function useDeleteVendor() {
  const invalidate = useInvalidateVendors()
  return useMutation({
    mutationFn: (id: string) => services.vendors.delete(id),
    onSuccess: invalidate,
  })
}
