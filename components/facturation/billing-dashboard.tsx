'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Banknote,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleUserRound,
  FileImage,
  FilePlus2,
  History,
  ImagePlus,
  Pencil,
  Plus,
  Printer,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { BillingTopbar, type FacturationScreen } from '@/components/facturation/billing-topbar'
import {
  FunctionalCancelModal,
  FunctionalEditModal,
  FunctionalNewReceiptModal,
  FunctionalOperationModal,
  FunctionalPaymentModal,
} from '@/components/facturation/billing-functional-modals'
import { recordReceiptPrintAction } from '@/app/facturation/actions'
import { calculateBillingStats, historyLabel } from '@/lib/facturation/format'
import type { FacturationReferenceData } from '@/lib/facturation/workflow-types'
import type {
  BillingDataset,
  BillingOperation,
  BillingPayment,
  BillingReceiptDetail,
  BillingReceiptRow,
  PaymentMode,
} from '@/lib/facturation/types'

type ModalName = 'detail' | 'new' | 'payment' | 'edit' | 'cancel' | 'receipt' | 'operation' | 'anomalies' | null
type FinanceTab = 'finance' | 'payments' | 'daily'

const number = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })

function amount(value: number) {
  return number.format(Math.round(value)).replace(/\u202f/g, ' ')
}

function Money({ value, unit = true, className = '' }: { value: number | null | undefined; unit?: boolean; className?: string }) {
  const text = value == null ? '—' : unit ? `${amount(value)} DH` : amount(value)
  return <bdi dir="ltr" className={`bill-money ${className}`.trim()}>{text}</bdi>
}

function Ltr({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <bdi dir="ltr" className={`bill-ltr ${className}`.trim()}>{children}</bdi>
}

function date(value: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value))
}

function time(value: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

function dateKey(value: string | Date) {
  return new Intl.DateTimeFormat('fr-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit' }).format(typeof value === 'string' ? new Date(value) : value)
}

function arabicMode(mode: PaymentMode | undefined) {
  if (mode === 'cheque') return 'شيك'
  if (mode === 'transfer') return 'تحويل'
  return 'نقد'
}

function frenchMode(mode: PaymentMode) {
  if (mode === 'cheque') return 'Chèque'
  if (mode === 'transfer') return 'Virement'
  return 'Espèces'
}

function financialArabic(receipt: BillingReceiptRow) {
  if (receipt.lifecycle_status === 'cancelled') return 'ملغى'
  if (receipt.financial_status === 'paid') return 'مسدد'
  if (receipt.financial_status === 'overpaid') return 'فائض'
  return 'غير مكتمل'
}

function firstPayment(detail: BillingReceiptDetail | undefined) {
  return detail?.payments.at(-1)
}

function operationForPayment(detail: BillingReceiptDetail | undefined, payment: BillingPayment | undefined) {
  return detail?.operations.find((operation) => operation.id === payment?.payment_operation_id)
}

function TableAction({ title, children, disabled, onClick }: { title: string; children: React.ReactNode; disabled?: boolean; onClick: () => void }) {
  return <button type="button" title={title} aria-label={title} disabled={disabled} onClick={(event) => { event.stopPropagation(); onClick() }}>{children}</button>
}

function EmptyRow({ columns, label }: { columns: number; label: string }) {
  return <tr><td className="bill-table-empty" colSpan={columns}>{label}</td></tr>
}

