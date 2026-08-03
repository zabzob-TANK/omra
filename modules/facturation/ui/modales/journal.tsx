'use client'

/**
 * Fenêtre « Journal des opérations ».
 *
 * R-86 — Chaque action laisse une trace, la plus récente en tête.
 */

import type { EntreeAudit } from '../../domain/types'
import { Dialogue } from '../dialogue'
import { DateValeur } from '../bidi'
import { T } from '../textes'

export function ModaleJournal({
  entrees,
  onFermer,
}: {
  entrees: EntreeAudit[]
  onFermer: () => void
}) {
  return (
    <Dialogue titre={T.journal.titre} classeCoque="journal-coque" onFermer={onFermer}>
      {entrees.length === 0 ? (
        <p className="journal-vide">{T.journal.vide}</p>
      ) : (
        // Le fichier aligne chaque trace sur une seule ligne à trois colonnes,
        // dans une zone défilante bornée à 60 % de la hauteur d'écran.
        <div className="journal-liste">
          {entrees.map((entree) => (
            <div className="journal-ligne" key={entree.id}>
              <span className="journal-heure mono" dir="ltr">
                <DateValeur>{entree.horodatage}</DateValeur>
              </span>
              <span className="journal-action">{entree.action}</span>
              <span className="journal-detail">{entree.detail}</span>
            </div>
          ))}
        </div>
      )}
    </Dialogue>
  )
}
