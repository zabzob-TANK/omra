import { NextResponse } from 'next/server'
import { mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

// TEMPORAIRE, développement seulement (2026-10-15) : reçoit le relevé d'un geste enregistré dans le Poste de tri
// (bouton « Enregistrer mon geste ») et l'écrit dans le dossier temporaire de ce PC, pour l'analyser image par
// image. Rien n'est envoyé ailleurs ; en production, la route n'existe pas (404).
export const runtime = 'nodejs'

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== 'development') return new NextResponse(null, { status: 404 })
  const texte = await request.text()
  if (texte.length > 8_000_000) return NextResponse.json({ ok: false, erreur: 'Relevé trop gros' }, { status: 413 })
  try { JSON.parse(texte) } catch { return NextResponse.json({ ok: false, erreur: 'Relevé illisible' }, { status: 400 }) }
  const dossier = path.join(tmpdir(), 'poste-de-tri-gestes')
  await mkdir(dossier, { recursive: true })
  const nom = `geste-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  await writeFile(path.join(dossier, nom), texte, 'utf8')
  return NextResponse.json({ ok: true, fichier: nom })
}
