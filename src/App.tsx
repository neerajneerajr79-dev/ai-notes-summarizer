import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, Brain, Check,
  ChevronDown, CircleHelp, FileText, FolderOpen, Layers3, LoaderCircle, LockKeyhole, Menu, MessageCircle, MoreHorizontal,
  PanelLeftClose, Plus, Search, Settings2, Sparkles, Target, Upload,
  WandSparkles, X, Zap,
} from 'lucide-react'
import { analyze, authenticateAccount, getCurrentUser, getHealth, loadAccountData, logoutAccount, saveNotes, savePreferences, saveProfile, saveTasks, uploadDocument, type Feature } from './lib/api'
import { readStore, writeStore, type Note, type Task, type User } from './lib/storage'
import './App.css'

type View = 'overview' | 'summarizer' | 'chat' | 'flashcards' | 'quiz' | 'planner' | 'library' | 'settings'

const navigation: { id: View; label: string; icon: typeof Brain; section?: string }[] = [
  { id: 'overview', label: 'Overview', icon: Layers3, section: 'WORKSPACE' },
  { id: 'summarizer', label: 'AI Summarizer', icon: WandSparkles },
  { id: 'chat', label: 'Learning Chat', icon: MessageCircle },
  { id: 'flashcards', label: 'Flashcards', icon: BookOpen },
  { id: 'quiz', label: 'Quiz generator', icon: CircleHelp },
  { id: 'planner', label: 'Study planner', icon: Target, section: 'PERSONAL' },
  { id: 'library', label: 'Notes library', icon: FolderOpen },
  { id: 'settings', label: 'Settings', icon: Settings2 },
]

const featureCopy: Record<Feature, { title: string; eyebrow: string; action: string; placeholder: string }> = {
  summarize: { title: 'Turn long notes into clear ideas.', eyebrow: 'AI SUMMARIZER', action: 'Summarize notes', placeholder: 'Paste your lecture notes, reading material, or study guide here...' },
  chat: { title: 'Ask your notes anything.', eyebrow: 'LEARNING CHAT', action: 'Ask Mindora', placeholder: 'What would you like to understand better?' },
  flashcards: { title: 'Remember more, in less time.', eyebrow: 'FLASHCARD STUDIO', action: 'Generate flashcards', placeholder: 'Add notes or a topic to create a focused flashcard set...' },
  quiz: { title: 'Make sure it really sticks.', eyebrow: 'QUIZ BUILDER', action: 'Build my quiz', placeholder: 'Paste study material or tell us what you are learning...' },
  planner: { title: 'A study plan that fits your life.', eyebrow: 'STUDY PLANNER', action: 'Create my plan', placeholder: 'What are you studying, and when is your goal or exam?' },
}

function readJson<T>(value: string, fallback: T): T {
  const normalized = value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  try { return JSON.parse(normalized) as T } catch { return fallback }
}

