'use client'

/**
 * Carte « image de l'instrument » des formulaires de création et de versement.
 *
 * Arabe, de droite à gauche, comme les fenêtres du lot L2 dans le fichier de
 * référence (`.cheque-form-card`). Trois états, ceux du fichier :
 *
 *  - image disponible — aperçu et texte selon la portée ;
 *  - aucune image — bouton « + » pour en ajouter une (R-35) ;
 *  - verrouillé — l'opération partagée est déjà enregistrée, l'image s'ajoute
 *    depuis le registre des paiements et non depuis ce reçu (R-37).
 */

import { NATURE_CHEQUE, NATURE_VIREMENT } from '../domain/constants'
import { natureNormalisee } from '../domain/payment-method'
import type { SaisieInstrument } from '../domain/rules/instrument'
import { T } from './textes'

interface Proprietes {
  saisie: SaisieInstrument
  /** Aperçu du brouillon local, s'il y en a un. */
  apercuBrouillon: string
  /** URL de l'image déjà portée par l'opération partagée sélectionnée. */
  apercuOperation: string
  /** Formulaire de versement : le texte verrouillé y est légèrement plus court. */
  contexte: 'recu' | 'versement'
  onAjouter: () => void
}

export function CarteImageInstrument({
  saisie,
  apercuBrouillon,
  apercuOperation,
  contexte,
  onAjouter,
}: Proprietes) {
  const I = T.imageInstrument
  const nature = natureNormalisee(saisie.nature)
  const bancaire = nature === NATURE_CHEQUE || nature === NATURE_VIREMENT
  const existante = saisie.portee === 'shared' && saisie.sourceOperation === 'existing'

  // Le fichier n'affiche la carte que pour un instrument bancaire, et pour une
  // opération existante seulement une fois celle-ci choisie.
  if (!bancaire || (existante && !saisie.operationId)) return null

  const apercu = apercuBrouillon || (existante ? apercuOperation : '')
  const titre = nature === NATURE_VIREMENT ? I.titreVirement : I.titreCheque
  const peutAjouter = !apercu && !existante
  const verrouille = !apercu && existante

  return (
    <div className="carte-image-instrument">
      <div className="entete">
        <strong>{titre}</strong>
        <span>{contexte === 'recu' ? I.uneSeuleParOperation : I.uneSeule}</span>
      </div>
      <div className="contenu">
        {apercu ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="apercu" src={apercu} alt={titre} />
            <div className="etat">
              <b>{I.disponible}</b>
              {existante ? I.texteDisponibleOperationExistante : I.texteDisponible}
            </div>
          </>
        ) : null}

        {peutAjouter ? (
          <>
            <div className="etat">
              <b>{I.absente}</b>
              {nature === NATURE_VIREMENT ? I.texteAbsentVirement : I.texteAbsentCheque}
            </div>
            <button className="ajouter" type="button" title={I.ajouter} onClick={onAjouter}>
              +
            </button>
          </>
        ) : null}

        {verrouille ? (
          <div className="etat">
            <b>{I.absenteSurPrincipale}</b>
            {contexte === 'recu' ? I.texteVerrouilleRecu : I.texteVerrouilleVersement}
          </div>
        ) : null}
      </div>
    </div>
  )
}
