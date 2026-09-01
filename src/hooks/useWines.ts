import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { services, type WineListOptions } from '../services'
import { queryKeys } from './queryKeys'

export function useWines(options?: WineListOptions) {
  return useQuery({
    queryKey: queryKeys.wines(options),
    queryFn: () => services.wines.list(options),
  })
}

export function useWine(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.wine(id ?? ''),
    queryFn: () => services.wines.get(id as string),
    enabled: Boolean(id),
  })
}

export function useWineBalances() {
  return useQuery({
    queryKey: queryKeys.wineBalances(),
    queryFn: () => services.wines.getBalances(),
  })
}

export function useWinePurchaseHistory(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.winePurchaseHistory(id ?? ''),
    queryFn: () => services.wines.getPurchaseHistory(id as string),
    enabled: Boolean(id),
  })
}

function useInvalidateWines() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: ['wines'] })
}

export function useCreateWine() {
  const invalidate = useInvalidateWines()
  return useMutation({
    mutationFn: (input: { name: string; country?: string | null; imageDataUrl?: string | null }) =>
      services.wines.create(input),
    onSuccess: invalidate,
  })
}

export function useUpdateWine() {
  const invalidate = useInvalidateWines()
  return useMutation({
    mutationFn: ({
      id,
      ...input
    }: {
      id: string
      name: string
      country?: string | null
      imageDataUrl?: string | null
    }) => services.wines.update(id, input),
    onSuccess: invalidate,
  })
}

export function useSetWineActive() {
  const invalidate = useInvalidateWines()
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => services.wines.setActive(id, active),
    onSuccess: invalidate,
  })
}

export function useDeleteWine() {
  const invalidate = useInvalidateWines()
  return useMutation({
    mutationFn: (id: string) => services.wines.delete(id),
    onSuccess: invalidate,
  })
}
