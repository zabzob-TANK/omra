'use client'

/**
 * Écran « Suivi journalier ».
 *
 * Français, de gauche à droite, comme dans le fichier de référence
 * (`<div class="daily-screen" dir="ltr" lang="fr">`). Seules les valeurs arabes
 * — il n'y en a pas sur cet écran — seraient isolées.
 *
 * Structure reprise du fichier : titre et sous-titre, navigation par mois, six
 * cartes de synthèse, ligne « Chèques + virements », barre de sélection, puis
 * le tableau à dix colonnes et son pied.
 *
 * Couvre : R-68 à R-72.
 */

import type { SuiviJournalier } from '../../data/service'
import { T } from '../textes'
import './suivi-journalier.css'

interface Proprietes {
  suivi: SuiviJournalier
  onMois: (mois: string) => void
  onMoisActuel: () => void
  onBasculerJournee: (cle: string) => void
  onBasculerToutes: () => void
  onEffacerSelection: () => void
  onBasculerVides: () => void
}

export function EcranSuiviJournalier({
  suivi,
  onMois,
  onMoisActuel,
  onBasculerJournee,
  onBasculerToutes,
  onEffacerSelection,
  onBasculerVides,
}: Proprietes) {
  const S = T.suiviJournalier
  const C = S.colonnes
  const selection = new Set(suivi.selection)

  return (
    <div className="daily-ecran" dir="ltr" lang="fr">
      <main className="daily-principal">
        <div className="daily-entete">
          <div>
            <h1>{S.titre}</h1>
            <p>{S.sousTitre}</p>
          </div>
          <div className="daily-mois">
            <button
              className="icone"
              title={S.moisPrecedent}
              onClick={() => onMois(decalerMois(suivi.mois, -1))}
            >
              ‹
            </button>
            <input
              type="month"
              value={suivi.mois}
              onChange={(evenement) => onMois(evenement.target.value)}
            />
            <button
              className="icone"
              title={S.moisSuivant}
              disabled={!suivi.moisSuivantPossible}
              style={{ opacity: suivi.moisSuivantPossible ? 1 : 0.4 }}
              onClick={() => onMois(decalerMois(suivi.mois, 1))}
            >
              ›
            </button>
            <button onClick={onMoisActuel}>{S.moisActuel}</button>
          </div>
        </div>

        <div className="daily-synthese-defilement">
          <div className="daily-synthese">
            <div className="daily-carte principale">
              <span className="etiquette">{S.encaissements}</span>
              <span className="valeur">{suivi.encaissements}</span>
            </div>
            <div className="daily-carte principale">
              <span className="etiquette">{S.especes}</span>
              <span className="valeur">{suivi.especes}</span>
            </div>
            <div className="daily-carte">
              <span className="etiquette">{S.cheques}</span>
              <span className="valeur">{suivi.cheques}</span>
            </div>
            <div className="daily-carte">
              <span className="etiquette">{S.virements}</span>
              <span className="valeur">{suivi.virements}</span>
            </div>
            <div className="daily-carte">
              <span className="etiquette">{S.nouveauxClients}</span>
              <span className="valeur">{suivi.nouveauxClients}</span>
            </div>
            <div className="daily-carte">
              <span className="etiquette">{S.annulations}</span>
              <span className="valeur">{suivi.annulationsResume}</span>
            </div>
          </div>
        </div>

        <div className="daily-total-bancaire">
          <span>{S.totalBancaire}</span>
          <b>{suivi.totalBancaire}</b>
          <span className="point">·</span>
          <span>{S.operationsBancaires(suivi.nombreOperationsBancaires)}</span>
        </div>

        {/* R-70 — sélection multiple, tout sélectionner, effacer, masquer les vides. */}
        <div className="daily-actions">
          <label>
            <input
              type="checkbox"
              checked={suivi.toutesVisiblesSelectionnees}
              onChange={onBasculerToutes}
            />
            {S.selectionnerToutes}
          </label>
          <span
            className={`daily-etat-selection${suivi.selection.length ? ' actif' : ''}`}
          >
            {suivi.selection.length ? S.selection(suivi.selection.length) : S.moisComplet}
          </span>
          {suivi.selection.length ? (
            <button className="daily-action" onClick={onEffacerSelection}>
              {S.effacerSelection}
            </button>
          ) : null}
          <button
            className={`daily-action vides${suivi.afficherVides ? ' actif' : ''}`}
            onClick={onBasculerVides}
          >
            {suivi.afficherVides ? S.videsAffichees : S.videsMasquees}
          </button>
        </div>

        <section className="daily-carte-tableau">
          <div className="daily-defilement">
            <table className="daily-tableau">
              <thead>
                <tr>
                  <th className="colonne-case">
                    <input
                      type="checkbox"
                      checked={suivi.toutesVisiblesSelectionnees}
                      title={S.selectionnerToutes}
                      onChange={onBasculerToutes}
                    />
                  </th>
                  <th>{C.jour}</th>
                  <th>{C.date}</th>
                  <th>{C.especes}</th>
                  <th>{C.total}</th>
                  <th>{C.cheques}</th>
                  <th>{C.virements}</th>
                  <th>{C.nouveaux}</th>
                  <th>{C.annulations}</th>
                  <th>{C.controle}</th>
                </tr>
              </thead>
              <tbody>
                {suivi.lignes.map((ligne) => (
                  <tr
                    key={ligne.cle}
                    className={[
                      ligne.weekEnd ? 'week-end' : '',
                      ligne.vide ? 'vide' : '',
                      selection.has(ligne.cle) ? 'selectionnee' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <td className="cellule-case">
                      <input
                        type="checkbox"
                        checked={selection.has(ligne.cle)}
                        title={S.inclureJournee}
                        onChange={() => onBasculerJournee(ligne.cle)}
                      />
                    </td>
                    <td className="cellule-jour">{ligne.jour}</td>
                    <td className="cellule-date">{ligne.date}</td>
                    <td className="majeur">{ligne.especes}</td>
                    <td className="majeur">{ligne.total}</td>
                    <td className="instrument">{ligne.cheques}</td>
                    <td className="instrument">{ligne.virements}</td>
                    <td className="nouveaux">{ligne.nouveauxClients}</td>
                    <td className="instrument">{ligne.annulations}</td>
                    <td className="controle">
                      {ligne.prefixeControle}{' '}
                      <span className={`daily-etat-controle ${ligne.classeControle}`}>
                        {ligne.etatControle}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="daily-pied">
            <span>{S.joursAffiches(suivi.nombreAffichees, suivi.nombreMasquees)}</span>
            <span>{S.noteWeekEnd}</span>
          </div>
        </section>
      </main>
    </div>
  )
}

/** Décale le mois affiché, comme les flèches ‹ et ›. */
function decalerMois(mois: string, pas: number): string {
  const [annee, index] = mois.split('-').map(Number)
  const date = new Date(annee, index - 1 + pas, 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}
