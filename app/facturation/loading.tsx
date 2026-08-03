function Pulse({ width, height }: { width: number | string; height: number }) {
  return <span className="animate-pulse" style={{ display: 'block', width, height, borderRadius: 8, background: 'var(--bill-soft)' }} />
}

export default function BillingLoading() {
  return <div aria-busy="true" aria-label="Chargement de la Facturation">
    <header className="bill-header"><div className="bill-account"><Pulse width={35} height={35} /><Pulse width={35} height={35} /><Pulse width={190} height={34} /></div><nav className="bill-nav"><Pulse width={68} height={38} /><Pulse width={68} height={38} /><Pulse width={86} height={38} /></nav><div className="bill-brand"><Pulse width={38} height={38} /><Pulse width={76} height={25} /></div></header>
    <main className="bill-screen bill-home" dir="rtl"><div className="bill-home-tools"><Pulse width={108} height={40} /><Pulse width={108} height={40} /><Pulse width={190} height={40} /><Pulse width={150} height={40} /></div><div className="bill-table-shell"><table className="bill-table"><thead><tr><th>رقم</th><th>الاسم / النسب</th><th>المبلغ المتفق عليه</th><th>مجموع الدفعات</th><th>الباقي</th><th>تاريخ التسجيل</th><th>عدد الدفعات</th><th>آخر دفعة</th><th>الطريقة</th><th>الحالة</th><th>الفندق</th><th>الغرفة</th><th>الرحلة</th><th>الوسيط</th><th>ملاحظة</th><th>الموظف</th><th>التخفيض</th><th>رقم الهاتف</th><th>المجموعة</th><th>الإجراءات</th></tr></thead><tbody>{Array.from({ length: 8 }, (_, index) => <tr key={index}>{Array.from({ length: 20 }, (__, cell) => <td key={cell}><Pulse width={cell === 1 ? 110 : 44} height={10} /></td>)}</tr>)}</tbody></table></div></main>
  </div>
}
