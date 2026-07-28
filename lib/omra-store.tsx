'use client'

/**
 * Magasin de données local (prototype visuel uniquement).
 * Aucune base de données ni authentification réelle.
 * Les données sont conservées dans le localStorage pour permettre la navigation
 * entre les pages pendant la démonstration.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'

export type SeasonStatus = 'brouillon' | 'active' | 'archivee'

export type PriceRow = {
  id: string
  hotel: string
  flight: string
  room: string
  price: number
}

export type Season = {
  id: string
  name: string
  code: string
  status: SeasonStatus
  hotels: string[]
  flights: string[]
  rooms: string[]
  rabatteurs: string[]
  prices: PriceRow[]
  maxDiscount: number
  /** true dès qu'une saison a été activée : elle est alors considérée « utilisée ». */
  used: boolean
  createdAt: string
  updatedAt: string
}

const STORAGE_KEY = 'zemzem-seasons'

function uid() {
  return Math.random().toString(36).slice(2, 10)
}

function seed(): Season[] {
  const now = new Date().toISOString()
  const earlier = new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString()
  const older = new Date(Date.now() - 1000 * 60 * 60 * 24 * 120).toISOString()
  return [
    {
      id: 'omra-mars-2026',
      name: 'Omra Mars 2026',
      code: 'OMRA_MAR_26',
      status: 'active',
      used: true,
      hotels: [
        'فندق أبراج كدي',
        'فندق الصفوة البرج الأول',
        'فندق دار الإيمان جراند',
        'فندق مودة الصفوة',
        'فندق مداريم أجياد',
        'فندق كلاريون مكة',
      ],
      flights: [
        'Royal Air Maroc',
        'Saudia Airlines',
        'Flynas',
        'Air Arabia',
        'Turkish Airlines',
        'Qatar Airways',
      ],
      rooms: ['2', '3', '4', '6', '8'],
      rabatteurs: [
        'Rabta Casablanca',
        'Rabta Rabat',
        'Rabta Fès',
        'Rabta Marrakech',
        'Rabta Tanger',
        'Rabta Agadir',
      ],
      prices: [
        { id: uid(), hotel: 'فندق أبراج كدي', flight: 'Royal Air Maroc', room: '2', price: 20000 },
        { id: uid(), hotel: 'فندق الصفوة البرج الأول', flight: 'Saudia Airlines', room: '4', price: 22900 },
        { id: uid(), hotel: 'فندق دار الإيمان جراند', flight: 'Flynas', room: '6', price: 26000 },
        { id: uid(), hotel: 'فندق مودة الصفوة', flight: 'Air Arabia', room: '4', price: 21000 },
      ],
      maxDiscount: 1500,
      createdAt: earlier,
      updatedAt: now,
    },
    {
      id: 'omra-ramadan-2026',
      name: 'Omra Ramadan 2026',
      code: 'OMRA_RAM_26',
      status: 'brouillon',
      used: false,
      hotels: ['فندق أبراج كدي', 'فندق كلاريون مكة'],
      flights: ['Saudia Airlines', 'Turkish Airlines'],
      rooms: ['3', '4', '5'],
      rabatteurs: ['Rabta Casablanca', 'Rabta Rabat'],
      prices: [],
      maxDiscount: 0,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'omra-decembre-2025',
      name: 'Omra Décembre 2025',
      code: 'OMRA_DEC_25',
      status: 'archivee',
      used: true,
      hotels: ['فندق مداريم أجياد', 'فندق مودة الصفوة'],
      flights: ['Royal Air Maroc', 'Air Arabia'],
      rooms: ['2', '4'],
      rabatteurs: ['Rabta Fès', 'Rabta Agadir'],
      prices: [
        { id: uid(), hotel: 'فندق مداريم أجياد', flight: 'Royal Air Maroc', room: '2', price: 18500 },
      ],
      maxDiscount: 1000,
      createdAt: older,
      updatedAt: earlier,
    },
  ]
}

type StoreContext = {
  seasons: Season[]
  getSeason: (id: string) => Season | undefined
  createSeason: (partial?: Partial<Season>) => Season
  saveSeason: (season: Season) => void
  deleteSeason: (id: string) => void
  activateSeason: (id: string) => void
  archiveSeason: (id: string) => void
}

const Ctx = createContext<StoreContext | null>(null)

export function OmraStoreProvider({ children }: { children: ReactNode }) {
  const [seasons, setSeasons] = useState<Season[]>([])
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    let initial: Season[] = []
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      initial = raw ? (JSON.parse(raw) as Season[]) : seed()
    } catch {
      initial = seed()
    }
    setSeasons(initial)
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(seasons))
    } catch {}
  }, [seasons, hydrated])

  const getSeason = useCallback(
    (id: string) => seasons.find((s) => s.id === id),
    [seasons],
  )

  const createSeason = useCallback((partial?: Partial<Season>) => {
    const now = new Date().toISOString()
    const season: Season = {
      id: uid(),
      name: '',
      code: '',
      status: 'brouillon',
      hotels: [],
      flights: [],
      rooms: [],
      rabatteurs: [],
      prices: [],
      maxDiscount: 0,
      used: false,
      createdAt: now,
      updatedAt: now,
      ...partial,
    }
    setSeasons((prev) => [season, ...prev])
    return season
  }, [])

  const saveSeason = useCallback((season: Season) => {
    setSeasons((prev) => {
      const exists = prev.some((s) => s.id === season.id)
      const updated = { ...season, updatedAt: new Date().toISOString() }
      if (exists) return prev.map((s) => (s.id === season.id ? updated : s))
      return [updated, ...prev]
    })
  }, [])

  const deleteSeason = useCallback((id: string) => {
    setSeasons((prev) => prev.filter((s) => s.id !== id))
  }, [])

  const activateSeason = useCallback((id: string) => {
    setSeasons((prev) =>
      prev.map((s) => {
        if (s.id === id)
          return {
            ...s,
            status: 'active',
            used: true,
            updatedAt: new Date().toISOString(),
          }
        // Une seule saison active : les autres actives sont archivées.
        if (s.status === 'active')
          return { ...s, status: 'archivee', updatedAt: new Date().toISOString() }
        return s
      }),
    )
  }, [])

  const archiveSeason = useCallback((id: string) => {
    setSeasons((prev) =>
      prev.map((s) =>
        s.id === id
          ? { ...s, status: 'archivee', updatedAt: new Date().toISOString() }
          : s,
      ),
    )
  }, [])

  return (
    <Ctx.Provider
      value={{
        seasons,
        getSeason,
        createSeason,
        saveSeason,
        deleteSeason,
        activateSeason,
        archiveSeason,
      }}
    >
      {children}
    </Ctx.Provider>
  )
}

export function useOmraStore() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useOmraStore doit être utilisé dans OmraStoreProvider')
  return ctx
}
