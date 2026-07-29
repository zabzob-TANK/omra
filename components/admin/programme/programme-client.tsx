'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { CalendarRange, Copy, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import {
  activateSeasonAction,
  archiveSeasonAction,
  deleteSeasonAction,
  loadSeasonsAction,
  saveSeasonAction,
} from '@/app/admin/programme/actions'
import { useConfirm } from '@/components/admin/confirm-provider'
import { useNavGuard } from '@/components/admin/nav-guard'
import { SeasonEditor } from '@/components/admin/programme/season-editor'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  emptySeason,
  temporaryId,
  type Season,
} from '@/lib/omra-programme'
import { cn } from '@/lib/utils'

function statusBadge(status: Season['status']) {
  if (status === 'active') {
    return <Badge className="bg-primary text-primary-foreground">Active</Badge>
  }
  if (status === 'archivee') return <Badge variant="secondary">Archivée</Badge>
  return (
    <Badge variant="outline" className="border-accent text-accent">
      Brouillon
    </Badge>
  )
}

function cloneSeason(season: Season): Season {
  const hotelIds = new Map(season.hotels.map((item) => [item.id, temporaryId()]))
  const flightIds = new Map(season.flights.map((item) => [item.id, temporaryId()]))
  const roomIds = new Map(season.rooms.map((item) => [item.id, temporaryId()]))

  return {
    ...season,
    id: temporaryId(),
    programId: temporaryId(),
    name: `${season.name} (copie)`,
    code: season.code ? `${season.code}_COPIE` : '',
    status: 'brouillon',
    used: false,
    hotels: season.hotels.map((item) => ({ ...item, id: hotelIds.get(item.id)! })),
    flights: season.flights.map((item) => ({ ...item, id: flightIds.get(item.id)! })),
    rooms: season.rooms.map((item) => ({ ...item, id: roomIds.get(item.id)! })),
    rabatteurs: season.rabatteurs.map((item) => ({ ...item, id: temporaryId() })),
    prices: season.prices.map((price) => ({
      ...price,
      id: temporaryId(),
      hotelId: hotelIds.get(price.hotelId)!,
      flightId: flightIds.get(price.flightId)!,
      roomId: roomIds.get(price.roomId)!,
    })),
  }
}