function App() {
  const [authUser, setAuthUser] = useState<User | null>(null)
  const [authLoaded, setAuthLoaded] = useState(false)
  const [authStage, setAuthStage] = useState<'landing' | 'login' | 'register'>('landing')
  const [active, setActive] = useState<View>('overview')
  const [mobileNav, setMobileNav] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [notes, setNotes] = useState<Note[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [accountStats, setAccountStats] = useState({ summaries: 0, flashcardSets: 0, quizzes: 0, weeklyActivity: [] as { day: string; weekday: number; count: number }[] })
  const [preferences, setPreferences] = useState<Record<string, unknown>>({})
  const [theme, setTheme] = useState<'dark' | 'light'>(() => readStore<'dark' | 'light'>('mindora-theme', 'dark'))
  const [notice, setNotice] = useState('')
  const [demoMode, setDemoMode] = useState(true)
  const [apiReady, setApiReady] = useState(false)
  const [dismissDemo, setDismissDemo] = useState(false)
  const [todayLabel, setTodayLabel] = useState('')
  const [query, setQuery] = useState('')
  const [openNote, setOpenNote] = useState<Note | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setTodayLabel(new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase())
    }, 0)
    Promise.all([getHealth(), getCurrentUser()])
      .then(([health, user]) => {
        setDemoMode(health.demoMode)
        setApiReady(true)
        setAuthUser(user)
      })
      .catch((error: unknown) => {
        setDemoMode(true)
        setApiReady(false)
        setNotice(error instanceof Error ? error.message : 'The Mindora API is unavailable.')
      })
      .finally(() => setAuthLoaded(true))
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (!authUser) return
    let activeRequest = true
    loadAccountData()
      .then((data) => {
        if (!activeRequest) return
        setNotes(data.notes)
        setTasks(data.tasks)
        setPreferences(data.preferences)
        setAccountStats(data.stats)
        writeStore('mindora-notes', data.notes)
        writeStore('mindora-tasks', data.tasks)
        if (typeof data.preferences.theme === 'string') setTheme(data.preferences.theme === 'light' ? 'light' : 'dark')
      })
      .catch((error: unknown) => setNotice(error instanceof Error ? error.message : 'Could not load your saved study data.'))
    return () => { activeRequest = false }
  }, [authUser])

  const updateNotes = (next: Note[]) => {
    setNotes(next)
    writeStore('mindora-notes', next)
    void saveNotes(next).catch((error: unknown) => setNotice(error instanceof Error ? error.message : 'Your notes could not be saved to the database.'))
  }
  const updateTasks = (next: Task[]) => {
    setTasks(next)
    writeStore('mindora-tasks', next)
    void saveTasks(next).catch((error: unknown) => setNotice(error instanceof Error ? error.message : 'Your tasks could not be saved to the database.'))
  }
  const goTo = (view: View) => { setActive(view); setMobileNav(false) }

  const signIn = async (action: 'login' | 'register' | 'demo', details?: { email: string; password: string; displayName?: string }) => {
    const user = await authenticateAccount(action, details)
    setAuthUser(user)
    setActive('overview')
    setAuthStage('landing')
  }
  const logOut = async () => {
    try {
      await logoutAccount()
      setAuthUser(null)
      setNotes([])
      setTasks([])
      setAccountStats({ summaries: 0, flashcardSets: 0, quizzes: 0, weeklyActivity: [] })
      setAuthStage('landing')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not sign out.')
    }
  }
  const updatePreference = (key: string, value: unknown) => {
    const next = { ...preferences, [key]: value }
    setPreferences(next)
    void savePreferences(next).catch((error: unknown) => setNotice(error instanceof Error ? error.message : 'Your settings could not be saved.'))
  }
  const changeTheme = (next: 'dark' | 'light') => {
    setTheme(next)
    writeStore('mindora-theme', next)
    updatePreference('theme', next)
  }

  if (!authLoaded) return <div className="app-loading"><Brain size={28} /><span>Connecting to your study space…</span></div>
  if (!authUser) {
    if (authStage === 'landing') return <Landing onEnter={() => setAuthStage('register')} onLogin={() => setAuthStage('login')} onDemo={() => void signIn('demo').catch((error: unknown) => setNotice(error instanceof Error ? error.message : 'Could not start demo mode.'))} notice={notice} />
    return <AuthPage mode={authStage} onModeChange={setAuthStage} onSubmit={(details) => signIn(authStage, details)} onDemo={() => signIn('demo')} onBack={() => { setAuthStage('landing'); setNotice('') }} />
  }

  return (
    <div className={`app-shell ${theme === 'light' ? 'theme-light' : ''}`}>
      {notice && <div className="app-notice" role="alert"><span>{notice}</span><button aria-label="Dismiss message" onClick={() => setNotice('')}><X size={14} /></button></div>}
      {mobileNav && <button className="nav-scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}
      <aside className={`sidebar ${collapsed ? 'sidebar-collapsed' : ''} ${mobileNav ? 'sidebar-mobile-open' : ''}`}>
        <button className="brand" onClick={() => goTo('overview')} aria-label="Mindora home">
          <span className="brand-mark"><Brain size={21} strokeWidth={1.8} /></span>
          {!collapsed && <span className="brand-word">mindora<span>ai</span></span>}
        </button>
        <button className="workspace-picker">
          <span className="workspace-avatar">S</span>
          {!collapsed && <span className="workspace-details"><strong>Study space</strong><small>Personal workspace</small></span>}
          {!collapsed && <ChevronDown size={15} className="muted" />}
        </button>
        <div className="sidebar-nav">
          {navigation.map(({ id, label, icon: Icon, section }) => (
            <div key={id}>
              {section && !collapsed && <p className="nav-section">{section}</p>}
              <button onClick={() => goTo(id)} className={`nav-link ${active === id ? 'nav-active' : ''}`} title={collapsed ? label : undefined}>
                <Icon size={18} strokeWidth={1.8} /><span>{label}</span>{id === 'chat' && !collapsed && <span className="nav-new">NEW</span>}
              </button>
            </div>
          ))}
        </div>
        {!collapsed && <div className="sidebar-bottom">
          <div className="upgrade-card"><span className="upgrade-icon"><Sparkles size={16} /></span><strong>Your ideas, amplified.</strong><p>Unlock a more focused way to learn.</p><button onClick={() => goTo('settings')}>Explore plans <ArrowRight size={14} /></button></div>
          <button className="profile-button" onClick={() => void logOut()} title="Sign out"><span className="profile-avatar">{authUser.displayName.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</span><span className="profile-copy"><strong>{authUser.displayName}</strong><small>{authUser.isDemo ? 'Demo account · Sign out' : 'Account · Sign out'}</small></span><MoreHorizontal size={17} className="muted" /></button>
        </div>}
        <button className="collapse-toggle" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}><PanelLeftClose size={17} /></button>
      </aside>

      <main className="main-shell">
        <header className="topbar">
          <div className="topbar-left"><button className="icon-button mobile-menu" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Menu size={19} /></button><div className="breadcrumbs"><span>Workspace</span><span className="crumb-slash">/</span><strong>{navigation.find((item) => item.id === active)?.label}</strong></div></div>
          <div className="topbar-right">
            <div className={`mode-indicator ${demoMode ? 'mode-demo' : ''}`} title={apiReady ? (demoMode ? 'Demo mode active — configure an API key in .env to enable AI' : 'AI connection ready') : 'Checking AI connection'}>
              <span className="mode-dot" />{!apiReady ? 'Connecting' : demoMode ? 'Demo mode' : 'AI ready'}
            </div>
            <button className="top-search" onClick={() => goTo('library')}><Search size={16} /><span>Search notes...</span><kbd>⌘ K</kbd></button>
            <button className="profile-avatar top-avatar" onClick={() => void logOut()} aria-label="Sign out">{authUser.displayName.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</button>
          </div>
        </header>
        <div className="page-content">
          {active === 'overview' && <Overview notes={notes} tasks={tasks} stats={accountStats} userName={authUser.displayName} goTo={goTo} updateTasks={updateTasks} demoMode={demoMode || authUser.isDemo} dismissDemo={dismissDemo} onDismissDemo={() => setDismissDemo(true)} todayLabel={todayLabel} />}
          {(['summarizer', 'chat', 'flashcards', 'quiz', 'planner'] as View[]).includes(active) && <ToolPage key={active} kind={active === 'summarizer' ? 'summarize' : active as Feature} notes={notes} onSaveNote={(note) => updateNotes([note, ...notes])} onAddTask={(title) => updateTasks([{ id: crypto.randomUUID(), title, date: 'Today', done: false }, ...tasks])} />}
          {active === 'library' && <Library notes={notes} setNotes={updateNotes} setOpenNote={setOpenNote} search={query} setSearch={setQuery} />}
          {active === 'settings' && <Settings demoMode={demoMode} preferences={preferences} onPreferenceChange={updatePreference} theme={theme} onThemeChange={changeTheme} user={authUser} onProfileChange={(displayName) => {
            setAuthUser({ ...authUser, displayName })
            void saveProfile(displayName).catch((error: unknown) => setNotice(error instanceof Error ? error.message : 'Your profile could not be saved.'))
          }} />}
        </div>
      </main>
          {openNote && <NoteModal note={openNote} onClose={() => setOpenNote(null)} onSave={(updated) => {
            updateNotes(updated.id === 'new' ? [{ ...updated, id: crypto.randomUUID() }, ...notes] : notes.map((note) => note.id === updated.id ? updated : note))
            setOpenNote(null)
          }} />}
    </div>
  )
}

function Landing({ onEnter, onLogin, onDemo, notice }: { onEnter: () => void; onLogin: () => void; onDemo: () => void; notice: string }) {
  return <main className="landing-page min-h-screen">
    <nav className="landing-nav"><button className="brand"><span className="brand-mark"><Brain size={21} /></span><span className="brand-word">mindora<span>ai</span></span></button><div className="landing-nav-links"><a href="#features">Features</a><a href="#how-it-works">How it works</a><a href="#about">About</a></div><div className="landing-nav-actions"><button className="button button-outline landing-login" onClick={onLogin}>Log in</button><button className="button button-primary landing-start" onClick={onEnter}>Get started</button></div></nav>
    {notice && <div className="landing-notice" role="alert">{notice}</div>}
    <section className="landing-hero">
      <div className="hero-glow" />
      <div className="hero-content">
        <div className="eyebrow-pill"><span className="eyebrow-sparkle"><Sparkles size={13} /></span> YOUR PERSONAL LEARNING UNIVERSE <span className="pill-dot" /></div>
        <h1>Learn smarter.<br /><span className="gradient-text">Remember everything.</span></h1>
        <p className="hero-description">Turn your notes into a superpower. Summarize, explore, and master any subject with an AI study partner that thinks the way you do.</p>
        <div className="hero-actions"><button className="button button-primary hero-cta" onClick={onEnter}>Start learning for free <ArrowRight size={17} /></button><button className="hero-secondary demo-entry" onClick={onDemo}><span className="play-icon">▶</span> Try labeled demo</button></div>
        <div className="hero-social-proof"><div className="avatar-stack"><span>J</span><span>M</span><span>A</span><span>K</span></div><div><div className="proof-stars">★★★★★</div><small>Made for curious minds everywhere</small></div></div>
      </div>
      <div className="hero-art" aria-hidden="true">
        <div className="orbit orbit-one" /><div className="orbit orbit-two" />
        <div className="brain-core"><Brain size={112} strokeWidth={0.9} /></div>
        <div className="float-card float-summary"><div className="mini-card-icon purple"><WandSparkles size={15} /></div><div><small>AI SUMMARY</small><strong>Key ideas, made clear.</strong></div><span className="mini-check"><Check size={12} /></span></div>
        <div className="float-card float-flash"><div className="mini-card-icon blue"><Layers3 size={15} /></div><div><small>FLASHCARDS</small><strong>Ready when you are.</strong></div></div>
        <div className="float-card float-insight"><Sparkles size={14} /><span>3 new insights found</span></div>
        <div className="art-sparkle sparkle-a">✦</div><div className="art-sparkle sparkle-b">✧</div><div className="art-sparkle sparkle-c">·</div>
      </div>
      <div className="hero-bottom-note"><span className="scroll-line" /> SCROLL TO EXPLORE <ArrowDown size={13} /></div>
    </section>
    <section className="landing-strip"><div><strong>ONE NOTE,</strong> INFINITE POSSIBILITIES</div><div className="strip-icons"><span><WandSparkles size={15} /> Summarize</span><span><MessageCircle size={15} /> Explore</span><span><Layers3 size={15} /> Practice</span><span><Target size={15} /> Master</span></div></section>
    <section className="landing-features" id="features"><div className="section-heading"><span className="section-kicker">BUILT FOR THE WAY YOU LEARN</span><h2>Your entire study workflow,<br /><span className="gradient-text">beautifully connected.</span></h2><p>From first read to final review, Mindora turns learning into a flow.</p></div><div className="feature-grid">{[
      { icon: WandSparkles, name: 'Instant summaries', text: 'Find the signal in pages of notes. Get a clear, structured summary in seconds.', color: 'purple', view: 'summarizer' as View },
      { icon: MessageCircle, name: 'Learn with AI', text: 'Ask questions, get explanations, and explore ideas with your notes as context.', color: 'blue', view: 'chat' as View },
      { icon: Layers3, name: 'Active recall', text: 'Generate flashcards and quizzes that make knowledge stick for the long run.', color: 'pink', view: 'flashcards' as View },
    ].map(({ icon: Icon, name, text, color }) => <article className="feature-card" key={name}><span className={`feature-icon ${color}`}><Icon size={19} /></span><h3>{name}</h3><p>{text}</p><ArrowUpRight size={16} className="feature-arrow" /></article>)}</div></section>
    <section className="landing-bottom" id="how-it-works"><div><span className="section-kicker">YOUR NEXT GREAT STUDY SESSION</span><h2>Make room for<br /><span className="gradient-text">the joy of learning.</span></h2></div><button className="button button-primary" onClick={onEnter}>Get started — it’s free <ArrowRight size={16} /></button></section>
    <footer className="landing-footer" id="about"><span className="brand-word">mindora<span>ai</span></span><span>© 2026 Mindora AI. Made for curious minds.</span><span>Learn deeply. Live brightly.</span></footer>
  </main>
}

function AuthPage({ mode, onModeChange, onSubmit, onDemo, onBack }: { mode: 'login' | 'register'; onModeChange: (mode: 'landing' | 'login' | 'register') => void; onSubmit: (details: { email: string; password: string; displayName?: string }) => Promise<void>; onDemo: () => Promise<void>; onBack: () => void }) {
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await onSubmit({ email, password, ...(mode === 'register' ? { displayName } : {}) })
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Authentication failed.')
    } finally {
      setBusy(false)
    }
  }
  const demo = async () => {
    setBusy(true)
    setError('')
    try { await onDemo() } catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'Demo sign in failed.') }
    finally { setBusy(false) }
  }
  return <main className="auth-page"><section className="auth-card">
    <button className="brand auth-brand" onClick={onBack}><span className="brand-mark"><Brain size={21} /></span><span className="brand-word">mindora<span>ai</span></span></button>
    <button className="auth-back" onClick={onBack}><ArrowLeft size={14} /> Back to home</button>
    <span className="auth-emblem"><Sparkles size={18} /></span>
    <p className="section-kicker">{mode === 'register' ? 'YOUR LEARNING JOURNEY STARTS HERE' : 'WELCOME BACK TO YOUR STUDY SPACE'}</p>
    <h1>{mode === 'register' ? 'Create your account' : 'Welcome back'}</h1>
    <p className="auth-subtitle">{mode === 'register' ? 'Save your notes and build a learning habit that lasts.' : 'Sign in to pick up where you left off.'}</p>
    <form className="auth-form" onSubmit={submit}>
      {mode === 'register' && <label>Your name<input autoComplete="name" required maxLength={80} value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Alex Morgan" /></label>}
      <label>Email address<input type="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></label>
      <label>Password<input type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} required minLength={8} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" /></label>
      {error && <p className="auth-error" role="alert">{error}</p>}
      <button className="button button-primary auth-submit" disabled={busy}>{busy ? <LoaderCircle size={15} className="spin" /> : <LockKeyhole size={15} />}{mode === 'register' ? 'Create account' : 'Sign in securely'}</button>
    </form>
    <div className="auth-switch">{mode === 'register' ? 'Already have an account?' : 'New to Mindora?'} <button onClick={() => { setError(''); onModeChange(mode === 'register' ? 'login' : 'register') }}>{mode === 'register' ? 'Log in' : 'Create an account'}</button></div>
    <div className="auth-divider"><span>OR</span></div>
    <button className="demo-login" disabled={busy} onClick={() => void demo()}><Sparkles size={15} /> Continue with clearly labelled demo account</button>
    <p className="auth-security"><LockKeyhole size={12} /> Passwords are securely hashed. Sessions use HTTP-only cookies.</p>
  </section></main>
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="page-heading"><div><p className="section-kicker">{eyebrow}</p><h1>{title}</h1><p className="page-subtitle">{description}</p></div>{action}</div>
}

