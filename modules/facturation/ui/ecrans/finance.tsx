'use client'

/**
 * Écran « المالية » — le journal financier.
 *
 * Structure reprise du fichier de référence : barre d'outils (code
 * d'impression, bouton d'impression, navigation par journée, filtres),
 * bandeau d'anomalie, six blocs de synthèse, tableau principal à dix-huit
 * colonnes, puis tableau des annulations.
 *
 * Arabe, de droite à gauche, comme dans le fichier. Seule la sous-navigation
 * « Paiements » et « Suivi journalier » y est en français, le fichier la
 * marquant explicitement `lang="fr"` ; elle est partagée avec les deux écrans
 * du lot L5 (voir `ui/sous-nav.tsx`).
 *
 * Couvre : R-56 à R-67.
 */

import { useState } from 'react'

import type { JournalFinancier } from '../../data/service'
import type { PeriodeFinance } from '../../domain/rules/finance-day'
import { centimesEnTexteDevise } from '../../domain/money'
import { badgeSansCadreALImpression } from '../../domain/rules/finance-day'
import { DateValeur, Reference, TexteArabe } from '../bidi'
import { SousNavFinance } from '../sous-nav'
import { IndicateurChargement } from '../spinner'
import { T } from '../textes'
import './finance.css'

interface Proprietes {
  journal: JournalFinancier
  /**
   * Vrai pendant un rechargement qui suit un premier affichage réussi — les
   * valeurs déjà affichées restent visibles, seulement estompées, jamais
   * remplacées par un écran vide (2026-08-09).
   */
  rafraichissement?: boolean
  onPeriode: (periode: PeriodeFinance) => void
  onImprimer: () => Promise<void>
  onAcquitter: () => void
  onOuvrirDetail: (recuId: string) => void
  /** Journée courante et veille, pour l'état des boutons de filtre. */
  aujourdhui: string
  hier: string
  onPaiements: () => void
  onSuiviJournalier: () => void
}

