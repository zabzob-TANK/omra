// Fiche de réglages de la rubrique Visa : tout ce qui est propre au Visa vit ici, le Poste de tri
// (moteur commun) ne fait qu'afficher et déplacer. Les données font foi : l'état de chaque pèlerin
// et les groupes Nusuk viennent du registre et de la dernière lecture Nusuk, calculés avec les
// mêmes fonctions que la partie Visa du fichier clients. Lecture seule : rien n'est écrit.
import { versVoyageur } from '@/modules/client-react/intake/adaptateur'
import { confirmationsRegistre } from '@/modules/client-react/nusuk/registre-confirmations'
import { confirmationTime, visaPending } from '@/modules/client-react/nusuk/reading-rules'
import { etatVisuelVisa, resumeEtatGroupeVisa } from '@/modules/client-react/visa-restrictions'
import { visaIconSource, VISA_CATEGORIES } from '@/modules/client-react/visa-appearance'
import { NUSUK_CHANNEL, envoyerPlanNusuk, lireAffectationIndividuelle } from '@/modules/client-react/envoi-extension'
import { deltaCarte, synchroniserCartes } from '@/modules/client-react/nusuk/cartes-registre'
import iconeRefuse from './groupe-refuse.png'

export { NUSUK_CHANNEL }

const json = async reponse => {
  const corps = await reponse.json().catch(() => ({}))
  if (!reponse.ok) throw new Error(`${corps.error || 'Lecture impossible.'} (code ${reponse.status})`)
  return corps
}

// Groupes Visa du fichier clients, enregistrés dans ce navigateur pour ce compte (même clé et même
// contrôle de format que ClientReact.jsx). Absents, illisibles ou d'un autre format : aucun groupe.
function groupesVisaDuNavigateur(compte) {
  if (!compte) return []
  try {
    const sauve = JSON.parse(localStorage.getItem('omra:groupes-locaux:v1:' + compte) || 'null')
    if (sauve?.version !== 1 || !Array.isArray(sauve.paniers)) return []
    return sauve.paniers.filter(g => g?.visaBrouillon && Number.isFinite(g.num) && Array.isArray(g.ids))
  } catch { return [] }
}

// Registre + dernière lecture Nusuk enregistrée pour ce compte et cette adresse du site.
// « paniersActuels » : les groupes déjà à l'écran. La lecture Nusuk les complète sans effacer les
// intentions locales (fiches déplacées, groupes temporaires), comme dans le fichier clients.
// « groupesDuFichierClient » : partir des groupes Visa que le fichier clients a enregistrés dans ce
// navigateur (groupes temporaires créés dans le logiciel, fiches déplacées), lus sans jamais les réécrire.
// « toutesAdresses » : lire la dernière lecture Nusuk du compte quelle que soit l'adresse du site d'où
// elle a été envoyée (route de la partie test, lecture seule) ; sinon, la règle du fichier clients.
export async function chargerVisa(signal, paniersActuels = [], { groupesDuFichierClient = false, toutesAdresses = false } = {}) {
  const lectures = toutesAdresses ? '/test-groupes-broyeur/lectures-nusuk' : '/api/client/nusuk/imports'
  const registre = await json(await fetch('/api/client/passeports', { cache: 'no-store', signal }))
  if (!Array.isArray(registre.passeports)) throw new Error('Registre illisible.')
  const tous = registre.passeports.map(versVoyageur)
  // Un dossier annulé ne rejoint jamais un groupe, comme dans le fichier clients.
  const rows = tous.filter(r => r.statut !== 'annule')
  const resultat = { rows, recus: registre.passeports.length, annules: tous.length - rows.length, paniers: paniersActuels, lecture: null, alerte: '' }

  let liste
  try { liste = await json(await fetch(lectures, { cache: 'no-store', signal })) }
  catch (e) { if (signal?.aborted) throw e; resultat.alerte = `Lecture Nusuk indisponible : ${e.message}`; return resultat }
  if (groupesDuFichierClient && !paniersActuels.length) resultat.paniers = paniersActuels = groupesVisaDuNavigateur(liste.accountId)
  // Comme le fichier clients : la plus récente lecture réelle (jamais celle du jeu de test) enregistrée
  // pour ce compte et cette adresse.
  const derniere = liste.imports?.find(i => !i.testSource)
  if (!derniere) {
    resultat.alerte = `Aucune lecture Nusuk enregistrée pour cette adresse du site (${location.origin}). Les lectures sont rangées par adresse : ouvrez la page à l’adresse où l’extension les a envoyées (en local, http://127.0.0.1:3001).`
    return resultat
  }
  const detail = await json(await fetch(lectures + '?id=' + encodeURIComponent(derniere.id), { cache: 'no-store', signal }))
  const p = detail.preview
  try {
    for (const res of confirmationsRegistre(rows, p, liste.accountId)) {
      const row = rows.find(r => r.clientId === res.id)
      // Un résultat confirmé plus récent que la lecture l'emporte (règle du fichier clients).
      if (!row || confirmationTime(row) > p.importedAt) continue
      Object.assign(row, res.fields)
    }
    // « ferme » : groupe masqué (le panneau des groupes le range en bas) ; une actualisation garde ce choix.
    resultat.paniers = synchroniserCartes(paniersActuels, rows, p, false).map(g => ({ ...g, ferme: !!g.ferme, origines: g.origines || {} }))
    resultat.lecture = resumeLecture(p, derniere.origin)
  } catch (e) { resultat.alerte = e.message || 'Lecture Nusuk non applicable.' }
  return resultat
}

