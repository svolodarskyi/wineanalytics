import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { services } from '../services'
import { queryKeys } from './queryKeys'

export function useSales(wineId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.sales(wineId ?? ''),
    queryFn: () => services.sales.list(wineId as string),
    enabled: Boolean(wineId),
  })
}

/** A sale changes the wine's Ending Bottles balance and can trip the inventory/sales-quality alerts, so all three need to be refetched alongside the sale list itself. */
function useInvalidateAfterSale(wineId: string) {
  const queryClient = useQueryClient()
  return () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.sales(wineId) })
    queryClient.invalidateQueries({ queryKey: queryKeys.wineBalances() })
    queryClient.invalidateQueries({ queryKey: ['alerts'] })
  }
}

export function useCreateSale(wineId: string) {
  const invalidate = useInvalidateAfterSale(wineId)
  return useMutation({
    mutationFn: (input: {
      soldAt: string
      pourSizeId?: string | null
      volumeMl?: number
      quantity?: number
      amount?: number | null
    }) => services.sales.create({ wineId, ...input }),
    onSuccess: invalidate,
  })
}

export function useDeleteSale(wineId: string) {
  const invalidate = useInvalidateAfterSale(wineId)
  return useMutation({
    mutationFn: (id: string) => services.sales.delete(id),
    onSuccess: invalidate,
  })
}
