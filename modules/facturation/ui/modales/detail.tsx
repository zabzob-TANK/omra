'use client'

/**
 * Fenêtre « Dossier complet du voyageur ».
 *
 * Suit la composition du fichier de référence : en-tête avec pastille et nom,
 * bande d'identité sombre, bande financière en quatre cellules, corps en deux
 * colonnes (identité à droite, programme et enregistrement empilés à gauche),
 * tableau des versements, puis historique et annulation repliables.
 */

import { codeCouleurNature, natureNormalisee } from '../../domain/payment-method'
import { collecterOperationsBancaires } from '../../domain/rules/cheque-register'
import { motifRefusVersement } from '../../domain/rules/payment'
import { restantDu, statutAffiche, totalPaye } from '../../domain/rules/receipt'
import type { OperationPartagee, Recu, Saison } from '../../domain/types'
import { Dialogue } from '../dialogue'
import { DateValeur, Montant, Reference, Telephone, TexteArabe } from '../bidi'
import { T } from '../textes'

function libelleNature(valeur: string): string {
  const nature = natureNormalisee(valeur)
  if (nature === 'نقد') return T.methodes.especes
  if (nature === 'شيك') return T.methodes.cheque
  if (nature === 'تحويل بنكي') return T.methodes.virement
  return '—'
}

/** Libellés français des statuts calculés. */
export function libelleStatut(recu: Recu): { texte: string; classe: string } {
  const statut = statutAffiche(recu)
  if (statut === 'ملغى') return { texte: T.statuts.annule, classe: 'annule' }
  if (statut === 'مسدد') return { texte: T.statuts.solde, classe: 'solde' }
  return { texte: T.statuts.incomplet, classe: 'incomplet' }
}

/** Ligne « étiquette / valeur » des cartes du corps. */
function Ligne({
  label,
  large,
  children,
  classeValeur,
}: {
  label: string
  /** Étiquette élargie, pour la carte d'identité. */
  large?: boolean
  children: React.ReactNode
  /** Classe supplémentaire, pour une valeur mise en retrait visuel. */
  classeValeur?: string
}) {
  return (
    <div className={`detail-ligne${large ? ' large' : ''}`}>
      <span className="detail-ligne-label">{label}</span>
      <span className={`detail-ligne-valeur${classeValeur ? ` ${classeValeur}` : ''}`}>
        {children}
      </span>
    </div>
  )
}

