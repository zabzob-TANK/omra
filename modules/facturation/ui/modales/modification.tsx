'use client'

/**
 * Fenêtre « Modifier le reçu ».
 *
 * R-49 — Une seule section à la fois. On choisit d'abord la section, puis on
 * saisit ; pour en modifier une autre, il faut rouvrir la fenêtre.
 * R-50 — Le motif est toujours obligatoire.
 * R-54, R-55 — L'intermédiaire, les montants et les versements suivants ne sont
 * jamais modifiables ; l’écran le rappelle explicitement.
 */

import { useState } from 'react'

import { NATURE_CHEQUE, NATURE_ESPECES, NATURE_VIREMENT } from '../../domain/constants'
import { formaterDate, formaterMontant, formaterTelephone, nettoyerArabe } from '../../domain/format'
import { centimesEnDirhamsSaisis, dirhamsSaisisEnCentimes } from '../../domain/money'
import type { ErreurValidation, Resultat } from '../../domain/rules/errors'
import {
  LIBELLES_SECTIONS,
  premierVersementModifiable,
  type SaisieModification,
} from '../../domain/rules/edit-sections'
import { totalPaye } from '../../domain/rules/receipt'
import { construireGrille, montantConvenu } from '../../domain/rules/tarif'
import type { Recu, SectionModifiable, Tarif } from '../../domain/types'
import { CaseACocher, Champ, enErreur, ListeErreurs, Saisie, Selection, Zone } from '../champs'
import { Dialogue } from '../dialogue'
import { ModaleDepassement } from './depassement'
import { Montant } from '../bidi'
import { T } from '../textes'

/** Sous-titres des sections, repris du fichier de référence. */
const DESCRIPTIONS: Record<SectionModifiable, string> = {
  identity: T.modification.sections.identity.sousTitre,
  contact: T.modification.sections.contact.sousTitre,
  program: T.modification.sections.program.sousTitre,
  group: T.modification.sections.group.sousTitre,
  note: T.modification.sections.note.sousTitre,
  firstPayment: T.modification.sections.firstPayment.sousTitre,
}

interface Proprietes {
  recu: Recu
  referentiels: {
    hotels: { id: string; nom: string }[]
    vols: { id: string; nom: string }[]
    chambres: { id: string; code: string }[]
    tarifs: Tarif[]
  }
  /** §5.9 — seul un administrateur peut corriger le montant du 1er versement. */
  estAdministrateur: boolean
  onFermer: () => void
  onEnregistrer: (saisie: SaisieModification, confirme: boolean) => Promise<Resultat<null>>
}

function saisieInitiale(recu: Recu): SaisieModification {
  const premier = recu.versements[0]
  return {
    section: '',
    motif: '',
    prenom: recu.prenom,
    nom: recu.nom,
    telephone: recu.telephone,
    hotel: recu.hotel,
    vol: recu.vol,
    chambre: recu.chambre,
    reduction: centimesEnDirhamsSaisis(recu.reductionCentimes),
    groupeCoche: Boolean(recu.groupe),
    groupe: recu.groupe,
    note: recu.note,
    nature: premier?.nature ?? NATURE_ESPECES,
    reference: premier?.referenceInstrument ?? '',
    dateInstrument: premier?.dateInstrument ?? '',
    banque: premier?.banque ?? '',
    operationPartagee: premier?.portee === 'shared',
    payeur: premier?.payeur ?? '',
    montantOperation: premier ? centimesEnDirhamsSaisis(premier.montantOperationCentimes) : '',
    // §5.9 — vide : aucune correction du montant demandée.
    montant: '',
  }
}

