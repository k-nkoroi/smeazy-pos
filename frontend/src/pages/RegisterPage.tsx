import { useState, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Upload, Building2, Wifi, ArrowLeft } from 'lucide-react'
import toast from 'react-hot-toast'
import { authApi } from '../lib/api'
import { useAuthStore } from '../hooks/useAuth'
import { Spinner } from '../components/shared/Spinner'

type OnboardMode = 'choose' | 'new' | 'network'

export default function RegisterPage() {
  const navigate = useNavigate()
  const setAuth = useAuthStore(s => s.setAuth)
  const fileRef = useRef<HTMLInputElement>(null)
  const [mode, setMode] = useState<OnboardMode>('choose')
  const [loading, setLoading] = useState(false)
  const [logoPreview, setLogoPreview] = useState<string>('')
  const [form, setForm] = useState({
    business_name: '', registration_no: '',
    username: '', email: '', password: '', confirm: '',
  })

  function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 500 * 1024) return toast.error('Logo must be under 500 KB')
    const reader = new FileReader()
    reader.onload = () => setLogoPreview(reader.result as string)
    reader.readAsDataURL(file)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.business_name.trim()) return toast.error('Business name required')
    if (!form.username.trim() || form.username.length < 3) return toast.error('Username must be at least 3 characters')
    if (!form.email.trim()) return toast.error('Email required')
    if (form.password.length < 8) return toast.error('Password must be at least 8 characters')
    if (form.password !== form.confirm) return toast.error('Passwords do not match')
    setLoading(true)
    try {
      const res = await authApi.register({
        business_name: form.business_name,
        registration_no: form.registration_no || undefined,
        logo_url: logoPreview || undefined,
        username: form.username, email: form.email, password: form.password,
      })
      setAuth(res.data.data)
      toast.success(`Welcome to SMEazy POS, ${form.business_name}!`)
      navigate('/dashboard')
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message ?? 'Registration failed')
    } finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-brand-600 rounded-2xl flex items-center justify-center text-white text-3xl font-black mx-auto mb-4">S</div>
          <h1 className="text-2xl font-bold text-white">Set Up SMEazy POS</h1>
          <p className="text-slate-400 text-sm mt-1">First time on this device</p>
        </div>

        {mode === 'choose' && (
          <div className="space-y-3">
            <button onClick={() => setMode('new')}
              className="w-full bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-brand-500 rounded-2xl p-5 flex items-center gap-4 transition-all">
              <div className="w-12 h-12 rounded-xl bg-brand-600 flex items-center justify-center shrink-0">
                <Building2 className="w-6 h-6 text-white" />
              </div>
              <div className="text-left">
                <p className="text-white font-semibold">Register a New Business</p>
                <p className="text-slate-400 text-sm">Create a fresh business on this device</p>
              </div>
            </button>
            <button onClick={() => setMode('network')}
              className="w-full bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-emerald-500 rounded-2xl p-5 flex items-center gap-4 transition-all">
              <div className="w-12 h-12 rounded-xl bg-emerald-600 flex items-center justify-center shrink-0">
                <Wifi className="w-6 h-6 text-white" />
              </div>
              <div className="text-left">
                <p className="text-white font-semibold">Join Existing Business</p>
                <p className="text-slate-400 text-sm">Connect to another device on your network</p>
              </div>
            </button>
            <p className="text-center text-slate-400 text-sm mt-6">
              Already set up? <Link to="/login" className="text-brand-400 hover:underline font-medium">Sign in</Link>
            </p>
          </div>
        )}

        {mode === 'network' && (
          <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700">
            <button type="button" onClick={() => setMode('choose')} className="flex items-center gap-1 text-slate-400 hover:text-white text-sm mb-4">
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <div className="text-center py-6">
              <div className="w-16 h-16 rounded-2xl bg-slate-700 flex items-center justify-center mx-auto mb-4">
                <Wifi className="w-8 h-8 text-emerald-400" />
              </div>
              <h2 className="text-white font-semibold text-lg mb-2">Network Pairing</h2>
              <p className="text-slate-400 text-sm mb-4">
                Local-network device discovery and multi-device sync are coming in the next update.
                For now, register the business on one device; additional devices will be able to join
                it over the network once sync ships.
              </p>
              <button onClick={() => setMode('new')} className="btn-primary w-full">Register on this device instead</button>
            </div>
          </div>
        )}

        {mode === 'new' && (
        <>
        <button type="button" onClick={() => setMode('choose')} className="flex items-center gap-1 text-slate-400 hover:text-white text-sm mb-3">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <form onSubmit={submit} className="bg-slate-800 rounded-2xl p-6 space-y-4 border border-slate-700">
          {/* Business section */}
          <div className="flex items-center gap-2 text-brand-400 text-xs font-semibold uppercase tracking-widest">
            <Building2 className="w-3.5 h-3.5" /> Business Details
          </div>
          <div className="flex items-center gap-4">
            <button type="button" onClick={() => fileRef.current?.click()}
              className="w-20 h-20 rounded-2xl border-2 border-dashed border-slate-600 hover:border-brand-500 flex items-center justify-center overflow-hidden bg-slate-700 shrink-0 transition-colors">
              {logoPreview
                ? <img src={logoPreview} alt="logo" className="w-full h-full object-contain" />
                : <Upload className="w-6 h-6 text-slate-500" />}
            </button>
            <div className="flex-1">
              <p className="text-slate-300 text-sm font-medium">Business logo</p>
              <p className="text-slate-500 text-xs mt-0.5">PNG/JPG under 500 KB. Used on receipts &amp; sidebar. Optional.</p>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
            </div>
          </div>
          <input value={form.business_name} onChange={e => setForm(p => ({ ...p, business_name: e.target.value }))}
            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3.5 py-2.5 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:border-brand-500"
            placeholder="Business name *" />
          <input value={form.registration_no} onChange={e => setForm(p => ({ ...p, registration_no: e.target.value }))}
            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3.5 py-2.5 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:border-brand-500"
            placeholder="Registration number (optional)" />

          {/* Owner account section */}
          <div className="flex items-center gap-2 text-brand-400 text-xs font-semibold uppercase tracking-widest pt-2">
            Owner Account
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input value={form.username} onChange={e => setForm(p => ({ ...p, username: e.target.value }))}
              className="bg-slate-700 border border-slate-600 rounded-lg px-3.5 py-2.5 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:border-brand-500"
              placeholder="Username *" autoComplete="username" />
            <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
              className="bg-slate-700 border border-slate-600 rounded-lg px-3.5 py-2.5 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:border-brand-500"
              placeholder="Email *" autoComplete="email" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input type="password" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
              className="bg-slate-700 border border-slate-600 rounded-lg px-3.5 py-2.5 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:border-brand-500"
              placeholder="Password (8+ chars) *" autoComplete="new-password" />
            <input type="password" value={form.confirm} onChange={e => setForm(p => ({ ...p, confirm: e.target.value }))}
              className="bg-slate-700 border border-slate-600 rounded-lg px-3.5 py-2.5 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:border-brand-500"
              placeholder="Confirm password *" autoComplete="new-password" />
          </div>

          <button type="submit" disabled={loading}
            className="w-full bg-brand-600 hover:bg-brand-700 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center">
            {loading ? <Spinner size="sm" /> : 'Create Business & Start'}
          </button>
        </form>
        <p className="text-center text-slate-400 text-sm mt-6">
          Already registered? <Link to="/login" className="text-brand-400 hover:underline font-medium">Sign in</Link>
        </p>
        </>
        )}
      </div>
    </div>
  )
}