// Résumé d'une lecture Nusuk (aperçu enregistré par l'extension) : celui du Poste de tri seul, et celui de l'écran
// Groupes de l'espace client (même aperçu, déjà lu par le registre).
export function resumeLecture(p, origine = null) {
  // « ordre » : numéros des groupes dans l'ordre de la liste Nusuk (sert à numéroter 1, 2, 3…).
  return { importId: p.importId, importedAt: p.importedAt, contrat: p.contract, groupes: p.groups?.length || 0, adresse: origine || null, ordre: (p.groups || []).map(g => String(g.id)),
    // Tous les groupes de la lecture (export Excel « liste des groupes »), avec effectif et état Nusuk.
    // Pour chaque groupe, les lignes de l'Excel des pèlerins (préparation d'abord, sinon rapport des
    // visas) : nombre de visas délivrés et en cours, pour classer un groupe sans pèlerin reconnu.
    liste: (p.groups || []).map(g => {
      const lignes = (p.observations || []).filter(o => String(o.groupId) === String(g.id))
      const preparation = lignes.filter(o => o.source === 'preparation')
      const membres = preparation.length ? preparation : lignes
      return {
        id: String(g.id), nom: g.name, effectif: g.count, etat: g.status, lignes: membres.length,
        visasEmis: membres.filter(o => o.visaNumber).length,
        visasEnCours: membres.filter(o => visaPending(o.visaStatus || '')).length,
      }
    }) }
}

// Les cinq catégories de groupes (visa-appearance.js du fichier clients).
export const CATEGORIES = VISA_CATEGORIES
export function categorieMachine(panier, rows) {
  const vb = panier?.visaBrouillon
  if (!vb || (!vb.nusukId && !vb.sansGroupe)) return 'temporaire'
  if (vb.sansGroupe) return 'sans-groupe'
  if (vb.phase === 'visa-emis') return 'visa-emis'
  if (vb.phase === 'visa-en-cours') return 'attente-visa'
  const resume = resumeEtatGroupeVisa(panier, rows)
  if (resume.icone === 'visa-emis') return 'visa-emis'
  if (resume.icone === 'attente-visa') return 'attente-visa'
  return 'groupe'
}

// Un groupe dont le visa est en traitement ou délivré est verrouillé : rien n'entre, rien ne sort.
export function motifVerrouMachine(categorie) {
  if (categorie === 'attente-visa') return 'Visa en traitement : ce groupe est verrouillé.'
  if (categorie === 'visa-emis') return 'Visas délivrés : ce groupe est définitif.'
  return ''
}

// Le groupe « sans groupe » de Nusuk est fixe : ni renommé, ni démonté.
export const machineFixe = panier => !!panier?.visaBrouillon?.sansGroupe

export function etatFiche(row, panier) {
  const etat = etatVisuelVisa(row, panier)
  return { etat, icone: visaIconSource(etat), libelle: CATEGORIES[etat]?.label || libelleTechnique[etat] || etat }
}
const libelleTechnique = {
  'non-enregistre': 'Pas encore dans Nusuk', 'a-verifier': 'À vérifier', 'non-conforme': 'Non conforme',
  'visa-rejete': 'Visa refusé', 'en-cours': 'Enregistrement en cours', interrompu: 'Interrompu',
}

export const iconeCategorie = categorie => visaIconSource(categorie)

// Nouvelle machine créée ici : groupe temporaire, « à créer » dans Nusuk.
export const nouveauBrouillon = num => ({ id: `visa-local-${num}-${Date.now()}`, phase: 'brouillon' })

