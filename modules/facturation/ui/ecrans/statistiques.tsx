'use client'

/**
 * Écran « الإحصائيات ».
 *
 * R-91 — Le fichier de référence n'y calcule rien. Il affiche un titre, une
 * phrase expliquant que la page est réservée sans toucher à la facturation, une
 * étiquette « مرحلة لاحقة » posée en tête de page, puis quatre cartes en
 * pointillés annonçant les rubriques à venir.
 *
 * Cet état est reproduit tel quel : aucun indicateur n'est inventé, et aucune
 * carte n'est ajoutée ni retirée. Arabe, de droite à gauche, comme le reste des
 * écrans arabes du fichier.
 */

import { T } from '../textes'
import './statistiques.css'

export function EcranStatistiques() {
  const S = T.statistiques

  return (
    <main className="stats-principal">
      <div className="stats-entete">
        <div>
          <h1>{S.titre}</h1>
          <p>{S.note}</p>
        </div>
        <span className="stats-etiquette">{S.etiquette}</span>
      </div>

      <div className="stats-grille">
        {S.cartes.map((carte) => (
          <div className="stats-carte" key={carte.titre}>
            <div>
              <b>{carte.titre}</b>
              <span>{carte.sousTitre}</span>
            </div>
          </div>
        ))}
      </div>
    </main>
  )
}
