'use client'

/**
 * Écran « الوصل » — le registre des reçus.
 *
 * Structure, langue, orientation, colonnes et ordre repris du fichier de
 * référence : barre d'outils (actions, recherches, titre), puis un tableau
 * dense de vingt colonnes en arabe, de droite à gauche, avec en-têtes collants
 * et actions en fin de ligne.
 *
 * Les colonnes suivent exactement l'ordre du fichier :
 * رقم · الاسم / النسب · المبلغ المتفق عليه · مجموع الدفعات · الباقي ·
 * تاريخ التسجيل · عدد الدفعات · آخر دفعة · الطريقة · الحالة · الفندق ·
 * الغرفة · الرحلة · الوسيط · ملاحظة · الموظف · التخفيض · رقم الهاتف ·
 * المجموعة · الإجراءات
 */

import { MAX_VERSEMENTS } from '../../domain/constants'
import { telephoneCorrespondRecherche } from '../../domain/format'
import { centimesEnTexteDevise } from '../../domain/money'
import { codeCouleurNature, natureNormalisee } from '../../domain/payment-method'
import { motifRefusVersement } from '../../domain/rules/payment'
import { dernierVersement, restantDu, statutAffiche, totalPaye } from '../../domain/rules/receipt'
import type { AnomalieFinanciere, Recu } from '../../domain/types'
import { DateValeur, Montant, Reference, Telephone, TexteArabe } from '../bidi'
import { IndicateurChargement } from '../spinner'
import { T } from '../textes'

/* Icônes des actions de ligne, reprises trait pour trait du fichier. */
const ICONE_CORBEILLE = ['M3 6h18', 'M8 6V4h8v2', 'M19 6l-1 14H6L5 6', 'M10 11v5M14 11v5']
const ICONE_CRAYON = ['M12 20h9', 'M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z']
const ICONE_IMPRIMANTE = [
  'M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2',
  'M6 14h12v8H6z',
]
const ICONE_PLUS = ['M12 5v14M5 12h14']

/* Icônes des deux actions de la barre d'outils. */
const ICONE_RECU_NEUF = [
  'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6',
  'M14 3l5 5v3',
  'M18 15v6M15 18h6',
]
const ICONE_CARTE = ['M19 15v-6']
/** La carte bancaire ajoute un rectangle et un cercle au tracé. */
const ICONE_CARTE_FORMES = (
  <>
    <rect height="12" rx="2" width="18" x="2" y="6" />
    <circle cx="11" cy="12" r="2.4" />
  </>
)