// Colonnes du tableau pour la rubrique Visa. Les lignes reçoivent du Poste de tri le nom de leur
// groupe Visa et leur état (calculés depuis les mêmes données que le panneau des groupes).
export const COLONNES = [
  {
    field: 'photo', headerName: '', width: 48, sortable: false, filter: false,
    cellRenderer: p => p.value ? <img className="pdt-tableau-photo" src={p.value} alt="" /> : <span className="pdt-tableau-photo pdt-tableau-sans-photo">{(p.data.nomAr || p.data.nomLat || '?').trim().slice(0, 1)}</span>,
  },
  { field: 'dossier', headerName: 'Dossier', width: 86 },
  { field: 'nomAr', headerName: 'الاسم', width: 160, cellClass: 'pdt-cellule-ar' },
  { field: 'nomLat', headerName: 'Nom', width: 160 },
  { field: 'jawazNumero', headerName: 'Passeport', width: 112 },
  {
    field: 'etatLibelle', headerName: 'État Nusuk', width: 170,
    cellRenderer: p => <span className="pdt-tableau-etat"><img src={p.data.etatIcone} alt="" />{p.value}</span>,
  },
  { field: 'groupeVisa', headerName: 'Groupe Visa', width: 170 },
  { field: 'nusukGroupeId', headerName: 'N° groupe Nusuk', width: 130 },
  { field: 'visaNumero', headerName: 'N° visa', width: 110 },
]

const attendre = (ms, signal) => new Promise((resolve, reject) => {
  const fin = () => { clearTimeout(minuterie); reject(new DOMException('Arrêt', 'AbortError')) }
  const minuterie = setTimeout(() => { signal?.removeEventListener('abort', fin); resolve() }, ms)
  signal?.addEventListener('abort', fin, { once: true })
})

// Demande à l'extension de refaire maintenant les exports Excel officiels de Nusuk (liste des groupes,
// liste des pèlerins) pour ce compte et cette adresse du site, puis attend que l'archive arrive au
// serveur. Commande « refresh » du fichier clients (ExecutePlan.tsx) : aucun groupe ni pèlerin envoyé,
// Nusuk est seulement lu. « suivre » reçoit les étapes à afficher.
export async function actualiserExcelNusuk(signal, suivre = () => {}) {
  const lire = async () => json(await fetch('/api/client/nusuk/imports', { cache: 'no-store', signal }))
  const avant = await lire()
  if (!avant.accountId) throw new Error('Session du logiciel absente : reconnectez-vous.')
  const deja = new Set((avant.imports || []).map(i => i.id))
  const commandId = crypto.randomUUID(), debut = Date.now()
  suivre('Demande envoyée à l’extension…')
  await envoyerPlanNusuk({ commandId, localScope: avant.accountId, groups: [], people: [], execution: { version: 1, mode: 'refresh' } })
  suivre('Exports Excel en cours sur Nusuk…')
  while (Date.now() - debut < 180000) {
    await attendre(2000, signal)
    const neuve = (await lire()).imports?.find(i => !i.testSource && !deja.has(i.id))
    if (neuve) return neuve
    const suivi = await lireAffectationIndividuelle(commandId).catch(() => null)
    if (suivi && ['error', 'failed', 'refused', 'cancelled', 'interrupted'].includes(suivi.state)) throw new Error(suivi.message || suivi.error || 'Export interrompu par l’extension.')
  }
  throw new Error('Aucun export Excel reçu après 3 minutes : consultez le suivi de l’extension.')
}

// ─── Liste des groupes Visa (panneau des groupes) ──────────────────────────────────────────────────
// Le fond du panneau des groupes vit ici, côté Poste de tri : quels groupes, dans quelle catégorie,
// avec quel effectif, quel état et quel ordre. Le panneau (panneau-groupes/) ne fait qu'afficher.

// Les 5 catégories du logiciel, plus une 6e : « Refusé — Nusuk » (rouge), pour un groupe dont l'état
// Nusuk est un refus ou un renvoi. Son icône est le dossier Nusuk passé au rouge (le triangle et la
// flèche brisée restent réservés aux avertissements).
export const CATEGORIES_LISTE = { ...VISA_CATEGORIES, refuse: { label: 'Refusé — Nusuk', color: '#C2514B' } }
export const iconeGroupe = categorie => (categorie === 'refuse' ? iconeRefuse.src : visaIconSource(categorie))
// Ordre des catégories : sans groupe, modifiables, visa en attente, visa obtenu, refusés, temporaires.
export const RANG_LISTE = { 'sans-groupe': 0, groupe: 1, 'attente-visa': 2, 'visa-emis': 3, refuse: 4, temporaire: 5 }
export const LOGICIEL_LISTE = { 'sans-groupe': 'Par défaut', temporaire: 'Temporaire' }
export const ETAT_LISTE = { 'sans-groupe': 'بدون مجموعة', groupe: 'قابل للتعديل', 'attente-visa': 'بانتظار التأشيرة', 'visa-emis': 'التأشيرة صادرة', refuse: 'مرفوضة', temporaire: 'محلي' }

