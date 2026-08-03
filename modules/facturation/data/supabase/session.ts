import 'server-only'

/**
 * Session et autorisations — branché sur l'authentification omra existante
 * (`account_slots`, `lib/account-access.ts`), jamais sur un mécanisme propre
 * au module.
 *
 * `SessionPort.connecter()` reproduit l'écran de connexion du prototype, mais
 * omra authentifie déjà l'utilisateur avant de monter cette interface
 * (`requireActiveAccount()` dans `app/facturation/page.tsx`) : ce port n'a
 * donc jamais à établir une session lui-même, seulement à en lire l'état.
 */

import { findActiveAccountByAuthUserId } from '@/lib/account-access'
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

async function utilisateurDepuisCompteActif(): Promise<Utilisateur | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) return null

  const compte = await findActiveAccountByAuthUserId(data.user.id)
  if (!compte) return null

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

export const sessionSupabase: SessionPort = {
  async connecter() {
    throw new Error(
      "connecter() n'est pas disponible côté omra : l'authentification passe par /login, avant que ce module ne soit monté. Un appel ici signale un écran de connexion du prototype resté actif après le branchement de l'étape 6.",
    )
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
