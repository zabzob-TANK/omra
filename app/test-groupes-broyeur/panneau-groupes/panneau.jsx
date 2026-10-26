'use client'

import { Fragment, memo, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ChevronsDown, ChevronsUp, Info, PanelTop, PictureInPicture2, RotateCcw, Trash2 } from 'lucide-react'
import { CATEGORIES_LISTE, iconeGroupe, resumeGroupe, trierGroupes, triSuivant, TRI_INITIAL } from '../rubrique-visa'
import { BoutonAction, Ecart, NombreGlissant, Oeil, RangNusuk, S_EPINGLE, S_PILE, STYLE_RESSORTS, TitreTri } from './affichage'
import './panneau.css'

// Panneau des groupes Visa : fenêtre fixe et déplaçable, utilisable sur n'importe quelle page
// (atelier d'affichage : /test-groupes-broyeur/barre ; Poste de tri). Affichage seulement.

const AUCUN = new Set()

// Filtres d'affichage du panneau : un interrupteur par catégorie de groupe (icône + nombre). Un clic
// affiche ou cache la catégorie dans le panneau ; le choix est retenu dans ce navigateur.
const FILTRES = [
  { categorie: 'sans-groupe', nom: 'بدون مجموعة' },
  { categorie: 'temporaire', nom: 'مؤقتة' },
  { categorie: 'groupe', nom: 'قابلة للتعديل' },
  { categorie: 'attente-visa', nom: 'بانتظار التأشيرة' },
  { categorie: 'visa-emis', nom: 'التأشيرة صادرة' },
  { categorie: 'refuse', nom: 'مرفوضة' },
]
const CLE_CACHEES = 'mb-groupes-categories-cachees'
const lireCachees = () => { try { const v = JSON.parse(localStorage.getItem(CLE_CACHEES) || '[]'); return new Set(Array.isArray(v) ? v.map(String) : []) } catch { return new Set() } }

// Panneau des groupes : pastilles, halo tournant autour du bloc. Même forme à tous les niveaux, seules les rubriques
// changent ; de droite à gauche, séparées par un petit trait : rang Nusuk, عرض, icône, المجموعة, العدد,
// رقم المجموعة, puis Logiciel, الحالة, + / −, actions. « niveau » : à partir de quel niveau la rubrique
// s'affiche. Largeurs fixes : toutes les pastilles ont la même taille et s'alignent sur les titres.
const RUBRIQUES = [
  { cle: 'rang', titre: 'ترتيب', bulle: 'Rang du groupe dans la liste Nusuk', niveau: 2 },
  { cle: 'vue', titre: 'عرض', niveau: 2 },
  // Nombre de pèlerins entre le nom du groupe et son numéro (demande du commanditaire, 2026-10-19).
  { cle: 'icone', titre: '', niveau: 1 },
  { cle: 'groupe', titre: 'المجموعة', niveau: 1 },
  { cle: 'nombre', titre: 'العدد', niveau: 1 },
  { cle: 'numero', titre: 'رقم المجموعة', niveau: 2 },
  { cle: 'logiciel', titre: 'Logiciel', niveau: 3 },
  { cle: 'etat', titre: 'الحالة', niveau: 3 },
  { cle: 'ecart', titre: '+ / −', bulle: 'المضافون / المُزالون', niveau: 3 },
  { cle: 'actions', titre: '', niveau: 3 },
]

// Formats fixes du panneau ancré : « minimal » (niveau 1 : icône, nom, nombre) et « détail » (niveau 3), quel que
// soit le niveau choisi dans la fenêtre.
const RUBRIQUES_MINIMAL = RUBRIQUES.filter(r => r.niveau <= 1)
const RUBRIQUES_DETAIL = RUBRIQUES

