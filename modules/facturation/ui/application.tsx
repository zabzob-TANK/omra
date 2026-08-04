'use client'

/**
 * Coque de l'application.
 *
 * Reproduit la navigation du fichier de référence : écran de connexion, puis
 * en-tête global (marque, navigation الوصل / المالية / الإحصائيات, saison,
 * journal, mode nuit, utilisateur, sortie) et l'écran courant.
 *
 * Langue et orientation par écran, conformes au fichier : les écrans de ce lot
 * sont en arabe, de droite à gauche.
 *
 * Aucune règle métier n'est décidée ici : toute écriture passe par les actions
 * serveur, qui appellent le noyau.
 *
 * R-87 — Mode sombre conservé d'une session à l'autre.
 * R-88 — Notification transitoire de 2 800 ms.
 * R-89 — La touche d'échappement ferme toute fenêtre (voir `Dialogue`).
 */

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'

import type { EtatFacturation } from '../data/service'
import type { SaisieAnnulation } from '../domain/rules/cancellation'
import type { SaisieNouveauRecu } from '../domain/rules/create-receipt'
import type { SaisieModification } from '../domain/rules/edit-sections'
import type { Resultat } from '../domain/rules/errors'
import { messageErreur } from '../domain/rules/errors'
import type { SaisieVersement } from '../domain/rules/payment'
import { restantDu } from '../domain/rules/receipt'
import { centimesEnTexteDevise } from '../domain/money'
import type { Recu, Utilisateur } from '../domain/types'
import { cleJour, decalerCleJour } from '../domain/dates'
import type {
  JournalFinancier,
  RegistreBancaire,
  SuiviJournalier,
} from '../data/service'
import type { PeriodeFinance } from '../domain/rules/finance-day'
import type { FiltresRegistre } from '../domain/rules/cheque-register'
import {
  basculerSelection,
  basculerToutesVisibles,
  selectionApresMasquage,
} from '../domain/rules/daily'
import {
  CONFIRMATION_SUPPRESSION_IMAGE,
  MESSAGE_IMAGE_ENREGISTREE,
  MESSAGE_IMAGE_SUPPRIMEE,
  libellesInstrument,
} from '../domain/rules/cheque-register'
import { EcranAVenir } from './ecrans/a-venir'
import { EcranConnexion } from './ecrans/connexion'
import { EcranFinance } from './ecrans/finance'
import { EcranPaiements } from './ecrans/paiements'
import { EcranSuiviJournalier } from './ecrans/suivi-journalier'
import { ModalePaiementDetail } from './modales/paiement-detail'
import { ModalePaiementImage, type CiblePaiement } from './modales/paiement-image'
import { SousNavFinance } from './sous-nav'
import { EcranRecu } from './ecrans/recu'
import { EcranRegistre } from './ecrans/registre'
import { EcranStatistiques } from './ecrans/statistiques'
import { ModaleAnnulation } from './modales/annulation'
import { ModaleAnomalieFinance } from './modales/anomalie-finance'
import { ModaleDetail } from './modales/detail'
import { ModaleJournal } from './modales/journal'
import { ModaleModification } from './modales/modification'
import { ModaleNouveauRecu } from './modales/nouveau-recu'
import { ModaleVersement } from './modales/versement'
import { TexteArabe } from './bidi'
import { creerStoreModeSombre, DUREE_NOTIFICATION } from './preferences'
import { T } from './textes'
import './styles.css'
// Couche additive : le mode clair reste intact, le sombre s'y superpose.
import './theme-sombre.css'

type Ecran =
  | { nom: 'registre' }
  | { nom: 'recu'; recuId: string }
  | { nom: 'statistiques' }
  | { nom: 'finance' }
  | { nom: 'suivi' }
  | { nom: 'paiements' }

type Fenetre =
  | { type: 'aucune' }
  | { type: 'nouveau' }
  | { type: 'versement'; recuId?: string }
  | { type: 'annulation'; recuId: string }
  | { type: 'modification'; recuId: string }
  | { type: 'detail'; recuId: string }
  | { type: 'journal' }
  | { type: 'anomalieFinance' }
  | { type: 'paiementDetail'; cle: string }
  | { type: 'paiementImage'; cible: CiblePaiement }

