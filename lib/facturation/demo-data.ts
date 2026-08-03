import type {
  BillingAnomaly,
  BillingDataset,
  BillingHistoryEvent,
  BillingOperation,
  BillingPayment,
  BillingReceiptDetail,
  BillingReceiptRow,
  PaymentMode,
  PaymentUsage,
} from '@/lib/facturation/types'

const seasonId = '00000000-0000-4000-8000-000000002027'
const createdBy = {
  slot_number: 2,
  slot_label: 'Employé 1',
  login: 'employe.demo',
}

type DemoReceiptInput = {
  id: string
  number: number
  dossier: string
  firstName: string
  lastName: string
  hotel: string
  paid: number
  agreed: number
  mode: PaymentMode
  usage?: PaymentUsage
  lifecycle?: 'active' | 'cancelled'
  date: string
  hasEvidence?: boolean
  paymentCount?: number
}

function receipt(input: DemoReceiptInput): BillingReceiptRow {
  const amountDue = Math.max(input.agreed - input.paid, 0)
  const overpayment = Math.max(input.paid - input.agreed, 0)
  const financialStatus = amountDue > 0 ? 'incomplete' : overpayment > 0 ? 'overpaid' : 'paid'
  const cancelled = input.lifecycle === 'cancelled'
  const missingCheque = input.mode === 'cheque' && !input.hasEvidence
  const anomalyType = missingCheque
    ? 'cheque_missing_supporting_image'
    : amountDue > 0
      ? 'amount_due'
      : overpayment > 0
        ? 'overpayment'
        : null

  return {
    receipt_id: input.id,
    season_id: seasonId,
    season_name_snapshot: 'Omra Ramadan 2027',
    season_code_snapshot: 'OMRA-2027',
    receipt_number: input.number,
    receipt_created_at: input.date,
    lifecycle_status: cancelled ? 'cancelled' : 'active',
    cancelled_at: cancelled ? '2026-07-28T16:30:00.000Z' : null,
    registration_id: `${input.id}-registration`,
    traveler_id: `${input.id}-traveler`,
    dossier_id: `${input.id}-dossier`,
    visible_dossier_reference: input.dossier,
    traveler_first_name_snapshot: input.firstName,
    traveler_last_name_snapshot: input.lastName,
    traveler_phone_snapshot: '06 12 34 56 78',
    hotel_name_snapshot: input.hotel,
    flight_label_snapshot: 'AT 208 — Casablanca / Médine',
    room_label_snapshot: '4',
    room_bed_count_snapshot: 4,
    catalog_price_dh: input.agreed + 1_000,
    maximum_discount_applied_dh: 3_000,
    discount_amount_dh: 1_000,
    agreed_amount_dh: input.agreed,
    payment_count: input.paymentCount ?? 1,
    total_paid_dh: input.paid,
    amount_due_dh: amountDue,
    overpayment_dh: overpayment,
    financial_status: financialStatus,
    has_active_anomaly: Boolean(anomalyType),
    primary_anomaly_type: anomalyType,
    primary_anomaly_amount_dh: missingCheque ? null : amountDue || overpayment || null,
    modification_count: input.number % 3,
    last_modified_at: input.number % 3 ? '2026-07-27T14:20:00.000Z' : null,
    last_modified_by_slot_label: input.number % 3 ? 'Employé 1' : null,
    last_modified_by_login: input.number % 3 ? 'employe.demo' : null,
    last_modified_domain: input.number % 3 ? 'commercial' : null,
    payment_operation_count: input.paymentCount ?? 1,
    has_cheque_missing_supporting_image: missingCheque,
    total_rows: 6,
  }
}

