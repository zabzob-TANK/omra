import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { emptyBillingDataset } from '@/lib/facturation/format'
import type {
  BillingAnomaly,
  BillingDashboardResult,
  BillingReceiptDetail,
  BillingReceiptRow,
  ReusablePaymentOperation,
} from '@/lib/facturation/types'

function messageFromError(error: { message?: string } | null) {
  const message = error?.message?.trim()
  if (!message) return 'Impossible de charger les données de Facturation.'
  if (message === 'Facturation access denied') {
    return 'Votre compte ne dispose pas d’un accès actif à la Facturation.'
  }
  return message
}

export async function loadBillingDashboard(seasonId: string | null): Promise<BillingDashboardResult> {
  const supabase = await createClient()
  const empty = emptyBillingDataset()

  const receipts: BillingReceiptRow[] = []
  const anomalies: BillingAnomaly[] = []
  let reusableOperations: ReusablePaymentOperation[] = []
  const pageSize = 200

  for (let offset = 0; ; offset += pageSize) {
    const result = await supabase.rpc('list_billing_receipts', {
      p_season_id: seasonId,
      p_limit: pageSize,
      p_offset: offset,
    })
    if (result.error) return { ok: false, message: messageFromError(result.error), data: empty }
    const page = (result.data ?? []) as BillingReceiptRow[]
    receipts.push(...page)
    if (page.length < pageSize) break
  }

  const reusableResult = await supabase.rpc('list_reusable_payment_operations', {
    p_payment_mode: null,
  })
  const reusableRpcUnavailable = Boolean(
    reusableResult.error && (
      reusableResult.error.code === 'PGRST202' ||
      reusableResult.error.message?.includes('list_reusable_payment_operations')
    ),
  )
  if (reusableResult.error && !reusableRpcUnavailable) {
    return { ok: false, message: messageFromError(reusableResult.error), data: empty }
  }
  if (!reusableResult.error) {
    reusableOperations = (reusableResult.data ?? []) as ReusablePaymentOperation[]
  }

  for (let offset = 0; ; offset += pageSize) {
    const result = await supabase.rpc('list_billing_anomalies', {
      p_season_id: seasonId,
      p_limit: pageSize,
      p_offset: offset,
    })
    if (result.error) return { ok: false, message: messageFromError(result.error), data: empty }
    const page = (result.data ?? []) as BillingAnomaly[]
    anomalies.push(...page)
    if (page.length < pageSize) break
  }

  const detailEntries: Array<readonly [string, BillingReceiptDetail]> = []
  let detailFailures = 0
  for (let offset = 0; offset < receipts.length; offset += 20) {
    const batch = receipts.slice(offset, offset + 20)
    const entries = await Promise.all(batch.map(async (receipt) => {
      const [detailResult, printResult] = await Promise.all([
        supabase.rpc('get_billing_receipt_details', { p_receipt_id: receipt.receipt_id }),
        supabase.rpc('get_billing_receipt_print_summary', { p_receipt_id: receipt.receipt_id }),
      ])
      if (detailResult.error || !detailResult.data) return null
      const printRpcUnavailable = Boolean(
        printResult.error && (
          printResult.error.code === 'PGRST202' ||
          printResult.error.message?.includes('get_billing_receipt_print_summary')
        ),
      )
      if (printResult.error && !printRpcUnavailable) return null
      const printRow = Array.isArray(printResult.data) ? printResult.data[0] : printResult.data
      const detail = detailResult.data as Omit<BillingReceiptDetail, 'printing'>
      return [receipt.receipt_id, {
        ...detail,
        printing: {
          count: Number(printRow?.print_count ?? 0),
          last_printed_at: printRow?.last_printed_at ?? null,
          last_printed_by_slot_number: printRow?.last_printed_by_slot_number ?? null,
          last_printed_by_slot_label: printRow?.last_printed_by_slot_label ?? null,
        },
      } satisfies BillingReceiptDetail] as const
    }))
    for (const entry of entries) {
      if (entry) detailEntries.push(entry)
      else detailFailures += 1
    }
  }

  const details = Object.fromEntries(
    detailEntries,
  )

  const data = { receipts, anomalies, details, reusableOperations, loadedAt: new Date().toISOString() }
  if (detailFailures > 0) {
    return { ok: false, message: `${detailFailures} fiche(s) de reçu n’ont pas pu être chargées. Les actions correspondantes sont indisponibles.`, data }
  }
  return { ok: true, data }
}
