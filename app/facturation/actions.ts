'use server'

import { createHash, randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { requireActiveAccount } from '@/lib/admin-guard'
import type {
  AddPaymentInput,
  CancelReceiptInput,
  CorrectFirstPaymentMethodInput,
  CreateReceiptInput,
  FacturationActionResult,
  UpdateCommercialInput,
  UpdateDossierInput,
  UpdatePersonalInput,
} from '@/lib/facturation/workflow-types'
import type { BillingReceiptDetail } from '@/lib/facturation/types'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isUuid(value: string | null | undefined): value is string {
  return Boolean(value && UUID_PATTERN.test(value))
}

function errorResult(error: unknown): FacturationActionResult<never> {
  const source = error instanceof Error ? error.message : String(error ?? '')
  const message = source.replace(/^.*?message["']?\s*:\s*["']?/, '').trim()
  const translations: Array<[string, string]> = [
    ['Over-allocation confirmation is required', 'Le montant attribué dépasse le solde disponible de cette opération. Une confirmation explicite est obligatoire.'],
    ['Payment amount exceeds receipt remainder', 'Le montant dépasse le reste du reçu.'],
    ['Sixth payment must settle the receipt exactly', 'Le sixième paiement doit solder exactement le reste du reçu.'],
    ['Receipt already has six payments', 'Ce reçu contient déjà six paiements.'],
    ['Receipt is already settled', 'Ce reçu est déjà soldé.'],
    ['Cancelled receipt cannot receive a payment', 'Un reçu annulé ne peut plus recevoir de paiement.'],
    ['Cancelled receipt cannot be modified', 'Un reçu annulé ne peut plus être modifié.'],
    ['Discount exceeds applicable maximum', 'La réduction dépasse le maximum autorisé.'],
    ['Tariff cannot be determined for selected combination', 'Aucun tarif ne correspond à la combinaison choisie.'],
    ['Modification reason is required', 'Le motif de modification est obligatoire.'],
    ['Cancellation reason is required', 'Le motif d’annulation est obligatoire.'],
    ['Cash outflow amount exceeds total paid', 'La sortie réelle en espèces dépasse le total payé.'],
    ['No personal data changed', 'Aucune donnée personnelle n’a été modifiée.'],
    ['No commercial data changed', 'Aucune donnée commerciale n’a été modifiée.'],
    ['No first payment method data changed', 'Aucune donnée du moyen du premier paiement n’a été modifiée.'],
    ['First payment operation is missing', 'Le premier paiement ne possède pas d’opération exploitable.'],
    ['First payment operation changed concurrently', 'Le premier paiement a été modifié simultanément. Rechargez le reçu puis recommencez.'],
    ['Facturation access denied', 'Votre compte ne dispose pas d’un accès actif à la Facturation.'],
    ['Active Facturation account is required', 'Votre compte ne dispose pas d’un accès actif à la Facturation.'],
    ['Administrator privileges are required', 'Cette action est réservée à l’administrateur.'],
  ]
  const translated = translations.find(([needle]) => message.includes(needle))
  const publicMessage = translated?.[1] ?? (message && message.length < 220 ? message : 'Une erreur technique a empêché l’opération.')
  const code = message.includes('Over-allocation confirmation is required')
    ? 'CONFIRM_OVER_ALLOCATION'
    : message.toLowerCase().includes('admin') || message.includes('access denied')
      ? 'FORBIDDEN'
      : 'VALIDATION'
  return { ok: false, message: publicMessage, code }
}

function assertPositiveInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} doit être un entier strictement positif.`)
}

function assertNonNegativeInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} doit être un entier positif ou nul.`)
}

