import { afterEach, describe, expect, it } from 'vitest'
import {
  ecrireGarde,
  estPrechargement,
  finPrevue,
  limites,
  lireGarde,
  verdict,
  type Limites,
} from './session-garde'

const MINUTE = 60_000
const bornes: Limites = {
  inactiviteMs: 30 * MINUTE,
  maximumMs: 180 * MINUTE,
  finAuNavigateur: true,
}

const environnement = { ...process.env }
afterEach(() => {
  process.env = { ...environnement }
})

describe('signature du cookie de garde', () => {
  it('relit ce qu’elle a écrit', async () => {
    process.env.OMRA_SESSION_SECRET = 'secret-de-test'
    const etat = { debut: 1_700_000_000_000, vu: 1_700_000_060_000 }
    const relu = await lireGarde(await ecrireGarde(etat))
    expect(relu).toEqual(etat)
  })

  it('refuse un cookie dont la date a été modifiée', async () => {
    process.env.OMRA_SESSION_SECRET = 'secret-de-test'
    const cookie = await ecrireGarde({ debut: 1_000, vu: 1_000 })
    const [charge, signature] = cookie.split('.')
    const falsifie = Buffer.from(
      JSON.stringify({ debut: 1_000, vu: Date.now() }),
      'utf8',
    ).toString('base64url')
    // Le navigateur remplace la charge utile mais ne peut pas recalculer la signature.
    expect(await lireGarde(`${falsifie}.${signature}`)).toBeNull()
    // La même charge avec sa vraie signature reste acceptée.
    expect(await lireGarde(`${charge}.${signature}`)).not.toBeNull()
  })

  it('refuse un cookie signé avec une autre clé', async () => {
    process.env.OMRA_SESSION_SECRET = 'premiere-cle'
    const cookie = await ecrireGarde({ debut: 1_000, vu: 1_000 })
    process.env.OMRA_SESSION_SECRET = 'seconde-cle'
    expect(await lireGarde(cookie)).toBeNull()
  })

  it('refuse un cookie absent ou mal formé', async () => {
    process.env.OMRA_SESSION_SECRET = 'secret-de-test'
    expect(await lireGarde(undefined)).toBeNull()
    expect(await lireGarde('')).toBeNull()
    expect(await lireGarde('sans-point')).toBeNull()
    expect(await lireGarde('.signature-seule')).toBeNull()
  })
})

describe('décision de fin de session', () => {
  const t = 2_000_000_000_000

  it('laisse passer une session active et récente', () => {
    expect(verdict({ debut: t - 10 * MINUTE, vu: t - MINUTE }, bornes, t)).toBe('valide')
  })

  it('coupe après la durée d’inactivité', () => {
    expect(verdict({ debut: t - 40 * MINUTE, vu: t - 30 * MINUTE }, bornes, t)).toBe('inactivite')
    expect(verdict({ debut: t - 40 * MINUTE, vu: t - 29 * MINUTE }, bornes, t)).toBe('valide')
  })

  it('coupe à la durée maximale même si l’utilisateur travaille', () => {
    expect(verdict({ debut: t - 180 * MINUTE, vu: t }, bornes, t)).toBe('maximum')
    expect(verdict({ debut: t - 179 * MINUTE, vu: t }, bornes, t)).toBe('valide')
  })

  it('la durée maximale l’emporte sur l’activité récente', () => {
    // Quelqu'un qui clique sans arrêt ne doit pas rester connecté indéfiniment.
    expect(verdict({ debut: t - 300 * MINUTE, vu: t - 1_000 }, bornes, t)).toBe('maximum')
  })

  it('refuse un cookie venu du futur', () => {
    expect(verdict({ debut: t + 10 * MINUTE, vu: t + 10 * MINUTE }, bornes, t)).toBe('illisible')
  })

  it('annonce la fin la plus proche des deux limites', () => {
    // Inactivité proche : c'est elle qui décide.
    expect(finPrevue({ debut: t, vu: t }, bornes)).toBe(t + 30 * MINUTE)
    // Plafond absolu proche : c'est lui qui décide.
    expect(finPrevue({ debut: t - 170 * MINUTE, vu: t }, bornes)).toBe(t + 10 * MINUTE)
  })
})

describe('durées selon l’environnement', () => {
  it('protège par défaut en production', () => {
    process.env.NODE_ENV = 'production'
    delete process.env.OMRA_SESSION_INACTIVITE_MINUTES
    delete process.env.OMRA_SESSION_MAXIMUM_MINUTES
    delete process.env.OMRA_SESSION_FIN_AU_NAVIGATEUR
    const b = limites()
    expect(b.inactiviteMs).toBe(30 * MINUTE)
    expect(b.maximumMs).toBe(180 * MINUTE)
    expect(b.finAuNavigateur).toBe(true)
  })

  it('reste large hors production, pour ne pas gêner le développement', () => {
    process.env.NODE_ENV = 'development'
    delete process.env.OMRA_SESSION_INACTIVITE_MINUTES
    delete process.env.OMRA_SESSION_MAXIMUM_MINUTES
    delete process.env.OMRA_SESSION_FIN_AU_NAVIGATEUR
    const b = limites()
    expect(b.inactiviteMs).toBe(720 * MINUTE)
    expect(b.finAuNavigateur).toBe(false)
  })

  it('obéit aux variables d’environnement du déploiement', () => {
    process.env.NODE_ENV = 'production'
    process.env.OMRA_SESSION_INACTIVITE_MINUTES = '720'
    process.env.OMRA_SESSION_MAXIMUM_MINUTES = '720'
    process.env.OMRA_SESSION_FIN_AU_NAVIGATEUR = '0'
    const b = limites()
    expect(b.inactiviteMs).toBe(720 * MINUTE)
    expect(b.maximumMs).toBe(720 * MINUTE)
    expect(b.finAuNavigateur).toBe(false)
  })

  it('ignore une valeur absurde plutôt que de désactiver la garde', () => {
    process.env.NODE_ENV = 'production'
    process.env.OMRA_SESSION_INACTIVITE_MINUTES = '0'
    expect(limites().inactiviteMs).toBe(30 * MINUTE)
    process.env.OMRA_SESSION_INACTIVITE_MINUTES = 'beaucoup'
    expect(limites().inactiviteMs).toBe(30 * MINUTE)
  })
})

describe('pré-chargement', () => {
  it('reconnaît les requêtes que Next.js déclenche seul', () => {
    expect(estPrechargement(new Headers({ 'next-router-prefetch': '1' }))).toBe(true)
    expect(estPrechargement(new Headers({ purpose: 'prefetch' }))).toBe(true)
    expect(estPrechargement(new Headers())).toBe(false)
  })
})
