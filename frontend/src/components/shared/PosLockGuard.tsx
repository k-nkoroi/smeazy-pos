import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Lock, Delete } from 'lucide-react'
import clsx from 'clsx'
import { useAuthStore, useDeviceStore } from '../../hooks/useAuth'
import { authApi } from '../../lib/api'
import { isWaitstaffOnly } from '../../lib/permissions'

const IDLE_MS = 15_000 // auto-lock after 15 seconds of inactivity

/**
 * Wraps any authed view. After 15s of no interaction it:
 *   1. saves any pending order/table context to the device store,
 *   2. logs the current user out,
 *   3. shows a PIN pad. When another staff member enters their PIN they are
 *      logged in fresh with the full set of capabilities their role grants
 *      (a cashier logging in after a waitstaff gets dashboard access, etc.).
 */
export function PosLockGuard({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()
  const { posLocked, lockPos, unlockPos, setAuth, token, user } = useAuthStore()
  const business = useDeviceStore(s => s.business)
  const timer = useRef<any>(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)
  const [checking, setChecking] = useState(false)

  // Only POS-facing sessions auto-lock (they have a PIN). Password-only admins
  // on a back-office machine are not PIN-locked.
  const lockable = (user?.roles ?? []).some(r => r === 'operational_staff' || r === 'cashier')

  const resetTimer = useCallback(() => {
    if (!lockable || posLocked) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      // Persist that we're locked, then drop the session (keep device/business).
      lockPos()
    }, IDLE_MS)
  }, [lockable, posLocked, lockPos])

  useEffect(() => {
    if (!lockable) return
    const events = ['mousemove','mousedown','keydown','touchstart','scroll','click']
    const handler = () => resetTimer()
    events.forEach(e => window.addEventListener(e, handler, { passive: true }))
    resetTimer()
    return () => {
      events.forEach(e => window.removeEventListener(e, handler))
      if (timer.current) clearTimeout(timer.current)
    }
  }, [lockable, resetTimer])

  async function unlock(fullPin: string) {
    if (!business) { setError(true); return }
    setChecking(true)
    try {
      // Re-authenticate as whoever entered the PIN — this may be a different user.
      const res = await authApi.pinLogin({ business_id: business.id, pin: fullPin })
      setAuth(res.data.data)               // fresh session with the new user's roles
      unlockPos(); setPin(''); setError(false)
      // Land the new user on their appropriate home.
      const roles = res.data.data.user.roles
      navigate(isWaitstaffOnly(roles) ? '/floor' : '/floor')  // stay in POS context
      resetTimer()
    } catch {
      setError(true); setPin('')
      setTimeout(() => setError(false), 1200)
    } finally { setChecking(false) }
  }

  function pressKey(d: string) {
    if (checking) return
    const next = (pin + d).slice(0, 4)
    setPin(next)
    if (next.length === 4) unlock(next)
  }

  return (
    <>
      {children}
      {posLocked && (
        <div className="fixed inset-0 z-[100] bg-slate-900/95 backdrop-blur-sm flex items-center justify-center">
          <div className="w-full max-w-xs text-center">
            <div className="w-16 h-16 bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Lock className="w-8 h-8 text-amber-400" />
            </div>
            <h2 className="text-white font-bold text-xl mb-1">Screen Locked</h2>
            <p className="text-slate-400 text-sm mb-1">{business?.name ?? 'SMEazy POS'}</p>
            <p className="text-slate-500 text-xs mb-6">Enter your PIN to sign in. Pending tables are saved.</p>
            <div className={clsx('flex justify-center gap-3 mb-6', error && 'animate-shake')}>
              {[0,1,2,3].map(i => (
                <div key={i} className={clsx('w-4 h-4 rounded-full border-2 transition-colors',
                  error ? 'border-red-500' : i < pin.length ? 'bg-emerald-500 border-emerald-500' : 'border-slate-600')} />
              ))}
            </div>
            <div className="grid grid-cols-3 gap-3">
              {['1','2','3','4','5','6','7','8','9'].map(d => (
                <button key={d} onClick={() => pressKey(d)} disabled={checking}
                  className="bg-slate-800 hover:bg-slate-700 text-white text-2xl font-semibold rounded-xl py-4 transition-colors disabled:opacity-50">
                  {d}
                </button>
              ))}
              <div />
              <button onClick={() => pressKey('0')} disabled={checking}
                className="bg-slate-800 hover:bg-slate-700 text-white text-2xl font-semibold rounded-xl py-4 transition-colors disabled:opacity-50">0</button>
              <button onClick={() => setPin(pin.slice(0, -1))} disabled={checking}
                className="bg-slate-800 hover:bg-slate-700 text-white rounded-xl py-4 flex items-center justify-center transition-colors disabled:opacity-50">
                <Delete className="w-6 h-6" />
              </button>
            </div>
            {error && <p className="text-red-400 text-sm mt-4">Incorrect PIN</p>}
          </div>
        </div>
      )}
    </>
  )
}
