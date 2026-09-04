import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getGeminiKey } from './vault.js'

const root = path.dirname(fileURLToPath(import.meta.url))
const port = Number(process.env.PORT || 8787)
const tenant = process.env.MICROSOFT_TENANT_ID || 'common'
const graphBase = 'https://graph.microsoft.com/v1.0'
const tokenFile = path.join(root, 'data', 'microsoft-token.json')
const sessions = new Map()

const json = (res, status, payload) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*' })
  res.end(JSON.stringify(payload))
}

const readBody = (req) => new Promise((resolve, reject) => {
  let raw = ''
  req.on('data', (chunk) => { raw += chunk; if (raw.length > 100_000) reject(new Error('Request too large')) })
  req.on('end', () => { try { resolve(JSON.parse(raw || '{}')) } catch { reject(new Error('Invalid JSON')) } })
  req.on('error', reject)
})

const microsoftConfig = () => ({
  clientId: process.env.MICROSOFT_CLIENT_ID,
  clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
  redirectUri: process.env.MICROSOFT_REDIRECT_URI,
})

async function saveToken(token) {
  await fs.mkdir(path.dirname(tokenFile), { recursive: true })
  await fs.writeFile(tokenFile, JSON.stringify(token), { mode: 0o600 })
}

const withTokenExpiry = (token) => ({ ...token, expires_at: Date.now() + (Number(token.expires_in || 3600) * 1000) })

async function loadToken() {
  try { return JSON.parse(await fs.readFile(tokenFile, 'utf8')) } catch { return null }
}

async function getValidAccessToken() {
  const token = await loadToken()
  if (!token?.access_token) return null
  if (token.expires_at && token.expires_at > Date.now() + 60_000) return token.access_token
  if (!token.refresh_token) return token.access_token
  const config = microsoftConfig()
  const response = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, refresh_token: token.refresh_token, grant_type: 'refresh_token', scope: 'openid profile offline_access User.Read Mail.Read Calendars.Read' }),
  })
  if (!response.ok) throw new Error('Microsoft session expired; connect Outlook again')
  const refreshed = withTokenExpiry(await response.json())
  await saveToken({ ...token, ...refreshed, refresh_token: refreshed.refresh_token || token.refresh_token })
  return refreshed.access_token
}

async function graph(pathname, accessToken) {
  const response = await fetch(`${graphBase}${pathname}`, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!response.ok) throw new Error(`Microsoft Graph returned ${response.status}`)
  return response.json()
}

async function gemini(prompt) {
  const apiKey = await getGeminiKey()
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured')
  const model = process.env.GEMINI_MODEL || 'gemini-3.7-flash'
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  })
  if (!response.ok) throw new Error(`Gemini returned ${response.status}`)
  const data = await response.json()
  return data.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('').trim() || ''
}

function parseAssistantPayload(raw) {
  try {
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim()
    const parsed = JSON.parse(cleaned)
    return {
      answer: String(parsed.answer || ''),
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
      meetings: Array.isArray(parsed.meetings) ? parsed.meetings : [],
    }
  } catch {
    return { answer: raw, tasks: [], meetings: [] }
  }
}

function parseReminderPayload(raw) {
  try {
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim()
    const parsed = JSON.parse(cleaned)
    const dueAt = new Date(parsed.dueAt)
    if (!String(parsed.title || '').trim() || Number.isNaN(dueAt.getTime())) throw new Error('Invalid reminder payload')
    return { title: String(parsed.title).trim(), dueAt: dueAt.toISOString(), answer: String(parsed.answer || 'התזכורת נקבעה.') }
  } catch {
    throw new Error('Gemini returned an invalid reminder schedule')
  }
}

async function parseReminder(text, now, timeZone) {
  const raw = await gemini(`אתה מתזמן תזכורות בעברית. המר את המשפט החופשי לתזכורת אחת. השעה הנוכחית היא ${now} ואזור הזמן של המשתמש הוא ${timeZone || 'Asia/Jerusalem'}. הבן ביטויים כמו "מחר ב־8 בבוקר", "עוד דקה", "בעוד שעתיים", ו"בשישי לאוקטובר". אם נאמר תאריך בלי שעה, קבע 09:00 בבוקר באותו תאריך. אם נאמר רק יום בשבוע, בחר את המופע הקרוב של היום הזה. החזר JSON בלבד במבנה: {"title":"נוסח קצר של התזכורת בלי מילות הזמן","dueAt":"ISO-8601 כולל אזור הזמן","answer":"אישור קצר בעברית עם התאריך והשעה"}. אל תוסיף הסברים ואל תשתמש ב-Markdown. המשפט: ${text}`)
  return parseReminderPayload(raw)
}

