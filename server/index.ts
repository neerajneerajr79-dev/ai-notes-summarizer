import app from './app.js'

const port = Number(process.env.PORT ?? 3001)

const server = app.listen(port, () => {
  const aiMode = process.env.OPENAI_API_KEY?.trim() ? 'AI provider configured' : 'demo AI responses (no API key)'
  console.log(`Mindora API listening on http://localhost:${port}; SQLite connected; ${aiMode}.`)
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0))
  })
}
