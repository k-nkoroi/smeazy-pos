import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Grid3X3, UtensilsCrossed, Package, BarChart2, TrendingUp, Users, CreditCard, BedDouble } from 'lucide-react'
import { Layout } from '../components/shared/Layout'
import { useAuthStore, useDeviceStore } from '../hooks/useAuth'
import { posApi, inventoryApi } from '../lib/api'
import { can } from '../lib/permissions'

export default function DashboardPage() {
  const user = useAuthStore(s => s.user)
  const business = useDeviceStore(s => s.business)
  const roles = user?.roles
  const [stats, setStats] = useState({ revenue: 0, orders: 0, items: 0, alerts: 0 })
  const today = new Date().toLocaleDateString('en-KE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  useEffect(() => {
    Promise.allSettled([posApi.summary(), inventoryApi.listItems(), inventoryApi.alerts()]).then(([s, items, alerts]) => {
      setStats({
        revenue: s.status === 'fulfilled' ? s.value.data.data?.total_revenue ?? 0 : 0,
        orders:  s.status === 'fulfilled' ? s.value.data.data?.paid ?? 0 : 0,
        items:   items.status === 'fulfilled' ? items.value.data.data?.length ?? 0 : 0,
        alerts:  alerts.status === 'fulfilled' ? alerts.value.data.data?.length ?? 0 : 0,
      })
    })
  }, [])

  const hr = new Date().getHours()
  const greeting = hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening'

  // Only show KPI cards and quick-access tiles the user can actually open.
  const kpis = [
    { label: "Today's Revenue", value: `KES ${stats.revenue.toLocaleString()}`, icon: TrendingUp, color: 'bg-emerald-500', href: '/analytics', cap: 'analytics' as const },
    { label: "Orders Paid",     value: stats.orders,  icon: BarChart2,  color: 'bg-brand-600',   href: '/analytics', cap: 'analytics' as const },
    { label: "Inventory Items", value: stats.items,   icon: Package,    color: 'bg-violet-500',  href: '/inventory', cap: 'inventory' as const },
    { label: "Low Stock",       value: stats.alerts,  icon: Package,    color: 'bg-amber-500',   href: '/inventory', cap: 'inventory' as const },
  ].filter(k => can(roles, k.cap))

  const tiles = [
    { href: '/floor',     icon: Grid3X3,          label: 'Floor Plan',     sub: 'Open & manage tables', color: 'text-brand-600 bg-brand-50',     cap: 'pos' as const },
    { href: '/kitchen',   icon: UtensilsCrossed,  label: 'Kitchen Screen', sub: 'View live orders',     color: 'text-orange-600 bg-orange-50',   cap: 'kitchen' as const },
    { href: '/inventory', icon: Package,          label: 'Inventory',      sub: 'Stock & categories',   color: 'text-violet-600 bg-violet-50',   cap: 'inventory' as const },
    { href: '/accommodation', icon: BedDouble,    label: 'Accommodation',  sub: 'Room status board',    color: 'text-rose-600 bg-rose-50',       cap: 'accommodation' as const },
    { href: '/analytics', icon: BarChart2,        label: 'Analytics',      sub: 'Sales & revenue',      color: 'text-emerald-600 bg-emerald-50', cap: 'analytics' as const },
    { href: '/registers', icon: CreditCard,       label: 'Registers',      sub: 'Tills & departments',  color: 'text-teal-600 bg-teal-50',       cap: 'registers' as const },
    { href: '/staff',     icon: Users,            label: 'Staff',          sub: 'Team & roles',         color: 'text-pink-600 bg-pink-50',       cap: 'staff' as const },
  ].filter(t => can(roles, t.cap))

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">{greeting}, {user?.username} 👋</h1>
        <p className="text-slate-500 text-sm mt-1">{today}</p>
      </div>
      {kpis.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {kpis.map(({ label, value, icon: Icon, color, href }) => (
            <Link key={href+label} to={href} className="card p-5 hover:shadow-md transition-shadow block">
              <div className="flex items-start justify-between">
                <div><p className="text-sm text-slate-500">{label}</p><p className="text-2xl font-bold mt-1">{value}</p></div>
                <div className={`w-10 h-10 rounded-lg ${color} flex items-center justify-center`}><Icon className="w-5 h-5 text-white" /></div>
              </div>
            </Link>
          ))}
        </div>
      )}
      <h2 className="text-lg font-semibold mb-4">Quick access</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {tiles.map(({ href, icon: Icon, label, sub, color }) => (
          <Link key={href} to={href} className="card p-5 hover:shadow-md transition-shadow flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl ${color} flex items-center justify-center shrink-0`}><Icon className="w-6 h-6" /></div>
            <div><p className="font-semibold text-slate-900">{label}</p><p className="text-xs text-slate-500 mt-0.5">{sub}</p></div>
          </Link>
        ))}
      </div>
    </Layout>
  )
}