// « nouvelles » : rubriques qui viennent d'apparaître (montée de niveau) ; elles se déroulent.
function Cellules({ rubriques, rendu, nouvelles }) {
  return rubriques.map((r, i) => {
    const neuve = nouvelles?.has(r.cle) ? ' d5-nouvelle' : ''
    return (
      <Fragment key={r.cle}>
        {i > 0 && <i className={'d5-trait' + neuve} aria-hidden="true" />}
        <span className={`d5-c d5-c-${r.cle}${neuve}`}>{rendu(r)}</span>
      </Fragment>
    )
  })
}

// Affichés et masqués (demande du commanditaire, 2026-10-25, à la place des épingles) : en haut, les groupes affichés
// dans la page ; en bas, sous « المخفية », les groupes masqués. Un clic sur un groupe le fait passer de l'un à
// l'autre. La visibilité vient de la page (« masques ») : sur le Poste de tri, c'est celle des groupes du registre.

// Trois niveaux d'information, même forme de pastille : 1 nombre, icône, nom (un clic sur le nom
// affiche ou masque le groupe) ; 2 ajoute rang, œil, numéro ; 3 ajoute tout le reste.
const NIVEAUX = [
  { n: 1, nom: 'أدنى', bulle: 'Nombre, icône et nom' },
  { n: 2, nom: 'عادي', bulle: 'Avec le rang, l’œil et le numéro du groupe' },
  { n: 3, nom: 'تفصيل', bulle: 'Tout le détail' },
]
const CLE_NIVEAU = 'mb-groupes-niveau'
const lireNiveau = () => { try { const n = Number(localStorage.getItem(CLE_NIVEAU)); return [1, 2, 3].includes(n) ? n : 2 } catch { return 2 } }

// Fenêtre « comme sous Windows » : fixe à l'écran (visible même quand la page défile), déplaçable en
// la tirant par son titre ; sa position est retenue dans ce navigateur.
const CLE_POSITION = 'mb-fenetre-groupes'
const lirePosition = () => { try { const p = JSON.parse(localStorage.getItem(CLE_POSITION) || 'null'); return Number.isFinite(p?.x) && Number.isFinite(p?.y) ? p : null } catch { return null } }

// Ancré en haut de la page ou en fenêtre (demande du commanditaire, 2026-10-16) : un bouton de l'en-tête passe de
// l'un à l'autre ; le choix est retenu dans ce navigateur. Seules les pages qui le permettent (« ancrable ») ont
// ce bouton, et l'ancrage y est le choix par défaut ; ailleurs, le panneau reste une fenêtre.
const CLE_ANCRE = 'mb-groupes-ancre'
// « كل المجموعات » toujours dépliée, ou en pile repliée qui s'étale au survol (choix retenu dans ce navigateur).
const CLE_DEPLIEE = 'mb-groupes-pile-depliee'
const lireDepliee = () => { try { return localStorage.getItem(CLE_DEPLIEE) === '1' } catch { return false } }
const lireAncre = () => { try { return localStorage.getItem(CLE_ANCRE) !== 'fenetre' } catch { return true } }

