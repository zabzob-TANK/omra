import { BillingDashboard } from '@/components/facturation/billing-dashboard'
import { createDemoBillingDataset } from '@/lib/facturation/demo-data'
import { loadBillingDashboard } from '@/lib/facturation/read-server'
import { loadFacturationReferenceData } from '@/lib/facturation/reference-server'
import { requireActiveAccount } from '@/lib/admin-guard'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

// Garde matérielle (reprise.md §5.13) : `VERCEL` n'est qu'un indice d'hébergement,
// pas une preuve de production — un build de production exécuté ailleurs le
// contournerait. `NODE_ENV` est la seule source fiable et indépendante de l'hébergeur.
const DEMO_AUTORISEE = process.env.NODE_ENV !== 'production'

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
  const demoData = DEMO_AUTORISEE ? createDemoBillingDataset() : null
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
