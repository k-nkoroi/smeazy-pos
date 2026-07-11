import { useEffect, useState } from 'react'
import { Plus, CreditCard, Edit2, Check } from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { Layout } from '../components/shared/Layout'
import { authApi } from '../lib/api'
import { Spinner } from '../components/shared/Spinner'
import { DEPARTMENTS } from '../lib/permissions'

interface Register { id: string; name: string; description?: string; is_active: boolean; departments: string[] }

const EMPTY = { name: '', description: '', departments: [] as string[] }

export default function RegistersPage() {
  const [registers, setRegisters] = useState<Register[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editReg, setEditReg] = useState<Register | null>(null)
  const [form, setForm] = useState({ ...EMPTY })
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    const res = await authApi.listRegisters().catch(() => null)
    if (res) setRegisters(res.data.data ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  function toggleDept(d: string) {
    setForm(p => ({
      ...p,
      departments: p.departments.includes(d) ? p.departments.filter(x => x !== d) : [...p.departments, d]
    }))
  }

  async function save() {
    if (!form.name.trim()) return toast.error('Register name required')
    if (form.departments.length === 0) return toast.error('Select at least one department')
    setSaving(true)
    try {
      if (editReg) { await authApi.updateRegister(editReg.id, form); toast.success('Register updated') }
      else { await authApi.createRegister(form); toast.success('Register created') }
      setShowModal(false); setEditReg(null); setForm({ ...EMPTY }); load()
    } catch (e: any) {
      toast.error(e.response?.data?.error?.message ?? 'Failed to save')
    } finally { setSaving(false) }
  }

  function openEdit(r: Register) {
    setEditReg(r)
    setForm({ name: r.name, description: r.description ?? '', departments: [...r.departments] })
    setShowModal(true)
  }

  return (
    <Layout>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Registers</h1>
          <p className="text-slate-500 text-sm mt-0.5">Each register (till) sells only from its assigned departments</p>
        </div>
        <button onClick={() => { setEditReg(null); setForm({ ...EMPTY }); setShowModal(true) }} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> New Register
        </button>
      </div>

      {loading ? <div className="flex justify-center pt-12"><Spinner size="lg" /></div> : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {registers.map(r => (
            <div key={r.id} className="card p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-brand-100 flex items-center justify-center">
                    <CreditCard className="w-5 h-5 text-brand-600" />
                  </div>
                  <div>
                    <p className="font-semibold">{r.name}</p>
                    {r.description && <p className="text-xs text-slate-400">{r.description}</p>}
                  </div>
                </div>
                <button onClick={() => openEdit(r)} className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700">
                  <Edit2 className="w-4 h-4" />
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {r.departments.map(d => (
                  <span key={d} className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">{d}</span>
                ))}
              </div>
            </div>
          ))}
          {registers.length === 0 && (
            <div className="col-span-full card p-16 text-center text-slate-400">
              <CreditCard className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No registers yet. Create one to scope the POS to specific departments.</p>
            </div>
          )}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md">
            <div className="p-6 border-b border-slate-100"><h2 className="font-bold text-xl">{editReg ? 'Edit Register' : 'New Register'}</h2></div>
            <div className="p-6 space-y-4">
              <div>
                <label className="label">Register Name *</label>
                <input className="input" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Main Bar Till" />
              </div>
              <div>
                <label className="label">Description</label>
                <input className="input" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Optional" />
              </div>
              <div>
                <label className="label">Departments this register sells *</label>
                <div className="grid grid-cols-2 gap-2">
                  {DEPARTMENTS.map(d => {
                    const on = form.departments.includes(d)
                    return (
                      <button type="button" key={d} onClick={() => toggleDept(d)}
                        className={clsx('flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 text-sm font-medium transition-all',
                          on ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:border-slate-300')}>
                        <span className={clsx('w-4 h-4 rounded flex items-center justify-center', on ? 'bg-brand-600' : 'bg-slate-200')}>
                          {on && <Check className="w-3 h-3 text-white" />}
                        </span>
                        {d}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-slate-100 flex gap-3">
              <button className="btn-primary flex-1" onClick={save} disabled={saving}>{saving ? <Spinner size="sm" /> : (editReg ? 'Update' : 'Create Register')}</button>
              <button className="btn-secondary" onClick={() => { setShowModal(false); setEditReg(null); setForm({ ...EMPTY }) }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
