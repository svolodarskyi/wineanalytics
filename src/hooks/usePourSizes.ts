import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { services, type ListOptions } from '../services'
import { queryKeys } from './queryKeys'

export function usePourSizes(options?: ListOptions) {
  return useQuery({
    queryKey: queryKeys.pourSizes(options),
    queryFn: () => services.pourSizes.list(options),
  })
}

function useInvalidatePourSizes() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: ['pour-sizes'] })
}

export function useCreatePourSize() {
  const invalidate = useInvalidatePourSizes()
  return useMutation({
    mutationFn: (input: { name: string; volumeMl: number }) => services.pourSizes.create(input),
    onSuccess: invalidate,
  })
}

export function useUpdatePourSize() {
  const invalidate = useInvalidatePourSizes()
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string; name: string; volumeMl: number }) =>
      services.pourSizes.update(id, input),
    onSuccess: invalidate,
  })
}

export function useSetPourSizeActive() {
  const invalidate = useInvalidatePourSizes()
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => services.pourSizes.setActive(id, active),
    onSuccess: invalidate,
  })
}

export function useDeletePourSize() {
  const invalidate = useInvalidatePourSizes()
  return useMutation({
    mutationFn: (id: string) => services.pourSizes.delete(id),
    onSuccess: invalidate,
  })
}
