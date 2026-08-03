import { describe, expect, it } from 'vitest'
import type { BillingReceiptDetail, ReusablePaymentOperation } from '@/lib/facturation/types'
import { mapReceiptDetailToRecu, mapReusableOperationToOperationPartagee } from './mappers'

function detailFixture(overrides: Partial<BillingReceiptDetail> = {}): BillingReceiptDetail {
  return {
    receipt: {
      id: 'receipt-1',
      season_id: 'season-1',
      season_name_snapshot: 'عمرة رمضان 2027',
      season_code_snapshot: 'R2027',
      receipt_number: 42,
      lifecycle_status: 'active',
      created_at: '2026-08-01T09:00:00.000Z',
      created_by: { slot_number: 2, slot_label: 'موظف 1', login: 'employe1' },
      cancellation: null,
      financial: {
        payment_count: 1,
        total_paid_dh: 200,
        amount_due_dh: 100,
        overpayment_dh: 0,
        financial_status: 'incomplete',
      },
    },
    registration: {
      id: 'registration-1',
      traveler_id: 'traveler-1',
      dossier: { id: 'dossier-1', reference: 'D-001', label: 'مجموعة العائلة' },
      program_id: 'program-1',
      season_id: 'season-1',
      season_name_snapshot: 'عمرة رمضان 2027',
      season_code_snapshot: 'R2027',
      first_name_snapshot: 'فاطمة',
      last_name_snapshot: 'الزهراء',
      phone_snapshot: '0600-11.22.33',
      note: 'ملاحظة',
      hotel_id: 'hotel-1',
      hotel_name_snapshot: 'منار الشروق',
      flight_id: 'flight-1',
      flight_label_snapshot: 'الخطوط السعودية',
      room_id: 'room-1',
      room_label_snapshot: '3',
      room_bed_count_snapshot: 3,
      rabatteur_id: 'rabatteur-1',
      rabatteur_name_snapshot: 'صفية',
      price_id: 'price-1',
      catalog_price_dh: 338,
      maximum_discount_applied_dh: 30,
      discount_amount_dh: 38,
      agreed_amount_dh: 300,
      registered_at: '2026-08-01T09:00:00.000Z',
      registered_by_slot_number: 2,
    },
    payments: [
      {
        id: 'payment-1',
        payment_number: 1,
        amount_dh: 200,
        registered_at: '2026-08-01T09:05:00.000Z',
        created_by: { slot_number: 2, slot_label: 'موظف 1', login: 'employe1' },
        allocation_id: 'allocation-1',
        allocation_count: 1,
        has_expected_allocation: true,
        payment_operation_id: 'operation-1',
        payment_mode: 'cash',
        usage_kind: 'unique',
      },
    ],
    operations: [
      {
        id: 'operation-1',
        payment_mode: 'cash',
        usage_kind: 'unique',
        operation_amount_dh: 200,
        allocated_total_dh: 200,
        remaining_amount_dh: 0,
        registered_at: '2026-08-01T09:05:00.000Z',
        created_by: { slot_number: 2, slot_label: 'موظف 1', login: 'employe1' },
        over_allocation_confirmation: null,
        instrument: null,
        has_active_supporting_image: false,
        supporting_image: null,
      },
    ],
    active_anomalies: [],
    modifications: { count: 0, last: null },
    printing: { count: 0, last_printed_at: null, last_printed_by_slot_number: null, last_printed_by_slot_label: null },
    history: [],
    consistency: {},
    ...overrides,
  }
}

