'use client'

/**
 * Sous-navigation de la rubrique « المالية ».
 *
 * Deux boutons, en français dans le fichier de référence
 * (`<button lang="fr">Paiements</button>`), collants sous l'en-tête et centrés.
 * Aucun bouton n'est actif sur le journal financier lui-même ; « Paiements » est
 * actif sur le registre bancaire, « Suivi journalier » sur le suivi.
 */

import { T } from './textes'
import './sous-nav.css'

export type RubriqueFinance = 'finance' | 'paiements' | 'suivi'

interface Proprietes {
  active: RubriqueFinance
  onPaiements: () => void
  onSuiviJournalier: () => void
}

export function SousNavFinance({ active, onPaiements, onSuiviJournalier }: Proprietes) {
  return (
    <div className="omra-sous-nav" aria-label="Sous-rubriques Finance">
      <button
        lang="fr"
        className={active === 'paiements' ? 'active' : undefined}
        onClick={onPaiements}
      >
        {T.finance.sousNav.paiements}
      </button>
      <button
        lang="fr"
        className={active === 'suivi' ? 'active' : undefined}
        onClick={onSuiviJournalier}
      >
        {T.finance.sousNav.suiviJournalier}
      </button>
    </div>
  )
}
