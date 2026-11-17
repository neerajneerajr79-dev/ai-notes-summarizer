import 'dotenv/config'
import bcrypt from 'bcryptjs'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import express from 'express'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import multer from 'multer'
import mammoth from 'mammoth'
import { z } from 'zod'
import { authenticate, clearSession, createSession, createUser, findUserByEmail, newUserId, parseUserInput, type AuthenticatedUser } from './auth.js'
import { db } from './db.js'
import { featureSchema, runAI, validateInput } from './ai.js'

const app = express()
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
})

const noteSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  subject: z.string().trim().min(1).max(80),
  content: z.string().max(100_000),
  kind: z.enum(['note', 'summary']),
  folder: z.string().max(80).optional().default(''),
  updated: z.string().max(40),
})
const taskSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  date: z.string().max(40),
  done: z.boolean(),
})
const collectionSchema = z.array(noteSchema).max(500)
const taskCollectionSchema = z.array(taskSchema).max(500)
const preferenceSchema = z.record(z.string().max(80), z.unknown()).refine((value) => JSON.stringify(value).length <= 20_000)
const profileSchema = z.object({ displayName: z.string().trim().min(1).max(80) })

app.use(helmet())
app.use(cors({ origin: process.env.CLIENT_ORIGIN?.split(',').map((origin) => origin.trim()) ?? 'http://localhost:5173', credentials: true }))
app.use(cookieParser())
app.use(express.json({ limit: '1mb' }))
app.use('/api', rateLimit({ windowMs: 60_000, limit: 40, standardHeaders: 'draft-8', legacyHeaders: false }))
app.use('/api/auth', rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false }))

app.get('/api/health', (_request, response) => {
  try {
    const database = db.prepare('SELECT 1 AS ok').get() as { ok: number }
    response.json({
      status: database.ok === 1 ? 'ok' : 'error',
      database: database.ok === 1 ? 'connected' : 'unavailable',
      demoMode: !process.env.OPENAI_API_KEY?.trim(),
      model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
    })
  } catch (error) {
    console.error('Database health check failed:', error)
    response.status(503).json({ status: 'error', database: 'unavailable', demoMode: !process.env.OPENAI_API_KEY?.trim() })
  }
})

app.post('/api/auth/register', async (request, response) => {
  try {
    const input = parseUserInput(request.body)
    if (!input.displayName) {
      response.status(400).json({ error: 'Please enter your name.' })
      return
    }
    const passwordHash = await bcrypt.hash(input.password, 12)
    const user: AuthenticatedUser = {
      id: newUserId(),
      email: input.email,
      displayName: input.displayName,
      isDemo: false,
    }
    createUser.run({ ...user, passwordHash, isDemo: 0 })
    createSession(user, response)
    response.status(201).json({ user })
  } catch (error) {
    if (error instanceof z.ZodError) {
      response.status(400).json({ error: error.issues[0]?.message ?? 'Please check your details.' })
      return
    }
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
      response.status(409).json({ error: 'An account with that email already exists.' })
      return
    }
    console.error('Registration failed:', error)
    response.status(500).json({ error: 'We could not create your account. Please try again.' })
  }
})

app.post('/api/auth/login', async (request, response) => {
  try {
    const input = parseUserInput(request.body)
    const row = findUserByEmail.get(input.email) as { id: string; email: string; display_name: string; password_hash: string; is_demo: number } | undefined
    const passwordMatches = row ? await bcrypt.compare(input.password, row.password_hash) : await bcrypt.compare(input.password, '$2b$12$4Ojd9v1zjl6jTDwL8goUtOFiZyZWEoRFXZnUKpD5CEJyJAC/NlqxC')
    if (!row || !passwordMatches) {
      response.status(401).json({ error: 'Email or password is incorrect.' })
      return
    }
    const user: AuthenticatedUser = { id: row.id, email: row.email, displayName: row.display_name, isDemo: row.is_demo === 1 }
    createSession(user, response)
    response.json({ user })
  } catch (error) {
    if (error instanceof z.ZodError) {
      response.status(400).json({ error: error.issues[0]?.message ?? 'Please check your details.' })
      return
    }
    console.error('Login failed:', error)
    response.status(500).json({ error: 'We could not sign you in. Please try again.' })
  }
})

