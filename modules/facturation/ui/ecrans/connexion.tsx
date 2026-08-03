'use client'

/**
 * Écran de connexion.
 *
 * Reproduit l'écran `login` du fichier de référence : marque, deux champs,
 * bouton d'entrée, message d'erreur et rappel des comptes d'essai.
 * Arabe, de droite à gauche, comme dans le fichier.
 */

import { useState } from 'react'

import type { Utilisateur } from '../../domain/types'
import { T } from '../textes'

interface Proprietes {
  onConnexion: (identifiant: string, motDePasse: string) => Promise<Utilisateur | null>
  /** Comptes d'essai affichés sous le formulaire, comme dans la référence. */
  comptesEssai: string[]
}

export function EcranConnexion({ onConnexion, comptesEssai }: Proprietes) {
  const [identifiant, setIdentifiant] = useState('')
  const [motDePasse, setMotDePasse] = useState('')
  const [erreur, setErreur] = useState('')
  const [envoi, setEnvoi] = useState(false)

  const entrer = async () => {
    setEnvoi(true)
    const utilisateur = await onConnexion(identifiant, motDePasse)
    setEnvoi(false)
    // Le mot de passe est effacé dans tous les cas, réussite comprise : il ne
    // doit jamais subsister dans le champ ni dans l'état après une tentative.
    setMotDePasse('')
    if (!utilisateur) setErreur(T.connexion.erreur)
  }

  return (
    <div className="omra-login">
      <div className="omra-login-card">
        <div className="omra-login-brand">
          <div className="omra-login-logo" aria-hidden="true">
            <svg
              fill="none"
              height="36"
              stroke="#fff"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.6"
              viewBox="0 0 24 24"
              width="36"
            >
              <path d="M10 2h4M12 2v3" />
              <path d="M9 5h6a5 5 0 0 1 5 5v7a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5v-7a5 5 0 0 1 5-5z" />
              <path d="M4.5 14c2 0 2-1.4 4-1.4s2 1.4 4 1.4 2-1.4 4-1.4 2 1.4 3.5 1.4" />
            </svg>
          </div>
          <div className="omra-login-brand-name">{T.marque.nom}</div>
          <div className="omra-login-brand-sub">{T.marque.sousTitre}</div>
        </div>

        <div className="omra-login-filet" aria-hidden="true" />

        {erreur ? (
          <div className="omra-login-erreur" role="alert">
            {erreur}
          </div>
        ) : null}

        <label className="omra-login-champ">
          <span>{T.connexion.utilisateur}</span>
          <input
            className="omra-input"
            value={identifiant}
            onChange={(evenement) => setIdentifiant(evenement.target.value)}
            onKeyDown={(evenement) => {
              if (evenement.key === 'Enter') void entrer()
            }}
          />
        </label>

        <label className="omra-login-champ">
          <span>{T.connexion.motDePasse}</span>
          {/*
            `new-password` empêche le navigateur de proposer ou de réinjecter un
            mot de passe enregistré : le champ part toujours vide.
          */}
          <input
            className="omra-input"
            type="password"
            autoComplete="new-password"
            value={motDePasse}
            onChange={(evenement) => setMotDePasse(evenement.target.value)}
            onKeyDown={(evenement) => {
              if (evenement.key === 'Enter') void entrer()
            }}
          />
        </label>

        <button className="omra-btn primary omra-login-bouton" onClick={entrer} disabled={envoi}>
          {T.connexion.entrer}
        </button>

        <p className="omra-login-aide">
          {T.connexion.aideEssai}{' '}
          {comptesEssai.map((compte, index) => (
            <span key={compte}>
              {index > 0 ? ' · ' : ''}
              <span dir="ltr" style={{ unicodeBidi: 'isolate' }}>
                {compte}
              </span>
            </span>
          ))}
        </p>
      </div>
    </div>
  )
}
