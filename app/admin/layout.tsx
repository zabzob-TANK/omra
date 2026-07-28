import type { ReactNode } from 'react'
import { OmraStoreProvider } from '@/lib/omra-store'
import { NavGuardProvider } from '@/components/admin/nav-guard'
import { ConfirmProvider } from '@/components/admin/confirm-provider'
import { AdminNav } from '@/components/admin/admin-nav'

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <OmraStoreProvider>
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
    </OmraStoreProvider>
  )
}
