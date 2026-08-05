'use client'

/**
 * Fenêtre de confirmation d’un dépassement d'opération partagée.
 *
 * R-32 — L'enregistrement reste possible, mais exige une confirmation explicite.
 * L'écart n’est pas corrigé : il est conservé dans les données.
 * R-33 — Le fichier de référence précise qu'aucune surveillance automatique des
 * opérations dupliquées n'existe ; le texte est repris tel quel, en français.
 */

import { useState } from 'react'

import { centimesEnTexteDevise } from '../../domain/money'
import { Dialogue } from '../dialogue'
import { T } from '../textes'

interface Proprietes {
  montantCentimes: number
  disponibleCentimes: number
  onRetour: () => void
  onConfirmer: () => void
}

export function ModaleDepassement({
  montantCentimes,
  disponibleCentimes,
  onRetour,
  onConfirmer,
}: Proprietes) {
  // `onConfirmer` déclenche un enregistrement asynchrone (versement, reçu ou
  // correction) dans le composant parent, mais ce dernier ne peut pas désactiver
  // les boutons de cette fenêtre : elle remplace entièrement la sienne pendant
  // la confirmation (`if (depassement) return <ModaleDepassement .../>`). Sans
  // ce garde local, un double clic sur « confirmer » — ou un clic pendant
  // l'attente — déclenche deux enregistrements pour une seule confirmation de
  // dépassement, alors que R-32 exige une confirmation explicite et auditée,
  // pas deux écritures silencieuses.
  const [enCours, setEnCours] = useState(false)

  const confirmer = () => {
    if (enCours) return
    setEnCours(true)
    onConfirmer()
  }

  const retour = () => {
    if (enCours) return
    onRetour()
  }

  return (
    <Dialogue
      titre={T.depassement.titre}
      taille="small"
      onFermer={retour}
      pied={
        <>
          <button className="omra-btn" onClick={retour} disabled={enCours}>
            {T.depassement.retour}
          </button>
          <button className="omra-btn primary" onClick={confirmer} disabled={enCours}>
            {T.depassement.confirmer}
          </button>
        </>
      }
    >
      <p style={{ fontSize: 13, marginTop: 0 }}>
        {T.depassement.consigne}
      </p>

      <div className="omra-summary" style={{ marginTop: 14 }}>
        <div>
          <span>{T.depassement.partAvant}</span>
          <span className="mono">{centimesEnTexteDevise(montantCentimes)}</span>
        </div>
        <div>
          <span>{T.instrument.restantDisponible}</span>
          <span className="mono">{centimesEnTexteDevise(disponibleCentimes)}</span>
        </div>
      </div>

      <p className="omra-hint" style={{ marginTop: 14 }}>
        {T.depassement.conservation}
      </p>
    </Dialogue>
  )
}
