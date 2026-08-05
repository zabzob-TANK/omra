'use client'

/**
 * Fenêtre « Ajouter un versement ».
 *
 * Reproduit la structure de référence : recherche du reçu par numéro, rappel de
 * sa situation, récapitulatif des six lignes de versement, puis montant et
 * méthode de paiement.
 *
 * L'avertissement affiché dès la saisie du numéro reprend `motifRefusVersement`
 * (R-15 à R-18), la même règle que celle appliquée à l'enregistrement.
 */

import { useState } from 'react'

import { MAX_VERSEMENTS } from '../../domain/constants'
import { dateDuJour } from '../../domain/dates'
import { formaterMontant } from '../../domain/format'
import { centimesEnTexteDevise, dirhamsSaisisEnCentimes } from '../../domain/money'
import { codeCouleurNature, natureAbregee, natureNormalisee } from '../../domain/payment-method'
import type { ErreurValidation, Resultat } from '../../domain/rules/errors'
import { messageErreur } from '../../domain/rules/errors'
import { motifRefusVersement, type SaisieVersement } from '../../domain/rules/payment'
import { restantDu, totalPaye } from '../../domain/rules/receipt'
import type { OperationPartagee, Recu } from '../../domain/types'
import { Champ, enErreur, ListeErreurs, Saisie, Selection } from '../champs'
import { Dialogue } from '../dialogue'
import { BlocInstrument, instrumentPourNature, instrumentVierge, NATURES } from '../instrument-panel'
import { CarteImageInstrument } from '../carte-image-instrument'
import { cibleImageInstrument, useBrouillonImage } from '../image-instrument'
import { ModalePaiementImage } from './paiement-image'
import { Montant, TexteArabe } from '../bidi'
import { ModaleDepassement } from './depassement'
import { T } from '../textes'

/** Libellé abrégé de la méthode, comme `receiptMethodDisplay()`. */
function libelleNature(valeur: string): string {
  const nature = natureNormalisee(valeur)
  if (nature === 'نقد') return T.methodes.especes
  if (nature === 'شيك') return T.methodes.cheque
  if (nature === 'تحويل بنكي') return T.methodes.virement
  return natureAbregee(valeur)
}

interface Proprietes {
  recus: Recu[]
  operations: OperationPartagee[]
  /**
   * reprise.md §5.3 — identifiant du reçu, verrouillé quand la fenêtre
   * s'ouvre depuis une ligne précise du registre. Le numéro seul ne suffit
   * jamais à désigner un reçu : deux saisons peuvent chacune en porter un n°1.
   */
  recuVerrouilleId?: string
  onFermer: () => void
  onEnregistrer: (
    saisie: SaisieVersement,
    confirme: boolean,
    /** R-35 — image de l'instrument, rattachée à l'enregistrement seulement. */
    image: { contenu: Blob; nomOrigine: string } | null,
  ) => Promise<Resultat<{ recuId: string }>>
  /** R-38 — aperçus des images déjà portées par les opérations partagées. */
  imagesOperations: Record<string, string>
  /** Voir `ModalePaiementImage` — masque le bouton d'exemple hors démonstration. */
  modeDemonstration: boolean
}

