import { useEffect, useState } from 'react'
import { User, Save } from 'lucide-react'
import toast from 'react-hot-toast'
import { Layout } from '../components/shared/Layout'
import { authApi } from '../lib/api'
import { useAuthStore } from '../hooks/useAuth'
import { Spinner } from '../components/shared/Spinner'

export default function ProfilePage() {
  const { user } = useAuthStore()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ username:'', full_name:'', phone:'', bio:'', avatar_url:'' })

  useEffect(() => {
    authApi.getProfile().then(r => {
      const p = r.data.data
      setForm({ username:p.username??'', full_name:p.full_name??'', phone:p.phone??'', bio:p.bio??'', avatar_url:p.avatar_url??'' })
    }).finally(() => setLoading(false))
  }, [])

  async function save() {
    setSaving(true)
    try {
      const res = await authApi.updateProfile(form)
      const p = res.data.data
      setForm({ username:p.username??'', full_name:p.full_name??'', phone:p.phone??'', bio:p.bio??'', avatar_url:p.avatar_url??'' })
      toast.success('Profile updated')
    } catch (err:any) { toast.error(err.response?.data?.error?.message ?? 'Failed to save') }
    finally { setSaving(false) }
  }

  if (loading) return <Layout><div className="flex justify-center pt-16"><Spinner size="lg"/></div></Layout>

  return (
    <Layout>
      <div className="max-w-lg">
        <h1 className="text-2xl font-bold mb-1">My Profile</h1>
        <p className="text-slate-500 text-sm mb-6">Manage your personal information</p>
        <div className="card p-6 space-y-5">
          <div className="flex items-center gap-4">
            {form.avatar_url ? (
              <img src={form.avatar_url} alt="" className="w-20 h-20 rounded-full object-cover border-2 border-brand-200"/>
            ) : (
              <div className="w-20 h-20 rounded-full bg-brand-600 flex items-center justify-center text-white font-bold text-3xl">
                {form.username?.[0]?.toUpperCase() ?? <User className="w-8 h-8"/>}
              </div>
            )}
            <div className="flex-1">
              <p className="font-semibold text-lg">{form.full_name || form.username}</p>
              <p className="text-sm text-slate-500 capitalize">{user?.role?.replace(/_/g,' ')}</p>
              <p className="text-sm text-slate-400">{user?.email}</p>
            </div>
          </div>
          <div><label className="label">Avatar URL</label>
            <input className="input" value={form.avatar_url} onChange={e=>setForm(p=>({...p,avatar_url:e.target.value}))} placeholder="https://..."/></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Username</label>
              <input className="input" value={form.username} onChange={e=>setForm(p=>({...p,username:e.target.value}))}/></div>
            <div><label className="label">Full Name</label>
              <input className="input" value={form.full_name} onChange={e=>setForm(p=>({...p,full_name:e.target.value}))}/></div>
          </div>
          <div><label className="label">Phone</label>
            <input className="input" value={form.phone} onChange={e=>setForm(p=>({...p,phone:e.target.value}))} placeholder="+254 7xx xxx xxx"/></div>
          <div><label className="label">Bio / Notes</label>
            <textarea className="input min-h-[80px] resize-none" value={form.bio} onChange={e=>setForm(p=>({...p,bio:e.target.value}))}/></div>
          <button onClick={save} disabled={saving} className="btn-primary w-full flex items-center justify-center gap-2">
            {saving ? <Spinner size="sm"/> : <><Save className="w-4 h-4"/>Save Profile</>}
          </button>
        </div>
      </div>
    </Layout>
  )
}
