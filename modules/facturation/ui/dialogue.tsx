'use client'

/**
 * Coque de fenêtre modale.
 *
 * R-89 — La touche d'échappement ferme toute fenêtre, comme dans le fichier de
 * référence où un écouteur global intercepte `Escape`.
 * Un clic sur le fond ferme également, comme les gestionnaires `overlayClick`.
 */

import { useEffect, type ReactNode } from 'react'

import { fermeLaFenetre } from './preferences'

interface ProprietesDialogue {
  titre: string
  taille?: 'small' | 'normal' | 'large'
  onFermer: () => void
  children: ReactNode
  pied?: ReactNode
  /** Élément placé à droite du titre (compteur, badge…). */
  entete?: ReactNode
  /**
   * Bandeau pleine largeur inséré entre l'en-tête et le corps, hors de la
   * marge du corps — reprend `.new-modal-receipt-head` du fichier de référence.
   */
  bandeau?: ReactNode
  /** Classe supplémentaire posée sur la coque, pour les largeurs variables. */
  classeCoque?: string
  /** Pastille d'icône placée avant le titre, comme l'en-tête du dossier. */
  icone?: ReactNode
  /** Ligne secondaire sous le titre — le fichier y place le nom du voyageur. */
  sousTitre?: ReactNode
}

export function Dialogue({
  titre,
  taille = 'normal',
  onFermer,
  children,
  pied,
  entete,
  bandeau,
  classeCoque,
  icone,
  sousTitre,
}: ProprietesDialogue) {
  // R-89
  useEffect(() => {
    const surTouche = (evenement: KeyboardEvent) => {
      if (fermeLaFenetre(evenement.key)) onFermer()
    }
    window.addEventListener('keydown', surTouche)
    return () => window.removeEventListener('keydown', surTouche)
  }, [onFermer])

  const classeTaille = taille === 'normal' ? '' : ` ${taille}`

  return (
    <div
      className="omra-overlay"
      role="presentation"
      onMouseDown={(evenement) => {
        if (evenement.target === evenement.currentTarget) onFermer()
      }}
    >
      <div
        className={`omra-modal${classeTaille}${classeCoque ? ` ${classeCoque}` : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={titre}
      >
        <div className="omra-modal-head">
          {icone ? (
            <div className="omra-modal-icone" aria-hidden="true">
              {icone}
            </div>
          ) : null}
          {sousTitre ? (
            <div className="omra-modal-titres">
              <h2>{titre}</h2>
              <div className="omra-modal-sous-titre">{sousTitre}</div>
            </div>
          ) : (
            <h2>{titre}</h2>
          )}
          {entete}
          <button className="omra-icon-btn" onClick={onFermer} aria-label="Fermer">
            ✕
          </button>
        </div>
        {bandeau}
        <div className="omra-modal-body">{children}</div>
        {pied ? <div className="omra-modal-foot">{pied}</div> : null}
      </div>
    </div>
  )
}
