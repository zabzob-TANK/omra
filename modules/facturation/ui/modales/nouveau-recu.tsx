'use client'

/**
 * Fenêtre « Nouveau reçu ».
 *
 * Reproduit la structure du formulaire de référence : bloc voyageur, bloc
 * programme et prix, groupe facultatif, puis premier versement obligatoire avec
 * sa méthode de paiement.
 *
 * Toute la validation vient du noyau métier (R-01 à R-14) : cet écran n'en
 * réimplémente aucune, il se contente d'afficher les erreurs renvoyées.
 */

import { useState } from 'react'

import { dateDuJour } from '../../domain/dates'
import { formaterMontant, formaterMontantAffiche, formaterTelephone, nettoyerArabe } from '../../domain/format'
import { centimesEnTexteDevise, dirhamsSaisisEnCentimes } from '../../domain/money'
import type { ErreurValidation, Resultat } from '../../domain/rules/errors'
import type { SaisieNouveauRecu } from '../../domain/rules/create-receipt'
import { construireGrille, montantConvenu } from '../../domain/rules/tarif'
import type { OperationPartagee, Passeport, Recu, Saison, Tarif } from '../../domain/types'
import { CaseACocher, Champ, enErreur, ListeErreurs, Saisie, Selection } from '../champs'
import { T } from '../textes'
import { Dialogue } from '../dialogue'
import {
  BlocInstrument,
  NATURES,
  instrumentPourNature,
  instrumentVierge,
} from '../instrument-panel'
import { NATURE_CHEQUE, NATURE_VIREMENT } from '../../domain/constants'
import { natureNormalisee } from '../../domain/payment-method'
import { CarteImageInstrument } from '../carte-image-instrument'
import { cibleImageInstrument, useBrouillonImage } from '../image-instrument'
import { ModalePaiementImage } from './paiement-image'
import { ModaleDepassement } from './depassement'
import { ModalePasseport, type ImagesPasseport } from './passeport'
import { IndicateurChargement } from '../spinner'

interface Referentiels {
  saison: Saison
  hotels: { id: string; nom: string }[]
  vols: { id: string; nom: string }[]
  chambres: { id: string; code: string }[]
  rabatteurs: { id: string; nom: string }[]
  tarifs: Tarif[]
}

interface Proprietes {
  referentiels: Referentiels
  operations: OperationPartagee[]
  recus: Recu[]
  onFermer: () => void
  onEnregistrer: (
    saisie: SaisieNouveauRecu,
    confirme: boolean,
    /** R-35 — image de l'instrument, rattachée à l'enregistrement seulement. */
    image: { contenu: Blob; nomOrigine: string } | null,
    /** R-90 — images du passeport, rattachées elles aussi à l'enregistrement. */
    passeport: { originale: Blob; portrait: Blob } | null,
  ) => Promise<Resultat<{ recuId: string; numero: number }>>
  /** R-38 — aperçus des images déjà portées par les opérations partagées. */
  imagesOperations: Record<string, string>
  /** Voir `ModalePaiementImage`/`ModalePasseport` — masque les boutons d'exemple/démo hors démonstration. */
  modeDemonstration: boolean
}

function saisieVierge(): SaisieNouveauRecu {
  return {
    prenom: '',
    nom: '',
    telephone: '',
    hotel: '',
    vol: '',
    chambre: '',
    rabatteur: '',
    reduction: '',
    groupeCoche: false,
    groupe: '',
    premierVersement: '',
    note: '',
    instrument: instrumentVierge(),
    passeport: null,
  }
}

