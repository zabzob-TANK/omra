'use client'

import Link from 'next/link'
import {
  Users,
  CalendarRange,
  ReceiptText,
  FileText,
  ListChecks,
  ArrowRight,
  Lock,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

type Item = {
  title: string
  description: string
  href?: string
  icon: React.ComponentType<{ className?: string }>
  disabled?: boolean
  badge?: string
}

const items: Item[] = [
  {
    title: 'Comptes employés',
    description: 'Gérer les identifiants de connexion des employés.',
    href: '/admin/comptes',
    icon: Users,
  },
  {
    title: 'Programme / Saisons',
    description: 'Créer et gérer les saisons Omra, hôtels, vols et prix.',
    href: '/admin/programme',
    icon: CalendarRange,
  },
  {
    title: 'Modifier un reçu',
    description: 'Édition des reçus déjà émis.',
    icon: ReceiptText,
    disabled: true,
    badge: 'Bientôt disponible',
  },
  {
    title: 'Accéder à la facturation',
    description: 'Émission et suivi des factures.',
    href: '/admin/facturation',
    icon: FileText,
  },
  {
    title: 'Statistiques / Liste générale',
    description: 'Vue d’ensemble et liste générale des dossiers.',
    href: '/admin/statistiques',
    icon: ListChecks,
  },
]

export default function AdminHomePage() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Administration
        </h1>
        <p className="text-muted-foreground">
          Bienvenue. Choisissez un module pour commencer.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => {
          const Icon = item.icon
          const content = (
            <div
              className={cn(
                'group flex h-full flex-col gap-4 rounded-xl border border-border bg-card p-5 ring-1 ring-foreground/5 transition-colors',
                item.disabled
                  ? 'cursor-not-allowed opacity-70'
                  : 'hover:border-primary/50 hover:bg-secondary/40',
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <span
                  className={cn(
                    'inline-flex size-11 items-center justify-center rounded-lg',
                    item.disabled
                      ? 'bg-muted text-muted-foreground'
                      : 'bg-secondary text-secondary-foreground',
                  )}
                >
                  <Icon className="size-5" />
                </span>
                {item.badge ? (
                  <Badge variant="outline" className="gap-1">
                    <Lock className="size-3" />
                    {item.badge}
                  </Badge>
                ) : (
                  !item.disabled && (
                    <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                  )
                )}
              </div>
              <div className="flex flex-col gap-1">
                <h2 className="text-base font-semibold text-foreground">
                  {item.title}
                </h2>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {item.description}
                </p>
              </div>
            </div>
          )

          if (item.disabled || !item.href) {
            return (
              <div
                key={item.title}
                aria-disabled="true"
                title="Bientôt disponible"
              >
                {content}
              </div>
            )
          }

          return (
            <Link
              key={item.title}
              href={item.href}
              className="rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {content}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
