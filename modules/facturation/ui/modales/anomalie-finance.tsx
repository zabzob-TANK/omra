'use client'

/**
 * Fenêtre « تأكيد مراجعة التنبيه ».
 *
 * R-65 — La levée d'une anomalie est réservée à l'administrateur. L'identité,
 * la date et l'heure de la confirmation sont conservées au journal.
 */

import { Dialogue } from '../dialogue'
import { T } from '../textes'

interface Proprietes {
  nombre: number
  jour: string
  onFermer: () => void
  onConfirmer: () => void
}

export function ModaleAnomalieFinance({ nombre, jour, onFermer, onConfirmer }: Proprietes) {
  return (
    <Dialogue
      titre={T.anomalie.titre}
      taille="small"
      onFermer={onFermer}
      pied={
        <>
          <button className="omra-btn" onClick={onFermer}>
            {T.anomalie.annuler}
          </button>
          <button className="omra-btn primary" onClick={onConfirmer}>
            {T.anomalie.confirmer}
          </button>
        </>
      }
    >
      <p style={{ fontSize: 13, marginTop: 0 }}>
        {T.anomalie.trouve} <b>{nombre}</b> {T.anomalie.operations}{' '}
        <span dir="ltr" style={{ unicodeBidi: 'isolate' }}>
          {jour}
        </span>
        .
      </p>
      <p className="omra-hint" style={{ marginTop: 12 }}>
        {T.anomalie.consigne}
      </p>
    </Dialogue>
  )
}