export function ModaleModification({
  recu,
  referentiels,
  estAdministrateur,
  onFermer,
  onEnregistrer,
}: Proprietes) {
  const [saisie, setSaisie] = useState<SaisieModification>(saisieInitiale(recu))
  const [erreurs, setErreurs] = useState<ErreurValidation[]>([])
  const [envoi, setEnvoi] = useState(false)
  const [depassement, setDepassement] = useState<{ montant: number; disponible: number } | null>(
    null,
  )

  const modifier = (patch: Partial<SaisieModification>) => setSaisie({ ...saisie, ...patch })
  const section = saisie.section
  const versementPartage = !premierVersementModifiable(recu)
  const premierVersement = recu.versements[0]

  // Récapitulatif de la section « programme » : le fichier recalcule le prix à
  // chaque changement et rappelle que le montant déjà payé ne bouge pas.
  const grille = construireGrille(referentiels.tarifs)
  const tarif = grille.tarifPour(saisie.hotel, saisie.vol, saisie.chambre)
  const reductionCentimes = dirhamsSaisisEnCentimes(saisie.reduction)
  const convenu = tarif === null ? null : montantConvenu(tarif, reductionCentimes)

  const soumettre = async (confirme: boolean) => {
    setEnvoi(true)
    const resultat = await onEnregistrer(saisie, confirme)
    setEnvoi(false)
    if (resultat.statut === 'erreurs') {
      setErreurs(resultat.erreurs)
      setDepassement(null)
      return
    }
    if (resultat.statut === 'confirmation-requise') {
      setErreurs([])
      setDepassement({
        montant: resultat.montantCentimes,
        disponible: resultat.disponibleCentimes,
      })
      return
    }
    onFermer()
  }

  if (depassement) {
    return (
      <ModaleDepassement
        montantCentimes={depassement.montant}
        disponibleCentimes={depassement.disponible}
        onRetour={() => setDepassement(null)}
        onConfirmer={() => soumettre(true)}
      />
    )
  }

  return (
    <Dialogue
      titre={T.modification.titre}
      onFermer={onFermer}
      classeCoque="modif-coque"
      bandeau={
        // R-54, R-55 — rappel des valeurs que la modification ne touche jamais.
        <div className="modif-fixes">
          <div>
            <div className="etiquette">{T.modification.numeroFixe}</div>
            <div className="valeur numero mono">{recu.numero}</div>
          </div>
          <div>
            <div className="etiquette">{T.modification.dateFixe}</div>
            <div className="valeur mono" dir="ltr">
              {recu.date}
            </div>
          </div>
          <div>
            <div className="etiquette">{T.modification.rabatteurFixe}</div>
            <div className="valeur">{recu.rabatteur || '—'}</div>
          </div>
          <div>
            <div className="etiquette">{T.modification.premierMontantFixe}</div>
            <div className="valeur mono" dir="ltr">
              {premierVersement ? <Montant centimes={premierVersement.montantCentimes} /> : '—'}
            </div>
          </div>
        </div>
      }
      pied={
        // Le fichier ne garde que « annuler » et « enregistrer », poussés au bord.
        <>
          <button className="omra-btn" onClick={onFermer} disabled={envoi}>
            {T.versement.annuler}
          </button>
          {section ? (
            <button className="omra-btn primary" onClick={() => soumettre(false)} disabled={envoi}>
              {T.modification.enregistrer}
            </button>
          ) : null}
        </>
      }
    >
      <ListeErreurs erreurs={erreurs} />

      {!section ? (
        <>
          <p className="modif-consigne">{T.modification.consigne}</p>
          {/* Le fichier présente les six sections sur deux colonnes. */}
          <div className="modif-sections">
            {(Object.keys(LIBELLES_SECTIONS) as SectionModifiable[]).map((cle) => {
              const bloquee = cle === 'firstPayment' && versementPartage
              return (
                <button
                  key={cle}
                  className="modif-section"
                  disabled={bloquee}
                  onClick={() => setSaisie({ ...saisie, section: cle })}
                >
                  <span className="titre">{LIBELLES_SECTIONS[cle]}</span>
                  <small>{bloquee ? T.modification.portePartagee : DESCRIPTIONS[cle]}</small>
                </button>
              )
            })}
          </div>
          <div className="modif-avertissement">{T.modification.fixes}</div>
        </>
      ) : (
        <>
          {/* Le fichier place le retour en tête du corps, pas dans le pied. */}
          <div className="modif-entete">
            <button
              className="modif-retour"
              onClick={() => {
                setSaisie({ ...saisie, section: '' })
                setErreurs([])
              }}
              disabled={envoi}
              aria-label={T.modification.sectionChoisie}
            >
              {T.modification.retour}
            </button>
            <div>
              <div className="etiquette">{T.modification.sectionChoisie}</div>
              <div className="valeur">{LIBELLES_SECTIONS[section]}</div>
            </div>
          </div>

          <div className="modif-corps">
            {section === 'identity' ? (
              <div className="omra-fields">
                <Champ label={T.nouveau.prenom}>
                  <Saisie
                    valeur={saisie.prenom}
                    onChange={(v) => modifier({ prenom: nettoyerArabe(v) })}
                    invalide={enErreur(erreurs, 'prenom')}
                    arabe
                  />
                </Champ>
                <Champ label={T.nouveau.nom}>
                  <Saisie
                    valeur={saisie.nom}
                    onChange={(v) => modifier({ nom: nettoyerArabe(v) })}
                    invalide={enErreur(erreurs, 'nom')}
                    arabe
                  />
                </Champ>
              </div>
            ) : null}

            {section === 'contact' ? (
              <div className="omra-fields">
                <Champ label={T.nouveau.telephone}>
                  <Saisie
                    valeur={saisie.telephone}
                    onChange={(v) => modifier({ telephone: formaterTelephone(v) })}
                    invalide={enErreur(erreurs, 'telephone')}
                    mono
                    inputMode="tel"
                  />
                </Champ>
              </div>
            ) : null}

            {section === 'program' ? (
              <>
                {/* Le fichier aligne hôtel, vol et chambre sur une seule rangée. */}
                <div className="omra-fields trio">
                  <Champ label={T.nouveau.hotel}>
                    <Selection
                      valeur={saisie.hotel}
                      onChange={(v) => modifier({ hotel: v })}
                      options={referentiels.hotels.map((h) => ({ valeur: h.id, libelle: h.nom }))}
                      invalide={enErreur(erreurs, 'hotel')}
                    />
                  </Champ>
                  <Champ label={T.nouveau.vol}>
                    <Selection
                      valeur={saisie.vol}
                      onChange={(v) => modifier({ vol: v })}
                      options={referentiels.vols.map((v) => ({ valeur: v.id, libelle: v.nom }))}
                      invalide={enErreur(erreurs, 'vol')}
                    />
                  </Champ>
                  <Champ label={T.nouveau.chambre}>
                    <Selection
                      valeur={saisie.chambre}
                      onChange={(v) => modifier({ chambre: v })}
                      options={referentiels.chambres.map((c) => ({ valeur: c.id, libelle: c.code }))}
                      invalide={enErreur(erreurs, 'chambre')}
                    />
                  </Champ>
                </div>

                <div className="omra-fields">
                  <Champ label={T.nouveau.reduction} pleine>
                    <Saisie
                      valeur={saisie.reduction}
                      onChange={(v) => modifier({ reduction: formaterMontant(v) })}
                      invalide={enErreur(erreurs, 'reduction')}
                      mono
                      inputMode="numeric"
                    />
                  </Champ>
                </div>

                {tarif === null ? (
                  <div className="modif-sans-prix">{T.modification.aucunPrix}</div>
                ) : null}

                {/* Récapitulatif : nouveau prix, remise, nouveau convenu, déjà payé. */}
                <div className="modif-recap">
                  <div className="ligne">
                    <span>{T.modification.nouveauPrix}</span>
                    <span className="valeur mono">
                      {tarif === null ? '—' : <Montant centimes={tarif} />}
                    </span>
                  </div>
                  <div className="ligne">
                    <span>{T.detail.reduction}</span>
                    <span className="valeur mono">
                      <Montant centimes={reductionCentimes} />
                    </span>
                  </div>
                  <div className="ligne total">
                    <span>{T.modification.nouveauConvenu}</span>
                    <span className="valeur mono">
                      {convenu === null ? '—' : <Montant centimes={convenu} />}
                    </span>
                  </div>
                  <div className="ligne appoint">
                    <span>{T.modification.montantInchange}</span>
                    <span className="valeur mono">
                      <Montant centimes={totalPaye(recu)} />
                    </span>
                  </div>
                </div>
              </>
            ) : null}

            {section === 'group' ? (
              <>
                <CaseACocher
                  coche={saisie.groupeCoche}
                  onChange={(coche) => modifier({ groupeCoche: coche })}
                  label={T.nouveau.groupeCoche}
                  classe="case-groupe"
                />
                {saisie.groupeCoche ? (
                  <div className="omra-fields" style={{ marginTop: 10 }}>
                    <Champ label={T.nouveau.groupeCode}>
                      <Saisie
                        valeur={saisie.groupe}
                        onChange={(v) => modifier({ groupe: v })}
                        invalide={enErreur(erreurs, 'groupe')}
                      />
                    </Champ>
                  </div>
                ) : null}
              </>
            ) : null}

            {section === 'note' ? (
              <div className="omra-fields">
                <Champ label={T.nouveau.note} pleine>
                  <Zone
                    valeur={saisie.note}
                    onChange={(v) => modifier({ note: v })}
                    lignes={4}
                    arabe
                  />
                </Champ>
              </div>
            ) : null}

            {section === 'firstPayment' ? (
              <>
                {/* R-55 : figé pour un employé. §5.9 : éditable pour un administrateur. */}
                {estAdministrateur ? (
                  <div className="omra-fields">
                    <Champ label={T.modification.montantAdministrateur} pleine>
                      <Saisie
                        valeur={saisie.montant}
                        onChange={(v) => modifier({ montant: formaterMontant(v) })}
                        invalide={enErreur(erreurs, 'montant')}
                        placeholder={
                          premierVersement
                            ? centimesEnDirhamsSaisis(premierVersement.montantCentimes)
                            : ''
                        }
                        mono
                        inputMode="numeric"
                      />
                    </Champ>
                  </div>
                ) : (
                  <div className="modif-montant-fixe">
                    <span>{T.modification.premiereDfpFixe}</span>
                    <span className="valeur mono" dir="ltr">
                      {premierVersement ? (
                        <Montant centimes={premierVersement.montantCentimes} />
                      ) : (
                        '—'
                      )}
                    </span>
                  </div>
                )}

                {/* Le fichier emploie une liste déroulante, pas des boutons. */}
                <div className="omra-fields">
                  <Champ label={T.nouveau.methode} pleine>
                    <Selection
                      valeur={saisie.nature}
                      onChange={(v) => modifier({ nature: v })}
                      options={[
                        { valeur: NATURE_ESPECES, libelle: T.methodes.especes },
                        { valeur: NATURE_CHEQUE, libelle: T.methodes.cheque },
                        { valeur: NATURE_VIREMENT, libelle: T.methodes.virement },
                      ]}
                      invalide={enErreur(erreurs, 'nature')}
                    />
                  </Champ>
                </div>

                {saisie.nature !== NATURE_ESPECES ? (
                  <>
                    <div className="omra-fields trio">
                      <Champ label={T.instrument.reference}>
                        <Saisie
                          valeur={saisie.reference}
                          onChange={(v) => modifier({ reference: v })}
                          invalide={enErreur(erreurs, 'reference')}
                          mono
                        />
                      </Champ>
                      <Champ label={T.instrument.dateOperation}>
                        <Saisie
                          valeur={saisie.dateInstrument}
                          onChange={(v) => modifier({ dateInstrument: formaterDate(v) })}
                          invalide={enErreur(erreurs, 'dateInstrument')}
                          placeholder={T.nouveau.gabaritDate}
                          mono
                          inputMode="numeric"
                        />
                      </Champ>
                      <Champ label={T.instrument.banque}>
                        <Saisie
                          valeur={saisie.banque}
                          onChange={(v) => modifier({ banque: v })}
                          invalide={enErreur(erreurs, 'banque')}
                          arabe
                        />
                      </Champ>
                    </div>

                    {/* Opération collective : un payeur pour plusieurs voyageurs. */}
                    <CaseACocher
                      coche={saisie.operationPartagee}
                      onChange={(coche) => modifier({ operationPartagee: coche })}
                      label={T.modification.operationCollective}
                    />

                    {saisie.operationPartagee ? (
                      <div className="modif-collective">
                        <div className="omra-fields duo">
                          <Champ label={T.instrument.payeur}>
                            <Saisie
                              valeur={saisie.payeur}
                              onChange={(v) => modifier({ payeur: v })}
                              invalide={enErreur(erreurs, 'payeur')}
                              arabe
                            />
                          </Champ>
                          <Champ label={T.instrument.montantOperation}>
                            <Saisie
                              valeur={saisie.montantOperation}
                              onChange={(v) => modifier({ montantOperation: formaterMontant(v) })}
                              invalide={enErreur(erreurs, 'montantOperation')}
                              mono
                              inputMode="numeric"
                            />
                          </Champ>
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : null}

                <p className="omra-hint">
                  {estAdministrateur
                    ? T.modification.noteFirstPaymentAdministrateur
                    : T.modification.noteFirstPayment}
                </p>
              </>
            ) : null}
          </div>

          {/* R-50 — motif obligatoire, isolé par un filet comme dans le fichier. */}
          <div className="modif-motif">
            <Champ label={T.modification.motif} pleine>
              <Zone
                valeur={saisie.motif}
                onChange={(v) => modifier({ motif: v })}
                invalide={enErreur(erreurs, 'motif')}
                placeholder={T.modification.gabaritMotif}
                lignes={2}
                arabe
              />
            </Champ>
          </div>
        </>
      )}
    </Dialogue>
  )
}
