// Photos des passeports : téléchargées une seule fois par page, décodées avant affichage,
// quatre à la fois (repris de l'atelier de Codex). Rien n'est gardé après la fermeture de la page.
const cache = new Map()

function chargerPhoto(url) {
  if (cache.has(url)) return cache.get(url)
  const promesse = (async () => {
    const reponse = await fetch(url)
    if (!reponse.ok) throw new Error('Photo indisponible')
    const blob = await reponse.blob()
    if (!blob.type.startsWith('image/')) throw new Error('Photo invalide')
    const source = await new Promise((resoudre, rejeter) => {
      const lecteur = new FileReader()
      lecteur.onload = () => resoudre(lecteur.result)
      lecteur.onerror = () => rejeter(new Error('Lecture de la photo impossible'))
      lecteur.readAsDataURL(blob)
    })
    const image = new Image()
    image.src = source
    await image.decode()
    return source
  })()
  cache.set(url, promesse)
  promesse.catch(() => { if (cache.get(url) === promesse) cache.delete(url) })
  return promesse
}

// Publie chaque lot de quatre dès qu'il est prêt ; s'arrête si la page n'en veut plus.
export async function chargerPhotos(pelerins, publier, actif) {
  for (let debut = 0; debut < pelerins.length && actif(); debut += 4) {
    const lot = await Promise.all(pelerins.slice(debut, debut + 4).map(async p => {
      // La vignette légère d'abord (lien signé direct) ; le portrait complet seulement en secours.
      try { return [String(p.dossier), await chargerPhoto(String(p.vignetteUrl || p.portraitUrl))] }
      catch {
        try { return [String(p.dossier), p.vignetteUrl ? await chargerPhoto(String(p.portraitUrl)) : null] }
        catch { return [String(p.dossier), null] }
      }
    }))
    if (actif()) publier(lot)
  }
}
