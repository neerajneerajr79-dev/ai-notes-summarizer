export type Feature = 'summarize' | 'chat' | 'flashcards' | 'quiz' | 'planner'

import type { AccountData, Note, Task, User } from './storage'

class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  })
  if (response.status === 204) return undefined as T
  const payload = await response.json() as { error?: string } & T
  if (!response.ok) throw new ApiError(payload.error ?? 'The request could not be completed.', response.status)
  return payload
}

export async function getHealth(): Promise<{ demoMode: boolean; model: string }> {
  return request<{ demoMode: boolean; model: string; database: string }>('/api/health')
}

export async function getCurrentUser(): Promise<User | null> {
  try {
    const result = await request<{ user: User }>('/api/auth/me')
    return result.user
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null
    throw error
  }
}

export async function authenticateAccount(action: 'login' | 'register' | 'demo', details?: { email: string; password: string; displayName?: string }): Promise<User> {
  const result = await request<{ user: User }>(`/api/auth/${action}`, {
    method: 'POST',
    body: details ? JSON.stringify(details) : JSON.stringify({}),
  })
  return result.user
}

export async function logoutAccount(): Promise<void> {
  await request('/api/auth/logout', { method: 'POST' })
}

export async function loadAccountData(): Promise<AccountData> {
  return request('/api/data')
}

export async function saveNotes(notes: Note[]): Promise<void> {
  await request('/api/notes', { method: 'PUT', body: JSON.stringify(notes) })
}

export async function saveTasks(tasks: Task[]): Promise<void> {
  await request('/api/tasks', { method: 'PUT', body: JSON.stringify(tasks) })
}

export async function savePreferences(preferences: Record<string, unknown>): Promise<void> {
  await request('/api/preferences', { method: 'PUT', body: JSON.stringify(preferences) })
}

export async function saveProfile(displayName: string): Promise<void> {
  await request('/api/profile', { method: 'PUT', body: JSON.stringify({ displayName }) })
}

export async function analyze(feature: Feature, text: string, options: { mode?: 'concise' | 'detailed' | 'bullets' | 'exam' | 'concepts' | 'definitions'; quizMode?: 'mixed' | 'multiple_choice' | 'true_false' | 'fill_blank' } = {}): Promise<{ result: string; demoMode: boolean }> {
  const payload = await request<{ result?: string; demoMode: boolean }>(`/api/ai/${feature}`, {
    method: 'POST',
    body: JSON.stringify({ text, ...options }),
  })
  if (!payload.result) throw new Error('The AI response was empty. Please try again.')
  return { result: payload.result, demoMode: payload.demoMode }
}

export async function uploadDocument(file: File): Promise<{ text: string; filename: string }> {
  const form = new FormData()
  form.append('file', file)
  const payload = await request<{ text: string; filename: string }>('/api/documents', { method: 'POST', body: form })
  if (!payload.text) throw new Error('No readable text was found in this document.')
  return { text: payload.text, filename: payload.filename ?? file.name }
}
