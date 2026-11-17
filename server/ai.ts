import { z } from 'zod'

export const featureSchema = z.enum(['summarize', 'chat', 'flashcards', 'quiz', 'planner'])
export type Feature = z.infer<typeof featureSchema>
export const summaryModeSchema = z.enum(['concise', 'detailed', 'bullets', 'exam', 'concepts', 'definitions'])
export const quizModeSchema = z.enum(['mixed', 'multiple_choice', 'true_false', 'fill_blank'])
export interface AnalysisOptions {
  summaryMode?: z.infer<typeof summaryModeSchema>
  quizMode?: z.infer<typeof quizModeSchema>
}

const requestSchema = z.object({
  text: z.string().trim().min(1, 'Add some notes or a topic first.').max(100_000, 'This input is too long. Please keep it under 100,000 characters.'),
  mode: summaryModeSchema.optional(),
  quizMode: quizModeSchema.optional(),
})

const prompts: Record<Feature, string> = {
  summarize: 'You are Mindora, a thoughtful study assistant. Summarize the supplied study material accurately and clearly. Keep important terminology, do not add unsupported facts, and use plain Markdown.',
  chat: 'You are Mindora, a kind and precise learning companion. Answer the learner’s question clearly and help them understand, not just memorize. Use supplied notes when relevant, distinguish note facts from general explanation, and say when the notes do not contain the answer.',
  flashcards: 'Create 5 useful active-recall flashcards from the supplied study material. Return ONLY a valid JSON array of objects with "question" and "answer" string properties. Questions should be focused and answers concise. Do not wrap in markdown fences.',
  quiz: 'Create a 6-question quiz based on the supplied study material. Return ONLY a valid JSON array. Every item has "type" ("multiple_choice", "true_false", or "fill_blank"), "question", "answer" (zero-based integer for choice questions, exact text for fill_blank), and "explanation". Multiple choice items also have "options" (4 strings); true/false items have "options" ["True", "False"]; fill_blank items include a "blank_sentence" containing exactly one "____" placeholder. Include one correct answer per question. Do not wrap in markdown fences.',
  planner: 'Create a realistic 5-session study plan from the supplied topic, notes, or goal. Return ONLY a valid JSON array of objects with "day", "topic", "duration", and "task" string properties. Keep each session actionable and 25-45 minutes long. Do not wrap in markdown fences.',
}

export function validateInput(value: unknown): { text: string; options: AnalysisOptions } {
  const parsed = requestSchema.parse(value)
  return { text: parsed.text, options: { summaryMode: parsed.mode, quizMode: parsed.quizMode } }
}

