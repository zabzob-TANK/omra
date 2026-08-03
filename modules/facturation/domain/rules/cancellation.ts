/**
 * Annulation d'un reçu.
 *
 * Couvre : R-43 à R-47.
 *
 * Un reçu n'est **jamais** supprimé. L'annulation change son statut, conserve
 * ses versements et son numéro, et décide si un mouvement de caisse espèces
 * doit être créé.
 */

import { STATUT_ANNULE } from '../constants'
import type { CleJour, DateFr } from '../dates'
import type { ModeRemboursement, MouvementCaisse, Recu } from '../types'
import { erreur, erreurs, ok, type ErreurValidation, type Resultat } from './errors'
import { totalPaye } from './receipt'

export interface SaisieAnnulation {
  motif: string
  modeRemboursement: ModeRemboursement | ''
  motDePasse: string
}

export interface DonneesAnnulation {
  motif: string
  annulePar: string
  annuleLe: string
  modeRemboursement: ModeRemboursement
  /** R-46 — Montant remboursé = total payé, plafonné au convenu (§5.10, §5.11). */
  montantRembourseCentimes: number
}

export interface ResultatAnnulation {
  donnees: DonneesAnnulation
  /**
   * R-47 — Mouvement de caisse à créer, ou `null`.
   * N'existe que pour un remboursement en espèces.
   */
  mouvementCaisse: MouvementCaisse | null
}

export interface ContexteAnnulation {
  employe: string
  /** Horodatage `jj/mm/aaaa HH:MM`. */
  horodatage: string
  date: DateFr
  heure: string
  jour: CleJour
  /** Identifiant du mouvement de caisse, si nécessaire. */
  idMouvement: string
  /**
   * R-44 — Résultat de la vérification d'identité.
   *
   * Le fichier de référence compare en clair le mot de passe de l'utilisateur
   * connecté (observation O-03). Ici la vérification est déléguée à
   * `SessionPort` et son résultat est injecté, pour qu'aucun secret ne circule
   * dans le domaine.
   */
  identiteVerifiee: boolean
}

/**
 * R-43 à R-47 — Valide et prépare l'annulation.
 *
 * L'ordre reproduit `doCancel()` : les trois champs obligatoires sont contrôlés
 * ensemble, puis la vérification du mot de passe intervient seule.
 */
export function preparerAnnulation(
  saisie: SaisieAnnulation,
  recu: Recu,
  contexte: ContexteAnnulation,
): Resultat<ResultatAnnulation> {
  // P05 — un reçu déjà annulé ne peut pas être annulé une seconde fois.
  if (recu.statut === STATUT_ANNULE) return erreur('recu', 'recu-annule')

  // R-43 — les trois champs sont obligatoires, erreurs cumulées.
  const liste: ErreurValidation[] = []
  if (!saisie.motif.trim()) liste.push({ champ: 'motif', code: 'motif-annulation-obligatoire' })
  if (!saisie.modeRemboursement) {
    liste.push({ champ: 'modeRemboursement', code: 'mode-remboursement-obligatoire' })
  }
  if (!saisie.motDePasse) {
    liste.push({ champ: 'motDePasse', code: 'mot-de-passe-obligatoire' })
  }
  if (liste.length) return erreurs(liste)

  // R-44 — vérification isolée, après les champs obligatoires.
  if (!contexte.identiteVerifiee) {
    return erreurs([{ champ: 'motDePasse', code: 'mot-de-passe-incorrect' }])
  }

  // R-46 — le montant remboursé est le total réellement payé, tous modes
  // confondus, mais jamais plus que le convenu : le trop-perçu n'est jamais
  // restitué, même à l'annulation (§5.10, §5.11).
  const montantRembourseCentimes = Math.min(totalPaye(recu), recu.convenuCentimes)
  const modeRemboursement = saisie.modeRemboursement as ModeRemboursement

  const donnees: DonneesAnnulation = {
    motif: saisie.motif.trim(),
    annulePar: contexte.employe,
    annuleLe: contexte.horodatage,
    modeRemboursement,
    montantRembourseCentimes,
  }

  // R-47 — seul un remboursement en espèces sort de la caisse.
  const mouvementCaisse: MouvementCaisse | null =
    modeRemboursement === 'cash'
      ? {
          id: contexte.idMouvement,
          type: 'refund_cash',
          jour: contexte.jour,
          date: contexte.date,
          heure: contexte.heure,
          montantCentimes: montantRembourseCentimes,
          recuNumero: recu.numero,
          client: `${recu.prenom} ${recu.nom}`,
          employe: contexte.employe,
        }
      : null

  return ok({ donnees, mouvementCaisse })
}

/**
 * R-45 — Un reçu annulé conserve tout : numéro, versements, historique.
 * Cette fonction rend la règle explicite et testable.
 */
export function annulationConservelesDonnees(avant: Recu, apres: Recu): boolean {
  return (
    apres.statut === STATUT_ANNULE &&
    apres.numero === avant.numero &&
    apres.versements.length === avant.versements.length &&
    totalPaye(apres) === totalPaye(avant)
  )
}
