import 'server-only'

/**
 * Session et autorisations — branché sur l'authentification omra existante
 * (`account_slots`, `lib/account-access.ts`), jamais sur un mécanisme propre
 * au module.
 *
 * Séparation étanche Facturation/Administration : la Facturation a
 * maintenant sa propre porte (`EcranConnexion`, ce `connecter()`), entièrement
 * indépendante de `/login` (la porte Administration, `admin_accounts`). Les 6
 * emplacements de `account_slots` — slot 1 inclus, opérateur Facturation avec
 * privilèges internes élevés — s'authentifient ici, jamais via `/login`.
 */

import type { ActiveAccount } from '@/lib/account-access'
import { findActiveAccountByAuthUserId } from '@/lib/account-access'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { ROLE_ADMINISTRATEUR } from '../../domain/constants'
import type { Utilisateur } from '../../domain/types'
import type { SessionPort } from '../ports'

/** Rôle affiché pour les slots 2 à 6. Seul `ROLE_ADMINISTRATEUR` a une valeur contractuelle (`estAdministrateur`). */
const ROLE_EMPLOYE = 'موظف'

/**
 * Dérive de courtes initiales d'un libellé de slot (`Administrateur`,
 * `Employé 1`, …), à défaut d'un vrai nom de personne stocké côté omra
 * (§5 bis — l'identité vient uniquement du slot, jamais saisie ici).
 */
function initialesDepuisLibelle(libelle: string): string {
  const mots = libelle.trim().split(/\s+/).filter(Boolean)
  if (mots.length >= 2) return (mots[0][0] + mots[1][0]).toUpperCase()
  if (mots.length === 1) return mots[0].slice(0, 2).toUpperCase()
  return '—'
}

function utilisateurDepuisCompte(compte: ActiveAccount): Utilisateur {
  return {
    id: compte.auth_user_id,
    // `slot_label` est en français (« Administrateur », « Employé 1 », …),
    // pas en arabe : aucun autre nom n'est disponible côté omra. Même
    // convention que `mapVersement()`/`mapReceiptDetailToRecu()` en lecture,
    // qui utilisent déjà `slot_label` pour `enregistrePar`/`employe`.
    nom: compte.slot_label,
    role: compte.role === 'administrator' ? ROLE_ADMINISTRATEUR : ROLE_EMPLOYE,
    initiales: initialesDepuisLibelle(compte.slot_label),
  }
}

async function utilisateurDepuisCompteActif(): Promise<Utilisateur | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) return null

  const compte = await findActiveAccountByAuthUserId(data.user.id)
  if (!compte) return null

  return utilisateurDepuisCompte(compte)
}

export const sessionSupabase: SessionPort = {
  /**
   * Porte propre à la Facturation — reproduit la logique de `login()`
   * (`app/login/actions.ts`), mais uniquement sur `account_slots` (les 6
   * emplacements, slot 1 inclus) : jamais sur `admin_accounts`, jamais de
   * `redirect()` — renvoie `null` sur tout échec, comme l'attend
   * `EcranConnexion`.
   */
  async connecter(identifiant, motDePasse) {
    const identifiantNormalise = identifiant.trim().toLowerCase()
    if (!identifiantNormalise || !motDePasse) return null

    const admin = createAdminClient()
    const { data: slot, error: slotError } = await admin
      .from('account_slots')
      .select('auth_user_id')
      .eq('login', identifiantNormalise)
      .eq('active', true)
      .single()

    if (slotError || !slot?.auth_user_id) return null

    const { data: authUser, error: authUserError } =
      await admin.auth.admin.getUserById(slot.auth_user_id)
    if (authUserError || !authUser.user?.email) return null

    const supabase = await createClient()
    const { data, error } = await supabase.auth.signInWithPassword({
      email: authUser.user.email,
      password: motDePasse,
    })
    if (error) return null

    // Revérification autoritative post-connexion — jamais la seule
    // recherche initiale par `login`, comme `app/login/actions.ts`.
    const compte = await findActiveAccountByAuthUserId(data.user.id)
    if (!compte || compte.auth_user_id !== slot.auth_user_id) {
      await supabase.auth.signOut()
      return null
    }

    return utilisateurDepuisCompte(compte)
  },

  async deconnecter() {
    const supabase = await createClient()
    await supabase.auth.signOut()
  },

  async utilisateurCourant() {
    return utilisateurDepuisCompteActif()
  },

  estAdministrateur(utilisateur) {
    return utilisateur.role === ROLE_ADMINISTRATEUR
  },

  async verifierIdentite(motDePasse) {
    // R-43, R-44 — re-authentification réelle, déléguée à Supabase Auth :
    // aucun mot de passe n'est comparé dans ce module. Un nouveau
    // `signInWithPassword` sur le compte déjà connecté rafraîchit sa session
    // (cookies gérés par `createClient()`) sans changer d'identité.
    const supabase = await createClient()
    const { data, error: erreurUtilisateur } = await supabase.auth.getUser()
    if (erreurUtilisateur || !data.user?.email) return false

    const { error } = await supabase.auth.signInWithPassword({
      email: data.user.email,
      password: motDePasse,
    })
    return !error
  },
}
