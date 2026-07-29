import { ProgrammeClient } from '@/components/admin/programme/programme-client'
import { loadSeasonsAction } from '@/app/admin/programme/actions'

export const dynamic = 'force-dynamic'

export default async function ProgrammePage() {
  const result = await loadSeasonsAction()
  return (
    <ProgrammeClient
      initialSeasons={result.ok ? result.data : []}
      initialError={result.ok ? null : result.message}
    />
  )
}
