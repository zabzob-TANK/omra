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
  donneesAvecVersementsTest,
  impressionBloquee,
  MESSAGE_COMPTEUR_IMPRESSION_ECHEC,
  MESSAGE_IMPRESSION_BLOQUEE,
  type NombreVersementsTest,
  preparerRecuImprimable,
  type ReglagesCalage,
  REGLAGES_CALAGE_PAR_DEFAUT,
  resumeReglagesCalage,
  sequenceImpression,
  variablesCalage,
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
  global: 'Global',
  echelle: 'Échelle',
  signature: 'Signature',
  versements: 'Versements',
  souche: 'Souche',
  test: 'Test',
  testReel: 'Réel',
  test1: '1 vers.',
  test6: '6 vers.',
  resume: 'Résumé (copiable)',
} as const

/** Papier à en-tête, servi depuis `public/`. */
const CHEMIN_FOND = '/facturation/fond-facture.png'

/**
 * Affiché quand « Imprimer » est actionné pendant que le jeu de test (1 ou 6
 * versements) est actif : imprimer à ce moment-là enregistrerait un vrai
 * clic d'impression sur le reçu réel tout en sortant des données de test.
 */
const MESSAGE_TEST_VERSEMENTS_ACTIF =
  'Basculez sur « Réel » avant d’imprimer : ce reçu affiche actuellement le jeu de test.'

/** Pas des boutons +/− de l'atelier de calage, en millimètres. */
const PAS_MM = 0.5

/**
 * Champ numérique pas à pas de l'atelier de calage : saisie directe +
 * boutons +/−. Sert aussi bien aux décalages en millimètres (bornes ±10,
 * base 0) qu'à l'échelle en pourcentage (bornes 80-120, base 100) — seuls
 * `min`, `max` et `valeurParDefaut` changent d'un champ à l'autre.
 * Réservé à l'atelier de calage interne (voir `OUTILS`).
 *
 * `contexte` (le nom du bloc — Global, Échelle, Signature, Versements,
 * Souche) ne s'affiche pas : il ne sert qu'à distinguer les boutons +/− au
 * clavier ou au lecteur d'écran, sans quoi les champs de même libellé («
 * Y », par exemple) partageraient le même nom accessible.
 */
function ChampMm({
  contexte,
  label,
  valeur,
  onChange,
  min = -10,
  max = 10,
  unite = 'mm',
  valeurParDefaut = 0,
}: {
  contexte: string
  label: string
  valeur: string
  onChange: (valeur: string) => void
  min?: number
  max?: number
  unite?: string
  valeurParDefaut?: number
}) {
  const pas = (delta: number) => {
    // `Number(valeur) || valeurParDefaut` casserait sur une valeur actuelle
    // de 0 légitime (`0` est falsy) : pour l'échelle, dont le défaut est
    // 100, un + après être retombé à 0 serait alors traité comme partant de
    // 100 et non de 0. `Number.isFinite` distingue « pas un nombre » (chaîne
    // vide, saisie invalide) d'un zéro réel.
    const brut = Number(valeur)
    const nombre = Number.isFinite(brut) ? brut : valeurParDefaut
    onChange((Math.round((nombre + delta) * 10) / 10).toString())
  }
  const titre = `${contexte} ${label}`
  return (
    <label className="recu-champ-mm">
      {label}
      <button
        type="button"
        onClick={() => pas(-PAS_MM)}
        aria-label={`${titre} : moins ${PAS_MM} ${unite}`}
      >
        −
      </button>
      <input
        type="number"
        step={PAS_MM}
        min={min}
        max={max}
        title={titre}
        value={valeur}
        onChange={(evenement) => onChange(evenement.target.value)}
      />
      <button
        type="button"
        onClick={() => pas(PAS_MM)}
        aria-label={`${titre} : plus ${PAS_MM} ${unite}`}
      >
        +
      </button>
    </label>
  )
}

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
  /**
   * Décision du commanditaire (2026-08-08) : le panneau de calage (`OUTILS`)
   * est un outil de mise au point pour la véritable imprimante/le véritable
   * papier — réservé au slot 1. Un employé ne doit ni le voir, ni pouvoir
   * agir sur ses réglages, même indirectement (voir `variablesCalage`
   * appliqué plus bas, gardé lui aussi derrière ce drapeau).
   */
  estAdministrateur: boolean
}

