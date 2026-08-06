'use client'

/**
 * Fenêtre « تأكيد مراجعة التنبيه ».
 *
 * R-65 — La levée d'une anomalie est réservée à l'administrateur. L'identité,
 * la date et l'heure de la confirmation sont conservées au journal.
 */

import { useState } from 'react'

import { Dialogue } from '../dialogue'
import { IndicateurChargement } from '../spinner'
import { T } from '../textes'

interface Proprietes {
  nombre: number
  jour: string
  onFermer: () => void
  onConfirmer: () => void
}

export function ModaleAnomalieFinance({ nombre, jour, onFermer, onConfirmer }: Proprietes) {
  // Même garde que ModaleDepassement : `onConfirmer` déclenche un
  // enregistrement asynchrone dans le parent, qui ne remplace pas cette
  // fenêtre pendant l'attente (contrairement à Ajouter un versement) — le
  // garde doit donc vivre ici.
  const [enCours, setEnCours] = useState(false)

  const confirmer = () => {
    if (enCours) return
    setEnCours(true)
    onConfirmer()
  }

  const annuler = () => {
    if (enCours) return
    onFermer()
  }

  return (
    <Dialogue
      titre={T.anomalie.titre}
      taille="small"
      onFermer={annuler}
      pied={
        <>
          <button className="omra-btn" onClick={annuler} disabled={enCours}>
            {T.anomalie.annuler}
          </button>
          <button className="omra-btn primary" onClick={confirmer} disabled={enCours}>
            {enCours ? <IndicateurChargement /> : null}
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
