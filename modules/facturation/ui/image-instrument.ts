'use client'

/**
 * Brouillon d'image partagé par les deux formulaires du lot L2.
 *
 * Le fichier de référence garde l'image en brouillon (`checkImageDraft`) et ne
 * la rattache à l'opération qu'au moment de l'enregistrement du reçu ou du
 * versement. Rien n'est déposé tant que l'enregistrement n'a pas eu lieu.
 */

import { useCallback, useEffect, useState } from 'react'

import { NATURE_VIREMENT } from '../domain/constants'
import { natureNormalisee } from '../domain/payment-method'
import { libellesInstrument } from '../domain/rules/cheque-register'
import type { SaisieInstrument } from '../domain/rules/instrument'
import { centimesEnTexteDevise, dirhamsSaisisEnCentimes } from '../domain/money'
import type { CiblePaiement } from './modales/paiement-image'

export interface BrouillonImage {
  contenu: Blob
  nomOrigine: string
  apercu: string
}

export function useBrouillonImage() {
  const [brouillon, setBrouillon] = useState<BrouillonImage | null>(null)
  const [ouverte, setOuverte] = useState(false)

  const retenir = useCallback((contenu: Blob, nomOrigine: string) => {
    setBrouillon((precedent) => {
      if (precedent) URL.revokeObjectURL(precedent.apercu)
      return { contenu, nomOrigine, apercu: URL.createObjectURL(contenu) }
    })
    setOuverte(false)
  }, [])

  useEffect(
    () => () => {
      if (brouillon) URL.revokeObjectURL(brouillon.apercu)
    },
    [brouillon],
  )

  return { brouillon, ouverte, ouvrir: () => setOuverte(true), fermer: () => setOuverte(false), retenir }
}

/** Décrit l'opération visée par la fenêtre d'ajout, depuis la saisie en cours. */
export function cibleImageInstrument(
  saisie: SaisieInstrument,
  montantSaisi: string,
): CiblePaiement {
  const virement = natureNormalisee(saisie.nature) === NATURE_VIREMENT
  const libelles = libellesInstrument(saisie.nature)
  const montantCentimes =
    saisie.portee === 'shared' && saisie.montantOperation
      ? dirhamsSaisisEnCentimes(saisie.montantOperation)
      : dirhamsSaisisEnCentimes(montantSaisi)
  return {
    cle: '',
    titre: libelles.titreAjout,
    libelleReference: libelles.libelleReference,
    libelleImport: libelles.libelleImport,
    numero: saisie.reference || '—',
    banque: saisie.banque || '—',
    montant: centimesEnTexteDevise(montantCentimes),
    payeur: saisie.payeur || '—',
    date: saisie.dateInstrument || '—',
    virement,
  }
}
