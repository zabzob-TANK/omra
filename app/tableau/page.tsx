'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { getRegistrations } from '@/lib/supabase'
import type { RegistrationRecord } from '@/lib/supabase'

export default function Tableau() {
  const [records, setRecords] = useState<RegistrationRecord[]>([])
  const [isLoaded, setIsLoaded] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    getRegistrations()
      .then(setRecords)
      .catch(() => setErrorMessage('Une erreur est survenue.'))
      .finally(() => setIsLoaded(true))
  }, [])

  if (!isLoaded) return null

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-8 text-3xl font-bold">Tableau des enregistrements</h1>
        {errorMessage && <p className="mb-8 text-sm">{errorMessage}</p>}

        {records.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-8 text-center">
            <p className="text-muted-foreground">Aucun enregistrement disponible</p>
          </div>
        ) : (
          <div className="mb-8 overflow-x-auto rounded-lg border border-border">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted">
                  <th className="px-4 py-3 text-left font-semibold">N°</th>
                  <th className="px-4 py-3 text-left font-semibold">Nom</th>
                  <th className="px-4 py-3 text-left font-semibold">Prénom</th>
                  <th className="px-4 py-3 text-left font-semibold">Hôtel</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.id} className="border-b border-border hover:bg-muted/50">
                    <td className="px-4 py-3 font-medium">{record.id}</td>
                    <td dir="rtl" className="px-4 py-3 text-right">
                      {record.nom}
                    </td>
                    <td dir="rtl" className="px-4 py-3 text-right">
                      {record.prenom}
                    </td>
                    <td className="px-4 py-3">{record.hotel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Link href="/">
          <Button variant="outline" className="w-full">
            Nouvel enregistrement
          </Button>
        </Link>
      </div>
    </div>
  )
}
