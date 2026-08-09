import 'server-only'

/**
 * Connexions dans le journal des opérations (`JournalConnexionsPort`,
 * 202608090014) — demande du commanditaire (2026-08-09) : connexion
 * réussie, échec, déconnexion, dans `facturation_action_history` comme le
 * reste, jamais `auth.audit_log_entries`.
 *
 * Un échec de connexion n'a aucune session : `record_facturation_login_failure`
 * ne résout aucune identité (contrairement à tout le reste de ce module) et
 * est accessible sans authentification — c'est le seul cas où l'acteur n'est
 * jamais fourni par ce code parce qu'il n'existe tout simplement pas encore.
 */

import { createClient } from '@/lib/supabase/server'
import type { JournalConnexionsPort } from '../ports'
import { messageErreur } from './read'

export const journalConnexionsSupabase: JournalConnexionsPort = {
  async enregistrerReussie() {
    const supabase = await createClient()
    const resultat = await supabase.rpc('record_facturation_session_event', {
      p_outcome: 'login_succeeded',
    })
    if (resultat.error) throw new Error(messageErreur(resultat.error))
  },

  async enregistrerEchouee(identifiantTente) {
    const supabase = await createClient()
    const resultat = await supabase.rpc('record_facturation_login_failure', {
      p_attempted_login: identifiantTente,
    })
    if (resultat.error) throw new Error(messageErreur(resultat.error))
  },

  async enregistrerDeconnexion() {
    const supabase = await createClient()
    const resultat = await supabase.rpc('record_facturation_session_event', {
      p_outcome: 'logout',
    })
    if (resultat.error) throw new Error(messageErreur(resultat.error))
  },
}