export function ProgrammeClient({
  initialSeasons,
  initialError,
}: {
  initialSeasons: Season[]
  initialError: string | null
}) {
  const confirm = useConfirm()
  const { setDirty } = useNavGuard()
  const [seasons, setSeasons] = useState(initialSeasons)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Season | null>(null)
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(initialError)
  const [notice, setNotice] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const original = editingId
    ? seasons.find((season) => season.id === editingId)
    : undefined
  const isNew = Boolean(draft && draft.id.startsWith('temp-'))
  const isDirty = useMemo(() => {
    if (!draft) return false
    if (isNew) return true
    return original ? JSON.stringify(draft) !== JSON.stringify(original) : false
  }, [draft, isNew, original])

  useEffect(() => setDirty(isDirty), [isDirty, setDirty])

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    const sorted = [...seasons].sort(
      (left, right) => +new Date(right.updatedAt) - +new Date(left.updatedAt),
    )
    if (!normalizedQuery) return sorted
    return sorted.filter(
      (season) =>
        season.name.toLowerCase().includes(normalizedQuery) ||
        season.code.toLowerCase().includes(normalizedQuery),
    )
  }, [query, seasons])

  async function reload(preferredId?: string) {
    const result = await loadSeasonsAction()
    if (!result.ok) {
      setError(result.message)
      return null
    }
    setSeasons(result.data)
    if (preferredId) {
      const next = result.data.find((season) => season.id === preferredId) ?? null
      setEditingId(next?.id ?? null)
      setDraft(next ? structuredClone(next) : null)
      return next
    }
    return null
  }

  function run(operation: () => Promise<void>) {
    setError(null)
    setNotice(null)
    startTransition(async () => {
      await operation()
    })
  }

  async function saveDraft() {
    if (!draft) return
    const result = await saveSeasonAction(draft)
    if (!result.ok) {
      setError(result.message)
      return
    }
    setSeasons((current) => [
      result.data,
      ...current.filter((season) => season.id !== result.data.id && season.id !== draft.id),
    ])
    setEditingId(result.data.id)
    setDraft(structuredClone(result.data))
    setDirty(false)
    setNotice('Saison enregistrée.')
  }

  async function activateDraft() {
    if (!draft) return
    const saved = await saveSeasonAction(draft)
    if (!saved.ok) {
      setError(saved.message)
      return
    }
    const activated = await activateSeasonAction(saved.data.id)
    if (!activated.ok) {
      setError(activated.message)
      return
    }
    await reload(saved.data.id)
    setDirty(false)
    setNotice('Saison activée.')
  }

  async function archiveDraft() {
    if (!draft) return
    const saved = await saveSeasonAction(draft)
    if (!saved.ok) {
      setError(saved.message)
      return
    }
    const archived = await archiveSeasonAction(saved.data.id)
    if (!archived.ok) {
      setError(archived.message)
      return
    }
    await reload(saved.data.id)
    setDirty(false)
    setNotice('Saison archivée.')
  }

  async function removeSeason(season: Season) {
    if (season.used || season.status !== 'brouillon') return
    const accepted = await confirm({
      title: 'Supprimer la saison',
      description: `Voulez-vous vraiment supprimer « ${season.name} » ? Cette action est irréversible.`,
      confirmLabel: 'Supprimer',
      variant: 'destructive',
    })
    if (!accepted) return
    run(async () => {
      const result = await deleteSeasonAction(season.id)
      if (!result.ok) {
        setError(result.message)
        return
      }
      setSeasons((current) => current.filter((item) => item.id !== season.id))
      if (editingId === season.id) closeEditor()
      setNotice('Saison supprimée.')
    })
  }

  function closeEditor() {
    setEditingId(null)
    setDraft(null)
    setDirty(false)
    setError(null)
  }

  if (draft) {
    return (
      <div className="space-y-4">
        {error ? <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
        {notice ? <p role="status" className="rounded-lg bg-primary/10 p-3 text-sm text-primary">{notice}</p> : null}
        <SeasonEditor
          draft={draft}
          isNew={isNew}
          isDirty={isDirty}
          canDelete={!draft.used && draft.status === 'brouillon'}
          pending={pending}
          onChange={setDraft}
          onSave={() => run(saveDraft)}
          onActivate={() => run(activateDraft)}
          onArchive={() => run(archiveDraft)}
          onDelete={() => removeSeason(draft)}
          onRevert={() => original && setDraft(structuredClone(original))}
          onBack={async () => {
            if (isDirty) {
              const accepted = await confirm({
                title: 'Modifications non enregistrées',
                description: 'Voulez-vous quitter sans enregistrer ?',
                confirmLabel: 'Quitter sans enregistrer',
                variant: 'destructive',
              })
              if (!accepted) return
            }
            closeEditor()
          }}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6" aria-busy={pending}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex size-11 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
            <CalendarRange className="size-6" aria-hidden />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Programme / Saison</h1>
            <p className="text-sm text-muted-foreground">Créez et gérez les saisons Omra et leurs combinaisons.</p>
          </div>
        </div>
        <Button onClick={() => { const season = emptySeason(); setEditingId(season.id); setDraft(season) }} disabled={pending} className="gap-2 self-start sm:self-auto">
          <Plus className="size-4" aria-hidden /> Nouvelle saison
        </Button>
      </div>

      {pending ? <p role="status" className="text-sm text-muted-foreground">Chargement…</p> : null}
      {error ? <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
      {notice ? <p role="status" className="rounded-lg bg-primary/10 p-3 text-sm text-primary">{notice}</p> : null}

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher une saison…" className="pl-9" aria-label="Rechercher une saison" />
      </div>

      {filtered.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-3 py-14 text-center"><CalendarRange className="size-6" aria-hidden /><p className="text-sm text-muted-foreground">Aucune saison enregistrée.</p><Button variant="outline" onClick={() => { const season = emptySeason(); setEditingId(season.id); setDraft(season) }}><Plus />Créer une saison</Button></CardContent></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((season) => (
            <Card key={season.id} className={cn('group flex flex-col transition-shadow hover:shadow-md')}>
              <CardHeader className="gap-2"><div className="flex items-start justify-between gap-2"><CardTitle className="text-base leading-tight">{season.name}</CardTitle>{statusBadge(season.status)}</div><p className="font-mono text-xs text-muted-foreground">{season.code}</p></CardHeader>
              <CardContent className="flex flex-1 flex-col justify-between gap-4">
                <dl className="grid grid-cols-2 gap-y-2 text-sm"><dt className="text-muted-foreground">Hôtels</dt><dd className="text-right font-medium">{season.hotels.length}</dd><dt className="text-muted-foreground">Combinaisons</dt><dd className="text-right font-medium">{season.prices.length}</dd><dt className="text-muted-foreground">Rabatteurs</dt><dd className="text-right font-medium">{season.rabatteurs.length}</dd></dl>
                <div className="flex items-center gap-2 border-t pt-3">
                  <Button size="sm" variant="outline" className="flex-1 gap-1.5" onClick={() => { setEditingId(season.id); setDraft(structuredClone(season)); setError(null) }}><Pencil className="size-3.5" />Modifier</Button>
                  <Button size="icon" variant="ghost" aria-label="Dupliquer la saison" disabled={pending} onClick={() => run(async () => { const result = await saveSeasonAction(cloneSeason(season)); if (!result.ok) setError(result.message); else { setSeasons((current) => [result.data, ...current]); setNotice('Saison dupliquée.') } })}><Copy className="size-4" /></Button>
                  <Button size="icon" variant="ghost" aria-label="Supprimer la saison" disabled={pending || season.used || season.status !== 'brouillon'} onClick={() => removeSeason(season)} className="text-destructive hover:text-destructive disabled:opacity-40"><Trash2 className="size-4" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
