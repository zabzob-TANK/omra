'use client'

import {
  AlertTriangle,
  Ban,
  Banknote,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileImage,
  History,
  Hotel,
  Pencil,
  Plus,
  ReceiptText,
  UserRound,
  WalletCards,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  anomalyLabel,
  formatDate,
  formatDateTime,
  formatDh,
  historyLabel,
  isArabic,
  paymentModeLabel,
} from '@/lib/facturation/format'
import type { BillingReceiptDetail, BillingReceiptRow } from '@/lib/facturation/types'
import { ReceiptStatusBadge } from '@/components/facturation/receipt-status-badge'
import { cn } from '@/lib/utils'

function ArabicValue({ value, className }: { value: string; className?: string }) {
  return (
    <span
      dir={isArabic(value) ? 'rtl' : 'ltr'}
      className={cn(isArabic(value) && 'text-right', className)}
    >
      {value}
    </span>
  )
}

function InfoItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 truncate text-sm font-medium text-foreground">{children}</dd>
    </div>
  )
}

function ReadOnlyActions({ cancelled }: { cancelled: boolean }) {
  const title = 'Cette action sera connectée lors d’une prochaine étape.'
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" disabled title={title}><Plus /> Ajouter un paiement</Button>
      <Button size="sm" variant="outline" disabled title={title}><Pencil /> Modifier</Button>
      <Button size="sm" variant="destructive" disabled title={title}><Ban /> {cancelled ? 'Reçu annulé' : 'Annuler'}</Button>
    </div>
  )
}