export function EcranRecu({ recu, onRetour, onImpression, estAdministrateur }: Proprietes) {
  const donneesReelles = useMemo(() => preparerRecuImprimable(recu), [recu])

  const [sansFond, setSansFond] = useState(false)
  const [reperes, setReperes] = useState(false)
  const [reglages, setReglages] = useState<ReglagesCalage>(REGLAGES_CALAGE_PAR_DEFAUT)
  /**
   * Jeu de test à nombre fixe de versements (1 ou 6), pour vérifier qu'un
   * calage trouvé tient dans les deux cas — `null` affiche le vrai reçu.
   * Outil de calage uniquement, jamais utilisé pour un reçu réellement remis.
   */
  const [versementsTest, setVersementsTest] = useState<NombreVersementsTest | null>(null)
  const [message, setMessage] = useState('')
  const [envoi, setEnvoi] = useState(false)

  const donnees = versementsTest
    ? donneesAvecVersementsTest(donneesReelles, versementsTest)
    : donneesReelles

  const definirReglage = (cle: keyof ReglagesCalage) => (valeur: string) =>
    setReglages((actuel) => ({ ...actuel, [cle]: valeur }))

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
    // Le jeu de test (1/6 versements) remplace `donnees` par des paiements
    // fabriqués, mais `onImpression` enregistre toujours un vrai clic
    // d'impression pour CE reçu (compteur, date, auteur) : sans ce blocage,
    // imprimer en mode test créditerait le reçu réel d'une impression alors
    // que la page sortie de l'imprimante afficherait des données inventées.
    if (versementsTest !== null) {
      setMessage(MESSAGE_TEST_VERSEMENTS_ACTIF)
      return
    }
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
    <div className={classes} style={variablesCalage(reglages) as React.CSSProperties}>
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

      {/*
        Décision du commanditaire (2026-08-08) : le calage (positions,
        échelle, jeu de versements de test, aperçu sans fond/repères) est un
        outil de mise au point pour la vraie imprimante et le vrai papier —
        réservé au slot 1. Un employé n'a accès qu'au bouton d'impression lui-
        même, jamais aux réglages : `reglages`/`versementsTest`/`sansFond`/
        `reperes` restent alors bloqués à leur valeur vierge (aucun moyen de
        les modifier sans ce panneau), donc sans effet sur son impression.
      */}
      {estAdministrateur ? (
        <div className="recu-outils" aria-label="Outils de test">
          <strong>{OUTILS.titre}</strong>
          <button onClick={() => setSansFond(false)}>{OUTILS.apercuComplet}</button>
          <button onClick={() => setSansFond(true)}>{OUTILS.impressionSeule}</button>
          <button onClick={() => setReperes((actuel) => !actuel)}>{OUTILS.reperes}</button>

          <div className="recu-groupe">
            <span className="recu-groupe-titre">{OUTILS.global}</span>
            <ChampMm contexte={OUTILS.global} label="X" valeur={reglages.decalageX} onChange={definirReglage('decalageX')} />
            <ChampMm contexte={OUTILS.global} label="Y" valeur={reglages.decalageY} onChange={definirReglage('decalageY')} />
          </div>

          <button
            onClick={() => {
              setReglages(REGLAGES_CALAGE_PAR_DEFAUT)
              setVersementsTest(null)
            }}
          >
            {OUTILS.reinitialiser}
          </button>
          <button className="primary" onClick={imprimer} disabled={envoi}>
            {envoi ? <IndicateurChargement /> : null}
            {OUTILS.imprimer}
          </button>
          <span className="indication">{OUTILS.indication}</span>

          <div className="recu-atelier-avance">
            <div className="recu-groupe">
              <span className="recu-groupe-titre">{OUTILS.echelle}</span>
              <ChampMm
                contexte={OUTILS.echelle}
                label="%"
                valeur={reglages.echelle}
                onChange={definirReglage('echelle')}
                min={80}
                max={120}
                unite="%"
                valeurParDefaut={100}
              />
            </div>

            <div className="recu-groupe">
              <span className="recu-groupe-titre">{OUTILS.signature}</span>
              <ChampMm contexte={OUTILS.signature} label="X" valeur={reglages.signatureX} onChange={definirReglage('signatureX')} />
              <ChampMm contexte={OUTILS.signature} label="Y" valeur={reglages.signatureY} onChange={definirReglage('signatureY')} />
            </div>

            <div className="recu-groupe">
              <span className="recu-groupe-titre">{OUTILS.versements}</span>
              <ChampMm contexte={OUTILS.versements} label="X" valeur={reglages.versementsX} onChange={definirReglage('versementsX')} />
              <ChampMm contexte={OUTILS.versements} label="Y" valeur={reglages.versementsY} onChange={definirReglage('versementsY')} />
            </div>

            <div className="recu-groupe">
              <span className="recu-groupe-titre">{OUTILS.souche}</span>
              <ChampMm contexte={OUTILS.souche} label="X" valeur={reglages.soucheX} onChange={definirReglage('soucheX')} />
              <ChampMm contexte={OUTILS.souche} label="Y" valeur={reglages.soucheY} onChange={definirReglage('soucheY')} />
            </div>

            <div className="recu-groupe recu-test-versements">
              <span className="recu-groupe-titre">{OUTILS.test}</span>
              <button
                className={versementsTest === null ? 'active' : undefined}
                onClick={() => setVersementsTest(null)}
              >
                {OUTILS.testReel}
              </button>
              <button
                className={versementsTest === 1 ? 'active' : undefined}
                onClick={() => setVersementsTest(1)}
              >
                {OUTILS.test1}
              </button>
              <button
                className={versementsTest === 6 ? 'active' : undefined}
                onClick={() => setVersementsTest(6)}
              >
                {OUTILS.test6}
              </button>
            </div>

            <label className="recu-champ-mm" style={{ flex: '1 1 260px', alignItems: 'flex-start' }}>
              {OUTILS.resume}
              <textarea
                readOnly
                className="recu-atelier-resume"
                value={resumeReglagesCalage(reglages)}
                onFocus={(evenement) => evenement.currentTarget.select()}
              />
            </label>
          </div>
        </div>
      ) : (
        <div className="recu-outils recu-outils-employe" aria-label="Impression">
          <button className="primary" onClick={imprimer} disabled={envoi}>
            {envoi ? <IndicateurChargement /> : null}
            {OUTILS.imprimer}
          </button>
        </div>
      )}

      {/*
        Un écran dit ce qu'il en est immédiatement, sans qu'il faille tenter
        l'action pour l'apprendre (règle appliquée partout dans l'appli).
        Décision du commanditaire (2026-08-11) : cette anomalie s'affiche
        donc dès l'ouverture, pour les deux rôles — avant, seul le poste 1 la
        voyait, l'employé ne l'apprenait qu'après avoir cliqué Imprimer et
        s'être vu refuser l'impression.
      */}
      {donnees.depassement ? (
        <div
          role="alert"
          style={{
            padding: '10px 14px',
            background: '#9c3b32',
            color: '#fff',
            fontSize: 12.5,
          }}
        >
          {donnees.messageDepassement}
        </div>
      ) : null}

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