describe('mapReceiptDetailToRecu', () => {
  it('traduit les champs simples et les snapshots d’inscription', () => {
    const recu = mapReceiptDetailToRecu(detailFixture())

    expect(recu.id).toBe('receipt-1')
    expect(recu.numero).toBe(42)
    expect(recu.prenom).toBe('فاطمة')
    expect(recu.nom).toBe('الزهراء')
    expect(recu.hotel).toBe('منار الشروق')
    expect(recu.chambre).toBe('3')
    expect(recu.vol).toBe('الخطوط السعودية')
    expect(recu.rabatteur).toBe('صفية')
    expect(recu.statut).toBe('نشط')
    expect(recu.passeport).toBeNull()
  })

  it('convertit les montants dirhams entiers en centimes', () => {
    const recu = mapReceiptDetailToRecu(detailFixture())
    expect(recu.tarifCentimes).toBe(33800)
    expect(recu.reductionCentimes).toBe(3800)
    expect(recu.convenuCentimes).toBe(30000)
  })

  it('construit les versements à partir des paiements et de leurs opérations', () => {
    const recu = mapReceiptDetailToRecu(detailFixture())
    expect(recu.versements).toHaveLength(1)
    const [versement] = recu.versements
    expect(versement.montantCentimes).toBe(20000)
    expect(versement.nature).toBe('نقد')
    expect(versement.portee).toBe('unique')
    expect(versement.operationPartageeId).toBe('')
    expect(versement.image).toBeNull()
  })

  it('reconstruit un instantané approximatif cohérent avec le montant convenu actuel', () => {
    const recu = mapReceiptDetailToRecu(detailFixture())
    const [versement] = recu.versements
    // convenu 30000 - payé jusqu'à ce rang 20000 = 10000 restant.
    expect(versement.instantane.restantApresCentimes).toBe(10000)
    expect(versement.instantane.statutApres).toBe('•')
    expect(versement.instantane.hotel).toBe('منار الشروق')
    expect(versement.instantane.client).toBe('فاطمة الزهراء')
  })

  it('marque le versement comme soldé quand le cumul atteint le convenu', () => {
    const detail = detailFixture({
      registration: { ...detailFixture().registration, agreed_amount_dh: 200 },
    })
    const recu = mapReceiptDetailToRecu(detail)
    expect(recu.versements[0].instantane.restantApresCentimes).toBe(0)
    expect(recu.versements[0].instantane.statutApres).toBe('✓')
  })

  it('traduit une opération partagée avec instrument et image, sans propager l’image au versement', () => {
    const detail = detailFixture({
      payments: [
        {
          id: 'payment-2',
          payment_number: 1,
          amount_dh: 200,
          registered_at: '2026-08-01T09:05:00.000Z',
          created_by: { slot_number: 2, slot_label: 'موظف 1', login: 'employe1' },
          allocation_id: 'allocation-2',
          allocation_count: 1,
          has_expected_allocation: true,
          payment_operation_id: 'operation-2',
          payment_mode: 'cheque',
          usage_kind: 'shared',
        },
      ],
      operations: [
        {
          id: 'operation-2',
          payment_mode: 'cheque',
          usage_kind: 'shared',
          operation_amount_dh: 500,
          allocated_total_dh: 200,
          remaining_amount_dh: 300,
          registered_at: '2026-08-01T09:05:00.000Z',
          created_by: { slot_number: 2, slot_label: 'موظف 1', login: 'employe1' },
          over_allocation_confirmation: null,
          instrument: {
            reference: 'CHQ-001',
            bank_name: 'Banque Populaire',
            instrument_date: '2026-07-30',
            payer_name: 'Ahmed',
          },
          has_active_supporting_image: true,
          supporting_image: {
            id: 'image-1',
            storage_bucket: 'facturation',
            storage_path: 'cheques/image-1.png',
            original_file_name: 'cheque.png',
            mime_type: 'image/png',
            file_size_bytes: 1024,
            file_hash: 'abc',
            uploaded_at: '2026-08-01T09:06:00.000Z',
            uploaded_by: { slot_number: 2, slot_label: 'موظف 1', login: 'employe1' },
          },
        },
      ],
    })

    const recu = mapReceiptDetailToRecu(detail)
    const [versement] = recu.versements
    expect(versement.portee).toBe('shared')
    expect(versement.operationPartageeId).toBe('operation-2')
    expect(versement.referenceInstrument).toBe('CHQ-001')
    expect(versement.dateInstrument).toBe('30/07/2026')
    expect(versement.banque).toBe('Banque Populaire')
    expect(versement.payeur).toBe('Ahmed')
    expect(versement.montantOperationCentimes).toBe(50000)
    // R-38 : l'image d'un versement partagé appartient à l'opération, jamais au versement.
    expect(versement.image).toBeNull()
  })

  it('lève une erreur si un paiement n’a pas d’opération associée', () => {
    const detail = detailFixture({ operations: [] })
    expect(() => mapReceiptDetailToRecu(detail)).toThrow()
  })

  it('traduit une annulation, y compris le mode de remboursement', () => {
    const detail = detailFixture({
      receipt: {
        ...detailFixture().receipt,
        lifecycle_status: 'cancelled',
        cancellation: {
          id: 'cancellation-1',
          cancelled_at: '2026-08-02T10:00:00.000Z',
          reason: 'demande client',
          restitution_route: 'cash_register',
          total_cancelled_dh: 200,
          cash_outflow_amount_dh: 200,
          cancelled_by: { slot_number: 1, slot_label: 'المدير', login: 'admin' },
        },
      },
    })

    const recu = mapReceiptDetailToRecu(detail)
    expect(recu.statut).toBe('ملغى')
    expect(recu.motifAnnulation).toBe('demande client')
    expect(recu.modeRemboursement).toBe('cash')
    expect(recu.montantRembourseCentimes).toBe(20000)
    expect(recu.annuleLe).toBe('02/08/2026 11:00')
  })
})

describe('mapReusableOperationToOperationPartagee', () => {
  function operationFixture(overrides: Partial<ReusablePaymentOperation> = {}): ReusablePaymentOperation {
    return {
      payment_operation_id: 'operation-9',
      payment_mode: 'transfer',
      operation_amount_dh: 1000,
      allocated_total_dh: 400,
      remaining_amount_dh: 600,
      instrument_reference: 'VIR-009',
      bank_name: 'CIH',
      instrument_date: '2026-07-15',
      payer_name: 'Karim',
      registered_at: '2026-07-15T08:00:00.000Z',
      has_active_supporting_image: false,
      ...overrides,
    }
  }

  it('traduit le mode de paiement et les montants', () => {
    const operation = mapReusableOperationToOperationPartagee(operationFixture())
    expect(operation.id).toBe('operation-9')
    expect(operation.nature).toBe('تحويل بنكي')
    expect(operation.montantTotalCentimes).toBe(100000)
    expect(operation.dateInstrument).toBe('15/07/2026')
  })

  it('renvoie des valeurs par défaut explicites pour les champs non fournis par la RPC', () => {
    const operation = mapReusableOperationToOperationPartagee(operationFixture())
    expect(operation.creeePar).toBe('')
    expect(operation.statut).toBe('active')
    expect(operation.image).toBeNull()
  })
})