function IconePersonne({ taille }: { taille: number }) {
  return (
    <svg
      fill="none"
      height={taille}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.6"
      viewBox="0 0 24 24"
      width={taille}
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

interface Proprietes {
  recu: Recu
  saison: Saison
  /** R-90 — portrait du passeport, s'il en existe un. */
  portrait?: string
  /** R-73 — sert à retrouver l'opération bancaire portant l'image. */
  operations: OperationPartagee[]
  onFermer: () => void
  onOuvrirRecu: () => void
  /** Ouvre le détail de l'opération bancaire depuis la colonne « الوثيقة ». */
  onOuvrirInstrument: (cle: string) => void
  /** Raccourci : ouvre directement « Ajouter un versement » pour ce reçu. */
  onNouveauVersement: () => void
}

export function ModaleDetail({
  recu,
  saison,
  portrait,
  operations,
  onFermer,
  onOuvrirRecu,
  onOuvrirInstrument,
  onNouveauVersement,
}: Proprietes) {
  const statut = libelleStatut(recu)
  const paye = totalPaye(recu)
  const restant = restantDu(recu)
  const nomComplet = `${recu.prenom} ${recu.nom}`
  const modifie = recu.modifications.length > 0
  const versementImpossible = Boolean(motifRefusVersement(recu))

  // Le fichier relie chaque versement bancaire à son opération pour savoir s'il
  // porte déjà une image. On réutilise le regroupement du domaine.
  const parVersement = new Map<string, { cle: string; aImage: boolean }>()
  for (const operation of collecterOperationsBancaires([recu], operations)) {
    for (const attribution of operation.attributions) {
      parVersement.set(attribution.versementId, {
        cle: operation.cle,
        aImage: Boolean(operation.image),
      })
    }
  }

  return (
    <Dialogue
      titre={T.detail.titre}
      taille="large"
      classeCoque="detail-coque"
      onFermer={onFermer}
      icone={<IconePersonne taille={18} />}
      sousTitre={<TexteArabe>{nomComplet}</TexteArabe>}
      entete={
        <>
          <span className={`omra-pill ${statut.classe}`}>{statut.texte}</span>
          <span className={`omra-pill${modifie ? ' modifie' : ''}`}>
            {modifie ? T.detail.modifieNFois(recu.modifications.length) : T.detail.nonModifie}
          </span>
        </>
      }
      bandeau={
        <>
          {/* Bande sombre : portrait, identité, numéro de reçu. */}
          <div className="detail-bande">
            <div className="detail-photo">
              {portrait ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={portrait} alt={T.passeport.alternativePortrait} />
              ) : (
                <div className="vide" aria-hidden="true">
                  <IconePersonne taille={28} />
                </div>
              )}
            </div>
            <div className="detail-identite">
              <div className="nom">
                <TexteArabe>{nomComplet}</TexteArabe>
              </div>
              <div className="lignes">
                <span>
                  <Telephone>{recu.telephone}</Telephone>
                </span>
                <span>
                  <TexteArabe>{recu.groupe || '—'}</TexteArabe>
                </span>
                <span>
                  <TexteArabe>{saison.nom}</TexteArabe>
                </span>
              </div>
            </div>
            <div className="detail-numero">
              <div className="etiquette">{T.detail.numeroRecu}</div>
              <div className="valeur">{recu.numero}</div>
              <div className="date">{recu.date}</div>
              <div className="heure">{recu.creeLe.split(' ')[1] ?? ''}</div>
            </div>
          </div>

          {/* Bande financière : prix d'origine et remise, convenu, payé, restant. */}
          <div className="detail-finance">
            <div className="detail-finance-cellule empilee">
              <div className="etiquette">{T.detail.prixOrigine}</div>
              <div className="valeur petite">
                <Montant centimes={recu.tarifCentimes} />
              </div>
              <div className="etiquette secondaire">{T.detail.reduction}</div>
              <div className="valeur petite douce">
                <Montant centimes={recu.reductionCentimes} />
              </div>
            </div>
            <div className="detail-finance-cellule convenu">
              <div className="etiquette">{T.detail.convenu}</div>
              <div className="valeur">
                <Montant centimes={recu.convenuCentimes} />
              </div>
            </div>
            <div className="detail-finance-cellule paye">
              <div className="etiquette">{T.detail.paye}</div>
              <div className="valeur">
                <Montant centimes={paye} />
              </div>
              <div className="appoint">{T.detail.nbVersements(recu.versements.length)}</div>
            </div>
            {/*
              Restant exactement nul : bleu. Toute autre valeur, y compris
              négative (trop-perçu, P13/§5.11), reste en rouge comme le
              fichier de référence — sans quoi l'anomalie deviendrait
              invisible.
            */}
            <div className={`detail-finance-cellule restant${restant === 0 ? ' solde' : ''}`}>
              <div className="etiquette">{T.detail.restant}</div>
              <div className="valeur grande">
                <Montant centimes={restant} />
              </div>
            </div>
          </div>
        </>
      }
      pied={
        <>
          <button
            className="omra-btn"
            title={T.registre.ajouterDfp}
            disabled={versementImpossible}
            onClick={onNouveauVersement}
          >
            <svg
              fill="none"
              height="14"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="2"
              viewBox="0 0 24 24"
              width="14"
              aria-hidden="true"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
          {/* Le fichier place l'action d'impression en premier parmi ses
              propres boutons ; celui-ci reste juste après le raccourci
              d'ajout de dfp, ajouté hors fichier de référence. */}
          <button className="omra-btn primary" title={T.detail.voirRecu} onClick={onOuvrirRecu}>
            <svg
              fill="none"
              height="14"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
              width="14"
              aria-hidden="true"
            >
              <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
          <button className="omra-btn" onClick={onFermer}>
            {T.detail.fermer}
          </button>
        </>
      }
    >
      <div className="detail-grille">
        <section className="detail-carte">
          <h3>{T.detail.identiteContact}</h3>
          <div className="detail-lignes">
            <Ligne label={T.detail.passeport} large>
              {recu.passeport ? (
                <span className="detail-passeport present">
                  <TexteArabe>{T.detail.passeportEnregistre}</TexteArabe>
                  {recu.passeport.numero ? (
                    <>
                      {' — '}
                      <Reference>{recu.passeport.numero}</Reference>
                    </>
                  ) : null}
                </span>
              ) : (
                <span className="detail-passeport absent">
                  <TexteArabe>{T.detail.passeportAbsent}</TexteArabe>
                </span>
              )}
            </Ligne>
            <Ligne label={T.detail.telephone} large>
              <Telephone>{recu.telephone}</Telephone>
            </Ligne>
            <Ligne label={T.detail.rabatteur} large>
              <TexteArabe>{recu.rabatteur || '—'}</TexteArabe>
            </Ligne>
            <Ligne label={T.detail.note} large>
              <span className="detail-note">{recu.note || '—'}</span>
            </Ligne>
            <Ligne label={T.detail.groupe} large>
              <TexteArabe>{recu.groupe || '—'}</TexteArabe>
            </Ligne>
          </div>
        </section>

        <div className="detail-pile">
          <section className="detail-carte">
            <h3>{T.detail.programme}</h3>
            <div className="detail-lignes duo">
              <Ligne label={T.detail.hotel}>
                <TexteArabe>{recu.hotel}</TexteArabe>
              </Ligne>
              <Ligne label={T.detail.vol}>
                <TexteArabe>{recu.vol}</TexteArabe>
              </Ligne>
              <Ligne label={T.detail.chambre}>
                <Reference>{recu.chambre}</Reference>
              </Ligne>
              <Ligne label={T.detail.saison} classeValeur="detail-ligne-valeur-discrete">
                <TexteArabe>{saison.nom}</TexteArabe>
              </Ligne>
            </div>
          </section>

          <section className="detail-carte">
            <h3>{T.detail.infosEnregistrement}</h3>
            <div className="detail-lignes duo">
              <Ligne label={T.detail.employe} classeValeur="detail-ligne-valeur-discrete">
                <TexteArabe>{recu.employe}</TexteArabe>
              </Ligne>
              <Ligne label={T.detail.impression} classeValeur="detail-ligne-valeur-discrete">
                <Reference>{recu.impressions}</Reference>
              </Ligne>
              {modifie && recu.derniereModification ? (
                <Ligne label={T.detail.derniereModification}>
                  <DateValeur>{recu.derniereModification}</DateValeur>
                </Ligne>
              ) : null}
              {modifie && recu.modifiePar ? (
                <Ligne label={T.detail.modifiePar}>
                  <TexteArabe>{recu.modifiePar}</TexteArabe>
                </Ligne>
              ) : null}
            </div>
          </section>
        </div>
      </div>

      <section className="detail-carte tableau">
        <div className="detail-carte-entete">
          <h3>{T.detail.dfpEnregistrees}</h3>
          <span className="detail-compteur">{recu.versements.length}</span>
        </div>
        <div className="detail-defilement">
          <table className="omra-mini-table detail-table">
            <thead>
              <tr>
                <th>{T.detail.colonnes.rang}</th>
                <th>{T.detail.colonnes.date}</th>
                <th>{T.detail.colonnes.montant}</th>
                <th>{T.detail.colonnes.methode}</th>
                <th>{T.detail.colonnes.document}</th>
                <th>{T.detail.colonnes.reference}</th>
                <th>{T.detail.colonnes.dateInstrument}</th>
                <th>{T.detail.colonnes.banque}</th>
                <th>{T.detail.colonnes.payeur}</th>
                <th>{T.detail.colonnes.montantOperation}</th>
                <th>{T.detail.colonnes.employe}</th>
              </tr>
            </thead>
            <tbody>
              {recu.versements.map((versement) => {
                const instrument = parVersement.get(versement.id)
                return (
                  <tr key={versement.id}>
                    <td className="mono rang">{versement.rang}</td>
                    <td>
                      <DateValeur>{versement.date}</DateValeur>
                    </td>
                    <td className="montant">
                      <Montant centimes={versement.montantCentimes} />
                    </td>
                    <td>
                      <span className={`omra-method ${codeCouleurNature(versement.nature)}`}>
                        {libelleNature(versement.nature)}
                      </span>
                    </td>
                    <td>
                      {instrument ? (
                        <button
                          className="detail-doc"
                          onClick={() => onOuvrirInstrument(instrument.cle)}
                        >
                          {instrument.aImage ? T.detail.imageVoir : T.detail.imageAjouter}
                        </button>
                      ) : (
                        <span className="omra-cell-muted">—</span>
                      )}
                    </td>
                    <td>
                      {versement.referenceInstrument ? (
                        <Reference>{versement.referenceInstrument}</Reference>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      {versement.dateInstrument ? (
                        <DateValeur>{versement.dateInstrument}</DateValeur>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>{versement.banque ? <TexteArabe>{versement.banque}</TexteArabe> : '—'}</td>
                    <td>{versement.payeur ? <TexteArabe>{versement.payeur}</TexteArabe> : '—'}</td>
                    <td>
                      {versement.montantOperationCentimes ? (
                        <Montant centimes={versement.montantOperationCentimes} />
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="employe">
                      <TexteArabe>{versement.enregistrePar || '—'}</TexteArabe>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {modifie ? (
        <details className="detail-repli">
          <summary>
            <span className="detail-repli-icone" aria-hidden="true">
              ↶
            </span>
            {T.detail.journalModifications}
            <span className="detail-repli-compteur">{recu.modifications.length}</span>
            <span className="detail-repli-aide">{T.detail.ouvrirHistorique}</span>
          </summary>
          <div className="detail-repli-corps">
            {recu.modifications.map((modification) => (
              <div className="detail-modif" key={modification.id}>
                <div className="detail-modif-tete">
                  <strong>{modification.sectionLibelle}</strong>
                  <span className="mono">
                    <DateValeur>{modification.dateHeure}</DateValeur>
                  </span>
                  <span>
                    <TexteArabe>{modification.employe}</TexteArabe>
                  </span>
                </div>
                <div className="detail-modif-motif">
                  <span>{T.detail.motifPrefixe}</span> <b>{modification.motif}</b>
                </div>
                <div className="detail-modif-changements">
                  {modification.changements.map((changement, index) => (
                    <div className="detail-changement" key={index}>
                      <span className="champ">{changement.champ}</span>
                      <span className="ancienne">{changement.ancienne || '—'}</span>
                      <span className="fleche">→</span>
                      <span className="nouvelle">{changement.nouvelle || '—'}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </details>
      ) : null}

      {recu.statut === 'ملغى' ? (
        <details className="detail-repli annulation">
          <summary>
            <span className="detail-repli-icone" aria-hidden="true">
              ✕
            </span>
            {T.detail.infosAnnulation}
          </summary>
          <div className="detail-repli-corps">
            <Ligne label={T.detail.motif} large>
              <b>
                <TexteArabe>{recu.motifAnnulation}</TexteArabe>
              </b>
            </Ligne>
            <Ligne label={T.detail.annulePar} large>
              <b>
                <TexteArabe>{recu.annulePar ?? '—'}</TexteArabe>
              </b>
            </Ligne>
            <Ligne label={T.detail.dateAnnulation} large>
              <DateValeur>{recu.annuleLe ?? '—'}</DateValeur>
            </Ligne>
          </div>
        </details>
      ) : null}
    </Dialogue>
  )
}
