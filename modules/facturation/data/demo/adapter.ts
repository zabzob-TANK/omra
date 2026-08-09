/**
 * Adaptateur de démonstration — implémentation en mémoire de `SourceDonnees`.
 *
 * ⚠️ ISOLATION — Cet adaptateur est remplaçable en une ligne (voir
 * `modules/facturation/data/index.ts`). Il ne contient **aucune règle métier** :
 * il ne fait que stocker et restituer. Toute logique de validation appartient à
 * `domain/rules/` (lot L1).
 *
 * Limites assumées, et c'est volontaire :
 *  - les données vivent dans le processus et disparaissent à son redémarrage ;
 *  - aucune concurrence réelle n'est gérée.
 *
 * Ce n'est pas l'architecture cible : c'est un support de développement pour
 * que les lots métier avancent sans dépendre d'un projet Supabase.
 */

import { cleJour } from '../../domain/dates'
import {
  HOTELS_DEMO,
  CHAMBRES_DEMO,
  RABATTEURS_DEMO,
  ROLE_ADMINISTRATEUR,
  SAISON_DEMO,
  TARIFS_DEMO,
  VOLS_DEMO,
} from '../../domain/constants'
import type {
  AcquittementAnomalie,
  Chambre,
  Client,
  EntreeAudit,
  EvenementModificationSaison,
  Hotel,
  ImpressionFinance,
  ModeRemboursement,
  Modification,
  MouvementCaisse,
  OperationPartagee,
  Passeport,
  Rabatteur,
  Recu,
  RecuSaison,
  ReferenceFichier,
  Saison,
  Tarif,
  Utilisateur,
  Versement,
  VersementSaison,
  Vol,
} from '../../domain/types'
import type {
  AcquittementsAnomaliePort,
  ClientsPort,
  CreationRecu,
  FiltreRecus,
  HorlogePort,
  IdentifiantsPort,
  ImpressionsFinancePort,
  JournalAuditPort,
  LecteurPasseportPort,
  ModificationsSaisonPort,
  MouvementsCaissePort,
  OperationsPartageesPort,
  RecusPort,
  ReferentielsPort,
  SessionPort,
  SourceDonnees,
  StockageFichiersPort,
  VersementsSaisonPort,
} from '../ports'
import { centimesEnTexteDevise } from '../../domain/money'
import { versementsSaisonDepuisRecu } from '../../domain/rules/cheque-register'
import { totalPaye } from '../../domain/rules/receipt'
import { construireJeuDemonstration, type ScenarioDemonstration } from './dataset'

/** Copie défensive : l'appelant ne doit jamais muter le contenu du dépôt. */
function copier<T>(valeur: T): T {
  return structuredClone(valeur)
}

function protegerSvg(valeur: string | number | null | undefined): string {
  return String(valeur ?? '—')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Vignette factice pour l'amorçage du jeu de démonstration (`jeu.imagesAmorcees`)
 * — jamais affichée comme « exemple » proposé à l'utilisateur (voir
 * `media/exemple-paiement.ts` pour ce cas, avec un vrai specimen JPG). Reste
 * synchrone à dessein : cette fonction construit le magasin en mémoire de
 * l'adaptateur de démonstration, jamais le stockage réel.
 */
