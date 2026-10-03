import type { LayoutDocument, Plot, Project } from './types'

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, { credentials: 'same-origin', ...options })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error ?? `Request failed (${response.status}).`)
  return data as T
}

export function jsonRequest(method: string, body: unknown): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
}

export type AuthStatus = { authenticated: boolean; setupRequired: boolean }

export type ProjectInput = {
  name: string
  slug: string
  location: string
  description: string
  contactNumber: string
  whatsappNumber: string
  status: Project['status']
  colors: Project['colors']
}

export const getProject = (slug: string, preview = false) => api<Project>(`/projects/${encodeURIComponent(slug)}${preview ? '?preview=1' : ''}`)
export const getPlots = (slug: string) => api<Plot[]>(`/projects/${encodeURIComponent(slug)}/plots`)
export const savePlots = (slug: string, plots: Plot[]) => api<{ saved: number }>(`/projects/${encodeURIComponent(slug)}/plots`, jsonRequest('PUT', { plots }))
export const saveLayout = (slug: string, layout: LayoutDocument) => api<{ saved: boolean }>(`/projects/${encodeURIComponent(slug)}/layout`, jsonRequest('PUT', layout))
