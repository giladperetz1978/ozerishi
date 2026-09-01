import { getGeminiKey } from './vault.js'

const key = await getGeminiKey()
const model = process.env.GEMINI_MODEL || 'gemini-3.7-flash'
if (!key) throw new Error('NO_KEY')
const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
  body: JSON.stringify({ contents: [{ parts: [{ text: 'Reply with exactly: OK' }] }] }),
})
if (!response.ok) {
  const body = await response.text()
  console.log(`GEMINI_FAILED status=${response.status} detail=${body.slice(0, 240).replace(/\s+/g, ' ')}`)
  process.exit(1)
}
const data = await response.json()
const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('').trim()
console.log(`GEMINI_OK model=${model} response=${text || 'empty'}`)
