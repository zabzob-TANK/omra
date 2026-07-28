import Image from 'next/image'
import { cn } from '@/lib/utils'

export function Logo({
  size = 40,
  className,
  showText = false,
}: {
  size?: number
  className?: string
  showText?: boolean
}) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <span
        className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary ring-1 ring-border"
        style={{ width: size, height: size }}
      >
        <Image
          src="/zemzem-asfar-logo.png"
          alt="ZEMZEM ASFAR"
          width={size}
          height={size}
          className="h-full w-full object-cover"
          priority
        />
      </span>
      {showText && (
        <span className="flex flex-col leading-tight">
          <span className="text-sm font-semibold tracking-wide text-foreground">
            ZEMZEM ASFAR
          </span>
          <span className="text-[11px] text-muted-foreground">
            Agence de voyage
          </span>
        </span>
      )}
    </span>
  )
}
