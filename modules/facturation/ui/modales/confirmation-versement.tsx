'use client'

/**
 * Fenêtre de confirmation d'identité, juste avant l'enregistrement d'un
 * versement.
 *
 * Le nom du voyageur est déjà affiché plus haut dans le formulaire, mais en
 * simple titre — pas comme une vérification. Cette fenêtre isole nom et
 * montant, seuls, juste avant l'écriture, pour qu'un employé pressé les
 * revérifie d'un coup d'œil avant de confirmer.
 */

import { useState } from 'react'

import { codeCouleurNature } from '../../domain/payment-method'
import { Dialogue } from '../dialogue'
import { libelleNature } from '../instrument-panel'
import { Montant, TexteArabe } from '../bidi'
import { T } from '../textes'

interface Proprietes {
  nom: string
  prenom: string
  montantCentimes: number
  /** Nature normalisée (نقد/شيك/تحويل بنكي) : même badge coloré que le mini-tableau. */
  nature: string
  onNon: () => void
  onOui: () => void
}

export function ModaleConfirmationVersement({
  nom,
  prenom,
  montantCentimes,
  nature,
  onNon,
  onOui,
}: Proprietes) {
  // Même garde que `ModaleDepassement` : `onOui` déclenche l'enregistrement
  // asynchrone dans le composant parent, qui remplace cette fenêtre par la
  // sienne pendant l'attente. Sans ce garde local, un double clic déclenche
  // deux enregistrements pour une seule confirmation.
  const [enCours, setEnCours] = useState(false)

  const confirmer = () => {
    if (enCours) return
    setEnCours(true)
    onOui()
  }

  const annuler = () => {
    if (enCours) return
    onNon()
  }

  return (
    <Dialogue
      titre={T.confirmationVersement.titre}
      taille="small"
      onFermer={annuler}
      pied={
        <>
          <button className="omra-btn" onClick={annuler} disabled={enCours}>
            {T.confirmationVersement.non}
          </button>
          <button className="omra-btn primary" onClick={confirmer} disabled={enCours}>
            {T.confirmationVersement.oui}
          </button>
        </>
      }
    >
      <p className="omra-hint" style={{ marginTop: 0, textAlign: 'center' }}>
        {T.confirmationVersement.consigne}
      </p>

      <div className="confirmation-versement-nom">
        <TexteArabe>{`${prenom} ${nom}`}</TexteArabe>
      </div>
      <div className="confirmation-versement-montant">
        <Montant centimes={montantCentimes} />
      </div>
      {/*
        R-23 — même badge coloré que le mini-tableau des dfp : espèces, chèque
        et virement ont chacun leur couleur, pour repérer une méthode cochée
        par erreur (chèque au lieu d'espèces) aussi vite qu'un mauvais montant.
      */}
      <div className="confirmation-versement-methode">
        <span className={`omra-method ${codeCouleurNature(nature)}`}>{libelleNature(nature)}</span>
      </div>
    </Dialogue>
  )
}
