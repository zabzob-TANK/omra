'use client'
// Écran « Groupes » de l'espace client (/client/groupes) : le Poste de tri sur les données du registre (demande du
// 2026-10-25). Deux environnements de travail, une seule source : le registre, chargé une fois et gardé en mémoire
// (caché) pendant que cet écran est affiché. Les pèlerins, la lecture Nusuk et les groupes Visa sont les siens ;
// chaque changement de groupe fait ici lui est écrit, avec ses règles Visa, et il l'enregistre comme les siens. L'ordre
// des groupes et leur visibilité (affiché ici = ouvert dans la partie Visa du registre) sont communs aux deux écrans ;
// seuls les vues et la mise en page sont propres à celui-ci. La page /test-groupes-broyeur reste le banc d'essai à
// part, sur ses propres données.

import { useMemo, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import { abonnerGroupes, lireEtatGroupes } from '@/modules/client-react/pont-groupes'
import { nomsReservesGroupes, prochainNomVisa } from '@/modules/client-react/groupes-locaux'
import { verifierMutationVisa } from '@/modules/client-react/visa-restrictions'
import { estEnregistreNusuk } from '@/modules/client-react/retrait-visa'
import { deplacerMembres } from '@/modules/client-react/groupes-integrite'
import PosteDeTri from './poste-de-tri'
import { resumeLecture } from './rubrique-visa'

// Les groupes que la partie Visa du registre affiche : brouillons Visa non périmés.
const estVisa = g => !!g.visaBrouillon && !g.visaBrouillon.obsolete

export default function EcranGroupes({ actif }) {
  const router = useRouter()
  const { controleur: m, paniers, donnees } = useSyncExternalStore(abonnerGroupes, lireEtatGroupes, lireEtatGroupes)
  const preview = m?.hote?.lectureNusuk
  // Pèlerins et lecture : de nouveaux objets seulement quand le registre ou la lecture changent (pas à chaque
  // changement de groupe), pour que le Poste de tri ne soit pas refait inutilement pendant un dépôt.
  const pelerins = useMemo(() => (m?.donnees || []).filter(r => r.statut !== 'annule'), [m, donnees]) // eslint-disable-line react-hooks/exhaustive-deps
  const lecture = useMemo(() => {
    const tous = m?.donnees || []
    return { recus: tous.length, annules: tous.filter(r => r.statut === 'annule').length, nusuk: preview ? resumeLecture(preview) : null, alerte: '' }
  }, [m, donnees, preview]) // eslint-disable-line react-hooks/exhaustive-deps
  const groupesVisa = useMemo(() => (paniers || []).filter(estVisa).map(g => ({ ...g, origines: g.origines || {} })), [paniers])

  const connecte = useMemo(() => m && {
    // Le registre lui-même : le tableau du Poste de tri reprend ses colonnes et sa vue (colonnes-registre.jsx).
    controleur: m,
    paniers: groupesVisa,
    pelerins,
    lecture,
    // Écrit les groupes du Poste de tri dans le registre : membres, noms, ordre et visibilité (« ferme »). Renvoie le
    // motif d'un refus, sinon '' — ou { avis } quand une règle du registre a placé un pèlerin ailleurs que là où il a
    // été déposé.
    ecrire(machines) {
      const avant = m.state.paniers || []
      const parNum = new Map(machines.map(x => [x.num, x]))
      // Les groupes Visa prennent l'ordre du Poste de tri, aux places des groupes Visa du registre ; ses autres groupes
      // ne bougent pas. Un groupe nouveau va à la fin.
      const file = machines.map(x => {
        const g = avant.find(a => a.num === x.num)
        return g ? { ...g, ids: x.ids, nomPerso: x.nomPerso, origines: x.origines ?? g.origines, ferme: !!x.ferme } : { vue: 'liste', naissance: Date.now(), ...x, ferme: !!x.ferme }
      })
      const suivants = avant.filter(g => !estVisa(g) || parNum.has(g.num)).map(g => (estVisa(g) ? file.shift() : g))
      suivants.push(...file)
      // Un pèlerin qui entre dans un groupe quitte tout autre groupe Visa, y compris ceux que la partie Visa ne montre
      // plus (périmés) : sinon le registre refuse tout le dépôt (« Ce pèlerin appartient déjà à un groupe Visa »).
      const entrants = new Set(machines.flatMap(x => { const ancien = avant.find(g => g.num === x.num); return x.ids.filter(id => !ancien?.ids.some(y => String(y) === String(id))).map(String) }))
      for (let i = 0; i < suivants.length; i++) {
        const g = suivants[i]
        if (g.visaBrouillon && !parNum.has(g.num) && g.ids.some(id => entrants.has(String(id)))) suivants[i] = { ...g, ids: g.ids.filter(id => !entrants.has(String(id))) }
      }
      // Règle du registre (retrait-visa.js) : un pèlerin déjà enregistré dans Nusuk ne sort pas de la préparation ; retiré
      // de son groupe (posé dans « Hors groupe Visa », groupe démonté), il va dans « Pèlerins sans groupe Nusuk ».
      const enVisa = liste => new Set(liste.filter(estVisa).flatMap(g => g.ids.map(String)))
      const restants = enVisa(suivants)
      const replaces = [...enVisa(avant)].filter(id => !restants.has(id))
        .map(id => (m.donnees || []).find(r => String(r.dossier) === id)).filter(estEnregistreNusuk)
      if (replaces.length) {
        let cible = suivants.find(g => g.visaBrouillon?.sansGroupe && !g.visaBrouillon.obsolete)
        if (!cible) {
          cible = { num: Math.max(0, ...suivants.map(g => g.num)) + 1, nomPerso: 'Pèlerins sans groupe Nusuk', ids: [], vue: 'liste', ferme: false, visaBrouillon: { id: 'nusuk-sans-groupe', sansGroupe: true } }
          suivants.push(cible)
        }
        const places = deplacerMembres(suivants, cible.num, replaces.map(r => r.dossier))
        suivants.splice(0, suivants.length, ...places)
      }
      const motif = verifierMutationVisa(avant, suivants, m.donnees || [], m._dossiersVisaEnCours || [], m._affectationIndividuelle || null)
      // Le registre caché ne s'enregistre pas tout seul (il le fait toutes les 300 ms quand il est affiché) : on lui
      // demande d'enregistrer ses groupes tout de suite.
      const fait = m.setState({ paniers: suivants }, () => {
        m.rafraichirIdent?.()
        m.hote?.publierGroupesLocaux?.()
      })
      if (fait === false) return motif || 'Le registre a refusé ce changement.'
      return replaces.length ? { avis: `Déjà enregistré${replaces.length > 1 ? 's' : ''} dans Nusuk : ${replaces.length > 1 ? `${replaces.length} pèlerins placés` : 'placé'} dans « Pèlerins sans groupe Nusuk ».` } : ''
    },
    // Motif pour lequel un pèlerin ne peut pas être déplacé, selon les règles Visa du registre ('' s'il peut l'être).
    motifBlocage: id => m.motifBlocageVisa?.(id) || '',
    // Nouveau groupe temporaire : numéro libre parmi tous les groupes du registre, nom et brouillon comme les siens.
    prochainNum: () => Math.max(0, ...(m.state.paniers || []).map(g => g.num)) + 1,
    prochainNom: () => prochainNomVisa(nomsReservesGroupes(m)),
    nouveauBrouillon: num => ({ id: `visa-local-${num}-${Date.now()}`, creeLe: new Date().toISOString() }),
    // Sélection partagée : les lignes cochées du tableau du registre.
    lireSelection: () => (m.api && !m.api.isDestroyed?.() ? m.api.getSelectedRows().map(r => r.dossier) : []),
    ecrireSelection(dossiers) {
      const api = m.api
      if (!api || api.isDestroyed?.()) return
      const cles = new Set(dossiers.map(String)), nodes = []
      api.forEachNode(n => { if (n.data && cles.has(String(n.data.dossier))) nodes.push(n) })
      api.deselectAll()
      if (nodes.length) api.setNodesSelected({ nodes, newValue: true })
    },
  }, [m, groupesVisa, pelerins, lecture])

  if (!m) return <p role="status" style={{ padding: 20 }}>Chargement du registre…</p>
  // Retour au registre : la partie Visa s'ouvre, avec les groupes travaillés ici (même ordre, mêmes groupes ouverts).
  const retour = () => { if (!m.state.modeVisaLocal) m.basculerVisaLocal?.(); router.push('/client') }
  return <div dir="ltr"><PosteDeTri connecte={connecte} actif={actif} retour={retour} /></div>
}