export function EcranFinance({
  journal,
  rafraichissement,
  onPeriode,
  onImprimer,
  onAcquitter,
  onOuvrirDetail,
  aujourdhui,
  hier,
  onPaiements,
  onSuiviJournalier,
}: Proprietes) {
  const F = T.finance
  const C = F.colonnes
  const jour = journal.jourSelectionne
  const filtre = journal.periode.filtre
  const [impressionEnCours, setImpressionEnCours] = useState(false)

  const classeFiltre = (actif: boolean) => `finance-filtre${actif ? ' actif' : ''}`

  const imprimer = async () => {
    if (impressionEnCours) return
    setImpressionEnCours(true)
    await onImprimer()
    setImpressionEnCours(false)
  }

  return (
    <div className="finance-ecran">
      <SousNavFinance
        active="finance"
        onPaiements={onPaiements}
        onSuiviJournalier={onSuiviJournalier}
      />

      <main className={`finance-rapport${journal.nombrePages === 1 ? ' finance-une-page' : ''}`}>
        <div className="finance-outils omra-no-print">
          <span className="finance-code mono" dir="ltr">
            {journal.codeImpression}
          </span>
          <button
            className="finance-bouton impression"
            disabled={!journal.peutImprimer || impressionEnCours}
            onClick={imprimer}
          >
            {impressionEnCours ? <IndicateurChargement /> : null}
            {F.imprimer}
          </button>
          <button
            className="finance-bouton icone"
            onClick={() => onPeriode({ filtre: 'day', jour: decaler(jour, -1, aujourdhui) })}
          >
            ‹
          </button>
          <div className="finance-date">
            <span
              className="finance-indicateur"
              style={{ background: journal.couleurEtat }}
              aria-hidden="true"
            />
            <input
              type="date"
              value={jour ?? aujourdhui}
              onChange={(evenement) =>
                onPeriode({ filtre: 'day', jour: evenement.target.value })
              }
            />
          </div>
          <button
            className="finance-bouton icone"
            onClick={() => onPeriode({ filtre: 'day', jour: decaler(jour, 1, aujourdhui) })}
          >
            ›
          </button>

          <div className="finance-filtres">
            <button
              className={classeFiltre(filtre === 'day' && jour === aujourdhui)}
              onClick={() => onPeriode({ filtre: 'day', jour: aujourdhui })}
            >
              {F.aujourdhui}
            </button>
            <button
              className={classeFiltre(filtre === 'day' && jour === hier)}
              onClick={() => onPeriode({ filtre: 'day', jour: hier })}
            >
              {F.hier}
            </button>
            <button
              className={classeFiltre(filtre === 'all')}
              onClick={() => onPeriode({ filtre: 'all' })}
            >
              {F.tout}
            </button>
          </div>

          {rafraichissement ? (
            <span className="omra-badge-rafraichissement">
              <IndicateurChargement /> جارٍ التحديث…
            </span>
          ) : null}
        </div>

        <div className={rafraichissement ? 'omra-rafraichissement' : undefined}>
        {/*
          R-62, R-66, R-67 — bandeau supérieur visible uniquement à
          l'impression : code d'impression, état de la veille, compteur de
          pages. De gauche à droite, comme dans le fichier de référence.
        */}
        <div className="finance-bandeau-impression">
          <span className="mono" dir="ltr">
            {journal.codeImpressionBandeau}
          </span>
          <span className="veille">{journal.etatVeille}</span>
          <span className="pages mono" dir="ltr">
            {F.pagesImprimees(journal.nombrePages)}
          </span>
        </div>

        {/* R-65 — le bandeau n'apparaît que pour l'administrateur. */}
        {journal.estAdministrateur && journal.anomaliesEnAttente.length ? (
          <button className="finance-anomalie omra-no-print" onClick={onAcquitter}>
            {F.anomalieTexte(journal.anomaliesEnAttente.length)}
          </button>
        ) : null}

        <div className="finance-synthese">
          <div className="finance-bloc etat">
            <div className="tick" style={{ color: journal.couleurEtat }}>
              {journal.symboleEtat}
            </div>
            <div className="double">
              <div className="secondaire">
                <div className="valeur">{journal.chequesSansImage}</div>
                <div className="etiquette">{F.chequesSansImage}</div>
              </div>
              <div className="principale">
                <div className="valeur">{journal.modifications}</div>
                <div className="etiquette">{F.modifications}</div>
              </div>
            </div>
          </div>

          <div className="finance-bloc pile annulation-caisse">
            <div className="haut">
              <div className="cellule">
                <div className="etiquette">{F.annulation(journal.nombreAnnulations)}</div>
                <div className="valeur mono" dir="ltr">
                  {journal.totalAnnule}
                </div>
              </div>
              <div className="cellule">
                <div className="etiquette">{F.caisse(journal.totaux.nombreRemboursements)}</div>
                <div className="valeur mono" dir="ltr">
                  {centimesEnTexteDevise(journal.totaux.remboursementsCentimes)}
                </div>
              </div>
            </div>
            <div className="bas">
              <div className="valeur mono" dir="ltr">
                {centimesEnTexteDevise(journal.totaux.especesNettesCentimes)}
              </div>
              <div className="etiquette">{F.caisseNette}</div>
            </div>
          </div>

          <div className="finance-bloc pile">
            <div className="ligne">
              <div className="valeur grande">{journal.nouveauxClients}</div>
              <div className="etiquette">{F.nouveaux}</div>
            </div>
            <div className="ligne">
              <div className="valeur">{journal.totaux.nombrePaiements}</div>
              <div className="etiquette">{F.paiements}</div>
            </div>
          </div>

          <div className="finance-bloc total">
            <div className="etiquette">{F.totalGeneral}</div>
            <div className="valeur mono" dir="ltr">
              {centimesEnTexteDevise(journal.totaux.totalGeneralCentimes)}
            </div>
          </div>

          <div className="finance-bloc pile">
            <div className="ligne">
              <div className="valeur mono" dir="ltr">
                {centimesEnTexteDevise(journal.totaux.chequesCentimes)}
              </div>
              <div className="etiquette">{F.cheque(journal.totaux.nombreOperationsCheque)}</div>
            </div>
            <div className="ligne">
              <div className="valeur mono" dir="ltr">
                {centimesEnTexteDevise(journal.totaux.virementsCentimes)}
              </div>
              <div className="etiquette">{F.virement(journal.totaux.nombreOperationsVirement)}</div>
            </div>
          </div>

          <div className="finance-bloc meta">
            <div className="haut">
              <span>
                {F.dernierRecu} <b className="mono">{journal.dernierRecu}</b>
              </span>
              <span className="periode">{journal.libellePeriode}</span>
              <span>
                <b>{journal.totaux.nombrePaiements}</b> {F.operation}
              </span>
            </div>
            <div className="grand mono" dir="ltr">
              {centimesEnTexteDevise(journal.totaux.especesBrutCentimes)}
            </div>
          </div>
        </div>

        <section className="finance-carte">
          <div className="finance-defilement">
            <table className="finance-tableau">
              <thead>
                <tr>
                  <th>{C.heure}</th>
                  <th>{C.date}</th>
                  <th>{C.numeroRecu}</th>
                  <th>{C.versement}</th>
                  <th>{C.client}</th>
                  <th>{C.especes}</th>
                  <th>{C.banque}</th>
                  <th>{C.methode}</th>
                  <th className="mini">{C.valeurReelle}</th>
                  <th className="mini">{C.infosCheque}</th>
                  <th>{C.employe}</th>
                  <th>{C.rabatteur}</th>
                  <th>{C.hotel}</th>
                  <th>{C.chambre}</th>
                  <th>{C.vol}</th>
                  <th className="mini">{C.convenu}</th>
                  <th>{C.restant}</th>
                  <th>{C.statut}</th>
                </tr>
              </thead>
              <tbody>
                {journal.lignes.length === 0 ? (
                  <tr>
                    <td colSpan={18} className="finance-vide">
                      {F.videTableau}
                    </td>
                  </tr>
                ) : (
                  journal.lignes.map((ligne) => (
                    <tr
                      key={ligne.id}
                      className={ligne.anomalie ? 'anomalie' : undefined}
                      onDoubleClick={() => onOuvrirDetail(ligne.recuId)}
                    >
                      <td className="centre mono">{ligne.heure}</td>
                      <td className="centre">
                        <DateValeur>{ligne.date}</DateValeur>
                      </td>
                      <td className="centre">
                        <span className="finance-numero">
                          <Reference>{ligne.numeroRecu}</Reference>
                        </span>
                      </td>
                      <td className="centre">
                        <span
                          className={`finance-badge${ligne.premierVersement ? ' gris' : ' simple'}${
                            badgeSansCadreALImpression('versement', ligne.badge)
                              ? ' sans-cadre'
                              : ''
                          }`}
                        >
                          {ligne.badge}
                        </span>
                      </td>
                      <td className="nom">
                        <TexteArabe>{ligne.client}</TexteArabe>
                        {ligne.anomalie ? <span className="finance-marque">!</span> : null}
                      </td>
                      <td>
                        <span className="finance-montant mono" dir="ltr">
                          {ligne.especes}
                        </span>
                      </td>
                      <td>
                        <span className="finance-montant mono" dir="ltr">
                          {ligne.banque}
                        </span>
                      </td>
                      <td className="centre">
                        <span
                          className={`finance-badge simple micro${
                            badgeSansCadreALImpression('mode', ligne.codeMode) ? ' sans-cadre' : ''
                          }`}
                        >
                          {ligne.codeMode}
                        </span>
                      </td>
                      <td className="gauche mono" dir="ltr">
                        {ligne.valeurReelle}
                      </td>
                      <td className="micro" title={ligne.infosInstrument}>
                        <TexteArabe>{ligne.infosInstrument}</TexteArabe>
                      </td>
                      <td className="mini">
                        <TexteArabe>{ligne.employe}</TexteArabe>
                      </td>
                      <td className="mini">
                        <TexteArabe>{ligne.rabatteur}</TexteArabe>
                      </td>
                      <td className="micro" title={ligne.hotel}>
                        <TexteArabe>{ligne.hotel}</TexteArabe>
                      </td>
                      <td className="centre mono">{ligne.chambre}</td>
                      <td className="micro" title={ligne.vol}>
                        <TexteArabe>{ligne.vol}</TexteArabe>
                      </td>
                      <td className="gauche mono" dir="ltr">
                        {ligne.convenu}
                      </td>
                      <td className="gauche mono" dir="ltr">
                        {ligne.restant}
                      </td>
                      <td className="centre">
                        <span
                          className={`finance-badge${ligne.statut === '✓' ? ' gris' : ' simple'}${
                            badgeSansCadreALImpression('statut', ligne.statut) ? ' sans-cadre' : ''
                          }`}
                        >
                          {ligne.statut}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* R-60 — les annulations forment un tableau distinct, sous le principal. */}
        {journal.annulations.length ? (
          <section className="finance-carte finance-annulations">
            <div className="finance-defilement">
              <table className="finance-tableau">
                <tbody>
                  {journal.annulations.map((ligne) => (
                    <tr key={ligne.id} className="annulee">
                      <td className="centre mono">{ligne.heure}</td>
                      <td className="centre">
                        <DateValeur>{ligne.date}</DateValeur>
                      </td>
                      <td className="centre mono">{ligne.numeroRecu}</td>
                      <td className="centre">
                        <span className="finance-badge gris">×</span>
                      </td>
                      <td className="nom">
                        <TexteArabe>{ligne.client}</TexteArabe>
                      </td>
                      <td>
                        <span className="finance-montant mono" dir="ltr">
                          {ligne.especes}
                        </span>
                      </td>
                      <td>
                        <span className="finance-montant mono" dir="ltr">
                          {ligne.banque}
                        </span>
                      </td>
                      <td className="centre">
                        <span
                          className={`finance-badge simple micro${
                            badgeSansCadreALImpression('mode', ligne.codeMode) ? ' sans-cadre' : ''
                          }`}
                        >
                          {ligne.codeMode}
                        </span>
                      </td>
                      <td className="gauche mono" dir="ltr">
                        {ligne.valeurReelle}
                      </td>
                      <td className="micro" title={ligne.infosInstrument}>
                        <TexteArabe>{ligne.infosInstrument}</TexteArabe>
                      </td>
                      <td className="mini">
                        <TexteArabe>{ligne.employe}</TexteArabe>
                      </td>
                      <td className="mini">
                        <TexteArabe>{ligne.rabatteur}</TexteArabe>
                      </td>
                      <td className="micro">
                        <TexteArabe>{ligne.hotel}</TexteArabe>
                      </td>
                      <td className="centre mono">{ligne.chambre}</td>
                      <td className="micro">
                        <TexteArabe>{ligne.vol}</TexteArabe>
                      </td>
                      <td className="gauche mono" dir="ltr">
                        {ligne.convenu}
                      </td>
                      <td className="gauche mono" dir="ltr">
                        0
                      </td>
                      <td className="centre">
                        <span className="finance-badge gris">×</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {/* Demande du commanditaire (2026-08-09) : les modifications, en
            bleu, sous le principal — même emplacement que les annulations
            (R-60). Colonnes propres : une modification n'a pas la forme
            d'un versement (pas d'espèces/banque/convenu/restant/statut). */}
        {journal.modificationsListe.length ? (
          <section className="finance-carte finance-modifications">
            <div className="finance-modifications-titre">{F.modifications}</div>
            <div className="finance-defilement">
              <table className="finance-tableau finance-tableau-modifications">
                <tbody>
                  {journal.modificationsListe.map((ligne) => (
                    <tr key={ligne.id} className="modifiee">
                      <td className="centre mono">{ligne.heure}</td>
                      <td className="centre">
                        <DateValeur>{ligne.date}</DateValeur>
                      </td>
                      <td className="centre">
                        <span className="finance-numero">
                          <Reference>{ligne.numeroRecu}</Reference>
                        </span>
                      </td>
                      <td className="nom">
                        <TexteArabe>{ligne.client}</TexteArabe>
                      </td>
                      <td className="mini">
                        <TexteArabe>{ligne.sectionLibelle}</TexteArabe>
                      </td>
                      <td className="finance-changements-cellule">
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
                      </td>
                      <td className="micro" title={ligne.motif}>
                        <TexteArabe>{ligne.motif}</TexteArabe>
                      </td>
                      <td className="mini">
                        <TexteArabe>{ligne.employe}</TexteArabe>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        <div className="finance-pied">
          <span className="mono" dir="ltr">
            {journal.nombreImpressions ? String(journal.nombreImpressions).padStart(2, '0') : ''}
          </span>
        </div>
        </div>
      </main>
    </div>
  )
}

/** Décale la journée sélectionnée d'un jour, comme les flèches ‹ et ›. */
function decaler(jour: string | null, pas: number, defaut: string): string {
  const base = new Date(`${jour || defaut}T12:00:00`)
  base.setDate(base.getDate() + pas)
  const annee = base.getFullYear()
  const mois = String(base.getMonth() + 1).padStart(2, '0')
  const jourDuMois = String(base.getDate()).padStart(2, '0')
  return `${annee}-${mois}-${jourDuMois}`
}
