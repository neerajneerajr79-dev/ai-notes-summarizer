export interface Note {
  id: string
  title: string
  subject: string
  updated: string
  content: string
  kind: 'note' | 'summary'
  folder?: string
}

export interface Task {
  id: string
  title: string
  date: string
  done: boolean
}

export interface User {
  id: string
  email: string
  displayName: string
  isDemo: boolean
}

export interface AccountData {
  notes: Note[]
  tasks: Task[]
  preferences: Record<string, unknown>
  stats: {
    summaries: number
    flashcardSets: number
    quizzes: number
    weeklyActivity: { day: string; weekday: number; count: number }[]
  }
}

export function readStore<T>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(key)
    return stored ? JSON.parse(stored) as T : fallback
  } catch {
    return fallback
  }
}

export function writeStore<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (error) {
    console.error(`Unable to save ${key} to local storage.`, error)
  }
}
