'use client'

import { useState } from 'react'
import {
  Plus,
  Pencil,
  Trash2,
  Save,
  CheckCircle2,
  Archive,
  ArrowLeft,
  Undo2,
  Info,
  CalendarRange,
} from 'lucide-react'
import type { PriceRow, Season } from '@/lib/omra-store'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ListManager } from '@/components/admin/programme/list-manager'
import { useConfirm } from '@/components/admin/confirm-provider'

function uid() {
  return Math.random().toString(36).slice(2, 10)
}

function statusBadge(status: Season['status']) {
  switch (status) {
    case 'active':
      return (
        <Badge className="bg-primary text-primary-foreground">Active</Badge>
      )
    case 'archivee':
      return <Badge variant="secondary">Archivée</Badge>
    default:
      return (
        <Badge variant="outline" className="text-accent">
          Brouillon
        </Badge>
      )
  }
}

const currency = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

type Props = {
  draft: Season
  isNew: boolean
  isDirty: boolean
  canDelete: boolean
  onChange: (next: Season) => void
  onSave: () => void
  onActivate: () => void
  onArchive: () => void
  onDelete: () => void
  onRevert: () => void
  onBack: () => void
}

export function SeasonEditor({
  draft,
  isNew,
  isDirty,
  canDelete,
  onChange,
  onSave,
  onActivate,
  onArchive,
  onDelete,
  onRevert,
  onBack,
}: Props) {
  const confirm = useConfirm()

  // Constructeur de combinaison
  const [selHotel, setSelHotel] = useState<string | null>(null)
  const [selFlight, setSelFlight] = useState<string | null>(null)
  const [selRoom, setSelRoom] = useState<string | null>(null)
  const [priceInput, setPriceInput] = useState('')
  const [comboError, setComboError] = useState<string | null>(null)

  // Édition d'une ligne de prix
  const [editRow, setEditRow] = useState<PriceRow | null>(null)

  function update(patch: Partial<Season>) {
    onChange({ ...draft, ...patch })
  }

  function addToTable() {
    if (!selHotel || !selFlight || !selRoom) {
      setComboError('Veuillez sélectionner un hôtel, un vol et une chambre.')
      return
    }
    const price = Number(priceInput)
    if (!priceInput || Number.isNaN(price) || price <= 0) {
      setComboError('Le prix est requis et doit être supérieur à zéro.')
      return
    }
    const duplicate = draft.prices.some(
      (p) => p.hotel === selHotel && p.flight === selFlight && p.room === selRoom,
    )
    if (duplicate) {
      setComboError(
        'Cette combinaison Hôtel + Vol + Chambre existe déjà dans le tableau.',
      )
      return
    }
    update({
      prices: [
        ...draft.prices,
        { id: uid(), hotel: selHotel, flight: selFlight, room: selRoom, price },
      ],
    })
    setSelHotel(null)
    setSelFlight(null)
    setSelRoom(null)
    setPriceInput('')
    setComboError(null)
  }

  async function deleteRow(row: PriceRow) {
    const ok = await confirm({
      title: 'Supprimer cette combinaison',
      description: 'Voulez-vous vraiment supprimer cette ligne de prix ?',
      confirmLabel: 'Supprimer',
      variant: 'destructive',
    })
    if (ok) update({ prices: draft.prices.filter((p) => p.id !== row.id) })
  }

  function saveEditRow(next: PriceRow) {
    const duplicate = draft.prices.some(
      (p) =>
        p.id !== next.id &&
        p.hotel === next.hotel &&
        p.flight === next.flight &&
        p.room === next.room,
    )
    if (duplicate) return 'Cette combinaison existe déjà.'
    update({ prices: draft.prices.map((p) => (p.id === next.id ? next : p)) })
    setEditRow(null)
    return null
  }

  async function handleActivate() {
    const ok = await confirm({
      title: 'Activer cette saison',
      description:
        'Activer cette saison désactivera (archivera) la saison actuellement active. Une seule saison peut être active à la fois.',
      confirmLabel: 'Activer',
    })
    if (ok) onActivate()
  }

  async function handleArchive() {
    const ok = await confirm({
      title: 'Archiver cette saison',
      description:
        'La saison sera archivée. Elle restera consultable mais ne sera plus active.',
      confirmLabel: 'Archiver',
    })
    if (ok) onArchive()
  }

  async function handleDelete() {
    const ok = await confirm({
      title: 'Supprimer la saison',
      description:
        'Cette saison est vide et n’a jamais été utilisée. Voulez-vous la supprimer définitivement ?',
      confirmLabel: 'Supprimer',
      variant: 'destructive',
    })
    if (ok) onDelete()
  }

  async function handleRevert() {
    const ok = await confirm({
      title: 'Annuler les modifications',
      description:
        'Toutes les modifications non enregistrées seront perdues. Continuer ?',
      confirmLabel: 'Annuler les modifications',
      variant: 'destructive',
    })
    if (ok) onRevert()
  }

  return (
    <div className="flex flex-col gap-6">
      {/* En-tête */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="inline-flex size-11 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
            <CalendarRange className="size-5" />
          </span>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Programme / Saison
              </h1>
              {statusBadge(draft.status)}
              {isDirty && (
                <Badge variant="outline" className="text-accent">
                  Non enregistré
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              Créez et gérez les saisons Omra et leurs combinaisons de prix.
            </p>
          </div>
        </div>

        <Button variant="outline" onClick={onBack}>
          <ArrowLeft />
          <span>Retour aux saisons</span>
        </Button>
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-border bg-secondary/40 p-3 text-sm text-secondary-foreground">
        <Info className="mt-0.5 size-4 shrink-0 text-primary" />
        <p>
          Les modifications apportées à une saison ne modifient pas les reçus
          déjà émis. Elles s’appliquent uniquement aux nouveaux dossiers.
        </p>
      </div>

      {/* 4.1 Informations */}
      <section className="rounded-xl border border-border bg-card p-5 ring-1 ring-foreground/5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="season-name">Nom de la saison</Label>
            <Input
              id="season-name"
              value={draft.name}
              onChange={(e) => update({ name: e.target.value })}
              placeholder="Ex. : Omra Mars 2026"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="season-code">Code / Référence (optionnel)</Label>
            <Input
              id="season-code"
              value={draft.code}
              onChange={(e) => update({ code: e.target.value })}
              placeholder="Ex. : OMRA_MAR_26"
            />
          </div>
        </div>
      </section>

      {/* 4.2 – 4.5 Listes */}
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <ListManager
          title="Liste des hôtels"
          items={draft.hotels}
          placeholder="أضف فندقًا"
          rtl
          onAdd={(v) => update({ hotels: [...draft.hotels, v] })}
          onEdit={(i, v) =>
            update({ hotels: draft.hotels.map((h, idx) => (idx === i ? v : h)) })
          }
          onDelete={(i) =>
            update({ hotels: draft.hotels.filter((_, idx) => idx !== i) })
          }
          validate={(value, currentIndex) =>
            draft.hotels.some((h, idx) => h === value && idx !== currentIndex)
              ? 'Cet hôtel existe déjà.'
              : null
          }
          getDeleteWarning={(value) => {
            const count = draft.prices.filter((p) => p.hotel === value).length
            return count > 0
              ? `Cet hôtel est utilisé dans ${count} combinaison(s) de prix. Ces combinaisons sont concernées.`
              : null
          }}
        />

        <ListManager
          title="Vols / Compagnies"
          items={draft.flights}
          placeholder="Ajouter un vol / compagnie"
          onAdd={(v) => update({ flights: [...draft.flights, v] })}
          onEdit={(i, v) =>
            update({
              flights: draft.flights.map((f, idx) => (idx === i ? v : f)),
            })
          }
          onDelete={(i) =>
            update({ flights: draft.flights.filter((_, idx) => idx !== i) })
          }
          validate={(value, currentIndex) =>
            draft.flights.some((f, idx) => f === value && idx !== currentIndex)
              ? 'Ce vol / compagnie existe déjà.'
              : null
          }
          getDeleteWarning={(value) => {
            const count = draft.prices.filter((p) => p.flight === value).length
            return count > 0
              ? `Ce vol est utilisé dans ${count} combinaison(s) de prix.`
              : null
          }}
        />

        <ListManager
          title="Chambres"
          items={draft.rooms}
          placeholder="Nombre de lits (ex. : 4)"
          numeric
          onAdd={(v) => update({ rooms: [...draft.rooms, v] })}
          onEdit={(i, v) =>
            update({ rooms: draft.rooms.map((r, idx) => (idx === i ? v : r)) })
          }
          onDelete={(i) =>
            update({ rooms: draft.rooms.filter((_, idx) => idx !== i) })
          }
          validate={(value, currentIndex) => {
            if (!/^\d+$/.test(value) || Number(value) <= 0)
              return 'Veuillez saisir un nombre entier positif.'
            if (draft.rooms.some((r, idx) => r === value && idx !== currentIndex))
              return 'Ce nombre existe déjà.'
            return null
          }}
          getDeleteWarning={(value) => {
            const count = draft.prices.filter((p) => p.room === value).length
            return count > 0
              ? `Cette chambre est utilisée dans ${count} combinaison(s) de prix.`
              : null
          }}
        />

        <ListManager
          title="Rabatteurs"
          items={draft.rabatteurs}
          placeholder="Ajouter un rabatteur"
          onAdd={(v) => update({ rabatteurs: [...draft.rabatteurs, v] })}
          onEdit={(i, v) =>
            update({
              rabatteurs: draft.rabatteurs.map((r, idx) => (idx === i ? v : r)),
            })
          }
          onDelete={(i) =>
            update({
              rabatteurs: draft.rabatteurs.filter((_, idx) => idx !== i),
            })
          }
          validate={(value, currentIndex) =>
            draft.rabatteurs.some(
              (r, idx) => r === value && idx !== currentIndex,
            )
              ? 'Ce rabatteur existe déjà.'
              : null
          }
        />
      </div>

      {/* 4.6 Constructeur de combinaison */}
      <section className="rounded-xl border border-border bg-card p-5 ring-1 ring-foreground/5">
        <h2 className="mb-4 text-sm font-semibold text-foreground">
          Construire une combinaison de prix
        </h2>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
          <div className="flex flex-1 flex-col gap-2">
            <Label>Hôtel</Label>
            <Select value={selHotel} onValueChange={(v) => setSelHotel(v as string)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Sélectionner un hôtel" />
              </SelectTrigger>
              <SelectContent>
                {draft.hotels.map((h) => (
                  <SelectItem key={h} value={h}>
                    <span dir="rtl">{h}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <span className="hidden pb-2 text-lg font-medium text-accent lg:block">
            +
          </span>

          <div className="flex flex-1 flex-col gap-2">
            <Label>Vol / Compagnie</Label>
            <Select
              value={selFlight}
              onValueChange={(v) => setSelFlight(v as string)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Sélectionner un vol / compagnie" />
              </SelectTrigger>
              <SelectContent>
                {draft.flights.map((f) => (
                  <SelectItem key={f} value={f}>
                    {f}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <span className="hidden pb-2 text-lg font-medium text-accent lg:block">
            +
          </span>

          <div className="flex flex-1 flex-col gap-2">
            <Label>Chambre</Label>
            <Select value={selRoom} onValueChange={(v) => setSelRoom(v as string)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Sélectionner une chambre" />
              </SelectTrigger>
              <SelectContent>
                {draft.rooms.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <span className="hidden pb-2 text-lg font-medium text-accent lg:block">
            =
          </span>

          <div className="flex flex-col gap-2">
            <Label htmlFor="combo-price">Prix (DH)</Label>
            <div className="relative">
              <Input
                id="combo-price"
                type="number"
                min={0}
                value={priceInput}
                onChange={(e) => {
                  setPriceInput(e.target.value)
                  setComboError(null)
                }}
                placeholder="0.00"
                className="w-40 pr-10"
              />
              <span className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-xs text-muted-foreground">
                DH
              </span>
            </div>
          </div>

          <Button onClick={addToTable} className="lg:mb-0">
            <Plus />
            <span>Ajouter au tableau</span>
          </Button>
        </div>
        {comboError && (
          <p className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {comboError}
          </p>
        )}
      </section>

      {/* 4.7 Tableau des prix */}
      <section className="overflow-hidden rounded-xl border border-border bg-card ring-1 ring-foreground/5">
        <div className="border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold text-foreground">
            Tableau des prix
          </h2>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">Hôtel</TableHead>
              <TableHead>Vol / Compagnie</TableHead>
              <TableHead>Chambre</TableHead>
              <TableHead>Prix (DH)</TableHead>
              <TableHead className="w-28 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {draft.prices.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  Aucune combinaison de prix pour l’instant.
                </TableCell>
              </TableRow>
            ) : (
              draft.prices.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="text-right font-medium" dir="rtl">
                    {row.hotel}
                  </TableCell>
                  <TableCell>{row.flight}</TableCell>
                  <TableCell>{row.room}</TableCell>
                  <TableCell>{currency.format(row.price)} DH</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-0.5">
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => setEditRow(row)}
                        aria-label="Modifier la ligne"
                      >
                        <Pencil />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => deleteRow(row)}
                        aria-label="Supprimer la ligne"
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </section>

      {/* 4.8 Réduction maximale */}
      <section className="rounded-xl border border-border bg-card p-5 ring-1 ring-foreground/5">
        <div className="flex flex-col gap-2 sm:max-w-xs">
          <Label htmlFor="max-discount">Réduction maximale autorisée (DH)</Label>
          <div className="relative">
            <Input
              id="max-discount"
              type="number"
              min={0}
              value={String(draft.maxDiscount)}
              onChange={(e) =>
                update({ maxDiscount: Math.max(0, Number(e.target.value) || 0) })
              }
              className="pr-10"
            />
            <span className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-xs text-muted-foreground">
              DH
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Utilisée ultérieurement par le module de facturation.
          </p>
        </div>
      </section>

      {/* 4.9 Actions */}
      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-background/95 px-4 py-4 backdrop-blur md:-mx-6 md:px-6">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft />
          <span>Retour</span>
        </Button>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="ghost"
            onClick={handleRevert}
            disabled={!isDirty}
          >
            <Undo2 />
            <span>Annuler les modifications</span>
          </Button>
          {draft.status !== 'archivee' && (
            <Button variant="outline" onClick={handleArchive} disabled={isNew}>
              <Archive />
              <span>Archiver la saison</span>
            </Button>
          )}
          {canDelete && (
            <Button variant="destructive" onClick={handleDelete}>
              <Trash2 />
              <span>Supprimer</span>
            </Button>
          )}
          {draft.status !== 'active' && (
            <Button
              variant="secondary"
              onClick={handleActivate}
              disabled={isNew}
              className="bg-accent text-accent-foreground hover:bg-accent/90"
            >
              <CheckCircle2 />
              <span>Activer la saison</span>
            </Button>
          )}
          <Button onClick={onSave} disabled={!isDirty}>
            <Save />
            <span>Enregistrer</span>
          </Button>
        </div>
      </div>

      {editRow && (
        <EditPriceDialog
          row={editRow}
          hotels={draft.hotels}
          flights={draft.flights}
          rooms={draft.rooms}
          onClose={() => setEditRow(null)}
          onSave={saveEditRow}
        />
      )}
    </div>
  )
}

function EditPriceDialog({
  row,
  hotels,
  flights,
  rooms,
  onClose,
  onSave,
}: {
  row: PriceRow
  hotels: string[]
  flights: string[]
  rooms: string[]
  onClose: () => void
  onSave: (next: PriceRow) => string | null
}) {
  const [hotel, setHotel] = useState(row.hotel)
  const [flight, setFlight] = useState(row.flight)
  const [roomVal, setRoomVal] = useState(row.room)
  const [price, setPrice] = useState(String(row.price))
  const [error, setError] = useState<string | null>(null)

  function submit() {
    const numeric = Number(price)
    if (!hotel || !flight || !roomVal) {
      setError('Tous les champs sont requis.')
      return
    }
    if (!price || Number.isNaN(numeric) || numeric <= 0) {
      setError('Le prix doit être supérieur à zéro.')
      return
    }
    const err = onSave({ ...row, hotel, flight, room: roomVal, price: numeric })
    if (err) setError(err)
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Modifier la combinaison</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label>Hôtel</Label>
            <Select value={hotel} onValueChange={(v) => setHotel(v as string)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Sélectionner un hôtel" />
              </SelectTrigger>
              <SelectContent>
                {hotels.map((h) => (
                  <SelectItem key={h} value={h}>
                    <span dir="rtl">{h}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label>Vol / Compagnie</Label>
            <Select value={flight} onValueChange={(v) => setFlight(v as string)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Sélectionner un vol" />
              </SelectTrigger>
              <SelectContent>
                {flights.map((f) => (
                  <SelectItem key={f} value={f}>
                    {f}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label>Chambre</Label>
            <Select value={roomVal} onValueChange={(v) => setRoomVal(v as string)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Sélectionner une chambre" />
              </SelectTrigger>
              <SelectContent>
                {rooms.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-price">Prix (DH)</Label>
            <Input
              id="edit-price"
              type="number"
              min={0}
              value={price}
              onChange={(e) => {
                setPrice(e.target.value)
                setError(null)
              }}
            />
          </div>
          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={submit}>
            <Save />
            <span>Enregistrer</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
