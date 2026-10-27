'use client'
// Tableau commun du Poste de tri : AG Grid, la même bibliothèque que le fichier clients.
// Il ne connaît aucune rubrique : les colonnes viennent de la fiche de réglages (Visa, Aérien…).
// Disposition et sélection du tableau du fichier clients (demande du 2026-10-25) : de droite à gauche, case à cocher
// tout à droite, balayage des cases (appuyer sur une case puis descendre ou monter coche toutes les lignes
// traversées), Maj+clic pour une plage. On prend un pèlerin par sa photo, son numéro ou son nom (toute la cellule) :
// le même glisser que les fiches, vers les groupes. Dans l'espace client, vue et présentation sont reliées au registre,
// mais pas les couleurs : le tableau garde le sombre du Poste de tri, que le client soit en Jour ou en Nuit
// (demande du 2026-10-26 ; voir poste-de-tri.css). Le banc d'essai autonome conserve son thème du Poste de tri.
import { forwardRef, memo, useEffect, useLayoutEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { AgGridReact } from 'ag-grid-react'
import { AllCommunityModule, ModuleRegistry, themeQuartz } from 'ag-grid-community'
import { creerThemesTableau, appliquerStyleTableau, suivrePresentationTableau, presentationTableau, classesTableau } from '@/modules/client-react/tableau-commun'
import { relierVuesTableaux } from '@/modules/client-react/liaison-tableaux'
import { colonnesDuRegistre } from './colonnes-registre'
import '@/modules/client-react/tableau-commun.css'

ModuleRegistry.registerModules([AllCommunityModule])

// Thème « nuit » du fichier clients, accordé au fond du Poste de tri.
const theme = themeQuartz.withParams({
  backgroundColor: '#1b1e24', foregroundColor: '#e4e8eb', headerBackgroundColor: '#15181d', headerTextColor: '#98a3ac',
  borderColor: '#2c313a', accentColor: '#4ea5f0', rowHoverColor: '#232830', selectedRowBackgroundColor: '#24364a',
  browserColorScheme: 'dark', fontSize: 12.5, headerFontSize: 11.5, rowHeight: 42, headerHeight: 36,
})

// Colonnes par lesquelles on prend un pèlerin pour le glisser vers un groupe.
const COLONNES_PRISE = new Set(['photo', 'dossier', 'nomAr', 'nomLat'])
const CASE = 'ag-Grid-SelectionColumn'

// Séparations entre les rubriques du registre (2026-10-26), comme sur la page client (registre.css, « deb-* ») : un
// trait de 3 px de la couleur de la rubrique là où elle commence, un trait fin entre ses catégories. Calculées sur
// l'ordre affiché : elles suivent les colonnes enregistrées, masquées ou déplacées. Couleurs du thème nuit du registre.
const COULEUR_RUBRIQUE = { ident: 'rgba(255,255,255,.12)', groupes: 'rgba(255,255,255,.12)', pass: 'var(--g-pass-txt, #a6b0e0)', suivi: 'var(--g-suivi-txt, #8cc9a5)', vol: 'var(--g-vol-txt, #8ecdea)', visa: 'var(--g-visa-txt, #cba4de)', fin: 'var(--g-fin-txt, #d8b970)', sec: 'var(--g-sec-txt, #b8964a)' }
const SOUS_SEPARATIONS = { sexe: ['pass', 28, 1], naissance: ['pass', 28, 1], passCin: ['pass', 28, 1], telProg: ['suivi', 28, 1], takhfid: ['fin', 28, 1], pnr: ['vol', 32, 1], retDepart: ['vol', 55, 2] }
function separationsDe(api) {
  if (!api || api.isDestroyed?.()) return ''
  const regles = []
  let avant = null
  for (const col of api.getAllDisplayedColumns()) {
    const rubrique = col.getColDef().context?.rubrique, id = col.getColId().replace(/"/g, '')
    if (!rubrique) continue
    const cible = `.pdt-tableau :is(.ag-header-cell, .ag-cell)[col-id="${id}"]`
    const sous = SOUS_SEPARATIONS[id]
    if (avant && rubrique !== avant) regles.push(`${cible}{border-inline-start:3px solid ${COULEUR_RUBRIQUE[rubrique] || COULEUR_RUBRIQUE.ident} !important}`)
    else if (avant && sous) regles.push(`${cible}{border-inline-start:${sous[2]}px solid color-mix(in srgb, ${COULEUR_RUBRIQUE[sous[0]]} ${sous[1]}%, transparent) !important}`)
    avant = rubrique
  }
  return regles.join('')
}

// « teintes » : couleur par catégorie de groupe (champ « categorieGroupe » des lignes) ; la case à cocher et le cadre de
// la photo de la ligne la prennent (comme le registre en mode Visa).
// « surLargeurContenu » : largeur de toutes les colonnes affichées (avec la barre de défilement et le cadre), donnée à
// la page pour que la liste ne s'élargisse pas au-delà de sa dernière colonne (2026-10-26).
const Tableau = memo(forwardRef(function Tableau({ lignes, colonnes, surPrise, surSelection, teintes = null, surLargeurContenu = null, registre = null, actif = true }, ref) {
  const zone = useRef(null)
  const lueur = useRef(null)
  const grille = useRef(null)
  const hotePopups = useRef(null)
  const prise = useRef(surPrise)
  prise.current = surPrise
  const [separations, setSeparations] = useState('')
  const [apiPrete, setApiPrete] = useState(null)
  const [revisionColonnes, setRevisionColonnes] = useState(0)
  const themesCommuns = useMemo(() => creerThemesTableau(), [])
  const [presentation, setPresentation] = useState(() => registre ? presentationTableau(registre) : null)
  const themePartage = useMemo(() => presentation ? themesCommuns[presentation.theme].withParams({ fontSize: presentation.taille }) : theme, [themesCommuns, presentation?.theme, presentation?.taille])
  useEffect(() => {
    const api = registre?.api
    if (!api || api.isDestroyed?.()) return
    const actualiser = () => setRevisionColonnes(n => n + 1)
    api.addEventListener('newColumnsLoaded', actualiser)
    return () => { if (!api.isDestroyed?.()) api.removeEventListener('newColumnsLoaded', actualiser) }
  }, [registre])
  useLayoutEffect(() => {
    if (!registre || !apiPrete || apiPrete.isDestroyed?.()) return
    const popups = document.createElement('div')
    popups.className = 'om-tableau-commun om-popup-tableau-commun pdt-popups'
    document.body.appendChild(popups)
    hotePopups.current = popups
    apiPrete.setGridOption('popupParent', popups)
    let hauteurPrecedente = null
    const arreterStyle = suivrePresentationTableau(registre, presentationRegistre => {
      if (apiPrete.isDestroyed?.()) return
      // Toujours le thème sombre, sans les couleurs personnalisées du client : seules la police, la taille, les lignes
      // et les photos suivent le registre.
      const p = { ...presentationRegistre, theme: 'nuit', couleurs: {} }
      appliquerStyleTableau(zone.current, p)
      appliquerStyleTableau(popups, p)
      setPresentation(p)
      if (hauteurPrecedente !== p.hauteur) {
        hauteurPrecedente = p.hauteur
        apiPrete.setGridOption('rowHeight', p.hauteur)
        apiPrete.resetRowHeights()
      }
      apiPrete.setGridOption('headerHeight', 34)
      apiPrete.setGridOption('suppressMovableColumns', p.colonnesFigees || (p.rubriquesLiees && !p.colonnesLibres))
    })
    const arreterVue = relierVuesTableaux(registre, apiPrete)
    return () => { arreterStyle(); arreterVue(); if (!apiPrete.isDestroyed?.()) apiPrete.hidePopupMenu?.(); popups.remove(); if (hotePopups.current === popups) hotePopups.current = null }
  }, [registre, apiPrete, themesCommuns])
  useEffect(() => {
    if (hotePopups.current) hotePopups.current.hidden = !actif
    if (!actif && apiPrete && !apiPrete.isDestroyed?.()) apiPrete.hidePopupMenu?.()
  }, [actif, registre, apiPrete])
  const largeurContenu = useRef(surLargeurContenu)
  largeurContenu.current = surLargeurContenu
  const mesurer = api => {
    if (!api || api.isDestroyed?.() || !largeurContenu.current) return
    const colonnesAffichees = api.getAllDisplayedColumns().reduce((s, c) => s + c.getActualWidth(), 0)
    const barre = zone.current?.querySelector('.ag-body-vertical-scroll')?.offsetWidth || 0
    largeurContenu.current(Math.ceil(colonnesAffichees + barre + 2))
  }
  const majSeparations = e => { setSeparations(separationsDe(e.api)); mesurer(e.api) }
  useImperativeHandle(ref, () => ({
    // Dossiers cochés dans le tableau, dans l'ordre affiché.
    selection: () => (grille.current?.api?.getSelectedRows() || []).map(r => r.dossier),
    deselectionner: () => grille.current?.api?.deselectAll(),
    // Coche exactement ces dossiers (sélection de la page, partagée avec le registre de l'espace client) : seules les
    // lignes qui changent sont touchées.
    selectionner: dossiers => {
      const api = grille.current?.api
      if (!api || api.isDestroyed?.()) return
      const cles = new Set(dossiers.map(String)), aCocher = [], aDecocher = []
      api.forEachNode(n => {
        if (!n.data) return
        const voulu = cles.has(String(n.data.dossier))
        if (voulu && !n.isSelected()) aCocher.push(n)
        else if (!voulu && n.isSelected()) aDecocher.push(n)
      })
      if (aDecocher.length) api.setNodesSelected({ nodes: aDecocher, newValue: false })
      if (aCocher.length) api.setNodesSelected({ nodes: aCocher, newValue: true })
    },
    // Décoche ces dossiers (pèlerins non déplaçables retirés d'un bloc glissé).
    decocher: dossiers => {
      const api = grille.current?.api
      if (!api || api.isDestroyed?.()) return
      const cles = new Set(dossiers.map(String)), nodes = []
      api.forEachNode(n => { if (n.data && cles.has(String(n.data.dossier)) && n.isSelected()) nodes.push(n) })
      if (nodes.length) api.setNodesSelected({ nodes, newValue: false })
    },
    // Déplacement refusé : la case et la photo de ces lignes clignotent en rouge une demi-seconde.
    signaler: dossiers => {
      for (const d of dossiers) {
        zone.current?.querySelectorAll(`.ag-row[row-id="${String(d).replace(/"/g, '')}"]`).forEach(l => {
          l.classList.remove('pdt-refus-flash'); void l.offsetWidth; l.classList.add('pdt-refus-flash')
          setTimeout(() => l.classList.remove('pdt-refus-flash'), 600)
        })
      }
    },
  }), [])
  // Une classe par catégorie (réévaluée quand la ligne change) et la couleur de chacune.
  const reglesLignes = useMemo(() => teintes && Object.fromEntries(Object.keys(teintes).map(k => [`pdt-cat-${k}`, p => p.data?.categorieGroupe === k])), [teintes])
  const styleTeintes = useMemo(() => teintes && Object.entries(teintes).map(([k, c]) => `.pdt-tableau .ag-row.pdt-cat-${k}{--teinte-groupe:${c}}`).join(''), [teintes])
  const definitions = useMemo(() => {
    const propres = Object.fromEntries(colonnes.filter(c => ['photo', 'dossier', 'nomAr', 'nusukEtatApercu', 'nusukTemporaire'].includes(c.colId || c.field)).map(c => [c.colId || c.field, c]))
    const communes = registre ? colonnesDuRegistre(registre, propres) || colonnes : colonnes
    return communes.map(c => (COLONNES_PRISE.has(c.field || c.colId) ? { ...c, cellClass: classesTableau(c.cellClass, 'pdt-cellule-prise') } : c))
  }, [colonnes, registre, revisionColonnes])

  // Gestes du fichier clients (Registre.js, surBalayageDown) : balayage et Maj+clic sur les cases, prise par la photo,
  // le numéro ou le nom. Écoutés sur ce tableau seulement.
  useEffect(() => {
    const el = zone.current
    if (!el) return
    const api = () => { const a = grille.current?.api; return a && !a.isDestroyed?.() ? a : null }
    const noeudSous = cible => { const ligne = cible?.closest?.('.ag-row'); return ligne && el.contains(ligne) ? api()?.getRowNode(ligne.getAttribute('row-id')) : null }
    const plage = (de, a, valeur, fait) => {
      for (let i = Math.min(de, a); i <= Math.max(de, a); i++) {
        const n = api()?.getDisplayedRowAtIndex(i)
        if (!n || fait?.has(n.id)) continue
        fait?.add(n.id)
        n.setSelected(valeur)
      }
    }
    let balayage = null, ancre = null
    // Le clic natif qui suit l'appui rebasculerait la case (cochée puis décochée aussitôt).
    const avaler = ev => { ev.stopPropagation(); ev.preventDefault() }
    const appui = e => {
      if (e.button !== 0) return
      const cellule = e.target.closest?.('.ag-cell')
      const noeud = cellule && noeudSous(cellule)
      if (!noeud?.data) return
      const col = cellule.getAttribute('col-id')
      if (col === CASE) {
        e.preventDefault(); e.stopPropagation()
        el.addEventListener('click', avaler, { capture: true, once: true })
        setTimeout(() => el.removeEventListener('click', avaler, { capture: true }), 400)
        if (e.shiftKey && ancre != null) { plage(ancre, noeud.rowIndex, true); return }
        balayage = { valeur: !noeud.isSelected(), fait: new Set([noeud.id]), x0: e.clientX, y0: e.clientY, dernier: noeud.rowIndex }
        ancre = noeud.rowIndex
        noeud.setSelected(balayage.valeur)
        return
      }
      if (COLONNES_PRISE.has(col)) prise.current?.(e, noeud.data.dossier)
    }
    const bouge = e => {
      const b = balayage
      // Le balayage ne part que si la souris a vraiment bougé (pas quand les lignes glissent sous elle).
      if (!b || (Math.abs(e.clientX - b.x0) < 6 && Math.abs(e.clientY - b.y0) < 6)) return
      const noeud = noeudSous(document.elementFromPoint(e.clientX, e.clientY))
      if (!noeud || noeud.rowIndex == null) return
      plage(b.dernier, noeud.rowIndex, b.valeur, b.fait)
      b.dernier = noeud.rowIndex
    }
    const fin = () => { balayage = null }
    el.addEventListener('pointerdown', appui, true)
    window.addEventListener('pointermove', bouge)
    window.addEventListener('pointerup', fin)
    return () => {
      el.removeEventListener('pointerdown', appui, true)
      window.removeEventListener('pointermove', bouge)
      window.removeEventListener('pointerup', fin)
    }
  }, [])

  // Lueur qui suit la souris sur le tableau (2026-10-27) : une seule tache, déplacée par transformation ; elle rejoint la
  // souris en douceur puis s'arrête (aucun calcul quand rien ne bouge) ; éteinte pendant un glisser et au toucher.
  useEffect(() => {
    const el = zone.current, couche = lueur.current, tache = couche?.firstChild
    if (!el || !tache || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    let cible = null, pos = null, image = 0
    const eteindre = () => { couche.removeAttribute('data-actif'); cible = pos = null; cancelAnimationFrame(image); image = 0 }
    const avancer = () => {
      image = 0
      if (!cible) return
      pos = pos ? { x: pos.x + (cible.x - pos.x) * 0.3, y: pos.y + (cible.y - pos.y) * 0.3 } : { ...cible }
      tache.style.transform = `translate(${pos.x.toFixed(1)}px, ${pos.y.toFixed(1)}px)`
      if (Math.abs(cible.x - pos.x) > 0.5 || Math.abs(cible.y - pos.y) > 0.5) image = requestAnimationFrame(avancer)
    }
    const bouge = e => {
      if (e.pointerType === 'touch' || e.buttons) return eteindre()
      const r = el.getBoundingClientRect()
      cible = { x: e.clientX - r.left, y: e.clientY - r.top }
      couche.setAttribute('data-actif', '')
      if (!image) image = requestAnimationFrame(avancer)
    }
    el.addEventListener('pointermove', bouge, { passive: true })
    el.addEventListener('pointerleave', eteindre)
    return () => { el.removeEventListener('pointermove', bouge); el.removeEventListener('pointerleave', eteindre); eteindre() }
  }, [])

  return (
    <div ref={zone} className={registre ? 'pdt-tableau om-tableau-commun' : 'pdt-tableau'}>
      <span ref={lueur} className="pdt-tableau-lueur" aria-hidden="true"><i /></span>
      {styleTeintes && <style>{styleTeintes}</style>}
      {separations && <style>{separations}</style>}
      <AgGridReact ref={grille} theme={registre ? themePartage : theme} rowData={lignes} columnDefs={definitions} getRowId={p => String(p.data.dossier)} enableRtl rowClassRules={reglesLignes || undefined}
        localeText={registre?.api?.getGridOption('localeText')}
        rowSelection={registre?.api?.getGridOption('rowSelection') || { mode: 'multiRow', enableClickSelection: false }} defaultColDef={registre?.api?.getGridOption('defaultColDef') || { sortable: true, resizable: true, filter: true }}
        onSelectionChanged={() => surSelection?.((grille.current?.api?.getSelectedRows() || []).map(r => r.dossier))}
        onGridReady={e => { majSeparations(e); setApiPrete(e.api) }} onDisplayedColumnsChanged={majSeparations}
        onColumnResized={e => { if (e.finished !== false) mesurer(e.api) }} onFirstDataRendered={e => mesurer(e.api)}
        animateRows suppressCellFocus />
    </div>
  )
}))

export default Tableau