function IconeAction({
  chemins,
  taille = 14,
  rondeurs,
}: {
  chemins: string[]
  taille?: number
  rondeurs?: React.ReactNode
}) {
  return (
    <svg
      fill="none"
      height={taille}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width={taille}
      aria-hidden="true"
    >
      {rondeurs}
      {chemins.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  )
}

/** Libellé abrégé de la méthode, comme `receiptMethodDisplay()`. */
function libelleMethode(valeur: string): string {
  const nature = natureNormalisee(valeur)
  if (nature === 'نقد') return T.methodes.especes
  if (nature === 'شيك') return T.methodes.cheque
  if (nature === 'تحويل بنكي') return T.methodes.virement
  return '—'
}

function situation(recu: Recu): { texte: string; classe: string } {
  const valeur = statutAffiche(recu)
  if (valeur === 'ملغى') return { texte: T.statuts.annule, classe: 'annule' }
  if (valeur === 'مسدد') return { texte: T.statuts.solde, classe: 'solde' }
  return { texte: T.statuts.incomplet, classe: 'incomplet' }
}

/**
 * Décision du 2026-08-08 : seul le trop-perçu (`overpayment`) sort ici, jamais
 * `reste-a-payer` ni `justificatif-cheque-manquant` — deux anomalies
 * distinctes, hors du périmètre de cette décision.
 */
function anomalieTropPercu(recu: Recu): AnomalieFinanciere | undefined {
  return recu.anomalies.find((anomalie) => anomalie.type === 'trop-percu')
}

interface Proprietes {
  recus: Recu[]
  /**
   * Vrai entre la connexion et la fin du premier chargement des reçus : sans
   * ce signal, `recus` vide (hérité de `etatAnonyme()`) est indiscernable
   * d'un registre réellement vide, et affiche à tort « aucune donnée »
   * pendant que les vraies lignes arrivent encore.
   */
  chargement?: boolean
  rechercheNom: string
  rechercheNumero: string
  afficherAnnules: boolean
  onRechercheNom: (valeur: string) => void
  onRechercheNumero: (valeur: string) => void
  onAfficherAnnules: (valeur: boolean) => void
  onNouveauRecu: () => void
  /**
   * reprise.md §5.3 — depuis une ligne, on transmet l'identifiant réel du
   * reçu (jamais son numéro seul, qui n'est pas unique toutes saisons
   * confondues). Sans argument : recherche manuelle par numéro (bouton du haut).
   */
  onNouveauVersement: (recuId?: string) => void
  onOuvrirDetail: (recu: Recu) => void
  onOuvrirRecu: (recu: Recu) => void
  onAnnuler: (recu: Recu) => void
  onModifier: (recu: Recu) => void
}

export function EcranRegistre({
  recus,
  chargement,
  rechercheNom,
  rechercheNumero,
  afficherAnnules,
  onRechercheNom,
  onRechercheNumero,
  onAfficherAnnules,
  onNouveauRecu,
  onNouveauVersement,
  onOuvrirDetail,
  onOuvrirRecu,
  onAnnuler,
  onModifier,
}: Proprietes) {
  const lignes = recus
    .filter((recu) => (afficherAnnules ? true : recu.statut !== 'ملغى'))
    .filter((recu) => {
      const requete = rechercheNom.trim()
      if (!requete) return true
      // Même champ que le nom : numéro complet (brut ou mis en forme) ou 6
      // derniers chiffres. Toutes les lignes correspondantes s'affichent,
      // jamais un choix silencieux de la première (voir `telephoneCorrespondRecherche`).
      return `${recu.prenom} ${recu.nom}`.includes(requete) || telephoneCorrespondRecherche(recu.telephone, requete)
    })
    .filter((recu) =>
      rechercheNumero.trim() ? String(recu.numero).includes(rechercheNumero.trim()) : true,
    )
    .sort((a, b) => b.numero - a.numero)

  const actifs = recus.filter((recu) => recu.statut !== 'ملغى').length
  const annules = recus.length - actifs
  const C = T.registre.colonnes

  return (
    <div className="omra-page">
      <div className="omra-tools">
        <div className="omra-actions">
          {/* Le fichier place le libellé puis l'icône. */}
          <button className="omra-action primary" onClick={onNouveauRecu}>
            <span>{T.registre.nouveauRecu}</span>
            <IconeAction chemins={ICONE_RECU_NEUF} taille={16} />
          </button>
          <button className="omra-action" onClick={() => onNouveauVersement()}>
            <span>{T.registre.ajouterDfp}</span>
            <IconeAction chemins={ICONE_CARTE} taille={16} rondeurs={ICONE_CARTE_FORMES} />
          </button>
        </div>

        <div className="omra-searches">
          <div className="omra-search name">
            <label htmlFor="recherche-nom">{T.registre.rechercheNom}</label>
            <input
              id="recherche-nom"
              type="search"
              placeholder={T.registre.rechercher}
              value={rechercheNom}
              onChange={(evenement) => onRechercheNom(evenement.target.value)}
            />
          </div>
          <div className="omra-search receipt">
            <label htmlFor="recherche-numero">{T.registre.rechercheNumero}</label>
            <input
              id="recherche-numero"
              type="search"
              className="mono"
              dir="ltr"
              value={rechercheNumero}
              onChange={(evenement) =>
                onRechercheNumero(evenement.target.value.replace(/\D/g, ''))
              }
            />
          </div>
        </div>

        <div className="omra-title">
          <p>{T.registre.sousTitre(actifs, annules)}</p>
        </div>
      </div>

      <div className="omra-card">
        <div className="omra-scroll">
            <table className="omra-table">
              <thead>
                <tr>
                  <th className="centre" style={{ width: 52 }}>
                    {C.numero}
                  </th>
                  <th style={{ width: 232 }}>{C.nom}</th>
                  <th className="centre">{C.convenu}</th>
                  <th className="centre">{C.paye}</th>
                  <th className="centre">{C.restant}</th>
                  <th className="centre">{C.date}</th>
                  <th className="centre">{C.nbVersements}</th>
                  <th className="centre">{C.derniereDfp}</th>
                  <th className="centre">{C.methode}</th>
                  <th>{C.statut}</th>
                  <th>{C.hotel}</th>
                  <th className="centre">{C.chambre}</th>
                  <th>{C.vol}</th>
                  <th>{C.rabatteur}</th>
                  <th className="secondaire">{C.note}</th>
                  <th className="secondaire">{C.employe}</th>
                  <th className="secondaire centre">{C.reduction}</th>
                  <th className="secondaire">{C.telephone}</th>
                  <th className="secondaire">{C.groupe}</th>
                  <th className="centre" style={{ width: 136 }}>
                    {C.actions}
                  </th>
                </tr>
              </thead>
              <tbody>
                {/* Le fichier garde les en-têtes et pose l'état vide dans le tableau. */}
                {chargement ? (
                  <tr>
                    <td colSpan={20}>
                      <div className="omra-empty">
                        <span className="omra-spinner-grand">
                          <IndicateurChargement />
                        </span>
                      </div>
                    </td>
                  </tr>
                ) : lignes.length === 0 ? (
                  <tr>
                    <td colSpan={20}>
                      <div className="omra-empty">
                        <svg
                          fill="none"
                          height="34"
                          stroke="currentColor"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="1.5"
                          viewBox="0 0 24 24"
                          width="34"
                          aria-hidden="true"
                        >
                          <circle cx="11" cy="11" r="7" />
                          <path d="M16.5 16.5L21 21" />
                        </svg>
                        <strong>{T.registre.videTitre}</strong>
                        <span>{T.registre.videAide}</span>
                      </div>
                    </td>
                  </tr>
                ) : null}
                {lignes.map((recu) => {
                  const annule = recu.statut === 'ملغى'
                  const paye = totalPaye(recu)
                  const restant = restantDu(recu)
                  const dernier = dernierVersement(recu)
                  const etat = situation(recu)
                  const versementImpossible = Boolean(motifRefusVersement(recu))

                  return (
                    <tr
                      key={recu.id}
                      className={annule ? 'annule' : ''}
                      title={T.registre.infobulleLigne}
                      onDoubleClick={() => onOuvrirDetail(recu)}
                    >
                      <td className="centre">
                        <span className={`omra-numero${annule ? ' annule' : ''}`}>
                          <Reference>{recu.numero}</Reference>
                        </span>
                      </td>
                      <td style={{ fontWeight: 600, fontSize: 13.5 }}>
                        <TexteArabe>{`${recu.prenom} ${recu.nom}`}</TexteArabe>
                      </td>
                      <td className="centre">
                        <Montant centimes={recu.convenuCentimes} avecDevise={false} />
                      </td>
                      <td className="centre">
                        <Montant centimes={paye} avecDevise={false} />
                      </td>
                      <td className="centre">
                        {/*
                          Décision du 2026-08-08 (reprise.md §5.11 à la
                          lettre) : un restant ≤ 0 est soldé, trop-perçu
                          compris — même bleu calme que partout ailleurs. La
                          visibilité du trop-perçu ne repose plus sur cette
                          couleur : voir le badge d'anomalie indépendant
                          (`omra-anomalie`) juste après.
                        */}
                        <span
                          style={{
                            color: restant <= 0 ? 'var(--solde)' : 'var(--danger)',
                            fontWeight: restant <= 0 ? 400 : 600,
                          }}
                        >
                          <Montant centimes={restant} avecDevise={false} />
                        </span>
                      </td>
                      <td className="centre">
                        <DateValeur>{recu.date}</DateValeur>
                      </td>
                      <td className="centre">
                        <span className="mono" style={{ fontWeight: 600 }} dir="ltr">
                          {recu.versements.length}
                          <span style={{ fontWeight: 400, color: '#6E7565', fontSize: 10.5 }}>
                            /{MAX_VERSEMENTS}
                          </span>
                        </span>
                      </td>
                      <td className="centre" style={{ color: '#7C8374' }}>
                        {dernier ? (
                          <Montant centimes={dernier.montantCentimes} avecDevise={false} />
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="centre">
                        {dernier ? (
                          <span className={`omra-method ${codeCouleurNature(dernier.nature)}`}>
                            {libelleMethode(dernier.nature)}
                          </span>
                        ) : (
                          <span className="omra-method none">—</span>
                        )}
                      </td>
                      <td>
                        <span className={`omra-pill ${etat.classe}`}>{etat.texte}</span>
                        {anomalieTropPercu(recu) ? (
                          <span
                            className="omra-anomalie"
                            title={`${T.registre.anomalieTropPercu} — ${centimesEnTexteDevise(anomalieTropPercu(recu)!.montantCentimes ?? 0)}`}
                          >
                            {T.registre.anomalieTropPercu}
                          </span>
                        ) : null}
                      </td>
                      <td>
                        <TexteArabe>{recu.hotel}</TexteArabe>
                      </td>
                      <td className="centre">
                        <Reference>{recu.chambre}</Reference>
                      </td>
                      <td>
                        <TexteArabe>{recu.vol}</TexteArabe>
                      </td>
                      <td>
                        <TexteArabe>{recu.rabatteur}</TexteArabe>
                      </td>
                      <td className="omra-cell-muted">
                        {/* domain/bidi.ts range « note » parmi les valeurs
                            arabes, au même titre que hôtel/vol/rabatteur
                            ci-dessus : seule cette colonne n'était pas
                            passée par `TexteArabe`. */}
                        <TexteArabe className="omra-note">{recu.note || '—'}</TexteArabe>
                      </td>
                      <td className="omra-cell-muted">
                        <TexteArabe>{recu.employe}</TexteArabe>
                      </td>
                      <td className="omra-cell-muted centre">
                        <Montant centimes={recu.reductionCentimes} avecDevise={false} />
                      </td>
                      <td className="omra-cell-muted">
                        <Telephone>{recu.telephone}</Telephone>
                      </td>
                      {/* Étiquette libre pouvant contenir de l'arabe (règle
                          groupe/famille) : même traitement que dans le
                          détail du voyageur (`detail.tsx`), qui la passe
                          déjà par `TexteArabe`. */}
                      <td className="omra-cell-muted">
                        <TexteArabe>{recu.groupe || '—'}</TexteArabe>
                      </td>
                      <td onDoubleClick={(evenement) => evenement.stopPropagation()}>
                        {/* Ordre du fichier : annuler, modifier, imprimer, dépense. */}
                        <div className="omra-row-actions">
                          <button
                            className="omra-row-btn danger"
                            title={T.registre.actionAnnuler}
                            disabled={annule}
                            onClick={() => onAnnuler(recu)}
                          >
                            <IconeAction chemins={ICONE_CORBEILLE} />
                          </button>
                          <button
                            className="omra-row-btn warn"
                            title={T.registre.actionModifier}
                            disabled={annule}
                            onClick={() => onModifier(recu)}
                          >
                            <IconeAction chemins={ICONE_CRAYON} />
                          </button>
                          <button
                            className="omra-row-btn accent"
                            title={T.registre.actionImprimer}
                            onClick={() => onOuvrirRecu(recu)}
                          >
                            <IconeAction chemins={ICONE_IMPRIMANTE} />
                          </button>
                          <button
                            className="omra-row-btn accent"
                            title={T.registre.actionDfp}
                            disabled={versementImpossible}
                            onClick={() => onNouveauVersement(recu.id)}
                          >
                            <IconeAction chemins={ICONE_PLUS} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
        </div>

        {/* Pied du tableau : compteur puis bascule des reçus annulés. */}
        <div className="omra-table-pied">
          <span>{T.registre.compte(lignes.length, actifs)}</span>
          <button className="omra-lien" onClick={() => onAfficherAnnules(!afficherAnnules)}>
            {afficherAnnules ? T.registre.masquerAnnules : T.registre.montrerAnnules(annules)}
          </button>
        </div>
      </div>
    </div>
  )
}