async function assistantAnswer(question) {
  const accessToken = await getValidAccessToken()
  if (!accessToken) throw new Error('Connect Microsoft first')
  const now = new Date()
  const later = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  const [mail, calendar] = await Promise.all([
    graph('/me/mailFolders/inbox/messages?$top=20&$select=subject,from,receivedDateTime,bodyPreview,isRead', accessToken),
    graph(`/me/calendarView?startDateTime=${encodeURIComponent(now.toISOString())}&endDateTime=${encodeURIComponent(later.toISOString())}&$select=subject,start,end,location,organizer`, accessToken),
  ])
  const raw = await gemini(`אתה עוזר עבודה אישי. ענה בעברית קצרה וברורה על השאלה, והבן מתוך המיילים משימות שממתינות למשתמש. השתמש רק במידע שסופק, אל תמציא. החזר JSON בלבד במבנה הבא: {"answer":"תשובה קצרה בעברית","tasks":[{"title":"שם המשימה","dueAt":"ISO-8601 או null","source":"נושא המייל"}],"meetings":[{"title":"שם הפגישה","start":"ISO-8601","end":"ISO-8601 או null","location":"מקום או null"}]}. הוסף משימה רק כאשר יש פעולה ברורה שהמשתמש צריך לבצע. שאלה: ${question}\nמיילים: ${JSON.stringify(mail.value)}\nפגישות ב־24 השעות הקרובות: ${JSON.stringify(calendar.value)}`)
  return parseAssistantPayload(raw)
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`)
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end() }
    if (req.method === 'GET' && url.pathname === '/auth/microsoft') {
      const config = microsoftConfig()
      if (!config.clientId || !config.redirectUri) return json(res, 500, { error: 'Microsoft OAuth is not configured' })
      const state = crypto.randomBytes(24).toString('hex')
      sessions.set(state, Date.now())
      const params = new URLSearchParams({ client_id: config.clientId, response_type: 'code', redirect_uri: config.redirectUri, response_mode: 'query', scope: 'openid profile offline_access User.Read Mail.Read Calendars.Read', state })
      res.writeHead(302, { Location: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?${params}` }); return res.end()
    }
    if (req.method === 'GET' && url.pathname === '/auth/microsoft/callback') {
      const state = url.searchParams.get('state')
      if (!state || !sessions.has(state)) return json(res, 400, { error: 'Invalid OAuth state' })
      sessions.delete(state)
      const config = microsoftConfig()
      const response = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, code: url.searchParams.get('code') || '', redirect_uri: config.redirectUri, grant_type: 'authorization_code' }) })
      if (!response.ok) return json(res, 502, { error: 'Microsoft token exchange failed' })
      await saveToken(withTokenExpiry(await response.json()))
      res.writeHead(302, { Location: process.env.APP_URL || '/' }); return res.end()
    }
    if (req.method === 'GET' && url.pathname === '/api/status') return json(res, 200, { microsoftConnected: Boolean(await loadToken()), geminiModel: process.env.GEMINI_MODEL || 'gemini-3.7-flash', writeAccess: false })
    if (req.method === 'POST' && url.pathname === '/api/assistant') {
      const data = await readBody(req)
      if (!String(data.question || '').trim()) return json(res, 400, { error: 'Question is required' })
      return json(res, 200, await assistantAnswer(String(data.question).trim()))
    }
    if (req.method === 'POST' && url.pathname === '/api/reminder') {
      const data = await readBody(req)
      const text = String(data.text || '').trim()
      if (!text) return json(res, 400, { error: 'Reminder text is required' })
      return json(res, 200, await parseReminder(text, String(data.now || new Date().toISOString()), String(data.timeZone || 'Asia/Jerusalem')))
    }
    if (req.method === 'POST' && url.pathname === '/api/analyze') {
      const data = await readBody(req)
      const mails = Array.isArray(data.mails) ? data.mails.slice(0, 40) : []
      if (!mails.length) return json(res, 400, { error: 'No mail items supplied' })
      const question = String(data.question || 'מה מחכה לי היום?').trim()
      const raw = await gemini(`אתה עוזר עבודה אישי. לפניך מיילים שנקלטו מהתראות Outlook במכשיר. ענה בעברית קצרה, זהה משימות ופגישות, ואל תמציא מידע. החזר JSON בלבד: {"answer":"תשובה קצרה","tasks":[{"title":"שם המשימה","dueAt":"ISO-8601 או null","source":"נושא המייל"}],"meetings":[{"title":"שם הפגישה","start":"ISO-8601","end":null,"location":null}]}. השעה הנוכחית: ${new Date().toISOString()}. שאלה: ${question}\nמיילים: ${JSON.stringify(mails)}`)
      return json(res, 200, parseAssistantPayload(raw))
    }
    if (req.method === 'POST' && url.pathname === '/api/briefing') {
      const accessToken = await getValidAccessToken(); if (!accessToken) return json(res, 401, { error: 'Connect Microsoft first' })
      const [mail, calendar] = await Promise.all([graph('/me/mailFolders/inbox/messages?$top=20&$select=subject,from,receivedDateTime,bodyPreview,isRead', accessToken), graph('/me/calendarView?startDateTime=2026-09-02T00:00:00Z&endDateTime=2026-09-03T00:00:00Z&$select=subject,start,end,location,organizer', accessToken)])
      const answer = await gemini(`אתה עוזר עבודה אישי. נתח את המיילים והפגישות הבאים והחזר תקציר קצר בעברית עם משימות דחופות, פגישות קרובות ודברים שממתינים לתשובה. אל תמציא מידע. מיילים: ${JSON.stringify(mail.value)} פגישות: ${JSON.stringify(calendar.value)}`)
      return json(res, 200, { answer, source: 'Microsoft Graph', model: process.env.GEMINI_MODEL || 'gemini-3.7-flash' })
    }
    return json(res, 404, { error: 'Not found' })
  } catch (error) { return json(res, 500, { error: error.message }) }
})

server.listen(port, '0.0.0.0', () => console.log(`OZERISHI server listening on ${port}`))