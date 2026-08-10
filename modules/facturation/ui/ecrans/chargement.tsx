'use client'

/**
 * Écran-relais « chargement en cours ».
 *
 * Finance, Suivi journalier et Paiements chargent leurs données après la
 * navigation (pas au démarrage de l'application) : sans cet écran, le
 * premier passage sur chacun d'eux n'affichait rien du tout pendant l'appel
 * réseau — l'employé ne pouvait pas savoir si l'écran travaillait ou avait
 * simplement échoué.
 *
 * Centré horizontalement et ancré en haut du contenu, sous le header
 * collant — jamais centré verticalement sur toute la hauteur de l'écran (ce
 * qui le pousserait trop bas), et jamais l'habillage `.stats-entete` d'un
 * en-tête de page, qui aligne son contenu au début du flux (à droite en
 * RTL) : correct pour un titre de page, pas pour un écran de chargement, qui
 * doit rester à la même position quel que soit l'écran (Finance, Suivi
 * journalier, Paiements) qui l'affiche.
 */

import { IndicateurChargement } from '../spinner'

interface Proprietes {
  titre: string
  dir?: 'rtl' | 'ltr'
  lang?: string
}

export function EcranChargement({ titre, dir, lang }: Proprietes) {
  return (
    <main className="ecran-chargement" dir={dir} lang={lang}>
      <span className="omra-spinner-grand">
        <IndicateurChargement />
      </span>
      <h1>{titre}</h1>
    </main>
  )
}