// Le panneau ne fait qu'afficher : la page lui donne les groupes (listeGroupesVisa), les groupes
// masqués et ce qu'il faut faire quand on affiche ou masque un groupe. Tri, épingles, niveau, position
// et animations sont des réglages d'affichage, gérés ici.
// Mémorisé : pendant un glisser dans la page, tant que ses groupes ne changent pas, le panneau n'est pas
// recalculé à chaque mouvement de la souris (c'était une source de saccades sur les petits PC).
// « outils » : réglages de la page posés dans l'en-tête du panneau (sur le Poste de tri : la vue de toutes les machines).
// « onTirer » : la page prend en main le glisser d'un groupe depuis sa pastille (vers l'atelier du Poste de tri).
export const PanneauGroupes = memo(function PanneauGroupes({ groupes: entree, masques = AUCUN, onMasquer, onTirer = null, ancrable = false, outils = null }) {
  const bloc = useRef(null)
  const [ancreChoisi, setAncre] = useState(() => ancrable && lireAncre())
  const ancre = ancrable && ancreChoisi
  const basculerAncre = () => setAncre(a => {
    try { localStorage.setItem(CLE_ANCRE, a ? 'fenetre' : 'haut') } catch { /* préférence facultative */ }
    return !a
  })
  // Fenêtre : la pile « كل المجموعات » peut rester dépliée pour de bon.
  const [depliee, setDepliee] = useState(lireDepliee)
  const basculerDepliee = () => {
    relever()
    setDepliee(d => {
      try { localStorage.setItem(CLE_DEPLIEE, d ? '0' : '1') } catch { /* préférence facultative */ }
      return !d
    })
  }
  const [tri, setTri] = useState(TRI_INITIAL)
  // Glissement des lignes : positions relevées juste avant un changement d'ordre, puis chaque ligne
  // part de son ancienne place avec un ressort (tri : celui de la pile ; affiché/masqué : celui de la Pin List). En
  // largeur aussi : en mode ancré, un groupe passe d'une case à l'autre, côte à côte.
  const avant = useRef(null)
  const relever = (courbe = S_PILE) => {
    const positions = new Map()
    bloc.current?.querySelectorAll('[data-flip]').forEach(el => { const r = el.getBoundingClientRect(); positions.set(el.dataset.flip, [r.left, r.top]) })
    avant.current = { positions, courbe }
  }
  function jouer() {
    const releve = avant.current
    avant.current = null
    if (!releve) return
    bloc.current?.querySelectorAll('[data-flip]').forEach(el => {
      const ancienne = releve.positions.get(el.dataset.flip)
      if (!ancienne) return
      const r = el.getBoundingClientRect(), dx = ancienne[0] - r.left, dy = ancienne[1] - r.top
      if (Math.abs(dx) <= 0.5 && Math.abs(dy) <= 0.5) return
      el.style.position = 'relative'
      el.style.zIndex = Math.hypot(dx, dy) > 80 ? '3' : '1'
      const vol = el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: releve.courbe.duree, easing: releve.courbe.courbe })
      vol.onfinish = vol.oncancel = () => { el.style.zIndex = '' }
    })
  }
  useLayoutEffect(jouer)
  const onTrier = cle => { relever(); setTri(t => triSuivant(t, cle)) }
  const groupes = useMemo(() => trierGroupes(entree, tri, masques), [entree, tri, masques])
  const etat = {
    relever,
    // Afficher ou masquer fait changer le groupe de liste : il y glisse.
    props: num => ({ masque: masques.has(num), onMasquer: () => { relever(S_EPINGLE); onMasquer?.(num) } }),
  }

  const [position, setPosition] = useState(lirePosition)
  function tirer(e) {
    if (ancre || e.button !== 0 || e.target.closest('button, input, label')) return
    const fenetre = bloc.current
    if (!fenetre) return
    e.preventDefault()
    const depart = fenetre.getBoundingClientRect(), x0 = e.clientX, y0 = e.clientY
    let derniere = { x: depart.left, y: depart.top }
    const borner = (v, max) => Math.min(Math.max(8, v), Math.max(8, max))
    const bouge = ev => {
      derniere = { x: borner(depart.left + ev.clientX - x0, window.innerWidth - depart.width - 8), y: borner(depart.top + ev.clientY - y0, window.innerHeight - 60) }
      setPosition(derniere)
    }
    const fin = () => {
      window.removeEventListener('pointermove', bouge); window.removeEventListener('pointerup', fin)
      try { localStorage.setItem(CLE_POSITION, JSON.stringify(derniere)) } catch { /* préférence facultative */ }
    }
    window.addEventListener('pointermove', bouge); window.addEventListener('pointerup', fin)
  }
  const [niveau, setNiveau] = useState(lireNiveau)
  const [cachees, setCachees] = useState(lireCachees)
  const basculerCategorie = categorie => {
    relever()
    setCachees(s => {
      const n = new Set(s)
      n.has(categorie) ? n.delete(categorie) : n.add(categorie)
      try { localStorage.setItem(CLE_CACHEES, JSON.stringify([...n])) } catch { /* préférence facultative */ }
      return n
    })
  }
  // Changement de niveau animé : en montant, les nouvelles rubriques se déroulent ; en descendant,
  // chaque pastille se resserre depuis son ancienne largeur.
  const [depuis, setDepuis] = useState(null)
  const largeurs = useRef(null)
  const choisirNiveau = n => {
    if (n === niveau) return
    if (n < niveau && bloc.current) {
      const m = new Map()
      bloc.current.querySelectorAll('.d5-pastille, .d5-titres').forEach(el => m.set(el.dataset.flip || 'titres', el.getBoundingClientRect().width))
      largeurs.current = m
    }
    setDepuis(niveau)
    setNiveau(n)
    try { localStorage.setItem(CLE_NIVEAU, String(n)) } catch { /* préférence facultative */ }
  }
  useLayoutEffect(() => {
    const m = largeurs.current
    largeurs.current = null
    if (m && bloc.current) {
      bloc.current.querySelectorAll('.d5-pastille, .d5-titres').forEach(el => {
        const avant = m.get(el.dataset.flip || 'titres'), apres = el.getBoundingClientRect().width
        if (avant && Math.abs(avant - apres) > 1) el.animate([{ width: avant + 'px', overflow: 'hidden' }, { width: apres + 'px', overflow: 'hidden' }], { duration: S_PILE.duree, easing: S_PILE.courbe })
      })
    }
    if (depuis == null) return
    const fin = setTimeout(() => setDepuis(null), S_PILE.duree + 80)
    return () => clearTimeout(fin)
  }, [niveau]) // eslint-disable-line react-hooks/exhaustive-deps

  const colonnes = useMemo(() => RUBRIQUES.filter(r => r.niveau <= niveau), [niveau])
  const nouvelles = useMemo(() => (depuis != null && depuis < niveau ? new Set(RUBRIQUES.filter(r => r.niveau > depuis && r.niveau <= niveau).map(r => r.cle)) : null), [depuis, niveau])
  // Actions des pastilles : un objet stable (les pastilles mémorisées ne se redessinent pas pour lui),
  // qui appelle toujours la version à jour.
  const aJour = useRef(null)
  aJour.current = { masquer: num => etat.props(num).onMasquer(), tirer: (e, num) => onTirer?.(e, num) }
  const actions = useMemo(() => ({ masquer: num => aJour.current.masquer(num), tirer: (e, num) => aJour.current.tirer(e, num) }), [])
  const pastille = (x, i, rangPile = null, totalPile = 0) => (
    <Pastille key={x.g.num} x={x} i={i} rangPile={rangPile} totalPile={totalPile} niveau={niveau} colonnes={colonnes} nouvelles={nouvelles}
      masque={masques.has(x.g.num)} actions={actions} />
  )
  // « Pèlerins sans groupe Nusuk » : le groupe le plus important, toujours en tête, à part — ni
  // dans les affichés, ni dans les masqués, ni déplacé par le tri (un clic l'affiche ou le masque aussi).
  const nombreParCategorie = groupes.reduce((m, x) => m.set(x.categorie, (m.get(x.categorie) || 0) + 1), new Map())
  const visibles = groupes.filter(x => !cachees.has(x.categorie))
  const sansGroupe = visibles.filter(x => x.categorie === 'sans-groupe')
  const autres = visibles.filter(x => x.categorie !== 'sans-groupe')
  // En haut les groupes affichés, en bas les masqués, chacun dans l'ordre du tri (par défaut, l'ordre des groupes).
  // Un groupe de la lecture Nusuk sans groupe dans la page (« absent ») ne peut pas être affiché : il reste en bas.
  const enHaut = autres.filter(x => !x.absent && !masques.has(x.g.num))
  const dessous = autres.filter(x => x.absent || masques.has(x.g.num))
  const titre = r => r.titre && <TitreTri cle={r.cle} titre={r.titre} bulle={r.bulle} tri={tri} onTrier={onTrier} />

  const panneau = (
    <div ref={bloc} className="d5 d5-fenetre" dir="rtl" data-niveau={niveau} style={{ ...STYLE_RESSORTS, ...(position ? { left: position.x, top: position.y, right: 'auto' } : null) }}>
      <div className="d5-tete" onPointerDown={tirer} title="Tirer pour déplacer la fenêtre">
        <div className="d5-titre-filtres">
          <h3>المجموعات <span>{visibles.length}</span></h3>
          <div className="d5-filtres" role="group" aria-label="Catégories affichées">
            {FILTRES.map(f => {
              const montree = !cachees.has(f.categorie)
              return (
                <button key={f.categorie} type="button" className="d5-filtre" data-montree={montree} aria-pressed={montree} onClick={() => basculerCategorie(f.categorie)}
                  style={{ '--teinte': CATEGORIES_LISTE[f.categorie]?.color }} title={`${f.nom} — ${montree ? 'affichée : cliquer pour cacher' : 'cachée : cliquer pour afficher'}`}>
                  <img src={iconeGroupe(f.categorie)} alt="" />
                  <b>{nombreParCategorie.get(f.categorie) || 0}</b>
                </button>
              )
            })}
          </div>
        </div>
        <div className="d5-niveaux" role="radiogroup" aria-label="Niveau d'information">
          {NIVEAUX.map(n => (
            <button key={n.n} type="button" role="radio" aria-checked={niveau === n.n} data-actif={niveau === n.n} onClick={() => choisirNiveau(n.n)} title={n.bulle}>
              <b>{n.n}</b>{n.nom}
            </button>
          ))}
        </div>
        {(outils || ancrable) && (
          <div className="d5-outils">
            {outils}
            {ancrable && (
              <button type="button" className="d5-ancrer" onClick={basculerAncre} aria-pressed={!ancre}
                title={ancre ? 'Détacher le panneau en fenêtre déplaçable' : 'Ancrer le panneau en haut de la page'}>
                {ancre ? <PictureInPicture2 size={15} /> : <PanelTop size={15} />}
                <span>{ancre ? 'Fenêtre' : 'Ancrer en haut'}</span>
              </button>
            )}
          </div>
        )}
      </div>

      <div className="d5-titres">
        <Cellules rubriques={colonnes} rendu={titre} nouvelles={nouvelles} />
      </div>

      {sansGroupe.length > 0 && <ul className="d5-liste d5-liste-fixe" aria-label="Groupe par défaut">{sansGroupe.map((x, i) => pastille(x, i))}</ul>}
      {enHaut.length > 0 && <ul className="d5-liste d5-liste-epinglee" aria-label="Groupes affichés">{enHaut.map((x, i) => pastille(x, sansGroupe.length + i))}</ul>}
      {/* Tableau du bas : tous les autres groupes, en pile repliée façon « Notification List » ; elle
          s'étale au survol (ou au clavier). Seules les 3 premières pastilles dépassent au repos. */}
      {dessous.length > 0 && (
        <div className="d5-pile" tabIndex={-1} data-depliee={depliee}>
          <div className="d5-libelle">
            <p>المخفية <span>{dessous.length}</span></p>
            <button type="button" className="d5-deplier" onClick={e => { if (depliee) e.currentTarget.blur(); basculerDepliee() }} aria-pressed={depliee}
              title={depliee ? 'Replier les groupes en pile (elle s’étale au survol)' : 'Déplier tous les groupes'}>
              {depliee ? <ChevronsUp size={14} /> : <ChevronsDown size={14} />}
              <span>{depliee ? 'طيّ' : 'عرض الكل'}</span>
            </button>
          </div>
          <ul className="d5-liste d5-pile-liste">{dessous.map((x, i) => pastille(x, sansGroupe.length + enHaut.length + i, i, dessous.length))}</ul>
        </div>
      )}
    </div>
  )
  if (!ancre) return panneau

  // Ancré (demandes du commanditaire, 2026-10-20) : une bande d'environ 15 % de la hauteur de l'écran. Sur une ligne,
  // trois cases indépendantes, chacune avec sa propre barre de défilement et son format, toujours le même (le
  // niveau 1/2/3 ne sert qu'à la fenêtre), et des largeurs fixes : la bande ne change pas d'une résolution à l'autre.
  //  - « sans groupe » : la moins visible, format minimal ;
  //  - au centre, les groupes affichés, ceux sur lesquels on travaille : tout le détail, toujours entier ;
  //  - les groupes masqués, nombreux : format minimal (icône, nom, nombre).
  // Les réglages (filtres, vue, fenêtre) sont à part, sur leur propre ligne au-dessus.
  const caseGroupes = (cle, nom, liste, vide, depart, n, colonnesCase, reduite) => (
    <section className={`d5-case d5-case-${cle}${reduite ? ' d5-case-reduite' : ''}`} aria-label={nom} data-niveau={n}>
      <h4>{nom} <span>{liste.length}</span></h4>
      {liste.length
        ? <ul className="d5-case-liste">{liste.map((x, i) => (
          <Pastille key={x.g.num} x={x} i={depart + i} niveau={n} colonnes={colonnesCase} nouvelles={null}
            masque={masques.has(x.g.num)} actions={actions} />
        ))}</ul>
        : <p className="d5-case-vide">{vide}</p>}
    </section>
  )
  return (
    <div ref={bloc} className="d5 d5-compact" dir="rtl" style={STYLE_RESSORTS}>
      <div className="d5-compact-reglages">
        <div className="d5-filtres" role="group" aria-label="Catégories affichées">
          {FILTRES.map(f => {
            const montree = !cachees.has(f.categorie)
            return (
              <button key={f.categorie} type="button" className="d5-filtre" data-montree={montree} aria-pressed={montree} onClick={() => basculerCategorie(f.categorie)}
                style={{ '--teinte': CATEGORIES_LISTE[f.categorie]?.color }} title={`${f.nom} — ${montree ? 'affichée : cliquer pour cacher' : 'cachée : cliquer pour afficher'}`}>
                <img src={iconeGroupe(f.categorie)} alt="" />
                <b>{nombreParCategorie.get(f.categorie) || 0}</b>
              </button>
            )
          })}
        </div>
        <div className="d5-outils">
          {outils}
          <button type="button" className="d5-ancrer" onClick={basculerAncre} title="Détacher le panneau en fenêtre déplaçable">
            <PictureInPicture2 size={15} /><span>Fenêtre</span>
          </button>
        </div>
      </div>
      <div className="d5-compact-cases">
        {caseGroupes('sans-groupe', 'بدون مجموعة', sansGroupe, '—', 0, 1, RUBRIQUES_MINIMAL, true)}
        {caseGroupes('epingles', 'المعروضة', enHaut, 'لا توجد مجموعة معروضة', sansGroupe.length, 3, RUBRIQUES_DETAIL, true)}
        {caseGroupes('tous', 'المخفية', dessous, 'لا توجد مجموعة مخفية', sansGroupe.length + enHaut.length, 1, RUBRIQUES_MINIMAL, true)}
      </div>
    </div>
  )
})