function Overview({ notes, tasks, stats, userName, goTo, updateTasks, demoMode, dismissDemo, onDismissDemo, todayLabel }: { notes: Note[]; tasks: Task[]; stats: { summaries: number; flashcardSets: number; quizzes: number; weeklyActivity: { day: string; weekday: number; count: number }[] }; userName: string; goTo: (view: View) => void; updateTasks: (tasks: Task[]) => void; demoMode: boolean; dismissDemo: boolean; onDismissDemo: () => void; todayLabel: string }) {
  const completed = tasks.filter((task) => task.done).length
  const progress = tasks.length ? Math.round(completed / tasks.length * 100) : 0
  const latestNote = notes[0]
  const maxActivity = Math.max(...stats.weeklyActivity.map((item) => item.count), 1)
  return <div className="dashboard-page">
    <div className="welcome-row"><div><p className="section-kicker">{todayLabel} <span className="welcome-spark">✦</span></p><h1>Welcome back, {userName} <span>✦</span></h1><p className="page-subtitle">Welcome back! Ready to learn something new?</p></div><button className="button button-primary" onClick={() => goTo('summarizer')}><Plus size={16} /> New study session</button></div>
    {demoMode && !dismissDemo && <div className="demo-banner"><span className="demo-banner-icon"><Sparkles size={16} /></span><div><strong>You’re exploring in demo mode</strong><p>All features work with sample AI responses. Add an API key to enable live AI.</p></div><button onClick={() => goTo('settings')}>Set up AI <ArrowRight size={14} /></button><button className="banner-close" aria-label="Dismiss demo notice" onClick={onDismissDemo}><X size={15} /></button></div>}
    <div className="stats-grid"><StatCard label="Total notes" value={`${notes.length}`} trend="Saved to your account" icon={FileText} color="purple" /><StatCard label="Summaries generated" value={`${stats.summaries}`} trend="AI study sessions" icon={WandSparkles} color="blue" /><StatCard label="Flashcard sets" value={`${stats.flashcardSets}`} trend="Created from study material" icon={BookOpen} color="orange" /><StatCard label="Learning progress" value={`${progress}%`} trend={`${completed} of ${tasks.length} tasks complete`} icon={Target} color="green" /></div>
    <div className="dashboard-grid">
      <section className="panel continue-panel"><div className="panel-heading"><div><h2>Pick up where you left off</h2><p>Your recent study materials</p></div><button className="text-button" onClick={() => goTo('library')}>View library <ArrowRight size={14} /></button></div>
        {latestNote ? <button className="continue-card continue-card-button" onClick={() => goTo('library')}><span className="continue-visual"><span><Brain size={29} /></span><span className="visual-orbit" /></span><span className="continue-copy"><span className="subject-tag biology">{latestNote.subject.toUpperCase()}</span><strong>{latestNote.title}</strong><span>{latestNote.kind === 'summary' ? 'Saved summary' : 'Study note'} · {latestNote.updated}</span><span className="progress-line"><span style={{ width: `${progress}%` }} /></span><small>{completed} of {tasks.length} study tasks complete <b>{progress}%</b></small></span><span className="circle-arrow"><ArrowRight size={17} /></span></button> : <div className="continue-empty"><span className="continue-visual"><span><Brain size={29} /></span></span><div><strong>Your study space starts here.</strong><p>Summarize your first notes to save them in your library.</p><button className="text-button" onClick={() => goTo('summarizer')}>Create a summary <ArrowRight size={14} /></button></div></div>}
        <div className="recent-notes"><h3>Recent notes</h3>{notes.length ? notes.slice(0, 3).map((note, i) => <button className="recent-note" key={note.id} onClick={() => goTo('library')}><span className={`note-icon note-icon-${i}`}><FileText size={16} /></span><span className="recent-note-copy"><strong>{note.title}</strong><small>{note.subject} · {note.updated}</small></span><ArrowUpRight size={15} className="muted" /></button>) : <p className="empty-recent">Saved notes and summaries will appear here.</p>}</div>
      </section>
      <section className="panel focus-panel"><div className="panel-heading"><div><h2>Today’s focus</h2><p>Small steps, big momentum</p></div><button className="icon-button" aria-label="Focus options"><MoreHorizontal size={18} /></button></div>
        <div className="focus-ring-wrap"><div className="focus-ring" style={{ background: `conic-gradient(from 220deg,#926fe7 0deg,#83a8e7 ${progress * 3.6}deg,#232433 ${progress * 3.6}deg,#232433 360deg)` }}><div><strong>{progress}<small>%</small></strong><span>complete</span></div></div><span className="ring-dot" /><div className="focus-caption"><span className="focus-check"><Check size={12} /></span><span>{completed} of {tasks.length} tasks complete</span></div></div>
        <div className="task-list">{tasks.slice(0, 3).map((task) => <label className="task-item" key={task.id}><input type="checkbox" checked={task.done} onChange={() => updateTasks(tasks.map((item) => item.id === task.id ? { ...item, done: !item.done } : item))} /><span className="custom-checkbox">{task.done && <Check size={12} />}</span><span className={task.done ? 'task-done' : ''}>{task.title}</span><small>{task.date}</small></label>)}</div><button className="add-task" onClick={() => goTo('planner')}><Plus size={15} /> Add a study task</button>
      </section>
    </div>
    <section className="panel activity-panel"><div className="panel-heading"><div><h2>Weekly activity</h2><p>Your notes and study sessions from the last 7 days</p></div><span className="activity-legend"><i /> Activity</span></div><div className="activity-chart">{stats.weeklyActivity.map((day) => <div className="activity-day" key={day.day} title={`${day.count} activities`}><div className="activity-bar-track"><span style={{ height: `${day.count ? Math.max(day.count / maxActivity * 100, 8) : 0}%` }} /></div><small>{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day.weekday]}</small></div>)}</div></section>
    <section className="quick-tools"><div className="quick-tools-heading"><div><h2>Your learning toolkit</h2><p>Everything you need to make it click.</p></div><span>MADE FOR YOUR MOMENTUM <Zap size={13} /></span></div><div className="quick-grid">{[
      { label: 'Summarize notes', text: 'The big picture, instantly.', icon: WandSparkles, view: 'summarizer' as View, cl: 'qt-purple' },
      { label: 'Ask your notes', text: 'Get curious. Get clarity.', icon: MessageCircle, view: 'chat' as View, cl: 'qt-blue' },
      { label: 'Make flashcards', text: 'Remember what matters.', icon: Layers3, view: 'flashcards' as View, cl: 'qt-pink' },
      { label: 'Build a quiz', text: 'See what you really know.', icon: CircleHelp, view: 'quiz' as View, cl: 'qt-teal' },
    ].map(({ label, text, icon: Icon, view, cl }) => <button className="quick-card" key={view} onClick={() => goTo(view)}><span className={`quick-icon ${cl}`}><Icon size={17} /></span><span><strong>{label}</strong><small>{text}</small></span><ArrowRight size={15} className="quick-arrow" /></button>)}</div></section>
  </div>
}

