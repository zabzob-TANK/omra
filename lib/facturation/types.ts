export type ReceiptLifecycleStatus = 'active' | 'cancelled'
export type ReceiptFinancialStatus = 'incomplete' | 'paid' | 'overpaid'
export type PaymentMode = 'cash' | 'cheque' | 'transfer'
export type PaymentUsage = 'unique' | 'shared'
export type BillingAnomalyType =
  | 'amount_due'
  | 'overpayment'
  | 'cheque_missing_supporting_image'

/**
 * Ligne brute de `list_billing_season_payments` — un versement de la saison,
 * à plat, avec sa date propre ET la date de l'opération dont il dépend (si
 * partagée) séparées : ce ne sont pas toujours le même jour (voir le
 * commentaire de la migration), et ce n'est délibérément pas à ce type de
 * choisir laquelle utiliser.
 */
export type BillingSeasonPaymentRow = {
  payment_id: string
  receipt_id: string
  receipt_number: number
  lifecycle_status: ReceiptLifecycleStatus
  traveler_first_name_snapshot: string
  traveler_last_name_snapshot: string
  receipt_created_by_slot_label: string
  /** État actuel de l'inscription — filet quand l'instantané du versement est incomplet (lignes anciennes). */
  registration_hotel_name: string
  registration_room_label: string
  registration_flight_label: string
  registration_rabatteur_name: string | null
  registration_agreed_amount_dh: number
  payment_number: number
  amount_dh: number
  payment_registered_at: string
  payment_created_by_slot_label: string
  payment_mode: PaymentMode
  usage_kind: PaymentUsage
  operation_id: string
  operation_registered_at: string
  operation_amount_dh: number
  instrument_reference: string | null
  instrument_date: string | null
  bank_name: string | null
  payer_name: string | null
  /** Justificatif actif de l'opération — lu seulement pour un versement unique. */
  image_storage_bucket: string | null
  image_storage_path: string | null
  image_original_file_name: string | null
  image_uploaded_at: string | null
  image_uploaded_by_slot_label: string | null
  /** Instantané figé du versement (R-14, R-22) — jamais recalculé. */
  snapshot_client_name: string
  snapshot_hotel_name: string
  snapshot_room_label: string
  snapshot_flight_label: string
  snapshot_program_label: string
  snapshot_agreed_amount_dh: number
  snapshot_rabatteur_name: string | null
  snapshot_remaining_after_dh: number
  snapshot_settled_after: boolean
  total_rows: number
}

/** Ligne brute de `list_billing_season_modifications` — un événement de modification, à plat. */
export type BillingSeasonModificationRow = {
  modification_id: string
  receipt_id: string
  receipt_number: number
  action_type: string
  section_code: string | null
  occurred_at: string
  actor_slot_label: string
  total_rows: number
}

export type BillingReceiptRow = {
  receipt_id: string
  season_id: string
  season_name_snapshot: string
  season_code_snapshot: string
  receipt_number: number
  receipt_created_at: string
  lifecycle_status: ReceiptLifecycleStatus
  cancelled_at: string | null
  registration_id: string
  traveler_id: string
  dossier_id: string
  visible_dossier_reference: string | null
  traveler_first_name_snapshot: string
  traveler_last_name_snapshot: string
  traveler_phone_snapshot: string | null
  hotel_name_snapshot: string
  flight_label_snapshot: string
  room_label_snapshot: string
  room_bed_count_snapshot: number
  catalog_price_dh: number
  maximum_discount_applied_dh: number
  discount_amount_dh: number
  agreed_amount_dh: number
  payment_count: number
  total_paid_dh: number
  amount_due_dh: number
  overpayment_dh: number
  financial_status: ReceiptFinancialStatus
  has_active_anomaly: boolean
  primary_anomaly_type: BillingAnomalyType | null
  primary_anomaly_amount_dh: number | null
  modification_count: number
  last_modified_at: string | null
  last_modified_by_slot_label: string | null
  last_modified_by_login: string | null
  last_modified_domain: string | null
  payment_operation_count: number
  has_cheque_missing_supporting_image: boolean
  total_rows: number
}

export type BillingAnomaly = {
  anomaly_id: string
  anomaly_type: BillingAnomalyType
  amount_dh: number | null
  receipt_id: string | null
  operation_id: string | null
  related_receipt_ids: string[]
  related_season_ids: string[]
  appeared_at: string
  last_changed_at: string
  message_code: string
  lifecycle_status: ReceiptLifecycleStatus | null
  total_rows: number
}

export type BillingPayment = {
  id: string
  payment_number: number
  amount_dh: number
  registered_at: string
  created_by: {
    slot_number: number
    slot_label: string
    login: string | null
  }
  allocation_id: string | null
  allocation_count: number
  has_expected_allocation: boolean
  payment_operation_id: string | null
  payment_mode: PaymentMode
  usage_kind: PaymentUsage
  /**
   * Instantané figé au moment de ce versement (reprise.md §5.7), renseigné
   * par create_billing_receipt_with_first_payment / add_billing_receipt_payment
   * et jamais recalculé.
   */
  snapshot: {
    client_name: string
    hotel_name: string
    room_label: string
    flight_label: string
    program_label: string
    agreed_amount_dh: number
    rabatteur_name: string | null
    remaining_after_dh: number
    settled_after: boolean
  }
}

