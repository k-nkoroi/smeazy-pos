import { useEffect, useState } from 'react'
import { ScrollText, Filter, RefreshCw, User, Clock } from 'lucide-react'
import clsx from 'clsx'
import { Layout } from '../components/shared/Layout'
import { authApi } from '../lib/api'
import { Spinner } from '../components/shared/Spinner'

interface AuditLog {
  id: string; actor_name?: string; actor_role?: string;
  action: string; entity_type: string; entity_label?: string;
  summary: string; metadata?: string; created_at: string;
}

const ACTION_COLOR: Record<string, string> = {
  sale: 'bg-emerald-100 text-emerald-700',
  stock: 'bg-amber-100 text-amber-700',
  inventory: 'bg-violet-100 text-violet-700',
  staff: 'bg-blue-100 text-blue-700',
  register: 'bg-teal-100 text-teal-700',
  settings: 'bg-slate-200 text-slate-700',
}
function actionColor(action: string) {
  const prefix = action.split('.')[0]
  return ACTION_COLOR[prefix] ?? 'bg-slate-100 text-slate-600'
}
function fmtTime(iso: string) {
  // Stored as UTC 'YYYY-MM-DD HH:MM:SS'
  const d = new Date(iso.replace(' ', 'T') + 'Z')
  return d.toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' })
}

export default function LogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [actions, setActions] = useState<string[]>([])
  const [entities, setEntities] = useState<string[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [actionFilter, setActionFilter] = useState('')
  const [entityFilter, setEntityFilter] = useState('')

  async function load() {
    setLoading(true)
    const params: any = { limit: 200 }
    if (actionFilter) params.action = actionFilter
    if (entityFilter) params.entity = entityFilter
    const res = await authApi.auditLogs(params).catch(() => null)
    if (res) {
      const d = res.data.data
      setLogs(d.logs ?? []); setTotal(d.total ?? 0)
      setActions(d.actions ?? []); setEntities(d.entities ?? [])
    }
    setLoading(false)
  }
  useEffect(() => { load() }, [actionFilter, entityFilter])

  return (
    <Layout>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><ScrollText className="w-6 h-6 text-brand-600" /> Activity Logs</h1>
          <p className="text-slate-500 text-sm mt-0.5">{total.toLocaleString()} recorded actions · complete audit trail</p>
        </div>
        <button onClick={load} className="btn-secondary p-2.5"><RefreshCw className="w-4 h-4" /></button>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex items-center gap-2 text-slate-500 text-sm"><Filter className="w-4 h-4" /> Filter:</div>
        <select className="input max-w-[200px] py-2" value={actionFilter} onChange={e => setActionFilter(e.target.value)}>
          <option value="">All actions</option>
          {actions.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select className="input max-w-[200px] py-2" value={entityFilter} onChange={e => setEntityFilter(e.target.value)}>
          <option value="">All entities</option>
          {entities.map(e => <option key={e} value={e}>{e}</option>)}
        </select>
        {(actionFilter || entityFilter) && (
          <button onClick={() => { setActionFilter(''); setEntityFilter('') }} className="text-sm text-brand-600 hover:underline">Clear</button>
        )}
      </div>

      {loading ? <div className="flex justify-center pt-12"><Spinner size="lg" /></div> : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                {['When','Who','Action','Details'].map(h => (
                  <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {logs.map(log => (
                <tr key={log.id} className="hover:bg-slate-50 align-top">
                  <td className="px-4 py-3 whitespace-nowrap text-slate-500 text-xs">
                    <div className="flex items-center gap-1"><Clock className="w-3 h-3" />{fmtTime(log.created_at)}</div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center shrink-0">
                        <User className="w-3 h-3 text-slate-500" />
                      </div>
                      <div>
                        <p className="font-medium text-slate-800">{log.actor_name ?? 'System'}</p>
                        <p className="text-xs text-slate-400 capitalize">{(log.actor_role ?? '').replace(/_/g, ' ')}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={clsx('px-2 py-0.5 rounded-full text-xs font-medium', actionColor(log.action))}>{log.action}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{log.summary}</td>
                </tr>
              ))}
              {logs.length === 0 && <tr><td colSpan={4} className="px-4 py-16 text-center text-slate-400">No activity recorded yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </Layout>
  )
}