export function ModaleVersement({
  recus,
  operations,
  recuVerrouilleId,
  onFermer,
  onEnregistrer,
  imagesOperations,
  modeDemonstration,
}: Proprietes) {
  const recuVerrouille = recuVerrouilleId
    ? (recus.find((r) => r.id === recuVerrouilleId) ?? null)
    : null
  const [saisie, setSaisie] = useState<SaisieVersement>({
    numeroRecu: recuVerrouille ? String(recuVerrouille.numero) : '',
    recuId: recuVerrouilleId,
    montant: '',
    instrument: instrumentVierge(),
  })
  const [erreurs, setErreurs] = useState<ErreurValidation[]>([])
  const [depassement, setDepassement] = useState<{ montant: number; disponible: number } | null>(
    null,
  )
  const [envoi, setEnvoi] = useState(false)
  // R-35 — l'image reste un brouillon local jusqu'à l'enregistrement du versement.
  const image = useBrouillonImage()

  const modifier = (patch: Partial<SaisieVersement>) => setSaisie({ ...saisie, ...patch })

  const numero = Number(saisie.numeroRecu)
  const recu = saisie.recuId
    ? recuVerrouille
    : saisie.numeroRecu.trim()
      ? (recus.find((r) => r.numero === numero) ?? null)
      : null
  const refus = saisie.numeroRecu.trim() ? motifRefusVersement(recu) : null
  const utilisable = Boolean(recu) && !refus

  const restant = recu ? restantDu(recu) : 0
  const montantCentimes = dirhamsSaisisEnCentimes(saisie.montant)

  const soumettre = async (confirme: boolean) => {
    setEnvoi(true)
    const resultat = await onEnregistrer(
      saisie,
      confirme,
      image.brouillon
        ? { contenu: image.brouillon.contenu, nomOrigine: image.brouillon.nomOrigine }
        : null,
    )
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

  // Le bloc bancaire passe en colonne latérale dès que le mode n'est plus
  // les espèces, comme dans le formulaire de création.
  const natureCourante = natureNormalisee(saisie.instrument.nature)
  const instrumentOuvert = natureCourante !== 'نقد'

  return (
    <Dialogue
      titre={T.versement.titre}
      taille="large"
      classeCoque={`recu-coque versement-coque${instrumentOuvert ? ' instrument-ouvert' : ''}`}
      onFermer={onFermer}
      bandeau={
        // Même bandeau que le formulaire de création : intitulé, numéro visé
        // puis date du jour. Tant qu'aucun reçu n'est trouvé, le fichier de
        // référence affiche un simple tiret.
        <div className="recu-bandeau">
          <div className="recu-bandeau-label">{T.versement.numeroRecu.replace(' *', '')}</div>
          <div className="recu-bandeau-numero mono">
            {recu ? recu.numero : T.nouveau.montantInconnu}
          </div>
          <div className="recu-bandeau-date mono" dir="ltr">
            {dateDuJour()}
          </div>
        </div>
      }
      pied={
        <>
          <button className="omra-btn" onClick={onFermer} disabled={envoi}>
            {T.versement.annuler}
          </button>
          <button
            className="omra-btn primary"
            onClick={() => soumettre(false)}
            disabled={envoi || !utilisable}
          >
            {T.versement.enregistrer}
          </button>
        </>
      }
    >
      <div className="recu-colonnes">
        <section className="recu-colonne-principale">
      <ListeErreurs erreurs={erreurs} />

      <div className="omra-fields">
        <Champ label={T.versement.numeroRecu} aide={recuVerrouilleId ? undefined : T.versement.aideNumero}>
          <Saisie
            valeur={saisie.numeroRecu}
            onChange={(v) => modifier({ numeroRecu: v.replace(/\D/g, '') })}
            invalide={enErreur(erreurs, 'numeroRecu')}
            placeholder={T.nouveau.gabaritNumeroRecu}
            classe="numero-recu"
            desactive={Boolean(recuVerrouilleId)}
            mono
            inputMode="numeric"
          />
        </Champ>
      </div>

      {refus ? (
        <div className="omra-errors" style={{ marginTop: 14 }} role="alert">
          <strong>{messageErreur(refus)}</strong>
        </div>
      ) : null}

      {recu && !refus ? (
        <>
          <div className="versement-nom-titre">
            <TexteArabe>{`${recu.prenom} ${recu.nom}`}</TexteArabe>
          </div>

          {recu.versements.length === MAX_VERSEMENTS - 1 ? (
            <p className="omra-hint" style={{ marginTop: 10, color: 'var(--warn)' }}>
              الدفعة السادسة يجب أن تساوي كامل الباقي بالضبط ({centimesEnTexteDevise(restant)}).
            </p>
          ) : null}

          {/*
            Résumé du reçu visé : les trois repères du dossier, puis le reste
            après cette dfp détaché sous un filet — c'est le chiffre que l'on
            vient vérifier en saisissant une dfp. Côte à côte avec le tableau
            des dfp déjà enregistrées.
          */}
          <div className="versement-grille">
          <div className="versement-resume">
            <div className="versement-resume-ligne">
              <span>{T.registre.colonnes.nbVersements}</span>
              <b className="mono">
                {recu.versements.length} / {MAX_VERSEMENTS}
              </b>
            </div>
            <div className="versement-resume-ligne">
              <span>{T.registre.colonnes.convenu}</span>
              <b className="mono">
                <Montant centimes={recu.convenuCentimes} />
              </b>
            </div>
            <div className="versement-resume-ligne">
              <span>{T.versement.payeAvant}</span>
              <b className="mono">
                <Montant centimes={totalPaye(recu)} />
              </b>
            </div>
            <div className="versement-resume-ligne finale">
              <span>{T.versement.restantApres}</span>
              {/* Restant nul après cette dfp : bleu, comme partout ailleurs. */}
              <b className={`mono${restant - montantCentimes <= 0 ? ' solde' : ''}`}>
                <Montant centimes={Math.max(0, restant - montantCentimes)} />
              </b>
            </div>

            {/* Montant et mode de paiement, empilés sous le résumé. */}
            <div className="omra-fields duo champ-encaissement versement-champs-paiement">
              <Champ label={T.versement.montant}>
                <Saisie
                  valeur={saisie.montant}
                  onChange={(v) => modifier({ montant: formaterMontant(v) })}
                  invalide={enErreur(erreurs, 'montant')}
                  mono
                  inputMode="numeric"
                />
              </Champ>
              <Champ label={T.nouveau.methode}>
                <Selection
                  valeur={natureCourante}
                  onChange={(valeur) => modifier({ instrument: instrumentPourNature(valeur) })}
                  options={NATURES.map((n) => ({ valeur: n.valeur, libelle: n.libelle }))}
                />
              </Champ>
            </div>
          </div>

          <div className="omra-panel versement-recap">
            <div className="versement-recap-entete">
              <h3>{T.versement.recap}</h3>
              <span className="omra-hint">{T.versement.recapAide}</span>
            </div>
            <table className="omra-mini-table">
              <thead>
                <tr>
                  <th>{T.versement.colonnes.rang}</th>
                  <th>{T.versement.colonnes.date}</th>
                  <th>{T.versement.colonnes.montant}</th>
                  <th>{T.versement.colonnes.methode}</th>
                  <th>{T.versement.colonnes.details}</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: MAX_VERSEMENTS }, (_, index) => {
                  const versement = recu.versements[index]
                  if (!versement) {
                    // Aperçu en direct : la première ligne libre reflète la
                    // saisie en cours dès qu'un montant est entré, pour que
                    // l'employé voie sa dfp prendre sa place avant de
                    // l'enregistrer. Rien n'est encore écrit : la ligne est
                    // teintée pour qu'on ne la confonde pas avec une dfp
                    // enregistrée, et les champs non renseignés restent à « — ».
                    if (index === recu.versements.length && montantCentimes > 0) {
                      const detailsApercu = [
                        saisie.instrument.reference,
                        saisie.instrument.dateInstrument,
                        saisie.instrument.banque,
                      ]
                        .filter(Boolean)
                        .join(' · ')
                      return (
                        <tr key={index} className="apercu">
                          <td className="mono">{index + 1}</td>
                          <td className="mono">{dateDuJour()}</td>
                          <td>
                            <Montant centimes={montantCentimes} />
                          </td>
                          <td>
                            {natureCourante ? (
                              <span
                                className={`omra-method ${codeCouleurNature(natureCourante)}`}
                              >
                                {libelleNature(natureCourante)}
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td>
                            {detailsApercu ? <TexteArabe>{detailsApercu}</TexteArabe> : '—'}
                          </td>
                        </tr>
                      )
                    }
                    return (
                      <tr key={index} className="vide">
                        <td className="mono">{index + 1}</td>
                        <td>—</td>
                        <td>—</td>
                        <td>—</td>
                        <td>—</td>
                      </tr>
                    )
                  }
                  const details = [
                    versement.referenceInstrument,
                    versement.dateInstrument,
                    versement.banque,
                  ]
                    .filter(Boolean)
                    .join(' · ')
                  return (
                    <tr key={versement.id}>
                      <td className="mono">{index + 1}</td>
                      <td className="mono">{versement.date}</td>
                      <td>
                        <Montant centimes={versement.montantCentimes} />
                      </td>
                      <td>
                        <span className={`omra-method ${codeCouleurNature(versement.nature)}`}>
                          {libelleNature(versement.nature)}
                        </span>
                      </td>
                      <td>
                        {details ? <TexteArabe>{details}</TexteArabe> : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          </div>

        </>
      ) : null}
        </section>

        {/* Colonne latérale : chèque ou virement, comme dans le formulaire de
            création. Elle repasse dessous sous 980 px. */}
        {recu && !refus && instrumentOuvert ? (
          <aside className="recu-colonne-instrument">
            <BlocInstrument
              saisie={saisie.instrument}
              onChange={(instrument) => modifier({ instrument })}
              erreurs={erreurs}
              operations={operations}
              recus={recus}
              montantSaisi={saisie.montant}
              natureExterne
            />
            <CarteImageInstrument
              saisie={saisie.instrument}
              contexte="versement"
              apercuBrouillon={image.brouillon?.apercu ?? ''}
              apercuOperation={imagesOperations[saisie.instrument.operationId] ?? ''}
              onAjouter={image.ouvrir}
            />
          </aside>
        ) : null}
      </div>

      {recu && !refus ? (
        <>
          {image.ouverte ? (
            <ModalePaiementImage
              cible={cibleImageInstrument(saisie.instrument, saisie.montant)}
              modeDemonstration={modeDemonstration}
              onFermer={image.fermer}
              onEnregistrer={(fichier) => image.retenir(fichier.contenu, fichier.nomOrigine)}
            />
          ) : null}
        </>
      ) : null}
    </Dialogue>
  )
}
