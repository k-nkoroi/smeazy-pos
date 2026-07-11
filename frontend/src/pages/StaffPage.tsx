import { useEffect, useState } from 'react'
import { Plus, RefreshCw, Edit2, Key, UserCheck, UserX, Shield, ChefHat, UserCog, Wrench, CreditCard, Package, Check } from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { Layout } from '../components/shared/Layout'
import { authApi } from '../lib/api'
import { Spinner } from '../components/shared/Spinner'
import { ROLE_LABELS } from '../lib/permissions'

interface StaffMember {
  user_id: string; username: string; email: string;
  full_name?: string; phone?: string;
  roles: string[]; role_type: string;
  department?: string; pos_pin?: string; is_active: boolean; hire_date: string;
}

const ROLE_INFO: Record<string, { label: string; desc: string; icon: any; color: string; dept: string }> = {
  admin_staff:       { label: 'Admin Staff',     desc: 'Full management — reports, staff, settings', icon: Shield,     color: 'bg-purple-100 text-purple-700', dept: 'Management' },
  executive_staff:   { label: 'Executive Staff', desc: 'Shift manager — POS, discounts, reports',   icon: UserCog,    color: 'bg-blue-100 text-blue-700',     dept: 'Management' },
  cashier:           { label: 'Cashier',         desc: 'POS + analytics access',                     icon: CreditCard, color: 'bg-teal-100 text-teal-700',     dept: 'Sales & Inventory' },
  storekeeper:       { label: 'Storekeeper',     desc: 'Inventory management only',                  icon: Package,    color: 'bg-orange-100 text-orange-700', dept: 'Sales & Inventory' },
  operational_staff: { label: 'Waitstaff',       desc: 'POS floor only. Gets a 4-digit PIN.',        icon: ChefHat,    color: 'bg-emerald-100 text-emerald-700', dept: 'Front of House' },
  guest_contractor:  { label: 'Contractor',      desc: 'Limited temporary access',                   icon: Wrench,     color: 'bg-amber-100 text-amber-700',   dept: 'Other' },
}
const ALL_ROLES = Object.keys(ROLE_INFO)
const DEPTS = ['Front of House','Kitchen','Bar','Sales & Inventory','Pool & Recreation','Accommodation','Administration','Finance','Maintenance']

const EMPTY_FORM = { username:'', email:'', password:'', full_name:'', phone:'', roles: ['operational_staff'] as string[], department:'', employment_type:'permanent' }

