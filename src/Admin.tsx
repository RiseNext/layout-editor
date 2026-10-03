import { useEffect, useState, type FormEvent } from 'react'
import { ArrowRight, Building2, CirclePlus, FileImage, LogOut, MapPin, ShieldCheck, Upload } from 'lucide-react'
import { api, type AuthStatus } from './api'
import type { Project } from './types'

function slugify(value: string) {
  return value.toLowerCase().trim().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function AuthGate({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [mode, setMode] = useState<'checking' | 'setup' | 'login' | 'error'>('checking')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    api<AuthStatus>('/auth/status').then((status) => {
      if (status.authenticated) onAuthenticated()
      else setMode(status.setupRequired ? 'setup' : 'login')
    }).catch((error: Error) => { setMode('error'); setMessage(error.message) })
  }, [])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setMessage('')
    if (mode === 'setup' && password !== confirmation) return setMessage('Passwords do not match.')
    setBusy(true)
    try {
      await api(`/auth/${mode === 'setup' ? 'setup' : 'login'}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) })
      onAuthenticated()
    } catch (error) { setMessage((error as Error).message) } finally { setBusy(false) }
  }

  if (mode === 'checking') return <div className="studio-loading"><span className="loading-mark" /> Opening project studio</div>
  return <main className="auth-shell">
    <section className="auth-panel"><a className="studio-logo" href="/admin"><span><Building2 size={19} /></span><strong>PLAT<span>FORM</span></strong><small>REAL ESTATE STUDIO</small></a>
      <div className="auth-copy"><span className="eyebrow">{mode === 'setup' ? 'FIRST-RUN SETUP' : 'ADMIN ACCESS'}</span><h1>{mode === 'setup' ? 'Make this studio yours.' : 'Back to the drawing board.'}</h1><p>{mode === 'setup' ? 'Set a private administrator password before creating your first project.' : 'Sign in to create projects, upload site plans, and manage availability.'}</p></div>
      <form className="auth-form" onSubmit={submit}><label>Administrator password<input autoComplete={mode === 'setup' ? 'new-password' : 'current-password'} type="password" minLength={12} maxLength={200} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="12 characters or more" /></label>{mode === 'setup' && <label>Confirm password<input autoComplete="new-password" type="password" minLength={12} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="Type it again" /></label>}{message && <p className="form-error" role="alert">{message}</p>}<button className="studio-button primary" disabled={busy || mode === 'error'}>{busy ? 'Please wait…' : mode === 'setup' ? 'Secure this workspace' : 'Sign in'}<ArrowRight size={16} /></button></form>
      <div className="auth-foot"><ShieldCheck size={15} /> Local administrator session · HTTP-only cookie</div>
    </section>
    <aside className="auth-art"><div className="auth-art-grid" /><div className="auth-stamp">PLAN NO. 01<br />SITE STUDIO</div><div className="auth-art-copy"><span>BUILT AROUND YOUR SITE</span><strong>Every boundary<br />has a <i>story.</i></strong><small>UPLOAD · DRAW · PUBLISH</small></div><svg className="auth-contour" viewBox="0 0 700 760" aria-hidden="true"><path d="M-40 520C70 370 130 670 280 480S510 300 750 470M-50 570C90 420 150 720 305 530S530 355 760 520M-50 620C100 470 175 770 330 580S560 410 760 570M-30 670C110 520 200 810 355 630S585 470 760 630" /></svg></aside>
  </main>
}

function NewProject({ onCancel, onCreated }: { onCancel: () => void; onCreated: (project: Project) => void }) {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [location, setLocation] = useState('')
  const [description, setDescription] = useState('')
  const [contactNumber, setContactNumber] = useState('')
  const [whatsappNumber, setWhatsappNumber] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function setLayoutFile(next?: File) {
    setFile(next ?? null); setSize(null); setError('')
    if (!next) return
    try {
      const url = URL.createObjectURL(next)
      const image = new Image(); image.src = url; await image.decode(); URL.revokeObjectURL(url)
      setSize({ width: image.naturalWidth, height: image.naturalHeight })
    } catch { setError('Could not read this image. Try a PNG, JPG, WEBP, or SVG layout.') }
  }

  async function submit(event: FormEvent) {
    event.preventDefault(); setError('')
    if (!file || !size) return setError('Choose a valid base layout image first.')
    setBusy(true)
    const body = new FormData()
    body.set('name', name); body.set('slug', slug || slugify(name)); body.set('location', location); body.set('description', description)
    body.set('contactNumber', contactNumber); body.set('whatsappNumber', whatsappNumber)
    body.set('layoutWidth', String(size.width)); body.set('layoutHeight', String(size.height)); body.set('layout', file)
    try { onCreated(await api<Project>('/projects', { method: 'POST', body })) }
    catch (reason) { setError((reason as Error).message) }
    finally { setBusy(false) }
  }

  return <main className="new-project-shell"><header className="studio-topbar"><a href="/admin" className="studio-logo compact"><span><Building2 size={18} /></span><strong>PLAT<span>FORM</span></strong></a><div className="studio-breadcrumb">PROJECTS <i>/</i> NEW PROJECT</div><button className="quiet-button" onClick={onCancel}>Cancel</button></header>
    <section className="new-project-content"><div className="new-project-intro"><span className="eyebrow">NEW DEVELOPMENT</span><h1>Start with the real plan.</h1><p>Every project gets its own architectural base image and editable vector layers. Nothing is baked into the source.</p></div>
      <form className="new-project-form" onSubmit={submit}><div className="form-block"><div className="form-block-head"><span>01</span><div><h2>Project identity</h2><p>Name, location, public URL, and enquiry contacts.</p></div></div><div className="form-grid"><label>Project name<input required maxLength={140} value={name} placeholder="Green Valley Phase 1" onChange={(event) => { setName(event.target.value); if (!slugEdited) setSlug(slugify(event.target.value)) }} /></label><label>Project slug<div className="slug-field"><span>/project/</span><input required maxLength={80} value={slug} placeholder="green-valley-phase-1" onChange={(event) => { setSlugEdited(true); setSlug(slugify(event.target.value)) }} /></div></label><label className="span-two">Location<input value={location} maxLength={240} placeholder="City, district, state" onChange={(event) => setLocation(event.target.value)} /></label><label className="span-two">Description<textarea rows={3} maxLength={4000} placeholder="A concise introduction to the development" value={description} onChange={(event) => setDescription(event.target.value)} /></label><label>Contact number<input inputMode="tel" maxLength={40} placeholder="Optional" value={contactNumber} onChange={(event) => setContactNumber(event.target.value)} /></label><label>WhatsApp number<input inputMode="tel" maxLength={40} placeholder="Optional" value={whatsappNumber} onChange={(event) => setWhatsappNumber(event.target.value)} /></label></div></div>
        <div className="form-block"><div className="form-block-head"><span>02</span><div><h2>Architectural base</h2><p>Keep your uploaded drawing intact. Interactive plot geometry sits above it.</p></div></div><label className={`layout-upload${file ? ' ready' : ''}`}><input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,.png,.jpg,.jpeg,.webp,.svg" required={!file} onChange={(event) => void setLayoutFile(event.target.files?.[0])} /><span className="upload-symbol">{file ? <FileImage size={20} /> : <Upload size={20} />}</span><span><strong>{file?.name ?? 'Choose a layout image'}</strong><small>{size ? `${size.width} × ${size.height}px · aspect ratio preserved` : 'PNG, JPG, WEBP, SVG · up to 25 MB'}</small></span>{size && <span className="upload-ready">IMAGE READY</span>}</label></div>
        {error && <p className="form-error" role="alert">{error}</p>}<footer className="form-submit"><span>CREATED AS A PRIVATE DRAFT</span><button className="studio-button primary" disabled={busy || !file || !size}>{busy ? 'Creating project…' : 'Create project & open editor'}<ArrowRight size={16} /></button></footer>
      </form>
    </section>
  </main>
}

function ProjectList({ onNew, onEdit }: { onNew: () => void; onEdit: (project: Project) => void }) {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => { api<Project[]>('/projects').then(setProjects).catch((reason: Error) => setError(reason.message)).finally(() => setLoading(false)) }, [])
  async function archive(project: Project) {
    try { await api(`/projects/${encodeURIComponent(project.slug)}/archive`, { method: 'POST' }); setProjects((items) => items.map((item) => item.id === project.id ? { ...item, status: 'ARCHIVED' } : item)) }
    catch (reason) { setError((reason as Error).message) }
  }
  async function signOut() { await api('/auth/logout', { method: 'POST' }); window.location.reload() }
  return <main className="studio-home"><header className="studio-topbar"><a href="/admin" className="studio-logo compact"><span><Building2 size={18} /></span><strong>PLAT<span>FORM</span></strong></a><div className="studio-breadcrumb">PROJECT STUDIO <i>/</i> WORKSPACE</div><button className="quiet-button" onClick={signOut}><LogOut size={15} /> Sign out</button></header>
    <section className="project-workspace"><div className="workspace-heading"><div><span className="eyebrow">REAL ESTATE LAYOUT ENGINE</span><h1>Your projects.</h1><p>Upload a different plan for every development. Draw to its actual boundaries.</p></div><button className="studio-button primary" onClick={onNew}><CirclePlus size={17} /> New project</button></div>
      {error && <p className="form-error">{error}</p>}{loading ? <div className="studio-loading"><span className="loading-mark" /> Loading workspace</div> : projects.length ? <div className="project-grid">{projects.map((project) => <article className="project-card" key={project.id}>
        <button className="project-thumb" onClick={() => onEdit(project)}><img src={project.layoutUrl} alt={`${project.name} uploaded plan`} /><span className={`project-status-tag ${project.status.toLowerCase()}`}><i />{project.status}</span><span className="project-thumb-cta">Open editor <ArrowRight size={15} /></span></button>
        <div className="project-card-meta"><div><h2>{project.name}</h2><p><MapPin size={13} />{project.location || project.slug}</p></div><button className="project-open" onClick={() => onEdit(project)} aria-label={`Edit ${project.name}`}><ArrowRight size={17} /></button></div>
        <div className="project-card-foot"><span><FileImage size={13} />{Math.round(project.layoutWidth)} × {Math.round(project.layoutHeight)}</span><span>UPDATED {new Date(project.updatedAt).toLocaleDateString()}</span>{project.status !== 'ARCHIVED' && <button onClick={() => void archive(project)}>Archive</button>}</div>
      </article>)}</div> : <div className="no-projects"><div><Building2 size={22} /></div><span className="eyebrow">A CLEAR SITE</span><h2>Bring your first plan in.</h2><p>Upload a layout, trace the real plot edges, then publish a customer viewer or iframe.</p><button className="studio-button primary" onClick={onNew}><CirclePlus size={17} /> Create first project</button></div>}
      <footer className="workspace-note"><ShieldCheck size={15} /><span>Local workspace · SQLite project store · Uploaded plans remain independent base layers</span></footer>
    </section>
  </main>
}

export default function Admin() {
  const [authenticated, setAuthenticated] = useState(false)
  const [newProject, setNewProject] = useState(window.location.pathname.endsWith('/new'))
  if (!authenticated) return <AuthGate onAuthenticated={() => setAuthenticated(true)} />
  if (newProject) return <NewProject onCancel={() => { setNewProject(false); window.history.pushState({}, '', '/admin') }} onCreated={(project) => window.location.assign(`/admin/projects/${project.id}/editor`)} />
  return <ProjectList onNew={() => { setNewProject(true); window.history.pushState({}, '', '/admin/projects/new') }} onEdit={(project) => window.location.assign(`/admin/projects/${project.id}/editor`)} />
}
