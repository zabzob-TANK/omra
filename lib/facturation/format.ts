import type {
  BillingAnomalyType,
  BillingDataset,
  BillingStats,
  PaymentMode,
  ReceiptFinancialStatus,
  ReceiptLifecycleStatus,
} from '@/lib/facturation/types'

const moneyFormatter = new Intl.NumberFormat('fr-FR', {
  maximumFractionDigits: 0,
})

const dateFormatter = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

const dateTimeFormatter = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

export function formatDh(value: number) {
  return `${moneyFormatter.format(Math.round(value))} DH`
}

export function formatDate(value: string | null) {
  if (!value) return '—'
  return dateFormatter.format(new Date(value))
}

export function formatDateTime(value: string | null) {
  if (!value) return '—'
  return dateTimeFormatter.format(new Date(value))
}

export function isArabic(value: string | null | undefined) {
  return Boolean(value && /[\u0600-\u06ff]/.test(value))
}

export function paymentModeLabel(mode: PaymentMode) {
  return {
    cash: 'Espèces',
    cheque: 'Chèque',
    transfer: 'Virement',
  }[mode]
}

export function financialStatusLabel(status: ReceiptFinancialStatus) {
  return {
    incomplete: 'Incomplet',
    paid: 'Payé',
    overpaid: 'Trop-perçu',
  }[status]
}

export function lifecycleStatusLabel(status: ReceiptLifecycleStatus) {
  return status === 'cancelled' ? 'Annulé' : 'Actif'
}

export function anomalyLabel(type: BillingAnomalyType) {
  return {
    amount_due: 'Montant restant dû',
    overpayment: 'Trop-perçu à régulariser',
    cheque_missing_supporting_image: 'Chèque sans justificatif',
  }[type]
}

export function historyLabel(action: string) {
  const labels: Record<string, string> = {
    'billing_receipt.created': 'Reçu créé',
    'billing_receipt.first_payment_added': 'Premier paiement enregistré',
    'billing_receipt.payment_added': 'Paiement ajouté',
    'billing_receipt.commercial_data_updated': 'Données commerciales modifiées',
    'billing_receipt.identity_updated': 'Identité modifiée',
    'billing_receipt.phone_updated': 'Téléphone modifié',
    'billing_receipt.note_updated': 'Note modifiée',
    'billing_receipt.dossier_updated': 'Dossier modifié',
    'billing_receipt.first_payment_method_corrected': 'Moyen du premier paiement corrigé',
    'billing_receipt.cancelled': 'Reçu annulé',
    receipt_printed: 'Reçu imprimé',
    'payment_operation.evidence_attached': 'Justificatif ajouté',
    'payment_operation.evidence_deleted': 'Justificatif supprimé',
    'payment_operation.over_allocation_confirmed': 'Dépassement confirmé',
  }
  return labels[action] ?? action
}

export function calculateBillingStats(dataset: BillingDataset): BillingStats {
  const seenPayments = new Set<string>()
  let cash = 0
  let cheque = 0
  let transfer = 0

  for (const detail of Object.values(dataset.details)) {
    for (const payment of detail.payments) {
      if (seenPayments.has(payment.id)) continue
      seenPayments.add(payment.id)
      if (payment.payment_mode === 'cash') cash += payment.amount_dh
      if (payment.payment_mode === 'cheque') cheque += payment.amount_dh
      if (payment.payment_mode === 'transfer') transfer += payment.amount_dh
    }
  }

  return {
    totalCollected: dataset.receipts.reduce(
      (total, receipt) => total + receipt.total_paid_dh,
      0,
    ),
    cash,
    cheque,
    transfer,
    amountDue: dataset.receipts.reduce(
      (total, receipt) => total + receipt.amount_due_dh,
      0,
    ),
    overpayment: dataset.receipts.reduce(
      (total, receipt) => total + receipt.overpayment_dh,
      0,
    ),
    anomalies: dataset.anomalies.length,
  }
}

export function emptyBillingDataset(): BillingDataset {
  return {
    receipts: [],
    anomalies: [],
    details: {},
    reusableOperations: [],
    loadedAt: new Date().toISOString(),
  }
}
