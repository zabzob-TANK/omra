'use client'

/**
 * Fenêtre « Journal des opérations » (سجل العمليات).
 *
 * R-86 — Chaque action laisse une trace, la plus récente en tête. Description
 * complète du commanditaire (2026-08-09), qui remplace tout ce qui existait
 * avant sur cet écran : vue unique par semaine (lundi–dimanche), semaine en
 * cours à l'ouverture, deux flèches seulement — pas de sélecteur de date, pas
 * de période libre. Flèches en sens RTL naturel : contrairement au sélecteur
 * de jour du Journal financier (`finance.tsx`, délibérément forcé en
 * `direction: ltr`), cette barre reste en RTL naturel — la flèche « semaine
 * précédente » se retrouve donc à droite (`›`), « semaine suivante » à gauche
 * (`‹`), sans aucune inversion de direction CSS.
 *
 * Deux onglets (2026-08-09, demande du commanditaire) :
 *  - العمليات — la liste plate de toutes les actions, comme avant ;
 *  - الجلسات — connexions et déconnexions appariées par personne
 *    (`apparierSessions`), pour voir à quelle heure quelqu'un s'est connecté
 *    et à quelle heure il s'est déconnecté sans avoir à rapprocher soi-même
 *    deux lignes séparées.
 *
 * Réservé à l'administrateur de facturation (poste 1) : `application.tsx` ne
 * rend cette fenêtre, ni le bouton qui l'ouvre, que si `estAdministrateur`.
 * La RPC (`require_facturation_admin`) refuse aussi tout autre poste.
 */

import { useEffect, useMemo, useState } from 'react'

import { cleJour, dateFrDepuisCleJour } from '../../domain/dates'
import {
  apparierSessions,
  limitesSemaine,
  semaineDecalee,
  type SessionEmploye,
} from '../../domain/rules/operations-journal'
import type { LigneJournalOperations, PageJournalOperations, SemaineJournal } from '../../domain/types'
import type { FiltresJournalOperations } from '../../data/ports'
import { DateValeur, Reference, TexteArabe } from '../bidi'
import { Dialogue } from '../dialogue'
import { IndicateurChargement } from '../spinner'
import { T } from '../textes'

const TAILLE_PAGE = 100
const LIMITE_SESSIONS = 500

type Onglet = 'operations' | 'sessions'

const TYPE_CREATION = 'billing_receipt.created'
const TYPE_ANNULATION = 'billing_receipt.cancelled'
const TYPE_VERSEMENT_1 = 'billing_receipt.first_payment_added'
const TYPE_VERSEMENT_N = 'billing_receipt.payment_added'
const TYPE_CONNEXION_ECHOUEE = 'facturation_session.login_failed'
const TYPE_CONNEXION_REUSSIE = 'facturation_session.login_succeeded'
const TYPE_DECONNEXION = 'facturation_session.logout'

type CategorieLigne = 'negative' | 'modification' | 'creation' | 'versement' | 'connexion' | 'neutre'

/**
 * Purement visuel : quel liseré de couleur et quelle icône, jamais une
 * distinction métier. Retour du commanditaire (2026-08-10) : création et
 * versement doivent se distinguer l'un de l'autre, pas seulement du reste —
 * six catégories désormais, pas trois.
 */
function categorieLigne(ligne: LigneJournalOperations): CategorieLigne {
  if (ligne.typeAction === TYPE_ANNULATION || ligne.typeAction === TYPE_CONNEXION_ECHOUEE) return 'negative'
  if (ligne.changements.length > 0) return 'modification'
  if (ligne.typeAction === TYPE_CREATION) return 'creation'
  if (ligne.typeAction === TYPE_VERSEMENT_1 || ligne.typeAction === TYPE_VERSEMENT_N) return 'versement'
  if (ligne.typeAction === TYPE_CONNEXION_REUSSIE || ligne.typeAction === TYPE_DECONNEXION) return 'connexion'
  return 'neutre'
}

/**
 * Icône par nature de l'action, jamais par couleur : une annulation reste une
 * opération financière (icône reçu, liseré rouge) — seule une connexion,
 * réussie ou non, porte l'icône porte. Trois formes seulement : reçu, pièce,
 * porte. Pictogramme, jamais un texte, pour distinguer une opération
 * financière d'une connexion au premier regard (demande du commanditaire).
 */
