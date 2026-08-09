/**
 * Reconstruction du détail champ par champ d'une modification déjà
 * enregistrée, à partir de `before_data`/`after_data` (`facturation_action_history`).
 *
 * Demande du commanditaire (2026-08-09) : le tableau des modifications du
 * Journal financier (en bleu, sous le principal — même emplacement que les
 * annulations, R-60) doit montrer ce qui a changé, ancienne et nouvelle
 * valeur — pas seulement qu'une modification a eu lieu. La fiche d'un reçu a
 * le même manque, déjà signalé (`changements` toujours vide côté lecture).
 * Écrite une seule fois ici, branchée aux deux écrans — jamais dupliquée.
 *
 * Libellés reprise strictement de `CHAMPS` (edit-sections.ts) : ce sont
 * exactement ceux déjà utilisés par la modification en direct
 * (`preparerModification`, `consignerChangement`). Aucun vocabulaire neuf.
 */

import { centimesEnTexteDevise, dirhamsSaisisEnCentimes } from '../money'
import { formaterTelephone } from '../format'
import { natureNormalisee } from '../payment-method'
import type { ChangementChamp, SectionModifiable } from '../types'
import { CHAMPS, consignerChangement } from './edit-sections'

/**
 * Instantané avant ou après, déjà mis en forme par la couche de lecture
 * (dates au format jj/mm/aaaa — plus de forme SQL à ce stade ; montants en
 * dirhams bruts, tels que stockés dans `before_data`/`after_data`). Chaque
 * type d'action ne renseigne que ses propres champs.
 */
export interface InstantaneHistorique {
  prenom?: string
  nom?: string
  telephone?: string
  note?: string
  hotel?: string
  vol?: string
  chambre?: string
  tarifDh?: number
  reductionDh?: number
  convenuDh?: number
  montantDh?: number
  nature?: string
  reference?: string
  dateInstrument?: string
  banque?: string
  payeur?: string
}

/**
 * Les six types d'action pour lesquels une correspondance existe. Le
 * septième, `billing_receipt.dossier_updated`, n'a aucune correspondance :
 * l'historique stocké ne porte que des identifiants techniques de dossier,
 * sans libellé (voir reprise.md). La section est de toute façon désactivée
 * dans l'écran de modification depuis ce matin — aucun effet aujourd'hui.
 */
export function changementsHistorique(
  actionType: string,
  avant: InstantaneHistorique,
  apres: InstantaneHistorique,
): ChangementChamp[] {
  const changements: ChangementChamp[] = []

  switch (actionType) {
    case 'billing_receipt.identity_updated':
      consignerChangement(changements, CHAMPS.prenom, avant.prenom, apres.prenom)
      consignerChangement(changements, CHAMPS.nom, avant.nom, apres.nom)
      break

    case 'billing_receipt.phone_updated':
      consignerChangement(
        changements,
        CHAMPS.telephone,
        texteTelephone(avant.telephone),
        texteTelephone(apres.telephone),
      )
      break

    case 'billing_receipt.note_updated':
      consignerChangement(changements, CHAMPS.note, avant.note || '', apres.note || '')
      break

    case 'billing_receipt.commercial_data_updated':
      consignerChangement(changements, CHAMPS.hotel, avant.hotel, apres.hotel)
      consignerChangement(changements, CHAMPS.vol, avant.vol, apres.vol)
      consignerChangement(changements, CHAMPS.chambre, avant.chambre, apres.chambre)
      consignerChangement(changements, CHAMPS.tarif, texteMontant(avant.tarifDh), texteMontant(apres.tarifDh))
      consignerChangement(
        changements,
        CHAMPS.reduction,
        texteMontant(avant.reductionDh),
        texteMontant(apres.reductionDh),
      )
      consignerChangement(
        changements,
        CHAMPS.convenu,
        texteMontant(avant.convenuDh),
        texteMontant(apres.convenuDh),
      )
      break

    // L'ancien nom (avant la généralisation du 2026-08-09) reste mappé pour
    // les corrections déjà enregistrées — l'historique est append-only.
    case 'billing_receipt.first_payment_method_corrected':
    case 'billing_receipt.payment_method_corrected':
      consignerChangement(changements, CHAMPS.montant, texteMontant(avant.montantDh), texteMontant(apres.montantDh))
      consignerChangement(
        changements,
        CHAMPS.nature,
        natureNormalisee(avant.nature),
        natureNormalisee(apres.nature),
      )
      consignerChangement(changements, CHAMPS.reference, avant.reference || '', apres.reference || '')
      consignerChangement(changements, CHAMPS.banque, avant.banque || '', apres.banque || '')
      consignerChangement(
        changements,
        CHAMPS.dateInstrument,
        avant.dateInstrument || '',
        apres.dateInstrument || '',
      )
      consignerChangement(changements, CHAMPS.payeur, avant.payeur || '', apres.payeur || '')
      break

    default:
      break
  }

  return changements
}

/**
 * Traduit `action_type` (`facturation_action_history`) vers la section
 * modifiable correspondante. `section_code` existe en base mais ses valeurs
 * ne correspondent pas de façon fiable à `SectionModifiable` selon la RPC
 * d'origine (`'phone'` vs `'contact'`, `'commercial_data'` sans équivalent
 * direct) — `action_type`, lui, est un des types déjà filtrés par
 * `list_billing_receipt_history` et `list_billing_receipts.modification_count`.
 *
 * Déplacée ici depuis `data/supabase/mappers.ts` le 2026-08-09 : logique pure
 * sans aucune IO, elle appartient au domaine comme `changementsHistorique`,
 * qu'elle sert aussi (journal des opérations, poste 1 seul).
 */
export function sectionDepuisActionType(actionType: string): SectionModifiable {
  switch (actionType) {
    case 'billing_receipt.identity_updated':
      return 'identity'
    case 'billing_receipt.phone_updated':
      return 'contact'
    case 'billing_receipt.commercial_data_updated':
      return 'program'
    case 'billing_receipt.dossier_updated':
      return 'group'
    // Décision du commanditaire (2026-08-09) : correction de versement,
    // désormais viable pour n'importe quel rang — l'ancien nom reste mappé
    // pour les corrections déjà enregistrées avant 202608090009, jamais
    // réécrites (historique append-only).
    case 'billing_receipt.first_payment_method_corrected':
    case 'billing_receipt.payment_method_corrected':
      return 'firstPayment'
    case 'billing_receipt.note_updated':
    default:
      return 'note'
  }
}

function texteMontant(dh: number | undefined): string {
  return dh === undefined ? '' : centimesEnTexteDevise(dirhamsSaisisEnCentimes(dh))
}

function texteTelephone(brut: string | undefined): string {
  return brut ? formaterTelephone(brut) : ''
}