export interface ActionsFacturation {
  connecter: (identifiant: string, motDePasse: string) => Promise<Utilisateur | null>
  deconnecter: () => Promise<void>
  recharger: () => Promise<EtatFacturation>
  creerRecu: (
    saisie: SaisieNouveauRecu,
    confirme: boolean,
  ) => Promise<Resultat<{ recuId: string; numero: number }>>
  ajouterVersement: (
    saisie: SaisieVersement,
    confirme: boolean,
  ) => Promise<Resultat<{ recuId: string }>>
  annulerRecu: (recuId: string, saisie: SaisieAnnulation) => Promise<Resultat<null>>
  modifierRecu: (
    recuId: string,
    saisie: SaisieModification,
    confirme: boolean,
  ) => Promise<Resultat<null>>
  enregistrerImpression: (recuId: string) => Promise<Resultat<null>>
  journalFinancier: (periode: PeriodeFinance) => Promise<JournalFinancier>
  enregistrerImpressionFinance: (jour: string) => Promise<Resultat<{ numeroImpression: number }>>
  acquitterAnomalies: (jour: string) => Promise<Resultat<null>>
  suiviJournalier: (options: {
    mois?: string
    selection?: readonly string[]
    afficherVides?: boolean
  }) => Promise<SuiviJournalier>
  registreBancaire: (
    filtres: Partial<FiltresRegistre>,
    cleSelectionnee: string | null,
  ) => Promise<RegistreBancaire>
  ajouterImageOperation: (donnees: FormData) => Promise<Resultat<null>>
  supprimerImageOperation: (cle: string) => Promise<Resultat<null>>
  ajouterImageDernierVersement: (donnees: FormData) => Promise<Resultat<null>>
  ajouterImagesPasseport: (donnees: FormData) => Promise<Resultat<null>>
}

