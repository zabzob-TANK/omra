'use client'

/**
 * reprise.md §5.17 — mécanisme partagé pour tout écran imprimable.
 *
 * Au clic sur Imprimer, une donnée fraîche est redemandée au serveur et le
 * contenu imprimable est reconstruit *de force* à partir de cette réponse —
 * jamais une mise à jour en place du DOM déjà affiché (voir `flushSync` :
 * si la donnée fraîche était identique à l'affichage courant, React
 * pourrait légitimement ne rien retoucher au DOM, laissant survivre une
 * falsification faite à la main dans l'inspecteur du navigateur).
 *
 * Si le rechargement échoue, une nouvelle tentative est proposée. Si elle
 * échoue aussi, l'impression reste possible — jamais bloquée pour ce
 * motif, même logique que l'échec du compteur d'impression (§5.12) : le
 * coût d'un employé bloqué au comptoir par un réseau qui hoquette dépasse
 * celui, rare et détectable après coup, d'une falsification. L'appelant
 * fournit alors une donnée de repli (`repli`) et l'impression est tracée
 * comme non vérifiée côté serveur (voir `enregistrerImpressionRecu`/
 * `enregistrerImpressionFinance`, paramètre `verifie`).
 *
 * `ImpressionBloqueeError` est différente : elle signale un document
 * réellement incomplet ou anormal (R-81, dépassement de six paiements —
 * pas une question de fraîcheur), ou un refus métier ferme détecté au même
 * moment (R-61 pour le journal financier, vérifié par le même appel que
 * celui qui enregistre l'impression). Ce cas-là reste bloquant, sans
 * proposition de réessai ni de repli — la règle « un écran n'imprime
 * jamais un document incomplet » ne change pas. Comme un tel refus ne peut
 * être détecté qu'au moment d'agir sur une donnée (fraîche ou de repli),
 * `rechargerFrais` et `repli` peuvent tous deux la lancer ; le hook traite
 * les deux de la même façon.
 *
 * Un futur écran imprimable réutilise ce hook au lieu de redécouvrir la
 * règle.
 */

import { useState } from 'react'
import { flushSync } from 'react-dom'

/** À lancer depuis `rechargerFrais` ou `repli` pour bloquer l'impression sans réessai ni repli. */
export class ImpressionBloqueeError extends Error {}

export type PhaseImpression = 'inactif' | 'chargement' | 'echec' | 'bloque' | 'termine'

export interface EtatImpressionFraiche<T> {
  phase: PhaseImpression
  /** Dernière donnée effectivement imprimée — `null` avant la première impression réussie. */
  donnees: T | null
  /** Change à chaque impression réussie, pour forcer un remontage complet du contenu imprimable. */
  cle: number
  /** Message d'échec (rechargement) ou de blocage (document incomplet), vide sinon. */
  message: string
  /** Vrai seulement après une impression qui est partie sans vérification confirmée. */
  nonVerifiee: boolean
}

/**
 * Issue immédiate d'un appel à `essayer` — utile à l'appelant qui veut
 * réagir tout de suite (ex. un `notifier` transitoire) sans dépendre d'un
 * effet observant l'état réactif, qui ne se redéclenche pas forcément si
 * deux tentatives de suite aboutissent à la même valeur.
 */
export type ResultatImpression =
  | { phase: 'termine'; nonVerifiee: boolean }
  | { phase: 'echec'; message: string }
  | { phase: 'bloque'; message: string }

const ETAT_INITIAL: Omit<EtatImpressionFraiche<never>, 'donnees'> = {
  phase: 'inactif',
  cle: 0,
  message: '',
  nonVerifiee: false,
}

export function useImpressionFraiche<T>() {
  const [etat, setEtat] = useState<EtatImpressionFraiche<T>>({ ...ETAT_INITIAL, donnees: null })

  /**
   * @param rechargerFrais Redemande la donnée au serveur ; lance
   *   `ImpressionBloqueeError` pour un document incomplet ou un refus
   *   métier ferme, renvoie `null` (jamais d'autre exception) pour un
   *   simple échec de rechargement.
   * @param repli Donnée à imprimer si un réessai échoue aussi — jamais
   *   appelée si `rechargerFrais` réussit au premier ou second essai. Async :
   *   c'est l'endroit naturel pour l'appelant qui a aussi besoin d'y tracer
   *   son propre compteur d'impression avec `verifie = false` (P18) avant de
   *   renvoyer la donnée de repli — le hook ne connaît rien de ce compteur.
   *   Peut aussi lancer `ImpressionBloqueeError` (ex. R-61 revérifié à ce
   *   moment précis) : un blocage métier reste un blocage, même en repli.
   * @param messageEchec Affiché après le premier échec, avec un bouton Réessayer.
   * @param estUnReessai Faux au premier clic sur Imprimer, vrai depuis le bouton Réessayer.
   */
  const essayer = async (
    rechargerFrais: () => Promise<T | null>,
    repli: () => Promise<T>,
    messageEchec: string,
    estUnReessai: boolean,
  ): Promise<ResultatImpression> => {
    setEtat((actuel) => ({ ...actuel, phase: 'chargement', message: '' }))

    let fraiches: T | null
    try {
      fraiches = await rechargerFrais()
    } catch (erreur) {
      if (erreur instanceof ImpressionBloqueeError) {
        setEtat((actuel) => ({ ...actuel, phase: 'bloque', message: erreur.message }))
        return { phase: 'bloque', message: erreur.message }
      }
      fraiches = null
    }

    if (fraiches) {
      flushSync(() => {
        setEtat((actuel) => ({
          ...actuel,
          phase: 'termine',
          donnees: fraiches,
          cle: actuel.cle + 1,
          message: '',
          nonVerifiee: false,
        }))
      })
      window.print()
      return { phase: 'termine', nonVerifiee: false }
    }

    if (estUnReessai) {
      let donneesRepli: T
      try {
        donneesRepli = await repli()
      } catch (erreur) {
        if (erreur instanceof ImpressionBloqueeError) {
          setEtat((actuel) => ({ ...actuel, phase: 'bloque', message: erreur.message }))
          return { phase: 'bloque', message: erreur.message }
        }
        // `repli` n'est pas censé échouer autrement — mais si c'est le cas,
        // pas d'impression silencieuse : on retombe sur l'état d'échec, qui
        // propose un nouveau réessai plutôt que de faire comme si de rien.
        setEtat((actuel) => ({ ...actuel, phase: 'echec', message: messageEchec }))
        return { phase: 'echec', message: messageEchec }
      }
      flushSync(() => {
        setEtat((actuel) => ({
          ...actuel,
          phase: 'termine',
          donnees: donneesRepli,
          cle: actuel.cle + 1,
          message: '',
          nonVerifiee: true,
        }))
      })
      window.print()
      return { phase: 'termine', nonVerifiee: true }
    }

    setEtat((actuel) => ({ ...actuel, phase: 'echec', message: messageEchec }))
    return { phase: 'echec', message: messageEchec }
  }

  return { ...etat, essayer }
}
