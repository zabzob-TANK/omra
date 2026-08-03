'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { BriefcaseBusiness, Clock3, LogOut, Moon, Sun } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export type FacturationScreen = 'wasl' | 'finance' | 'stats'

export function BillingTopbar({
  slotLabel,
  isAdministrator,
  screen,
  onNavigate,
  seasonName,
}: {
  slotLabel: string
  isAdministrator: boolean
  screen: FacturationScreen
  onNavigate: (screen: FacturationScreen) => void
  seasonName: string | null
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [dark, setDark] = useState(false)

  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'))
  }, [])

  async function signOut() {
    setPending(true)
    await createClient().auth.signOut()
    router.replace('/login')
    router.refresh()
  }

  function toggleTheme() {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
    try {
      localStorage.setItem('zemzem-theme', next ? 'dark' : 'light')
    } catch {}
  }

  return (
    <header className="bill-header" dir="rtl">
      <div className="bill-account">
        <button className="bill-icon-btn" type="button" onClick={toggleTheme} aria-label={dark ? 'الوضع الفاتح' : 'الوضع الداكن'}>
          {dark ? <Sun size={15} /> : <Moon size={15} />}
        </button>
        <button className="bill-icon-btn" type="button" onClick={() => void signOut()} disabled={pending} aria-label="تسجيل الخروج">
          <LogOut size={15} />
        </button>
        <div className="bill-user">
          <span className="bill-avatar">{isAdministrator ? 'AD' : 'EM'}</span>
          <div><strong>{isAdministrator ? 'المدير' : 'الموظف'}</strong><small>{slotLabel}</small></div>
        </div>
        <span className="bill-season"><Clock3 size={14} /><span>الموسم النشط — {seasonName ?? 'غير محدد'}</span><i /></span>
      </div>

      <nav className="bill-nav" aria-label="التنقل في الفوترة">
        <button type="button" className={screen === 'wasl' ? 'active' : ''} onClick={() => onNavigate('wasl')}>الوصل</button>
        <button type="button" className={screen === 'finance' ? 'active' : ''} onClick={() => onNavigate('finance')}>المالية</button>
        <button type="button" className={screen === 'stats' ? 'active' : ''} onClick={() => onNavigate('stats')}>الإحصائيات</button>
      </nav>

      <div className="bill-brand">
        <span className="bill-brand-logo"><BriefcaseBusiness size={19} /></span>
        <div><strong>زمزم أسفار</strong><small>تدبير العمرة</small></div>
      </div>
    </header>
  )
}
