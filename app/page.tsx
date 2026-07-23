'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { RegistrationRecord, getRegistrations, saveRegistration } from '@/lib/storage'

export default function Enregistrement() {
  const [nom, setNom] = useState('')
  const [prenom, setPrenom] = useState('')
  const [hotel, setHotel] = useState('')
  const [records, setRecords] = useState<RegistrationRecord[]>([])
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    setRecords(getRegistrations())
    setIsLoaded(true)
  }, [])

  const hotels = [
    'منار الشروق',
    'منار الشروق (S)',
    'رايا مبارك',
    'رايا مبارك (S)',
    'واحة احياد',
  ]

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!nom.trim() || !prenom.trim() || !hotel) {
      return
    }
    saveRegistration(nom, prenom, hotel)
    setNom('')
    setPrenom('')
    setHotel('')
    setRecords(getRegistrations())
  }

  if (!isLoaded) return null

  const recentRecords = records.slice(-5).reverse()

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-8 text-3xl font-bold">Enregistrement des personnes</h1>

        <form onSubmit={handleSubmit} className="mb-8 space-y-4 rounded-lg border border-border bg-card p-6">
          <div>
            <label className="block text-sm font-medium mb-2">Nom</label>
            <input
              type="text"
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              dir="rtl"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-right placeholder:text-muted-foreground"
              placeholder="الاسم"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Prénom</label>
            <input
              type="text"
              value={prenom}
              onChange={(e) => setPrenom(e.target.value)}
              dir="rtl"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-right placeholder:text-muted-foreground"
              placeholder="الاسم الأول"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Hôtel</label>
            <select
              value={hotel}
              onChange={(e) => setHotel(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2"
            >
              <option value="">Choisir un hôtel</option>
              {hotels.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>

          <Button type="submit" className="w-full">
            Enregistrer
          </Button>
        </form>

        <div className="mb-8">
          <h2 className="mb-4 text-xl font-semibold">Enregistrements récents</h2>
          {recentRecords.length === 0 ? (
            <p className="text-muted-foreground">Aucun enregistrement disponible</p>
          ) : (
            <div className="space-y-2 rounded-lg border border-border">
              {recentRecords.map((record) => (
                <div key={record.id} className="flex items-center gap-4 border-b border-border px-4 py-3 last:border-b-0">
                  <div className="w-8 font-semibold text-muted-foreground">N° {record.id}</div>
                  <div className="flex-1">
                    <div dir="rtl" className="text-right">
                      {record.nom}
                    </div>
                  </div>
                  <div className="flex-1">
                    <div dir="rtl" className="text-right">
                      {record.prenom}
                    </div>
                  </div>
                  <div className="flex-1 text-right">{record.hotel}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <Link href="/tableau">
          <Button variant="outline" className="w-full">
            Voir le tableau
          </Button>
        </Link>
      </div>
    </div>
  )
}
