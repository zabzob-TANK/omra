import { createClient } from '@supabase/supabase-js'

export interface RegistrationRecord {
  id: number
  nom: string
  prenom: string
  hotel: string
  created_at: string
}

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
)

export async function getRegistrations(): Promise<RegistrationRecord[]> {
  const { data, error } = await supabase
    .from('people')
    .select('id, nom, prenom, hotel, created_at')
    .order('id', { ascending: true })

  if (error) throw error
  return data
}

export async function saveRegistration(nom: string, prenom: string, hotel: string): Promise<void> {
  const { error } = await supabase.from('people').insert({ nom, prenom, hotel })

  if (error) throw error
}
