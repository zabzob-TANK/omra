import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { isTestAdmin } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { NavGuardProvider } from '@/components/admin/nav-guard'
import { ConfirmProvider } from '@/components/admin/confirm-provider'
import { AdminNav } from '@/components/admin/admin-nav'

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()

  if (!data?.claims?.sub || !isTestAdmin(data.claims)) {
    redirect('/login')
  }

  return (
    <NavGuardProvider>
      <ConfirmProvider>
        <div className="flex min-h-screen flex-col bg-background text-foreground">
          <AdminNav />
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 md:px-6">
            {children}
          </main>
        </div>
      </ConfirmProvider>
    </NavGuardProvider>
  )
}