function IconeLigne({ ligne }: { ligne: LigneJournalOperations }) {
  if (ligne.typeAction.startsWith('facturation_session.')) {
    return (
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="4" y="3" width="16" height="18" rx="1.5" />
        <circle cx="14" cy="12" r="1" fill="currentColor" stroke="none" />
      </svg>
    )
  }
  if (ligne.typeAction === TYPE_VERSEMENT_1 || ligne.typeAction === TYPE_VERSEMENT_N) {
    return (
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="8" />
        <path d="M12 8v8M9.5 10a2 2 0 0 1 2-1.5h1a2 2 0 0 1 0 4h-1a2 2 0 0 0 0 4h1a2 2 0 0 0 2-1.5" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <line x1="8" y1="8" x2="16" y2="8" />
      <line x1="8" y1="12" x2="16" y2="12" />
      <line x1="8" y1="16" x2="13" y2="16" />
    </svg>
  )
}

function dureeLisible(minutes: number): string {
  if (minutes < 60) return `${minutes} د`
  const heures = Math.floor(minutes / 60)
  const reste = minutes % 60
  return reste === 0 ? `${heures} س` : `${heures} س ${reste} د`
}

export function ModaleJournal({
  onCharger,
  onFermer,
}: {
  onCharger: (filtres: FiltresJournalOperations) => Promise<PageJournalOperations>
  onFermer: () => void
}) {
  const [onglet, setOnglet] = useState<Onglet>('operations')
  const [semaine, setSemaine] = useState<SemaineJournal>(() => limitesSemaine(cleJour(new Date())))
  const [employeSlot, setEmployeSlot] = useState<number | null>(null)
  const [typeAction, setTypeAction] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const [donnees, setDonnees] = useState<PageJournalOperations | null>(null)
  const [chargement, setChargement] = useState(true)
  const [enErreur, setEnErreur] = useState(false)

  const [sessions, setSessions] = useState<SessionEmploye[] | null>(null)
  const [chargementSessions, setChargementSessions] = useState(true)
  const [sessionsEnErreur, setSessionsEnErreur] = useState(false)

  // Revenir à la première page à chaque changement de semaine ou de filtre —
  // sinon une page 3 déjà ouverte pourrait se retrouver hors bornes.
  useEffect(() => {
    setPage(0)
  }, [semaine, employeSlot, typeAction])

  useEffect(() => {
    let annule = false
    setChargement(true)
    setEnErreur(false)
    onCharger({
      semaine,
      employeSlot,
      typeAction,
      limite: TAILLE_PAGE,
      decalage: page * TAILLE_PAGE,
    })
      .then((resultat) => {
        if (!annule) setDonnees(resultat)
      })
      .catch(() => {
        if (!annule) setEnErreur(true)
      })
      .finally(() => {
        if (!annule) setChargement(false)
      })
    return () => {
      annule = true
    }
  }, [onCharger, semaine, employeSlot, typeAction, page])

  // Chargé seulement quand l'onglet est actif — pas besoin des connexions et
  // déconnexions tant que personne ne regarde cet onglet.
  useEffect(() => {
    if (onglet !== 'sessions') return
    let annule = false
    setChargementSessions(true)
    setSessionsEnErreur(false)
    Promise.all([
      onCharger({ semaine, employeSlot, typeAction: TYPE_CONNEXION_REUSSIE, limite: LIMITE_SESSIONS, decalage: 0 }),
      onCharger({ semaine, employeSlot, typeAction: TYPE_DECONNEXION, limite: LIMITE_SESSIONS, decalage: 0 }),
    ])
      .then(([connexions, deconnexions]) => {
        if (!annule) setSessions(apparierSessions(connexions.lignes, deconnexions.lignes))
      })
      .catch(() => {
        if (!annule) setSessionsEnErreur(true)
      })
      .finally(() => {
        if (!annule) setChargementSessions(false)
      })
    return () => {
      annule = true
    }
  }, [onCharger, onglet, semaine, employeSlot])

  // Dérivées de la page chargée, pas d'une liste séparée à maintenir à jour :
  // un employé ou un type absent de la semaine affichée n'encombre pas les
  // menus. Peut manquer un employé présent seulement sur une autre page de
  // la même semaine — limite mineure, jamais une donnée fausse.
  const employesDisponibles = useMemo(() => {
    const vus = new Map<number, string>()
    for (const ligne of donnees?.lignes ?? []) {
      // Un échec de connexion n'a pas de poste (employeSlot null) : rien à
      // proposer dans ce filtre pour cette ligne-là.
      if (ligne.employeSlot !== null) vus.set(ligne.employeSlot, ligne.employe)
    }
    return [...vus.entries()].sort((a, b) => a[0] - b[0])
  }, [donnees])

  const typesDisponibles = useMemo(() => {
    const vus = new Map<string, string>()
    for (const ligne of donnees?.lignes ?? []) vus.set(ligne.typeAction, ligne.nature)
    return [...vus.entries()].sort((a, b) => a[1].localeCompare(b[1], 'ar'))
  }, [donnees])

  const lignes = donnees?.lignes ?? []
  const totalLignes = donnees?.totalLignes ?? 0
  const derniereePage = totalLignes > 0 ? Math.ceil(totalLignes / TAILLE_PAGE) - 1 : 0

  return (
    <Dialogue
      titre={T.journal.titre}
      taille="large"
      classeCoque="journal-coque"
      onFermer={onFermer}
      bandeau={
        <div className="journal-bandeau">
          <div className="journal-onglets" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={onglet === 'operations'}
              className={`journal-onglet${onglet === 'operations' ? ' actif' : ''}`}
              onClick={() => setOnglet('operations')}
            >
              {T.journal.ongletOperations}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={onglet === 'sessions'}
              className={`journal-onglet${onglet === 'sessions' ? ' actif' : ''}`}
              onClick={() => setOnglet('sessions')}
            >
              {T.journal.ongletSessions}
            </button>
          </div>

          <div className="journal-barre">
            <div className="journal-semaine">
              {/* Retour du commanditaire (2026-08-09) : la position était bonne,
                  le dessin du chevron ne l'était pas — le moteur de rendu
                  applique le miroir bidi Unicode à ‹/› à l'intérieur d'un
                  contexte RTL (comme les parenthèses). `dir="ltr"` isole
                  chaque glyphe de ce contexte pour qu'il garde sa forme
                  d'origine : › pointe vraiment vers la droite, ‹ vraiment
                  vers la gauche. */}
              <button
                type="button"
                dir="ltr"
                className="journal-fleche"
                title={T.journal.semainePrecedente}
                onClick={() => setSemaine((s) => semaineDecalee(s, -1))}
              >
                ›
              </button>
              <span className="journal-semaine-libelle">
                <DateValeur>{dateFrDepuisCleJour(semaine.debut)}</DateValeur>
                {' – '}
                <DateValeur>{dateFrDepuisCleJour(semaine.fin)}</DateValeur>
              </span>
              <button
                type="button"
                dir="ltr"
                className="journal-fleche"
                title={T.journal.semaineSuivante}
                onClick={() => setSemaine((s) => semaineDecalee(s, 1))}
              >
                ‹
              </button>
            </div>

            <div className="journal-separateur" aria-hidden="true" />

            <div className="journal-filtres">
              <div className="journal-champ">
                <label htmlFor="journal-employe">{T.journal.employe}</label>
                <select
                  id="journal-employe"
                  value={employeSlot ?? ''}
                  onChange={(evenement) =>
                    setEmployeSlot(evenement.target.value ? Number(evenement.target.value) : null)
                  }
                >
                  <option value="">{T.journal.tousLesEmployes}</option>
                  {employesDisponibles.map(([slot, libelle]) => (
                    <option key={slot} value={slot}>
                      {libelle}
                    </option>
                  ))}
                </select>
              </div>
              {onglet === 'operations' ? (
                <div className="journal-champ">
                  <label htmlFor="journal-type">{T.journal.typeOperation}</label>
                  <select
                    id="journal-type"
                    value={typeAction ?? ''}
                    onChange={(evenement) => setTypeAction(evenement.target.value || null)}
                  >
                    <option value="">{T.journal.tousLesTypes}</option>
                    {typesDisponibles.map(([type, libelle]) => (
                      <option key={type} value={type}>
                        {libelle}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      }
      pied={
        onglet === 'operations' && totalLignes > TAILLE_PAGE ? (
          <div className="journal-pagination">
            <button type="button" disabled={page <= 0} onClick={() => setPage((p) => p - 1)}>
              {T.journal.pagePrecedente}
            </button>
            <span className="mono" dir="ltr">
              {page + 1} / {derniereePage + 1}
            </span>
            <button type="button" disabled={page >= derniereePage} onClick={() => setPage((p) => p + 1)}>
              {T.journal.pageSuivante}
            </button>
          </div>
        ) : null
      }
    >
      {onglet === 'operations' ? (
        chargement ? (
          <IndicateurChargement />
        ) : enErreur ? (
          <p className="journal-vide">{T.journal.erreur}</p>
        ) : lignes.length === 0 ? (
          <p className="journal-vide">{T.journal.vide}</p>
        ) : (
          <div className="journal-liste">
            {lignes.map((ligne) => (
              <LigneJournal key={ligne.id} ligne={ligne} />
            ))}
          </div>
        )
      ) : chargementSessions ? (
        <IndicateurChargement />
      ) : sessionsEnErreur ? (
        <p className="journal-vide">{T.journal.erreur}</p>
      ) : !sessions || sessions.length === 0 ? (
        <p className="journal-vide">{T.journal.videSessions}</p>
      ) : (
        <table className="journal-tableau-sessions">
          <thead>
            <tr>
              <th>{T.journal.employe}</th>
              <th>{T.journal.connexion}</th>
              <th>{T.journal.deconnexion}</th>
              <th>{T.journal.duree}</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((session) => (
              <tr key={session.id}>
                <td>
                  <TexteArabe>{session.employe}</TexteArabe>
                </td>
                <td className="mono" dir="ltr">
                  {session.connexionDate
                    ? `${session.connexionDate} ${session.connexionHeure}`
                    : T.journal.connecteAvantLaSemaine}
                </td>
                <td className="mono" dir="ltr">
                  {session.deconnexionDate
                    ? `${session.deconnexionDate} ${session.deconnexionHeure}`
                    : T.journal.pasEncoreDeconnecte}
                </td>
                <td className="mono" dir="ltr">
                  {session.dureeMinutes !== undefined ? dureeLisible(session.dureeMinutes) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Dialogue>
  )
}

function LigneJournal({ ligne }: { ligne: LigneJournalOperations }) {
  return (
    <div className={`journal-ligne journal-ligne-${categorieLigne(ligne)}`}>
      <div className="journal-ligne-entete">
        <span className="journal-icone">
          <IconeLigne ligne={ligne} />
        </span>
        <span className="journal-heure mono" dir="ltr">
          <span className="journal-heure-date">{ligne.date}</span>
          <span className="journal-heure-h">{ligne.heure}</span>
        </span>
        <span className="journal-action">
          <TexteArabe>{ligne.nature}</TexteArabe>
        </span>
        <span className="journal-corps">
          {ligne.numeroRecu ? (
            <span className="journal-recu">
              <Reference>{ligne.numeroRecu}</Reference>
            </span>
          ) : null}
          {ligne.client ? (
            <span className="journal-client">
              <TexteArabe>{ligne.client}</TexteArabe>
            </span>
          ) : null}
        </span>
        <span className="journal-employe">
          <TexteArabe>{ligne.employe}</TexteArabe>
        </span>
      </div>
      {ligne.changements.length > 0 ? (
        <div className="journal-changements">
          {ligne.changements.map((changement, index) => (
            <div className="finance-changement" key={index}>
              <span className="champ">
                <TexteArabe>{changement.champ}</TexteArabe>
              </span>
              <span className="ancienne">{changement.ancienne || '—'}</span>
              <span className="fleche">→</span>
              <span className="nouvelle">{changement.nouvelle || '—'}</span>
            </div>
          ))}
        </div>
      ) : null}
      {/* Règle du 2026-08-10 : jamais un texte ou un nombre nu sans préfixe —
          motif et identifiant tenté ne partagent pas le même préfixe, ce ne
          sont pas la même chose (l'un est saisi par un utilisateur
          authentifié, l'autre non). */}
      {ligne.motif ? (
        <div className="journal-motif">
          <span className="journal-motif-prefixe">{T.detail.motifPrefixe}</span>{' '}
          <TexteArabe>{ligne.motif}</TexteArabe>
        </div>
      ) : null}
      {ligne.identifiantTente ? (
        <div className="journal-motif">
          <span className="journal-motif-prefixe">{T.journal.identifiantTentePrefixe}</span>{' '}
          <span dir="ltr">{ligne.identifiantTente}</span>
        </div>
      ) : null}
    </div>
  )
}
