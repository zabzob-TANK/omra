'use client'

/**
 * Fenêtre « Récapitulatif avant validation ».
 *
 * Précision du commanditaire (2026-08-09), qui remplace une première
 * proposition à base de liste des champs modifiés : la fiche complète du
 * reçu s'affiche deux fois côte à côte — à droite l'état actuel enregistré,
 * à gauche l'état après modification — avec toutes les informations, y
 * compris celles qui ne changent pas. Les champs modifiés sont mis en
 * évidence par la couleur, des deux côtés. Vaut pour toutes les
 * modifications sans exception (montant, méthode, instrument, données
 * commerciales, données personnelles, dossier).
 *
 * Rien n'est écrit avant validation depuis cette vue (`onConfirmer` est le
 * seul point d'écriture). Si le serveur refuse, la fiche actuelle reste
 * inchangée à l'écran et la raison du refus s'affiche ici.
 */

import { useState } from 'react'

import { NATURE_CHEQUE, NATURE_ESPECES, NATURE_VIREMENT } from '../../domain/constants'
import { natureNormalisee } from '../../domain/payment-method'
import type { ErreurValidation, Resultat } from '../../domain/rules/errors'
import type { ResultatModification } from '../../domain/rules/edit-sections'
import type { Recu, Versement } from '../../domain/types'
import { Dialogue } from '../dialogue'
import { IndicateurChargement } from '../spinner'
import { ListeErreurs } from '../champs'
import { DateValeur, Montant, Reference, Telephone, TexteArabe } from '../bidi'
import { T } from '../textes'

type ChampCarte =
  | 'prenom'
  | 'nom'
  | 'telephone'
  | 'hotel'
  | 'vol'
  | 'chambre'
  | 'tarif'
  | 'reduction'
  | 'convenu'
  | 'groupe'
  | 'note'

/** Le rabatteur n'entre jamais dans cet ensemble : jamais modifiable (R-54). */
function champsChanges(avant: Recu, apres: Recu): Set<ChampCarte> {
  const changes = new Set<ChampCarte>()
  if (avant.prenom !== apres.prenom) changes.add('prenom')
  if (avant.nom !== apres.nom) changes.add('nom')
  if (avant.telephone !== apres.telephone) changes.add('telephone')
  if (avant.hotel !== apres.hotel) changes.add('hotel')
  if (avant.vol !== apres.vol) changes.add('vol')
  if (avant.chambre !== apres.chambre) changes.add('chambre')
  if (avant.tarifCentimes !== apres.tarifCentimes) changes.add('tarif')
  if (avant.reductionCentimes !== apres.reductionCentimes) changes.add('reduction')
  if (avant.convenuCentimes !== apres.convenuCentimes) changes.add('convenu')
  if (avant.groupe !== apres.groupe) changes.add('groupe')
  if (avant.note !== apres.note) changes.add('note')
  return changes
}

type ChampVersement = 'montant' | 'nature' | 'reference' | 'banque' | 'dateInstrument' | 'payeur'

function champsVersementChanges(avant: Versement | null, apres: Versement | null): Set<ChampVersement> {
  const changes = new Set<ChampVersement>()
  if (!avant || !apres) return changes
  if (avant.montantCentimes !== apres.montantCentimes) changes.add('montant')
  if (avant.nature !== apres.nature) changes.add('nature')
  if (avant.referenceInstrument !== apres.referenceInstrument) changes.add('reference')
  if (avant.dateInstrument !== apres.dateInstrument) changes.add('dateInstrument')
  if (avant.banque !== apres.banque) changes.add('banque')
  if (avant.payeur !== apres.payeur) changes.add('payeur')
  return changes
}

function libelleNature(valeur: string): string {
  const nature = natureNormalisee(valeur)
  if (nature === NATURE_ESPECES) return T.methodes.especes
  if (nature === NATURE_CHEQUE) return T.methodes.cheque
  if (nature === NATURE_VIREMENT) return T.methodes.virement
  return valeur
}