function imageAmorceSvg(donnees: {
  reference: string
  banque: string
  montant: string
  payeur: string
  date: string
  virement: boolean
}): Blob {
  const genre = donnees.virement ? 'VIREMENT' : 'CHÈQUE'
  const libelleReference = donnees.virement ? 'Référence' : 'Numéro'
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="500" viewBox="0 0 1200 500">' +
    '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
    '<stop stop-color="#f7f4e9"/><stop offset="1" stop-color="#e8eee1"/></linearGradient></defs>' +
    '<rect width="1200" height="500" rx="24" fill="url(#g)"/>' +
    '<rect x="18" y="18" width="1164" height="464" rx="18" fill="none" stroke="#64745a" stroke-width="3"/>' +
    '<circle cx="1040" cy="112" r="62" fill="#c9a24a" opacity=".22"/>' +
    `<text x="70" y="88" font-family="Arial" font-size="34" font-weight="700" fill="#47593c">${genre} — DÉMONSTRATION</text>` +
    `<text x="70" y="145" font-family="Arial" font-size="23" fill="#6e7565">Banque : ${protegerSvg(donnees.banque)}</text>` +
    `<text x="840" y="145" font-family="Arial" font-size="23" fill="#6e7565">Date : ${protegerSvg(donnees.date)}</text>` +
    '<line x1="70" y1="184" x2="1130" y2="184" stroke="#b9b6ab" stroke-width="2"/>' +
    `<text x="70" y="250" font-family="Arial" font-size="27" fill="#20251b">Payeur : ${protegerSvg(donnees.payeur)}</text>` +
    `<text x="70" y="322" font-family="Arial" font-size="24" fill="#6e7565">${libelleReference} : ${protegerSvg(donnees.reference)}</text>` +
    '<rect x="760" y="225" width="370" height="110" rx="12" fill="#fff" stroke="#9cab8d" stroke-width="2"/>' +
    `<text x="945" y="292" text-anchor="middle" font-family="Arial" font-size="38" font-weight="700" fill="#2e3b27">${protegerSvg(donnees.montant)}</text>` +
    '<line x1="70" y1="392" x2="560" y2="392" stroke="#8f9489" stroke-width="2"/>' +
    '<text x="70" y="426" font-family="Arial" font-size="18" fill="#8c9185">Justificatif</text>' +
    '<text x="1130" y="450" text-anchor="end" font-family="Arial" font-size="17" fill="#a3801f">Image factice pour le prototype</text>' +
    '</svg>'
  return new Blob([svg], { type: 'image/svg+xml' })
}

export interface OptionsAdaptateurDemonstration {
  /** Date servant d'« aujourd'hui ». Injectable pour les tests. */
  reference?: Date
  /** Utilisateur connecté simulé. */
  utilisateur?: Utilisateur
  /** Compteur d'identifiants de départ, pour rendre les tests déterministes. */
  compteurInitial?: number
  /**
   * Scénario de démonstration. `standard` par défaut : le scénario
   * `pagination`, plus volumineux, ne sert qu'à vérifier l'impression sur
   * plusieurs pages et doit toujours être demandé explicitement.
   */
  scenario?: ScenarioDemonstration
}

const UTILISATEUR_DEMONSTRATION: Utilisateur = {
  id: 'samir',
  nom: 'سمير بنعلي',
  role: 'صندوق',
  initiales: 'SB',
}

/**
 * Comptes de démonstration, repris du fichier de référence.
 *
 * ⚠️ Ce sont des comptes fictifs de démonstration, confinés à cet adaptateur.
 * Ni le domaine ni l'interface n'en connaissent l'existence, et l'adaptateur
 * Omra les remplacera par l'authentification réelle sans rien changer d'autre.
 */
const COMPTES_DEMONSTRATION: Record<string, { motDePasse: string; utilisateur: Utilisateur }> = {
  '3': {
    motDePasse: '3',
    utilisateur: { id: '3', nom: 'المدير', role: ROLE_ADMINISTRATEUR, initiales: 'AD' },
  },
  samir: {
    motDePasse: '1234',
    utilisateur: UTILISATEUR_DEMONSTRATION,
  },
}

/**
 * Construit une source de données de démonstration complète et indépendante.
 * Chaque appel produit un état neuf : deux tests ne se contaminent pas.
 */
