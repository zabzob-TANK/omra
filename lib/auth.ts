type AuthClaims = {
  email?: unknown
}

export function isTestAdmin(claims: AuthClaims | null | undefined) {
  const expectedEmail = process.env.OMRA_TEST_ADMIN_EMAIL
    ?.trim()
    .toLowerCase()
  const authenticatedEmail =
    typeof claims?.email === 'string' ? claims.email.trim().toLowerCase() : ''

  return Boolean(expectedEmail && authenticatedEmail === expectedEmail)
}