/** Ligne « étiquette / valeur », surlignée quand le champ a changé. */
function Ligne({
  label,
  changee,
  children,
}: {
  label: string
  changee: boolean
  children: React.ReactNode
}) {
  return (
    <div className={`recap-ligne${changee ? ' recap-ligne-changee' : ''}`}>
      <span className="recap-ligne-label">{label}</span>
      <span className="recap-ligne-valeur">{children}</span>
    </div>
  )
}

function BlocVersement({
  rang,
  versement,
  changes,
}: {
  rang: number
  versement: Versement | null
  changes: Set<ChampVersement>
}) {
  if (!versement) return null
  const especes = natureNormalisee(versement.nature) === NATURE_ESPECES
  return (
    <div className={`recap-bloc-versement${changes.size ? ' recap-bloc-versement-changee' : ''}`}>
      <div className="recap-bloc-titre">{T.modification.versementNumero(rang)}</div>
      <Ligne label={T.recapitulatif.montant} changee={changes.has('montant')}>
        <Montant centimes={versement.montantCentimes} />
      </Ligne>
      <Ligne label={T.nouveau.methode} changee={changes.has('nature')}>
        <TexteArabe>{libelleNature(versement.nature)}</TexteArabe>
      </Ligne>
      {!especes ? (
        <>
          <Ligne label={T.instrument.reference} changee={changes.has('reference')}>
            <Reference>{versement.referenceInstrument || T.recapitulatif.aucun}</Reference>
          </Ligne>
          <Ligne label={T.instrument.banque} changee={changes.has('banque')}>
            <TexteArabe>{versement.banque || T.recapitulatif.aucun}</TexteArabe>
          </Ligne>
          <Ligne label={T.instrument.dateOperation} changee={changes.has('dateInstrument')}>
            <DateValeur>{versement.dateInstrument || T.recapitulatif.aucun}</DateValeur>
          </Ligne>
          {versement.portee === 'shared' ? (
            <Ligne label={T.instrument.payeur} changee={changes.has('payeur')}>
              <TexteArabe>{versement.payeur || T.recapitulatif.aucun}</TexteArabe>
            </Ligne>
          ) : null}
        </>
      ) : null}
    </div>
  )
}

function Fiche({
  titre,
  recu,
  changes,
  rangVersement,
  versement,
  changesVersement,
}: {
  titre: string
  recu: Recu
  changes: Set<ChampCarte>
  rangVersement: number | null
  versement: Versement | null
  changesVersement: Set<ChampVersement>
}) {
  return (
    <div className="recap-fiche">
      <div className="recap-fiche-titre">{titre}</div>
      <Ligne label={T.detail.numeroRecu} changee={false}>
        <Reference>{recu.numero}</Reference>
      </Ligne>
      <Ligne label={T.recapitulatif.prenom} changee={changes.has('prenom')}>
        <TexteArabe>{recu.prenom}</TexteArabe>
      </Ligne>
      <Ligne label={T.recapitulatif.nom} changee={changes.has('nom')}>
        <TexteArabe>{recu.nom}</TexteArabe>
      </Ligne>
      <Ligne label={T.detail.telephone} changee={changes.has('telephone')}>
        <Telephone>{recu.telephone}</Telephone>
      </Ligne>
      <Ligne label={T.detail.hotel} changee={changes.has('hotel')}>
        <TexteArabe>{recu.hotel}</TexteArabe>
      </Ligne>
      <Ligne label={T.detail.vol} changee={changes.has('vol')}>
        <TexteArabe>{recu.vol}</TexteArabe>
      </Ligne>
      <Ligne label={T.detail.chambre} changee={changes.has('chambre')}>
        <Reference>{recu.chambre}</Reference>
      </Ligne>
      <Ligne label={T.detail.prixOrigine} changee={changes.has('tarif')}>
        <Montant centimes={recu.tarifCentimes} />
      </Ligne>
      <Ligne label={T.detail.reduction} changee={changes.has('reduction')}>
        <Montant centimes={recu.reductionCentimes} />
      </Ligne>
      <Ligne label={T.detail.convenu} changee={changes.has('convenu')}>
        <Montant centimes={recu.convenuCentimes} />
      </Ligne>
      <Ligne label={T.detail.rabatteur} changee={false}>
        <TexteArabe>{recu.rabatteur || T.recapitulatif.aucun}</TexteArabe>
      </Ligne>
      <Ligne label={T.detail.groupe} changee={changes.has('groupe')}>
        <TexteArabe>{recu.groupe || T.recapitulatif.aucun}</TexteArabe>
      </Ligne>
      <Ligne label={T.detail.note} changee={changes.has('note')}>
        <TexteArabe>{recu.note || T.recapitulatif.aucun}</TexteArabe>
      </Ligne>
      {rangVersement ? (
        <BlocVersement rang={rangVersement} versement={versement} changes={changesVersement} />
      ) : null}
    </div>
  )
}

