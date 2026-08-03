'use client'

/**
 * Fenêtre de confirmation d’un dépassement d'opération partagée.
 *
 * R-32 — L'enregistrement reste possible, mais exige une confirmation explicite.
 * L'écart n’est pas corrigé : il est conservé dans les données.
 * R-33 — Le fichier de référence précise qu'aucune surveillance automatique des
 * opérations dupliquées n'existe ; le texte est repris tel quel, en français.
 */

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
  return (
    <Dialogue
      titre={T.depassement.titre}
      taille="small"
      onFermer={onRetour}
      pied={
        <>
          <button className="omra-btn" onClick={onRetour}>
            {T.depassement.retour}
          </button>
          <button className="omra-btn primary" onClick={onConfirmer}>
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
