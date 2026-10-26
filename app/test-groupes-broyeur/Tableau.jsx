'use client'
// Tableau commun du Poste de tri : AG Grid, la même bibliothèque que le fichier clients.
// Il ne connaît aucune rubrique : les colonnes viennent de la fiche de réglages (Visa, Aérien…).
// Disposition et sélection du tableau du fichier clients (demande du 2026-10-25) : de droite à gauche, case à cocher
// tout à droite, balayage des cases (appuyer sur une case puis descendre ou monter coche toutes les lignes
// traversées), Maj+clic pour une plage. On prend un pèlerin par sa photo, son numéro ou son nom (toute la cellule) :
// le même glisser que les fiches, vers les groupes. Couleurs inchangées (thème du Poste de tri).
import { forwardRef, memo, useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import { AgGridReact } from 'ag-grid-react'
import { AllCommunityModule, ModuleRegistry, themeQuartz } from 'ag-grid-community'

ModuleRegistry.registerModules([AllCommunityModule])

// Thème « nuit » du fichier clients, accordé au fond du Poste de tri.
const theme = themeQuartz.withParams({
  backgroundColor: '#1b1e24', foregroundColor: '#e4e8eb', headerBackgroundColor: '#15181d', headerTextColor: '#98a3ac',
  borderColor: '#2c313a', accentColor: '#4ea5f0', rowHoverColor: '#232830', selectedRowBackgroundColor: '#24364a',
  browserColorScheme: 'dark', fontSize: 12.5, headerFontSize: 11.5, rowHeight: 40, headerHeight: 36,
})

// Colonnes par lesquelles on prend un pèlerin pour le glisser vers un groupe.
const COLONNES_PRISE = new Set(['photo', 'dossier', 'nomAr', 'nomLat'])
const CASE = 'ag-Grid-SelectionColumn'

const Tableau = memo(forwardRef(function Tableau({ lignes, colonnes, surPrise, surSelection }, ref) {
  const zone = useRef(null)
  const grille = useRef(null)
  const prise = useRef(surPrise)
  prise.current = surPrise
  useImperativeHandle(ref, () => ({
    // Dossiers cochés dans le tableau, dans l'ordre affiché.
    selection: () => (grille.current?.api?.getSelectedRows() || []).map(r => r.dossier),
    deselectionner: () => grille.current?.api?.deselectAll(),
    // Coche exactement ces dossiers (sélection partagée avec le registre de l'espace client).
    selectionner: dossiers => {
      const api = grille.current?.api
      if (!api || api.isDestroyed?.()) return
      const cles = new Set(dossiers.map(String)), nodes = []
      api.forEachNode(n => { if (n.data && cles.has(String(n.data.dossier))) nodes.push(n) })
      api.deselectAll()
      if (nodes.length) api.setNodesSelected({ nodes, newValue: true })
    },
  }), [])
  const definitions = useMemo(() => colonnes.map(c => (COLONNES_PRISE.has(c.field || c.colId) ? { ...c, cellClass: [c.cellClass, 'pdt-cellule-prise'].filter(Boolean).join(' ') } : c)), [colonnes])

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

  return (
    <div ref={zone} className="pdt-tableau">
      <AgGridReact ref={grille} theme={theme} rowData={lignes} columnDefs={definitions} getRowId={p => String(p.data.dossier)} enableRtl
        rowSelection={{ mode: 'multiRow', enableClickSelection: false }} defaultColDef={{ sortable: true, resizable: true, filter: true }}
        onSelectionChanged={() => surSelection?.((grille.current?.api?.getSelectedRows() || []).map(r => r.dossier))}
        animateRows suppressCellFocus />
    </div>
  )
}))

export default Tableau