export type BillingOperation = {
  id: string
  payment_mode: PaymentMode
  usage_kind: PaymentUsage
  operation_amount_dh: number
  allocated_total_dh: number
  remaining_amount_dh: number
  registered_at: string
  created_by: {
    slot_number: number
    slot_label: string
    login: string | null
  }
  over_allocation_confirmation: null | {
    confirmed_at: string
    confirmed_by_slot_number: number
    confirmed_by_slot_label: string
  }
  instrument: null | {
    reference: string
    bank_name: string
    instrument_date: string
    payer_name: string
  }
  has_active_supporting_image: boolean
  supporting_image: null | {
    id: string
    storage_bucket: string
    storage_path: string
    original_file_name: string
    mime_type: string
    file_size_bytes: number | null
    file_hash: string | null
    uploaded_at: string
    uploaded_by: {
      slot_number: number
      slot_label: string
      login: string | null
    }
  }
}

export type BillingHistoryEvent = {
  id: string
  entity_type: string
  entity_id: string
  action_type: string
  domain: string | null
  reason: string | null
  occurred_at: string
  actor_slot_number: number
  actor_slot_label: string
  actor_login: string | null
  before_data: Record<string, unknown> | null
  after_data: Record<string, unknown> | null
  correlation_id: string | null
}

export type ReusablePaymentOperation = {
  payment_operation_id: string
  payment_mode: 'cheque' | 'transfer'
  operation_amount_dh: number
  allocated_total_dh: number
  remaining_amount_dh: number
  instrument_reference: string
  bank_name: string
  instrument_date: string
  payer_name: string
  registered_at: string
  has_active_supporting_image: boolean
}

/** Ligne brute de `get_billing_finance_anomaly_acknowledgement`/`acknowledge_billing_finance_anomalies`. */
export type FinanceAnomalyAcknowledgement = {
  day_key: string
  movement_ids: string[]
  acknowledged_at: string
  acknowledged_by_slot_label_snapshot: string
}

/** Ligne brute de `list_billing_finance_print_events`/`record_billing_finance_print`. */
export type FinancePrintEvent = {
  print_number: number
  movement_ids: string[]
  row_count: number
  printed_at: string
  printed_by_slot_label_snapshot: string
}

/** Ligne brute de `list_cash_register_refund_movements` — une sortie de caisse réelle liée à une annulation. */
export type CashRegisterRefundMovement = {
  movement_id: string
  receipt_id: string
  receipt_number: number
  traveler_first_name_snapshot: string
  traveler_last_name_snapshot: string
  amount_dh: number
  occurred_at: string
  created_by_slot_label_snapshot: string
}

/** Ligne brute de `get_billing_receipt_print_summary` — total et dernière impression d'un reçu. */
export type BillingReceiptPrintSummary = {
  receipt_id: string
  print_count: number
  last_printed_at: string | null
  last_printed_by_slot_number: number | null
  last_printed_by_slot_label: string | null
}

export type BillingReceiptDetail = {
  receipt: {
    id: string
    season_id: string
    season_name_snapshot: string
    season_code_snapshot: string
    receipt_number: number
    lifecycle_status: ReceiptLifecycleStatus
    created_at: string
    created_by: {
      slot_number: number
      slot_label: string
      login: string | null
    }
    cancellation: null | {
      id: string
      cancelled_at: string
      reason: string
      restitution_route: 'cash_register' | 'outside_register'
      total_cancelled_dh: number
      cash_outflow_amount_dh: number
      cancelled_by: {
        slot_number: number
        slot_label: string
        login: string | null
      }
    }
    financial: {
      payment_count: number
      total_paid_dh: number
      amount_due_dh: number
      overpayment_dh: number
      financial_status: ReceiptFinancialStatus
    }
  }
  registration: {
    id: string
    traveler_id: string
    dossier: {
      id: string
      reference: string | null
      label: string | null
    }
    program_id: string
    season_id: string
    season_name_snapshot: string
    season_code_snapshot: string
    first_name_snapshot: string
    last_name_snapshot: string
    phone_snapshot: string | null
    note: string | null
    hotel_id: string
    hotel_name_snapshot: string
    flight_id: string
    flight_label_snapshot: string
    room_id: string
    room_label_snapshot: string
    room_bed_count_snapshot: number
    rabatteur_id: string | null
    rabatteur_name_snapshot: string | null
    price_id: string | null
    catalog_price_dh: number
    maximum_discount_applied_dh: number
    discount_amount_dh: number
    agreed_amount_dh: number
    registered_at: string
    registered_by_slot_number: number
  }
  payments: BillingPayment[]
  operations: BillingOperation[]
  active_anomalies: Array<{
    type: BillingAnomalyType
    amount_dh: number | null
    receipt_id: string | null
    operation_id: string | null
    last_changed_at: string
  }>
  modifications: {
    count: number
    last: null | {
      action_type: string
      domain: string | null
      occurred_at: string
      actor_slot_number: number
      actor_slot_label: string
      actor_login: string | null
    }
  }
  printing: {
    count: number
    last_printed_at: string | null
    last_printed_by_slot_number: number | null
    last_printed_by_slot_label: string | null
  }
  history: BillingHistoryEvent[]
  consistency: Record<string, number>
}

export type BillingDataset = {
  receipts: BillingReceiptRow[]
  anomalies: BillingAnomaly[]
  details: Record<string, BillingReceiptDetail>
  reusableOperations: ReusablePaymentOperation[]
  loadedAt: string
}

export type BillingDashboardResult =
  | { ok: true; data: BillingDataset }
  | { ok: false; message: string; data: BillingDataset }

export type BillingStats = {
  totalCollected: number
  cash: number
  cheque: number
  transfer: number
  amountDue: number
  overpayment: number
  anomalies: number
}
