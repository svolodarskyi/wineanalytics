import { useQuery } from '@tanstack/react-query'
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
