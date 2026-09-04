import { useEffect, useState } from 'react'
import { Bell, CalendarDays, Check, ChevronLeft, Clock3, Mail, MapPin, Mic, MoreHorizontal, ShoppingCart, Sparkles, Volume2, Waves, Zap } from 'lucide-react'
import './App.css'

type AssistantData = { answer?: string; tasks: { title?: string; dueAt?: string | null; source?: string }[]; meetings: { title?: string; start?: string; end?: string | null; location?: string | null }[] }

function App() {
  const nativeWindow = window as Window & { AndroidSpeech?: { start: () => void; stop?: () => void; scheduleReminder?: (title: string, triggerAtMillis: number) => void; openWaze?: (destination: string) => void; hasMailAccess?: () => boolean; requestMailAccess?: () => void; getMailNotifications?: () => string }; receiveNativeSpeechState?: (state: string) => void; receiveNativeSpeech?: (text: string) => void; receiveNativeSpeechError?: (text: string) => void }
  const apiUrl = import.meta.env.VITE_API_URL || (nativeWindow.AndroidSpeech ? 'http://192.168.1.249:8787' : 'http://localhost:8787')
  const [activeTab, setActiveTab] = useState('היום')
  const [activeView, setActiveView] = useState<'היום' | 'קניות' | 'Waze' | 'מתוזמנות'>('היום')
  const [isListening, setIsListening] = useState(false)
  const [completed, setCompleted] = useState<number[]>([])
  const [voiceStatus, setVoiceStatus] = useState('')
  const [shoppingItems, setShoppingItems] = useState<string[]>(() => JSON.parse(localStorage.getItem('ozerishi-shopping') || '[]'))
  const [wazeDestinations, setWazeDestinations] = useState<string[]>(() => JSON.parse(localStorage.getItem('ozerishi-waze') || '[]'))
  const [scheduledReminders, setScheduledReminders] = useState<{ text: string; when: string }[]>(() => JSON.parse(localStorage.getItem('ozerishi-scheduled') || '[]'))
  const [aiTasks, setAiTasks] = useState<AssistantData['tasks']>([])
  const [aiMeetings, setAiMeetings] = useState<AssistantData['meetings']>([])
  useEffect(() => localStorage.setItem('ozerishi-shopping', JSON.stringify(shoppingItems)), [shoppingItems])
  useEffect(() => localStorage.setItem('ozerishi-waze', JSON.stringify(wazeDestinations)), [wazeDestinations])
  useEffect(() => localStorage.setItem('ozerishi-scheduled', JSON.stringify(scheduledReminders)), [scheduledReminders])
  const toggleTask = (id: number) => setCompleted((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
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
    const reminderMatch = text.match(/^(?:תזכיר לי|תזכורת|remind me)\s+(.+)$/i)
    if (reminderMatch) {
      const reminderText = reminderMatch[1].trim()
      const timeMatch = reminderText.match(/\s+ב(?:שעה)?[־-]?\s*(\d{1,2}(?::\d{2})?)(?:\s*(.*))?$/i)
      const relativeMatch = reminderText.match(/\s+(בעוד|עוד)\s+(?:(\d+)\s*)?(שניות?|שניה|דקות?|דקה|שעות?|שעה|ימים?|יום)\s*$/i)
      const relativeAmount = relativeMatch ? Number(relativeMatch[2] || 1) : 0
      const relativeUnit = relativeMatch?.[3].toLowerCase()
      const when = timeMatch ? timeMatch[1] : relativeMatch ? `${relativeMatch[1]} ${relativeAmount} ${relativeUnit}` : 'ללא שעה'
      const cleanText = timeMatch ? (timeMatch[2] || 'תזכורת').trim() : relativeMatch ? reminderText.slice(0, relativeMatch.index).trim() : reminderText
      setScheduledReminders((current) => [...current, { text: cleanText, when }])
      if (timeMatch) {
        const [hours, minutes = '0'] = timeMatch[1].split(':')
        const due = new Date()
        due.setHours(Number(hours), Number(minutes), 0, 0)
        if (due.getTime() <= Date.now()) due.setDate(due.getDate() + 1)
        nativeWindow.AndroidSpeech?.scheduleReminder?.(cleanText, due.getTime())
      } else if (relativeMatch) {
        const unitMilliseconds = relativeUnit?.startsWith('שנ') ? 1000 : relativeUnit?.startsWith('דק') ? 60_000 : relativeUnit?.startsWith('שע') ? 3_600_000 : 86_400_000
        nativeWindow.AndroidSpeech?.scheduleReminder?.(cleanText, Date.now() + relativeAmount * unitMilliseconds)
      }
      setActiveView('מתוזמנות')
      setVoiceStatus(`התזכורת נקבעה${when === 'ללא שעה' ? '' : ` לשעה ${when}`}`)
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
      <section className="welcome-row"><div><p className="eyebrow">יום שלישי, 1 בספטמבר 2026</p><h1>בוקר טוב, גילעד</h1></div><button className="more-button" aria-label="אפשרויות נוספות"><MoreHorizontal size={22} /></button></section>
      <section className="assistant-card"><div className="assistant-orbit"><Waves size={28} /></div><div className="assistant-copy"><span className="status-pill"><i /> העוזר שלך מוכן</span><h2>מה תרצה לדעת?</h2><p>שאל אותי על היום שלך, ואני אמצא את התשובה.</p><button className="scan-button" onClick={() => scanMailNotifications()}>סרוק התראות Outlook</button>{voiceStatus && <span className="voice-status">{voiceStatus}</span>}</div><button className={`mic-button ${isListening ? 'listening' : ''}`} onClick={askAssistant} aria-label={isListening ? 'עצור והשתמש בדיבור' : 'שאל את העוזר'}><Mic size={25} /></button></section>
      <nav className="day-tabs" aria-label="ניווט לפי יום">{['היום', 'מחר', 'השבוע'].map((tab) => <button key={tab} className={activeTab === tab ? 'active' : ''} onClick={() => { setActiveTab(tab); setActiveView('היום') }}>{tab}</button>)}</nav>
      <nav className="feature-tabs" aria-label="אזורי האפליקציה">
        {(['היום', 'קניות', 'Waze', 'מתוזמנות'] as const).map((view) => <button key={view} className={activeView === view ? 'active' : ''} onClick={() => setActiveView(view)}>{view === 'מתוזמנות' ? 'תזכורות מתוזמנות' : view}</button>)}
      </nav>
      <section className="summary-strip"><div><strong>4</strong><span>משימות להיום</span></div><div><strong>2</strong><span>פגישות</span></div><div><strong>1</strong><span>דורש תשובה</span></div></section>
      <section className="section-heading"><div><span className="section-kicker">הלו״ז שלך</span><h2>{activeTab === 'היום' ? 'מה מחכה לך היום' : activeTab === 'מחר' ? 'מחר בקצרה' : 'השבוע שלך'}</h2></div><button className="text-button">הכול <ChevronLeft size={16} /></button></section>
      {activeView === 'היום' && <div className="timeline">
        <article className={`timeline-item ${completed.includes(1) ? 'done' : ''}`}><div className="time">09:30</div><div className="timeline-line"><span className="dot blue" /></div><div className="item-body"><div className="item-top"><span className="type-label meeting"><CalendarDays size={14} /> פגישה</span><button onClick={() => toggleTask(1)} className="check-button" aria-label="סמן כבוצע"><Check size={15} /></button></div><h3>ישיבת צוות מוצר</h3><p><Clock3 size={14} /> 45 דקות <span>·</span> חדר ישיבות 2</p></div></article>
        <article className={`timeline-item ${completed.includes(2) ? 'done' : ''}`}><div className="time">11:15</div><div className="timeline-line"><span className="dot orange" /></div><div className="item-body"><div className="item-top"><span className="type-label urgent"><Mail size={14} /> דורש תשובה</span><button onClick={() => toggleTask(2)} className="check-button" aria-label="סמן כבוצע"><Check size={15} /></button></div><h3>לחזור לדנה לגבי הצעת המחיר</h3><p>זוהה מתוך: “הצעת מחיר מעודכנת”</p></div></article>
        <article className={`timeline-item ${completed.includes(3) ? 'done' : ''}`}><div className="time">13:00</div><div className="timeline-line"><span className="dot green" /></div><div className="item-body"><div className="item-top"><span className="type-label personal"><Zap size={14} /> משימה אישית</span><button onClick={() => toggleTask(3)} className="check-button" aria-label="סמן כבוצע"><Check size={15} /></button></div><h3>לאסוף את החבילה מהדואר</h3><p><MapPin size={14} /> בדרך הביתה</p></div></article>
      </div>}
      {activeView === 'היום' && (aiTasks.length > 0 || aiMeetings.length > 0) && <section className="ai-insights"><h2>נמצא ב־Outlook</h2>{aiMeetings.map((meeting, index) => <div className="insight-row" key={`meeting-${index}`}><CalendarDays size={16} /><span>{meeting.title || 'פגישה'}<small>{meeting.start ? new Date(meeting.start).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' }) : 'זמן לא צוין'}</small></span></div>)}{aiTasks.map((task, index) => <div className="insight-row" key={`task-${index}`}><Check size={16} /><span>{task.title || 'משימה'}<small>{task.source || 'מתוך מייל'}</small></span></div>)}</section>}
      {activeView === 'קניות' && <section className="feature-panel"><h2>רשימת הקניות</h2><p className="panel-hint">אמור: קניות חלב פלוס לחם</p>{shoppingItems.length ? shoppingItems.map((item, index) => <button className="list-row" key={`${item}-${index}`} onClick={() => setShoppingItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}><ShoppingCart size={16} />{item}<Check size={15} /></button>) : <p className="empty-state">הרשימה ריקה כרגע</p>}</section>}
      {activeView === 'Waze' && <section className="feature-panel"><h2>יעדי Waze</h2><p className="panel-hint">אמור: Waze ליעד, והניווט ייפתח</p>{wazeDestinations.length ? wazeDestinations.map((destination) => <button className="list-row" key={destination} onClick={() => openWaze(destination)}><MapPin size={16} />{destination}<ChevronLeft size={15} /></button>) : <p className="empty-state">עדיין לא נבחר יעד</p>}</section>}
      {activeView === 'מתוזמנות' && <section className="feature-panel"><h2>תזכורות מתוזמנות</h2><p className="panel-hint">אמור: תזכיר לי להתקשר לדנה ב־18:00</p>{scheduledReminders.length ? scheduledReminders.map((reminder, index) => <div className="list-row" key={`${reminder.text}-${index}`}><Clock3 size={16} /><span>{reminder.text}<small>{reminder.when}</small></span><button aria-label="מחק תזכורת" onClick={() => setScheduledReminders((current) => current.filter((_, itemIndex) => itemIndex !== index))}>×</button></div>) : <p className="empty-state">אין תזכורות מתוזמנות</p>}</section>}
      <section className="quick-actions"><button onClick={() => setActiveView('קניות')}><ShoppingCart size={18} /><span>קניות</span></button><button onClick={() => setActiveView('Waze')}><MapPin size={18} /><span>Waze</span></button><button onClick={() => setActiveView('מתוזמנות')}><Clock3 size={18} /><span>תזכורת</span></button></section><footer className="privacy-note"><Volume2 size={14} /> מחובר לחשבון Outlook בקריאה בלבד <span>·</span> מופעל על ידי Gemini</footer>
    </main>
  )
}

export default App
