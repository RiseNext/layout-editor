import { useEffect, useState } from 'react'
import Admin from './Admin'
import Editor from './Editor'
import Viewer from './Viewer'
import { api, type AuthStatus } from './api'

function ProtectedEditor({ projectId }: { projectId: string }) {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null)
  useEffect(() => { api<AuthStatus>('/auth/status').then((status) => setAuthenticated(status.authenticated)).catch(() => setAuthenticated(false)) }, [])
  if (authenticated === null) return <div className="studio-loading"><span className="loading-mark" />Checking administrator session</div>
  return authenticated ? <Editor projectId={projectId} /> : <Admin />
}

export default function Router() {
  const path = window.location.pathname.split('/').filter(Boolean)
  if (path[0] === 'embed' && path[1]) return <Viewer slug={decodeURIComponent(path[1])} embed />
  if (path[0] === 'project' && path[1]) return <Viewer slug={decodeURIComponent(path[1])} />
  if (path[0] === 'admin' && path[1] === 'projects' && path[2] && path[3] === 'editor') return <ProtectedEditor projectId={decodeURIComponent(path[2])} />
  return <Admin />
}