export function demoResult(feature: Feature, text: string, options: AnalysisOptions = {}): string {
  const questionMarker = '\n\nLearner question:'
  const questionOffset = text.lastIndexOf(questionMarker)
  const sourceText = feature === 'chat' && questionOffset >= 0 ? text.slice(0, questionOffset) : text
  const sentences = sourceText.split(/(?<=[.!?])\s+/).map((part) => part.trim()).filter((part) => part.length > 30)
  const source = sentences.length ? sentences : [sourceText.trim()]
  const takeaways = source.slice(0, 4).map((item) => item.replace(/^[•*-]\s*/, '').replace(/\s+/g, ' '))

  if (feature === 'summarize') {
    const firstSentence = takeaways[0] ?? 'Your notes contain a helpful set of connected ideas.'
    if (options.summaryMode === 'definitions') {
      const definitions = takeaways.map((item) => {
        const [term, ...meaning] = item.split(/\s+(?:is|are|means|refers to)\s+/i)
        return `- **${meaning.length ? term : 'Key idea'}**: ${meaning.length ? meaning.join(' ') : item}`
      })
      return `## Key definitions\n${definitions.join('\n')}\n\n_Demo response based only on the supplied text._`
    }
    if (options.summaryMode === 'exam') {
      return `## Exam preparation\n\n### Core idea\n${firstSentence}\n\n### Revise these points\n${takeaways.map((item, index) => `${index + 1}. ${item}`).join('\n')}\n\n### Self-check\nCan you explain each point without looking at your notes?\n\n_Demo response based only on the supplied text._`
    }
    if (options.summaryMode === 'concepts') {
      return `## Important concepts\n${takeaways.map((item) => `- **${item.split(/\s+/).slice(0, 4).join(' ')}** — ${item}`).join('\n')}\n\n_Demo response based only on the supplied text._`
    }
    if (options.summaryMode === 'bullets') {
      return `## Key points\n${takeaways.map((item) => `- ${item}`).join('\n')}\n\n_Demo response based only on the supplied text._`
    }
    if (options.summaryMode === 'detailed') {
      return `## Detailed summary\n\n${takeaways.join('\n\n')}\n\n## Revision prompt\nExplain how these ideas relate, using only what your source material supports.\n\n_Demo response based only on the supplied text._`
    }
    return `## The big picture\n${firstSentence}\n\n## Key ideas\n${takeaways.map((item) => `- ${item}`).join('\n')}\n\n## Keep in mind\nReview these concepts in your own words, then test yourself with active recall.`
  }
  if (feature === 'chat') {
    const question = questionOffset >= 0 ? text.slice(questionOffset + questionMarker.length).trim() : text.trim()
    const topic = question.length < 100 ? question : `${question.split(/\s+/).slice(0, 8).join(' ')}…`
    return `Let’s make this clearer. Your notes highlight ${takeaways[0]?.toLowerCase() ?? 'a few connected ideas'}.\n\nA useful way to think about **${topic}** is to connect it to the key ideas in your source material. Try explaining that connection in one sentence, then check whether you can support it with an example.\n\nThis is a demo response based on your notes. Add an API key to get a tailored answer from your configured AI model.`
  }
  if (feature === 'flashcards') {
    return JSON.stringify(takeaways.slice(0, 5).map((sentence, index) => ({
      question: index === 0 ? 'What is the central idea in these notes?' : `What should you remember about: ${sentence.slice(0, 55)}${sentence.length > 55 ? '…' : ''}`,
      answer: sentence,
    })))
  }
  if (feature === 'quiz') {
    const kinds = options.quizMode === 'mixed' || !options.quizMode
      ? ['multiple_choice', 'true_false', 'fill_blank', 'multiple_choice', 'true_false', 'fill_blank']
      : Array.from({ length: 6 }, () => options.quizMode!)
    return JSON.stringify(takeaways.slice(0, 6).map((sentence, index) => {
      const type = kinds[index % kinds.length]
      const wordsInSentence = sentence.split(/\s+/)
      const blankWord = wordsInSentence[Math.min(2, wordsInSentence.length - 1)] ?? 'idea'
      const blankSentence = sentence.replace(blankWord, '____')
      return {
        type,
        question: type === 'fill_blank' ? 'Complete the statement from your notes.' : type === 'true_false' ? `True or false: ${sentence}` : 'Which statement best matches your notes?',
        ...(type === 'fill_blank' ? { blank_sentence: blankSentence, answer: blankWord } : {
          options: type === 'true_false' ? ['True', 'False'] : [sentence, 'The notes describe an unrelated process.', 'The notes say this idea has no practical application.', 'This statement is not supported by the source.'],
          answer: 0,
        }),
        explanation: 'Check the source material to review this idea.',
      }
    }))
  }
  return JSON.stringify(Array.from({ length: 5 }, (_, index) => ({
    day: `Session ${index + 1}`,
    topic: index === 0 ? 'Orient and outline key ideas' : `Review key idea ${index + 1}`,
    duration: '30 min',
    task: index === 4 ? 'Use active recall to review the full topic' : `Study and explain: ${takeaways[index % takeaways.length]?.slice(0, 72) ?? text.slice(0, 72)}`,
  })))
}

export async function runAI(
  feature: Feature,
  text: string,
  options: AnalysisOptions = {}
) {
  const apiKey = process.env.OPENAI_API_KEY?.trim()

  if (!apiKey) {
    return { result: demoResult(feature, text, options), demoMode: true }
  }

  const model = process.env.OPENAI_MODEL ?? 'gemini-3.5-flash-lite'

  const instructions = [
    prompts[feature],
    feature === 'summarize' && options.summaryMode
      ? `Use this summary style: ${options.summaryMode}.`
      : '',
    feature === 'quiz' && options.quizMode
      ? `Use this quiz style: ${options.quizMode}.`
      : '',
  ].filter(Boolean).join('\n')

  const response = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/interactions',
    {
      method: 'POST',
      headers: {
        'x-goog-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        system_instruction: instructions,
        input: text,
      }),
      signal: AbortSignal.timeout(60000),
    }
  )

  if (!response.ok) {
    const detail = await response.text()
    console.error(`Gemini API error ${response.status}: ${detail}`)
    throw new Error(`Gemini API returned ${response.status}. Please try again.`)
  }



const payload: any = await response.json()

const result = (payload.steps ?? [])
  .filter((step: any) => step.type === 'model_output')
  .flatMap((step: any) => step.content ?? [])
  .filter((part: any) => part.type === 'text')
  .map((part: any) => part.text ?? '')
  .join('\n')
  .trim()
  
  if (!result) {
    throw new Error('Gemini returned an empty response.')
  }

  return { result, demoMode: false }
}