const receipts: BillingReceiptRow[] = [
  receipt({
    id: 'demo-receipt-1', number: 127, dossier: 'FAM-2027-031',
    firstName: 'Yasmine', lastName: 'El Mansouri', hotel: 'Al Manar',
    paid: 24_500, agreed: 24_500, mode: 'cash', date: '2026-07-31T09:12:00.000Z',
    paymentCount: 3,
  }),
  receipt({
    id: 'demo-receipt-2', number: 126, dossier: 'FAM-2027-030',
    firstName: 'أحمد', lastName: 'العلوي', hotel: 'فندق دار التقوى',
    paid: 12_000, agreed: 25_000, mode: 'cheque', usage: 'shared',
    date: '2026-07-30T15:42:00.000Z', paymentCount: 2,
  }),
  receipt({
    id: 'demo-receipt-3', number: 125, dossier: 'GRP-2027-008',
    firstName: 'Samira', lastName: 'Bennani', hotel: 'Mövenpick Anwar Al Madinah',
    paid: 26_000, agreed: 25_000, mode: 'transfer', date: '2026-07-29T11:06:00.000Z',
    paymentCount: 2,
  }),
  receipt({
    id: 'demo-receipt-4', number: 124, dossier: 'FAM-2027-029',
    firstName: 'محمد', lastName: 'بناني', hotel: 'فندق الصفوة',
    paid: 8_000, agreed: 23_000, mode: 'cheque', lifecycle: 'cancelled',
    date: '2026-07-28T08:55:00.000Z', hasEvidence: true,
  }),
  receipt({
    id: 'demo-receipt-5', number: 123, dossier: 'GRP-2027-008',
    firstName: 'Nadia', lastName: 'Lahlou', hotel: 'Al Manar',
    paid: 22_000, agreed: 22_000, mode: 'cheque', usage: 'shared',
    date: '2026-07-27T16:18:00.000Z', hasEvidence: true,
  }),
  receipt({
    id: 'demo-receipt-6', number: 122, dossier: 'FAM-2027-027',
    firstName: 'Omar', lastName: 'Tazi', hotel: 'Anjum Hotel Makkah',
    paid: 10_000, agreed: 24_000, mode: 'transfer', date: '2026-07-26T10:20:00.000Z',
  }),
]

function history(input: DemoReceiptInput): BillingHistoryEvent[] {
  const base: BillingHistoryEvent[] = [
    {
      id: `${input.id}-history-created`,
      entity_type: 'billing_receipt',
      entity_id: input.id,
      action_type: 'billing_receipt.created',
      domain: 'receipt',
      reason: null,
      occurred_at: input.date,
      actor_slot_number: 2,
      actor_slot_label: 'Employé 1',
      actor_login: 'employe.demo',
      before_data: null,
      after_data: { receipt_number: input.number },
      correlation_id: `${input.id}-correlation`,
    },
    {
      id: `${input.id}-history-payment`,
      entity_type: 'billing_receipt',
      entity_id: input.id,
      action_type: 'billing_receipt.first_payment_added',
      domain: 'payment',
      reason: null,
      occurred_at: input.date,
      actor_slot_number: 2,
      actor_slot_label: 'Employé 1',
      actor_login: 'employe.demo',
      before_data: null,
      after_data: { payment_number: 1 },
      correlation_id: `${input.id}-correlation`,
    },
  ]

  if (input.lifecycle === 'cancelled') {
    base.unshift({
      id: `${input.id}-history-cancelled`,
      entity_type: 'billing_receipt',
      entity_id: input.id,
      action_type: 'billing_receipt.cancelled',
      domain: 'receipt',
      reason: 'Voyage annulé à la demande du client',
      occurred_at: '2026-07-28T16:30:00.000Z',
      actor_slot_number: 1,
      actor_slot_label: 'Administrateur',
      actor_login: 'admin.demo',
      before_data: { lifecycle_status: 'active' },
      after_data: { lifecycle_status: 'cancelled' },
      correlation_id: `${input.id}-cancel-correlation`,
    })
  }
  return base
}

