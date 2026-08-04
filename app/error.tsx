'use client'

/**
 * Filet de sécurité de dernier recours : n'importe quelle erreur non prévue
 * ailleurs (composant serveur, action serveur) atterrit ici au lieu de
 * l'écran d'erreur brut de Next.js. Ce n'est pas un remplacement des messages
 * propres déjà affichés pour les cas connus (validation, authentification,
 * saison, upload) — seulement le dernier filet pour tout le reste.
 */
export default function ErrorBoundary({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <main
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
      <h1 style={{ fontSize: '1.25rem', fontWeight: 600 }}>
        Une erreur inattendue est survenue.
      </h1>
      <p style={{ color: '#666', maxWidth: '32rem' }}>
        Réessayez. Si le problème persiste, contactez un administrateur.
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
          Réessayer
        </button>
        <a
          href="/"
          style={{
            padding: '0.5rem 1.25rem',
            borderRadius: '0.5rem',
            border: '1px solid #ccc',
            background: '#fff',
            textDecoration: 'none',
            color: 'inherit',
          }}
        >
          Retour à l’accueil
        </a>
      </div>
    </main>
  )
}
