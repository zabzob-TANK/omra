'use client'
// Tableau commun du Poste de tri : AG Grid, la même bibliothèque que le fichier clients.
// Il ne connaît aucune rubrique : les colonnes viennent de la fiche de réglages (Visa, Aérien…).
// La poignée ⠿ de chaque ligne lance le même glisser que les fiches, vers les groupes.
import { forwardRef, memo, useImperativeHandle, useMemo, useRef } from 'react'
import { AgGridReact } from 'ag-grid-react'
import { AllCommunityModule, ModuleRegistry, themeQuartz } from 'ag-grid-community'

ModuleRegistry.registerModules([AllCommunityModule])

// Thème « nuit » du fichier clients, accordé au fond du Poste de tri.
const theme = themeQuartz.withParams({
  backgroundColor: '#1b1e24', foregroundColor: '#e4e8eb', headerBackgroundColor: '#15181d', headerTextColor: '#98a3ac',
  borderColor: '#2c313a', accentColor: '#4ea5f0', rowHoverColor: '#232830', selectedRowBackgroundColor: '#24364a',
  browserColorScheme: 'dark', fontSize: 12.5, headerFontSize: 11.5, rowHeight: 40, headerHeight: 36,
})

const Tableau = memo(forwardRef(function Tableau({ lignes, colonnes, surPrise, surSelection }, ref) {
  const grille = useRef(null)
  const prise = useRef(surPrise)
  prise.current = surPrise
  useImperativeHandle(ref, () => ({
    // Dossiers cochés dans le tableau, dans l'ordre affiché.
    selection: () => (grille.current?.api?.getSelectedRows() || []).map(r => r.dossier),
    deselectionner: () => grille.current?.api?.deselectAll(),
  }), [])
  const definitions = useMemo(() => [
    {
      colId: 'poignee', headerName: '', width: 34, pinned: 'left', sortable: false, resizable: false, suppressMovable: true,
      cellRenderer: p => <span className="pdt-poignee" title="Glisser vers un groupe" onPointerDown={e => prise.current?.(e, p.data.dossier)}>⠿</span>,
    },
    ...colonnes,
  ], [colonnes])
  return (
    <div className="pdt-tableau">
      <AgGridReact ref={grille} theme={theme} rowData={lignes} columnDefs={definitions} getRowId={p => String(p.data.dossier)}
        rowSelection={{ mode: 'multiRow', enableClickSelection: false }} defaultColDef={{ sortable: true, resizable: true, filter: true }}
        onSelectionChanged={() => surSelection?.((grille.current?.api?.getSelectedRows() || []).map(r => r.dossier))}
        animateRows suppressCellFocus />
    </div>
  )
}))

export default Tableau
