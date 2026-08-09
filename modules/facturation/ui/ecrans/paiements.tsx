'use client'

/**
 * Écran « Paiements — chèques et virements ».
 *
 * Français, de gauche à droite, comme dans le fichier de référence
 * (`<div class="cheque-screen" dir="ltr" lang="fr">`). Les valeurs arabes —
 * banque, payeur, clients, employé — sont isolées en lecture inverse, ce que le
 * fichier fait avec sa classe `cheque-rtl`.
 *
 * Structure reprise du fichier : titre et deux cartes de synthèse, barre de
 * filtres, tableau à quatorze colonnes, pied de tableau.
 *
 * Couvre : R-73 à R-77, et l'entrée des règles d'image R-35 et R-36.
 */

import type { RegistreBancaire } from '../../data/service'
import type { FiltresRegistre } from '../../domain/rules/cheque-register'
import { IndicateurChargement } from '../spinner'
import { T } from '../textes'
import './paiements.css'

interface Proprietes {
  registre: RegistreBancaire
  /**
   * Vrai pendant un rechargement qui suit un premier affichage réussi — les
   * valeurs déjà affichées restent visibles, seulement estompées, jamais
   * remplacées par un écran vide (2026-08-09).
   */
  rafraichissement?: boolean
  onFiltres: (filtres: Partial<FiltresRegistre>) => void
  onOuvrirDetail: (cle: string) => void
  onAjouterImage: (cle: string) => void
  aujourdhui: string
}