export async function createReceiptAction(input: CreateReceiptInput): Promise<FacturationActionResult<{ receiptId: string; receiptNumber: number }>> {
  try {
    await requireActiveAccount()
    for (const [value, label] of [
      [input.seasonId, 'Saison'], [input.programId, 'Programme'], [input.hotelId, 'Hôtel'],
      [input.flightId, 'Vol'], [input.roomId, 'Chambre'],
    ] as const) if (!isUuid(value)) throw new Error(`${label} invalide.`)
    assertNonNegativeInteger(input.discountAmountDh, 'La réduction')
    assertPositiveInteger(input.amountDh, 'Le premier paiement')

    const supabase = await createClient()
    const { data, error } = await supabase.rpc('create_complete_facturation_receipt', {
      p_season_id: input.seasonId,
      p_program_id: input.programId,
      p_hotel_id: input.hotelId,
      p_flight_id: input.flightId,
      p_room_id: input.roomId,
      p_discount_amount_dh: input.discountAmountDh,
      p_existing_dossier_id: input.existingDossierId,
      p_new_dossier_reference: input.newDossierReference,
      p_new_dossier_label: input.newDossierLabel,
      p_new_dossier_note: input.newDossierNote,
      p_existing_traveler_id: input.existingTravelerId,
      p_new_traveler_first_name: input.newTravelerFirstName,
      p_new_traveler_last_name: input.newTravelerLastName,
      p_new_traveler_phone: input.newTravelerPhone,
      p_rabatteur_id: input.rabatteurId,
      p_registration_note: input.registrationNote,
      p_first_payment_amount_dh: input.amountDh,
      p_payment_mode: input.mode,
      p_usage_kind: input.usageKind,
      p_existing_shared_operation_id: input.existingSharedOperationId,
      p_operation_amount_dh: input.operationAmountDh,
      p_instrument_reference: input.instrumentReference,
      p_bank_name: input.bankName,
      p_instrument_date: input.instrumentDate,
      p_payer_name: input.payerName,
      p_confirm_over_allocation: input.confirmOverAllocation,
    })
    if (error) throw error
    const row = Array.isArray(data) ? data[0] : data
    if (!row?.receipt_id || !Number.isInteger(row.receipt_number)) throw new Error('La création du reçu n’a retourné aucun résultat exploitable.')
    revalidatePath('/facturation')
    return { ok: true, data: { receiptId: row.receipt_id, receiptNumber: row.receipt_number } }
  } catch (error) {
    return errorResult(error)
  }
}

export async function addPaymentAction(input: AddPaymentInput): Promise<FacturationActionResult<{ paymentNumber: number }>> {
  try {
    await requireActiveAccount()
    if (!isUuid(input.receiptId)) throw new Error('Reçu invalide.')
    assertPositiveInteger(input.amountDh, 'Le paiement')
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('add_billing_receipt_payment', {
      p_receipt_id: input.receiptId,
      p_payment_amount_dh: input.amountDh,
      p_payment_mode: input.mode,
      p_usage_kind: input.usageKind,
      p_existing_shared_operation_id: input.existingSharedOperationId,
      p_operation_amount_dh: input.operationAmountDh,
      p_instrument_reference: input.instrumentReference,
      p_bank_name: input.bankName,
      p_instrument_date: input.instrumentDate,
      p_payer_name: input.payerName,
      p_confirm_over_allocation: input.confirmOverAllocation,
    })
    if (error) throw error
    const row = Array.isArray(data) ? data[0] : data
    revalidatePath('/facturation')
    return { ok: true, data: { paymentNumber: Number(row?.payment_number) } }
  } catch (error) {
    return errorResult(error)
  }
}

export async function correctFirstPaymentMethodAction(
  input: CorrectFirstPaymentMethodInput,
): Promise<FacturationActionResult<{ paymentOperationId: string }>> {
  try {
    await requireActiveAccount()
    if (!isUuid(input.receiptId)) throw new Error('Reçu invalide.')
    if (!input.reason.trim()) throw new Error('Le motif de modification est obligatoire.')
    if (input.existingSharedOperationId && !isUuid(input.existingSharedOperationId)) {
      throw new Error('Opération partagée invalide.')
    }
    if (input.operationAmountDh !== null) {
      assertPositiveInteger(input.operationAmountDh, 'Le montant réel de l’opération')
    }

    const supabase = await createClient()
    const { data, error } = await supabase.rpc('correct_billing_receipt_first_payment_method', {
      p_receipt_id: input.receiptId,
      p_reason: input.reason.trim(),
      p_payment_mode: input.mode,
      p_usage_kind: input.usageKind,
      p_existing_shared_operation_id: input.existingSharedOperationId,
      p_operation_amount_dh: input.operationAmountDh,
      p_instrument_reference: input.instrumentReference,
      p_bank_name: input.bankName,
      p_instrument_date: input.instrumentDate,
      p_payer_name: input.payerName,
      p_confirm_over_allocation: input.confirmOverAllocation,
    })
    if (error) throw error
    const row = Array.isArray(data) ? data[0] : data
    if (!isUuid(row?.payment_operation_id)) {
      throw new Error('La correction du premier paiement n’a retourné aucun résultat exploitable.')
    }
    revalidatePath('/facturation')
    return { ok: true, data: { paymentOperationId: row.payment_operation_id } }
  } catch (error) {
    return errorResult(error)
  }
}

