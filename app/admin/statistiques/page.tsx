import { ListChecks, BarChart3, Table2 } from 'lucide-react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export default function StatistiquesPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <span className="inline-flex size-10 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
          <ListChecks className="size-5" />
        </span>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Statistiques et liste générale
        </h1>
      </div>

      <p className="text-sm text-muted-foreground">
        Module en cours de préparation.
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="size-4 text-primary" />
              Statistiques
            </CardTitle>
          </CardHeader>
          <CardContent className="flex min-h-56 items-center justify-center py-10">
            <p className="text-sm text-muted-foreground">
              Zone réservée aux futures statistiques.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2">
              <Table2 className="size-4 text-primary" />
              Liste générale
            </CardTitle>
          </CardHeader>
          <CardContent className="flex min-h-56 items-center justify-center py-10">
            <p className="text-sm text-muted-foreground">
              Zone réservée au futur tableau général.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