// Même pastille si : même groupe (même objet, ou même nom, mêmes membres, même état), même catégorie,
// même rang, même état et même effectif Nusuk, et même affichage (place, niveau, épingle, masque).
function memePastille(a, b) {
  const ga = a.x.g, gb = b.x.g
  // Le Poste de tri recrée ses groupes à chaque dépôt : on compare le contenu (nom, membres, état), pas l'objet.
  const memeGroupe = ga === gb || (ga.num === gb.num && ga.nomPerso === gb.nomPerso && ga.ids.length === gb.ids.length
    && ga.ids.every((id, k) => id === gb.ids[k]) && ga.visaBrouillon?.phase === gb.visaBrouillon?.phase
    && ga.visaBrouillon?.baseIds === gb.visaBrouillon?.baseIds && ga.visaBrouillon?.sansGroupe === gb.visaBrouillon?.sansGroupe)
  return memeGroupe && a.x.categorie === b.x.categorie && a.x.rang === b.x.rang
    && a.x.nusuk?.etat === b.x.nusuk?.etat && a.x.nusuk?.effectif === b.x.nusuk?.effectif
    && a.i === b.i && a.rangPile === b.rangPile && a.totalPile === b.totalPile && a.niveau === b.niveau
    && a.colonnes === b.colonnes && a.nouvelles === b.nouvelles && a.masque === b.masque && a.actions === b.actions
}

