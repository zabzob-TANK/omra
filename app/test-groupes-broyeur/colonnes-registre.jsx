'use client'
// Le tableau du Poste de tri reprend la vue du registre (demande du 2026-10-26) : les colonnes que la page client
// affiche ou masque, dans son ordre et à ses largeurs, sont les mêmes ici. Dans l'espace client, la vue courante
// est commune aux deux tableaux. Sans registre monté, le banc d'essai suit la configuration liée à Visa,
// puis la configuration active ou par défaut. Les colonnes s'affichent en texte simple, sauf la photo, l'état Nusuk et le
// groupe, qui gardent l'affichage du Poste de tri. Chaque colonne garde sa rubrique (Identité, Passeport, Visa…) : le
// tableau trace entre les rubriques les mêmes séparations que la page client.
import { creerControleurRegistre } from '../../modules/client-react/controleurs/Registre'
import { classesTableau } from '../../modules/client-react/tableau-commun'

const PREFIXE = 'codex-react:' // préfixe des réglages de la page client dans ce navigateur (ClientReact.jsx)
const lire = cle => { try { return window.localStorage.getItem(cle) } catch { return null } }

// Contrôleur de lecture, pour le Poste de tri seul (sans registre monté) : il ne sert qu'à connaître les colonnes du
// registre et ses configurations intégrées ; il ne s'affiche pas et n'écrit rien.
let lecteur = null
function controleurLecture() {
  if (!lecteur) {
    const stockage = { getItem: cle => lire(PREFIXE + cle), setItem() {}, removeItem() {} }
    lecteur = creerControleurRegistre({ stockage, mode: 'connecte', seuilAlerteJawazMois: 6 })
  }
  return lecteur
}

// Colonnes feuilles du registre (sans les groupes d'en-tête), par identifiant, avec leur rubrique.
function feuilles(defs, acc = new Map(), rubrique = null) {
  for (const d of defs || []) {
    if (d.children) feuilles(d.children, acc, d.headerGroupComponentParams?.gid || rubrique)
    else { const id = d.colId || d.field; if (id && id !== 'ag-Grid-SelectionColumn') acc.set(id, [d, rubrique]) }
  }
  return acc
}

// Configuration suivie : liée à Visa, sinon active, sinon par défaut.
function configSuivie(m) {
  let liens = {}
  try { liens = (m.state?.configModes !== undefined ? m.state.configModes : JSON.parse(lire('omra-client-config-modes') || '{}')) || {} } catch { liens = {} }
  let configs = m.state?.configs?.length ? m.state.configs : null
  if (!configs) {
    let perso = []
    try { perso = JSON.parse(lire(PREFIXE + 'omra-client-registre-configs') || '[]') || [] } catch { perso = [] }
    const pre = m.configsPredefinies?.() || []
    configs = [...pre, ...perso.filter(c => !pre.some(p => p.nom === c.nom))]
  }
  const active = m.state?.configActive || lire(PREFIXE + 'omra-client-config-active')
  return configs.find(c => c.nom === liens.visa) || configs.find(c => c.nom === active) || configs.find(c => c.defaut) || null
}

// Sécurité : une fonction du registre qui échoue ici (elle attend son tableau) rend la valeur brute.
const prudent = (f, repli) => (f ? p => { try { return f(p) } catch { return repli(p) } } : undefined)
const valeurBrute = p => p.data?.[p.colDef.field]

// « propres » : colonnes du Poste de tri qui gardent leur affichage, par identifiant de colonne du registre.
export function colonnesDuRegistre(m, propres) {
  const ctrl = m || controleurLecture()
  let defs
  try { defs = (ctrl.defsAvecMode ? ctrl.defsAvecMode() : ctrl.colonnesDefs()) } catch { return null }
  const parId = feuilles(defs)
  if (!parId.size) return null
  // Dans l'espace client, suivre la vue réellement affichée, y compris les
  // réglages non encore enregistrés. Le banc d'essai garde son repli enregistré.
  const cfg = ctrl.api && !ctrl.api.isDestroyed?.() ? { colonnes: ctrl.api.getColumnState() } : configSuivie(ctrl)
  const etat = new Map((cfg?.colonnes || []).map((c, i) => [c.colId, { ...c, rang: i }]))
  const ordre = [...parId.keys()].sort((a, b) => (etat.get(a)?.rang ?? 1e6) - (etat.get(b)?.rang ?? 1e6))
  return ordre.map(id => {
    const [d, rubrique] = parId.get(id), e = etat.get(id)
    const propre = propres[id]
    const base = propre ? { ...propre, colId: id } : {
      colId: id, field: d.field, headerName: d.headerName,
      valueGetter: prudent(d.valueGetter, valeurBrute), valueFormatter: prudent(d.valueFormatter, p => p.value),
      filter: d.filter === false ? false : true,
    }
    return {
      ...base,
      headerName: d.headerName || base.headerName || '',
      headerValueGetter: d.headerValueGetter,
      headerClass: d.headerClass,
      cellClass: classesTableau(base.cellClass, d.cellClass),
      filter: d.filter ?? true,
      filterParams: d.filterParams,
      cellDataType: d.cellDataType,
      minWidth: d.minWidth,
      width: e?.width || d.width || base.width,
      pinned: e ? e.pinned ?? null : d.pinned ?? null,
      sort: e?.sort ?? null,
      sortIndex: e?.sortIndex ?? null,
      context: { ...base.context, rubrique },
      // Une colonne absente de la configuration suivie y était masquée.
      hide: cfg ? (e ? !!e.hide : true) : !!d.hide,
    }
  })
}
