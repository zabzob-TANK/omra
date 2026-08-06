'use client'

/**
 * Fenêtre de détail d'un paiement bancaire.
 *
 * Français, de gauche à droite, comme dans le fichier de référence
 * (`.cheque-modal`). Les valeurs arabes restent isolées en lecture inverse.
 *
 * Couvre : R-76 (répartition entre les reçus avec la situation de chacun),
 * R-36 (l'ajout n'est proposé qu'en l'absence d'image) et R-39 (suppression
 * réservée à l'administrateur).
 */

import { useEffect, useState } from 'react'

import type { DetailOperationBancaire } from '../../data/service'
import { IndicateurChargement } from '../spinner'
import { T } from '../textes'

interface Proprietes {
  detail: DetailOperationBancaire
  onFermer: () => void
  onAjouterImage: () => void
  onSupprimerImage: () => Promise<void>
}

export function ModalePaiementDetail({
  detail,
  onFermer,
  onAjouterImage,
  onSupprimerImage,
}: Proprietes) {
  const D = T.paiementDetail
  const C = D.colonnes
  const [suppressionEnCours, setSuppressionEnCours] = useState(false)

  // R-89 — la touche d'échappement ferme la fenêtre.
  useEffect(() => {
    const surTouche = (evenement: KeyboardEvent) => {
      if (evenement.key === 'Escape') onFermer()
    }
    document.addEventListener('keydown', surTouche)
    return () => document.removeEventListener('keydown', surTouche)
  }, [onFermer])

  return (
    <div
      className="cheque-fenetre-fond"
      onClick={(evenement) => {
        if (evenement.target === evenement.currentTarget) onFermer()
      }}
    >
      <div className="cheque-fenetre" dir="ltr" lang="fr">
        <div className="cheque-fenetre-entete">
          <div>
            <h3>{detail.entete}</h3>
            <p>{D.sousTitre(detail.dateEnregistrement)}</p>
          </div>
          <button className="cheque-fenetre-fermer" onClick={onFermer}>
            ✕
          </button>
        </div>

        <div className="cheque-fenetre-corps">
          <div className="cheque-scene">
            {detail.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={detail.image} alt={detail.alternativeImage} />
            ) : (
              <div className="cheque-scene-vide">
                <strong>{D.sansImage}</strong>
                <span>{detail.texteSansImage}</span>
              </div>
            )}
          </div>

          <div className="cheque-actions-image">
            {detail.ajoutPossible ? (
              <button className="cheque-action principale" onClick={onAjouterImage}>
                {D.ajouterImage}
              </button>
            ) : (
              <span style={{ fontSize: 10.5, color: '#7A7F75' }}>
                {D.imageAjoutee(detail.imageDeposeeLe, detail.imageDeposeePar)}
              </span>
            )}
            {detail.suppressionPossible ? (
              <button
                className="cheque-action danger"
                disabled={suppressionEnCours}
                onClick={async () => {
                  if (suppressionEnCours) return
                  setSuppressionEnCours(true)
                  await onSupprimerImage()
                  setSuppressionEnCours(false)
                }}
              >
                {suppressionEnCours ? <IndicateurChargement /> : null}
                {D.supprimerImage}
              </button>
            ) : null}
          </div>

          <div className="cheque-grille-infos">
            <div className="cheque-info">
              <span>{D.modePaiement}</span>
              <b>{detail.mode}</b>
            </div>
            <div className="cheque-info">
              <span>{D.montantReel}</span>
              <b className="montant">{detail.montant}</b>
            </div>
            <div className="cheque-info">
              <span>{detail.libelleReference}</span>
              <b className="mono-ltr">{detail.numero}</b>
            </div>
            <div className="cheque-info">
              <span>{D.banque}</span>
              <b className="cheque-rtl">{detail.banque}</b>
            </div>
            <div className="cheque-info">
              <span>{detail.libelleDate}</span>
              <b className="mono-ltr">{detail.dateInstrument}</b>
            </div>
            <div className="cheque-info">
              <span>{D.type}</span>
              <b>{detail.type}</b>
            </div>
            <div className="cheque-info">
              <span>{D.payeur}</span>
              <b className="cheque-rtl">{detail.payeur}</b>
            </div>
            <div className="cheque-info">
              <span>{D.montantAttribue}</span>
              <b className="montant">{detail.attribue}</b>
            </div>
            <div className="cheque-info">
              <span>{D.montantRestant}</span>
              <b className="montant" style={{ color: detail.couleurRestant }}>
                {detail.restant}
              </b>
            </div>
            <div className="cheque-info">
              <span>{D.employe}</span>
              <b className="cheque-rtl">{detail.employe}</b>
            </div>
            <div className="cheque-info">
              <span>{D.clientsLies}</span>
              <b className="cheque-rtl">{detail.clients}</b>
            </div>
            <div className="cheque-info">
              <span>{D.recusLies}</span>
              <b className="mono-ltr">{detail.recus}</b>
            </div>
          </div>

          {/* R-76 */}
          <div className="cheque-repartition">
            <div className="cheque-repartition-titre">{D.repartition}</div>
            <table>
              <thead>
                <tr>
                  <th>{C.recu}</th>
                  <th>{C.client}</th>
                  <th>{C.montant}</th>
                  <th>{C.situation}</th>
                </tr>
              </thead>
              <tbody>
                {detail.attributions.map((attribution) => (
                  <tr key={`${attribution.numeroRecu}-${attribution.client}`}>
                    <td className="mono-ltr">{attribution.numeroRecu}</td>
                    <td className="cheque-rtl">{attribution.client}</td>
                    <td className="cheque-montant">{attribution.montant}</td>
                    <td className={attribution.annule ? 'cheque-annule' : undefined}>
                      {attribution.situation}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