function detail(input: DemoReceiptInput, row: BillingReceiptRow): BillingReceiptDetail {
  const paymentCount = input.paymentCount ?? 1
  const paymentAmounts = Array.from({ length: paymentCount }, (_, index) => {
    const base = Math.floor(input.paid / paymentCount)
    return index === paymentCount - 1 ? input.paid - base * index : base
  })
  const shared = input.usage === 'shared'
  const operationId = shared ? 'demo-shared-operation-1' : `${input.id}-operation`
  const programLabel = `${row.hotel_name_snapshot} / غرفة ${row.room_label_snapshot} / ${row.flight_label_snapshot}`
  let cumulativePaid = 0
  const payments: BillingPayment[] = paymentAmounts.map((amount, index) => {
    cumulativePaid += amount
    const remainingAfter = Math.max(row.agreed_amount_dh - cumulativePaid, 0)
    return {
      id: `${input.id}-payment-${index + 1}`,
      payment_number: index + 1,
      amount_dh: amount,
      registered_at: new Date(new Date(input.date).getTime() + index * 86_400_000).toISOString(),
      created_by: createdBy,
      allocation_id: `${input.id}-allocation-${index + 1}`,
      allocation_count: 1,
      has_expected_allocation: true,
      payment_operation_id: index === 0 ? operationId : `${input.id}-operation-${index + 1}`,
      payment_mode: input.mode,
      usage_kind: index === 0 && shared ? 'shared' : 'unique',
      snapshot: {
        client_name: `${input.firstName} ${input.lastName}`,
        hotel_name: row.hotel_name_snapshot,
        room_label: row.room_label_snapshot,
        flight_label: row.flight_label_snapshot,
        program_label: programLabel,
        agreed_amount_dh: row.agreed_amount_dh,
        rabatteur_name: null,
        remaining_after_dh: remainingAfter,
        settled_after: remainingAfter <= 0,
      },
    }
  })
  const operations: BillingOperation[] = payments.map((payment, index) => ({
    id: payment.payment_operation_id!,
    payment_mode: payment.payment_mode,
    usage_kind: payment.usage_kind,
    operation_amount_dh: index === 0 && shared ? 40_000 : payment.amount_dh,
    allocated_total_dh: index === 0 && shared ? 34_000 : payment.amount_dh,
    remaining_amount_dh: index === 0 && shared ? 6_000 : 0,
    registered_at: payment.registered_at,
    created_by: createdBy,
    over_allocation_confirmation: null,
    instrument: input.mode === 'cash' ? null : {
      reference: input.mode === 'cheque' ? 'CHQ-008472' : 'VIR-2027-041',
      bank_name: 'Banque Populaire',
      instrument_date: '2026-07-29',
      payer_name: 'Chef de famille',
    },
    has_active_supporting_image: Boolean(input.hasEvidence),
    supporting_image: input.hasEvidence ? {
      id: `${input.id}-evidence`,
      storage_bucket: 'facturation-justificatifs',
      storage_path: `${operationId}/document-demo.png`,
      original_file_name: 'justificatif-paiement.png',
      mime_type: 'image/png',
      file_size_bytes: 184_320,
      file_hash: 'demo-only',
      uploaded_at: input.date,
      uploaded_by: createdBy,
    } : null,
  }))

  return {
    receipt: {
      id: row.receipt_id,
      season_id: row.season_id,
      season_name_snapshot: row.season_name_snapshot,
      season_code_snapshot: row.season_code_snapshot,
      receipt_number: row.receipt_number,
      lifecycle_status: row.lifecycle_status,
      created_at: row.receipt_created_at,
      created_by: createdBy,
      cancellation: row.lifecycle_status === 'cancelled' ? {
        id: `${input.id}-cancellation`,
        cancelled_at: row.cancelled_at!,
        reason: 'Voyage annulé à la demande du client',
        restitution_route: 'cash_register',
        total_cancelled_dh: row.total_paid_dh,
        cash_outflow_amount_dh: 3_000,
        cancelled_by: { ...createdBy, slot_number: 1, slot_label: 'Administrateur' },
      } : null,
      financial: {
        payment_count: row.payment_count,
        total_paid_dh: row.total_paid_dh,
        amount_due_dh: row.amount_due_dh,
        overpayment_dh: row.overpayment_dh,
        financial_status: row.financial_status,
      },
    },
    registration: {
      id: row.registration_id,
      traveler_id: row.traveler_id,
      dossier: { id: row.dossier_id, reference: row.visible_dossier_reference, label: 'Famille / groupe' },
      program_id: 'demo-program-2027',
      season_id: row.season_id,
      season_name_snapshot: row.season_name_snapshot,
      season_code_snapshot: row.season_code_snapshot,
      first_name_snapshot: row.traveler_first_name_snapshot,
      last_name_snapshot: row.traveler_last_name_snapshot,
      phone_snapshot: row.traveler_phone_snapshot,
      note: 'Départ souhaité avec le groupe familial.',
      hotel_id: `${input.id}-hotel`,
      hotel_name_snapshot: row.hotel_name_snapshot,
      flight_id: `${input.id}-flight`,
      flight_label_snapshot: row.flight_label_snapshot,
      room_id: `${input.id}-room`,
      room_label_snapshot: row.room_label_snapshot,
      room_bed_count_snapshot: row.room_bed_count_snapshot,
      rabatteur_id: 'demo-referrer',
      rabatteur_name_snapshot: 'Agence partenaire',
      price_id: `${input.id}-price`,
      catalog_price_dh: row.catalog_price_dh,
      maximum_discount_applied_dh: row.maximum_discount_applied_dh,
      discount_amount_dh: row.discount_amount_dh,
      agreed_amount_dh: row.agreed_amount_dh,
      registered_at: row.receipt_created_at,
      registered_by_slot_number: 2,
    },
    payments,
    operations,
    active_anomalies: row.primary_anomaly_type ? [{
      type: row.primary_anomaly_type,
      amount_dh: row.primary_anomaly_amount_dh,
      receipt_id: row.receipt_id,
      operation_id: row.has_cheque_missing_supporting_image ? operationId : null,
      last_changed_at: row.last_modified_at ?? row.receipt_created_at,
    }] : [],
    modifications: {
      count: row.modification_count,
      last: row.last_modified_at ? {
        action_type: 'billing_receipt.commercial_data_updated',
        domain: 'commercial',
        occurred_at: row.last_modified_at,
        actor_slot_number: 2,
        actor_slot_label: 'Employé 1',
        actor_login: 'employe.demo',
      } : null,
    },
    printing: {
      count: input.number % 4,
      last_printed_at: input.number % 4 ? row.receipt_created_at : null,
      last_printed_by_slot_number: input.number % 4 ? 2 : null,
      last_printed_by_slot_label: input.number % 4 ? 'Employé 1' : null,
    },
    history: history(input),
    consistency: {
      payments_without_exactly_one_allocation: 0,
      bank_operations_without_instrument_details: 0,
      cash_operations_with_instrument_details: 0,
      cash_operations_with_active_images: 0,
      operations_with_multiple_active_images: 0,
      unique_operations_with_amount_mismatch: 0,
    },
  }
}