function WaslScreen({
  dataset,
  source,
  demoAvailable,
  query,
  receiptQuery,
  showCancelled,
  notice,
  onQuery,
  onReceiptQuery,
  onToggleCancelled,
  onToggleSource,
  onAction,
}: {
  dataset: BillingDataset
  source: 'real' | 'demo'
  demoAvailable: boolean
  query: string
  receiptQuery: string
  showCancelled: boolean
  notice: string | null
  onQuery: (value: string) => void
  onReceiptQuery: (value: string) => void
  onToggleCancelled: () => void
  onToggleSource: () => void
  onAction: (modal: Exclude<ModalName, null>, receipt?: BillingReceiptRow) => void
}) {
  const rows = dataset.receipts.filter((receipt) => {
    if (!showCancelled && receipt.lifecycle_status === 'cancelled') return false
    const name = `${receipt.traveler_first_name_snapshot} ${receipt.traveler_last_name_snapshot}`.toLocaleLowerCase('ar')
    if (query.trim() && !name.includes(query.trim().toLocaleLowerCase('ar'))) return false
    if (receiptQuery.trim() && !String(receipt.receipt_number).includes(receiptQuery.trim())) return false
    return true
  })

  return (
    <main className="bill-screen bill-home" dir="rtl">
      <div className="bill-home-tools">
        <button className="bill-home-action primary" type="button" onClick={() => onAction('new')}><FilePlus2 size={15} />وصل جديد</button>
        <button className="bill-home-action" type="button" onClick={() => onAction('payment')}><Banknote size={15} />إضافة دفعة</button>
        <label className="bill-field bill-field-name"><span>الاسم</span><span className="bill-input-wrap"><Search size={15} /><input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="بحث..." /></span></label>
        <label className="bill-field bill-field-receipt"><span>رقم الوصل</span><span className="bill-input-wrap"><Search size={15} /><input value={receiptQuery} inputMode="numeric" onChange={(event) => onReceiptQuery(event.target.value)} placeholder="رقم الوصل" /></span></label>
        <span className="bill-home-count">{rows.filter((row) => row.lifecycle_status === 'active').length} وصل نشط · {rows.filter((row) => row.lifecycle_status === 'cancelled').length} ملغى</span>
        {demoAvailable ? <button className="bill-source" type="button" onClick={onToggleSource}>{source === 'demo' ? 'عرض البيانات الحقيقية' : 'تشغيل العرض التجريبي'}</button> : null}
      </div>
      {notice ? <div className="bill-notice" role="status">{notice}</div> : null}
      <div className="bill-home-card">
        <div className="bill-table-shell bill-wasl-scroll" dir="rtl" data-column-count="20">
          <table className="bill-table bill-wasl-table">
            <colgroup>{[62, 164, 96, 87, 70, 89, 74, 48, 50, 108, 88, 45, 104, 77, 178, 71, 57, 105, 136, 136].map((width, index) => <col key={index} style={{ width }} />)}</colgroup>
            <thead><tr>
              <th>رقم</th><th>الاسم / النسب</th><th>المبلغ المتفق عليه</th><th>مجموع الدفعات</th><th>الباقي</th><th>تاريخ التسجيل</th><th>عدد الدفعات</th><th>آخر دفعة</th><th>الطريقة</th><th>الحالة</th><th>الفندق</th><th>الغرفة</th><th>الرحلة</th><th>الوسيط</th><th>ملاحظة</th><th>الموظف</th><th>التخفيض</th><th>رقم الهاتف</th><th>المجموعة</th><th>الإجراءات</th>
            </tr></thead>
            <tbody>
              {!rows.length ? <EmptyRow columns={20} label={source === 'real' ? 'لا توجد وصولات مسجلة في البيانات الحقيقية' : 'لا توجد نتائج مطابقة'} /> : rows.map((receipt) => {
                const detail = dataset.details[receipt.receipt_id]
                const payment = firstPayment(detail)
                const cancelled = receipt.lifecycle_status === 'cancelled'
                return (
                  <tr key={receipt.receipt_id} className={cancelled ? 'cancelled' : ''} onDoubleClick={() => onAction('detail', receipt)}>
                    <td><span className="bill-number">{receipt.receipt_number}</span></td>
                    <td><bdi dir="auto" className="bill-auto">{receipt.traveler_first_name_snapshot} {receipt.traveler_last_name_snapshot}</bdi></td>
                    <td><Money value={receipt.agreed_amount_dh} unit={false} /></td>
                    <td><Money value={receipt.total_paid_dh} unit={false} /></td>
                    <td><Money value={receipt.amount_due_dh} unit={false} className={receipt.amount_due_dh > 0 ? 'bill-due' : ''} /></td>
                    <td><Ltr>{date(receipt.receipt_created_at)}</Ltr></td>
                    <td><Ltr><b>{receipt.payment_count}</b>/6</Ltr></td>
                    <td><Money value={payment?.amount_dh} unit={false} /></td>
                    <td><span className={`bill-method ${payment?.payment_mode ?? 'cash'}`}>{arabicMode(payment?.payment_mode)}</span></td>
                    <td><span className={`bill-status ${cancelled ? 'cancelled' : receipt.financial_status === 'paid' ? 'paid' : ''}`}>{financialArabic(receipt)}</span></td>
                    <td><bdi dir="auto" className="bill-auto">{receipt.hotel_name_snapshot || '—'}</bdi></td><td><Ltr>{receipt.room_label_snapshot || '—'}</Ltr></td><td><bdi dir="auto" className="bill-auto">{receipt.flight_label_snapshot || '—'}</bdi></td>
                    <td><bdi dir="auto" className="bill-auto">{detail?.registration.rabatteur_name_snapshot ?? '—'}</bdi></td><td><bdi dir="auto" className="bill-auto">{detail?.registration.note ?? '—'}</bdi></td><td><bdi dir="auto" className="bill-auto">{detail?.receipt.created_by.slot_label ?? '—'}</bdi></td>
                    <td><Money value={receipt.discount_amount_dh || null} unit={false} /></td><td><Ltr>{receipt.traveler_phone_snapshot ?? '—'}</Ltr></td><td><Ltr>{receipt.visible_dossier_reference ?? '—'}</Ltr></td>
                    <td><div className="bill-row-actions">
                      <TableAction title="إلغاء الوصل" disabled={cancelled} onClick={() => onAction('cancel', receipt)}><Trash2 size={14} /></TableAction>
                      <TableAction title="تعديل" disabled={cancelled} onClick={() => onAction('edit', receipt)}><Pencil size={14} /></TableAction>
                      <TableAction title="عرض الوصل / الطباعة" onClick={() => onAction('receipt', receipt)}><Printer size={14} /></TableAction>
                      <TableAction title="إضافة دفعة" disabled={cancelled || receipt.payment_count >= 6 || receipt.amount_due_dh === 0} onClick={() => onAction('payment', receipt)}><Plus size={15} /></TableAction>
                    </div></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="bill-footer"><span>{rows.length} وصل معروض</span><label><input type="checkbox" checked={showCancelled} onChange={onToggleCancelled} /> إظهار الوصولات الملغاة</label><span>انقر مرتين على السطر لعرض الملف الكامل</span></div>
      </div>
    </main>
  )
}

type FinanceRow = { receipt: BillingReceiptRow; detail: BillingReceiptDetail; payment: BillingPayment; operation: BillingOperation | undefined }

function buildFinanceRows(dataset: BillingDataset): FinanceRow[] {
  return dataset.receipts.flatMap((receipt) => {
    const detail = dataset.details[receipt.receipt_id]
    if (!detail) return []
    return detail.payments.map((payment) => ({ receipt, detail, payment, operation: operationForPayment(detail, payment) }))
  }).sort((a, b) => b.payment.registered_at.localeCompare(a.payment.registered_at))
}

function summarizeFinancialRows(rows: FinanceRow[]) {
  const bankOperations = new Map<string, BillingOperation>()
  let cash = 0

  for (const row of rows) {
    if (row.payment.payment_mode === 'cash') {
      cash += row.payment.amount_dh
      continue
    }
    if (row.operation) bankOperations.set(row.operation.id, row.operation)
  }

  const operations = [...bankOperations.values()]
  const chequeOperations = operations.filter((operation) => operation.payment_mode === 'cheque')
  const transferOperations = operations.filter((operation) => operation.payment_mode === 'transfer')
  const cheque = chequeOperations.reduce((sum, operation) => sum + operation.operation_amount_dh, 0)
  const transfer = transferOperations.reduce((sum, operation) => sum + operation.operation_amount_dh, 0)

  return {
    cash,
    cheque,
    transfer,
    total: cash + cheque + transfer,
    chequeCount: chequeOperations.length,
    transferCount: transferOperations.length,
    bankOperationCount: operations.length,
  }
}

function FinanceTable({ rows, cancelled = false }: { rows: FinanceRow[]; cancelled?: boolean }) {
  return <table className="bill-table bill-finance-table"><thead><tr><th>الوقت</th><th>التاريخ</th><th>رقم الوصل</th><th>الدفعة</th><th>الاسم الكامل</th><th>نقد</th><th>شيك / تحويل</th><th>الطريقة</th><th>القيمة الحقيقية</th><th>بيانات الشيك</th><th>الموظف</th><th>الوسيط</th><th>الفندق</th><th>الغرفة</th><th>الرحلة</th><th>المبلغ المتفق</th><th>الباقي</th><th>الحالة</th></tr></thead><tbody>
    {!rows.length ? <EmptyRow columns={18} label={cancelled ? 'لا توجد وصولات ملغاة' : 'لا توجد عمليات في هذا اليوم'} /> : rows.map(({ receipt, detail, payment, operation }) => <tr key={payment.id} className={cancelled ? 'cancelled' : ''}>
      <td><Ltr>{time(payment.registered_at)}</Ltr></td><td><Ltr>{date(payment.registered_at)}</Ltr></td><td><b style={{ color: '#a77a11' }}>{receipt.receipt_number}</b></td><td>{payment.payment_number}</td><td>{receipt.traveler_first_name_snapshot} {receipt.traveler_last_name_snapshot}</td><td><Money value={payment.payment_mode === 'cash' ? payment.amount_dh : null} unit={false} /></td><td><Money value={payment.payment_mode !== 'cash' ? payment.amount_dh : null} unit={false} /></td><td><b><Ltr>{payment.payment_mode === 'cash' ? 'E' : payment.payment_mode === 'cheque' ? 'CH' : 'V'}</Ltr></b></td><td><Money value={operation && operation.usage_kind === 'shared' ? operation.operation_amount_dh : null} unit={false} /></td><td>{operation?.instrument ? <><span>{operation.instrument.bank_name}</span> / <Ltr>{operation.instrument.reference}</Ltr></> : '—'}</td><td>{payment.created_by.slot_label}</td><td>{detail.registration.rabatteur_name_snapshot ?? '—'}</td><td>{receipt.hotel_name_snapshot}</td><td><Ltr>{receipt.room_label_snapshot}</Ltr></td><td>{receipt.flight_label_snapshot}</td><td><Money value={receipt.agreed_amount_dh} unit={false} /></td><td><Money value={receipt.amount_due_dh} unit={false} /></td><td>{receipt.lifecycle_status === 'cancelled' ? '×' : receipt.financial_status === 'paid' ? '✓' : '•'}</td>
    </tr>)}
  </tbody></table>
}

function FinanceScreen({ dataset, onAnomalies }: { dataset: BillingDataset; onAnomalies: () => void }) {
  const [period, setPeriod] = useState<'today' | 'yesterday' | 'all' | 'date'>('all')
  const [selectedDate, setSelectedDate] = useState(dateKey(new Date()))
  const allRows = useMemo(() => buildFinanceRows(dataset), [dataset])
  const isInPeriod = (value: string | null) => {
    if (!value) return false
    if (period === 'all') return true
    const target = period === 'yesterday' ? dateKey(new Date(Date.now() - 86_400_000)) : selectedDate
    return dateKey(value) === target
  }
  const rows = allRows.filter((row) => isInPeriod(row.payment.registered_at))
  const activeRows = rows.filter((row) => row.receipt.lifecycle_status === 'active')
  const cancelledRows = rows.filter((row) => row.receipt.lifecycle_status === 'cancelled')
  const financials = summarizeFinancialRows(rows)
  const cancelledReceipts = dataset.receipts.filter((receipt) => receipt.lifecycle_status === 'cancelled' && isInPeriod(receipt.cancelled_at))
  const cashOut = cancelledReceipts.reduce((sum, receipt) => sum + (dataset.details[receipt.receipt_id]?.receipt.cancellation?.cash_outflow_amount_dh ?? 0), 0)
  const cancelledAmount = cancelledReceipts.reduce((sum, receipt) => sum + (dataset.details[receipt.receipt_id]?.receipt.cancellation?.total_cancelled_dh ?? receipt.total_paid_dh), 0)
  const newReceipts = dataset.receipts.filter((receipt) => isInPeriod(receipt.receipt_created_at))
  const lastReceipt = [...newReceipts].sort((a, b) => b.receipt_created_at.localeCompare(a.receipt_created_at))[0]
  return <main className="bill-report finance-screen" dir="rtl">
    <div className="bill-toolbar"><button className="print" type="button" onClick={() => window.print()}><Printer size={13} /> طباعة</button><input className="date" type="date" value={selectedDate} onChange={(event) => { setSelectedDate(event.target.value); setPeriod('date') }} /><button type="button" className={period === 'all' ? 'active' : ''} onClick={() => setPeriod('all')}>الكل</button><button type="button" className={period === 'yesterday' ? 'active' : ''} onClick={() => setPeriod('yesterday')}>أمس</button><button type="button" className={period === 'today' ? 'active' : ''} onClick={() => { setSelectedDate(dateKey(new Date())); setPeriod('today') }}>اليوم</button></div>
    <div className="bill-summary">
      <button className="bill-summary-card" type="button" onClick={onAnomalies} title="عرض الحالات التي تتطلب الانتباه"><div className="split"><div><strong style={{ color: '#31c90f', fontSize: 48 }}>✓</strong><span>التسجيلات</span></div><div><strong>{dataset.anomalies.length}</strong><span>حالات تتطلب الانتباه</span></div></div></button>
      <div className="bill-summary-card"><div className="line"><span>إلغاء ({cancelledReceipts.length})</span><b><Money value={cancelledAmount} /></b></div><div className="line"><span>المسترد فعلياً</span><b><Money value={cashOut} /></b></div><div className="line"><span>الصندوق</span><b><Money value={financials.cash - cashOut} /></b></div></div>
      <div className="bill-summary-card"><div className="line"><span>جديد</span><strong>{newReceipts.length}</strong></div><div className="line"><span>دفعات</span><strong>{rows.length}</strong></div></div>
      <div className="bill-summary-card primary"><span>المبلغ الإجمالي</span><strong><Money value={financials.total - cashOut} /></strong></div>
      <div className="bill-summary-card"><div className="line"><span>شيك ({financials.chequeCount})</span><b><Money value={financials.cheque} /></b></div><div className="line"><span>تحويل ({financials.transferCount})</span><b><Money value={financials.transfer} /></b></div></div>
      <div className="bill-summary-card"><div className="line"><span>آخر وصل <Ltr>{lastReceipt?.receipt_number ?? '—'}</Ltr></span><strong><Ltr>{date(lastReceipt?.receipt_created_at ?? null)}</Ltr></strong></div><span>{rows.length} عملية</span><strong><Money value={financials.cash} /></strong></div>
    </div>
    <div className="bill-table-shell bill-finance-table-shell"><FinanceTable rows={activeRows} /></div>
    <section className="bill-cancel-band"><div className="bill-cancel-title"><span>الوصولات الملغاة</span><span>{cancelledReceipts.length}</span></div><div className="bill-table-shell" style={{ border: 0, borderRadius: 0, maxHeight: 230 }}><FinanceTable rows={cancelledRows} cancelled /></div></section>
  </main>
}

function PaymentsScreen({ dataset, onOperation }: { dataset: BillingDataset; onOperation: (receipt: BillingReceiptRow, operationId: string) => void }) {
  const [dateFilter, setDateFilter] = useState('')
  const [search, setSearch] = useState('')
  const [mode, setMode] = useState<'all' | 'cheque' | 'transfer'>('all')
  const [usage, setUsage] = useState<'all' | 'unique' | 'shared'>('all')
  const [imageFilter, setImageFilter] = useState<'all' | 'with' | 'without'>('all')
  const allOperations = useMemo(() => {
    const seen = new Set<string>()
    return buildFinanceRows(dataset).filter((row) => {
      if (!row.operation || row.payment.payment_mode === 'cash' || seen.has(row.operation.id)) return false
      seen.add(row.operation.id)
      return true
    })
  }, [dataset])
  const operations = allOperations.filter(({ receipt, operation }) => {
    if (!operation) return false
    if (dateFilter && dateKey(operation.registered_at) !== dateFilter) return false
    if (mode !== 'all' && operation.payment_mode !== mode) return false
    if (usage !== 'all' && operation.usage_kind !== usage) return false
    if (imageFilter === 'with' && !operation.has_active_supporting_image) return false
    if (imageFilter === 'without' && operation.has_active_supporting_image) return false
    const haystack = [operation.instrument?.reference, operation.instrument?.bank_name, operation.instrument?.payer_name, receipt.traveler_first_name_snapshot, receipt.traveler_last_name_snapshot, receipt.receipt_number].join(' ').toLocaleLowerCase('fr')
    return !search.trim() || haystack.includes(search.trim().toLocaleLowerCase('fr'))
  })
  const total = operations.reduce((sum, row) => sum + (row.operation?.operation_amount_dh ?? 0), 0)
  return <main className="bill-payments" dir="ltr">
    <div className="bill-page-title-row"><h1>Paiements — chèques et virements</h1><div className="bill-mini-counters"><div className="bill-mini-counter active"><span>Montant global affiché</span><strong><Money value={total} /></strong></div><div className="bill-mini-counter"><span>Nombre de paiements affichés</span><strong>{operations.length}</strong></div></div></div>
    <div className="bill-filter-panel"><div className="bill-filter-grid"><label>Date d’enregistrement à l’agence<input type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} /></label><label>Recherche<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="N° / référence, banque, payeur, client ou reçu" /></label><label>Mode<select value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}><option value="all">Tous</option><option value="cheque">Chèque</option><option value="transfer">Virement</option></select></label><label>Type<select value={usage} onChange={(event) => setUsage(event.target.value as typeof usage)}><option value="all">Tous</option><option value="unique">Unique</option><option value="shared">Partagé</option></select></label><label>Image<select value={imageFilter} onChange={(event) => setImageFilter(event.target.value as typeof imageFilter)}><option value="all">Toutes</option><option value="with">Avec image</option><option value="without">Sans image</option></select></label></div></div>
    <div className="bill-table-shell" style={{ maxHeight: 'calc(100vh - 300px)' }}><table className="bill-table bill-payment-table"><thead><tr><th>Image</th><th>Date d’enregistrement</th><th>Montant</th><th>Mode</th><th>N° / Référence</th><th>Banque</th><th>Date du paiement</th><th>Type</th><th>Payeur</th><th>Client(s)</th><th>Reçu(s)</th><th>Attribué</th><th>Restant</th><th>Employé</th></tr></thead><tbody>
      {!operations.length ? <EmptyRow columns={14} label="Aucun chèque ou virement enregistré" /> : operations.map(({ receipt, detail, operation }) => operation ? <tr key={operation.id} onDoubleClick={() => onOperation(receipt, operation.id)}><td><span className="bill-evidence">{operation.has_active_supporting_image ? <FileImage size={18} /> : <ImagePlus size={17} />}</span></td><td><Ltr>{date(operation.registered_at)}</Ltr></td><td><b><Money value={operation.operation_amount_dh} /></b></td><td><span className={`bill-method ${operation.payment_mode}`}>{frenchMode(operation.payment_mode)}</span></td><td style={{ color: '#a77a11', fontWeight: 700 }}><Ltr>{operation.instrument?.reference ?? '—'}</Ltr></td><td dir="rtl">{operation.instrument?.bank_name ?? '—'}</td><td><Ltr>{date(operation.instrument?.instrument_date ?? null)}</Ltr></td><td><span className={`bill-method ${operation.usage_kind === 'shared' ? 'cheque' : 'cash'}`}>{operation.usage_kind === 'shared' ? 'Partagé' : 'Unique'}</span></td><td dir="rtl">{operation.instrument?.payer_name ?? '—'}</td><td dir="rtl">{receipt.traveler_first_name_snapshot} {receipt.traveler_last_name_snapshot}</td><td><Ltr>{receipt.receipt_number}</Ltr></td><td><b><Money value={operation.allocated_total_dh} /></b></td><td><Money value={operation.remaining_amount_dh || null} /></td><td dir="rtl">{detail.receipt.created_by.slot_label}</td></tr> : null)}
    </tbody></table></div>
  </main>
}

function DailyScreen({ dataset }: { dataset: BillingDataset }) {
  const stats = calculateBillingStats(dataset)
  const rows = buildFinanceRows(dataset)
  const cancelled = dataset.receipts.filter((receipt) => receipt.lifecycle_status === 'cancelled')
  return <main className="bill-daily" dir="ltr">
    <div className="bill-month"><button className="bill-btn">‹</button><button className="bill-btn"><CalendarDays size={13} /> août 2026</button><button className="bill-btn">›</button><button className="bill-btn">Mois actuel</button></div>
    <h1>Suivi journalier</h1><p>Une ligne compacte par journée, y compris les journées sans activité.</p>
    <div className="bill-daily-summary"><div className="bill-daily-card active"><span>Encaissements</span><strong><Money value={stats.totalCollected} /></strong></div><div className="bill-daily-card active"><span>Espèces</span><strong><Money value={stats.cash} /></strong></div><div className="bill-daily-card"><span>Chèques</span><strong><Ltr>{rows.filter((r) => r.payment.payment_mode === 'cheque').length} | {amount(stats.cheque)} DH</Ltr></strong></div><div className="bill-daily-card"><span>Virements</span><strong><Ltr>{rows.filter((r) => r.payment.payment_mode === 'transfer').length} | {amount(stats.transfer)} DH</Ltr></strong></div><div className="bill-daily-card"><span>Nouveaux clients</span><strong>{dataset.receipts.length}</strong></div><div className="bill-daily-card"><span>Annulations</span><strong><Ltr>{cancelled.length} | {amount(cancelled.reduce((s, r) => s + r.total_paid_dh, 0))} DH</Ltr></strong></div></div>
    <div className="bill-daily-bank">Chèques + virements&nbsp;&nbsp; <b><Money value={stats.cheque + stats.transfer} /></b>&nbsp;&nbsp; · &nbsp;&nbsp;{rows.filter((r) => r.payment.payment_mode !== 'cash').length} opérations bancaires</div>
    <div className="bill-daily-select"><label><input type="checkbox" />&nbsp; Sélectionner toutes les journées affichées</label><span>✓ Journées sans activité affichées</span></div>
    <div className="bill-table-shell" style={{ maxHeight: 420 }}><table className="bill-table bill-daily-table"><thead><tr><th></th><th>Jour</th><th>Date</th><th>Espèces</th><th>Total</th><th>Chèques</th><th>Virements</th><th>Nouveaux</th><th>Annulations</th><th>Contrôle</th></tr></thead><tbody><tr className="bill-weekend"><td><input type="checkbox" /></td><td>Dimanche</td><td><Ltr>02/08/2026</Ltr></td><td><Money value={stats.cash} /></td><td><Money value={stats.totalCollected} /></td><td><Ltr>{rows.filter((r) => r.payment.payment_mode === 'cheque').length} | {amount(stats.cheque)} DH</Ltr></td><td><Ltr>{rows.filter((r) => r.payment.payment_mode === 'transfer').length} | {amount(stats.transfer)} DH</Ltr></td><td>{dataset.receipts.length}</td><td><Ltr>{cancelled.length} | {amount(cancelled.reduce((s, r) => s + r.total_paid_dh, 0))} DH</Ltr></td><td><Ltr>R{dataset.receipts.length} · Op{rows.length} · A{dataset.anomalies.length}</Ltr></td></tr><tr className="bill-weekend"><td><input type="checkbox" /></td><td>Samedi</td><td><Ltr>01/08/2026</Ltr></td><td><Money value={0} /></td><td><Money value={0} /></td><td><Ltr>0 | 0 DH</Ltr></td><td><Ltr>0 | 0 DH</Ltr></td><td>0</td><td><Ltr>0 | 0 DH</Ltr></td><td>Journée sans activité</td></tr></tbody></table></div>
  </main>
}

function StatsScreen() {
  return <main className="bill-stats" dir="rtl"><h1>الإحصائيات</h1><div className="bill-stats-intro"><span>تم حجز الصفحة دون إضافة حسابات أو رسوم الآن، حتى لا تتأثر الفوترة.</span><b>مرحلة لاحقة</b></div><div className="bill-stats-grid"><div className="bill-stats-card"><strong>إحصائيات عامة</strong><span>المسافرون، الوصولات، الحالات</span></div><div className="bill-stats-card"><strong>المدفوعات والصندوق</strong><span>المبالغ، طرق الدفع، الباقي</span></div><div className="bill-stats-card"><strong>الفنادق والرحلات</strong><span>التوزيع حسب البرنامج</span></div><div className="bill-stats-card"><strong>الموظفون</strong><span>النشاط والصلاحيات — للإدارة فقط لاحقًا</span></div></div></main>
}

function ReliableDailyScreen({ dataset }: { dataset: BillingDataset }) {
  const [month, setMonth] = useState(() => { const now = new Date(); return new Date(now.getFullYear(), now.getMonth(), 1) })
  const rows = useMemo(() => buildFinanceRows(dataset), [dataset])
  const monthPrefix = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`
  const monthRows = rows.filter((row) => dateKey(row.payment.registered_at).startsWith(monthPrefix))
  const monthReceipts = dataset.receipts.filter((receipt) => dateKey(receipt.receipt_created_at).startsWith(monthPrefix))
  const monthCancelled = dataset.receipts.filter((receipt) => receipt.cancelled_at && dateKey(receipt.cancelled_at).startsWith(monthPrefix))
  const days = Array.from({ length: new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate() }, (_, index) => new Date(month.getFullYear(), month.getMonth(), index + 1)).reverse()
  const monthFinancials = summarizeFinancialRows(monthRows)
  const monthCashOut = monthCancelled.reduce((sum, receipt) => sum + (dataset.details[receipt.receipt_id]?.receipt.cancellation?.cash_outflow_amount_dh ?? 0), 0)
  const move = (delta: number) => setMonth((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1))
  return <main className="bill-daily" dir="ltr">
    <div className="bill-month"><button className="bill-btn" onClick={() => move(-1)}>‹</button><button className="bill-btn"><CalendarDays size={13} /> {new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(month)}</button><button className="bill-btn" onClick={() => move(1)}>›</button><button className="bill-btn" onClick={() => { const now = new Date(); setMonth(new Date(now.getFullYear(), now.getMonth(), 1)) }}>Mois actuel</button></div>
    <h1>Suivi journalier</h1><p>Une ligne par journée du mois sélectionné, y compris les journées sans activité.</p>
    <div className="bill-daily-summary"><div className="bill-daily-card active"><span>Encaissements</span><strong><Money value={monthFinancials.total - monthCashOut} /></strong></div><div className="bill-daily-card active"><span>Espèces</span><strong><Money value={monthFinancials.cash - monthCashOut} /></strong></div><div className="bill-daily-card"><span>Chèques</span><strong><Money value={monthFinancials.cheque} /></strong></div><div className="bill-daily-card"><span>Virements</span><strong><Money value={monthFinancials.transfer} /></strong></div><div className="bill-daily-card"><span>Nouveaux clients</span><strong>{monthReceipts.length}</strong></div><div className="bill-daily-card"><span>Annulations</span><strong>{monthCancelled.length}</strong></div></div>
    <div className="bill-table-shell" style={{ maxHeight: 520 }}><table className="bill-table bill-daily-table"><thead><tr><th>Jour</th><th>Date</th><th>Espèces</th><th>Total</th><th>Chèques</th><th>Virements</th><th>Nouveaux</th><th>Annulations</th><th>Contrôle</th></tr></thead><tbody>{days.map((day) => { const key = dateKey(day); const dayRows = monthRows.filter((row) => dateKey(row.payment.registered_at) === key); const dayReceipts = monthReceipts.filter((receipt) => dateKey(receipt.receipt_created_at) === key); const dayCancelled = monthCancelled.filter((receipt) => receipt.cancelled_at && dateKey(receipt.cancelled_at) === key); const dayFinancials = summarizeFinancialRows(dayRows); const dayCashOut = dayCancelled.reduce((sum, receipt) => sum + (dataset.details[receipt.receipt_id]?.receipt.cancellation?.cash_outflow_amount_dh ?? 0), 0); return <tr key={key} className={day.getDay() === 0 || day.getDay() === 6 ? 'bill-weekend' : ''}><td>{new Intl.DateTimeFormat('fr-FR', { weekday: 'long' }).format(day)}</td><td><Ltr>{new Intl.DateTimeFormat('fr-FR').format(day)}</Ltr></td><td><Money value={dayFinancials.cash - dayCashOut} /></td><td><Money value={dayFinancials.total - dayCashOut} /></td><td><Ltr>{dayFinancials.chequeCount} | {amount(dayFinancials.cheque)} DH</Ltr></td><td><Ltr>{dayFinancials.transferCount} | {amount(dayFinancials.transfer)} DH</Ltr></td><td>{dayReceipts.length}</td><td>{dayCancelled.length}</td><td>{dayRows.length ? <Ltr>R{dayReceipts.length} · Op{dayRows.length} · B{dayFinancials.bankOperationCount}</Ltr> : 'Journée sans activité'}</td></tr> })}</tbody></table></div>
  </main>
}

function ReliableStatsScreen({ dataset }: { dataset: BillingDataset }) {
  const active = dataset.receipts.filter((receipt) => receipt.lifecycle_status === 'active')
  const cancelled = dataset.receipts.length - active.length
  const paid = active.filter((receipt) => receipt.financial_status === 'paid').length
  const incomplete = active.filter((receipt) => receipt.financial_status === 'incomplete').length
  const hotelCounts = Object.entries(dataset.receipts.reduce<Record<string, number>>((acc, receipt) => { acc[receipt.hotel_name_snapshot] = (acc[receipt.hotel_name_snapshot] ?? 0) + 1; return acc }, {})).sort((a, b) => b[1] - a[1])
  const activePaid = active.reduce((sum, receipt) => sum + receipt.total_paid_dh, 0)
  const activeDue = active.reduce((sum, receipt) => sum + receipt.amount_due_dh, 0)
  return <main className="bill-stats" dir="rtl"><h1>الإحصائيات</h1><div className="bill-stats-grid"><div className="bill-stats-card"><strong>{dataset.receipts.length}</strong><span>مجموع الوصولات · {active.length} نشط · {cancelled} ملغى</span></div><div className="bill-stats-card"><strong>{paid}</strong><span>مسدد · {incomplete} غير مكتمل</span></div><div className="bill-stats-card"><strong><Money value={activePaid} /></strong><span>مجموع المبالغ المدفوعة للوصولات النشطة</span></div><div className="bill-stats-card"><strong><Money value={activeDue} /></strong><span>مجموع الباقي للوصولات النشطة</span></div><div className="bill-stats-card"><strong>{dataset.anomalies.length}</strong><span>حالات تتطلب الانتباه</span></div><div className="bill-stats-card"><strong>{hotelCounts[0]?.[0] ?? '—'}</strong><span>الفندق الأكثر تسجيلاً · {hotelCounts[0]?.[1] ?? 0}</span></div></div></main>
}

function DetailModal({ receipt, detail, onClose, onReceipt }: { receipt: BillingReceiptRow; detail: BillingReceiptDetail; onClose: () => void; onReceipt: () => void }) {
  return <div className="bill-overlay bill-detail-overlay" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose() }}><article className="bill-modal bill-detail-modal" dir="rtl">
    <header className="bill-modal-head"><CircleUserRound size={22} /><div><h2>الملف الكامل للمسافر</h2><p>{receipt.traveler_first_name_snapshot} {receipt.traveler_last_name_snapshot}</p></div><span className={`bill-status ${receipt.lifecycle_status === 'cancelled' ? 'cancelled' : ''}`}>{financialArabic(receipt)}</span><span className="bill-status">{receipt.modification_count ? `${receipt.modification_count} تعديل` : 'غير معدل'}</span><button className="bill-close" type="button" onClick={onClose}><X size={16} /></button></header>
    <section className="bill-detail-identity"><span className="bill-photo"><CircleUserRound size={31} /></span><div className="bill-detail-person"><div className="bill-detail-name">{receipt.traveler_first_name_snapshot} {receipt.traveler_last_name_snapshot}</div><div className="bill-detail-meta"><Ltr>{receipt.traveler_phone_snapshot ?? '—'}</Ltr><Ltr>{receipt.visible_dossier_reference ?? '—'}</Ltr><span>{receipt.season_name_snapshot}</span></div></div><div className="bill-receipt-mark"><span>رقم الوصل</span><strong>{receipt.receipt_number}</strong><Ltr>{date(receipt.receipt_created_at)}</Ltr><Ltr>{time(receipt.receipt_created_at)}</Ltr></div></section>
    <section className="bill-finance-band"><div className="bill-finance-cell original"><span>الثمن الأصلي</span><b><Money value={receipt.catalog_price_dh} /></b><span className="bill-finance-discount">التخفيض</span><b><Money value={receipt.discount_amount_dh} /></b></div><div className="bill-finance-cell agreed"><span>المتفق عليه</span><strong><Money value={receipt.agreed_amount_dh} /></strong></div><div className="bill-finance-cell paid"><span>مجموع الدفعات</span><strong><Money value={receipt.total_paid_dh} /></strong><span><Ltr>{receipt.payment_count} / 6</Ltr> دفعة</span></div><div className="bill-finance-cell due"><span>الباقي</span><strong><Money value={receipt.amount_due_dh} /></strong></div></section>
    <div className="bill-modal-body bill-detail-body"><div className="bill-detail-grid"><section className="bill-info-card"><h3>الهوية والاتصال</h3><div className="bill-info-row"><span>الجواز</span><b>غير مضاف بعد</b></div><div className="bill-info-row"><span>الهاتف</span><b><Ltr>{receipt.traveler_phone_snapshot ?? '—'}</Ltr></b></div><div className="bill-info-row"><span>الوسيط</span><b>{detail.registration.rabatteur_name_snapshot ?? '—'}</b></div><div className="bill-info-row"><span>الملاحظة</span><b>{detail.registration.note ?? '—'}</b></div><div className="bill-info-row"><span>المجموعة</span><b><Ltr>{receipt.visible_dossier_reference ?? '—'}</Ltr></b></div></section><section className="bill-info-card"><h3>البرنامج</h3><div className="bill-info-row"><span>الفندق</span><b>{receipt.hotel_name_snapshot}</b></div><div className="bill-info-row"><span>الغرفة</span><b><Ltr>{receipt.room_label_snapshot}</Ltr></b></div><div className="bill-info-row"><span>الرحلة</span><b>{receipt.flight_label_snapshot}</b></div><div className="bill-info-row"><span>الموسم</span><b>{receipt.season_name_snapshot}</b></div></section><section className="bill-info-card"><h3>معلومات التسجيل</h3><div className="bill-info-row"><span>الموظف</span><b>{detail.receipt.created_by.slot_label}</b></div><div className="bill-info-row"><span>الطباعة</span><b><Ltr>{detail.printing.count}</Ltr></b></div>{detail.printing.last_printed_at ? <div className="bill-info-row"><span>آخر طباعة</span><b><Ltr>{date(detail.printing.last_printed_at)} · {time(detail.printing.last_printed_at)}</Ltr></b></div> : null}<div className="bill-info-row"><span>آخر تعديل</span><b><Ltr>{detail.modifications.last ? date(detail.modifications.last.occurred_at) : '—'}</Ltr></b></div></section>{detail.receipt.cancellation ? <section className="bill-info-card bill-cancelled-card"><h3>إلغاء الوصل</h3><div className="bill-info-row"><span>السبب</span><b>{detail.receipt.cancellation.reason}</b></div><div className="bill-info-row"><span>المبلغ الملغى</span><b><Money value={detail.receipt.cancellation.total_cancelled_dh} /></b></div><div className="bill-info-row"><span>الخروج نقداً</span><b><Money value={detail.receipt.cancellation.cash_outflow_amount_dh} /></b></div></section> : null}</div>
      <section className="bill-detail-payment"><div className="bill-payment-heading"><h3>الدفعات المسجلة</h3><span><Ltr>{receipt.payment_count} / 6</Ltr></span></div><table><thead><tr><th>#</th><th>التاريخ</th><th>المبلغ</th><th>الطريقة</th><th>الوثيقة</th><th>المرجع</th><th>تاريخه</th><th>البنك</th><th>الدافع</th><th>قيمة العملية</th><th>الموظف</th></tr></thead><tbody>{detail.payments.map((payment) => { const operation = operationForPayment(detail, payment); return <tr key={payment.id}><td>{payment.payment_number}</td><td><Ltr>{date(payment.registered_at)}</Ltr></td><td><b><Money value={payment.amount_dh} /></b></td><td>{arabicMode(payment.payment_mode)}</td><td>{operation?.has_active_supporting_image ? 'متوفرة' : '—'}</td><td><Ltr>{operation?.instrument?.reference ?? '—'}</Ltr></td><td><Ltr>{date(operation?.instrument?.instrument_date ?? null)}</Ltr></td><td>{operation?.instrument?.bank_name ?? '—'}</td><td>{operation?.instrument?.payer_name ?? '—'}</td><td><Money value={operation?.usage_kind === 'shared' ? operation.operation_amount_dh : null} /></td><td>{payment.created_by.slot_label}</td></tr>})}</tbody></table></section>
      <details className="bill-history"><summary><History size={13} style={{ display: 'inline', marginInlineEnd: 7 }} />سجل العمليات والتعديلات ({detail.history.length})</summary><ul>{detail.history.map((event) => <li key={event.id}><Ltr>{date(event.occurred_at)}</Ltr> · {historyLabel(event.action_type)} · {event.actor_slot_label}</li>)}</ul></details>
    </div><footer className="bill-modal-foot"><button className="bill-btn primary" type="button" onClick={onReceipt}><Printer size={14} /> عرض الوصل / الطباعة</button><button className="bill-btn" type="button" onClick={onClose}>إغلاق</button></footer>
  </article></div>
}

function NewReceiptModal({ nextNumber, onClose, onLocalSave }: { nextNumber: number; onClose: () => void; onLocalSave: () => void }) {
  return <div className="bill-overlay bill-form-overlay"><article className="bill-modal bill-new-modal" dir="rtl"><header className="bill-modal-head"><h2>وصل جديد</h2><button className="bill-close" onClick={onClose}><X size={16} /></button></header><div className="bill-new-number"><span>رقم</span><strong>{nextNumber}</strong><Ltr>02/08/2026</Ltr></div><div className="bill-modal-body"><section className="bill-form-section"><div className="bill-section-title"><b>المسافر</b><button className="bill-btn" type="button">مسح جواز السفر</button></div><div className="bill-form-grid"><label className="bill-control"><span>الاسم *</span><input /></label><label className="bill-control"><span>النسب *</span><input /></label><label className="bill-control"><span>رقم الهاتف *</span><input dir="ltr" placeholder="0661 __ __ __" /></label></div></section><section className="bill-form-section"><div className="bill-section-title"><b>البرنامج</b></div><div className="bill-form-grid"><label className="bill-control"><span>الفندق *</span><select><option>اختر...</option></select></label><label className="bill-control"><span>الرحلة *</span><select><option>اختر...</option></select></label><label className="bill-control"><span>الغرفة *</span><select><option>اختر...</option></select></label><label className="bill-control"><span>الوسيط *</span><select><option>اختر...</option></select></label><label className="bill-control"><span>التخفيض (درهم)</span><input dir="ltr" inputMode="numeric" /></label></div><div className="bill-price-box"><div className="bill-price-row"><span>الثمن الأصلي</span><b><Ltr>— DH</Ltr></b></div><div className="bill-price-row"><span>التخفيض</span><b><Money value={0} /></b></div><div className="bill-price-row"><span>المبلغ المتفق عليه</span><strong><Ltr>— DH</Ltr></strong></div></div></section><section className="bill-form-section bill-group-choice"><label><input type="checkbox" /> ينتمي إلى مجموعة / عائلة</label></section><section className="bill-form-section"><div className="bill-section-title"><b>الدفعة الأولى — إجبارية</b></div><div className="bill-form-grid two"><label className="bill-control"><span>المبلغ المدفوع *</span><input dir="ltr" inputMode="numeric" /></label><label className="bill-control"><span>طريقة الدفع *</span><select><option>نقد</option><option>شيك</option><option>تحويل</option></select></label></div><div className="bill-pay-summary"><div><span>المدفوع</span><b><Money value={0} /></b></div><div><span>الباقي</span><strong><Ltr>— DH</Ltr></strong></div></div></section><label className="bill-control"><span>ملاحظة</span><textarea /></label></div><footer className="bill-modal-foot"><button className="bill-btn" type="button" onClick={onClose}>إلغاء</button><button className="bill-btn primary" type="button" onClick={onLocalSave}>حفظ الوصل</button></footer></article></div>
}

function PaymentModal({ receipt, detail, onClose, onLocalSave }: { receipt: BillingReceiptRow | null; detail: BillingReceiptDetail | null; onClose: () => void; onLocalSave: () => void }) {
  return <div className="bill-overlay bill-form-overlay"><article className={`bill-modal bill-payment-modal ${receipt ? 'has-receipt' : ''}`} dir="rtl"><header className="bill-modal-head"><h2>إضافة دفعة</h2><button className="bill-close" onClick={onClose}><X size={16} /></button></header><div className="bill-new-number"><span>رقم الوصل</span><strong>{receipt?.receipt_number ?? '—'}</strong><Ltr>02/08/2026</Ltr></div><div className="bill-modal-body"><label className="bill-control"><span>رقم الوصل *</span><input dir="ltr" className="bill-receipt-search-input" defaultValue={receipt?.receipt_number} placeholder="رقم الوصل" inputMode="numeric" /></label>{receipt && detail ? <><div className="bill-pay-summary"><div><span>المبلغ المتفق عليه</span><b><Money value={receipt.agreed_amount_dh} /></b></div><div><span>المدفوع سابقاً</span><b><Money value={receipt.total_paid_dh} /></b></div><div><span>عدد الدفعات</span><b><Ltr>{receipt.payment_count} / 6</Ltr></b></div><div><span>الباقي بعد هذه الدفعة</span><strong><Money value={receipt.amount_due_dh} /></strong></div></div><section className="bill-detail-payment bill-payment-preview"><h3>ملخص الدفعات الست</h3><table><thead><tr><th>الدفعة</th><th>التاريخ</th><th>المبلغ</th><th>طريقة الدفع</th><th>تفاصيل الشيك / التحويل</th><th>الحالة</th></tr></thead><tbody>{detail.payments.map((payment) => <tr key={payment.id}><td>{payment.payment_number}</td><td><Ltr>{date(payment.registered_at)}</Ltr></td><td><Money value={payment.amount_dh} /></td><td>{arabicMode(payment.payment_mode)}</td><td><Ltr>{operationForPayment(detail, payment)?.instrument?.reference ?? '—'}</Ltr></td><td>مسجلة</td></tr>)}</tbody></table></section><div className="bill-form-grid two bill-payment-fields"><label className="bill-control"><span>المبلغ *</span><input dir="ltr" inputMode="numeric" /></label><label className="bill-control"><span>طريقة الدفع *</span><select><option>نقد</option><option>شيك</option><option>تحويل</option></select></label></div></> : <p className="bill-payment-hint">اكتب رقم الوصل مباشرة</p>}</div><footer className="bill-modal-foot"><button className="bill-btn" onClick={onClose}>إلغاء</button><button className="bill-btn primary" onClick={onLocalSave}>حفظ الدفعة</button></footer></article></div>
}

function EditModal({ receipt, onClose, onLocalSave }: { receipt: BillingReceiptRow; onClose: () => void; onLocalSave: () => void }) {
  const [section, setSection] = useState<'identity' | 'phone' | 'program' | 'group' | 'note' | 'first-payment' | null>(null)
  const choices = [
    { id: 'identity' as const, title: 'الهوية', detail: 'الاسم والنسب معًا' },
    { id: 'phone' as const, title: 'الهاتف', detail: 'رقم الهاتف فقط' },
    { id: 'program' as const, title: 'البرنامج والسعر', detail: 'الفندق، الرحلة، الغرفة والتخفيض' },
    { id: 'group' as const, title: 'المجموعة / العائلة', detail: 'إضافة، تغيير أو حذف المجموعة' },
    { id: 'note' as const, title: 'الملاحظة', detail: 'تعديل الملاحظة فقط' },
    { id: 'first-payment' as const, title: 'طريقة الدفعة الأولى', detail: 'الطريقة وبيانات الشيك أو التحويل، دون تغيير المبلغ' },
  ]
  return <div className="bill-overlay bill-form-overlay"><article className="bill-modal bill-edit-modal" dir="rtl"><header className="bill-modal-head"><h2>تعديل بيانات الوصل</h2><button className="bill-close" onClick={onClose}><X size={16} /></button></header><div className="bill-edit-fixed"><div><span>رقم الوصل — ثابت</span><strong>{receipt.receipt_number}</strong></div><div><span>تاريخ التسجيل — ثابت</span><b><Ltr>{date(receipt.receipt_created_at)}</Ltr></b></div><div><span>الوسيط — غير قابل للتعديل</span><b>—</b></div><div><span>مبلغ الدفعة الأولى — ثابت</span><b><Money value={null} /></b></div></div><div className="bill-modal-body">{section === null ? <><p className="bill-edit-intro">اختر قسمًا واحدًا فقط. بعد حفظه يمكنك فتح التعديل مرة أخرى لاختيار قسم آخر.</p><div className="bill-edit-choices">{choices.map((choice) => <button key={choice.id} type="button" onClick={() => setSection(choice.id)}><strong>{choice.title}</strong><span>{choice.detail}</span></button>)}</div><div className="bill-warning bill-edit-warning">الوسيط ومبالغ الدفعات غير قابلة للتعديل. الدفعات الثانية وما بعدها تبقى كما سُجلت.</div></> : <><div className="bill-edit-selected"><button type="button" onClick={() => setSection(null)}>←</button><div><span>القسم المختار</span><strong>{choices.find((choice) => choice.id === section)?.title}</strong></div></div>{section === 'identity' ? <div className="bill-form-grid two"><label className="bill-control"><span>الاسم *</span><input defaultValue={receipt.traveler_first_name_snapshot} /></label><label className="bill-control"><span>النسب *</span><input defaultValue={receipt.traveler_last_name_snapshot} /></label></div> : null}{section === 'phone' ? <label className="bill-control"><span>رقم الهاتف *</span><input dir="ltr" defaultValue={receipt.traveler_phone_snapshot ?? ''} /></label> : null}{section === 'program' ? <><div className="bill-form-grid"><label className="bill-control"><span>الفندق *</span><select defaultValue="current"><option value="current">{receipt.hotel_name_snapshot}</option></select></label><label className="bill-control"><span>الرحلة *</span><select defaultValue="current"><option value="current">{receipt.flight_label_snapshot}</option></select></label><label className="bill-control"><span>الغرفة *</span><select defaultValue="current"><option value="current">{receipt.room_label_snapshot}</option></select></label></div><label className="bill-control bill-edit-discount"><span>التخفيض (درهم)</span><input dir="ltr" defaultValue={receipt.discount_amount_dh} /></label><div className="bill-price-box"><div className="bill-price-row"><span>الثمن الجديد</span><Money value={receipt.catalog_price_dh} /></div><div className="bill-price-row"><span>التخفيض</span><Money value={receipt.discount_amount_dh} /></div><div className="bill-price-row"><span>المبلغ المتفق عليه الجديد</span><strong><Money value={receipt.agreed_amount_dh} /></strong></div></div></> : null}{section === 'group' ? <div className="bill-form-grid two"><label className="bill-control"><span>رمز المجموعة</span><input dir="ltr" defaultValue={receipt.visible_dossier_reference ?? ''} /></label><label className="bill-control"><span>الإجراء</span><select><option>الإبقاء في نفس المجموعة</option><option>نقل إلى مجموعة</option><option>فصل في ملف مستقل</option></select></label></div> : null}{section === 'note' ? <label className="bill-control"><span>ملاحظة</span><textarea rows={4} /></label> : null}{section === 'first-payment' ? <><div className="bill-pay-summary"><div><span>مبلغ الدفعة الأولى — لا يتغير</span><Money value={null} /></div></div><label className="bill-control"><span>طريقة الدفع *</span><select><option>نقد</option><option>شيك</option><option>تحويل</option></select></label></> : null}<label className="bill-control bill-edit-reason"><span>سبب التعديل *</span><textarea placeholder="مثال: تصحيح خطأ في الإدخال" rows={2} /></label></>}</div><footer className="bill-modal-foot"><button className="bill-btn" onClick={onClose}>إلغاء</button>{section ? <button className="bill-btn primary" onClick={onLocalSave}>حفظ التعديل</button> : null}</footer></article></div>
}

function CancelModal({ receipt, onClose, onLocalSave }: { receipt: BillingReceiptRow; onClose: () => void; onLocalSave: () => void }) {
  return <div className="bill-overlay bill-form-overlay"><article className="bill-modal bill-cancel-modal" dir="rtl"><header className="bill-modal-head"><div><h2>إلغاء الوصل</h2><p>الوصل رقم <Ltr>{receipt.receipt_number}</Ltr></p></div><button className="bill-close" onClick={onClose}><X size={16} /></button></header><div className="bill-modal-body"><p className="bill-cancel-intro">الوصل لا يُحذف أبدًا. يبقى رقمه ودفعاته وسجله محفوظًا بعد الإلغاء.</p><div className="bill-pay-summary"><div><span>عدد الأشخاص المعنيين</span><b>1</b></div><div><span>المبلغ الإجمالي الملغى</span><b><Money value={receipt.total_paid_dh} /></b></div></div><label className="bill-control bill-cancel-field"><span>المبلغ الخارج فعلياً من الصندوق نقداً *</span><input dir="ltr" inputMode="numeric" defaultValue="0" /></label><label className="bill-control bill-cancel-field"><span>سبب الإلغاء *</span><textarea rows={3} /></label><div className="bill-cancel-note"><b>تنبيه:</b> لا يمكن إضافة دفعة أو تعديل البيانات المالية بعد التأكيد. تبقى المعاينة والطباعة متاحتين.</div></div><footer className="bill-modal-foot"><button className="bill-btn" onClick={onClose}>تراجع</button><button className="bill-btn danger" onClick={onLocalSave}>تأكيد الإلغاء</button></footer></article></div>
}

function ReceiptModal({ receipt, detail, source, onClose, onRecorded }: { receipt: BillingReceiptRow; detail: BillingReceiptDetail; source: 'real' | 'demo'; onClose: () => void; onRecorded: (message: string) => void }) {
  const [printCount, setPrintCount] = useState(detail.printing.count)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function recordThenPrint() {
    if (pending) return
    setError(null)
    setPending(true)

    if (source === 'demo') {
      setPrintCount((count) => count + 1)
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
      window.print()
      setPending(false)
      return
    }

    const result = await recordReceiptPrintAction(receipt.receipt_id)
    if (!result.ok) {
      setError(result.message)
      setPending(false)
      return
    }

    setPrintCount(result.data.printCount)
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
    window.print()
    setPending(false)
    onRecorded(`L’impression n° ${result.data.printCount} du reçu ${receipt.receipt_number} a été enregistrée.`)
  }

  function interceptPrint(event: React.MouseEvent<HTMLDivElement>) {
    const button = (event.target as HTMLElement).closest('button')
    if (!button?.classList.contains('primary') || !button.textContent?.includes('طباعة')) return
    event.preventDefault()
    event.stopPropagation()
    void recordThenPrint()
  }

  return <div onClickCapture={interceptPrint}><LegacyReceiptModal receipt={receipt} detail={detail} onClose={onClose} /><div className="bill-print-tracking-status" role={error ? 'alert' : 'status'}>{error ?? (pending ? 'Enregistrement de l’impression…' : `Impressions : ${printCount}`)}</div></div>
}

function LegacyReceiptModal({ receipt, detail, onClose }: { receipt: BillingReceiptRow; detail: BillingReceiptDetail; onClose: () => void }) {
  return <div className="bill-overlay bill-receipt-overlay"><article className="bill-modal bill-receipt-preview" dir="rtl"><header className="bill-receipt-actions"><button className="bill-btn" onClick={onClose}>رجوع</button><button className="bill-btn primary" onClick={() => window.print()}><Printer size={14} /> طباعة</button></header><div className="bill-receipt-paper"><div className="bill-receipt-brand"><div><strong>زمزم أسفار</strong><span>تدبير العمرة</span></div><span className="bill-receipt-logo">ز</span></div><div className="bill-receipt-title"><span>وصل الأداء</span><strong>{receipt.receipt_number}</strong><Ltr>{date(receipt.receipt_created_at)}</Ltr></div><div className="bill-receipt-main"><section><div className="bill-info-row"><span>المسافر</span><b>{receipt.traveler_first_name_snapshot} {receipt.traveler_last_name_snapshot}</b></div><div className="bill-info-row"><span>الهاتف</span><b><Ltr>{receipt.traveler_phone_snapshot ?? '—'}</Ltr></b></div><div className="bill-info-row"><span>المجموعة</span><b><Ltr>{receipt.visible_dossier_reference ?? '—'}</Ltr></b></div><div className="bill-info-row"><span>الفندق</span><b>{receipt.hotel_name_snapshot}</b></div><div className="bill-info-row"><span>الغرفة</span><b><Ltr>{receipt.room_label_snapshot}</Ltr></b></div><div className="bill-info-row"><span>الرحلة</span><b>{receipt.flight_label_snapshot}</b></div></section><section className="bill-receipt-finance"><div><span>المتفق عليه</span><b><Money value={receipt.agreed_amount_dh} /></b></div><div><span>مجموع الدفعات</span><b><Money value={receipt.total_paid_dh} /></b></div><div className="remaining"><span>الباقي</span><strong><Money value={receipt.amount_due_dh} /></strong></div><div><span>عدد الدفعات</span><b><Ltr>{receipt.payment_count} / 6</Ltr></b></div></section></div><section className="bill-receipt-payments"><h3>تفاصيل الدفعات</h3><table><thead><tr><th>#</th><th>المبلغ</th><th>التاريخ</th><th>الطريقة</th><th>رقم الشيك / المرجع</th><th>البنك</th></tr></thead><tbody>{detail.payments.map((payment) => { const operation = operationForPayment(detail, payment); return <tr key={payment.id}><td>{payment.payment_number}</td><td><Money value={payment.amount_dh} /></td><td><Ltr>{date(payment.registered_at)}</Ltr></td><td>{arabicMode(payment.payment_mode)}</td><td><Ltr>{operation?.instrument?.reference ?? '—'}</Ltr></td><td>{operation?.instrument?.bank_name ?? '—'}</td></tr> })}</tbody></table></section><div className="bill-receipt-footer"><span>الموظف: {detail.receipt.created_by.slot_label}</span><span>توقيع وختم الوكالة</span></div></div></article></div>
}

function OperationModal({ receipt, detail, isAdministrator, onClose, onLocalDelete }: { receipt: BillingReceiptRow; detail: BillingReceiptDetail; isAdministrator: boolean; onClose: () => void; onLocalDelete: () => void }) {
  const operation = detail.operations.find((item) => item.payment_mode !== 'cash')
  const allocationAmount = operation ? Math.min(operation.allocated_total_dh, receipt.total_paid_dh) : 0
  return <div className="bill-overlay bill-operation-overlay"><article className="bill-modal bill-operation-modal" dir="ltr"><header className="bill-modal-head"><div><h2>{operation?.payment_mode === 'transfer' ? `Virement — référence ${operation.instrument?.reference ?? '—'}` : `Chèque n° ${operation?.instrument?.reference ?? '—'}`}</h2><p>Enregistré à l’agence le <Ltr>{date(operation?.registered_at ?? null)}</Ltr> · l’heure reste utilisée uniquement pour le classement</p></div><button className="bill-close" onClick={onClose}><X size={16} /></button></header><div className="bill-modal-body"><section className="bill-operation-image">{operation?.has_active_supporting_image ? <div className="bill-evidence bill-evidence-large"><FileImage size={42} /><span>Justificatif actif</span></div> : <div><FileImage size={38} /><strong>Aucune image associée</strong><span>L’image pourra être ajoutée depuis le module de démonstration.</span></div>}</section><div className="bill-operation-actions">{operation?.has_active_supporting_image ? <span>Une image active est associée à cette opération.</span> : <button className="bill-btn primary"><ImagePlus size={14} /> Ajouter une image</button>}<button className="bill-btn danger" disabled={!isAdministrator || !operation?.has_active_supporting_image} title={!isAdministrator ? 'Réservé au slot 1' : ''} onClick={onLocalDelete}><Trash2 size={14} /> Supprimer l’image</button></div><section className="bill-operation-grid"><div><span>Mode de paiement</span><b>{operation ? frenchMode(operation.payment_mode) : '—'}</b></div><div><span>Montant réel</span><b><Money value={operation?.operation_amount_dh} /></b></div><div><span>{operation?.payment_mode === 'transfer' ? 'Référence du virement' : 'N° du chèque'}</span><b><Ltr>{operation?.instrument?.reference ?? '—'}</Ltr></b></div><div><span>Banque</span><b dir="rtl">{operation?.instrument?.bank_name ?? '—'}</b></div><div><span>Date du paiement</span><b><Ltr>{date(operation?.instrument?.instrument_date ?? null)}</Ltr></b></div><div><span>Type</span><b>{operation?.usage_kind === 'shared' ? 'Partagée' : 'Unique'}</b></div><div><span>Payeur</span><b dir="rtl">{operation?.instrument?.payer_name ?? '—'}</b></div><div><span>Montant attribué</span><b><Money value={operation?.allocated_total_dh} /></b></div><div><span>Montant restant</span><b><Money value={operation?.remaining_amount_dh} /></b></div><div><span>Employé</span><b dir="rtl">{operation?.created_by.slot_label ?? '—'}</b></div><div><span>Clients liés</span><b dir="rtl">{receipt.traveler_first_name_snapshot} {receipt.traveler_last_name_snapshot}</b></div><div><span>Reçus liés</span><b><Ltr>{receipt.receipt_number}</Ltr></b></div></section><section className="bill-operation-allocation"><h3>Répartition entre les reçus</h3><table><thead><tr><th>Reçu</th><th>Client</th><th>Montant attribué</th><th>Situation du reçu</th></tr></thead><tbody><tr><td><Ltr>{receipt.receipt_number}</Ltr></td><td dir="rtl">{receipt.traveler_first_name_snapshot} {receipt.traveler_last_name_snapshot}</td><td><Money value={allocationAmount} /></td><td>{receipt.lifecycle_status === 'cancelled' ? 'Reçu annulé' : 'Enregistré'}</td></tr></tbody></table></section></div></article></div>
}

function AnomaliesModal({ dataset, onClose, onOpenReceipt }: { dataset: BillingDataset; onClose: () => void; onOpenReceipt: (receiptId: string) => void }) {
  const labels = { amount_due: 'مبلغ متبقٍ بعد التعديل التجاري', overpayment: 'مبلغ زائد بعد التعديل التجاري', cheque_missing_supporting_image: 'شيك بدون صورة نشطة' }
  return <div className="bill-overlay"><article className="bill-modal medium" dir="rtl"><header className="bill-modal-head"><AlertTriangle size={20} /><div><h2>الحالات التي تتطلب الانتباه</h2><p>المعطيات المعروضة للقراءة فقط</p></div><button className="bill-close" onClick={onClose}><X size={16} /></button></header><div className="bill-modal-body"><div className="bill-anomaly-list">{!dataset.anomalies.length ? <div className="bill-pay-summary"><div><span>الوضعية</span><b>لا توجد حالة نشطة</b></div></div> : dataset.anomalies.map((anomaly) => { const receipt = anomaly.receipt_id ? dataset.receipts.find((item) => item.receipt_id === anomaly.receipt_id) : null; return <button type="button" className="bill-anomaly-item" key={anomaly.anomaly_id} disabled={!receipt} onClick={() => receipt && onOpenReceipt(receipt.receipt_id)}><AlertTriangle size={16} /><span><strong>{labels[anomaly.anomaly_type]}</strong>{receipt ? <> — الوصل <Ltr>{receipt.receipt_number}</Ltr></> : ''}</span><b><Money value={anomaly.amount_dh} /></b></button> })}</div></div><footer className="bill-modal-foot"><button className="bill-btn" onClick={onClose}>إغلاق</button></footer></article></div>
}

export function BillingDashboard({ realData, realError, demoData, slotLabel, isAdministrator, references, initialSource = 'real' }: { realData: BillingDataset; realError: string | null; demoData: BillingDataset | null; slotLabel: string; isAdministrator: boolean; references: FacturationReferenceData; initialSource?: 'real' | 'demo' }) {
  const [screen, setScreen] = useState<FacturationScreen>('wasl')
  const [financeTab, setFinanceTab] = useState<FinanceTab>('finance')
  const [source, setSource] = useState<'real' | 'demo'>(initialSource)
  const [query, setQuery] = useState('')
  const [receiptQuery, setReceiptQuery] = useState('')
  const [showCancelled, setShowCancelled] = useState(false)
  const [modal, setModal] = useState<ModalName>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedOperationId, setSelectedOperationId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(realError)
  const dataset = source === 'demo' && demoData ? demoData : realData
  const selected = dataset.receipts.find((receipt) => receipt.receipt_id === selectedId) ?? null
  const detail = selected ? dataset.details[selected.receipt_id] ?? null : null

  useEffect(() => {
    const saved = window.sessionStorage.getItem('facturation-notice')
    if (!saved) return
    window.sessionStorage.removeItem('facturation-notice')
    setNotice(saved)
  }, [])

  function openAction(next: Exclude<ModalName, null>, receipt?: BillingReceiptRow) {
    if (receipt) setSelectedId(receipt.receipt_id)
    else if (next === 'new' || next === 'payment') setSelectedId(null)
    setNotice(null)
    setModal(next)
  }

  function localDone(message: string) {
    setModal(null)
    setNotice(`${message} — محاكاة محلية فقط، دون أي كتابة في Supabase.`)
  }

  function realDone(message: string) {
    window.sessionStorage.setItem('facturation-notice', message)
    window.location.reload()
  }

  function switchSource() {
    if (!demoData) return
    setSource((current) => current === 'real' ? 'demo' : 'real')
    setSelectedId(null)
    setModal(null)
    setNotice(null)
  }

  return <>
    <BillingTopbar slotLabel={slotLabel} isAdministrator={isAdministrator} seasonName={references.activeSeason?.name ?? null} screen={screen} onNavigate={(next) => { setScreen(next); if (next === 'finance') setFinanceTab('finance') }} />
    {screen === 'wasl' ? <WaslScreen dataset={dataset} source={source} demoAvailable={Boolean(demoData)} query={query} receiptQuery={receiptQuery} showCancelled={showCancelled} notice={notice} onQuery={setQuery} onReceiptQuery={setReceiptQuery} onToggleCancelled={() => setShowCancelled((value) => !value)} onToggleSource={switchSource} onAction={openAction} /> : null}
    {screen === 'finance' ? <><nav className="bill-subnav"><button className={financeTab === 'payments' ? 'active' : ''} onClick={() => setFinanceTab('payments')}>Paiements</button><button className={financeTab === 'daily' ? 'active' : ''} onClick={() => setFinanceTab('daily')}>Suivi journalier</button></nav>{financeTab === 'finance' ? <FinanceScreen dataset={dataset} onAnomalies={() => setModal('anomalies')} /> : null}{financeTab === 'payments' ? <PaymentsScreen dataset={dataset} onOperation={(receipt, operationId) => { setSelectedOperationId(operationId); openAction('operation', receipt) }} /> : null}{financeTab === 'daily' ? <ReliableDailyScreen dataset={dataset} /> : null}</> : null}
    {screen === 'stats' ? <ReliableStatsScreen dataset={dataset} /> : null}
    {modal === 'detail' && selected && detail ? <DetailModal receipt={selected} detail={detail} onClose={() => setModal(null)} onReceipt={() => setModal('receipt')} /> : null}
    {modal === 'new' ? source === 'demo' ? <NewReceiptModal nextNumber={Math.max(0, ...dataset.receipts.map((receipt) => receipt.receipt_number)) + 1} onClose={() => setModal(null)} onLocalSave={() => localDone('تم حفظ نموذج الوصل في العرض التجريبي')} /> : <FunctionalNewReceiptModal references={references} dataset={realData} onClose={() => setModal(null)} onComplete={realDone} /> : null}
    {modal === 'payment' ? source === 'demo' ? <PaymentModal receipt={selected} detail={detail} onClose={() => setModal(null)} onLocalSave={() => localDone('تم حفظ نموذج الدفعة في العرض التجريبي')} /> : <FunctionalPaymentModal initialReceipt={selected} dataset={realData} onClose={() => setModal(null)} onComplete={realDone} /> : null}
    {modal === 'edit' && selected && detail ? source === 'demo' ? <EditModal receipt={selected} onClose={() => setModal(null)} onLocalSave={() => localDone('تم حفظ التعديل في العرض التجريبي')} /> : <FunctionalEditModal receipt={selected} detail={detail} references={references} dataset={dataset} onClose={() => setModal(null)} onComplete={realDone} /> : null}
    {modal === 'cancel' && selected ? source === 'demo' ? <CancelModal receipt={selected} onClose={() => setModal(null)} onLocalSave={() => localDone('تم تسجيل الإلغاء في العرض التجريبي')} /> : <FunctionalCancelModal receipt={selected} onClose={() => setModal(null)} onComplete={realDone} /> : null}
    {modal === 'receipt' && selected && detail ? <ReceiptModal receipt={selected} detail={detail} source={source} onClose={() => setModal(null)} onRecorded={realDone} /> : null}
    {modal === 'operation' && selected && detail ? source === 'demo' ? <OperationModal receipt={selected} detail={detail} isAdministrator={isAdministrator} onClose={() => setModal(null)} onLocalDelete={() => localDone('تمت محاكاة الحذف المنطقي للصورة')} /> : selectedOperationId ? <FunctionalOperationModal operation={detail.operations.find((item) => item.id === selectedOperationId) ?? detail.operations[0]} dataset={realData} isAdministrator={isAdministrator} onClose={() => setModal(null)} onComplete={realDone} /> : null : null}
    {modal === 'anomalies' ? <AnomaliesModal dataset={dataset} onClose={() => setModal(null)} onOpenReceipt={(receiptId) => { setSelectedId(receiptId); setModal('detail') }} /> : null}
  </>
}