export function EcranPaiements({
  registre,
  rafraichissement,
  onFiltres,
  onOuvrirDetail,
  onAjouterImage,
  aujourdhui,
}: Proprietes) {
  const P = T.paiements
  const C = P.colonnes
  const filtres = registre.filtres

  return (
    <div className="cheque-ecran" dir="ltr" lang="fr">
      <main className="cheque-principal">
        <div className="cheque-titre">
          <div>
            <h2>
              {P.titre}
              {rafraichissement ? (
                <span className="omra-badge-rafraichissement">
                  <IndicateurChargement /> Mise à jour…
                </span>
              ) : null}
            </h2>
          </div>
          <div className={`cheque-synthese${rafraichissement ? ' omra-rafraichissement' : ''}`}>
            <div className="cheque-carte principale">
              <span>{P.montantGlobal}</span>
              <b>{registre.montantGlobal}</b>
            </div>
            <div className="cheque-carte">
              <span>{P.nombreAffiche}</span>
              <b>{registre.nombreAffiche}</b>
            </div>
          </div>
        </div>

        {/* R-74 — filtres date, recherche, mode, type, présence d'image. */}
        <div className="cheque-outils">
          <div className="cheque-champ date">
            <label htmlFor="cheque-date">{P.dateEnregistrement}</label>
            <input
              id="cheque-date"
              type="date"
              value={filtres.date}
              onChange={(evenement) => onFiltres({ date: evenement.target.value })}
            />
          </div>
          <button
            className="cheque-bouton"
            title={P.jourPrecedent}
            onClick={() => onFiltres({ date: decalerJour(filtres.date || aujourdhui, -1) })}
          >
            ‹
          </button>
          <button
            className="cheque-bouton"
            title={P.jourSuivant}
            onClick={() => onFiltres({ date: decalerJour(filtres.date || aujourdhui, 1) })}
          >
            ›
          </button>
          <button
            className={`cheque-bouton${filtres.date === aujourdhui ? ' actif' : ''}`}
            onClick={() => onFiltres({ date: aujourdhui })}
          >
            {P.aujourdhui}
          </button>
          <button
            className={`cheque-bouton${filtres.date ? '' : ' actif'}`}
            onClick={() => onFiltres({ date: '' })}
          >
            {P.toutesLesDates}
          </button>

          <div className="cheque-champ recherche">
            <label htmlFor="cheque-recherche">{P.recherche}</label>
            <input
              id="cheque-recherche"
              type="search"
              placeholder={P.rechercheAide}
              value={filtres.recherche}
              onChange={(evenement) => onFiltres({ recherche: evenement.target.value })}
            />
          </div>

          <div className="cheque-champ">
            <label htmlFor="cheque-mode">{P.mode}</label>
            <select
              id="cheque-mode"
              value={filtres.mode}
              onChange={(evenement) =>
                onFiltres({ mode: evenement.target.value as FiltresRegistre['mode'] })
              }
            >
              {P.optionsMode.map((option) => (
                <option key={option.valeur} value={option.valeur}>
                  {option.libelle}
                </option>
              ))}
            </select>
          </div>

          <div className="cheque-champ">
            <label htmlFor="cheque-type">{P.type}</label>
            <select
              id="cheque-type"
              value={filtres.type}
              onChange={(evenement) =>
                onFiltres({ type: evenement.target.value as FiltresRegistre['type'] })
              }
            >
              {P.optionsType.map((option) => (
                <option key={option.valeur} value={option.valeur}>
                  {option.libelle}
                </option>
              ))}
            </select>
          </div>

          <div className="cheque-champ">
            <label htmlFor="cheque-image">{P.image}</label>
            <select
              id="cheque-image"
              value={filtres.image}
              onChange={(evenement) =>
                onFiltres({ image: evenement.target.value as FiltresRegistre['image'] })
              }
            >
              {P.optionsImage.map((option) => (
                <option key={option.valeur} value={option.valeur}>
                  {option.libelle}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className={`cheque-carte-tableau${rafraichissement ? ' omra-rafraichissement' : ''}`}>
          <div className="cheque-defilement">
            <table className="cheque-tableau">
              <thead>
                <tr>
                  <th>{C.image}</th>
                  <th>{C.dateEnregistrement}</th>
                  <th>{C.montant}</th>
                  <th>{C.mode}</th>
                  <th>{C.numero}</th>
                  <th>{C.banque}</th>
                  <th>{C.datePaiement}</th>
                  <th>{C.type}</th>
                  <th>{C.payeur}</th>
                  <th>{C.clients}</th>
                  <th>{C.recus}</th>
                  <th>{C.attribue}</th>
                  <th>{C.restant}</th>
                  <th>{C.employe}</th>
                </tr>
              </thead>
              <tbody>
                {registre.lignes.map((ligne) => (
                  <tr
                    key={ligne.cle}
                    title={P.ouvrirPaiement}
                    onDoubleClick={() => onOuvrirDetail(ligne.cle)}
                  >
                    <td>
                      {ligne.image ? (
                        <button
                          className="cheque-vignette"
                          title={P.voirImage}
                          onClick={(evenement) => {
                            evenement.stopPropagation()
                            onOuvrirDetail(ligne.cle)
                          }}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={ligne.image} alt={ligne.alternativeImage} />
                        </button>
                      ) : (
                        <button
                          className="cheque-plus"
                          title={ligne.titreAjoutImage}
                          onClick={(evenement) => {
                            evenement.stopPropagation()
                            onAjouterImage(ligne.cle)
                          }}
                        >
                          +
                        </button>
                      )}
                    </td>
                    <td>
                      <span className="mono-ltr">{ligne.dateEnregistrement}</span>
                    </td>
                    <td>
                      <span className="cheque-montant">{ligne.montant}</span>
                    </td>
                    <td>
                      <span className={`cheque-pastille-mode ${ligne.classeMode}`}>
                        {ligne.mode}
                      </span>
                    </td>
                    <td>
                      <span className="cheque-numero mono-ltr">{ligne.numero}</span>
                    </td>
                    <td className="cheque-rtl" title={ligne.banque}>
                      {ligne.banque}
                    </td>
                    <td>
                      <span className="mono-ltr">{ligne.dateInstrument}</span>
                    </td>
                    <td>
                      <span className={`cheque-pastille-type ${ligne.classeType}`}>
                        {ligne.type}
                      </span>
                    </td>
                    <td className="cheque-rtl" title={ligne.payeurComplet}>
                      {ligne.payeur}
                    </td>
                    <td className="cheque-rtl" title={ligne.clientsComplet}>
                      {ligne.clients}
                    </td>
                    <td>
                      <span className="cheque-recus" title={ligne.recusComplet}>
                        {ligne.numerosRecus.map((numero) => (
                          <span className="omra-numero" key={numero}>
                            {numero}
                          </span>
                        ))}
                        {ligne.numerosRecus.length < ligne.recusComplet.split(' · ').length ? (
                          <span className="cheque-recus-suite">…</span>
                        ) : null}
                      </span>
                    </td>
                    <td>
                      <span className="cheque-montant">{ligne.attribue}</span>
                    </td>
                    <td>
                      <span className="cheque-montant" style={{ color: ligne.couleurRestant }}>
                        {ligne.restant}
                      </span>
                    </td>
                    <td className="cheque-rtl">{ligne.employe}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {registre.lignes.length === 0 ? <div className="cheque-vide">{P.vide}</div> : null}
          </div>
          <div className="cheque-pied">
            <span>{registre.libellePortee}</span>
            <span>{P.triInterne}</span>
          </div>
        </div>
      </main>
    </div>
  )
}

/** Décale la journée du filtre, comme les flèches ‹ et ›. */
function decalerJour(jour: string, pas: number): string {
  const base = new Date(`${jour}T12:00:00`)
  base.setDate(base.getDate() + pas)
  const annee = base.getFullYear()
  const mois = String(base.getMonth() + 1).padStart(2, '0')
  const jourDuMois = String(base.getDate()).padStart(2, '0')
  return `${annee}-${mois}-${jourDuMois}`
}
