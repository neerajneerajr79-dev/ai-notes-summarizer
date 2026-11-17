import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'
import { z } from 'zod'
import { db } from './db.js'

export const sessionCookieName = 'mindora_session'
export const sessionDurationMs = 7 * 24 * 60 * 60 * 1000

export interface AuthenticatedUser {
  id: string
  email: string
  displayName: string
  isDemo: boolean
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser
    }
  }
}

const userInputSchema = z.object({
  email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
  password: z.string().min(8).max(128),
  displayName: z.string().trim().min(1).max(80).optional(),
})

export function parseUserInput(value: unknown): z.infer<typeof userInputSchema> {
  return userInputSchema.parse(value)
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function equalSecret(left: string, right: string): boolean {
  const leftHash = createHash('sha256').update(left).digest()
  const rightHash = createHash('sha256').update(right).digest()
  return timingSafeEqual(leftHash, rightHash)
}

export function createSession(user: AuthenticatedUser, response: Response): void {
  const token = randomBytes(32).toString('base64url')
  const tokenHash = hashToken(token)
  const expiresAt = Date.now() + sessionDurationMs
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .run(tokenHash, user.id, expiresAt)
  response.cookie(sessionCookieName, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api',
    maxAge: sessionDurationMs,
  })
}

export function clearSession(request: Request, response: Response): void {
  const token = request.cookies?.[sessionCookieName]
  if (typeof token === 'string') {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token))
  }
  response.clearCookie(sessionCookieName, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api',
  })
}

export function authenticate(request: Request, response: Response, next: NextFunction): void {
  const token: unknown = request.cookies?.[sessionCookieName]
  if (typeof token !== 'string' || token.length < 32) {
    response.status(401).json({ error: 'Please sign in to continue.' })
    return
  }
  const row = db.prepare(`
    SELECT users.id, users.email, users.display_name, users.is_demo
    FROM sessions JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?
  `).get(hashToken(token), Date.now()) as { id: string; email: string; display_name: string; is_demo: number } | undefined
  if (!row) {
    response.clearCookie(sessionCookieName, { path: '/api', httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production' })
    response.status(401).json({ error: 'Your session expired. Please sign in again.' })
    return
  }
  request.user = { id: row.id, email: row.email, displayName: row.display_name, isDemo: row.is_demo === 1 }
  next()
}

export const createUser = db.prepare(`
  INSERT INTO users (id, email, display_name, password_hash, is_demo)
  VALUES (@id, @email, @displayName, @passwordHash, @isDemo)
`)

export const findUserByEmail = db.prepare(`
  SELECT id, email, display_name, password_hash, is_demo
  FROM users WHERE email = ? COLLATE NOCASE
`)

export function newUserId(): string {
  return randomUUID()
}
