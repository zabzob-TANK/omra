'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { actualiserExcelNusuk, chargerVisa, listeGroupesVisa } from '../rubrique-visa'
import { PanneauGroupes } from '../panneau-groupes/panneau'
import './barre.css'

// Atelier d'affichage du panneau des groupes Visa : on y règle la mise en page, les couleurs et les
// animations. Les règles des groupes vivent dans la fiche Visa (rubrique-visa.jsx) et le panneau dans
// panneau-groupes/, que le Poste de tri utilise aussi. Lecture seule.

// D'où viennent les groupes : la dernière archive des exports Excel de Nusuk (liste des groupes et
// liste des pèlerins) reçue par le serveur pour ce compte et cette adresse du site. Le bouton demande
// à l'extension de refaire ces exports maintenant, puis relit l'archive.
function Source({ lecture, onActualise }) {
  const [etat, setEtat] = useState({ occupe: false, message: '' })
  const arret = useRef(null)
  useEffect(() => () => arret.current?.abort(), [])
  async function actualiser() {
    if (arret.current) return
    const a = new AbortController()
    arret.current = a
    setEtat({ occupe: true, message: '' })
    try {
      await actualiserExcelNusuk(a.signal, message => setEtat({ occupe: true, message }))
      setEtat({ occupe: false, message: 'Exports Excel reçus : liste actualisée.' })
      onActualise()
    } catch (e) {
      if (!a.signal.aborted) setEtat({ occupe: false, message: e.message === 'Réponse de l’extension non reçue.' ? 'Extension non détectée sur cette page : rechargez l’extension Omra, puis cette page.' : e.message })
    } finally { arret.current = null }
  }
  const date = lecture?.importedAt ? new Date(lecture.importedAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : null
  return (
    <div className="mb-source">
      <span>{date ? <>Excel Nusuk du <b>{date}</b> · {lecture.groupes} groupes{lecture.adresse && <> · envoyé depuis {lecture.adresse.replace(/^https?:\/\//, '')}</>}</> : 'Aucun export Excel de Nusuk pour ce compte'}</span>
      <button type="button" onClick={actualiser} disabled={etat.occupe} aria-busy={etat.occupe}>{etat.occupe ? 'Actualisation…' : 'Actualiser depuis Nusuk (Excel)'}</button>
      {etat.message && <span className="mb-source-message" role="status">{etat.message}</span>}
    </div>
  )
}

export default function Barre() {
  // Comme le fichier clients : ses groupes Visa (dont les temporaires créés dans le logiciel),
  // complétés par la dernière lecture Nusuk du compte, quelle que soit l'adresse d'envoi.
  const [donnees, setDonnees] = useState({ etat: 'en-cours', paniers: [], rows: [], lecture: null, alerte: '' })
  const [version, setVersion] = useState(0)
  useEffect(() => {
    const arret = new AbortController()
    chargerVisa(arret.signal, [], { groupesDuFichierClient: true, toutesAdresses: true })
      .then(r => setDonnees({ etat: 'pret', paniers: r.paniers, rows: r.rows, lecture: r.lecture, alerte: r.alerte }))
      .catch(e => { if (!arret.signal.aborted) setDonnees(d => ({ ...d, etat: 'erreur', alerte: e.message })) })
    return () => arret.abort()
  }, [version])
  const groupes = useMemo(() => listeGroupesVisa(donnees), [donnees])
  const [masques, setMasques] = useState(() => new Set())
  const basculerMasque = num => setMasques(s => { const n = new Set(s); n.has(num) ? n.delete(num) : n.add(num); return n })

  return (
    <div className="mb-page">
      {donnees.etat === 'pret' && <Source lecture={donnees.lecture} onActualise={() => setVersion(v => v + 1)} />}
      {donnees.etat === 'en-cours' && <p className="mb-message">Lecture des groupes…</p>}
      {donnees.alerte && <p className="mb-message mb-alerte">{donnees.alerte}</p>}
      {donnees.etat === 'pret' && <PanneauGroupes groupes={groupes} masques={masques} onMasquer={basculerMasque} />}
    </div>
  )
}