const inputs: DemoReceiptInput[] = [
  { id:'demo-receipt-1',number:127,dossier:'FAM-2027-031',firstName:'Yasmine',lastName:'El Mansouri',hotel:'Al Manar',paid:24_500,agreed:24_500,mode:'cash',date:'2026-07-31T09:12:00.000Z',paymentCount:3 },
  { id:'demo-receipt-2',number:126,dossier:'FAM-2027-030',firstName:'أحمد',lastName:'العلوي',hotel:'فندق دار التقوى',paid:12_000,agreed:25_000,mode:'cheque',usage:'shared',date:'2026-07-30T15:42:00.000Z',paymentCount:2 },
  { id:'demo-receipt-3',number:125,dossier:'GRP-2027-008',firstName:'Samira',lastName:'Bennani',hotel:'Mövenpick Anwar Al Madinah',paid:26_000,agreed:25_000,mode:'transfer',date:'2026-07-29T11:06:00.000Z',paymentCount:2 },
  { id:'demo-receipt-4',number:124,dossier:'FAM-2027-029',firstName:'محمد',lastName:'بناني',hotel:'فندق الصفوة',paid:8_000,agreed:23_000,mode:'cheque',lifecycle:'cancelled',date:'2026-07-28T08:55:00.000Z',hasEvidence:true },
  { id:'demo-receipt-5',number:123,dossier:'GRP-2027-008',firstName:'Nadia',lastName:'Lahlou',hotel:'Al Manar',paid:22_000,agreed:22_000,mode:'cheque',usage:'shared',date:'2026-07-27T16:18:00.000Z',hasEvidence:true },
  { id:'demo-receipt-6',number:122,dossier:'FAM-2027-027',firstName:'Omar',lastName:'Tazi',hotel:'Anjum Hotel Makkah',paid:10_000,agreed:24_000,mode:'transfer',date:'2026-07-26T10:20:00.000Z' },
]

const details = Object.fromEntries(
  inputs.map((input, index) => [input.id, detail(input, receipts[index])]),
)

const anomalies: BillingAnomaly[] = receipts
  .filter((item) => item.primary_anomaly_type)
  .map((item) => ({
    anomaly_id: `demo-anomaly-${item.receipt_id}`,
    anomaly_type: item.primary_anomaly_type!,
    amount_dh: item.primary_anomaly_amount_dh,
    receipt_id: item.receipt_id,
    operation_id: item.has_cheque_missing_supporting_image ? 'demo-shared-operation-1' : null,
    related_receipt_ids: item.has_cheque_missing_supporting_image
      ? ['demo-receipt-2', 'demo-receipt-5']
      : [item.receipt_id],
    related_season_ids: [seasonId],
    appeared_at: item.receipt_created_at,
    last_changed_at: item.last_modified_at ?? item.receipt_created_at,
    message_code: item.primary_anomaly_type!,
    lifecycle_status: item.lifecycle_status,
    total_rows: 4,
  }))

export function createDemoBillingDataset(): BillingDataset {
  return {
    receipts,
    anomalies,
    details,
    reusableOperations: [],
    loadedAt: '2026-08-02T00:00:00.000Z',
  }
}
