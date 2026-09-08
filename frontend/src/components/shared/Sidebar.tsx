import { Link, useLocation, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Grid3X3, UtensilsCrossed, Package, BarChart2, Users, User, LogOut, Monitor, CreditCard, ScrollText, Settings, BedDouble, Wallet } from 'lucide-react'
import { useAuthStore, useDeviceStore } from '../../hooks/useAuth'
import { can, isWaitstaffOnly } from '../../lib/permissions'
import clsx from 'clsx'

export function Sidebar() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()
  const business = useDeviceStore(s => s.business)
  const roles = user?.roles

  // Build nav from capabilities (union across all roles)
  const nav: { href: string; label: string; icon: any; show: boolean }[] = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, show: can(roles, 'dashboard') },
    { href: '/floor',     label: 'Floor Plan', icon: Grid3X3,        show: can(roles, 'pos') },
    { href: '/kitchen',   label: 'Kitchen',    icon: UtensilsCrossed, show: can(roles, 'kitchen') },
    { href: '/inventory', label: 'Inventory',  icon: Package,        show: can(roles, 'inventory') },
    { href: '/accommodation', label: 'Accommodation', icon: BedDouble, show: can(roles, 'accommodation') },
    { href: '/customers', label: 'Customers',  icon: Wallet,         show: can(roles, 'customers') },
    { href: '/analytics', label: 'Analytics',  icon: BarChart2,      show: can(roles, 'analytics') },
    { href: '/registers', label: 'Registers',  icon: CreditCard,     show: can(roles, 'registers') },
    { href: '/staff',     label: 'Staff',      icon: Users,          show: can(roles, 'staff') },
    { href: '/logs',      label: 'Logs',       icon: ScrollText,     show: can(roles, 'logs') },
    { href: '/settings',  label: 'Settings',   icon: Settings,       show: can(roles, 'settings') },
  ].filter(n => n.show)

  const hasPos = can(roles, 'pos')

  return (
    <aside className="w-56 bg-slate-900 h-screen flex flex-col fixed left-0 top-0 z-30 print:hidden">
      <div className="p-4 border-b border-slate-700">
        <div className="flex items-center gap-3">
          {business?.logo_url
            ? <img src={business.logo_url} alt="logo" className="w-10 h-10 rounded-xl object-contain bg-white p-0.5" />
            : <div className="w-10 h-10 bg-brand-600 rounded-xl flex items-center justify-center text-white font-black text-lg">
                {business?.name?.[0]?.toUpperCase() ?? 'S'}
              </div>}
          <div className="min-w-0">
            <p className="text-sm font-bold text-white truncate">{business?.name ?? 'SMEazy POS'}</p>
            <p className="text-xs text-slate-400">SMEazy POS</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = location.pathname === href || location.pathname.startsWith(href + '/')
          return (
            <Link key={href} to={href} className={clsx(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
              active ? 'bg-brand-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white')}>
              <Icon className="w-4 h-4 shrink-0" />{label}
            </Link>
          )
        })}
      </nav>

      {/* Quick jump to POS floor for users who have both dashboard + pos */}
      {hasPos && can(roles, 'dashboard') && (
        <div className="px-3 pb-2">
          <button onClick={() => navigate('/floor')}
            className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium transition-colors">
            <Monitor className="w-4 h-4" /> Go to POS
          </button>
        </div>
      )}

      <div className="p-3 border-t border-slate-700">
        <Link to="/profile" className="flex items-center gap-3 px-3 py-2 mb-1 rounded-lg hover:bg-slate-800 transition-colors group">
          <div className="w-7 h-7 rounded-full bg-brand-600 flex items-center justify-center text-white font-bold text-xs shrink-0">
            {user?.username?.[0]?.toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-white truncate">{user?.display_name ?? user?.username}</p>
            <p className="text-xs text-slate-400 capitalize truncate">{(user?.roles ?? []).map(r => r.replace(/_/g,' ')).join(', ')}</p>
          </div>
          <User className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-300 shrink-0" />
        </Link>
        <button onClick={() => { logout(); navigate('/login') }} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-slate-400 hover:bg-red-900 hover:text-red-300 transition-colors">
          <LogOut className="w-4 h-4" /> Sign out
        </button>
      </div>
    </aside>
  )
}
