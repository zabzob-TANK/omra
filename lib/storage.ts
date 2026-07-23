export interface RegistrationRecord {
  id: number
  nom: string
  prenom: string
  hotel: string
}

const STORAGE_KEY = 'omra_people'

export function getRegistrations(): RegistrationRecord[] {
  if (typeof window === 'undefined') return []
  const data = localStorage.getItem(STORAGE_KEY)
  return data ? JSON.parse(data) : []
}

export function saveRegistration(nom: string, prenom: string, hotel: string): RegistrationRecord {
  const records = getRegistrations()
  const nextId = records.length > 0 ? Math.max(...records.map(r => r.id)) + 1 : 1
  const newRecord: RegistrationRecord = { id: nextId, nom, prenom, hotel }
  records.push(newRecord)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
  return newRecord
}
