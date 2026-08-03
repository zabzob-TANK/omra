import type { PaymentMode, PaymentUsage } from '@/lib/facturation/types'
import type { Season } from '@/lib/omra-programme'

export type FacturationActionResult<T = undefined> =
  | { ok: true; data: T; warning?: string }
  | { ok: false; message: string; code?: 'CONFIRM_OVER_ALLOCATION' | 'VALIDATION' | 'FORBIDDEN' | 'TECHNICAL' }

export type DossierOption = {
  id: string
  reference: string
  label: string | null
}

export type TravelerOption = {
  id: string
  firstName: string
  lastName: string
  phone: string | null
}

export type FacturationReferenceData = {
  activeSeason: Season | null
  dossiers: DossierOption[]
  travelers: TravelerOption[]
}

export type PaymentWriteInput = {
  amountDh: number
  mode: PaymentMode
  usageKind: PaymentUsage
  existingSharedOperationId: string | null
  operationAmountDh: number | null
  instrumentReference: string | null
  bankName: string | null
  instrumentDate: string | null
  payerName: string | null
  confirmOverAllocation: boolean
}

export type CreateReceiptInput = PaymentWriteInput & {
  seasonId: string
  programId: string
  hotelId: string
  flightId: string
  roomId: string
  rabatteurId: string | null
  discountAmountDh: number
  registrationNote: string | null
  existingDossierId: string | null
  newDossierReference: string | null
  newDossierLabel: string | null
  newDossierNote: string | null
  existingTravelerId: string | null
  newTravelerFirstName: string | null
  newTravelerLastName: string | null
  newTravelerPhone: string | null
}

export type AddPaymentInput = PaymentWriteInput & {
  receiptId: string
}

export type CorrectFirstPaymentMethodInput = Omit<PaymentWriteInput, 'amountDh'> & {
  receiptId: string
  reason: string
}

export type UpdatePersonalInput = {
  receiptId: string
  sectionCode: 'identity' | 'phone' | 'note'
  firstName: string | null
  lastName: string | null
  phone: string | null
  note: string | null
  reason: string
}

export type UpdateCommercialInput = {
  receiptId: string
  hotelId: string
  flightId: string
  roomId: string
  discountAmountDh: number
  reason: string
}

export type UpdateDossierInput = {
  receiptId: string
  action: 'move_to_existing' | 'separate_to_technical'
  targetDossierId: string | null
  reason: string
}

export type CancelReceiptInput = {
  receiptId: string
  reason: string
  cashOutflowAmountDh: number
}