app.post('/api/auth/demo', (_request, response) => {
  const email = 'demo@mindora.local'
  let row = findUserByEmail.get(email) as { id: string; email: string; display_name: string } | undefined
  if (!row) {
    const user = { id: newUserId(), email, displayName: 'Demo Student', isDemo: true }
    createUser.run({ ...user, passwordHash: 'not-a-login-password', isDemo: 1 })
    row = { id: user.id, email, display_name: user.displayName }
  }
  const user: AuthenticatedUser = { id: row.id, email: row.email, displayName: row.display_name, isDemo: true }
  createSession(user, response)
  response.json({ user })
})

app.get('/api/auth/me', authenticate, (request, response) => {
  response.json({ user: request.user })
})

app.put('/api/profile', authenticate, (request, response) => {
  const parsed = profileSchema.safeParse(request.body)
  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid profile name.' })
    return
  }
  db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(parsed.data.displayName, request.user!.id)
  response.json({ displayName: parsed.data.displayName })
})

app.post('/api/auth/logout', (request, response) => {
  clearSession(request, response)
  response.status(204).end()
})

app.get('/api/data', authenticate, (request, response) => {
  const userId = request.user!.id
  const notes = db.prepare(`
    SELECT id, title, subject, content, kind, folder, updated_at AS updated
    FROM notes WHERE user_id = ? ORDER BY updated_at DESC
  `).all(userId).map((row) => row as { id: string; title: string; subject: string; content: string; kind: 'note' | 'summary'; folder: string; updated: string })
  const tasks = db.prepare(`
    SELECT id, title, due_date AS date, done
    FROM tasks WHERE user_id = ? ORDER BY due_date, created_at
  `).all(userId).map((row) => {
    const task = row as { id: string; title: string; date: string; done: number }
    return { ...task, done: task.done === 1 }
  })
  const preferences = db.prepare('SELECT key, value FROM preferences WHERE user_id = ?').all(userId) as { key: string; value: string }[]
  const generated = db.prepare(`
    SELECT feature, COUNT(*) AS count
    FROM ai_generations WHERE user_id = ? GROUP BY feature
  `).all(userId) as { feature: string; count: number }[]
  const weeklyActivity = db.prepare(`
    WITH RECURSIVE days(day) AS (
      SELECT date('now', '-6 days')
      UNION ALL SELECT date(day, '+1 day') FROM days WHERE day < date('now')
    ), activity(day, count) AS (
      SELECT date(created_at), COUNT(*) FROM (
        SELECT created_at FROM notes WHERE user_id = ?
        UNION ALL SELECT created_at FROM ai_generations WHERE user_id = ?
      ) GROUP BY date(created_at)
    )
    SELECT days.day, CAST(strftime('%w', days.day) AS INTEGER) AS weekday,
      COALESCE(activity.count, 0) AS count FROM days
    LEFT JOIN activity ON activity.day = days.day ORDER BY days.day
  `).all(userId, userId) as { day: string; count: number }[]
  response.json({
    notes,
    tasks,
    preferences: Object.fromEntries(preferences.map(({ key, value }) => [key, JSON.parse(value)])),
    stats: {
      summaries: generated.find((item) => item.feature === 'summarize')?.count ?? 0,
      flashcardSets: generated.find((item) => item.feature === 'flashcards')?.count ?? 0,
      quizzes: generated.find((item) => item.feature === 'quiz')?.count ?? 0,
      weeklyActivity,
    },
  })
})

app.put('/api/notes', authenticate, (request, response) => {
  const parsed = collectionSchema.safeParse(request.body)
  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid notes collection.' })
    return
  }
  const userId = request.user!.id
  const saveNotes = db.transaction((notes: z.infer<typeof collectionSchema>) => {
    db.prepare('DELETE FROM notes WHERE user_id = ?').run(userId)
    const insert = db.prepare(`
      INSERT INTO notes (id, user_id, title, subject, content, kind, folder, created_at, updated_at)
      VALUES (@id, @userId, @title, @subject, @content, @kind, @folder, @updated, @updated)
    `)
    for (const note of notes) insert.run({ ...note, userId })
  })
  try {
    saveNotes(parsed.data)
    response.json({ saved: parsed.data.length })
  } catch (error) {
    console.error('Saving notes failed:', error)
    response.status(500).json({ error: 'Your notes could not be saved.' })
  }
})