export async function updatePersonalAction(input: UpdatePersonalInput): Promise<FacturationActionResult> {
  try {
    await requireActiveAccount()
    if (!isUuid(input.receiptId)) throw new Error('Reçu invalide.')
    const supabase = await createClient()
    const { error } = await supabase.rpc('update_billing_receipt_personal_data', {
      p_receipt_id: input.receiptId,
      p_section_code: input.sectionCode,
      p_new_first_name: input.firstName,
      p_new_last_name: input.lastName,
      p_new_phone: input.phone,
      p_new_note: input.note,
      p_reason: input.reason,
    })
    if (error) throw error
    revalidatePath('/facturation')
    return { ok: true, data: undefined }
  } catch (error) { return errorResult(error) }
}

export async function updateCommercialAction(input: UpdateCommercialInput): Promise<FacturationActionResult> {
  try {
    await requireActiveAccount()
    if (![input.receiptId, input.hotelId, input.flightId, input.roomId].every(isUuid)) throw new Error('Sélection commerciale invalide.')
    assertNonNegativeInteger(input.discountAmountDh, 'La réduction')
    const supabase = await createClient()
    const { error } = await supabase.rpc('update_billing_receipt_commercial_data', {
      p_receipt_id: input.receiptId,
      p_hotel_id: input.hotelId,
      p_flight_id: input.flightId,
      p_room_id: input.roomId,
      p_discount_amount_dh: input.discountAmountDh,
      p_reason: input.reason,
    })
    if (error) throw error
    revalidatePath('/facturation')
    return { ok: true, data: undefined }
  } catch (error) { return errorResult(error) }
}

export async function updateDossierAction(input: UpdateDossierInput): Promise<FacturationActionResult> {
  try {
    await requireActiveAccount()
    if (!isUuid(input.receiptId)) throw new Error('Reçu invalide.')
    if (input.action === 'move_to_existing' && !isUuid(input.targetDossierId)) throw new Error('Dossier cible invalide.')
    const supabase = await createClient()
    const { error } = await supabase.rpc('update_billing_receipt_dossier', {
      p_receipt_id: input.receiptId,
      p_action: input.action,
      p_target_dossier_id: input.targetDossierId,
      p_reason: input.reason,
    })
    if (error) throw error
    revalidatePath('/facturation')
    return { ok: true, data: undefined }
  } catch (error) { return errorResult(error) }
}

export async function cancelReceiptAction(input: CancelReceiptInput): Promise<FacturationActionResult> {
  try {
    await requireActiveAccount()
    if (!isUuid(input.receiptId)) throw new Error('Reçu invalide.')
    assertNonNegativeInteger(input.cashOutflowAmountDh, 'La sortie réelle en espèces')
    const supabase = await createClient()
    const { error } = await supabase.rpc('cancel_billing_receipt', {
      p_receipt_id: input.receiptId,
      p_reason: input.reason,
      p_cash_outflow_amount_dh: input.cashOutflowAmountDh,
    })
    if (error) throw error
    revalidatePath('/facturation')
    return { ok: true, data: undefined }
  } catch (error) { return errorResult(error) }
}

