import { BillingDashboard } from '@/components/facturation/billing-dashboard'
import { createDemoBillingDataset } from '@/lib/facturation/demo-data'
import { loadBillingDashboard } from '@/lib/facturation/read-server'
import { loadFacturationReferenceData } from '@/lib/facturation/reference-server'
import { requireActiveAccount } from '@/lib/admin-guard'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ demo?: string }>
}) {
  let account

  try {
    account = await requireActiveAccount()
  } catch {
    redirect('/logout?error=acces')
  }

  const references = await loadFacturationReferenceData()
  const result = await loadBillingDashboard(references.activeSeason?.id ?? null)
  // Le jeu de démonstration reste strictement local et n'est jamais exposé
  // par le déploiement Vercel officiel.
  const demoData = process.env.VERCEL ? null : createDemoBillingDataset()
  const { demo } = await searchParams

  return (
    <BillingDashboard
      realData={result.data}
      realError={result.ok ? null : result.message}
      demoData={demoData}
      slotLabel={account.slot_label}
      isAdministrator={account.slot_number === 1}
      initialSource={demo === '1' && demoData ? 'demo' : 'real'}
      references={references}
    />
  )
}