export function ApplicationFacturation({
  etatInitial,
  actions,
  comptesEssai,
}: {
  etatInitial: EtatFacturation
  actions: ActionsFacturation
  /** Comptes d'essai affichés sur l'écran de connexion, comme dans la référence. */
  comptesEssai: string[]
}) {
  const [etat, setEtat] = useState(etatInitial)
  // Aucune saison active : registre, Finance, Suivi journalier et Paiements
  // affichent un message propre au lieu de leur contenu habituel — état
  // d'exploitation normal (avant la première saison, ou entre deux), pas une
  // panne. Voir `EcranAVenir` plus bas et `service.ts::chargerEtat()`.
  const aucuneSaison = etat.saisonIndisponible
  // L'authentification omra a déjà eu lieu avant que cette interface ne soit
  // montée (`requireActiveAccount()` dans `app/facturation/page.tsx`) :
  // `chargerEtat()` porte donc toujours un utilisateur réel ici, et l'écran
  // de connexion du prototype (ci-dessous) ne s'affiche plus jamais côté omra.
  const [utilisateur, setUtilisateur] = useState<Utilisateur | null>(etatInitial.utilisateur)
  const [ecran, setEcran] = useState<Ecran>({ nom: 'registre' })
  const [fenetre, setFenetre] = useState<Fenetre>({ type: 'aucune' })
  // R-85 — un reçu ouvert juste après sa création est l'original ; rouvert
  // ensuite, le fichier de référence le marque « نسخة ».
  const [recuOriginal, setRecuOriginal] = useState<string | null>(null)
  const [journal, setJournal] = useState<JournalFinancier | null>(null)
  const [suivi, setSuivi] = useState<SuiviJournalier | null>(null)
  const [moisSuivi, setMoisSuivi] = useState<string | undefined>(undefined)
  const [selectionJournees, setSelectionJournees] = useState<string[]>([])
  const [afficherJourneesVides, setAfficherJourneesVides] = useState(true)
  const [registre, setRegistre] = useState<RegistreBancaire | null>(null)
  // Filet de sécurité générique pour Finance, Paiements et Suivi journalier :
  // vrai dès que l'un des trois chargements échoue (panne réseau, etc.),
  // affiche un « à venir » propre au lieu de laisser planter toute la page.
  // Les trois lisent désormais des données réelles (lot Finance 4a/4c).
  const [financeIndisponible, setFinanceIndisponible] = useState(false)
  const [filtresRegistre, setFiltresRegistre] = useState<Partial<FiltresRegistre>>({})
  const [periodeFinance, setPeriodeFinance] = useState<PeriodeFinance>({ filtre: 'day' })
  const [notification, setNotification] = useState<{ texte: string; erreur: boolean } | null>(null)

  const [rechercheNom, setRechercheNom] = useState('')
  const [rechercheNumero, setRechercheNumero] = useState('')
  const [afficherAnnules, setAfficherAnnules] = useState(false)

  // R-87 — préférence d'affichage, hors de React, dans le stockage du navigateur.
  const storeSombre = useMemo(
    () => creerStoreModeSombre(typeof window === 'undefined' ? null : window.localStorage),
    [],
  )
  const sombre = useSyncExternalStore(
    storeSombre.subscribe,
    storeSombre.lire,
    storeSombre.lireServeur,
  )

  // R-88
  const notifier = useCallback((texte: string, erreur = false) => {
    setNotification({ texte, erreur })
  }, [])

  useEffect(() => {
    if (!notification) return
    const minuteur = setTimeout(() => setNotification(null), DUREE_NOTIFICATION)
    return () => clearTimeout(minuteur)
  }, [notification])

  const rafraichir = useCallback(async () => {
    setEtat(await actions.recharger())
  }, [actions])

  const aujourdhui = cleJour(new Date())
  const hier = decalerCleJour(aujourdhui, -1)

  // Sans ce rattrapage, une erreur inattendue de journalFinancier,
  // suiviJournalier ou registreBancaire traverserait la Server Action jusqu'à
  // l'écran d'erreur de Next.js et ferait planter toute la page.
  const chargerJournal = useCallback(
    async (periode: PeriodeFinance) => {
      const resolue = periode.filtre === 'day' && !periode.jour ? { ...periode, jour: aujourdhui } : periode
      setPeriodeFinance(resolue)
      try {
        setJournal(await actions.journalFinancier(resolue))
        setFinanceIndisponible(false)
      } catch {
        setFinanceIndisponible(true)
      }
    },
    [actions, aujourdhui],
  )

  const chargerSuivi = useCallback(
    async (options: {
      mois?: string
      selection?: readonly string[]
      afficherVides?: boolean
    }) => {
      try {
        setSuivi(await actions.suiviJournalier(options))
        setFinanceIndisponible(false)
      } catch {
        setFinanceIndisponible(true)
      }
    },
    [actions],
  )

  const chargerRegistre = useCallback(
    async (filtres: Partial<FiltresRegistre>, cle: string | null = null) => {
      try {
        setRegistre(await actions.registreBancaire(filtres, cle))
        setFinanceIndisponible(false)
      } catch {
        setFinanceIndisponible(true)
      }
    },
    [actions],
  )

  /**
   * R-35, R-38 — Dépose l'image tenue en brouillon par le formulaire, une fois
   * le reçu ou le versement enregistré. Un versement partagé la porte sur son
   * opération, jamais sur lui-même : c'est le service qui en décide.
   */
  const envoyerImageInstrument = async (
    recuId: string,
    image: { contenu: Blob; nomOrigine: string } | null,
  ) => {
    if (!image) return
    const donnees = new FormData()
    donnees.set('recuId', recuId)
    donnees.set('fichier', image.contenu, image.nomOrigine)
    const resultat = await actions.ajouterImageDernierVersement(donnees)
    if (resultat.statut === 'erreurs') notifier(messageErreur(resultat.erreurs[0]), true)
  }

  /**
   * R-90 — Dépose l'image du passeport et son portrait après l'enregistrement
   * du reçu. Aucune lecture automatique n'intervient : ce sont les fichiers
   * choisis par l'utilisateur.
   */
  const envoyerImagesPasseport = async (
    recuId: string,
    images: { originale: Blob; portrait: Blob } | null,
  ) => {
    if (!images) return
    const donnees = new FormData()
    donnees.set('recuId', recuId)
    donnees.set('originale', images.originale, 'passeport.jpg')
    donnees.set('portrait', images.portrait, 'passeport-portrait.jpg')
    const resultat = await actions.ajouterImagesPasseport(donnees)
    if (resultat.statut === 'erreurs') notifier(messageErreur(resultat.erreurs[0]), true)
  }

  const ouvrirSuivi = () => {
    setEcran({ nom: 'suivi' })
    void chargerSuivi({
      mois: moisSuivi,
      selection: selectionJournees,
      afficherVides: afficherJourneesVides,
    })
  }

  const ouvrirPaiements = () => {
    setEcran({ nom: 'paiements' })
    void chargerRegistre(filtresRegistre)
  }

  /**
   * R-36 — l'ajout d'image n'est proposé que pour une opération qui n'en a pas.
   * La cible est décrite à partir de la ligne affichée : le brouillon reste
   * local à la fenêtre jusqu'à confirmation.
   */
  const ouvrirAjoutImage = (cle: string) => {
    const ligne = registre?.lignes.find((x) => x.cle === cle)
    if (!ligne) return
    const libelles = libellesInstrument(ligne.classeMode === 'transfer' ? 'تحويل بنكي' : 'شيك')
    setFenetre({
      type: 'paiementImage',
      cible: {
        cle,
        titre: libelles.titreAjout,
        libelleReference: libelles.libelleReference,
        libelleImport: libelles.libelleImport,
        numero: ligne.numero,
        banque: ligne.banque,
        montant: ligne.montant,
        payeur: ligne.payeurComplet || ligne.payeur,
        date: ligne.dateInstrument,
        virement: ligne.classeMode === 'transfer',
      },
    })
  }

  const recuParId = (id: string): Recu | undefined => etat.recus.find((recu) => recu.id === id)
  const fermer = () => setFenetre({ type: 'aucune' })

  const classeRacine = `omra${sombre ? ' sombre' : ''}`

  // ---- Écran de connexion, conservé comme dans le fichier de référence.
  if (!utilisateur) {
    return (
      <div className={classeRacine}>
        <EcranConnexion
          comptesEssai={comptesEssai}
          onConnexion={async (identifiant, motDePasse) => {
            const connecte = await actions.connecter(identifiant, motDePasse)
            if (connecte) {
              setUtilisateur(connecte)
              await rafraichir()
            }
            return connecte
          }}
        />
      </div>
    )
  }

  const estAdministrateur = etat.estAdministrateur

  // Le fichier de référence n'affiche pas l'en-tête global sur l'écran du reçu :
  // celui-ci occupe toute la page, avec sa propre barre d'outils.
  if (ecran.nom === 'recu') {
    const recuAffiche = recuParId(ecran.recuId)
    if (recuAffiche) {
      return (
        <div className={classeRacine}>
          <EcranRecu
            recu={recuAffiche}
            original={recuOriginal === recuAffiche.id}
            onRetour={() => setEcran({ nom: 'registre' })}
            onImpression={async () => {
              await actions.enregistrerImpression(recuAffiche.id)
              void rafraichir()
            }}
          />
        </div>
      )
    }
  }

  return (
    <div className={classeRacine}>
      <header className="omra-header">
        <div className="omra-brand">
          <div className="omra-logo" aria-hidden="true">
            <svg
              fill="none"
              height="20"
              stroke="#fff"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.7"
              viewBox="0 0 24 24"
              width="20"
            >
              <path d="M10 2h4M12 2v3" />
              <path d="M9 5h6a5 5 0 0 1 5 5v7a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5v-7a5 5 0 0 1 5-5z" />
              <path d="M4.5 14c2 0 2-1.4 4-1.4s2 1.4 4 1.4 2-1.4 4-1.4 2 1.4 3.5 1.4" />
            </svg>
          </div>
          <div>
            <div className="omra-brand-name">{T.marque.nom}</div>
            <div className="omra-brand-sub">{T.marque.sousTitre}</div>
          </div>
        </div>

        <nav className="omra-nav" aria-label={T.navigation.recu}>
          <button
            className={`omra-nav-item${ecran.nom === 'registre' || ecran.nom === 'recu' ? ' active' : ''}`}
            onClick={() => setEcran({ nom: 'registre' })}
          >
            {T.navigation.recu}
          </button>
          <button
            className={`omra-nav-item${ecran.nom === 'finance' ? ' active' : ''}`}
            onClick={() => {
              setEcran({ nom: 'finance' })
              void chargerJournal(periodeFinance)
            }}
          >
            {T.navigation.finance}
          </button>
          <button
            className={`omra-nav-item${ecran.nom === 'statistiques' ? ' active' : ''}`}
            onClick={() => setEcran({ nom: 'statistiques' })}
          >
            {T.navigation.statistiques}
          </button>
        </nav>

        <div className="omra-spacer" />

        {!aucuneSaison ? (
          <div className="omra-season">
            <span className="omra-season-dot" />
            <TexteArabe>{T.saisonActive(etat.saison.nom)}</TexteArabe>
          </div>
        ) : null}

        <button
          className="omra-icon-btn"
          title={T.navigation.journal}
          onClick={() => setFenetre({ type: 'journal' })}
        >
          <svg
            fill="none"
            height="15"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="2"
            viewBox="0 0 24 24"
            width="15"
            aria-hidden="true"
          >
            <path d="M12 8v4l3 2" />
            <circle cx="12" cy="12" r="9" />
          </svg>
        </button>

        <div className="omra-user">
          <div className="omra-avatar">{utilisateur.initiales}</div>
          <div>
            <div className="omra-user-name">
              <TexteArabe>{utilisateur.nom}</TexteArabe>
            </div>
            <div className="omra-user-role">
              <TexteArabe>{utilisateur.role}</TexteArabe>
            </div>
          </div>
          <button
            className="omra-icon-btn"
            title={T.navigation.sortie}
            onClick={async () => {
              await actions.deconnecter()
              // Séparation étanche Facturation/Administration : la
              // déconnexion ferme la session Supabase et revient sur
              // /facturation lui-même (rechargement complet) — jamais /login
              // ni /logout, les routes de l'Administration. Sans session,
              // /facturation affiche à nouveau EcranConnexion.
              window.location.href = '/facturation'
            }}
          >
            <svg
              fill="none"
              height="15"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="2"
              viewBox="0 0 24 24"
              width="15"
              aria-hidden="true"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
          </button>
          <button
            className="omra-icon-btn omra-bascule-theme omra-no-print"
            title={sombre ? T.navigation.modeJour : T.navigation.modeNuit}
            onClick={storeSombre.basculer}
          >
            {sombre ? (
              <svg
                fill="none"
                height="15"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="2"
                viewBox="0 0 24 24"
                width="15"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
              </svg>
            ) : (
              <svg
                fill="none"
                height="15"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                viewBox="0 0 24 24"
                width="15"
                aria-hidden="true"
              >
                <path d="M20 14.5A8.2 8.2 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
              </svg>
            )}
          </button>
        </div>
      </header>

      {ecran.nom === 'registre' && aucuneSaison ? (
        <EcranAVenir
          titre="لا توجد موسم نشط"
          note="يجب على المدير إنشاء موسم وتفعيله من لوحة الإدارة قبل استخدام الفوترة."
          etiquette="بانتظار الإدارة"
        />
      ) : null}

      {ecran.nom === 'registre' && !aucuneSaison ? (
        <EcranRegistre
          recus={etat.recus}
          rechercheNom={rechercheNom}
          rechercheNumero={rechercheNumero}
          afficherAnnules={afficherAnnules}
          onRechercheNom={setRechercheNom}
          onRechercheNumero={setRechercheNumero}
          onAfficherAnnules={setAfficherAnnules}
          onNouveauRecu={() => setFenetre({ type: 'nouveau' })}
          onNouveauVersement={(recuId) => setFenetre({ type: 'versement', recuId })}
          onOuvrirDetail={(recu) => setFenetre({ type: 'detail', recuId: recu.id })}
          onOuvrirRecu={(recu) => setEcran({ nom: 'recu', recuId: recu.id })}
          onAnnuler={(recu) => setFenetre({ type: 'annulation', recuId: recu.id })}
          onModifier={(recu) => setFenetre({ type: 'modification', recuId: recu.id })}
        />
      ) : null}

      {ecran.nom === 'statistiques' ? <EcranStatistiques /> : null}

      {ecran.nom === 'finance' && aucuneSaison ? (
        <>
          <SousNavFinance active="finance" onPaiements={ouvrirPaiements} onSuiviJournalier={ouvrirSuivi} />
          <EcranAVenir
            titre="لا توجد موسم نشط"
            note="يجب على المدير إنشاء موسم وتفعيله من لوحة الإدارة قبل استخدام الفوترة."
            etiquette="بانتظار الإدارة"
          />
        </>
      ) : null}

      {ecran.nom === 'finance' && !aucuneSaison && financeIndisponible ? (
        <>
          <SousNavFinance active="finance" onPaiements={ouvrirPaiements} onSuiviJournalier={ouvrirSuivi} />
          <EcranAVenir
            titre={T.navigation.finance}
            note="اليومية المالية غير متاحة بعد على omra؛ العمل عليها مؤجل إلى دفعة عمل مخصصة."
            etiquette="قيد الإنجاز"
          />
        </>
      ) : null}

      {ecran.nom === 'finance' && !aucuneSaison && !financeIndisponible && journal ? (
        <EcranFinance
          journal={journal}
          aujourdhui={aujourdhui}
          hier={hier}
          onPeriode={(periode) => void chargerJournal(periode)}
          onImprimer={async () => {
            if (!journal.jourSelectionne) {
              notifier('اختر يوماً واحداً للطباعة.', true)
              return
            }
            // reprise.md §5.12 — le compteur est écrit avant l'ouverture de la
            // boîte système. Un refus explicite (hors fenêtre autorisée, R-61)
            // bloque l'impression, comme avant. Un échec inattendu (panne
            // réseau, etc.), lui, ne doit jamais empêcher l'employé de remettre
            // le document — même décision de résilience que P18 pour le reçu
            // (`sequenceImpression`) : l'erreur est affichée, jamais avalée.
            let echecCompteurInattendu = false
            try {
              const resultat = await actions.enregistrerImpressionFinance(journal.jourSelectionne)
              if (resultat.statut !== 'ok') {
                notifier('يمكن للموظف طباعة اليوم أو أمس فقط.', true)
                return
              }
            } catch {
              echecCompteurInattendu = true
            }
            await chargerJournal(periodeFinance)
            // R-67 — A4 paysage, marge 5 mm, posée le temps de l'impression.
            const style = document.createElement('style')
            style.textContent = '@page{size:A4 landscape;margin:5mm}'
            document.head.appendChild(style)
            document.body.classList.add('finance-impression')
            window.print()
            document.body.classList.remove('finance-impression')
            style.remove()
            if (echecCompteurInattendu) {
              notifier('تعذر تسجيل عداد الطباعة. تمت الطباعة رغم ذلك.', true)
            }
          }}
          onAcquitter={() => setFenetre({ type: 'anomalieFinance' })}
          onOuvrirDetail={(recuId) => setFenetre({ type: 'detail', recuId })}
          onPaiements={ouvrirPaiements}
          onSuiviJournalier={ouvrirSuivi}
        />
      ) : null}

      {ecran.nom === 'suivi' && aucuneSaison ? (
        <>
          <SousNavFinance active="suivi" onPaiements={ouvrirPaiements} onSuiviJournalier={ouvrirSuivi} />
          <EcranAVenir
            titre="لا توجد موسم نشط"
            note="يجب على المدير إنشاء موسم وتفعيله من لوحة الإدارة قبل استخدام الفوترة."
            etiquette="بانتظار الإدارة"
          />
        </>
      ) : null}

      {ecran.nom === 'suivi' && !aucuneSaison && financeIndisponible ? (
        <>
          <SousNavFinance active="suivi" onPaiements={ouvrirPaiements} onSuiviJournalier={ouvrirSuivi} />
          <EcranAVenir
            titre={T.finance.sousNav.suiviJournalier}
            note="Cet écran n'est pas encore relié à la base réelle ; il sera activé dans un lot de travail dédié."
            etiquette="Bientôt disponible"
            dir="ltr"
            lang="fr"
          />
        </>
      ) : null}

      {ecran.nom === 'suivi' && !aucuneSaison && !financeIndisponible && suivi ? (
        <>
          <SousNavFinance
            active="suivi"
            onPaiements={ouvrirPaiements}
            onSuiviJournalier={ouvrirSuivi}
          />
          <EcranSuiviJournalier
            suivi={suivi}
            onMois={(mois) => {
              setMoisSuivi(mois)
              void chargerSuivi({
                mois,
                selection: selectionJournees,
                afficherVides: afficherJourneesVides,
              })
            }}
            onMoisActuel={() => {
              setMoisSuivi(undefined)
              void chargerSuivi({
                selection: selectionJournees,
                afficherVides: afficherJourneesVides,
              })
            }}
            onBasculerJournee={(cle) => {
              const suivante = basculerSelection(selectionJournees, cle)
              setSelectionJournees(suivante)
              void chargerSuivi({
                mois: moisSuivi,
                selection: suivante,
                afficherVides: afficherJourneesVides,
              })
            }}
            onBasculerToutes={() => {
              // R-70 — la bascule ne porte que sur les journées affichées.
              const visibles = suivi.lignes.map((ligne) => ({ cle: ligne.cle }))
              const suivante = basculerToutesVisibles(
                selectionJournees,
                visibles as never,
              )
              setSelectionJournees(suivante)
              void chargerSuivi({
                mois: moisSuivi,
                selection: suivante,
                afficherVides: afficherJourneesVides,
              })
            }}
            onEffacerSelection={() => {
              setSelectionJournees([])
              void chargerSuivi({
                mois: moisSuivi,
                selection: [],
                afficherVides: afficherJourneesVides,
              })
            }}
            onBasculerVides={() => {
              const afficher = !afficherJourneesVides
              setAfficherJourneesVides(afficher)
              // R-70 — masquer les journées vides retire de la sélection celles
              // qui disparaissent.
              const selection = afficher
                ? selectionJournees
                : selectionApresMasquage(
                    selectionJournees,
                    suivi.lignes.map((ligne) => ({
                      cle: ligne.cle,
                      active: !ligne.vide,
                    })) as never,
                  )
              setSelectionJournees(selection)
              void chargerSuivi({ mois: moisSuivi, selection, afficherVides: afficher })
            }}
          />
        </>
      ) : null}

      {ecran.nom === 'paiements' && aucuneSaison ? (
        <>
          <SousNavFinance active="paiements" onPaiements={ouvrirPaiements} onSuiviJournalier={ouvrirSuivi} />
          <EcranAVenir
            titre="لا توجد موسم نشط"
            note="يجب على المدير إنشاء موسم وتفعيله من لوحة الإدارة قبل استخدام الفوترة."
            etiquette="بانتظار الإدارة"
          />
        </>
      ) : null}

      {ecran.nom === 'paiements' && !aucuneSaison && financeIndisponible ? (
        <>
          <SousNavFinance active="paiements" onPaiements={ouvrirPaiements} onSuiviJournalier={ouvrirSuivi} />
          <EcranAVenir
            titre={T.finance.sousNav.paiements}
            note="Cet écran n'est pas encore relié à la base réelle ; il sera activé dans un lot de travail dédié."
            etiquette="Bientôt disponible"
            dir="ltr"
            lang="fr"
          />
        </>
      ) : null}

      {ecran.nom === 'paiements' && !aucuneSaison && !financeIndisponible && registre ? (
        <>
          <SousNavFinance
            active="paiements"
            onPaiements={ouvrirPaiements}
            onSuiviJournalier={ouvrirSuivi}
          />
          <EcranPaiements
            registre={registre}
            aujourdhui={aujourdhui}
            onFiltres={(modification) => {
              const suivants = { ...filtresRegistre, ...modification }
              setFiltresRegistre(suivants)
              void chargerRegistre(suivants)
            }}
            onOuvrirDetail={(cle) => {
              void chargerRegistre(filtresRegistre, cle).then(() =>
                setFenetre({ type: 'paiementDetail', cle }),
              )
            }}
            onAjouterImage={(cle) => ouvrirAjoutImage(cle)}
          />
        </>
      ) : null}

      {fenetre.type === 'nouveau' ? (
        <ModaleNouveauRecu
          referentiels={{
            saison: etat.saison,
            hotels: etat.hotels,
            vols: etat.vols,
            chambres: etat.chambres,
            rabatteurs: etat.rabatteurs,
            tarifs: etat.tarifs,
          }}
          operations={etat.operations}
          recus={etat.recus}
          imagesOperations={etat.imagesOperations}
          modeDemonstration={etat.modeDemonstration}
          onFermer={fermer}
          onEnregistrer={async (saisie, confirme, image, passeport) => {
            const resultat = await actions.creerRecu(saisie, confirme)
            if (resultat.statut === 'ok') {
              await envoyerImageInstrument(resultat.valeur.recuId, image)
              await envoyerImagesPasseport(resultat.valeur.recuId, passeport)
              await rafraichir()
              notifier(`تم حفظ الوصل رقم ${resultat.valeur.numero}`)
              setRecuOriginal(resultat.valeur.recuId)
              setEcran({ nom: 'recu', recuId: resultat.valeur.recuId })
            }
            return resultat
          }}
        />
      ) : null}

      {fenetre.type === 'versement' ? (
        <ModaleVersement
          recus={etat.recus}
          operations={etat.operations}
          imagesOperations={etat.imagesOperations}
          modeDemonstration={etat.modeDemonstration}
          recuVerrouilleId={fenetre.recuId}
          onFermer={fermer}
          onEnregistrer={async (saisie, confirme, image) => {
            const resultat = await actions.ajouterVersement(saisie, confirme)
            if (resultat.statut === 'ok') {
              await envoyerImageInstrument(resultat.valeur.recuId, image)
              const suivant = await actions.recharger()
              setEtat(suivant)
              const cible = suivant.recus.find((r) => r.id === resultat.valeur.recuId)
              const reste = cible ? restantDu(cible) : 0
              // Message du fichier de référence (`rest===0`), selon que le
              // reçu est exactement soldé ou non.
              notifier(
                reste === 0
                  ? `تم — الوصل ${cible?.numero ?? ''} مسدد بالكامل`
                  : `تم تسجيل الدفعة — الباقي ${centimesEnTexteDevise(reste)}`,
              )
              // Fichier de référence, savePay() : screen:'recu' après l'enregistrement.
              setRecuOriginal(resultat.valeur.recuId)
              setEcran({ nom: 'recu', recuId: resultat.valeur.recuId })
            }
            return resultat
          }}
        />
      ) : null}

      {fenetre.type === 'annulation'
        ? (() => {
            const recu = recuParId(fenetre.recuId)
            if (!recu) return null
            return (
              <ModaleAnnulation
                recu={recu}
                onFermer={fermer}
                onAnnuler={async (saisie) => {
                  const resultat = await actions.annulerRecu(recu.id, saisie)
                  if (resultat.statut === 'ok') {
                    await rafraichir()
                    notifier(`تم إلغاء الوصل ${recu.numero}. الرقم لن يُستعمل مجددًا.`)
                    setEcran({ nom: 'registre' })
                  }
                  return resultat
                }}
              />
            )
          })()
        : null}

      {fenetre.type === 'modification'
        ? (() => {
            const recu = recuParId(fenetre.recuId)
            if (!recu) return null
            return (
              <ModaleModification
                recu={recu}
                referentiels={{
                  hotels: etat.hotels,
                  vols: etat.vols,
                  chambres: etat.chambres,
                  tarifs: etat.tarifs,
                }}
                estAdministrateur={estAdministrateur}
                onFermer={fermer}
                onEnregistrer={async (saisie, confirme) => {
                  const resultat = await actions.modifierRecu(recu.id, saisie, confirme)
                  if (resultat.statut === 'ok') {
                    await rafraichir()
                    notifier('تم حفظ التعديل مع الاحتفاظ بالتاريخ الكامل.')
                  }
                  return resultat
                }}
              />
            )
          })()
        : null}

      {fenetre.type === 'detail'
        ? (() => {
            const recu = recuParId(fenetre.recuId)
            if (!recu) return null
            return (
              <ModaleDetail
                recu={recu}
                saison={etat.saison}
                portrait={etat.portraitsPasseport[recu.id]}
                operations={etat.operations}
                onFermer={fermer}
                onOuvrirRecu={() => {
                  setEcran({ nom: 'recu', recuId: recu.id })
                  fermer()
                }}
                onOuvrirInstrument={(cle) => {
                  void chargerRegistre(filtresRegistre, cle).then(() =>
                    setFenetre({ type: 'paiementDetail', cle }),
                  )
                }}
              />
            )
          })()
        : null}

      {fenetre.type === 'anomalieFinance' && journal ? (
        <ModaleAnomalieFinance
          nombre={journal.anomaliesEnAttente.length}
          jour={journal.libellePeriode}
          onFermer={fermer}
          onConfirmer={async () => {
            if (!journal.jourSelectionne) return
            try {
              const resultat = await actions.acquitterAnomalies(journal.jourSelectionne)
              if (resultat.statut === 'ok') {
                await chargerJournal(periodeFinance)
                await rafraichir()
              }
            } catch {
              notifier('تعذر تأكيد المراجعة. حاول مرة أخرى.', true)
            }
            fermer()
          }}
        />
      ) : null}

      {fenetre.type === 'paiementDetail' && registre?.detail ? (
        <ModalePaiementDetail
          detail={registre.detail}
          onFermer={fermer}
          onAjouterImage={() => ouvrirAjoutImage(registre.detail!.cle)}
          onSupprimerImage={async () => {
            // R-39 — confirmation explicite, texte du fichier de référence.
            if (!window.confirm(CONFIRMATION_SUPPRESSION_IMAGE)) return
            const resultat = await actions.supprimerImageOperation(registre.detail!.cle)
            if (resultat.statut === 'ok') {
              await chargerRegistre(filtresRegistre, registre.detail!.cle)
              notifier(MESSAGE_IMAGE_SUPPRIMEE)
            } else if (resultat.statut === 'erreurs') {
              notifier(messageErreur(resultat.erreurs[0]), true)
            }
          }}
        />
      ) : null}

      {fenetre.type === 'paiementImage' ? (
        <ModalePaiementImage
          cible={fenetre.cible}
          modeDemonstration={etat.modeDemonstration}
          onFermer={fermer}
          onEnregistrer={async (fichier) => {
            const donnees = new FormData()
            donnees.set('cle', (fenetre as { cible: CiblePaiement }).cible.cle)
            donnees.set('fichier', fichier.contenu, fichier.nomOrigine)
            const resultat = await actions.ajouterImageOperation(donnees)
            if (resultat.statut === 'ok') {
              await chargerRegistre(filtresRegistre, registre?.detail?.cle ?? null)
              await rafraichir()
              notifier(MESSAGE_IMAGE_ENREGISTREE)
              fermer()
            } else if (resultat.statut === 'erreurs') {
              notifier(messageErreur(resultat.erreurs[0]), true)
            }
          }}
        />
      ) : null}

      {fenetre.type === 'journal' ? (
        <ModaleJournal entrees={etat.audit} onFermer={fermer} />
      ) : null}

      {notification ? (
        <div className={`omra-toast${notification.erreur ? ' erreur' : ''}`} role="status">
          {notification.texte}
        </div>
      ) : null}

      {/* `estAdministrateur` conditionnera les actions réservées à la direction
          dans les lots L4 et L5 (impression du journal, suppression d'image). */}
      <span hidden data-administrateur={estAdministrateur} />
    </div>
  )
}