export function creerSourceDemonstration(
  options: OptionsAdaptateurDemonstration = {},
): SourceDonnees {
  const reference = options.reference ?? new Date()
  const jeu = construireJeuDemonstration(reference, options.scenario ?? 'standard')

  const recus: Recu[] = jeu.recus
  const clients: Client[] = jeu.clients
  const operations: OperationPartagee[] = jeu.operationsPartagees
  const mouvements: MouvementCaisse[] = jeu.mouvementsCaisse
  const impressions: ImpressionFinance[] = jeu.impressionsFinance
  const acquittements = new Map<string, AcquittementAnomalie>()
  const audit: EntreeAudit[] = jeu.audit
  const fichiers = new Map<string, { contenu: Blob | ArrayBuffer; typeMime: string }>()

  let prochainNumero = jeu.prochainNumero
  let compteur = options.compteurInitial ?? 1

  const horloge: HorlogePort = {
    maintenant: () => new Date(reference),
  }

  const identifiants: IdentifiantsPort = {
    nouvelId: (prefixe) => `${prefixe}-demo-${String(compteur++).padStart(5, '0')}`,
  }

  const referentiels: ReferentielsPort = {
    async saisonActive(): Promise<Saison> {
      return {
        id: 'saison-demo',
        nom: SAISON_DEMO.nom,
        reductionMaxCentimes: SAISON_DEMO.reductionMaxCentimes,
        duree: SAISON_DEMO.duree,
        active: true,
      }
    },
    async saisons() {
      return [await referentiels.saisonActive()]
    },
    async hotels(): Promise<Hotel[]> {
      return HOTELS_DEMO.map((nom) => ({ id: nom, nom }))
    },
    async vols(): Promise<Vol[]> {
      return VOLS_DEMO.map((nom) => ({ id: nom, nom }))
    },
    async chambres(): Promise<Chambre[]> {
      return CHAMBRES_DEMO.map((code) => ({ id: code, code }))
    },
    async rabatteurs(): Promise<Rabatteur[]> {
      return RABATTEURS_DEMO.map((nom) => ({ id: nom, nom }))
    },
    async tarifs(saisonId: string): Promise<Tarif[]> {
      // Seules les combinaisons réellement définies sont renvoyées : une
      // combinaison absente doit bloquer la création (R-05), pas valoir zéro.
      const sortie: Tarif[] = []
      for (const [cle, parChambre] of Object.entries(TARIFS_DEMO)) {
        const [hotelId, volId] = cle.split('|')
        for (const [chambreId, montant] of Object.entries(parChambre)) {
          sortie.push({
            saisonId,
            hotelId,
            volId,
            chambreId,
            montantCentimes: montant * 100,
          })
        }
      }
      return sortie
    },
  }

  let connecte: Utilisateur | null = options.utilisateur ?? null

  const session: SessionPort = {
    async connecter(identifiant, motDePasse) {
      const compte = COMPTES_DEMONSTRATION[identifiant.trim()]
      if (!compte || compte.motDePasse !== motDePasse) return null
      connecte = compte.utilisateur
      return copier(connecte)
    },
    async deconnecter() {
      connecte = null
    },
    async utilisateurCourant() {
      return copier(connecte ?? options.utilisateur ?? UTILISATEUR_DEMONSTRATION)
    },
    estAdministrateur(utilisateur: Utilisateur) {
      return utilisateur.role === ROLE_ADMINISTRATEUR
    },
    async verifierIdentite(motDePasse: string) {
      // Aucun secret n'est stocké. En démonstration, toute saisie non vide est
      // acceptée ; l'implémentation Omra délèguera à une ré-authentification.
      return motDePasse.trim().length > 0
    },
  }

  const depotRecus: RecusPort = {
    async lister(filtre: FiltreRecus = {}) {
      let sortie = recus
      if (!filtre.inclureAnnules) sortie = sortie.filter((r) => r.statut !== 'ملغى')
      if (filtre.nom) {
        const q = filtre.nom.trim()
        sortie = sortie.filter((r) => `${r.prenom} ${r.nom}`.includes(q))
      }
      if (filtre.numero) {
        const q = filtre.numero.trim()
        sortie = sortie.filter((r) => String(r.numero).includes(q))
      }
      return copier(sortie)
    },
    async listerLeger(filtre: FiltreRecus = {}) {
      let sortie = recus
      if (!filtre.inclureAnnules) sortie = sortie.filter((r) => r.statut !== 'ملغى')
      return copier(
        sortie.map(
          (r): RecuSaison => ({
            id: r.id,
            numero: r.numero,
            date: r.date,
            statut: r.statut,
            annuleLe: r.annuleLe,
            totalPayeCentimes: totalPaye(r),
          }),
        ),
      )
    },
    async parId(id) {
      const trouve = recus.find((r) => r.id === id)
      return trouve ? copier(trouve) : null
    },
    async parNumero(numero) {
      // Démonstration : une seule saison (`SAISON_DEMO`), donc aucune
      // ambiguïté possible — `saisonId` n'a rien à filtrer ici.
      const trouve = recus.find((r) => r.numero === numero)
      return trouve ? copier(trouve) : null
    },
    async reserverNumero() {
      return prochainNumero++
    },
    // R-32 — l'adaptateur de démonstration n'a pas de RPC à revalider côté
    // serveur : `confirmeDepassement` n'a donc aucun effet ici, mais figure
    // dans la signature pour rester conforme à `RecusPort` (voir write.ts,
    // qui la retransmet réellement à Supabase).
    async creer(donnees: CreationRecu, _confirmeDepassement: boolean) {
      const recu: Recu = {
        id: identifiants.nouvelId('recu'),
        numero: donnees.numero,
        clientId: donnees.clientId,
        passeport: donnees.passeport,
        prenom: donnees.prenom,
        nom: donnees.nom,
        telephone: donnees.telephone,
        hotel: donnees.hotel,
        vol: donnees.vol,
        chambre: donnees.chambre,
        tarifCentimes: donnees.tarifCentimes,
        reductionCentimes: donnees.reductionCentimes,
        convenuCentimes: donnees.convenuCentimes,
        rabatteur: donnees.rabatteur,
        groupe: donnees.groupe,
        note: donnees.note,
        date: horloge.maintenant().toLocaleDateString('fr-FR'),
        creeLe: horloge.maintenant().toLocaleString('fr-FR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
        employe: donnees.employe,
        statut: 'نشط',
        motifAnnulation: '',
        impressions: 0,
        modifications: [],
        nombreModifications: 0,
        // Un reçu neuf ne peut pas naître en trop-perçu — R-21 empêche tout
        // surpaiement dès le premier versement.
        anomalies: [],
        versements: [donnees.premierVersement],
      }
      recus.push(recu)
      return copier(recu)
    },
    async ajouterVersement(recuId: string, versement: Versement, _confirmeDepassement: boolean) {
      const recu = recus.find((r) => r.id === recuId)
      if (!recu) throw new Error(`Reçu introuvable : ${recuId}`)
      recu.versements.push(versement)
      return copier(recu)
    },
    async appliquerModification(
      recuId: string,
      champsModifies: Partial<Recu>,
      modification: Modification,
    ) {
      const recu = recus.find((r) => r.id === recuId)
      if (!recu) throw new Error(`Reçu introuvable : ${recuId}`)
      Object.assign(recu, champsModifies)
      recu.modifications.unshift(modification)
      recu.nombreModifications = recu.modifications.length
      recu.derniereModification = modification.dateHeure
      recu.modifiePar = modification.employe
      return copier(recu)
    },
    async corrigerPremierVersement(
      recuId,
      versement,
      nouvelleOperation,
      modification,
      _confirmeDepassement,
    ) {
      const recu = recus.find((r) => r.id === recuId)
      if (!recu) throw new Error(`Reçu introuvable : ${recuId}`)
      const premier = recu.versements[0]
      if (!premier) throw new Error(`Premier versement introuvable : ${recuId}`)
      if (nouvelleOperation) operations.push(nouvelleOperation)
      Object.assign(premier, versement)
      recu.modifications.unshift(modification)
      recu.nombreModifications = recu.modifications.length
      recu.derniereModification = modification.dateHeure
      recu.modifiePar = modification.employe
      return copier(recu)
    },
    async annuler(
      recuId: string,
      donnees: {
        motif: string
        annulePar: string
        annuleLe: string
        modeRemboursement: ModeRemboursement
        montantRembourseCentimes: number
      },
    ) {
      const recu = recus.find((r) => r.id === recuId)
      if (!recu) throw new Error(`Reçu introuvable : ${recuId}`)
      recu.statut = 'ملغى'
      recu.motifAnnulation = donnees.motif
      recu.annulePar = donnees.annulePar
      recu.annuleLe = donnees.annuleLe
      recu.modeRemboursement = donnees.modeRemboursement
      recu.montantRembourseCentimes = donnees.montantRembourseCentimes
      return copier(recu)
    },
    async incrementerImpressions(recuId: string) {
      const recu = recus.find((r) => r.id === recuId)
      if (!recu) throw new Error(`Reçu introuvable : ${recuId}`)
      // La démonstration ne simule jamais une lecture ratée : toujours un
      // nombre réel, jamais `null` (voir le type `Recu.impressions`).
      recu.impressions = (recu.impressions ?? 0) + 1
      return recu.impressions
    },
    async definirImagesPasseport(recuId, originale, portrait) {
      const recu = recus.find((r) => r.id === recuId)
      if (!recu || !recu.passeport) return
      recu.passeport.imageOriginale = originale
      recu.passeport.imagePortrait = portrait
    },
    async definirImageVersement(recuId, versementId, image) {
      const recu = recus.find((r) => r.id === recuId)
      if (!recu) throw new Error(`Reçu introuvable : ${recuId}`)
      const versement = recu.versements.find((v) => v.id === versementId)
      if (!versement) throw new Error(`Versement introuvable : ${versementId}`)
      versement.image = image
    },
  }

  const depotClients: ClientsPort = {
    async lister() {
      return copier(clients)
    },
    async parId(id) {
      const trouve = clients.find((c) => c.id === id)
      return trouve ? copier(trouve) : null
    },
    async creer(client) {
      clients.push(client)
      return copier(client)
    },
    async rattacherRecu(clientId, recuId) {
      const client = clients.find((c) => c.id === clientId)
      if (!client) throw new Error(`Client introuvable : ${clientId}`)
      if (!client.recuIds.includes(recuId)) client.recuIds.push(recuId)
    },
  }

  const depotOperations: OperationsPartageesPort = {
    async lister() {
      return copier(operations)
    },
    async parId(id) {
      const trouve = operations.find((o) => o.id === id)
      return trouve ? copier(trouve) : null
    },
    async creer(operation) {
      operations.push(operation)
      return copier(operation)
    },
    async definirImage(operationId, image) {
      const operation = operations.find((o) => o.id === operationId)
      if (!operation) throw new Error(`Opération introuvable : ${operationId}`)
      operation.image = image
    },
  }

  const depotMouvements: MouvementsCaissePort = {
    async listerParJour(jour) {
      return copier(mouvements.filter((m) => m.jour === jour))
    },
    async lister() {
      return copier(mouvements)
    },
    async creer(mouvement) {
      mouvements.push(mouvement)
      return copier(mouvement)
    },
  }

  const depotImpressions: ImpressionsFinancePort = {
    async listerParJour(jour) {
      return copier(impressions.filter((p) => p.jour === jour))
    },
    async creer(impression) {
      impressions.push(impression)
      return copier(impression)
    },
  }

  const depotAcquittements: AcquittementsAnomaliePort = {
    async parJour(jour) {
      const trouve = acquittements.get(jour)
      return trouve ? copier(trouve) : null
    },
    async acquitter(acquittement) {
      const existant = acquittements.get(acquittement.jour)
      const fusion = existant
        ? [...new Set([...existant.mouvementIds, ...acquittement.mouvementIds])]
        : acquittement.mouvementIds
      acquittements.set(acquittement.jour, { ...acquittement, mouvementIds: fusion })
    },
  }

  const journalAudit: JournalAuditPort = {
    async lister(limite) {
      return copier(limite ? audit.slice(0, limite) : audit)
    },
    async enregistrer(entree) {
      audit.unshift(entree)
    },
  }

  const stockage: StockageFichiersPort = {
    async deposer({ contenu, nomOrigine, typeMime, origine }) {
      const chemin = `demo/${identifiants.nouvelId('fichier')}`
      fichiers.set(chemin, { contenu, typeMime })
      return {
        chemin,
        nomOrigine,
        origine,
        deposeLe: horloge.maintenant().toISOString(),
      }
    },
    async url(reference: ReferenceFichier) {
      // En démonstration, le contenu déposé est restitué sous forme de `data:`
      // URL pour être affichable. C'est un détail de cet adaptateur : le
      // domaine et l'interface ne manipulent que `ReferenceFichier`, et
      // l'implémentation Supabase Storage renverra une URL signée.
      const fichier = fichiers.get(reference.chemin)
      if (!fichier) return ''
      const octets =
        fichier.contenu instanceof ArrayBuffer
          ? new Uint8Array(fichier.contenu)
          : new Uint8Array(await fichier.contenu.arrayBuffer())
      let binaire = ''
      for (const octet of octets) binaire += String.fromCharCode(octet)
      return `data:${fichier.typeMime};base64,${Buffer.from(binaire, 'binary').toString('base64')}`
    },
    async supprimer(reference) {
      fichiers.delete(reference.chemin)
    },
  }

  const lecteurPasseport: LecteurPasseportPort = {
    // R-90 — Aucune lecture automatique dans le fichier de référence.
    disponible: () => false,
    async lire(): Promise<Partial<Passeport> | null> {
      return null
    },
  }

  // Images de démonstration : déposées comme n'importe quel fichier, puis
  // rattachées par référence. Aucune image n'est stockée en base.
  for (const amorce of jeu.imagesAmorcees) {
    const chemin = `demo/${identifiants.nouvelId('fichier')}`
    fichiers.set(chemin, {
      contenu: imageAmorceSvg({
        reference: amorce.reference,
        banque: amorce.banque,
        montant: centimesEnTexteDevise(amorce.montantCentimes),
        payeur: amorce.payeur,
        date: amorce.date,
        virement: amorce.virement,
      }),
      typeMime: 'image/svg+xml',
    })
    const reference = {
      chemin,
      nomOrigine: 'document-demonstration.svg',
      origine: 'demo',
      deposeLe: horloge.maintenant().toLocaleString('fr-FR'),
      deposePar: 'النظام',
    }
    const [genre, ...reste] = amorce.cible.split(':')
    if (genre === 'operation') {
      const operation = operations.find((o) => o.id === reste.join(':'))
      if (operation) operation.image = reference
    } else {
      const [recuId, versementId] = reste
      const versement = recus
        .find((r) => r.id === recuId)
        ?.versements.find((v) => v.id === versementId)
      if (versement) versement.image = reference
    }
  }

  const depotVersementsSaison: VersementsSaisonPort = {
    async lister() {
      return copier(recus.flatMap((r) => versementsSaisonDepuisRecu(r, operations)))
    },
  }

  const depotModificationsSaison: ModificationsSaisonPort = {
    async lister() {
      const evenements: EvenementModificationSaison[] = recus.flatMap((r) =>
        r.modifications.map((m) => ({
          id: m.id,
          recuNumero: r.numero,
          survenuLe: m.dateHeure,
        })),
      )
      return copier(evenements)
    },
  }

  return {
    referentiels,
    session,
    recus: depotRecus,
    clients: depotClients,
    operationsPartagees: depotOperations,
    mouvementsCaisse: depotMouvements,
    impressionsFinance: depotImpressions,
    versementsSaison: depotVersementsSaison,
    modificationsSaison: depotModificationsSaison,
    acquittementsAnomalie: depotAcquittements,
    audit: journalAudit,
    fichiers: stockage,
    lecteurPasseport,
    horloge,
    identifiants,
  }
}

/** Clé de journée de la date de référence — pratique pour les tests. */
export function jourDeReference(reference: Date): string {
  return cleJour(reference)
}