function StatCard({ label, value, trend, icon: Icon, color }: { label: string; value: string; trend: string; icon: typeof Brain; color: string }) {
  return <div className="stat-card"><div className="stat-top"><span>{label}</span><span className={`stat-icon ${color}`}><Icon size={17} /></span></div><strong className="stat-value">{value}</strong><span className="stat-trend stat-description">{trend}</span></div>
}

function ToolPage({ kind, notes, onSaveNote, onAddTask }: { kind: Feature; notes: Note[]; onSaveNote: (note: Note) => void; onAddTask: (title: string) => void }) {
  const copy = featureCopy[kind]
  const [text, setText] = useState('')
  const [result, setResult] = useState('')
  const [responseDemo, setResponseDemo] = useState(false)
  const [summaryMode, setSummaryMode] = useState<'concise' | 'detailed' | 'bullets' | 'exam' | 'concepts' | 'definitions'>('concise')
  const [quizMode, setQuizMode] = useState<'mixed' | 'multiple_choice' | 'true_false' | 'fill_blank'>('mixed')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sourceName, setSourceName] = useState('')
  const [saved, setSaved] = useState(false)
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([])
  const [quizAnswers, setQuizAnswers] = useState<Record<number, string>>({})
  const [flashcardIndex, setFlashcardIndex] = useState(0)
  const [contextNoteId, setContextNoteId] = useState(notes[0]?.id ?? '')
  const fileInput = useRef<HTMLInputElement>(null)

  const parsed = useMemo(() => readJson<unknown>(result, null), [result])
  const runAnalysis = async (input = text) => {
    if (!input.trim()) { setError('Add some notes or a topic before continuing.'); return }
    setBusy(true); setError(''); setSaved(false)
    setResult('')
    setResponseDemo(false)
    setQuizAnswers({})
    setFlashcardIndex(0)
    try {
      const contextNote = notes.find((note) => note.id === contextNoteId)
      const requestText = kind === 'chat' && contextNote ? `Study notes:\n${contextNote.content}\n\nLearner question: ${input}` : input
      const response = await analyze(kind, requestText, {
        ...(kind === 'summarize' ? { mode: summaryMode } : {}),
        ...(kind === 'quiz' ? { quizMode } : {}),
      })
      setResult(response.result)
      setResponseDemo(response.demoMode)
      if (kind === 'chat') setChatMessages((messages) => [...messages, { role: 'user', content: input }, { role: 'assistant', content: response.result }])
    } catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.') }
    finally { setBusy(false) }
  }
  const handleUpload = async (file?: File) => {
    if (!file) return
    setBusy(true); setError('')
    try {
      const doc = await uploadDocument(file)
      setText(doc.text); setSourceName(file.name)
    } catch (e) { setError(e instanceof Error ? e.message : 'We could not read this file.') }
    finally { setBusy(false) }
  }
  const saveResult = () => {
    const note: Note = { id: crypto.randomUUID(), title: sourceName ? sourceName.replace(/\.[^.]+$/, '') : `${copy.eyebrow.toLowerCase().replaceAll(' ', ' ')} — ${new Date().toLocaleDateString()}`, subject: 'Study notes', updated: 'Just now', content: result || text, kind: kind === 'summarize' ? 'summary' : 'note' }
    onSaveNote(note); setSaved(true)
  }

  return <div className="tool-page">
    <PageHeading eyebrow={copy.eyebrow} title={copy.title} description={kind === 'chat' ? 'A thoughtful study partner, grounded in your own notes.' : `Your ideas, transformed into a ${kind === 'summarize' ? 'clear, structured summary' : kind === 'flashcards' ? 'practice-ready flashcard set' : kind === 'quiz' ? 'personalized knowledge check' : 'realistic learning plan'}.`} action={<span className="powered-pill"><Sparkles size={13} /> POWERED BY MINDORA</span>} />
    {kind === 'chat' && <div className="chat-suggestions"><span>TRY ASKING</span>{['Explain the key idea simply', 'What should I remember?', 'Quiz me on this topic'].map((suggestion) => <button key={suggestion} onClick={() => { setText(suggestion); }}>{suggestion} <ArrowUpRight size={12} /></button>)}</div>}
    <div className={`tool-layout ${kind === 'chat' ? 'tool-layout-chat' : ''}`}>
      <section className="panel editor-panel">
        <div className="editor-top"><div><span className="editor-label"><span className="live-dot" /> {kind === 'chat' ? 'YOUR QUESTION' : 'YOUR SOURCE MATERIAL'}</span><p>{kind === 'chat' ? 'Ask with notes as your context' : 'Paste your notes or upload a document'}</p></div><button className="more-icon" aria-label="Editor options"><MoreHorizontal size={18} /></button></div>
        {kind !== 'chat' && <div className="source-toolbar"><button onClick={() => fileInput.current?.click()}><Upload size={15} /> Upload file</button><span>PDF, DOCX, TXT, MD · Max 10 MB</span><input ref={fileInput} type="file" accept=".pdf,.docx,.txt,.md,.csv" hidden onChange={(event) => handleUpload(event.target.files?.[0])} /></div>}
        {kind === 'chat' && <div className="chat-context"><label htmlFor="chat-context-select">Answer using</label><select id="chat-context-select" value={contextNoteId} onChange={(event) => setContextNoteId(event.target.value)}><option value="">General study assistant</option>{notes.map((note) => <option value={note.id} key={note.id}>{note.title}</option>)}</select></div>}
        {kind === 'summarize' && <label className="tool-options">Summary style<select value={summaryMode} onChange={(event) => setSummaryMode(event.target.value as typeof summaryMode)}><option value="concise">Short summary</option><option value="detailed">Detailed summary</option><option value="bullets">Bullet points</option><option value="exam">Exam preparation</option><option value="concepts">Important concepts</option><option value="definitions">Key definitions</option></select></label>}
        {kind === 'quiz' && <label className="tool-options">Question types<select value={quizMode} onChange={(event) => setQuizMode(event.target.value as typeof quizMode)}><option value="mixed">Mixed question types</option><option value="multiple_choice">Multiple choice</option><option value="true_false">True or false</option><option value="fill_blank">Fill in the blanks</option></select></label>}
        {sourceName && <div className="source-chip"><FileText size={14} /><span>{sourceName}</span><button aria-label="Remove uploaded file" onClick={() => setSourceName('')}><X size={13} /></button></div>}
        <textarea className="notes-input" value={text} onChange={(event) => setText(event.target.value)} placeholder={copy.placeholder} rows={kind === 'chat' ? 8 : 13} />
        <div className="editor-footer"><span>{text.length.toLocaleString()} characters <span className="footer-dot">·</span> {text.trim() ? Math.max(1, Math.ceil(text.trim().split(/\s+/).length / 220)) : 0} min read</span><button className="button button-primary editor-submit" disabled={busy} onClick={() => runAnalysis()}>{busy ? <LoaderCircle size={15} className="spin" /> : <Sparkles size={15} />}{busy ? 'Working...' : copy.action}</button></div>
        {error && <p className="inline-error" role="alert">{error}</p>}
      </section>
      <section className="panel result-panel">
        <div className="result-heading"><div className="result-icon"><Sparkles size={16} /></div><div><h2>{kind === 'summarize' ? 'Your summary' : kind === 'chat' ? 'Study conversation' : kind === 'flashcards' ? 'Your flashcards' : kind === 'quiz' ? 'Your quiz' : 'Your study plan'}</h2><p>{result ? responseDemo ? 'DEMO RESPONSE · Not generated by live AI' : 'LIVE AI RESPONSE · Ready to explore' : 'Your results will appear here'}</p></div>{result && <button className="more-icon" aria-label="Save results" onClick={saveResult}>{saved ? <Check size={17} className="success-text" /> : <MoreHorizontal size={18} />}</button>}</div>
        {!result && !busy && <div className="empty-result"><span className="empty-orbit"><Sparkles size={23} /></span><strong>Ideas become understanding here.</strong><p>Drop in your notes and let Mindora do the heavy lifting.</p><div className="empty-pills"><span><Check size={12} /> Thoughtfully organized</span><span><Check size={12} /> Made for you</span></div></div>}
        {busy && <div className="loading-result"><span><Sparkles size={21} /></span><strong>Making sense of your ideas...</strong><p>A little clarity is on its way.</p><div className="loading-bars"><i /><i /><i /></div></div>}
        {result && <div className="result-body">
          {kind === 'summarize' && <div className="summary-output"><div className="summary-badge"><Sparkles size={13} /> THE BIG PICTURE</div>{result.split(/\n+/).filter(Boolean).map((line, i) => <p key={i}>{line.replace(/^[-*#]+\s*/, '')}</p>)}<div className="summary-takeaway"><strong><Zap size={14} /> Keep in mind</strong><span>Understanding the connections is what makes knowledge last.</span></div></div>}
          {kind === 'chat' && <div className="chat-output">{chatMessages.length === 0 && <p>{result}</p>}{chatMessages.map((message, index) => <div className={`chat-message ${message.role}`} key={index}><span className="chat-avatar">{message.role === 'assistant' ? <Brain size={14} /> : 'AM'}</span><p>{message.content}</p></div>)}<button className="chat-followup" onClick={() => { setText('Can you give me an example?'); }}>Ask a follow-up <ArrowRight size={13} /></button></div>}
          {kind === 'flashcards' && <CardOutput data={parsed} index={flashcardIndex} setIndex={setFlashcardIndex} result={result} />}
          {kind === 'quiz' && <QuizOutput key={result} data={parsed} quizAnswers={quizAnswers} setQuizAnswer={(question, answer) => setQuizAnswers((current) => ({ ...current, [question]: answer }))} onRetry={() => setQuizAnswers({})} result={result} />}
          {kind === 'planner' && <PlannerOutput data={parsed} onAddTask={onAddTask} result={result} />}
          <div className="result-actions"><button onClick={saveResult} className={saved ? 'saved-button' : ''}>{saved ? <Check size={14} /> : <Plus size={14} />}{saved ? 'Saved to library' : 'Save to library'}</button><button onClick={() => navigator.clipboard?.writeText(result)}><FileText size={14} /> Copy</button><button onClick={() => setResult('')}><WandSparkles size={14} /> Start over</button></div>
        </div>}
      </section>
    </div>
    {kind === 'chat' && <p className="chat-disclaimer"><LockKeyhole size={12} /> Your notes stay yours. Mindora only uses the content you share to answer your questions.</p>}
  </div>
}

function CardOutput({ data, index, setIndex, result }: { data: unknown; index: number; setIndex: (i: number) => void; result: string }) {
  const [flipped, setFlipped] = useState(false)
  const [progress, setProgress] = useState<Record<number, 'known' | 'practice'>>({})
  const cards = Array.isArray(data) ? data as { question?: string; answer?: string }[] : []
  if (!cards.length) return <pre className="raw-output">{result}</pre>
  const card = cards[index % cards.length]
  return <div className="flashcard-output"><span className="card-count">CARD {index + 1} <span>/ {cards.length} · {Object.values(progress).filter((value) => value === 'known').length} known</span></span><button className={`flip-card ${flipped ? 'is-flipped' : ''}`} onClick={() => setFlipped(!flipped)}><small>{flipped ? 'ANSWER' : 'QUESTION'} · CLICK TO FLIP</small><strong>{flipped ? card.answer : card.question}</strong><span>{flipped ? '↩ Show question' : '↻ Reveal answer'}</span></button><div className="card-controls"><button onClick={() => { setIndex((index + cards.length - 1) % cards.length); setFlipped(false) }}><ArrowLeft size={16} /></button><span>{index + 1} of {cards.length}</span><button onClick={() => { setIndex((index + 1) % cards.length); setFlipped(false) }}><ArrowRight size={16} /></button></div><div className="card-review"><button onClick={() => setProgress({ ...progress, [index]: 'practice' })}>Need practice</button><button onClick={() => setProgress({ ...progress, [index]: 'known' })}>Mark as known</button></div></div>
}

function QuizOutput({ data, quizAnswers, setQuizAnswer, onRetry, result }: { data: unknown; quizAnswers: Record<number, string>; setQuizAnswer: (question: number, answer: string) => void; onRetry: () => void; result: string }) {
  const [submitted, setSubmitted] = useState(false)
  const questions = Array.isArray(data) ? data as { type?: string; question?: string; blank_sentence?: string; options?: string[]; answer?: number | string; explanation?: string }[] : []
  if (!questions.length) return <pre className="raw-output">{result}</pre>
  const isCorrect = (item: typeof questions[number], index: number) => {
    const submittedAnswer = quizAnswers[index] ?? ''
    return typeof item.answer === 'number'
      ? submittedAnswer === String(item.answer)
      : submittedAnswer.trim().toLowerCase() === String(item.answer ?? '').trim().toLowerCase()
  }
  const score = questions.filter(isCorrect).length
  return <div className="quiz-output">{questions.map((item, index) => {
    const choices = item.options ?? []
    return <div className="quiz-question" key={index}><span>QUESTION {index + 1} · {(item.type ?? 'multiple_choice').replaceAll('_', ' ').toUpperCase()}</span><strong>{item.question}</strong>{item.type === 'fill_blank' ? <><p className="quiz-blank-sentence">{item.blank_sentence}</p><input className="quiz-answer-input" aria-label={`Answer to question ${index + 1}`} value={quizAnswers[index] ?? ''} disabled={submitted} onChange={(event) => setQuizAnswer(index, event.target.value)} placeholder="Type your answer" /></> : <div className="quiz-options">{choices.map((option, optionIndex) => {
      const selected = quizAnswers[index] === String(optionIndex)
      const correct = String(item.answer) === String(optionIndex)
      return <button key={optionIndex} disabled={submitted} className={submitted && correct ? 'correct' : submitted && selected ? 'incorrect' : selected ? 'selected' : ''} onClick={() => setQuizAnswer(index, String(optionIndex))}><i>{String.fromCharCode(65 + optionIndex)}</i>{option}</button>
    })}</div>}{submitted && <p className="quiz-explanation">{isCorrect(item, index) ? 'That’s right!' : `Not quite. Correct answer: ${typeof item.answer === 'number' ? choices[item.answer] : item.answer}.`} {item.explanation}</p>}</div>
  })}<div className="quiz-submit-row">{submitted ? <><strong>Score: {score} / {questions.length}</strong><button className="button button-primary" onClick={() => { onRetry(); setSubmitted(false) }}>Retry quiz</button></> : <button className="button button-primary" disabled={Object.keys(quizAnswers).length < questions.length} onClick={() => setSubmitted(true)}>Submit answers</button>}</div></div>
}

function PlannerOutput({ data, onAddTask, result }: { data: unknown; onAddTask: (title: string) => void; result: string }) {
  const plan = Array.isArray(data) ? data as { day?: string; topic?: string; duration?: string; task?: string }[] : []
  if (!plan.length) return <pre className="raw-output">{result}</pre>
  return <div className="planner-output">{plan.map((item, index) => <article className="plan-row" key={index}><span className="plan-day">{item.day ?? `DAY ${index + 1}`}</span><div><strong>{item.topic ?? item.task}</strong><small>{item.duration ?? '30 min'} · Focused study</small></div><button onClick={() => onAddTask(item.topic ?? item.task ?? 'Study session')}><Plus size={14} /></button></article>)}</div>
}

function Library({ notes, setNotes, setOpenNote, search, setSearch }: { notes: Note[]; setNotes: (notes: Note[]) => void; setOpenNote: (note: Note) => void; search: string; setSearch: (value: string) => void }) {
  const filtered = notes.filter((note) => `${note.title} ${note.subject} ${note.content}`.toLowerCase().includes(search.toLowerCase()))
  const [filter, setFilter] = useState('All notes')
  const visibleNotes = filtered.filter((note) => filter === 'All notes' || (filter === 'Summaries' ? note.kind === 'summary' : note.kind !== 'summary'))
  return <div className="library-page"><PageHeading eyebrow="YOUR KNOWLEDGE, ORGANIZED" title="Notes library" description="Every idea you’ve captured, all in one thoughtful space." action={<button className="button button-primary" onClick={() => setOpenNote({ id: 'new', title: 'New note', subject: 'Personal', updated: 'Just now', content: '', kind: 'note' })}><Plus size={15} /> New note</button>} />
    <div className="library-toolbar"><div className="library-search"><Search size={16} /><input placeholder="Search notes, topics, subjects..." value={search} onChange={(event) => setSearch(event.target.value)} /></div><select value={filter} onChange={(event) => setFilter(event.target.value)}><option>All notes</option><option>Summaries</option><option>Notes</option></select><button className="icon-button"><ArrowDown size={15} /></button></div>
    <div className="library-results"><span>{visibleNotes.length} {visibleNotes.length === 1 ? 'note' : 'notes'}</span><span>Recently updated <ChevronDown size={13} /></span></div>
    {visibleNotes.length ? <div className="library-grid">{visibleNotes.map((note, index) => <article className="library-card" key={note.id}><div className={`library-card-art art-${index % 4}`}><span className="art-stamp">{note.kind === 'summary' ? <Sparkles size={17} /> : <BookOpen size={17} />}</span><span className="art-subject">{note.subject}</span><div className="art-lines"><i /><i /><i /></div></div><div className="library-card-body"><div className="library-card-top"><span className={`subject-tag ${note.subject.toLowerCase()}`}>{note.subject.toUpperCase()}</span><button className="more-icon" onClick={() => setNotes(notes.filter((item) => item.id !== note.id))} aria-label={`Delete ${note.title}`}><MoreHorizontal size={17} /></button></div><button className="library-title" onClick={() => setOpenNote(note)}>{note.title}</button><p>{note.content.slice(0, 100)}{note.content.length > 100 ? '…' : ''}</p><div className="library-card-footer"><span>{note.updated}</span><button onClick={() => setOpenNote(note)}>Open <ArrowUpRight size={13} /></button></div></div></article>)}</div> : <div className="empty-library"><FolderOpen size={27} /><h3>No notes found</h3><p>Try a different search or create something new.</p></div>}
  </div>
}

function NoteModal({ note, onClose, onSave }: { note: Note; onClose: () => void; onSave: (note: Note) => void }) {
  const [title, setTitle] = useState(note.title)
  const [content, setContent] = useState(note.content)
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="note-modal"><div className="modal-top"><span className="section-kicker">YOUR NOTE</span><button className="icon-button" onClick={onClose} aria-label="Close note"><X size={18} /></button></div><input className="modal-title" value={title} onChange={(event) => setTitle(event.target.value)} aria-label="Note title" /><div className="modal-meta"><span className="subject-tag biology">{note.subject.toUpperCase()}</span><span>Updated {note.updated}</span></div><textarea className="modal-content" value={content} onChange={(event) => setContent(event.target.value)} aria-label="Note content" placeholder="Write something worth remembering..." /><div className="modal-actions"><span>{content.length} characters</span><button className="button button-primary" onClick={() => onSave({ ...note, title: title.trim() || 'Untitled note', content, updated: 'Just now' })}><Check size={14} /> Save note</button></div></section></div>
}

function Settings({ demoMode, preferences, onPreferenceChange, theme, onThemeChange, user, onProfileChange }: { demoMode: boolean; preferences: Record<string, unknown>; onPreferenceChange: (key: string, value: unknown) => void; theme: 'dark' | 'light'; onThemeChange: (theme: 'dark' | 'light') => void; user: User; onProfileChange: (displayName: string) => void }) {
  const [copied, setCopied] = useState(false)
  const [displayName, setDisplayName] = useState(user.displayName)
  const learningGoal = typeof preferences.learningGoal === 'string' ? preferences.learningGoal : 'Build consistent study habits'
  const setLearningGoal = (value: string) => onPreferenceChange('learningGoal', value)
  return <div className="settings-page"><PageHeading eyebrow="MAKE MINDORA YOURS" title="Settings" description="A few thoughtful details to make your study space feel like you." />
    <div className="settings-layout"><nav className="settings-tabs"><a className="settings-tab active" href="#profile">Profile</a><a className="settings-tab" href="#preferences">Preferences</a><a className="settings-tab" href="#ai-setup">AI connection</a><a className="settings-tab" href="#privacy">Privacy</a></nav><div className="settings-panels">
      <section className="panel settings-panel" id="profile"><div className="settings-panel-heading"><div><h2>Your profile</h2><p>Your account identity and learning goal.</p></div><span className="settings-auto-save">Saves on blur</span></div><div className="profile-settings"><span className="profile-avatar large">{displayName.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</span><div><strong>{displayName}</strong><small>{user.email}</small></div><span className="verified-tag"><Check size={11} /> {user.isDemo ? 'DEMO' : 'ACCOUNT'}</span></div><div className="settings-field"><label htmlFor="display-name">Display name</label><input id="display-name" value={displayName} maxLength={80} onChange={(event) => setDisplayName(event.target.value)} onBlur={() => { if (displayName.trim() && displayName.trim() !== user.displayName) onProfileChange(displayName.trim()) }} /></div><div className="settings-field"><label htmlFor="learning-goal">Learning goal</label><select id="learning-goal" value={learningGoal} onChange={(event) => setLearningGoal(event.target.value)}><option>Build consistent study habits</option><option>Prepare for an exam</option><option>Learn a new skill</option></select></div></section>
      <section className="panel settings-panel" id="preferences"><div className="settings-panel-heading"><div><h2>Study preferences</h2><p>Set up your space for focused learning.</p></div></div><div className="theme-setting"><div><strong>Appearance</strong><p>Choose your preferred study-space theme.</p></div><div className="theme-switch"><button className={theme === 'dark' ? 'selected' : ''} onClick={() => onThemeChange('dark')}>Dark</button><button className={theme === 'light' ? 'selected' : ''} onClick={() => onThemeChange('light')}>Light</button></div></div><Preference id="daily-reminder" title="Daily study reminder" description="A gentle nudge to keep your streak going." value={preferences.dailyReminder ?? true} onChange={onPreferenceChange} /><Preference id="weekly-recap" title="Weekly learning recap" description="A Sunday snapshot of your progress." value={preferences.weeklyRecap ?? true} onChange={onPreferenceChange} /><Preference id="compact-dashboard" title="Compact dashboard" description="Show more of your study space at once." value={preferences.compactDashboard ?? false} onChange={onPreferenceChange} /></section>
      <section className="panel settings-panel" id="ai-setup"><div className="settings-panel-heading"><div><h2>AI connection</h2><p>Connect an API key for live, personalized responses.</p></div><span className={`connection-tag ${demoMode ? 'connection-demo' : ''}`}><span />{demoMode ? 'DEMO MODE' : 'CONNECTED'}</span></div><div className="settings-info"><LockKeyhole size={16} /><p>Your API key belongs in the backend <code>.env</code> file only. It is never sent to or stored in your browser.</p></div><div className="env-snippet"><code>OPENAI_API_KEY=your_api_key_here</code><button onClick={() => { navigator.clipboard?.writeText('OPENAI_API_KEY=your_api_key_here'); setCopied(true); setTimeout(() => setCopied(false), 1800) }}>{copied ? <Check size={14} /> : <FileText size={14} />}{copied ? 'Copied' : 'Copy'}</button></div><p className="settings-hint">Restart the API server after adding your key. Set <code>OPENAI_MODEL</code> to choose a model, or <code>OPENAI_BASE_URL</code> for a compatible provider.</p></section>
      <section className="panel settings-panel" id="privacy"><div className="settings-panel-heading"><div><h2>Privacy & data</h2><p>Your learning space should always feel like yours.</p></div></div><div className="privacy-row"><span><LockKeyhole size={17} /></span><div><strong>Private account data</strong><p>Your notes and tasks are stored in SQLite and scoped to your account.</p></div><span className="privacy-status">ON</span></div></section>
    </div></div>
  </div>
}

function Preference({ id, title, description, value, onChange }: { id: string; title: string; description: string; value: unknown; onChange: (key: string, value: unknown) => void }) {
  const checked = value === true
  const toggle = () => {
    onChange(id === 'daily-reminder' ? 'dailyReminder' : id === 'weekly-recap' ? 'weeklyRecap' : 'compactDashboard', !checked)
  }
  return <div className="preference-row"><div><strong>{title}</strong><p>{description}</p></div><button role="switch" aria-checked={checked} className={`toggle ${checked ? 'toggle-on' : ''}`} onClick={toggle}><span /></button></div>
}

export default App
