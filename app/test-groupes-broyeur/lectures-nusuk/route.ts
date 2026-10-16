// Lectures Nusuk du compte connecté, TOUTES ADRESSES DU SITE CONFONDUES (partie test seulement).
// Mêmes réponses que /api/client/nusuk/imports (liste, puis détail avec ?id=), mêmes fonctions et même
// contrôle de compte, sans la séparation par adresse que le fichier clients garde pour lui : la dernière
// information enregistrée s'affiche, qu'elle ait été envoyée depuis 127.0.0.1:3001 ou le site de test.
// Lecture seule ; servie en développement et sur le site de test omra-chi (adresse de production du projet Vercel
// « omra », donnée par Vercel lui-même), jamais sur le site des vrais clients (autorisé le 2026-10-16).
import { requireActiveAccount } from '@/lib/admin-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { compareReading } from '@/modules/client-react/nusuk/import-preview'
import { loadImport, storedReading } from '@/modules/client-react/nusuk/archive-store'
import { readRegister } from '@/modules/client-react/nusuk/server-register'
import { synchronizationIssues } from '@/modules/client-react/nusuk/sync-assignments'

export const runtime = 'nodejs'
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } })

export async function GET(request: Request) {
  const siteDeTest = process.env.VERCEL_PROJECT_PRODUCTION_URL === 'omra-chi.vercel.app'
  if (process.env.NODE_ENV !== 'development' && !siteDeTest) return new Response(null, { status: 404 })
  let actor
  try { actor = await requireActiveAccount() } catch { return reply({ error: 'Reconnectez-vous au logiciel pour consulter les imports.' }, 403) }
  const id = new URL(request.url).searchParams.get('id')
  try {
    const admin = createAdminClient()
    if (!id) {
      const { data, error } = await admin.from('nusuk_import_receipts').select('id,observed_at,received_at,nusuk_import_snapshots!inner(contract,origin,local_scope)')
        .eq('account_id', actor.auth_user_id).order('observed_at', { ascending: false }).order('received_at', { ascending: false }).limit(30)
      if (error) throw Error()
      const imports = (data || []).map(r => {
        const s = r.nusuk_import_snapshots as unknown as { contract: string; origin: string; local_scope: string }
        return { id: r.id, observedAt: r.observed_at, receivedAt: r.received_at, contract: s.contract, origin: s.origin, testSource: s.local_scope.endsWith(':jeu-visa') }
      })
      return reply({ ok: true, accountId: actor.auth_user_id, imports })
    }
    if (!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id)) return reply({ error: 'Identifiant d’import invalide.' }, 400)
    let stored
    try { stored = await loadImport(admin, id, actor.auth_user_id) } catch (e) {
      if (e instanceof Error && e.message.includes('introuvable')) return reply({ error: 'Import introuvable pour ce compte.' }, 404)
      throw e
    }
    const rows = await readRegister(admin)
    const preview = compareReading(storedReading(stored), rows)
    preview.synchronization = synchronizationIssues(rows, preview)
    return reply({ ok: true, preview, origin: stored.origin })
  } catch { return reply({ error: 'Lecture de l’historique indisponible.' }, 503) }
}