app.put('/api/tasks', authenticate, (request, response) => {
  const parsed = taskCollectionSchema.safeParse(request.body)
  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid task list.' })
    return
  }
  const userId = request.user!.id
  const saveTasks = db.transaction((tasks: z.infer<typeof taskCollectionSchema>) => {
    db.prepare('DELETE FROM tasks WHERE user_id = ?').run(userId)
    const insert = db.prepare('INSERT INTO tasks (id, user_id, title, due_date, done) VALUES (@id, @userId, @title, @date, @done)')
    for (const task of tasks) insert.run({ ...task, userId, done: task.done ? 1 : 0 })
  })
  try {
    saveTasks(parsed.data)
    response.json({ saved: parsed.data.length })
  } catch (error) {
    console.error('Saving tasks failed:', error)
    response.status(500).json({ error: 'Your study tasks could not be saved.' })
  }
})

app.put('/api/preferences', authenticate, (request, response) => {
  const parsed = preferenceSchema.safeParse(request.body)
  if (!parsed.success) {
    response.status(400).json({ error: 'Invalid settings payload.' })
    return
  }
  const userId = request.user!.id
  const update = db.transaction((preferences: Record<string, unknown>) => {
    db.prepare('DELETE FROM preferences WHERE user_id = ?').run(userId)
    const insert = db.prepare('INSERT INTO preferences (user_id, key, value) VALUES (?, ?, ?)')
    for (const [key, value] of Object.entries(preferences)) insert.run(userId, key, JSON.stringify(value))
  })
  update(parsed.data)
  response.json({ saved: true })
})

app.post('/api/ai/:feature', authenticate, async (request, response) => {
  const feature = featureSchema.safeParse(request.params.feature)
  if (!feature.success) {
    response.status(404).json({ error: 'That study tool does not exist.' })
    return
  }
  try {
    const { text, options } = validateInput(request.body)
    const result = await runAI(feature.data, text, options)
    db.prepare('INSERT INTO ai_generations (id, user_id, feature, demo_mode) VALUES (?, ?, ?, ?)')
      .run(newUserId(), request.user!.id, feature.data, result.demoMode ? 1 : 0)
    response.json(result)
  } catch (error) {
    if (error instanceof z.ZodError) {
      response.status(400).json({ error: error.issues[0]?.message ?? 'Invalid request.' })
      return
    }
    console.error('AI request failed:', error)
    response.status(502).json({ error: error instanceof Error ? error.message : 'The AI request failed.' })
  }
})

app.post('/api/documents', authenticate, upload.single('file'), async (request, response) => {
  const file = request.file
  if (!file) {
    response.status(400).json({ error: 'Choose a document to upload.' })
    return
  }

  const extension = file.originalname.toLowerCase().split('.').pop()
  try {
    let text: string
    if (extension === 'pdf') {
      if (file.buffer.subarray(0, 5).toString() !== '%PDF-') {
        response.status(415).json({ error: 'This file does not appear to be a valid PDF.' })
        return
      }
      const { PDFParse } = await import('pdf-parse')
      const parser = new PDFParse({ data: file.buffer })
      try {
        text = (await parser.getText()).text
      } finally {
        await parser.destroy()
      }
    } else if (extension === 'docx') {
      text = (await mammoth.extractRawText({ buffer: file.buffer })).value
    } else if (['txt', 'md'].includes(extension ?? '')) {
      text = file.buffer.toString('utf8')
    } else {
      response.status(415).json({ error: 'Unsupported file type. Upload a PDF, DOCX, TXT, or MD document.' })
      return
    }
    const cleanText = text.replaceAll(String.fromCharCode(0), '').trim()
    if (!cleanText) {
      response.status(422).json({ error: 'No readable text was found. Scanned PDFs may need OCR before upload.' })
      return
    }
    response.json({ filename: file.originalname, text: cleanText.slice(0, 100_000) })
  } catch (error) {
    console.error(`Unable to extract text from ${file.originalname}:`, error)
    response.status(422).json({ error: 'We could not read this document. Please check the file and try again.' })
  }
})

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
    response.status(413).json({ error: 'This file is larger than 10 MB. Try a smaller document.' })
    return
  }
  if (error instanceof SyntaxError && 'status' in error && error.status === 400) {
    response.status(400).json({ error: 'The request body must contain valid JSON.' })
    return
  }
  console.error('Unhandled API error:', error)
  response.status(500).json({ error: 'An unexpected server error occurred.' })
})

export default app
