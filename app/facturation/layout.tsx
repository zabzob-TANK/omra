import type { ReactNode } from 'react'
import './facturation.css'

export default async function BillingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="billing-app">
      {children}
    </div>
  )
}
