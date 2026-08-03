'use client'

import { useMemo, useState, useTransition } from 'react'
import { FileImage, ImagePlus, Trash2, X } from 'lucide-react'
import {
  addPaymentAction,
  cancelReceiptAction,
  correctFirstPaymentMethodAction,
  createReceiptAction,
  deleteEvidenceAction,
  getEvidenceUrlAction,
  updateCommercialAction,
  updateDossierAction,
  updatePersonalAction,
  uploadEvidenceAction,
} from '@/app/facturation/actions'
import type { BillingDataset, BillingOperation, BillingReceiptDetail, BillingReceiptRow, PaymentMode, PaymentUsage } from '@/lib/facturation/types'
import type { FacturationReferenceData, PaymentWriteInput } from '@/lib/facturation/workflow-types'

const formatter = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })

function dh(value: number | null | undefined) {
  return value == null ? '—' : `${formatter.format(value).replace(/\u202f/g, ' ')} DH`
}

function integer(value: string) {
  if (!/^\d+$/.test(value.trim())) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : null
}

function phoneDigits(value: string) {
  return value.replace(/\D/g, '')
}

function ErrorMessage({ message }: { message: string | null }) {
  return message ? <div className="bill-warning" role="alert">{message}</div> : null
}

export type SharedOperationOption = {
  id: string
  mode: 'cheque' | 'transfer'
  reference: string
  bankName: string
  payerName: string
  operationAmountDh: number
  allocatedTotalDh: number
  remainingAmountDh: number
}

export function sharedOperationOptions(dataset: BillingDataset): SharedOperationOption[] {
  const seen = new Set<string>()
  const options: SharedOperationOption[] = []
  for (const operation of dataset.reusableOperations) {
    seen.add(operation.payment_operation_id)
    options.push({
      id: operation.payment_operation_id,
      mode: operation.payment_mode,
      reference: operation.instrument_reference,
      bankName: operation.bank_name,
      payerName: operation.payer_name,
      operationAmountDh: operation.operation_amount_dh,
      allocatedTotalDh: operation.allocated_total_dh,
      remainingAmountDh: operation.remaining_amount_dh,
    })
  }
  for (const detail of Object.values(dataset.details)) {
    for (const operation of detail.operations) {
      if (seen.has(operation.id) || operation.usage_kind !== 'shared' || operation.payment_mode === 'cash' || !operation.instrument) continue
      seen.add(operation.id)
      options.push({
        id: operation.id,
        mode: operation.payment_mode,
        reference: operation.instrument.reference,
        bankName: operation.instrument.bank_name,
        payerName: operation.instrument.payer_name,
        operationAmountDh: operation.operation_amount_dh,
        allocatedTotalDh: operation.allocated_total_dh,
        remainingAmountDh: operation.remaining_amount_dh,
      })
    }
  }
  return options.sort((a, b) => a.reference.localeCompare(b.reference, 'fr'))
}

type PaymentDraft = {
  amount: string
  mode: PaymentMode
  usageKind: PaymentUsage
  sharedSource: 'new' | 'existing'
  existingOperationId: string
  operationAmount: string
  reference: string
  bankName: string
  instrumentDate: string
  payerName: string
  confirmOverAllocation: boolean
}

function emptyPaymentDraft(amount = ''): PaymentDraft {
  return {
    amount,
    mode: 'cash',
    usageKind: 'unique',
    sharedSource: 'new',
    existingOperationId: '',
    operationAmount: '',
    reference: '',
    bankName: '',
    instrumentDate: '',
    payerName: '',
    confirmOverAllocation: false,
  }
}

function paymentPayload(draft: PaymentDraft): { payload: PaymentWriteInput | null; message: string | null } {
  const amountDh = integer(draft.amount)
  if (amountDh === null || amountDh <= 0) return { payload: null, message: 'Le montant doit être un entier strictement positif.' }
  if (draft.mode === 'cash') {
    return { payload: { amountDh, mode: 'cash', usageKind: 'unique', existingSharedOperationId: null, operationAmountDh: amountDh, instrumentReference: null, bankName: null, instrumentDate: null, payerName: null, confirmOverAllocation: false }, message: null }
  }
  if (draft.usageKind === 'shared' && draft.sharedSource === 'existing') {
    if (!draft.existingOperationId) return { payload: null, message: 'Choisissez une opération partagée existante.' }
    return { payload: { amountDh, mode: draft.mode, usageKind: 'shared', existingSharedOperationId: draft.existingOperationId, operationAmountDh: null, instrumentReference: null, bankName: null, instrumentDate: null, payerName: null, confirmOverAllocation: draft.confirmOverAllocation }, message: null }
  }
  if (!draft.reference.trim() || !draft.bankName.trim() || !draft.instrumentDate || !draft.payerName.trim()) {
    return { payload: null, message: 'La référence, la banque, la date et le nom du payeur sont obligatoires.' }
  }
  const operationAmountDh = draft.usageKind === 'unique' ? amountDh : integer(draft.operationAmount)
  if (operationAmountDh === null || operationAmountDh <= 0) return { payload: null, message: 'Le montant réel de l’opération doit être un entier strictement positif.' }
  return {
    payload: {
      amountDh,
      mode: draft.mode,
      usageKind: draft.usageKind,
      existingSharedOperationId: null,
      operationAmountDh,
      instrumentReference: draft.reference.trim(),
      bankName: draft.bankName.trim(),
      instrumentDate: draft.instrumentDate,
      payerName: draft.payerName.trim(),
      confirmOverAllocation: draft.confirmOverAllocation,
    },
    message: null,
  }
}

