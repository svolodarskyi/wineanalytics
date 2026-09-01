import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { services } from '../services'
import { queryKeys } from './queryKeys'

export function useInventoryAlerts() {
  return useQuery({
    queryKey: queryKeys.inventoryAlerts(),
    queryFn: () => services.alerts.listInventoryAlerts(),
  })
}

export function useDataQualityAlerts() {
  return useQuery({
    queryKey: queryKeys.dataQualityAlerts(),
    queryFn: () => services.alerts.listDataQualityAlerts(),
  })
}

export function useAlertThresholds() {
  return useQuery({
    queryKey: queryKeys.alertThresholds(),
    queryFn: () => services.alerts.listThresholds(),
  })
}

function useInvalidateAlerts() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: ['alerts'] })
}

export function useSetAlertThreshold() {
  const invalidate = useInvalidateAlerts()
  return useMutation({
    mutationFn: ({ wineId, minBottles }: { wineId: string; minBottles: number }) =>
      services.alerts.setThreshold(wineId, minBottles),
    onSuccess: invalidate,
  })
}

export function useDeleteAlertThreshold() {
  const invalidate = useInvalidateAlerts()
  return useMutation({
    mutationFn: (wineId: string) => services.alerts.deleteThreshold(wineId),
    onSuccess: invalidate,
  })
}

/** Manual "pull fresh state from the backend" action for the Alerts page's Reassess button - both alert types are live queries, so this is just an invalidate+refetch. */
export function useReassessAlerts() {
  const queryClient = useQueryClient()
  return () => {
    queryClient.invalidateQueries({ queryKey: ['alerts'] })
    queryClient.invalidateQueries({ queryKey: queryKeys.wineBalances() })
  }
}
