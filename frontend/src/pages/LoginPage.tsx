import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Store, ArrowLeft, Delete } from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { authApi } from '../lib/api'
import { useAuthStore, useDeviceStore } from '../hooks/useAuth'
import { Spinner } from '../components/shared/Spinner'

type Mode = 'choose' | 'admin' | 'pos'

export default function LoginPage() {
  const navigate = useNavigate()
  const setAuth = useAuthStore(s => s.setAuth)
  const business = useDeviceStore(s => s.business)
  const [mode, setMode] = useState<Mode>('choose')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [pin, setPin] = useState('')
  const [loading, setLoading] = useState(false)

  async function adminLogin(e: React.FormEvent) {
    e.preventDefault()
    if (!email || !password) return toast.error('Enter email and password')
    setLoading(true)
    try {
      const res = await authApi.login({ email, password })
      setAuth(res.data.data)
      navigate('/dashboard')
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message ?? 'Login failed')
    } finally { setLoading(false) }
  }

  async function posLogin(enteredPin: string) {
    if (!business) return toast.error('No business registered on this device')
    if (enteredPin.length !== 4) return
    setLoading(true)
    try {
      const res = await authApi.pinLogin({ business_id: business.id, pin: enteredPin })
      setAuth(res.data.data)
      navigate('/floor')
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message ?? 'Invalid PIN')
      setPin('')
    } finally { setLoading(false) }
  }

  function pressKey(d: string) {
    if (loading) return
    const next = (pin + d).slice(0, 4)
    setPin(next)
    if (next.length === 4) posLogin(next)
  }

  const Logo = () => (
    <div className="text-center mb-8">
      {business?.logo_url
        ? <img src={business.logo_url} alt="" className="w-16 h-16 rounded-2xl object-contain bg-white mx-auto mb-4 p-1" />
        : <div className="w-16 h-16 bg-brand-600 rounded-2xl flex items-center justify-center text-white text-3xl font-black mx-auto mb-4">S</div>}
      <h1 className="text-2xl font-bold text-white">{business?.name ?? 'SMEazy POS'}</h1>
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <Logo />

        {mode === 'choose' && (
          <div className="space-y-3">
            <button onClick={() => setMode('admin')}
              className="w-full bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-brand-500 rounded-2xl p-5 flex items-center gap-4 transition-all group">
              <div className="w-12 h-12 rounded-xl bg-brand-600 flex items-center justify-center shrink-0">
                <LayoutDashboard className="w-6 h-6 text-white" />
              </div>
              <div className="text-left">
                <p className="text-white font-semibold">Dashboard</p>
                <p className="text-slate-400 text-sm">Sign in with admin credentials</p>
              </div>
            </button>
            <button onClick={() => setMode('pos')}
              className="w-full bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-emerald-500 rounded-2xl p-5 flex items-center gap-4 transition-all group">
              <div className="w-12 h-12 rounded-xl bg-emerald-600 flex items-center justify-center shrink-0">
                <Store className="w-6 h-6 text-white" />
              </div>
              <div className="text-left">
                <p className="text-white font-semibold">POS</p>
                <p className="text-slate-400 text-sm">Waitstaff sign in with 4-digit PIN</p>
              </div>
            </button>
            {!business && (
              <p className="text-center text-slate-400 text-sm mt-6">
                No business yet? <Link to="/register" className="text-brand-400 hover:underline font-medium">Register here</Link>
              </p>
            )}
          </div>
        )}

        {mode === 'admin' && (
          <form onSubmit={adminLogin} className="bg-slate-800 rounded-2xl p-6 space-y-4 border border-slate-700">
            <button type="button" onClick={() => setMode('choose')} className="flex items-center gap-1 text-slate-400 hover:text-white text-sm">
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3.5 py-2.5 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:border-brand-500"
                placeholder="you@business.com" autoComplete="email" autoFocus />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3.5 py-2.5 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:border-brand-500"
                placeholder="••••••••" autoComplete="current-password" />
            </div>
            <button type="submit" disabled={loading}
              className="w-full bg-brand-600 hover:bg-brand-700 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center">
              {loading ? <Spinner size="sm" /> : 'Sign In to Dashboard'}
            </button>
          </form>
        )}

        {mode === 'pos' && (
          <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700">
            <button type="button" onClick={() => { setMode('choose'); setPin('') }} className="flex items-center gap-1 text-slate-400 hover:text-white text-sm mb-4">
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <p className="text-center text-slate-300 text-sm mb-2">Enter your 4-digit PIN</p>
            {/* PIN dots */}
            <div className="flex justify-center gap-3 mb-6">
              {[0,1,2,3].map(i => (
                <div key={i} className={clsx('w-4 h-4 rounded-full border-2 transition-colors',
                  i < pin.length ? 'bg-emerald-500 border-emerald-500' : 'border-slate-600')} />
              ))}
            </div>
            {/* Keypad */}
            <div className="grid grid-cols-3 gap-3">
              {['1','2','3','4','5','6','7','8','9'].map(d => (
                <button key={d} onClick={() => pressKey(d)} disabled={loading}
                  className="bg-slate-700 hover:bg-slate-600 text-white text-2xl font-semibold rounded-xl py-4 transition-colors disabled:opacity-50">
                  {d}
                </button>
              ))}
              <div />
              <button onClick={() => pressKey('0')} disabled={loading}
                className="bg-slate-700 hover:bg-slate-600 text-white text-2xl font-semibold rounded-xl py-4 transition-colors disabled:opacity-50">0</button>
              <button onClick={() => setPin(pin.slice(0, -1))} disabled={loading}
                className="bg-slate-700 hover:bg-slate-600 text-white rounded-xl py-4 flex items-center justify-center transition-colors disabled:opacity-50">
                <Delete className="w-6 h-6" />
              </button>
            </div>
            {loading && <div className="flex justify-center mt-4"><Spinner size="sm" /></div>}
          </div>
        )}
      </div>
    </div>
  )
}