// Les 14 états du filtre « الحالة » de la liste des groupes Nusuk (relevés le 2026-10-13), rangés en
// quatre familles : bleu = en préparation, orange = envoyé ou en traitement, vert = visas délivrés,
// rouge = refusé ou renvoyé. Classement proposé, pas une définition officielle (Nusuk n'en publie pas).
const FAMILLES_NUSUK = {
  'مسودة': 'bleu', 'جديد': 'bleu',
  'تم ربط البرنامج': 'orange', 'بانتظار ربط البرنامج': 'orange', 'تم الإرسال لنظام العمرة': 'orange', 'تم إصدار الفاتورة': 'orange',
  'تم ربط البرنامج - إستضافة': 'orange', 'بانتظار موافقة المستضيف': 'orange', 'معالجة طلب الاستضافة': 'orange',
  'مجموعات مكتملة': 'vert',
  'مرفوضة': 'rouge', 'تم الإرجاع إلى الوكيل الرئيسي': 'rouge', 'تم الارجاع للوكيل الفرعي': 'rouge', 'تم رفض طلب الاستضافة': 'rouge',
}
const ORDRE_FAMILLES = { bleu: 0, orange: 1, vert: 2, rouge: 3, neutre: 4 }
// Orange franc (#EF8A2B) : distinct de l'ocre des groupes temporaires (#D18A36).
const COULEUR_FAMILLE = { bleu: '#4776C5', orange: '#EF8A2B', vert: '#399777', rouge: '#C2514B', neutre: '#929aa1' }
// Catégorie (icône) d'un groupe Nusuk qu'aucun pèlerin du registre ne rattache, d'après son état.
const CATEGORIE_FAMILLE = { bleu: 'groupe', orange: 'attente-visa', vert: 'visa-emis', rouge: 'refuse', neutre: 'groupe' }
export const familleNusuk = etat => FAMILLES_NUSUK[etat] || 'neutre'

// Tous les groupes de la lecture Nusuk (comme la liste des groupes sur Nusuk), plus « sans groupe »
// et les groupes du logiciel (temporaires). Un groupe Nusuk qu'aucun pèlerin du registre ne rattache est
// affiché quand même, avec son effectif et son état lus sur Nusuk. Un groupe Nusuk disparu de la lecture
// (« obsolète ») est écarté, comme dans le fichier clients. Entrée : les paniers (groupes) de la page,
// les pèlerins et la lecture (« lecture » de chargerVisa). Sortie : { g, categorie, rang, nusuk }.
export function listeGroupesVisa({ paniers, rows, lecture }) {
  const liste = lecture?.liste || []
  const lus = new Map(liste.map((n, i) => [n.id, { ...n, rang: i + 1 }]))
  const vus = new Set()
  // « ordre » : la place du groupe dans l'ordre des groupes (celui qu'on règle en les déplaçant, commun au registre).
  const depuisPaniers = (paniers || []).filter(g => g.visaBrouillon && !g.visaBrouillon.obsolete).map((g, ordre) => {
    const id = String(g.visaBrouillon?.nusukId || '')
    const nusuk = (id && lus.get(id)) || null
    if (nusuk) vus.add(id)
    const categorie = nusuk && familleNusuk(nusuk.etat) === 'rouge' ? 'refuse' : categorieMachine(g, rows)
    return { g, categorie, rang: nusuk?.rang ?? null, nusuk, ordre }
  })
  const absents = [...lus.values()].filter(n => !vus.has(n.id)).map(n => ({
    g: { num: 100000 + n.rang, nomPerso: n.nom, ids: [], visaBrouillon: { nusukId: n.id, baseIds: [], baseNom: n.nom } },
    categorie: familleNusuk(n.etat) === 'rouge' ? 'refuse'
      : n.visasEnCours ? 'attente-visa'
      : n.effectif > 0 && n.lignes >= n.effectif && n.visasEmis === n.lignes ? 'visa-emis'
      : CATEGORIE_FAMILLE[familleNusuk(n.etat)],
    rang: n.rang, nusuk: n, absent: true,
  }))
  // Les groupes dans leur ordre ; ceux de la lecture Nusuk sans groupe ici, ensuite, par catégorie.
  return [...depuisPaniers, ...absents.sort((a, b) => RANG_LISTE[a.categorie] - RANG_LISTE[b.categorie] || a.g.num - b.g.num)]
}

