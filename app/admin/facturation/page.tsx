import { FileText } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

export default function FacturationPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <span className="inline-flex size-10 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
          <FileText className="size-5" />
        </span>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Facturation
        </h1>
      </div>

      <Card>
        <CardContent className="flex min-h-64 flex-col items-center justify-center gap-2 py-16 text-center">
          <p className="text-lg font-medium text-foreground">
            Module en cours de préparation
          </p>
          <p className="max-w-md text-sm text-muted-foreground">
            Le module de facturation sera disponible prochainement.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