interface Proprietes {
  avant: Recu
  apres: Recu
  resultat: ResultatModification
  onRetour: () => void
  onConfirmer: () => Promise<Resultat<null>>
}

export function ModaleRecapitulatif({ avant, apres, resultat, onRetour, onConfirmer }: Proprietes) {
  // Même garde locale que ModaleDepassement : cette fenêtre remplace
  // entièrement ModaleModification pendant l'écriture, qui ne peut donc pas
  // désactiver ses propres boutons — sans ce garde, un double clic sur
  // « confirmer » enverrait deux écritures pour une seule confirmation.
  const [enCours, setEnCours] = useState(false)
  const [erreurs, setErreurs] = useState<ErreurValidation[]>([])

  const changes = champsChanges(avant, apres)
  const rang = resultat.premierVersementCorrige?.versement.rang ?? null
  const versementAvant = rang ? (avant.versements.find((v) => v.rang === rang) ?? null) : null
  const versementApres = rang ? (apres.versements.find((v) => v.rang === rang) ?? null) : null
  const changesVersement = champsVersementChanges(versementAvant, versementApres)

  const retour = () => {
    if (enCours) return
    onRetour()
  }

  const confirmer = async () => {
    if (enCours) return
    setEnCours(true)
    const resultatEcriture = await onConfirmer()
    setEnCours(false)
    // 'ok' : le parent ferme toute la fenêtre de modification (comportement
    // déjà en place pour onEnregistrer). Rien à faire ici dans ce cas.
    if (resultatEcriture.statut === 'erreurs') {
      setErreurs(resultatEcriture.erreurs)
    }
  }

  return (
    <Dialogue
      titre={T.recapitulatif.titre}
      taille="large"
      onFermer={retour}
      classeCoque="recap-coque"
      pied={
        <>
          <button className="omra-btn" onClick={retour} disabled={enCours}>
            {T.recapitulatif.retour}
          </button>
          <button className="omra-btn primary" onClick={confirmer} disabled={enCours}>
            {enCours ? <IndicateurChargement /> : null}
            {T.recapitulatif.confirmer}
          </button>
        </>
      }
    >
      <ListeErreurs erreurs={erreurs} />
      <p className="omra-hint">{T.recapitulatif.consigne}</p>
      <div className="recap-grille" dir="rtl">
        <Fiche
          titre={T.recapitulatif.etatActuel}
          recu={avant}
          changes={changes}
          rangVersement={rang}
          versement={versementAvant}
          changesVersement={changesVersement}
        />
        <Fiche
          titre={T.recapitulatif.etatApres}
          recu={apres}
          changes={changes}
          rangVersement={rang}
          versement={versementApres}
          changesVersement={changesVersement}
        />
      </div>
    </Dialogue>
  )
}
