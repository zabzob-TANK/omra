'use client'

import { useState } from 'react'
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useConfirm } from '@/components/admin/confirm-provider'

export type ListManagerProps = {
  title: string
  items: string[]
  placeholder: string
  onAdd: (value: string) => void
  onEdit: (index: number, value: string) => void
  onDelete: (index: number) => void
  rtl?: boolean
  numeric?: boolean
  validate?: (value: string, currentIndex: number | null) => string | null
  getDeleteWarning?: (value: string) => string | null
}

export function ListManager({
  title,
  items,
  placeholder,
  onAdd,
  onEdit,
  onDelete,
  rtl = false,
  validate,
  getDeleteWarning,
}: ListManagerProps) {
  const confirm = useConfirm()
  const [newValue, setNewValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editingValue, setEditingValue] = useState('')
  const [editError, setEditError] = useState<string | null>(null)

  function handleAdd() {
    const value = newValue.trim()
    if (!value) {
      setError('Veuillez saisir une valeur.')
      return
    }
    const validationError = validate?.(value, null) ?? null
    if (validationError) {
      setError(validationError)
      return
    }
    onAdd(value)
    setNewValue('')
    setError(null)
  }

  function startEdit(index: number) {
    setEditingIndex(index)
    setEditingValue(items[index])
    setEditError(null)
  }

  function saveEdit() {
    if (editingIndex === null) return
    const value = editingValue.trim()
    if (!value) {
      setEditError('Veuillez saisir une valeur.')
      return
    }
    const validationError = validate?.(value, editingIndex) ?? null
    if (validationError) {
      setEditError(validationError)
      return
    }
    onEdit(editingIndex, value)
    setEditingIndex(null)
    setEditingValue('')
    setEditError(null)
  }

  async function handleDelete(index: number) {
    const value = items[index]
    const warning = getDeleteWarning?.(value) ?? null
    const ok = await confirm({
      title: 'Confirmer la suppression',
      description: (
        <span>
          Voulez-vous vraiment supprimer «&nbsp;
          <span dir={rtl ? 'rtl' : 'ltr'} className="font-medium">
            {value}
          </span>
          &nbsp;» ?
          {warning ? (
            <span className="mt-2 block rounded-md bg-destructive/10 p-2 text-destructive">
              {warning}
            </span>
          ) : null}
        </span>
      ),
      confirmLabel: 'Supprimer',
      variant: 'destructive',
    })
    if (ok) onDelete(index)
  }

  return (
    <div className="flex h-full flex-col rounded-xl border border-border bg-card ring-1 ring-foreground/5">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>

      <div className="flex flex-col gap-1.5 border-b border-border p-3">
        <div className="flex gap-2">
          <Input
            value={newValue}
            onChange={(e) => {
              setNewValue(e.target.value)
              setError(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                e.preventDefault()
                handleAdd()
              }
            }}
            placeholder={placeholder}
            dir={rtl ? 'rtl' : 'ltr'}
            className={cn(rtl && 'text-right')}
            aria-label={`Ajouter — ${title}`}
          />
          <Button
            size="icon"
            variant="secondary"
            onClick={handleAdd}
            aria-label="Ajouter"
          >
            <Plus />
          </Button>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>

      <div className="max-h-56 flex-1 overflow-y-auto p-1.5">
        {items.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            Aucun élément.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {items.map((item, index) => (
              <li key={`${item}-${index}`}>
                {editingIndex === index ? (
                  <div className="flex flex-col gap-1.5 rounded-lg bg-secondary/50 p-1.5">
                    <div className="flex gap-1.5">
                      <Input
                        value={editingValue}
                        onChange={(e) => {
                          setEditingValue(e.target.value)
                          setEditError(null)
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                            e.preventDefault()
                            saveEdit()
                          }
                          if (e.key === 'Escape') setEditingIndex(null)
                        }}
                        dir={rtl ? 'rtl' : 'ltr'}
                        className={cn('h-7', rtl && 'text-right')}
                        autoFocus
                      />
                      <Button
                        size="icon-sm"
                        onClick={saveEdit}
                        aria-label="Valider"
                      >
                        <Check />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => setEditingIndex(null)}
                        aria-label="Annuler"
                      >
                        <X />
                      </Button>
                    </div>
                    {editError && (
                      <p className="text-xs text-destructive">{editError}</p>
                    )}
                  </div>
                ) : (
                  <div className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-secondary/50">
                    <span
                      dir={rtl ? 'rtl' : 'ltr'}
                      className={cn(
                        'min-w-0 flex-1 truncate text-sm text-foreground',
                        rtl ? 'text-right' : 'text-left',
                      )}
                    >
                      {item}
                    </span>
                    <div className="flex shrink-0 items-center gap-0.5 opacity-70 transition-opacity group-hover:opacity-100">
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => startEdit(index)}
                        aria-label={`Modifier ${item}`}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => handleDelete(index)}
                        aria-label={`Supprimer ${item}`}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
