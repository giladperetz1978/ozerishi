import { useEffect, useState } from 'react'
import { Bell, CalendarDays, Check, ChevronLeft, Clock3, MapPin, Mic, MoreHorizontal, ShoppingCart, Sparkles, Volume2, Waves } from 'lucide-react'
import './App.css'

type AssistantData = { answer?: string; tasks: { title?: string; dueAt?: string | null; source?: string }[]; meetings: { title?: string; start?: string; end?: string | null; location?: string | null }[] }

function App() {
  const nativeWindow = window as Window & { AndroidSpeech?: { start: () => void; stop?: () => void; scheduleReminder?: (title: string, triggerAtMillis: number) => void; openWaze?: (destination: string) => void; hasMailAccess?: () => boolean; requestMailAccess?: () => void; getMailNotifications?: () => string }; receiveNativeSpeechState?: (state: string) => void; receiveNativeSpeech?: (text: string) => void; receiveNativeSpeechError?: (text: string) => void }
  const apiUrl = import.meta.env.VITE_API_URL || (nativeWindow.AndroidSpeech ? 'https://ozerishi.144.91.96.77.sslip.io' : 'http://localhost:8787')
  const [activeTab, setActiveTab] = useState('היום')
  const [activeView, setActiveView] = useState<'היום' | 'קניות' | 'Waze' | 'מתוזמנות'>('היום')
  const [isListening, setIsListening] = useState(false)
  const [voiceStatus, setVoiceStatus] = useState('')
  const [shoppingItems, setShoppingItems] = useState<string[]>(() => JSON.parse(localStorage.getItem('ozerishi-shopping') || '[]'))
  const [wazeDestinations, setWazeDestinations] = useState<string[]>(() => JSON.parse(localStorage.getItem('ozerishi-waze') || '[]'))
  const [scheduledReminders, setScheduledReminders] = useState<{ text: string; when: string }[]>([])
  const [aiTasks, setAiTasks] = useState<AssistantData['tasks']>([])
  const [aiMeetings, setAiMeetings] = useState<AssistantData['meetings']>([])
  useEffect(() => localStorage.setItem('ozerishi-shopping', JSON.stringify(shoppingItems)), [shoppingItems])
  useEffect(() => localStorage.setItem('ozerishi-waze', JSON.stringify(wazeDestinations)), [wazeDestinations])
  const applyAssistantData = (data: AssistantData) => {
    setAiTasks(data.tasks || [])
    setAiMeetings(data.meetings || [])
    data.tasks?.forEach((task) => { if (task.dueAt) nativeWindow.AndroidSpeech?.scheduleReminder?.(task.title || 'משימה מ־Outlook', new Date(task.dueAt).getTime()) })
    return data.answer || 'לא התקבלה תשובה.'
  }
  const scanMailNotifications = async (question = 'מה מחכה לי היום?') => {
    const bridge = nativeWindow.AndroidSpeech
    if (!bridge?.getMailNotifications) { setVoiceStatus('סריקת התראות Outlook זמינה באפליקציה בטלפון'); return }
    if (bridge.hasMailAccess && !bridge.hasMailAccess()) {
      setVoiceStatus('הפעל גישה להתראות עבור OZERISHI, ואז לחץ שוב על הסריקה')
      bridge.requestMailAccess?.()
      return
    }
    const mails = JSON.parse(bridge.getMailNotifications() || '[]')
    if (!mails.length) { setVoiceStatus('עדיין לא נקלטו מיילים מ־Outlook'); return }
    setVoiceStatus('סורק את המיילים...')
    const response = await fetch(`${apiUrl}/api/analyze`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mails, question }) })
    const data = await response.json()
    const answer = response.ok ? applyAssistantData(data) : 'לא הצלחתי לנתח את המיילים.'
    setVoiceStatus(answer)
    window.speechSynthesis?.speak(new SpeechSynthesisUtterance(answer))
  }
  const openWaze = (destination: string) => {
    const target = destination.trim()
    if (!target) return
    setWazeDestinations((current) => [target, ...current.filter((item) => item !== target)])
    if (nativeWindow.AndroidSpeech?.openWaze) nativeWindow.AndroidSpeech.openWaze(target)
    else window.location.href = `https://waze.com/ul?q=${encodeURIComponent(target)}&navigate=yes`
  }
  const scheduleReminderWithGemini = async (reminderText: string) => {
    setVoiceStatus('מבין את מועד התזכורת...')
    try {
      const response = await fetch(`${apiUrl}/api/reminder`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: reminderText, now: new Date().toISOString(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'לא הצלחתי לעבד את הבקשה')
      if (data.isReminder === false) return false
      if (!data.dueAt || !data.title) throw new Error('לא הצלחתי להבין את זמן התזכורת')
      const dueAt = new Date(data.dueAt)
      if (Number.isNaN(dueAt.getTime()) || dueAt.getTime() <= Date.now()) throw new Error('Gemini החזיר זמן תזכורת שאינו בעתיד')
      const when = dueAt.toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })
      setScheduledReminders((current) => [...current, { text: data.title, when }])
      nativeWindow.AndroidSpeech?.scheduleReminder?.(data.title, dueAt.getTime())
      setActiveView('מתוזמנות')
      setVoiceStatus(data.answer || `התזכורת נקבעה ל־${when}`)
      window.speechSynthesis?.speak(new SpeechSynthesisUtterance(data.answer || `התזכורת נקבעה ל־${when}`))
      return true
    } catch (error) {
      const message = error instanceof TypeError
        ? 'שרת Gemini אינו נגיש. יש להפעיל את server על המחשב ולוודא שהטלפון מחובר לאותה רשת Wi-Fi.'
        : error instanceof Error ? error.message : 'לא הצלחתי לקבוע את התזכורת'
      setVoiceStatus(message)
      return true
    }
  }
  const handleVoiceCommand = (rawText: string) => {
    const text = rawText.trim().replace(/[.!?,;:]+/g, ' ')
    const wazeMatch = text.match(/(?:waze|wase|wazee|ways|wazeh|ווייז|וייז|וויז|ויז|navigate|ניווט)\s*(?:ל|אל)?\s*(.*)$/i)
    if (wazeMatch) {
      const destination = wazeMatch[1].trim()
      setActiveView('Waze')
      if (destination) openWaze(destination)
      else setVoiceStatus('אמור יעד לניווט, למשל: Waze לעזריאלי תל אביב')
      return true
    }
    const shoppingMatch = text.match(/^(?:(?:תוסיף|תוסיפי|שמור|שמרי|תרשום|תרשמי)\s+)?(?:ל?רשימת(?:\s+ה)?\s*קניות|רשימה\s+קניות|ל?קניות|shopping)\s*(.*)$/i)
    const reverseShoppingMatch = text.match(/^(.+?)\s+(?:ל?רשימת(?:\s+ה)?\s*קניות|רשימה\s+קניות|ל?קניות|shopping)$/i)
    if (shoppingMatch || reverseShoppingMatch) {
      const itemText = (shoppingMatch ? shoppingMatch[1] : reverseShoppingMatch?.[1] || '').trim()
      const items = itemText.split(/\s+(?:פלוס|פלאס|plus|\+)\s+/i).map((item) => item.trim()).filter(Boolean)
      setActiveView('קניות')
      if (items.length) setShoppingItems((current) => [...current, ...items])
      setVoiceStatus(items.length ? `נוספו ${items.length} פריטים לרשימת הקניות` : 'מצב רשימת קניות פעיל. אמור פריטים, ובין פריט לפריט אמור פלוס')
      return true
    }
    const reminderMatch = text.match(/^(?:תזכיר לי|תזכורת|תזכרי לי|תזכור לי|שלא אשכח|remind me)\s*(.*)$/i)
    if (reminderMatch) {
      const reminderText = reminderMatch[1].trim()
      void scheduleReminderWithGemini(reminderText || text)
      return true
    }
    return false
  }
  const askAssistant = () => {
    const nativeSpeech = nativeWindow.AndroidSpeech
    if (nativeSpeech) {
      if (isListening) {
        nativeSpeech.stop?.()
        setVoiceStatus('מעבד את מה שאמרת...')
        return
      }
      nativeWindow.receiveNativeSpeechState = (state) => { setIsListening(state === 'listening') }
      nativeWindow.receiveNativeSpeechError = (message) => { setIsListening(false); setVoiceStatus(message) }
      nativeWindow.receiveNativeSpeech = async (question) => {
        setIsListening(false)
        if (handleVoiceCommand(question)) return
        const interpretedAsReminder = await scheduleReminderWithGemini(question)
        if (interpretedAsReminder) return
        setVoiceStatus('בודק את היום שלך...')
        const response = await fetch(`${apiUrl}/api/assistant`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question }) })
        const data = await response.json()
        const answer = response.ok ? applyAssistantData(data) : 'חבר קודם את חשבון Outlook שלך.'
        setVoiceStatus(answer)
        window.speechSynthesis?.speak(new SpeechSynthesisUtterance(answer))
      }
      setIsListening(true)
      setVoiceStatus('מקשיב...')
      nativeSpeech.start()
      return
    }
    const SpeechRecognition = (window as Window & { SpeechRecognition?: new () => { lang: string; start: () => void; onstart: () => void; onend: () => void; onerror: () => void; onresult: (event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void } }).SpeechRecognition || (window as Window & { webkitSpeechRecognition?: new () => any }).webkitSpeechRecognition
    if (!SpeechRecognition) { setVoiceStatus('הדפדפן אינו תומך בהקלטה'); return }
    const recognition = new SpeechRecognition()
    recognition.lang = 'he-IL'
    recognition.onstart = () => { setIsListening(true); setVoiceStatus('מקשיב...') }
    recognition.onend = () => setIsListening(false)
    recognition.onerror = () => { setIsListening(false); setVoiceStatus('לא הצלחתי לשמוע, נסה שוב') }
    recognition.onresult = async (event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => {
      const question = event.results[0][0].transcript
      if (handleVoiceCommand(question)) {
        window.speechSynthesis?.speak(new SpeechSynthesisUtterance(voiceStatus))
        return
      }
      const interpretedAsReminder = await scheduleReminderWithGemini(question)
      if (interpretedAsReminder) return
      setVoiceStatus('בודק את היום שלך...')
      const response = await fetch(`${apiUrl}/api/assistant`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question }) })
      const data = await response.json()
      const answer = response.ok ? applyAssistantData(data) : 'חבר קודם את חשבון Outlook שלך.'
      setVoiceStatus(answer)
      window.speechSynthesis?.speak(new SpeechSynthesisUtterance(answer))
    }
    recognition.start()
  }

  return (
    <main className="app-shell" dir="rtl">
      <header className="topbar"><div className="brand-mark"><Sparkles size={18} /><span>תזכירי לי</span></div><div className="topbar-actions"><button className="icon-button" aria-label="התראות"><Bell size={19} /><i /></button><button className="avatar" aria-label="הפרופיל שלך">ג</button></div></header>
      <section className="welcome-row"><div><p className="eyebrow">{new Date().toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p><h1>בוקר טוב, גילעד</h1></div><button className="more-button" aria-label="אפשרויות נוספות"><MoreHorizontal size={22} /></button></section>
      <section className="assistant-card"><div className="assistant-orbit"><Waves size={28} /></div><div className="assistant-copy"><span className="status-pill"><i /> העוזר שלך מוכן</span><h2>מה תרצה לדעת?</h2><p>שאל אותי על היום שלך, ואני אמצא את התשובה.</p><button className="scan-button" onClick={() => scanMailNotifications()}>סרוק התראות Outlook</button>{voiceStatus && <span className="voice-status">{voiceStatus}</span>}</div><button className={`mic-button ${isListening ? 'listening' : ''}`} onClick={askAssistant} aria-label={isListening ? 'עצור והשתמש בדיבור' : 'שאל את העוזר'}><Mic size={25} /></button></section>
      <nav className="day-tabs" aria-label="ניווט לפי יום">{['היום', 'מחר', 'השבוע'].map((tab) => <button key={tab} className={activeTab === tab ? 'active' : ''} onClick={() => { setActiveTab(tab); setActiveView('היום') }}>{tab}</button>)}</nav>
      <nav className="feature-tabs" aria-label="אזורי האפליקציה">
        {(['היום', 'קניות', 'Waze', 'מתוזמנות'] as const).map((view) => <button key={view} className={activeView === view ? 'active' : ''} onClick={() => setActiveView(view)}>{view === 'מתוזמנות' ? 'תזכורות מתוזמנות' : view}</button>)}
      </nav>
      {activeView === 'היום' && aiTasks.length === 0 && aiMeetings.length === 0 && <section className="empty-state"><h2>אין עדיין נתוני יום</h2><p>סרוק התראות Outlook או אמור לי מה תרצה שאזכיר לך.</p></section>}
      {activeView === 'היום' && (aiTasks.length > 0 || aiMeetings.length > 0) && <section className="ai-insights"><h2>נמצא ב־Outlook</h2>{aiMeetings.map((meeting, index) => <div className="insight-row" key={`meeting-${index}`}><CalendarDays size={16} /><span>{meeting.title || 'פגישה'}<small>{meeting.start ? new Date(meeting.start).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' }) : 'זמן לא צוין'}</small></span></div>)}{aiTasks.map((task, index) => <div className="insight-row" key={`task-${index}`}><Check size={16} /><span>{task.title || 'משימה'}<small>{task.source || 'מתוך מייל'}</small></span></div>)}</section>}
      {activeView === 'קניות' && <section className="feature-panel"><h2>רשימת הקניות</h2><p className="panel-hint">אמור: קניות חלב פלוס לחם</p>{shoppingItems.length ? shoppingItems.map((item, index) => <button className="list-row" key={`${item}-${index}`} onClick={() => setShoppingItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}><ShoppingCart size={16} />{item}<Check size={15} /></button>) : <p className="empty-state">הרשימה ריקה כרגע</p>}</section>}
      {activeView === 'Waze' && <section className="feature-panel"><h2>יעדי Waze</h2><p className="panel-hint">אמור: Waze ליעד, והניווט ייפתח</p>{wazeDestinations.length ? wazeDestinations.map((destination) => <button className="list-row" key={destination} onClick={() => openWaze(destination)}><MapPin size={16} />{destination}<ChevronLeft size={15} /></button>) : <p className="empty-state">עדיין לא נבחר יעד</p>}</section>}
      {activeView === 'מתוזמנות' && <section className="feature-panel"><h2>תזכורות מתוזמנות</h2><p className="panel-hint">אמור: תזכיר לי להתקשר לדנה ב־18:00</p>{scheduledReminders.length ? scheduledReminders.map((reminder, index) => <div className="list-row" key={`${reminder.text}-${index}`}><Clock3 size={16} /><span>{reminder.text}<small>{reminder.when}</small></span><button aria-label="מחק תזכורת" onClick={() => setScheduledReminders((current) => current.filter((_, itemIndex) => itemIndex !== index))}>×</button></div>) : <p className="empty-state">אין תזכורות מתוזמנות</p>}</section>}
      <section className="quick-actions"><button onClick={() => setActiveView('קניות')}><ShoppingCart size={18} /><span>קניות</span></button><button onClick={() => setActiveView('Waze')}><MapPin size={18} /><span>Waze</span></button><button onClick={() => setActiveView('מתוזמנות')}><Clock3 size={18} /><span>תזכורת</span></button></section><footer className="privacy-note"><Volume2 size={14} /> מחובר לחשבון Outlook בקריאה בלבד <span>·</span> מופעל על ידי Gemini</footer>
    </main>
  )
}

export default App
