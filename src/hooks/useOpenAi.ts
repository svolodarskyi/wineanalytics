import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { services } from '../services'
import { queryKeys } from './queryKeys'

const POLL_MS = 3000

export function useOpenAiLogs() {
  return useQuery({
    queryKey: queryKeys.openAiLogs(),
    queryFn: () => services.openai.listLogs(),
    refetchInterval: POLL_MS,
  })
}

/** Sends 1-3 bottle photos to OpenAI and returns suggested name/volume/category - review before saving, same as OCR-extracted invoice fields. */
export function useExtractWine() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (imageDataUrls: string[]) => services.openai.extractWine({ imageDataUrls }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.openAiLogs() }),
  })
}
