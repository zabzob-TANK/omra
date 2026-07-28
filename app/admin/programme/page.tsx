'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus,
  Search,
  CalendarRange,
  Pencil,
  Copy,
  Trash2,
} from 'lucide-react'
import { useOmraStore, type Season } from '@/lib/omra-store'
import { useNavGuard } from '@/components/admin/nav-guard'
import { useConfirm } from '@/components/admin/confirm-provider'
import { SeasonEditor } from '@/components/admin/programme/season-editor'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { cn } from '@/lib/utils'

function statusBadge(status: Season['status']) {
  switch (status) {
    case 'active':
      return <Badge className="bg-primary text-primary-foreground">Active</Badge>
    case 'archivee':
      return <Badge variant="secondary">Archivée</Badge>
    default:
      return (
        <Badge variant="outline" className="border-accent text-accent">
          Brouillon
        </Badge>
      )
  }
}

export default function ProgrammePage() {
  const router = useRouter()
  const store = useOmraStore()
  const confirm = useConfirm()
  const { setDirty } = useNavGuard()

  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Season | null>(null)
  const [query, setQuery] = useState('')

  const original = editingId ? store.getSeason(editingId) : undefined
  const isNew = editingId !== null && !original

  const isDirty = useMemo(() => {
    if (!draft) return false
    if (isNew) return true
    if (!original) return false
    return JSON.stringify(draft) !== JSON.stringify(original)
  }, [draft, original, isNew])

  useEffect(() => {
    setDirty(isDirty)
  }, [isDirty, setDirty])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = [...store.seasons].sort(
      (a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt),
    )
    if (!q) return list
    return list.filter(
      (s) =>
        s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q),
    )
  }, [store.seasons, query])

  function openNew() {
    const created = store.createSeason()
    setEditingId(created.id + ':new')
    setDraft({ ...created })
  }

  function openEdit(season: Season) {
    setEditingId(season.id)
    setDraft(JSON.parse(JSON.stringify(season)))
  }

  async function duplicate(season: Season) {
    const copy = store.createSeason({
      name: `${season.name} (copie)`,
      code: `${season.code}_COPIE`,
      hotels: [...season.hotels],
      flights: [...season.flights],
      rooms: [...season.rooms],
      rabatteurs: [...season.rabatteurs],
      prices: season.prices.map((p) => ({ ...p })),
      maxDiscount: season.maxDiscount,
    })
    store.saveSeason(copy)
  }

  async function remove(season: Season) {
    if (season.used) return
    const ok = await confirm({
      title: 'Supprimer la saison',
      description: `Voulez-vous vraiment supprimer « ${season.name} » ? Cette action est irréversible.`,
      confirmLabel: 'Supprimer',
      destructive: true,
    })
    if (ok) store.deleteSeason(season.id)
  }

  function closeEditor() {
    setEditingId(null)
    setDraft(null)
    setDirty(false)
  }

  // ---- Editor view ----
  if (draft) {
    return (
      <SeasonEditor
        draft={draft}
        isNew={isNew}
        isDirty={isDirty}
        canDelete={!draft.used}
        onChange={setDraft}
        onSave={() => {
          store.saveSeason(draft)
          if (isNew) {
            setEditingId(draft.id)
          }
          setDirty(false)
        }}
        onActivate={() => {
          store.saveSeason(draft)
          store.activateSeason(draft.id)
          const next = store.getSeason(draft.id)
          if (next) setDraft(JSON.parse(JSON.stringify({ ...next, status: 'active', used: true })))
          setDirty(false)
        }}
        onArchive={() => {
          store.saveSeason(draft)
          store.archiveSeason(draft.id)
          setDraft((d) => (d ? { ...d, status: 'archivee' } : d))
          setDirty(false)
        }}
        onDelete={async () => {
          const ok = await confirm({
            title: 'Supprimer la saison',
            description: `Voulez-vous vraiment supprimer « ${draft.name} » ?`,
            confirmLabel: 'Supprimer',
            destructive: true,
          })
          if (ok) {
            store.deleteSeason(draft.id)
            closeEditor()
          }
        }}
        onRevert={() => {
          if (original) setDraft(JSON.parse(JSON.stringify(original)))
        }}
        onBack={async () => {
          if (isDirty) {
            const ok = await confirm({
              title: 'Modifications non enregistrées',
              description:
                'Vous avez des modifications non enregistrées. Voulez-vous quitter sans enregistrer ?',
              confirmLabel: 'Quitter sans enregistrer',
              destructive: true,
            })
            if (!ok) return
          }
          closeEditor()
        }}
      />
    )
  }

  // ---- List view ----
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex size-11 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
            <CalendarRange className="size-6" aria-hidden />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Programme / Saison
            </h1>
            <p className="text-sm text-muted-foreground">
              Créez et gérez les saisons Omra et leurs combinaisons.
            </p>
          </div>
        </div>
        <Button onClick={openNew} className="gap-2 self-start sm:self-auto">
          <Plus className="size-4" aria-hidden />
          Nouvelle saison
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher une saison…"
          className="pl-9"
          aria-label="Rechercher une saison"
        />
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
              <CalendarRange className="size-6" aria-hidden />
            </span>
            <p className="text-sm text-muted-foreground">
              Aucune saison ne correspond à votre recherche.
            </p>
            <Button onClick={openNew} variant="outline" className="gap-2">
              <Plus className="size-4" aria-hidden />
              Créer une saison
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((season) => (
            <Card
              key={season.id}
              className={cn(
                'group flex flex-col transition-shadow hover:shadow-md',
              )}
            >
              <CardHeader className="gap-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base leading-tight text-foreground">
                    {season.name}
                  </CardTitle>
                  {statusBadge(season.status)}
                </div>
                <p className="font-mono text-xs text-muted-foreground">
                  {season.code}
                </p>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col justify-between gap-4">
                <dl className="grid grid-cols-2 gap-y-2 text-sm">
                  <dt className="text-muted-foreground">Hôtels</dt>
                  <dd className="text-right font-medium text-foreground">
                    {season.hotels.length}
                  </dd>
                  <dt className="text-muted-foreground">Combinaisons</dt>
                  <dd className="text-right font-medium text-foreground">
                    {season.prices.length}
                  </dd>
                  <dt className="text-muted-foreground">Rabatteurs</dt>
                  <dd className="text-right font-medium text-foreground">
                    {season.rabatteurs.length}
                  </dd>
                </dl>
                <div className="flex items-center gap-2 border-t border-border pt-3">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 gap-1.5"
                    onClick={() => openEdit(season)}
                  >
                    <Pencil className="size-3.5" aria-hidden />
                    Modifier
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Dupliquer la saison"
                    onClick={() => duplicate(season)}
                  >
                    <Copy className="size-4" aria-hidden />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Supprimer la saison"
                    disabled={season.used}
                    title={
                      season.used
                        ? 'Une saison utilisée ne peut pas être supprimée'
                        : 'Supprimer'
                    }
                    onClick={() => remove(season)}
                    className="text-destructive hover:text-destructive disabled:opacity-40"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