export default function StaffPage() {
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editMember, setEditMember] = useState<StaffMember|null>(null)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)
  const [newPinResult, setNewPinResult] = useState<{uid: string, pin: string}|null>(null)
  const [createdStaff, setCreatedStaff] = useState<StaffMember|null>(null)

  async function load() {
    setLoading(true)
    const res = await authApi.listStaff().catch(() => null)
    if (res) setStaff(res.data.data ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  function toggleRole(r: string) {
    setForm(p => ({
      ...p,
      roles: p.roles.includes(r) ? p.roles.filter(x => x !== r) : [...p.roles, r]
    }))
  }

  async function handleSave() {
    if (!form.username || !form.email) return toast.error('Username and email required')
    if (!editMember && form.password.length < 8) return toast.error('Password must be at least 8 characters')
    if (form.roles.length === 0) return toast.error('Select at least one role')
    setSaving(true)
    try {
      if (editMember) {
        await authApi.updateStaff(editMember.user_id, {
          full_name: form.full_name||undefined, phone: form.phone||undefined,
          department: form.department||undefined, roles: form.roles,
          password: form.password||undefined,
        })
        toast.success('Staff member updated')
        setEditMember(null)
      } else {
        const res = await authApi.createStaff({
          username: form.username, email: form.email, password: form.password,
          full_name: form.full_name||undefined, phone: form.phone||undefined,
          roles: form.roles, department: form.department||undefined,
          employment_type: form.employment_type,
        })
        setCreatedStaff(res.data.data as StaffMember)
        setShowAdd(false)
      }
      setForm({ ...EMPTY_FORM })
      load()
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message ?? 'Failed to save')
    } finally { setSaving(false) }
  }

  async function handleResetPin(uid: string) {
    const res = await authApi.resetPin(uid).catch(() => null)
    if (res) { setNewPinResult({ uid, pin: res.data.data.pos_pin }); load() }
  }

  async function toggleActive(m: StaffMember) {
    await authApi.updateStaff(m.user_id, { is_active: !m.is_active })
    toast.success(m.is_active ? 'Staff deactivated' : 'Staff reactivated')
    load()
  }

  function openEdit(m: StaffMember) {
    setEditMember(m)
    setForm({ username: m.username, email: m.email, password: '', full_name: m.full_name??'', phone: m.phone??'', roles: [...(m.roles ?? [m.role_type])], department: m.department??'', employment_type: 'permanent' })
  }

  const hasPosRole = form.roles.some(r => r === 'operational_staff' || r === 'cashier')

  return (
    <Layout>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Staff Management</h1>
          <p className="text-slate-500 text-sm mt-0.5">{staff.length} staff members · a member can hold multiple roles</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="btn-secondary p-2.5"><RefreshCw className="w-4 h-4"/></button>
          <button onClick={()=>{ setForm({...EMPTY_FORM}); setShowAdd(true) }} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4"/> Add Staff Member
          </button>
        </div>
      </div>

      {/* Role reference cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        {ALL_ROLES.map(key => {
          const info = ROLE_INFO[key]; const Icon = info.icon
          const count = staff.filter(s => (s.roles ?? [s.role_type]).includes(key)).length
          return (
            <div key={key} className="card p-4 flex items-center gap-3">
              <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', info.color)}><Icon className="w-5 h-5"/></div>
              <div className="min-w-0">
                <p className="font-semibold text-sm">{info.label}</p>
                <p className="text-xs text-slate-400 truncate">{info.dept} · {count} member{count!==1?'s':''}</p>
              </div>
            </div>
          )
        })}
      </div>

      {loading ? <div className="flex justify-center pt-8"><Spinner size="lg"/></div> : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                {['Name','Username','Roles','Dept','POS PIN','Status','Actions'].map(h=>(
                  <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {staff.map(m=>{
                const roles = m.roles ?? [m.role_type]
                const hasPin = roles.some(r => r==='operational_staff' || r==='cashier')
                return (
                  <tr key={m.user_id} className={clsx('hover:bg-slate-50', !m.is_active && 'opacity-50')}>
                    <td className="px-4 py-3"><p className="font-medium">{m.full_name || m.username}</p><p className="text-xs text-slate-400">{m.email}</p></td>
                    <td className="px-4 py-3 font-mono text-slate-600 text-xs">{m.username}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {roles.map(r => (
                          <span key={r} className={clsx('px-2 py-0.5 rounded-full text-xs font-medium', ROLE_INFO[r]?.color ?? 'bg-slate-100 text-slate-600')}>
                            {ROLE_LABELS[r] ?? r}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{m.department||'—'}</td>
                    <td className="px-4 py-3">
                      {hasPin
                        ? <code className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-bold tracking-widest text-sm">{m.pos_pin ?? '????'}</code>
                        : <span className="text-slate-300">N/A</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={clsx('px-2 py-0.5 rounded-full text-xs font-medium', m.is_active?'bg-emerald-100 text-emerald-700':'bg-slate-100 text-slate-500')}>
                        {m.is_active?'Active':'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={()=>openEdit(m)} className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700" title="Edit"><Edit2 className="w-3.5 h-3.5"/></button>
                        {hasPin && (
                          <button onClick={()=>handleResetPin(m.user_id)} className="p-1.5 rounded hover:bg-amber-100 text-slate-400 hover:text-amber-600" title="Reset PIN"><Key className="w-3.5 h-3.5"/></button>
                        )}
                        <button onClick={()=>toggleActive(m)} className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-red-500" title={m.is_active?'Deactivate':'Activate'}>
                          {m.is_active?<UserX className="w-3.5 h-3.5"/>:<UserCheck className="w-3.5 h-3.5"/>}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {staff.length === 0 && <tr><td colSpan={7} className="px-4 py-16 text-center text-slate-400">No staff members yet. Add your first team member.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* Add/Edit modal — inline JSX (input focus fix retained) */}
      {(showAdd || editMember) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-100">
              <h2 className="font-bold text-xl">{editMember ? 'Edit Staff Member' : 'Add New Staff Member'}</h2>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Username *</label>
                  <input className="input" value={form.username} disabled={!!editMember}
                    onChange={e=>setForm(p=>({...p,username:e.target.value}))} placeholder="e.g. john_waiter" />
                </div>
                <div>
                  <label className="label">Email *</label>
                  <input type="email" className="input" value={form.email} disabled={!!editMember}
                    onChange={e=>setForm(p=>({...p,email:e.target.value}))} placeholder="staff@example.com" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Full Name</label>
                  <input className="input" value={form.full_name} onChange={e=>setForm(p=>({...p,full_name:e.target.value}))} placeholder="Display name" />
                </div>
                <div>
                  <label className="label">Phone</label>
                  <input className="input" value={form.phone} onChange={e=>setForm(p=>({...p,phone:e.target.value}))} placeholder="+254 7xx xxx xxx" />
                </div>
              </div>
              <div>
                <label className="label">{editMember ? 'New Password (leave blank to keep)' : 'Password *'}</label>
                <input type="password" className="input" value={form.password}
                  onChange={e=>setForm(p=>({...p,password:e.target.value}))} placeholder={editMember ? 'Leave blank to keep current' : 'Min 8 characters'} />
              </div>
              <div>
                <label className="label">Roles * <span className="font-normal text-slate-400">(select one or more — permissions combine)</span></label>
                <div className="grid grid-cols-2 gap-2">
                  {ALL_ROLES.map(key => {
                    const info = ROLE_INFO[key]; const Icon = info.icon
                    const on = form.roles.includes(key)
                    return (
                      <button type="button" key={key} onClick={()=>toggleRole(key)}
                        className={clsx('text-left p-3 rounded-xl border-2 transition-all',
                          on ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:border-slate-300')}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className={clsx('w-4 h-4 rounded flex items-center justify-center shrink-0', on ? 'bg-brand-600' : 'bg-slate-200')}>
                            {on && <Check className="w-3 h-3 text-white" />}
                          </span>
                          <Icon className="w-4 h-4 text-slate-600"/>
                          <span className="font-medium text-sm">{info.label}</span>
                        </div>
                        <p className="text-xs text-slate-500">{info.desc}</p>
                      </button>
                    )
                  })}
                </div>
                {hasPosRole && (
                  <p className="text-xs text-emerald-600 mt-2">✓ A 4-digit POS PIN will be generated (POS-facing role selected)</p>
                )}
              </div>
              <div>
                <label className="label">Department</label>
                <select className="input" value={form.department} onChange={e=>setForm(p=>({...p,department:e.target.value}))}>
                  <option value="">No department</option>
                  {DEPTS.map(d=><option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            </div>
            <div className="p-6 border-t border-slate-100 flex gap-3">
              <button className="btn-primary flex-1" onClick={handleSave} disabled={saving}>
                {saving?<Spinner size="sm"/>:(editMember?'Update':'Create Staff Account')}
              </button>
              <button className="btn-secondary" onClick={()=>{setShowAdd(false);setEditMember(null);setForm({...EMPTY_FORM})}}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Created credentials */}
      {createdStaff && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-96 text-center">
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4"><UserCheck className="w-8 h-8 text-emerald-600"/></div>
            <h2 className="font-bold text-xl mb-1">Account Created!</h2>
            <p className="text-slate-500 text-sm mb-5">Share these credentials with <strong>{createdStaff.full_name||createdStaff.username}</strong></p>
            <div className="bg-slate-50 rounded-xl p-4 text-left space-y-2 mb-5 font-mono text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Username:</span><span className="font-bold">{createdStaff.username}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Email:</span><span className="font-bold">{createdStaff.email}</span></div>
              <div className="flex justify-between gap-3"><span className="text-slate-500">Roles:</span><span className="font-bold text-right">{(createdStaff.roles ?? []).map(r=>ROLE_LABELS[r]).join(', ')}</span></div>
              {createdStaff.pos_pin && (
                <div className="flex justify-between items-center mt-3 pt-3 border-t border-slate-200">
                  <span className="text-slate-500">POS PIN:</span>
                  <span className="font-black text-2xl tracking-[0.4em] text-brand-600">{createdStaff.pos_pin}</span>
                </div>
              )}
            </div>
            <p className="text-xs text-amber-600 mb-4">⚠ Save this PIN now — use Reset PIN later to generate a new one</p>
            <button className="btn-primary w-full" onClick={()=>setCreatedStaff(null)}>Done</button>
          </div>
        </div>
      )}

      {/* PIN reset */}
      {newPinResult && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-80 text-center">
            <Key className="w-12 h-12 text-brand-600 mx-auto mb-3"/>
            <h2 className="font-bold text-lg mb-2">New POS PIN Generated</h2>
            <p className="text-4xl font-black tracking-[0.4em] text-brand-600 my-4">{newPinResult.pin}</p>
            <p className="text-xs text-amber-600 mb-4">Share this with the staff member</p>
            <button className="btn-primary w-full" onClick={()=>setNewPinResult(null)}>Done</button>
          </div>
        </div>
      )}
    </Layout>
  )
}