// Une pastille. Mémorisée : redessinée seulement si son groupe ou son affichage change (voir memePastille).
// « rangPile » : place dans la pile du bas (null ailleurs). « actions » est stable d'un rendu à l'autre.
const Pastille = memo(function Pastille({ x, i, rangPile = null, totalPile = 0, niveau, colonnes, nouvelles, masque, actions }) {
    const r = resumeGroupe(x), p = { masque, onMasquer: () => actions.masquer(x.g.num) }
    const contenu = {
      rang: () => <RangNusuk rang={r.rang} />,
      vue: () => <Oeil masque={p.masque} onMasquer={p.onMasquer} />,
      nombre: () => <b className="d5-nombre" title={r.lu ? `Sur Nusuk ; ${r.registre} dans le registre` : undefined}><NombreGlissant nombre={r.nombre} /></b>,
      icone: () => <img className="d5-icone" src={r.icone} alt="" />,
      // Au niveau 1, sans œil : un clic sur le nom affiche ou masque le groupe.
      groupe: () => niveau === 1
        ? <button type="button" className="d5-nom-bouton" onClick={p.onMasquer} aria-pressed={!p.masque} title={`${r.nom} — ${p.masque ? 'cliquer pour afficher' : 'cliquer pour masquer'}`}><span className="d5-nom" dir="auto">{r.nom}</span></button>
        : <span className="d5-nom" dir="auto" title={r.nom}>{r.nom}</span>,
      numero: () => <span className="d5-num" dir="ltr">{r.nusuk || '—'}</span>,
      logiciel: () => <span className="d5-logiciel" dir="ltr">{r.logiciel}</span>,
      etat: () => <span className="mb-pastille-libre" style={{ '--teinte': r.couleurEtat }} title={r.etat}>{r.etat}</span>,
      ecart: () => <Ecart plus={r.plus} moins={r.moins} />,
      actions: () => (
        <span className="d5-actions">
          <BoutonAction Icone={Info} libelle="معلومات" ton="gris" desactive raison="Détail du groupe : pas encore branché" />
          <BoutonAction Icone={Trash2} libelle="حذف" ton="rouge" desactive raison={x.categorie === 'temporaire' ? 'Suppression : pas encore branchée' : 'Seuls les groupes temporaires se suppriment'} />
          <BoutonAction Icone={RotateCcw} libelle="استعادة" ton="vert" desactive raison={r.plus || r.moins ? 'Restauration : pas encore branchée' : 'Aucun ajout ni retrait à annuler'} />
        </span>
      ),
    }
    return (
      // Un clic n'importe où sur le groupe l'affiche ou le masque (les boutons gardent leur propre action).
      <li key={x.g.num} data-flip={x.g.num} className="d5-pastille" data-masque={p.masque} data-rang-pile={rangPile ?? undefined} style={{ '--teinte': r.couleur, '--i': i, ...(rangPile == null ? {} : { '--rang': Math.min(rangPile, 3), '--z': totalPile - rangPile }) }}
        onClick={e => { if (!e.target.closest('button, a, input')) p.onMasquer() }} onPointerDown={e => actions.tirer(e, x.g.num)} title={`${r.nom} — ${p.masque ? 'masqué : cliquer pour l’afficher' : 'affiché : cliquer pour le masquer'}`}>
        <Cellules rubriques={colonnes} rendu={c => contenu[c.cle]()} nouvelles={nouvelles} />
      </li>
    )
}, memePastille)
