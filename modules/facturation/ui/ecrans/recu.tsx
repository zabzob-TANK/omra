'use client'

/**
 * Écran « الوصل » — affichage et impression du reçu.
 *
 * Dans le fichier de référence, cet écran contient deux choses : une barre
 * supérieure avec le bouton « رجوع », et le reçu imprimable occupant toute la
 * hauteur. Il n'y a ni en-tête global, ni fiche, ni sections.
 *
 * Le reçu s'accompagne de sa propre barre d'outils, en français comme dans le
 * fichier : aperçu complet, impression seule, repères, décalages X et Y,
 * réinitialisation et impression.
 *
 * Couvre : R-82, R-83, R-84, R-85, et le blocage d'impression au-delà de six
 * paiements (R-81).
 */

import { useEffect, useMemo, useState } from 'react'

import type { Recu } from '../../domain/types'
import { IndicateurChargement } from '../spinner'
import { T } from '../textes'
import {
  classesAtelier,
  impressionBloquee,
  MESSAGE_COMPTEUR_IMPRESSION_ECHEC,
  MESSAGE_IMPRESSION_BLOQUEE,
  preparerRecuImprimable,
  sequenceImpression,
  variablesDecalage,
} from '../recu/donnees'
import { RecuImprimable } from '../recu/recu-imprimable'

/** Libellés de la barre d'outils, en français comme dans le fichier. */
const OUTILS = {
  titre: 'Prototype reçu Zemzem',
  apercuComplet: 'Aperçu complet',
  impressionSeule: 'Impression seule',
  reperes: 'Repères',
  reinitialiser: 'Réinitialiser',
  imprimer: 'Imprimer',
  indication:
    'La correction validée de base reste intégrée au design. Les axes X/Y servent uniquement aux tests d’impression. Les données du reçu restent en lecture seule.',
  titreX: 'Décalage horizontal temporaire en millimètres',
  titreY: 'Décalage vertical temporaire en millimètres',
} as const

/** Papier à en-tête, servi depuis `public/`. */
const CHEMIN_FOND = '/facturation/fond-facture.png'

interface Proprietes {
  recu: Recu
  /**
   * Faux lorsque le reçu est rouvert après coup.
   *
   * R-85 — Le fichier de référence calcule bien `isCopy` et `copyLabel`, mais
   * son gabarit ne les affiche nulle part : les blocs conditionnels
   * correspondants y sont vides. La distinction est donc conservée dans la
   * logique, et non rendue à l'écran, comme dans le fichier.
   */
  original: boolean
  onRetour: () => void
  /** R-84 — comptabilise une impression. Doit être attendu avant l'impression (P18). */
  onImpression: () => Promise<void>
}

export function EcranRecu({ recu, onRetour, onImpression }: Proprietes) {
  const donnees = useMemo(() => preparerRecuImprimable(recu), [recu])

  const [sansFond, setSansFond] = useState(false)
  const [reperes, setReperes] = useState(false)
  const [decalageX, setDecalageX] = useState('0')
  const [decalageY, setDecalageY] = useState('0')
  const [message, setMessage] = useState('')
  const [envoi, setEnvoi] = useState(false)

  // La règle `@page` n'est posée que pendant l'affichage de cet écran, afin de
  // ne pas interférer avec les autres impressions de l'application — c'est la
  // méthode employée par le fichier de référence pour le journal financier.
  useEffect(() => {
    const style = document.createElement('style')
    style.textContent = '@page{size:210mm 297mm;margin:0}'
    document.head.appendChild(style)
    document.body.classList.add('recu-impression')
    return () => {
      style.remove()
      document.body.classList.remove('recu-impression')
    }
  }, [])

  const imprimer = async () => {
    if (envoi) return
    // R-81 — au-delà de six paiements, le fichier de référence bloque
    // l'impression au lieu de produire un document incomplet.
    if (impressionBloquee(donnees)) {
      setMessage(MESSAGE_IMPRESSION_BLOQUEE)
      return
    }
    setMessage('')
    setEnvoi(true)
    // P18 — le compteur doit être écrit avant l'ouverture de la boîte système.
    // Décision actée : un échec du compteur ne bloque jamais l'impression —
    // `sequenceImpression` imprime dans tous les cas et relance l'erreur
    // ensuite, qu'on affiche ici sans jamais l'avaler en silence.
    try {
      await sequenceImpression(onImpression, () => window.print())
    } catch {
      setMessage(MESSAGE_COMPTEUR_IMPRESSION_ECHEC)
    } finally {
      setEnvoi(false)
    }
  }

  const classes = classesAtelier({ sansFond, reperes })

  return (
    <div
      className={classes}
      style={variablesDecalage(decalageX, decalageY) as React.CSSProperties}
    >
      {/*
        Le fichier de référence place « رجوع » dans une barre à lui, au-dessus
        du reçu, et non dans la barre d'outils sombre : celle-ci appartient au
        document du reçu, que le fichier isole dans un cadre.
      */}
      <div className="recu-barre-retour omra-no-print">
        <button onClick={onRetour}>
          <svg
            aria-hidden="true"
            fill="none"
            height="15"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="2"
            viewBox="0 0 24 24"
            width="15"
          >
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
          {T.recu.retour}
        </button>
      </div>

      <div className="recu-outils" aria-label="Outils de test">
        <strong>{OUTILS.titre}</strong>
        <button onClick={() => setSansFond(false)}>{OUTILS.apercuComplet}</button>
        <button onClick={() => setSansFond(true)}>{OUTILS.impressionSeule}</button>
        <button onClick={() => setReperes((actuel) => !actuel)}>{OUTILS.reperes}</button>
        <label>
          X{' '}
          <input
            type="number"
            min={-10}
            max={10}
            step={0.1}
            title={OUTILS.titreX}
            value={decalageX}
            onChange={(evenement) => setDecalageX(evenement.target.value)}
          />
        </label>
        <label>
          Y{' '}
          <input
            type="number"
            min={-10}
            max={10}
            step={0.1}
            title={OUTILS.titreY}
            value={decalageY}
            onChange={(evenement) => setDecalageY(evenement.target.value)}
          />
        </label>
        <button
          onClick={() => {
            setDecalageX('0')
            setDecalageY('0')
          }}
        >
          {OUTILS.reinitialiser}
        </button>
        <button className="primary" onClick={imprimer} disabled={envoi}>
          {envoi ? <IndicateurChargement /> : null}
          {OUTILS.imprimer}
        </button>
        <span className="indication">{OUTILS.indication}</span>
        {donnees.depassement ? (
          <span className="alerte-depassement">{donnees.messageDepassement}</span>
        ) : null}
      </div>

      {message ? (
        <div
          role="alert"
          style={{
            padding: '10px 14px',
            background: '#9c3b32',
            color: '#fff',
            fontSize: 12.5,
          }}
        >
          {message}
        </div>
      ) : null}

      <main className="recu-espace">
        <RecuImprimable donnees={donnees} cheminFond={CHEMIN_FOND} />
      </main>
    </div>
  )
}