function PaymentFields({ draft, onChange, sharedOperations, amountLocked = false }: { draft: PaymentDraft; onChange: (draft: PaymentDraft) => void; sharedOperations: SharedOperationOption[]; amountLocked?: boolean }) {
  const set = <K extends keyof PaymentDraft>(key: K, value: PaymentDraft[K]) => onChange({ ...draft, [key]: value, confirmOverAllocation: key === 'confirmOverAllocation' ? Boolean(value) : false })
  const bank = draft.mode !== 'cash'
  const compatible = sharedOperations.filter((item) => item.mode === draft.mode)
  const selected = compatible.find((item) => item.id === draft.existingOperationId)
  const allocation = integer(draft.amount) ?? 0
  const available = selected?.remainingAmountDh ?? (draft.usageKind === 'shared' && draft.sharedSource === 'new' ? integer(draft.operationAmount) ?? 0 : allocation)
  const needsConfirmation = bank && draft.usageKind === 'shared' && allocation > available

  return <>
    <div className="bill-form-grid two bill-payment-fields">
      <label className="bill-control"><span>{amountLocked ? 'المبلغ — ثابت' : 'المبلغ *'}</span><input dir="ltr" inputMode="numeric" value={draft.amount} disabled={amountLocked} onChange={(event) => set('amount', event.target.value.replace(/\D/g, ''))} /></label>
      <label className="bill-control"><span>طريقة الدفع *</span><select value={draft.mode} onChange={(event) => { const mode = event.target.value as PaymentMode; onChange({ ...emptyPaymentDraft(draft.amount), mode }) }}><option value="cash">نقد</option><option value="cheque">شيك</option><option value="transfer">تحويل</option></select></label>
    </div>
    {bank ? <section className="bill-form-section">
      <div className="bill-form-grid two">
        <label className="bill-control"><span>نوع العملية *</span><select value={draft.usageKind} onChange={(event) => set('usageKind', event.target.value as PaymentUsage)}><option value="unique">فريدة</option><option value="shared">مشتركة</option></select></label>
        {draft.usageKind === 'shared' ? <label className="bill-control"><span>مصدر العملية *</span><select value={draft.sharedSource} onChange={(event) => set('sharedSource', event.target.value as 'new' | 'existing')}><option value="new">عملية جديدة</option><option value="existing">إعادة استعمال عملية موجودة</option></select></label> : null}
      </div>
      {draft.usageKind === 'shared' && draft.sharedSource === 'existing' ? <label className="bill-control"><span>العملية المشتركة *</span><select value={draft.existingOperationId} onChange={(event) => set('existingOperationId', event.target.value)}><option value="">اختر...</option>{compatible.map((item) => <option key={item.id} value={item.id}>{item.reference} — {item.bankName} — متاح {dh(item.remainingAmountDh)}</option>)}</select></label> : <>
        <div className="bill-form-grid two">
          <label className="bill-control"><span>{draft.mode === 'cheque' ? 'رقم الشيك *' : 'مرجع التحويل *'}</span><input dir="ltr" value={draft.reference} onChange={(event) => set('reference', event.target.value)} /></label>
          <label className="bill-control"><span>البنك *</span><input value={draft.bankName} onChange={(event) => set('bankName', event.target.value)} /></label>
          <label className="bill-control"><span>تاريخ العملية *</span><input dir="ltr" type="date" value={draft.instrumentDate} onChange={(event) => set('instrumentDate', event.target.value)} /></label>
          <label className="bill-control"><span>الشخص الذي قام بالدفع *</span><input value={draft.payerName} onChange={(event) => set('payerName', event.target.value)} /></label>
          {draft.usageKind === 'shared' ? <label className="bill-control"><span>المبلغ الحقيقي للعملية *</span><input dir="ltr" inputMode="numeric" value={draft.operationAmount} onChange={(event) => set('operationAmount', event.target.value.replace(/\D/g, ''))} /></label> : null}
        </div>
      </>}
      {selected ? <div className="bill-pay-summary"><div><span>المبلغ الحقيقي</span><b>{dh(selected.operationAmountDh)}</b></div><div><span>المبلغ attribué</span><b>{dh(selected.allocatedTotalDh)}</b></div><div><span>المتاح قبل هذه الدفعة</span><b>{dh(selected.remainingAmountDh)}</b></div></div> : null}
      {needsConfirmation ? <label className="bill-warning"><input type="checkbox" checked={draft.confirmOverAllocation} onChange={(event) => set('confirmOverAllocation', event.target.checked)} /> المبلغ المخصص يتجاوز المتاح بـ {dh(allocation - available)}. أؤكد هذا التجاوز صراحة.</label> : null}
    </section> : null}
  </>
}

