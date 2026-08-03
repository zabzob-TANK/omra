'use client'

/**
 * Champs de formulaire partagés.
 *
 * Les masques de saisie appliqués sont ceux du domaine (U-08 à U-11), afin que
 * l’interface ne redéfinisse aucune règle.
 */

import type { ReactNode } from 'react'

import type { ErreurValidation } from '../domain/rules/errors'
import { messageErreur } from '../domain/rules/errors'
import { T } from './textes'

/** Vrai si le champ porte une erreur — pilote l'état visuel « invalide ». */
export function enErreur(erreurs: ErreurValidation[], champ: string): boolean {
  return erreurs.some((e) => e.champ === champ)
}

export function ListeErreurs({ erreurs }: { erreurs: ErreurValidation[] }) {
  if (!erreurs.length) return null
  return (
    <div className="omra-errors" role="alert">
      <strong>{T.nouveau.erreurs}</strong>
      <ul>
        {erreurs.map((erreur, index) => (
          <li key={`${erreur.champ}-${erreur.code}-${index}`}>{messageErreur(erreur)}</li>
        ))}
      </ul>
    </div>
  )
}

interface ProprietesChamp {
  label: string
  children: ReactNode
  pleine?: boolean
  aide?: string
}

export function Champ({ label, children, pleine, aide }: ProprietesChamp) {
  return (
    <div className={`omra-field${pleine ? ' pleine' : ''}`}>
      <label>{label}</label>
      {children}
      {aide ? <span className="omra-hint">{aide}</span> : null}
    </div>
  )
}

interface ProprietesSaisie {
  valeur: string
  onChange: (valeur: string) => void
  invalide?: boolean
  placeholder?: string
  /** Direction du contenu : les valeurs arabes se saisissent de droite à gauche. */
  arabe?: boolean
  mono?: boolean
  type?: 'text' | 'password'
  inputMode?: 'text' | 'numeric' | 'tel'
  /** Classe supplémentaire, pour les champs mis en avant. */
  classe?: string
  /**
   * Remplissage automatique du navigateur. Laissé libre, sauf pour un champ de
   * mot de passe, où `new-password` est imposé par défaut : aucun mot de passe
   * enregistré ne doit être proposé ni réinjecté dans l'application.
   */
  autoComplete?: string
}

export function Saisie({
  valeur,
  onChange,
  invalide,
  placeholder,
  arabe,
  mono,
  type = 'text',
  inputMode,
  classe,
  autoComplete,
}: ProprietesSaisie) {
  return (
    <input
      type={type}
      className={`omra-input${invalide ? ' invalide' : ''}${mono ? ' mono' : ''}${classe ? ` ${classe}` : ''}`}
      dir={arabe ? 'rtl' : 'ltr'}
      style={arabe ? { unicodeBidi: 'plaintext', textAlign: 'right' } : undefined}
      value={valeur}
      placeholder={placeholder}
      inputMode={inputMode}
      autoComplete={autoComplete ?? (type === 'password' ? 'new-password' : undefined)}
      onChange={(evenement) => onChange(evenement.target.value)}
    />
  )
}

interface ProprietesZone {
  valeur: string
  onChange: (valeur: string) => void
  invalide?: boolean
  placeholder?: string
  arabe?: boolean
  /** Nombre de lignes visibles — le fichier en fixe 2 ou 4 selon le champ. */
  lignes?: number
}

/** Zone de texte multiligne : le fichier l'emploie pour la note et le motif. */
export function Zone({ valeur, onChange, invalide, placeholder, arabe, lignes = 2 }: ProprietesZone) {
  return (
    <textarea
      className={`omra-input omra-zone${invalide ? ' invalide' : ''}`}
      rows={lignes}
      dir={arabe ? 'rtl' : 'ltr'}
      style={arabe ? { unicodeBidi: 'plaintext', textAlign: 'right' } : undefined}
      value={valeur}
      placeholder={placeholder}
      onChange={(evenement) => onChange(evenement.target.value)}
    />
  )
}

interface ProprietesSelection {
  valeur: string
  onChange: (valeur: string) => void
  options: { valeur: string; libelle: string; arabe?: boolean }[]
  invalide?: boolean
  /**
   * Libellé de l'invite, affiché uniquement quand le champ est fermé et
   * qu'aucune valeur n'a encore été choisie. L'invite n'apparaît jamais dans
   * la liste ouverte et n'est jamais sélectionnable.
   *
   * La valeur reste vide tant que rien n'est choisi : les règles de validation
   * sont inchangées, le noyau métier continue de refuser un champ non renseigné.
   */
  vide?: string
}

export function Selection({
  valeur,
  onChange,
  options,
  invalide,
  vide = T.nouveau.choisir,
}: ProprietesSelection) {
  return (
    <select
      className={`omra-input${invalide ? ' invalide' : ''}`}
      value={valeur}
      onChange={(evenement) => onChange(evenement.target.value)}
    >
      {/*
        L'invite n'existe que pour porter le libellé affiché quand le champ est
        fermé et qu'aucune valeur n'a été choisie. `hidden` la retire de la liste
        ouverte, `disabled` interdit de la choisir : elle n'est jamais une valeur.
      */}
      <option value="" hidden disabled>
        {vide}
      </option>
      {options.map((option) => (
        <option key={option.valeur} value={option.valeur}>
          {option.libelle}
        </option>
      ))}
    </select>
  )
}

export function CaseACocher({
  coche,
  onChange,
  label,
}: {
  coche: boolean
  onChange: (coche: boolean) => void
  label: string
}) {
  return (
    <label className="omra-check">
      <input
        type="checkbox"
        className="omra-input"
        checked={coche}
        onChange={(evenement) => onChange(evenement.target.checked)}
      />
      {label}
    </label>
  )
}
