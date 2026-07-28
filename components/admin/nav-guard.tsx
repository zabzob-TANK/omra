'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type NavGuardContext = {
  dirty: boolean
  setDirty: (v: boolean) => void
  /** Exécute l'action, ou demande confirmation si des modifications ne sont pas enregistrées. */
  requestLeave: (onConfirm: () => void) => void
}

const Ctx = createContext<NavGuardContext | null>(null)

export function NavGuardProvider({ children }: { children: ReactNode }) {
  const [dirty, setDirty] = useState(false)
  const [open, setOpen] = useState(false)
  const pending = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (!dirty) return
    function handler(e: BeforeUnloadEvent) {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  const requestLeave = useCallback(
    (onConfirm: () => void) => {
      if (dirty) {
        pending.current = onConfirm
        setOpen(true)
      } else {
        onConfirm()
      }
    },
    [dirty],
  )

  function confirmLeave() {
    setOpen(false)
    setDirty(false)
    const action = pending.current
    pending.current = null
    action?.()
  }

  return (
    <Ctx.Provider value={{ dirty, setDirty, requestLeave }}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifications non enregistrées</DialogTitle>
            <DialogDescription>
              Vous avez des modifications non enregistrées. Si vous quittez cette
              page maintenant, ces modifications seront perdues.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Rester sur la page
            </Button>
            <Button variant="destructive" onClick={confirmLeave}>
              Quitter sans enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Ctx.Provider>
  )
}

export function useNavGuard() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useNavGuard doit être utilisé dans NavGuardProvider')
  return ctx
}
