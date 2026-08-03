import { AlertTriangle, Ban, CheckCircle2, Clock3, TrendingUp } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { financialStatusLabel } from '@/lib/facturation/format'
import type { BillingReceiptRow } from '@/lib/facturation/types'

export function ReceiptStatusBadge({
  receipt,
  className,
}: {
  receipt: Pick<BillingReceiptRow, 'lifecycle_status' | 'financial_status'>
  className?: string
}) {
  if (receipt.lifecycle_status === 'cancelled') {
    return (
      <Badge variant="outline" className={cn('border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300', className)}>
        <Ban /> Annulé
      </Badge>
    )
  }
  if (receipt.financial_status === 'paid') {
    return (
      <Badge variant="outline" className={cn('border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300', className)}>
        <CheckCircle2 /> Payé
      </Badge>
    )
  }
  if (receipt.financial_status === 'overpaid') {
    return (
      <Badge variant="outline" className={cn('border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/60 dark:text-violet-300', className)}>
        <TrendingUp /> {financialStatusLabel(receipt.financial_status)}
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className={cn('border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/60 dark:text-amber-300', className)}>
      <Clock3 /> Incomplet
    </Badge>
  )
}

export function AnomalyBadge({ count }: { count: number }) {
  return (
    <Badge variant={count ? 'destructive' : 'secondary'}>
      <AlertTriangle /> {count} anomalie{count > 1 ? 's' : ''}
    </Badge>
  )
}