export function FunctionalNewReceiptModal({ references, dataset, onClose, onComplete }: { references: FacturationReferenceData; dataset: BillingDataset; onClose: () => void; onComplete: (message: string) => void }) {
  const season = references.activeSeason
  const shared = useMemo(() => sharedOperationOptions(dataset), [dataset])
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [travelerMode, setTravelerMode] = useState<'new' | 'existing'>('new')
  const [dossierMode, setDossierMode] = useState<'new' | 'existing'>('new')
  const [existingTravelerId, setExistingTravelerId] = useState('')
  const [existingDossierId, setExistingDossierId] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [dossierReference, setDossierReference] = useState('')
  const [dossierLabel, setDossierLabel] = useState('')
  const [hotelId, setHotelId] = useState('')
  const [flightId, setFlightId] = useState('')
  const [roomId, setRoomId] = useState('')
  const [rabatteurId, setRabatteurId] = useState('')
  const [discount, setDiscount] = useState('0')
  const [note, setNote] = useState('')
  const [payment, setPayment] = useState<PaymentDraft>(emptyPaymentDraft())
  const price = season?.prices.find((item) => item.hotelId === hotelId && item.flightId === flightId && item.roomId === roomId)
  const maximumDiscount = price?.maxDiscountOverrideDh ?? season?.maxDiscountDh ?? 0
  const discountDh = integer(discount)
  const agreed = price && discountDh !== null ? price.amountDh - discountDh : null

  function submit() {
    setError(null)
    if (!season) return setError('Aucune saison active n’est disponible.')
    if (!hotelId || !flightId || !roomId) return setError('Choisissez l’hôtel, le vol et la chambre.')
    if (!price) return setError('Aucun tarif ne correspond à la combinaison choisie.')
    if (discountDh === null || discountDh < 0 || discountDh > maximumDiscount || discountDh >= price.amountDh) return setError(`La réduction doit être comprise entre 0 et ${dh(maximumDiscount)} et rester inférieure au tarif.`)
    if (travelerMode === 'new' && (!firstName.trim() || !lastName.trim() || phoneDigits(phone).length !== 10)) return setError('Le nom, le prénom et un téléphone de 10 chiffres sont obligatoires.')
    if (travelerMode === 'existing' && !existingTravelerId) return setError('Choisissez un voyageur existant.')
    if (dossierMode === 'new' && !dossierReference.trim()) return setError('La référence du nouveau dossier est obligatoire.')
    if (dossierMode === 'existing' && !existingDossierId) return setError('Choisissez un dossier existant.')
    const parsed = paymentPayload(payment)
    if (!parsed.payload) return setError(parsed.message)
    const payload = parsed.payload
    if (agreed !== null && payload.amountDh > agreed) return setError(`Le premier paiement ne peut pas dépasser le montant convenu (${dh(agreed)}).`)
    const selectedShared = shared.find((item) => item.id === payload.existingSharedOperationId)
    if (selectedShared && payload.amountDh > selectedShared.remainingAmountDh && !payload.confirmOverAllocation) return setError('Confirmez explicitement le dépassement de l’opération partagée.')
    if (payload.usageKind === 'shared' && !payload.existingSharedOperationId && payload.operationAmountDh !== null && payload.amountDh > payload.operationAmountDh && !payload.confirmOverAllocation) return setError('Confirmez explicitement le dépassement de la nouvelle opération partagée.')
    startTransition(async () => {
      const result = await createReceiptAction({
        ...payload,
        seasonId: season.id,
        programId: season.programId,
        hotelId,
        flightId,
        roomId,
        rabatteurId: rabatteurId || null,
        discountAmountDh: discountDh,
        registrationNote: note.trim() || null,
        existingDossierId: dossierMode === 'existing' ? existingDossierId : null,
        newDossierReference: dossierMode === 'new' ? dossierReference.trim() : null,
        newDossierLabel: dossierMode === 'new' ? dossierLabel.trim() || null : null,
        newDossierNote: null,
        existingTravelerId: travelerMode === 'existing' ? existingTravelerId : null,
        newTravelerFirstName: travelerMode === 'new' ? firstName.trim() : null,
        newTravelerLastName: travelerMode === 'new' ? lastName.trim() : null,
        newTravelerPhone: travelerMode === 'new' ? phoneDigits(phone) : null,
      })
      if (!result.ok) return setError(result.message)
      onComplete(`Le reçu n° ${result.data.receiptNumber} a été créé avec son premier paiement.`)
    })
  }

  return <div className="bill-overlay bill-form-overlay"><article className="bill-modal bill-new-modal" dir="rtl"><header className="bill-modal-head"><h2>وصل جديد</h2><button className="bill-close" onClick={onClose}><X size={16} /></button></header><div className="bill-new-number"><span>رقم</span><strong>—</strong><span>يُمنح عند الحفظ</span></div><div className="bill-modal-body">
    <ErrorMessage message={error} />
    <section className="bill-form-section"><div className="bill-section-title"><b>المسافر</b><select value={travelerMode} onChange={(event) => setTravelerMode(event.target.value as 'new' | 'existing')}><option value="new">مسافر جديد</option><option value="existing">مسافر موجود</option></select></div>{travelerMode === 'existing' ? <label className="bill-control"><span>المسافر *</span><select value={existingTravelerId} onChange={(event) => setExistingTravelerId(event.target.value)}><option value="">اختر...</option>{references.travelers.map((item) => <option key={item.id} value={item.id}>{item.firstName} {item.lastName} — {item.phone ?? '—'}</option>)}</select></label> : <div className="bill-form-grid"><label className="bill-control"><span>الاسم *</span><input value={firstName} onChange={(event) => setFirstName(event.target.value)} /></label><label className="bill-control"><span>النسب *</span><input value={lastName} onChange={(event) => setLastName(event.target.value)} /></label><label className="bill-control"><span>رقم الهاتف *</span><input dir="ltr" value={phone} onChange={(event) => setPhone(event.target.value)} /></label></div>}</section>
    <section className="bill-form-section"><div className="bill-section-title"><b>المجموعة / العائلة</b><select value={dossierMode} onChange={(event) => setDossierMode(event.target.value as 'new' | 'existing')}><option value="new">ملف جديد</option><option value="existing">ملف موجود</option></select></div>{dossierMode === 'existing' ? <label className="bill-control"><span>الملف *</span><select value={existingDossierId} onChange={(event) => setExistingDossierId(event.target.value)}><option value="">اختر...</option>{references.dossiers.map((item) => <option key={item.id} value={item.id}>{item.reference}{item.label ? ` — ${item.label}` : ''}</option>)}</select></label> : <div className="bill-form-grid two"><label className="bill-control"><span>مرجع الملف *</span><input dir="ltr" value={dossierReference} onChange={(event) => setDossierReference(event.target.value)} /></label><label className="bill-control"><span>تسمية اختيارية</span><input value={dossierLabel} onChange={(event) => setDossierLabel(event.target.value)} /></label></div>}</section>
    <section className="bill-form-section"><div className="bill-section-title"><b>البرنامج — {season?.name ?? 'لا موسم نشط'}</b></div><div className="bill-form-grid"><label className="bill-control"><span>الفندق *</span><select value={hotelId} onChange={(event) => setHotelId(event.target.value)}><option value="">اختر...</option>{season?.hotels.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><label className="bill-control"><span>الرحلة *</span><select value={flightId} onChange={(event) => setFlightId(event.target.value)}><option value="">اختر...</option>{season?.flights.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><label className="bill-control"><span>الغرفة *</span><select value={roomId} onChange={(event) => setRoomId(event.target.value)}><option value="">اختر...</option>{season?.rooms.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><label className="bill-control"><span>الوسيط</span><select value={rabatteurId} onChange={(event) => setRabatteurId(event.target.value)}><option value="">بدون</option>{season?.rabatteurs.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><label className="bill-control"><span>التخفيض (DH)</span><input dir="ltr" inputMode="numeric" value={discount} onChange={(event) => setDiscount(event.target.value.replace(/\D/g, ''))} /></label></div><div className="bill-price-box"><div className="bill-price-row"><span>الثمن الأصلي</span><b>{dh(price?.amountDh)}</b></div><div className="bill-price-row"><span>التخفيض الأقصى</span><b>{dh(maximumDiscount)}</b></div><div className="bill-price-row"><span>المبلغ المتفق عليه</span><strong>{dh(agreed)}</strong></div></div></section>
    <section className="bill-form-section"><div className="bill-section-title"><b>الدفعة الأولى — إجبارية</b></div><PaymentFields draft={payment} onChange={setPayment} sharedOperations={shared} /></section>
    <label className="bill-control"><span>ملاحظة</span><textarea value={note} onChange={(event) => setNote(event.target.value)} /></label>
  </div><footer className="bill-modal-foot"><button className="bill-btn" type="button" onClick={onClose} disabled={pending}>إلغاء</button><button className="bill-btn primary" type="button" onClick={submit} disabled={pending || !season}>{pending ? 'جارٍ الحفظ...' : 'حفظ الوصل'}</button></footer></article></div>
}

export function FunctionalPaymentModal({ initialReceipt, dataset, onClose, onComplete }: { initialReceipt: BillingReceiptRow | null; dataset: BillingDataset; onClose: () => void; onComplete: (message: string) => void }) {
  const [receiptNumber, setReceiptNumber] = useState(initialReceipt ? String(initialReceipt.receipt_number) : '')
  const receipt = dataset.receipts.find((item) => String(item.receipt_number) === receiptNumber.trim()) ?? null
  const detail = receipt ? dataset.details[receipt.receipt_id] ?? null : null
  const shared = useMemo(() => sharedOperationOptions(dataset), [dataset])
  const [draft, setDraft] = useState<PaymentDraft>(emptyPaymentDraft(receipt?.amount_due_dh ? String(receipt.amount_due_dh) : ''))
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit() {
    setError(null)
    if (!receipt || !detail) return setError('Aucun reçu correspondant n’a été trouvé.')
    if (receipt.lifecycle_status === 'cancelled') return setError('Un reçu annulé ne peut plus recevoir de paiement.')
    if (receipt.payment_count >= 6) return setError('Ce reçu contient déjà six paiements.')
    if (receipt.amount_due_dh <= 0) return setError('Ce reçu est déjà soldé.')
    const parsed = paymentPayload(draft)
    if (!parsed.payload) return setError(parsed.message)
    const payload = parsed.payload
    if (receipt.payment_count === 5 && payload.amountDh !== receipt.amount_due_dh) return setError(`Le sixième paiement doit solder exactement ${dh(receipt.amount_due_dh)}.`)
    if (payload.amountDh > receipt.amount_due_dh) return setError(`Le paiement dépasse le reste de ${dh(receipt.amount_due_dh)}.`)
    const selected = shared.find((item) => item.id === payload.existingSharedOperationId)
    if (selected && payload.amountDh > selected.remainingAmountDh && !payload.confirmOverAllocation) return setError('Confirmez explicitement le dépassement de l’opération partagée.')
    if (payload.usageKind === 'shared' && !payload.existingSharedOperationId && payload.operationAmountDh !== null && payload.amountDh > payload.operationAmountDh && !payload.confirmOverAllocation) return setError('Confirmez explicitement le dépassement de la nouvelle opération partagée.')
    startTransition(async () => {
      const result = await addPaymentAction({ ...payload, receiptId: receipt.receipt_id })
      if (!result.ok) return setError(result.message)
      onComplete(`Le paiement n° ${result.data.paymentNumber} a été enregistré sur le reçu ${receipt.receipt_number}.`)
    })
  }

  return <div className="bill-overlay bill-form-overlay"><article className={`bill-modal bill-payment-modal ${receipt ? 'has-receipt' : ''}`} dir="rtl"><header className="bill-modal-head"><h2>إضافة دفعة</h2><button className="bill-close" onClick={onClose}><X size={16} /></button></header><div className="bill-new-number"><span>رقم الوصل</span><strong>{receipt?.receipt_number ?? '—'}</strong><span>{receipt ? receipt.traveler_first_name_snapshot : 'اكتب الرقم'}</span></div><div className="bill-modal-body"><ErrorMessage message={error} /><label className="bill-control"><span>رقم الوصل *</span><input dir="ltr" className="bill-receipt-search-input" value={receiptNumber} onChange={(event) => { setReceiptNumber(event.target.value.replace(/\D/g, '')); setDraft(emptyPaymentDraft()) }} /></label>{receipt && detail ? <><div className="bill-pay-summary"><div><span>المبلغ المتفق عليه</span><b>{dh(receipt.agreed_amount_dh)}</b></div><div><span>المدفوع سابقاً</span><b>{dh(receipt.total_paid_dh)}</b></div><div><span>عدد الدفعات</span><b>{receipt.payment_count} / 6</b></div><div><span>الباقي</span><strong>{dh(receipt.amount_due_dh)}</strong></div></div><PaymentFields draft={draft} onChange={setDraft} sharedOperations={shared} /></> : <p className="bill-payment-hint">لا يوجد وصل مطابق ضمن الموسم النشط.</p>}</div><footer className="bill-modal-foot"><button className="bill-btn" onClick={onClose} disabled={pending}>إلغاء</button><button className="bill-btn primary" onClick={submit} disabled={pending || !receipt}>{pending ? 'جارٍ الحفظ...' : 'حفظ الدفعة'}</button></footer></article></div>
}

export function FunctionalEditModal({ receipt, detail, references, dataset, onClose, onComplete }: { receipt: BillingReceiptRow; detail: BillingReceiptDetail; references: FacturationReferenceData; dataset: BillingDataset; onClose: () => void; onComplete: (message: string) => void }) {
  const firstPayment = detail.payments.find((payment) => payment.payment_number === 1)
  const firstOperation = detail.operations.find((operation) => operation.id === firstPayment?.payment_operation_id)
  const shared = useMemo(
    () => sharedOperationOptions(dataset).filter((operation) => operation.id !== firstOperation?.id),
    [dataset, firstOperation?.id],
  )
  const [section, setSection] = useState<'identity' | 'phone' | 'program' | 'group' | 'note' | 'first-payment' | null>(null)
  const [firstName, setFirstName] = useState(receipt.traveler_first_name_snapshot)
  const [lastName, setLastName] = useState(receipt.traveler_last_name_snapshot)
  const [phone, setPhone] = useState(receipt.traveler_phone_snapshot ?? '')
  const [note, setNote] = useState(detail.registration.note ?? '')
  const [hotelId, setHotelId] = useState(detail.registration.hotel_id)
  const [flightId, setFlightId] = useState(detail.registration.flight_id)
  const [roomId, setRoomId] = useState(detail.registration.room_id)
  const [discount, setDiscount] = useState(String(receipt.discount_amount_dh))
  const [dossierAction, setDossierAction] = useState<'move_to_existing' | 'separate_to_technical'>('move_to_existing')
  const [targetDossierId, setTargetDossierId] = useState('')
  const [firstPaymentDraft, setFirstPaymentDraft] = useState<PaymentDraft>(() => ({
    amount: firstPayment ? String(firstPayment.amount_dh) : '',
    mode: firstOperation?.payment_mode ?? 'cash',
    usageKind: firstOperation?.usage_kind ?? 'unique',
    sharedSource: 'new',
    existingOperationId: '',
    operationAmount: firstOperation?.usage_kind === 'shared' ? String(firstOperation.operation_amount_dh) : '',
    reference: firstOperation?.instrument?.reference ?? '',
    bankName: firstOperation?.instrument?.bank_name ?? '',
    instrumentDate: firstOperation?.instrument?.instrument_date ?? '',
    payerName: firstOperation?.instrument?.payer_name ?? '',
    confirmOverAllocation: false,
  }))
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const season = references.activeSeason

  function submit() {
    if (!section) return
    setError(null)
    if (!reason.trim()) return setError('Le motif de modification est obligatoire.')
    startTransition(async () => {
      let result
      if (section === 'identity') result = await updatePersonalAction({ receiptId: receipt.receipt_id, sectionCode: 'identity', firstName: firstName.trim(), lastName: lastName.trim(), phone: null, note: null, reason: reason.trim() })
      else if (section === 'phone') result = await updatePersonalAction({ receiptId: receipt.receipt_id, sectionCode: 'phone', firstName: null, lastName: null, phone: phoneDigits(phone), note: null, reason: reason.trim() })
      else if (section === 'note') result = await updatePersonalAction({ receiptId: receipt.receipt_id, sectionCode: 'note', firstName: null, lastName: null, phone: null, note: note.trim() || null, reason: reason.trim() })
      else if (section === 'first-payment') {
        if (!firstPayment || !firstOperation) return setError('Le premier paiement ne possède pas d’opération exploitable.')
        const parsed = paymentPayload(firstPaymentDraft)
        if (!parsed.payload) return setError(parsed.message)
        result = await correctFirstPaymentMethodAction({
          receiptId: receipt.receipt_id,
          reason: reason.trim(),
          mode: parsed.payload.mode,
          usageKind: parsed.payload.usageKind,
          existingSharedOperationId: parsed.payload.existingSharedOperationId,
          operationAmountDh: parsed.payload.operationAmountDh,
          instrumentReference: parsed.payload.instrumentReference,
          bankName: parsed.payload.bankName,
          instrumentDate: parsed.payload.instrumentDate,
          payerName: parsed.payload.payerName,
          confirmOverAllocation: parsed.payload.confirmOverAllocation,
        })
      }
      else if (section === 'program') {
        const reduction = integer(discount)
        if (reduction === null) return setError('La réduction doit être un entier positif ou nul.')
        result = await updateCommercialAction({ receiptId: receipt.receipt_id, hotelId, flightId, roomId, discountAmountDh: reduction, reason: reason.trim() })
      } else result = await updateDossierAction({ receiptId: receipt.receipt_id, action: dossierAction, targetDossierId: dossierAction === 'move_to_existing' ? targetDossierId : null, reason: reason.trim() })
      if (!result.ok) return setError(result.message)
      onComplete('La modification a été enregistrée et ajoutée à l’historique.')
    })
  }

  const choices = [
    ['identity', 'الهوية', 'الاسم والنسب معًا'], ['phone', 'الهاتف', 'رقم الهاتف فقط'], ['program', 'البرنامج والسعر', 'الفندق، الرحلة، الغرفة والتخفيض'], ['group', 'المجموعة / العائلة', 'نقل أو فصل الملف'], ['note', 'الملاحظة', 'تعديل الملاحظة فقط'], ['first-payment', 'طريقة الدفعة الأولى', 'الطريقة وبيانات الشيك أو التحويل، دون تغيير المبلغ'],
  ] as const
  const currentOperationLabel = firstOperation
    ? `${firstOperation.payment_mode === 'cash' ? 'نقد' : firstOperation.payment_mode === 'cheque' ? 'شيك' : 'تحويل'} — ${firstOperation.usage_kind === 'shared' ? 'مشتركة' : 'فريدة'}`
    : '—'
  return <div className="bill-overlay bill-form-overlay"><article className="bill-modal bill-edit-modal" dir="rtl"><header className="bill-modal-head"><h2>تعديل بيانات الوصل</h2><button className="bill-close" onClick={onClose}><X size={16} /></button></header><div className="bill-edit-fixed"><div><span>رقم الوصل — ثابت</span><strong>{receipt.receipt_number}</strong></div><div><span>المبلغ المدفوع — ثابت</span><b>{dh(receipt.total_paid_dh)}</b></div></div><div className="bill-modal-body"><ErrorMessage message={error} />{section === null ? <><div className="bill-edit-choices">{choices.map(([id, title, description]) => <button key={id} type="button" onClick={() => setSection(id)}><strong>{title}</strong><span>{description}</span></button>)}</div><div className="bill-warning">مبالغ الدفعات غير قابلة للتعديل. الدفعات الثانية وما بعدها تبقى كما سُجلت.</div></> : <><div className="bill-edit-selected"><button onClick={() => setSection(null)}>←</button><strong>{choices.find(([id]) => id === section)?.[1]}</strong></div>{section === 'identity' ? <div className="bill-form-grid two"><label className="bill-control"><span>الاسم *</span><input value={firstName} onChange={(event) => setFirstName(event.target.value)} /></label><label className="bill-control"><span>النسب *</span><input value={lastName} onChange={(event) => setLastName(event.target.value)} /></label></div> : null}{section === 'phone' ? <label className="bill-control"><span>رقم الهاتف *</span><input dir="ltr" value={phone} onChange={(event) => setPhone(event.target.value)} /></label> : null}{section === 'note' ? <label className="bill-control"><span>ملاحظة</span><textarea value={note} onChange={(event) => setNote(event.target.value)} /></label> : null}{section === 'program' ? <div className="bill-form-grid"><label className="bill-control"><span>الفندق *</span><select value={hotelId} onChange={(event) => setHotelId(event.target.value)}>{season?.hotels.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><label className="bill-control"><span>الرحلة *</span><select value={flightId} onChange={(event) => setFlightId(event.target.value)}>{season?.flights.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><label className="bill-control"><span>الغرفة *</span><select value={roomId} onChange={(event) => setRoomId(event.target.value)}>{season?.rooms.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><label className="bill-control"><span>التخفيض</span><input dir="ltr" value={discount} onChange={(event) => setDiscount(event.target.value.replace(/\D/g, ''))} /></label></div> : null}{section === 'group' ? <div className="bill-form-grid two"><label className="bill-control"><span>الإجراء</span><select value={dossierAction} onChange={(event) => setDossierAction(event.target.value as typeof dossierAction)}><option value="move_to_existing">نقل إلى ملف موجود</option><option value="separate_to_technical">فصل في ملف مستقل</option></select></label>{dossierAction === 'move_to_existing' ? <label className="bill-control"><span>الملف الهدف *</span><select value={targetDossierId} onChange={(event) => setTargetDossierId(event.target.value)}><option value="">اختر...</option>{references.dossiers.filter((item) => item.id !== receipt.dossier_id).map((item) => <option key={item.id} value={item.id}>{item.reference}</option>)}</select></label> : null}</div> : null}{section === 'first-payment' ? <><div className="bill-pay-summary"><div><span>مبلغ الدفعة الأولى — لا يتغير</span><b>{dh(firstPayment?.amount_dh)}</b></div><div><span>العملية الحالية</span><b>{currentOperationLabel}</b></div></div><PaymentFields draft={firstPaymentDraft} onChange={setFirstPaymentDraft} sharedOperations={shared} amountLocked /></> : null}<label className="bill-control bill-edit-reason"><span>سبب التعديل *</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} /></label></>}</div><footer className="bill-modal-foot"><button className="bill-btn" onClick={onClose} disabled={pending}>إلغاء</button>{section ? <button className="bill-btn primary" onClick={submit} disabled={pending}>{pending ? 'جارٍ الحفظ...' : 'حفظ التعديل'}</button> : null}</footer></article></div>
}

export function FunctionalCancelModal({ receipt, onClose, onComplete }: { receipt: BillingReceiptRow; onClose: () => void; onComplete: (message: string) => void }) {
  const [cash, setCash] = useState('0')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  function submit() {
    const cashOutflowAmountDh = integer(cash)
    if (cashOutflowAmountDh === null) return setError('La sortie réelle en espèces doit être un entier positif ou nul.')
    if (!reason.trim()) return setError('Le motif d’annulation est obligatoire.')
    if (!window.confirm(`Confirmer l’annulation complète du reçu ${receipt.receipt_number} ?`)) return
    startTransition(async () => {
      const result = await cancelReceiptAction({ receiptId: receipt.receipt_id, reason: reason.trim(), cashOutflowAmountDh })
      if (!result.ok) return setError(result.message)
      onComplete(`Le reçu ${receipt.receipt_number} a été annulé sans supprimer ses paiements ni son historique.`)
    })
  }
  return <div className="bill-overlay bill-form-overlay"><article className="bill-modal bill-cancel-modal" dir="rtl"><header className="bill-modal-head"><div><h2>إلغاء الوصل</h2><p>الوصل رقم {receipt.receipt_number}</p></div><button className="bill-close" onClick={onClose}><X size={16} /></button></header><div className="bill-modal-body"><ErrorMessage message={error} /><p className="bill-cancel-intro">الوصل لا يُحذف أبدًا. يبقى رقمه ودفعاته وسجله محفوظًا بعد الإلغاء.</p><div className="bill-pay-summary"><div><span>المبلغ الإجمالي الملغى</span><b>{dh(receipt.total_paid_dh)}</b></div></div><label className="bill-control bill-cancel-field"><span>المبلغ الخارج فعلياً من الصندوق نقداً *</span><input dir="ltr" inputMode="numeric" value={cash} onChange={(event) => setCash(event.target.value.replace(/\D/g, ''))} /></label><label className="bill-control bill-cancel-field"><span>سبب الإلغاء *</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} /></label></div><footer className="bill-modal-foot"><button className="bill-btn" onClick={onClose} disabled={pending}>تراجع</button><button className="bill-btn danger" onClick={submit} disabled={pending}>{pending ? 'جارٍ الإلغاء...' : 'تأكيد الإلغاء'}</button></footer></article></div>
}

export function FunctionalOperationModal({ operation, dataset, isAdministrator, onClose, onComplete }: { operation: BillingOperation; dataset: BillingDataset; isAdministrator: boolean; onClose: () => void; onComplete: (message: string) => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const linked = Object.values(dataset.details).flatMap((detail) => detail.payments.filter((payment) => payment.payment_operation_id === operation.id).map((payment) => ({ detail, payment, receipt: dataset.receipts.find((item) => item.receipt_id === detail.receipt.id) }))).filter((item) => item.receipt)
  function upload() {
    if (!file) return setError('Sélectionnez une image JPEG, PNG ou WebP.')
    const form = new FormData(); form.set('operationId', operation.id); form.set('file', file)
    startTransition(async () => { const result = await uploadEvidenceAction(form); if (!result.ok) return setError(result.message); onComplete('Le justificatif a été ajouté à l’opération.') })
  }
  function remove() {
    if (!reason.trim()) return setError('Le motif de suppression est obligatoire.')
    if (!window.confirm('Confirmer la suppression logique du justificatif actif ?')) return
    startTransition(async () => { const result = await deleteEvidenceAction(operation.id, reason.trim()); if (!result.ok) return setError(result.message); onComplete(result.warning ?? 'Le justificatif a été supprimé logiquement et conservé dans l’historique.') })
  }
  function view() { startTransition(async () => { const receiptId = linked[0]?.receipt?.receipt_id; if (!receiptId) return setError('Aucun reçu lié ne permet de vérifier ce justificatif.'); const result = await getEvidenceUrlAction(operation.id, receiptId); if (!result.ok) return setError(result.message); window.open(result.data.url, '_blank', 'noopener,noreferrer') }) }
  return <div className="bill-overlay bill-operation-overlay"><article className="bill-modal bill-operation-modal" dir="ltr"><header className="bill-modal-head"><div><h2>{operation.payment_mode === 'transfer' ? 'Virement' : 'Chèque'} — {operation.instrument?.reference ?? '—'}</h2><p>{operation.usage_kind === 'shared' ? 'Opération partagée' : 'Opération unique'}</p></div><button className="bill-close" onClick={onClose}><X size={16} /></button></header><div className="bill-modal-body"><ErrorMessage message={error} /><section className="bill-operation-image">{operation.has_active_supporting_image ? <button className="bill-evidence bill-evidence-large" onClick={view} disabled={pending}><FileImage size={42} /><span>Ouvrir le justificatif actif</span></button> : <div><ImagePlus size={38} /><strong>Aucune image associée</strong></div>}</section>{!operation.has_active_supporting_image ? <div className="bill-operation-actions"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /><button className="bill-btn primary" onClick={upload} disabled={pending || !file}>Ajouter l’image</button></div> : <div className="bill-operation-actions"><label className="bill-control"><span>Motif de suppression administrateur</span><input value={reason} onChange={(event) => setReason(event.target.value)} disabled={!isAdministrator} /></label><button className="bill-btn danger" disabled={!isAdministrator || pending} onClick={remove}><Trash2 size={14} /> Supprimer l’image</button></div>}<section className="bill-operation-grid"><div><span>Montant réel</span><b>{dh(operation.operation_amount_dh)}</b></div><div><span>Attribué</span><b>{dh(operation.allocated_total_dh)}</b></div><div><span>Restant</span><b>{dh(operation.remaining_amount_dh)}</b></div><div><span>Banque</span><b>{operation.instrument?.bank_name ?? '—'}</b></div><div><span>Payeur</span><b>{operation.instrument?.payer_name ?? '—'}</b></div><div><span>Employé</span><b>{operation.created_by.slot_label}</b></div></section><section className="bill-operation-allocation"><h3>Répartition entre les reçus</h3><table><thead><tr><th>Reçu</th><th>Client</th><th>Montant attribué</th><th>Situation</th></tr></thead><tbody>{linked.map(({ receipt, payment }) => <tr key={payment.id}><td>{receipt!.receipt_number}</td><td dir="rtl">{receipt!.traveler_first_name_snapshot} {receipt!.traveler_last_name_snapshot}</td><td>{dh(payment.amount_dh)}</td><td>{receipt!.lifecycle_status === 'cancelled' ? 'Reçu annulé' : 'Actif'}</td></tr>)}</tbody></table></section></div></article></div>
}