export function ModaleNouveauRecu({
  referentiels,
  operations,
  recus,
  onFermer,
  onEnregistrer,
  imagesOperations,
  modeDemonstration,
}: Proprietes) {
  const [saisie, setSaisie] = useState<SaisieNouveauRecu>(saisieVierge())
  const [erreurs, setErreurs] = useState<ErreurValidation[]>([])
  const [depassement, setDepassement] = useState<{ montant: number; disponible: number } | null>(
    null,
  )
  const [passeportOuvert, setPasseportOuvert] = useState(false)
  const [envoi, setEnvoi] = useState(false)
  // R-35 — l'image reste un brouillon local jusqu'à l'enregistrement du reçu.
  const image = useBrouillonImage()
  // R-90 — de même pour les deux images du passeport.
  const [imagesPasseport, setImagesPasseport] = useState<ImagesPasseport | null>(null)

  const modifier = (patch: Partial<SaisieNouveauRecu>) => setSaisie({ ...saisie, ...patch })

  // Aperçu du prix — le calcul fait autorité côté serveur, celui-ci n’est
  // qu'un reflet immédiat pour l’utilisateur.
  const grille = construireGrille(referentiels.tarifs)
  const tarif = grille.tarifPour(saisie.hotel, saisie.vol, saisie.chambre)
  const reduction = dirhamsSaisisEnCentimes(saisie.reduction)
  const convenu = tarif === null ? null : montantConvenu(tarif, reduction)

  // Bandeau du fichier de référence : numéro pressenti et date du jour. Le
  // numéro définitif reste attribué par le service à l'enregistrement (R-11) ;
  // cet aperçu ne fait que refléter la suite des reçus déjà chargés.
  const numeroPressenti = recus.reduce((plusGrand, recu) => Math.max(plusGrand, recu.numero), 0) + 1
  const dateAujourdhui = dateDuJour()

  // R-14 — reflet immédiat du premier versement : payé puis reste.
  const paye = dirhamsSaisisEnCentimes(saisie.premierVersement)
  const reste = convenu === null ? null : convenu - paye
  const sansMontant = `${T.nouveau.montantInconnu} DH`

  // Le fichier de référence n'ouvre la colonne d'instrument que pour un chèque
  // ou un virement, et élargit alors la fenêtre.
  const natureCourante = natureNormalisee(saisie.instrument.nature)
  const instrumentOuvert =
    natureCourante === NATURE_CHEQUE || natureCourante === NATURE_VIREMENT

  const soumettre = async (confirme: boolean) => {
    setEnvoi(true)
    const resultat = await onEnregistrer(
      saisie,
      confirme,
      image.brouillon ? { contenu: image.brouillon.contenu, nomOrigine: image.brouillon.nomOrigine } : null,
      imagesPasseport
        ? { originale: imagesPasseport.originale, portrait: imagesPasseport.portrait }
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

  if (passeportOuvert) {
    return (
      <ModalePasseport
        initial={saisie.passeport}
        apercuInitial={imagesPasseport?.apercu}
        modeDemonstration={modeDemonstration}
        onFermer={() => setPasseportOuvert(false)}
        onValider={(passeport: Passeport, images: ImagesPasseport | null) => {
          modifier({
            passeport,
            // Le fichier de référence reporte le nom et le prénom lus dans le
            // formulaire du reçu.
            prenom: passeport.prenom || saisie.prenom,
            nom: passeport.nom || saisie.nom,
          })
          if (images) setImagesPasseport(images)
          setPasseportOuvert(false)
        }}
      />
    )
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
      titre={T.nouveau.titre}
      taille="large"
      classeCoque={`recu-coque${instrumentOuvert ? ' instrument-ouvert' : ''}`}
      onFermer={onFermer}
      bandeau={
        <div className="recu-bandeau">
          <div className="recu-bandeau-label">{T.nouveau.numero}</div>
          <div className="recu-bandeau-numero mono">{numeroPressenti}</div>
          <div className="recu-bandeau-date mono" dir="ltr">
            {dateAujourdhui}
          </div>
        </div>
      }
      pied={
        <>
          <button className="omra-btn" onClick={onFermer} disabled={envoi}>
            {T.nouveau.annuler}
          </button>
          <button className="omra-btn primary" onClick={() => soumettre(false)} disabled={envoi}>
            {envoi ? <IndicateurChargement /> : null}
            {T.nouveau.enregistrer}
          </button>
        </>
      }
    >
      <div className="recu-colonnes">
        <section className="recu-colonne-principale">
      <ListeErreurs erreurs={erreurs} />

      <section className="recu-section" style={{ marginTop: 0 }}>
        <div className="voyageur-entete">
          <h3>{T.nouveau.sectionVoyageur}</h3>
          <div className="voyageur-actions">
            {saisie.passeport ? (
              <span className="passeport-chip ok">{T.passeportLie.chip}</span>
            ) : null}
            <button className="passeport-scan" type="button" onClick={() => setPasseportOuvert(true)}>
              <svg
                fill="none"
                height="14"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.8"
                viewBox="0 0 24 24"
                width="14"
                aria-hidden="true"
              >
                <rect x="4" y="3" width="16" height="18" rx="2" />
                <circle cx="12" cy="9" r="2.4" />
                <path d="M8 16c1.2-2 2.6-3 4-3s2.8 1 4 3" />
              </svg>
              {T.nouveau.scannerPasseport}
            </button>
          </div>
        </div>
        <div className="omra-fields trio">
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
          <Champ label={T.nouveau.telephone}>
            <Saisie
              valeur={saisie.telephone}
              onChange={(v) => modifier({ telephone: formaterTelephone(v) })}
              invalide={enErreur(erreurs, 'telephone')}
              placeholder={T.nouveau.gabaritTelephone}
              mono
              inputMode="tel"
            />
          </Champ>
        </div>

        {/* R-90 — bande de liaison, avec le portrait tiré de l'image choisie. */}
        {saisie.passeport ? (
          <div className="passeport-bande">
            {imagesPasseport ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className="passeport-portrait"
                src={imagesPasseport.apercu}
                alt={T.passeport.alternativePortrait}
              />
            ) : (
              <div className="passeport-portrait vide" aria-hidden="true" />
            )}
            <div>
              <div className="nom">{`${saisie.passeport.prenom} ${saisie.passeport.nom}`.trim()}</div>
              <div className="numero">
                {T.passeportLie.numero}{' '}
                <span dir="ltr" className="mono">
                  {saisie.passeport.numero || '—'}
                </span>
              </div>
              <div className="aide">{T.passeport.sauvegardeInfo}</div>
            </div>
            <button
              className="passeport-detacher"
              type="button"
              onClick={() => {
                modifier({ passeport: null })
                setImagesPasseport(null)
              }}
            >
              {T.passeportLie.detacher}
            </button>
          </div>
        ) : null}
      </section>

      <section className="recu-section">
        <h3>{T.nouveau.sectionProgramme}</h3>
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

        {/* Le fichier de référence place le vendeur et la réduction sur une
            seconde rangée, sous les trois listes du programme. */}
        <div className="omra-fields duo">
          <Champ label={T.nouveau.rabatteur}>
            <Selection
              valeur={saisie.rabatteur}
              onChange={(v) => modifier({ rabatteur: v })}
              options={referentiels.rabatteurs.map((r) => ({ valeur: r.id, libelle: r.nom }))}
              invalide={enErreur(erreurs, 'rabatteur')}
            />
          </Champ>
          {/* Le fichier de référence n'affiche aucun indice sous ce champ : le
              plafond de réduction reste vérifié par le noyau métier. */}
          <Champ label={T.nouveau.reduction}>
            <Saisie
              valeur={formaterMontantAffiche(saisie.reduction)}
              onChange={(v) => modifier({ reduction: formaterMontant(v) })}
              invalide={enErreur(erreurs, 'reduction')}
              mono
              inputMode="numeric"
              classe="champ-texte-grand"
            />
          </Champ>
        </div>

        {saisie.hotel && saisie.vol && saisie.chambre && tarif === null ? (
          <p className="omra-hint" style={{ marginTop: 10, color: 'var(--danger)' }}>
            {T.prixIndefini}
          </p>
        ) : null}

        {/*
          Les deux encadrés de montants se lisent sur une même rangée : le
          prix convenu à droite, ce qui reste à payer à sa gauche. La fenêtre
          y gagne la hauteur d'un bloc entier. Sous 760 px, ils repassent l'un
          sous l'autre.
        */}
        {/*
          L'encadré vert « payé / reste » occupe la première position, donc la
          droite en lecture arabe ; l'encadré des prix passe à gauche. Seul
          l'ordre change : contenu, couleurs et dimensions sont conservés.
        */}
        <div className="recu-encadres-paire">
          <div className="recu-encadre totaux">
            <div className="ligne">
              <span>{T.nouveau.totalPaye}</span>
              <b className="mono" dir="ltr">
                {centimesEnTexteDevise(paye)}
              </b>
            </div>
            <div className="ligne totale">
              <span>{T.nouveau.totalReste}</span>
              {/* Restant nul : bleu, comme partout ailleurs dans l'interface. */}
              <b className={`mono${reste === 0 ? ' solde' : ''}`} dir="ltr">
                {reste === null ? sansMontant : centimesEnTexteDevise(reste)}
              </b>
            </div>
          </div>

          <div className="recu-encadre prix">
            <div className="ligne">
              <span>{T.detail.prixOrigine}</span>
              <b className="mono prix-original" dir="ltr">
                {tarif === null ? sansMontant : centimesEnTexteDevise(tarif)}
              </b>
            </div>
            <div className="ligne">
              <span>{T.registre.colonnes.reduction}</span>
              <b className="mono prix-reduction" dir="ltr">
                {centimesEnTexteDevise(reduction)}
              </b>
            </div>
            <div className="ligne totale">
              <span>{T.registre.colonnes.convenu}</span>
              <b className="mono" dir="ltr">
                {convenu === null ? sansMontant : centimesEnTexteDevise(convenu)}
              </b>
            </div>
          </div>
        </div>

      </section>

      <section className="recu-section">
        <div className="omra-fields duo champ-encaissement">
          <Champ label={T.nouveau.montant}>
            <Saisie
              valeur={formaterMontantAffiche(saisie.premierVersement)}
              onChange={(v) => modifier({ premierVersement: formaterMontant(v) })}
              invalide={enErreur(erreurs, 'premierVersement')}
              mono
              inputMode="numeric"
              classe="champ-texte-grand"
            />
          </Champ>
          {/* Le fichier de référence pose le mode de paiement en liste
              déroulante, sur la même rangée que le montant. */}
          <Champ label={T.nouveau.methode}>
            <Selection
              valeur={natureCourante}
              onChange={(valeur) => modifier({ instrument: instrumentPourNature(valeur) })}
              options={NATURES.map((n) => ({ valeur: n.valeur, libelle: n.libelle }))}
            />
          </Champ>
        </div>
      </section>

      <div style={{ marginTop: 8 }}>
        <CaseACocher
          coche={saisie.groupeCoche}
          onChange={(coche) => modifier({ groupeCoche: coche })}
          label={T.nouveau.groupeCoche}
          classe="case-groupe"
        />
      </div>
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

      {/* Le fichier de référence place la note en toute fin de formulaire. */}
      <div className="omra-fields" style={{ marginTop: 10 }}>
        <Champ label={T.nouveau.note} pleine>
          <Saisie valeur={saisie.note} onChange={(v) => modifier({ note: v })} />
        </Champ>
      </div>
        </section>

        {/* Colonne latérale du fichier de référence : elle n'existe que pour un
            chèque ou un virement, et repasse dessous sous 980 px. */}
        {instrumentOuvert ? (
          <aside className="recu-colonne-instrument">
            <BlocInstrument
              saisie={saisie.instrument}
              onChange={(instrument) => modifier({ instrument })}
              erreurs={erreurs}
              operations={operations}
              recus={recus}
              montantSaisi={saisie.premierVersement}
              natureExterne
            />
            <CarteImageInstrument
              saisie={saisie.instrument}
              contexte="recu"
              apercuBrouillon={image.brouillon?.apercu ?? ''}
              apercuOperation={imagesOperations[saisie.instrument.operationId] ?? ''}
              onAjouter={image.ouvrir}
            />
          </aside>
        ) : null}
      </div>

      {image.ouverte ? (
        <ModalePaiementImage
          cible={cibleImageInstrument(saisie.instrument, saisie.premierVersement)}
          modeDemonstration={modeDemonstration}
          onFermer={image.fermer}
          onEnregistrer={(fichier) => image.retenir(fichier.contenu, fichier.nomOrigine)}
        />
      ) : null}
    </Dialogue>
  )
}