// Ce qu'affiche un groupe : l'effectif (Nusuk, ajusté des déplacements faits ici) et l'état lus sur Nusuk quand le groupe y est ; sinon (sans
// groupe, temporaire) le nombre de pèlerins du registre et l'état du logiciel. Couleur de la ligne :
// celle de la catégorie, sauf un groupe Nusuk à l'état orange (envoyé, en traitement), qui prend l'orange
// de son état plutôt que le mauve de « Visa en attente ».
export function infoGroupe({ g, categorie, nusuk }) {
  const famille = nusuk ? familleNusuk(nusuk.etat) : 'neutre'
  // Effectif d'un groupe Nusuk : celui lu sur Nusuk, ajusté des pèlerins ajoutés ou retirés ici depuis la
  // lecture, pour que le nombre suive chaque déplacement (il restait figé à la valeur Nusuk).
  const { plus, moins } = deltaCarte(g)
  return {
    effectif: nusuk ? Math.max(0, (nusuk.effectif ?? 0) + plus - moins) : g.ids.length,
    registre: g.ids.length,
    etat: nusuk?.etat || ETAT_LISTE[categorie],
    famille,
    couleurEtat: nusuk ? COULEUR_FAMILLE[famille] : CATEGORIES_LISTE[categorie]?.color || '#929aa1',
    couleurLigne: nusuk && famille === 'orange' ? COULEUR_FAMILLE.orange : CATEGORIES_LISTE[categorie]?.color || '#929aa1',
  }
}

// Résumé d'un groupe, prêt à afficher.
export function resumeGroupe(x) {
  const { g, categorie, rang } = x
  const { plus, moins } = deltaCarte(g)
  const info = infoGroupe(x)
  return {
    nom: g.nomPerso, nusuk: g.visaBrouillon?.nusukId || '', nombre: info.effectif, registre: info.registre, lu: !!x.nusuk, plus, moins, rang,
    logiciel: LOGICIEL_LISTE[categorie] || 'Groupe Nusuk', etat: info.etat, couleurEtat: info.couleurEtat,
    couleur: info.couleurLigne, icone: iconeGroupe(categorie),
  }
}

// Tri du tableau : un clic sur un titre trie par cette colonne, un second clic inverse le sens. Par
// défaut, rang Nusuk croissant (1, 2, 3… de haut en bas). « vue » : affichés d'abord, puis masqués. Les
// groupes sans rang Nusuk restent en bas quand on trie par rang, dans les deux sens.
const CLES_TRI = {
  ordre: x => x.ordre ?? Infinity,
  rang: x => x.rang ?? Infinity,
  vue: (x, masques) => (masques.has(x.g.num) ? 1 : 0),
  nombre: x => infoGroupe(x).effectif,
  groupe: x => x.g.nomPerso || '',
  numero: x => x.g.visaBrouillon?.nusukId || '',
  logiciel: x => LOGICIEL_LISTE[x.categorie] || 'Groupe Nusuk',
  etat: x => ORDRE_FAMILLES[infoGroupe(x).famille] * 100 + RANG_LISTE[x.categorie],
  ecart: x => { const d = deltaCarte(x.g); return d.plus + d.moins },
}
export const estTriable = cle => !!CLES_TRI[cle]
// Par défaut, l'ordre des groupes. Un titre de colonne trie pour consulter (croissant, puis décroissant) ; un troisième
// clic revient à l'ordre des groupes.
export const TRI_INITIAL = { cle: 'ordre', sens: 'haut' }
export const triSuivant = (tri, cle) => (tri.cle !== cle ? { cle, sens: 'haut' } : tri.sens === 'haut' ? { cle, sens: 'bas' } : TRI_INITIAL)
export function trierGroupes(groupes, tri, masques = new Set()) {
  const valeur = CLES_TRI[tri.cle] || CLES_TRI.rang
  const sens = tri.sens === 'bas' ? -1 : 1
  return [...groupes].sort((a, b) => {
    const x = valeur(a, masques), y = valeur(b, masques)
    if ((tri.cle === 'rang' || tri.cle === 'ordre') && (x === Infinity) !== (y === Infinity)) return x === Infinity ? 1 : -1
    const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'ar', { numeric: true })
    return (r * sens) || ((a.rang ?? 1e9) - (b.rang ?? 1e9)) || (a.g.num - b.g.num)
  })
}
