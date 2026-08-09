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
 * Réservé à l'administrateur de facturation (poste 1) : `application.tsx` ne
 * rend cette fenêtre, ni le bouton qui l'ouvre, que si `estAdministrateur`.
 * La RPC (`require_facturation_admin`) refuse aussi tout autre poste.
 */

import { useEffect, useMemo, useState } from 'react'

import { cleJour, dateFrDepuisCleJour } from '../../domain/dates'
import { limitesSemaine, semaineDecalee } from '../../domain/rules/operations-journal'
import type { LigneJournalOperations, PageJournalOperations, SemaineJournal } from '../../domain/types'
import type { FiltresJournalOperations } from '../../data/ports'
import { DateValeur, Reference, TexteArabe } from '../bidi'
import { Dialogue } from '../dialogue'
import { IndicateurChargement } from '../spinner'
import { T } from '../textes'

const TAILLE_PAGE = 100

export function ModaleJournal({
  onCharger,
  onFermer,
}: {
  onCharger: (filtres: FiltresJournalOperations) => Promise<PageJournalOperations>
  onFermer: () => void
}) {
  const [semaine, setSemaine] = useState<SemaineJournal>(() => limitesSemaine(cleJour(new Date())))
  const [employeSlot, setEmployeSlot] = useState<number | null>(null)
  const [typeAction, setTypeAction] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const [donnees, setDonnees] = useState<PageJournalOperations | null>(null)
  const [chargement, setChargement] = useState(true)
  const [enErreur, setEnErreur] = useState(false)

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
        <div className="journal-barre">
          <div className="journal-semaine">
            <button
              type="button"
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
              className="journal-fleche"
              title={T.journal.semaineSuivante}
              onClick={() => setSemaine((s) => semaineDecalee(s, 1))}
            >
              ‹
            </button>
          </div>

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
          </div>
        </div>
      }
      pied={
        totalLignes > TAILLE_PAGE ? (
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
      {chargement ? (
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
      )}
    </Dialogue>
  )
}

function LigneJournal({ ligne }: { ligne: LigneJournalOperations }) {
  return (
    <div className="journal-ligne">
      <div className="journal-ligne-entete">
        <span className="journal-heure mono" dir="ltr">
          {ligne.date} {ligne.heure}
        </span>
        <span className="journal-action">
          <TexteArabe>{ligne.nature}</TexteArabe>
        </span>
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
      {ligne.motif ? (
        <div className="journal-motif">
          <TexteArabe>{ligne.motif}</TexteArabe>
        </div>
      ) : null}
    </div>
  )
}