export async function uploadEvidenceAction(formData: FormData): Promise<FacturationActionResult> {
  let uploadedPath: string | null = null
  try {
    await requireActiveAccount()
    const operationId = String(formData.get('operationId') ?? '')
    const file = formData.get('file')
    if (!isUuid(operationId)) throw new Error('Opération de paiement invalide.')
    if (!(file instanceof File) || file.size <= 0) throw new Error('Sélectionnez une image valide.')
    const extensions: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
    const extension = extensions[file.type]
    if (!extension) throw new Error('Seules les images JPEG, PNG et WebP sont autorisées.')
    const bytes = Buffer.from(await file.arrayBuffer())
    const hash = createHash('sha256').update(bytes).digest('hex')
    uploadedPath = `${operationId}/${randomUUID()}.${extension}`
    const admin = createAdminClient()
    const { error: uploadError } = await admin.storage.from('facturation-justificatifs').upload(uploadedPath, bytes, { contentType: file.type, upsert: false })
    if (uploadError) throw uploadError
    const supabase = await createClient()
    const { error } = await supabase.rpc('attach_payment_operation_evidence_image', {
      p_operation_id: operationId,
      p_storage_path: uploadedPath,
      p_original_file_name: file.name,
      p_mime_type: file.type,
      p_file_size_bytes: file.size,
      p_file_hash: hash,
    })
    if (error) throw error
    revalidatePath('/facturation')
    return { ok: true, data: undefined }
  } catch (error) {
    if (uploadedPath) {
      try { await createAdminClient().storage.from('facturation-justificatifs').remove([uploadedPath]) } catch {}
    }
    return errorResult(error)
  }
}

export async function deleteEvidenceAction(operationId: string, reason: string): Promise<FacturationActionResult> {
  try {
    await requireActiveAccount()
    if (!isUuid(operationId)) throw new Error('Opération de paiement invalide.')
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('delete_payment_operation_evidence_image', { p_operation_id: operationId, p_reason: reason })
    if (error) throw error
    const row = Array.isArray(data) ? data[0] : data
    const path = row?.storage_path as string | undefined
    let warning: string | undefined
    if (path) {
      const { error: storageError } = await createAdminClient().storage.from('facturation-justificatifs').remove([path])
      if (storageError) warning = 'Le justificatif est supprimé logiquement, mais le nettoyage physique du fichier devra être repris.'
    }
    revalidatePath('/facturation')
    return { ok: true, data: undefined, warning }
  } catch (error) { return errorResult(error) }
}

export async function getEvidenceUrlAction(operationId: string, receiptId: string): Promise<FacturationActionResult<{ url: string }>> {
  try {
    await requireActiveAccount()
    if (!isUuid(operationId) || !isUuid(receiptId)) throw new Error('Opération de paiement invalide.')
    const supabase = await createClient()
    const { data: detailData, error } = await supabase.rpc('get_billing_receipt_details', { p_receipt_id: receiptId })
    if (error || !detailData) throw error ?? new Error('Le reçu lié est indisponible.')
    const detail = detailData as BillingReceiptDetail
    const operation = detail.operations.find((item) => item.id === operationId)
    const image = operation?.supporting_image
    if (!operation?.has_active_supporting_image || !image?.storage_path) throw new Error('Aucun justificatif actif n’est disponible.')
    const admin = createAdminClient()
    const { data, error: signedError } = await admin.storage.from('facturation-justificatifs').createSignedUrl(image.storage_path, 60)
    if (signedError || !data?.signedUrl) throw new Error('Impossible d’ouvrir le justificatif.')
    return { ok: true, data: { url: data.signedUrl } }
  } catch (error) { return errorResult(error) }
}

export async function recordReceiptPrintAction(receiptId: string): Promise<FacturationActionResult<{
  printCount: number
  printedAt: string
  printedBySlotLabel: string
}>> {
  try {
    await requireActiveAccount()
    if (!isUuid(receiptId)) throw new Error('Reçu invalide.')
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('record_billing_receipt_print', { p_receipt_id: receiptId })
    if (error) {
      if (error.code === 'PGRST202' || error.message.includes('record_billing_receipt_print')) {
        throw new Error('Le suivi des impressions n’est pas encore installé sur la base liée. L’impression n’a pas été ouverte et aucun compteur n’a été modifié.')
      }
      throw error
    }
    const row = Array.isArray(data) ? data[0] : data
    const printCount = Number(row?.print_number)
    if (!Number.isSafeInteger(printCount) || printCount <= 0 || !row?.printed_at || !row?.printed_by_slot_label) {
      throw new Error('L’enregistrement de l’impression n’a retourné aucun résultat exploitable.')
    }
    revalidatePath('/facturation')
    return {
      ok: true,
      data: {
        printCount,
        printedAt: row.printed_at,
        printedBySlotLabel: row.printed_by_slot_label,
      },
    }
  } catch (error) {
    return errorResult(error)
  }
}
