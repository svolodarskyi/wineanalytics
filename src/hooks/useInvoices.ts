import { useMutation, useQuery, useQueryClient, type Query, type QueryClient } from '@tanstack/react-query'
import { services } from '../services'
import type { Invoice, InvoiceStatus } from '../types'
import { queryKeys } from './queryKeys'

const PROCESSING_POLL_MS = 1000

export function useInvoices(status?: InvoiceStatus | 'all') {
  return useQuery({
    queryKey: queryKeys.invoices(status),
    queryFn: () => services.invoices.list({ status }),
    refetchInterval: (query: Query<Invoice[]>) =>
      query.state.data?.some((invoice) => invoice.status === 'processing') ? PROCESSING_POLL_MS : false,
  })
}

export function useInvoice(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.invoice(id ?? ''),
    queryFn: () => services.invoices.get(id as string),
    enabled: Boolean(id),
    refetchInterval: (query: Query<Invoice | null>) =>
      query.state.data?.status === 'processing' ? PROCESSING_POLL_MS : false,
  })
}

function useInvalidateInvoices() {
  const queryClient = useQueryClient()
  return (invoiceId?: string) => {
    queryClient.invalidateQueries({ queryKey: ['invoices'] })
    if (invoiceId) {
      queryClient.invalidateQueries({ queryKey: queryKeys.invoice(invoiceId) })
    }
  }
}

/**
 * The Invoices list only polls (see useInvoices above) while it can already
 * see a "processing" row in its *own* result set - which a status-filtered
 * list (the Approved/Not Approved tabs) never can, since a processing
 * invoice is filtered out server-side. Without this, a newly uploaded
 * invoice would only show up under Not Approved once the user happened to
 * navigate away and back (a fresh query mount) - not as OCR/matching
 * actually finishes in the background. This keeps invalidating the shared
 * invoices cache, independent of any page staying mounted, until this
 * specific invoice leaves "processing".
 */
function pollUntilProcessed(queryClient: QueryClient, invoiceId: string, attempt = 0): void {
  if (attempt >= 30) return // ~30s safety cap
  setTimeout(async () => {
    const current = await services.invoices.get(invoiceId)
    queryClient.invalidateQueries({ queryKey: ['invoices'] })
    if (current?.status === 'processing') {
      pollUntilProcessed(queryClient, invoiceId, attempt + 1)
    }
  }, PROCESSING_POLL_MS)
}

export function useUploadInvoice() {
  const invalidate = useInvalidateInvoices()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { fileName: string; fileType: 'image' | 'pdf'; fileDataUrl: string }) =>
      services.invoices.upload(input),
    onSuccess: (invoice) => {
      invalidate()
      if (invoice.status === 'processing') {
        pollUntilProcessed(queryClient, invoice.id)
      }
    },
  })
}

export function useConfirmVendorMatch() {
  const invalidate = useInvalidateInvoices()
  return useMutation({
    mutationFn: (invoiceId: string) => services.invoices.confirmVendorMatch(invoiceId),
    onSuccess: (invoice) => invalidate(invoice.id),
  })
}

export function useSelectVendorMatch() {
  const invalidate = useInvalidateInvoices()
  return useMutation({
    mutationFn: ({ invoiceId, vendorId }: { invoiceId: string; vendorId: string }) =>
      services.invoices.selectVendorMatch(invoiceId, vendorId),
    onSuccess: (invoice) => invalidate(invoice.id),
  })
}

export function useConfirmSkuMatch() {
  const invalidate = useInvalidateInvoices()
  return useMutation({
    mutationFn: ({ invoiceId, lineItemId }: { invoiceId: string; lineItemId: string }) =>
      services.invoices.confirmSkuMatch(invoiceId, lineItemId),
    onSuccess: (invoice) => invalidate(invoice.id),
  })
}

export function useSelectSkuMatch() {
  const invalidate = useInvalidateInvoices()
  return useMutation({
    mutationFn: ({ invoiceId, lineItemId, wineId }: { invoiceId: string; lineItemId: string; wineId: string }) =>
      services.invoices.selectSkuMatch(invoiceId, lineItemId, wineId),
    onSuccess: (invoice) => invalidate(invoice.id),
  })
}

export function useUpdateInvoiceDate() {
  const invalidate = useInvalidateInvoices()
  return useMutation({
    mutationFn: ({ invoiceId, invoiceDate }: { invoiceId: string; invoiceDate: string | null }) =>
      services.invoices.updateInvoiceDate(invoiceId, invoiceDate),
    onSuccess: (invoice) => invalidate(invoice.id),
  })
}

export function useApproveInvoice() {
  const invalidate = useInvalidateInvoices()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (invoiceId: string) => services.invoices.approve(invoiceId),
    onSuccess: (invoice) => {
      invalidate(invoice.id)
      queryClient.invalidateQueries({ queryKey: ['wines'] })
    },
  })
}

export function useDiscardInvoice() {
  const invalidate = useInvalidateInvoices()
  return useMutation({
    mutationFn: (invoiceId: string) => services.invoices.discard(invoiceId),
    onSuccess: (_data, invoiceId) => invalidate(invoiceId),
  })
}
