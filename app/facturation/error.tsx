'use client'

/**
 * Filet de sécurité de la Facturation : n'importe quelle erreur non prévue
 * ailleurs atterrit ici, en arabe comme le reste de l'écran, au lieu de
 * l'écran d'erreur brut de Next.js. Ne remplace pas les messages propres déjà
 * affichés pour les cas connus (saison, authentification, upload) — seulement
 * le dernier filet pour tout le reste.
 */
export default function ErreurFacturation({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <main
      dir="rtl"
      lang="ar"
      style={{
        display: 'flex',
        minHeight: '60vh',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1rem',
        padding: '2rem',
        textAlign: 'center',
      }}
    >
      <h1 style={{ fontSize: '1.25rem', fontWeight: 600 }}>حدث خطأ غير متوقع.</h1>
      <p style={{ color: '#666', maxWidth: '32rem' }}>
        أعد المحاولة. إذا استمرت المشكلة، تواصل مع المدير.
      </p>
      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <button
          onClick={reset}
          style={{
            padding: '0.5rem 1.25rem',
            borderRadius: '0.5rem',
            border: '1px solid #ccc',
            background: '#fff',
            cursor: 'pointer',
          }}
        >
          إعادة المحاولة
        </button>
        <a
          href="/facturation"
          style={{
            padding: '0.5rem 1.25rem',
            borderRadius: '0.5rem',
            border: '1px solid #ccc',
            background: '#fff',
            textDecoration: 'none',
            color: 'inherit',
          }}
        >
          العودة إلى الوصل
        </a>
      </div>
    </main>
  )
}