export function ReceiptDetailDialog({
  receipt,
  detail,
  open,
  onOpenChange,
}: {
  receipt: BillingReceiptRow | null
  detail: BillingReceiptDetail | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  if (!receipt) return null

  const travelerName = `${receipt.traveler_first_name_snapshot} ${receipt.traveler_last_name_snapshot}`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto p-0 sm:max-w-5xl">
        <div className="sticky top-0 z-10 border-b bg-popover/95 px-5 py-4 backdrop-blur">
          <DialogHeader className="pr-10">
            <div className="flex flex-wrap items-center gap-2">
              <DialogTitle className="text-lg">Reçu n° {receipt.receipt_number}</DialogTitle>
              <ReceiptStatusBadge receipt={receipt} />
              {receipt.has_active_anomaly ? <Badge variant="destructive"><AlertTriangle /> Anomalie active</Badge> : null}
            </div>
            <DialogDescription>
              Dossier {receipt.visible_dossier_reference ?? 'sans référence visible'} · créé le {formatDate(receipt.receipt_created_at)}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="space-y-5 p-5">
          <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
            <ReadOnlyActions cancelled={receipt.lifecycle_status === 'cancelled'} />
            <p className="text-xs text-muted-foreground">Consultation uniquement — aucune écriture n’est activée</p>
          </div>

          <section aria-labelledby="receipt-summary-title">
            <h3 id="receipt-summary-title" className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <UserRound className="size-4" /> Voyageur et séjour
            </h3>
            <Card className="shadow-none">
              <CardContent className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
                <InfoItem label="Voyageur"><ArabicValue value={travelerName} /></InfoItem>
                <InfoItem label="Téléphone">{receipt.traveler_phone_snapshot ?? '—'}</InfoItem>
                <InfoItem label="Dossier">{receipt.visible_dossier_reference ?? '—'}</InfoItem>
                <InfoItem label="Saison">{receipt.season_name_snapshot}</InfoItem>
                <InfoItem label="Hôtel"><ArabicValue value={receipt.hotel_name_snapshot} /></InfoItem>
                <InfoItem label="Vol">{receipt.flight_label_snapshot}</InfoItem>
                <InfoItem label="Chambre">{receipt.room_bed_count_snapshot} places</InfoItem>
                <InfoItem label="Rabatteur">{detail?.registration.rabatteur_name_snapshot ?? '—'}</InfoItem>
              </CardContent>
            </Card>
          </section>

          <section aria-labelledby="financial-title">
            <h3 id="financial-title" className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <WalletCards className="size-4" /> Situation financière
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ['Montant convenu', receipt.agreed_amount_dh, 'text-foreground'],
                ['Montant payé', receipt.total_paid_dh, 'text-emerald-700 dark:text-emerald-300'],
                ['Reste dû', receipt.amount_due_dh, 'text-amber-700 dark:text-amber-300'],
                ['Trop-perçu', receipt.overpayment_dh, 'text-violet-700 dark:text-violet-300'],
              ].map(([label, value, tone]) => (
                <Card key={String(label)} className="shadow-none">
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className={cn('mt-1 text-lg font-semibold tabular-nums', tone)}>{formatDh(Number(value))}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          {receipt.lifecycle_status === 'cancelled' && detail?.receipt.cancellation ? (
            <section className="rounded-xl border border-slate-300 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/60" aria-label="Annulation du reçu">
              <div className="flex items-start gap-3">
                <Ban className="mt-0.5 size-5 shrink-0 text-slate-600 dark:text-slate-300" />
                <div className="space-y-2">
                  <h3 className="font-semibold">Reçu annulé</h3>
                  <p className="text-sm text-muted-foreground">{detail.receipt.cancellation.reason}</p>
                  <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
                    <span>Annulé : {formatDh(detail.receipt.cancellation.total_cancelled_dh)}</span>
                    <span>Sortie espèces : {formatDh(detail.receipt.cancellation.cash_outflow_amount_dh)}</span>
                    <span>{formatDateTime(detail.receipt.cancellation.cancelled_at)}</span>
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          <section aria-labelledby="payments-title">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 id="payments-title" className="flex items-center gap-2 text-sm font-semibold">
                <Banknote className="size-4" /> Paiements ({detail?.payments.length ?? receipt.payment_count})
              </h3>
            </div>
            {!detail ? (
              <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                Le détail de ce reçu n’a pas pu être chargé.
              </div>
            ) : (
              <div className="space-y-2">
                {detail.payments.map((payment) => (
                  <div key={payment.id} className="grid gap-3 rounded-xl border bg-card p-3 sm:grid-cols-[auto_1fr_auto] sm:items-center">
                    <span className="flex size-9 items-center justify-center rounded-full bg-muted text-xs font-semibold">{payment.payment_number}</span>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{paymentModeLabel(payment.payment_mode)}</p>
                        {payment.usage_kind === 'shared' ? <Badge variant="secondary">Opération partagée</Badge> : null}
                      </div>
                      <p className="text-xs text-muted-foreground">{formatDateTime(payment.registered_at)} · {payment.created_by.slot_label}</p>
                    </div>
                    <p className="font-semibold tabular-nums sm:text-right">{formatDh(payment.amount_dh)}</p>
                  </div>
                ))}
              </div>
            )}
          </section>

          {detail?.operations.length ? (
            <section aria-labelledby="operations-title">
              <h3 id="operations-title" className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <Building2 className="size-4" /> Opérations et justificatifs
              </h3>
              <div className="grid gap-3 lg:grid-cols-2">
                {detail.operations.map((operation) => (
                  <Card key={operation.id} className="shadow-none">
                    <CardContent className="space-y-3 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">{paymentModeLabel(operation.payment_mode)}</p>
                          <p className="text-xs text-muted-foreground">{operation.usage_kind === 'shared' ? 'Opération partagée' : 'Opération unique'}</p>
                        </div>
                        <p className="font-semibold tabular-nums">{formatDh(operation.operation_amount_dh)}</p>
                      </div>
                      {operation.instrument ? (
                        <dl className="grid grid-cols-2 gap-3 text-xs">
                          <InfoItem label="Référence">{operation.instrument.reference}</InfoItem>
                          <InfoItem label="Banque">{operation.instrument.bank_name}</InfoItem>
                          <InfoItem label="Date">{formatDate(operation.instrument.instrument_date)}</InfoItem>
                          <InfoItem label="Payeur">{operation.instrument.payer_name}</InfoItem>
                        </dl>
                      ) : null}
                      {operation.payment_mode !== 'cash' ? (
                        operation.supporting_image ? (
                          <div className="flex items-center gap-3 rounded-lg bg-emerald-50 p-3 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200">
                            <FileImage className="size-5 shrink-0" />
                            <div className="min-w-0">
                              <p className="text-xs font-medium">Justificatif disponible</p>
                              <p className="truncate text-xs opacity-80">{operation.supporting_image.original_file_name}</p>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-3 rounded-lg bg-amber-50 p-3 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
                            <AlertTriangle className="size-5 shrink-0" />
                            <p className="text-xs font-medium">Aucun justificatif actif</p>
                          </div>
                        )
                      ) : null}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          ) : null}

          {detail?.active_anomalies.length ? (
            <section aria-labelledby="detail-anomalies-title">
              <h3 id="detail-anomalies-title" className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <AlertTriangle className="size-4" /> Anomalies actives
              </h3>
              <div className="space-y-2">
                {detail.active_anomalies.map((anomaly, index) => (
                  <div key={`${anomaly.type}-${index}`} className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/40">
                    <span>{anomalyLabel(anomaly.type)}</span>
                    {anomaly.amount_dh !== null ? <strong>{formatDh(anomaly.amount_dh)}</strong> : null}
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section aria-labelledby="history-title">
            <h3 id="history-title" className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <History className="size-4" /> Historique
            </h3>
            {!detail?.history.length ? (
              <div className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">Aucun événement à afficher.</div>
            ) : (
              <div className="relative space-y-0 pl-5 before:absolute before:bottom-3 before:left-[7px] before:top-3 before:w-px before:bg-border">
                {detail.history.map((event) => (
                  <div key={event.id} className="relative pb-4 pl-4 last:pb-0">
                    <span className="absolute -left-5 top-1.5 size-2 rounded-full bg-primary ring-4 ring-background" />
                    <div className="flex flex-col justify-between gap-1 sm:flex-row sm:items-start">
                      <div>
                        <p className="text-sm font-medium">{historyLabel(event.action_type)}</p>
                        <p className="text-xs text-muted-foreground">{event.actor_slot_label}{event.reason ? ` · ${event.reason}` : ''}</p>
                      </div>
                      <time className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                        <Clock3 className="size-3" /> {formatDateTime(event.occurred_at)}
                      </time>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <div className="flex flex-wrap items-center gap-4 border-t pt-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><CalendarDays className="size-3" /> Créé le {formatDateTime(receipt.receipt_created_at)}</span>
            <span className="flex items-center gap-1"><Hotel className="size-3" /> {receipt.hotel_name_snapshot}</span>
            <span className="flex items-center gap-1"><ReceiptText className="size-3" /> {receipt.payment_count} paiement{receipt.payment_count > 1 ? 's' : ''}</span>
            {!receipt.has_active_anomaly ? <span className="flex items-center gap-1 text-emerald-600"><CheckCircle2 className="size-3" /> Aucun signalement actif</span> : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
