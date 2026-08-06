'use client'

/**
 * Écran-relais « chargement en cours ».
 *
 * Finance, Suivi journalier et Paiements chargent leurs données après la
 * navigation (pas au démarrage de l'application) : sans cet écran, le
 * premier passage sur chacun d'eux n'affichait rien du tout pendant l'appel
 * réseau — l'employé ne pouvait pas savoir si l'écran travaillait ou avait
 * simplement échoué. Reprend l'habillage de `EcranAVenir` pour rester
 * cohérent visuellement.
 */

import { IndicateurChargement } from '../spinner'
import './statistiques.css'

interface Proprietes {
  titre: string
  dir?: 'rtl' | 'ltr'
  lang?: string
}

export function EcranChargement({ titre, dir, lang }: Proprietes) {
  return (
    <main className="stats-principal" dir={dir} lang={lang}>
      <div className="stats-entete">
        <div>
          <h1>{titre}</h1>
          <p>
            <span className="omra-spinner-grand">
              <IndicateurChargement />
            </span>
          </p>
        </div>
      </div>
    </main>
  )
}
