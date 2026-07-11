import { useEffect, useState, useRef } from 'react'
import { Clock, ChefHat, CheckCircle, Truck, RefreshCw, Bell } from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { kitchenApi } from '../lib/api'
import { Spinner } from '../components/shared/Spinner'

interface KitchenItem {
  id: string; name: string; quantity: number;
  status: string; notes?: string; dispatched_at?: string;
}
interface KitchenOrder {
  id: string; order_id: string; table_name: string;
  waitstaff_name?: string; status: string; notes?: string;
  sent_at: string; acknowledged_at?: string;
  items: KitchenItem[];
}

function timeAgo(dateStr: string) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`
  return `${Math.floor(diff/3600)}h ago`
}

const STATUS_CARD: Record<string, string> = {
  pending:     'bg-amber-950 border-amber-500',
  in_progress: 'bg-blue-950 border-blue-500',
}
const ITEM_STATUS: Record<string, string> = {
  new:        'bg-amber-900 text-amber-200',
  processing: 'bg-blue-900 text-blue-200',
  dispatched: 'bg-emerald-900 text-emerald-200',
}

export default function KitchenPage() {
  const [orders, setOrders] = useState<KitchenOrder[]>([])
  const [loading, setLoading] = useState(true)
  const intervalRef = useRef<any>(null)
  const prevCount = useRef(0)

  async function load(silent = false) {
    if (!silent) setLoading(true)
    const res = await kitchenApi.listActive().catch(() => null)
    if (res) {
      const data: KitchenOrder[] = res.data.data ?? []
      if (data.length > prevCount.current && prevCount.current >= 0) {
        toast('🔔 New kitchen order!', { duration: 3000, style: { background: '#f59e0b', color: '#000' } })
      }
      prevCount.current = data.length
      setOrders(data)
    }
    if (!silent) setLoading(false)
  }

  useEffect(() => {
    load()
    intervalRef.current = setInterval(() => load(true), 8000) // poll every 8s
    return () => clearInterval(intervalRef.current)
  }, [])

  async function acknowledge(orderId: string) {
    await kitchenApi.acknowledge(orderId)
    toast.success('Order acknowledged')
    load(true)
  }

  async function dispatch(itemId: string) {
    await kitchenApi.dispatch(itemId)
    load(true)
  }

  const pendingOrders    = orders.filter(o => o.status === 'pending')
  const inProgressOrders = orders.filter(o => o.status === 'in_progress')

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <div className="bg-slate-900 border-b border-slate-700 px-6 py-4 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-orange-600 rounded-xl flex items-center justify-center">
            <ChefHat className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Kitchen Display</h1>
            <p className="text-slate-400 text-xs">{orders.length} active order{orders.length !== 1 ? 's' : ''} · auto-refresh 8s</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {pendingOrders.length > 0 && (
            <div className="flex items-center gap-2 bg-amber-600 rounded-lg px-3 py-1.5">
              <Bell className="w-4 h-4 animate-pulse" />
              <span className="text-sm font-bold">{pendingOrders.length} new</span>
            </div>
          )}
          <button onClick={() => load()} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center pt-20"><Spinner size="lg" /></div>
      ) : orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center pt-32 text-slate-600">
          <ChefHat className="w-16 h-16 mb-4 opacity-30" />
          <p className="text-xl font-medium">All clear — no pending orders</p>
          <p className="text-sm mt-2 opacity-60">New orders will appear here automatically</p>
        </div>
      ) : (
        <div className="p-6">
          {/* Pending column */}
          {pendingOrders.length > 0 && (
            <div className="mb-8">
              <h2 className="text-amber-400 font-bold text-sm uppercase tracking-widest mb-4 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse inline-block" />
                New Orders ({pendingOrders.length})
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {pendingOrders.map(order => (
                  <KitchenCard key={order.id} order={order} onAck={acknowledge} onDispatch={dispatch} />
                ))}
              </div>
            </div>
          )}

          {/* In progress */}
          {inProgressOrders.length > 0 && (
            <div>
              <h2 className="text-blue-400 font-bold text-sm uppercase tracking-widest mb-4 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />
                In Progress ({inProgressOrders.length})
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {inProgressOrders.map(order => (
                  <KitchenCard key={order.id} order={order} onAck={acknowledge} onDispatch={dispatch} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function KitchenCard({ order, onAck, onDispatch }: {
  order: KitchenOrder
  onAck: (id: string) => void
  onDispatch: (itemId: string) => void
}) {
  const allDispatched = order.items.every(i => i.status === 'dispatched')
  const elapsed = Math.floor((Date.now() - new Date(order.sent_at).getTime()) / 1000)
  const urgent = elapsed > 600 // 10 min

  return (
    <div className={clsx('rounded-2xl border-2 p-4 flex flex-col gap-3',
      STATUS_CARD[order.status] ?? 'bg-slate-800 border-slate-600',
      urgent && order.status === 'pending' && 'animate-pulse border-red-500 bg-red-950'
    )}>
      {/* Card header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-white font-bold text-xl">{order.table_name}</span>
            {urgent && <span className="text-xs bg-red-600 text-white px-2 py-0.5 rounded-full font-medium animate-bounce">URGENT</span>}
          </div>
          {order.waitstaff_name && (
            <p className="text-slate-400 text-xs mt-0.5">by {order.waitstaff_name}</p>
          )}
        </div>
        <div className="text-right">
          <div className="flex items-center gap-1 text-slate-400 text-xs">
            <Clock className="w-3 h-3" />
            {timeAgo(order.sent_at)}
          </div>
          <div className="text-xs mt-1">
            {order.status === 'pending'
              ? <span className="text-amber-400 font-medium">● Pending</span>
              : <span className="text-blue-400 font-medium">● Cooking</span>}
          </div>
        </div>
      </div>

      {order.notes && (
        <p className="text-xs text-amber-300 bg-amber-950 border border-amber-700 rounded-lg px-3 py-2">
          📝 {order.notes}
        </p>
      )}

      {/* Items list */}
      <div className="space-y-2">
        {order.items.map(item => (
          <div key={item.id} className={clsx('flex items-center justify-between rounded-lg px-3 py-2', ITEM_STATUS[item.status] ?? 'bg-slate-700 text-slate-300')}>
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="font-bold text-sm w-6 shrink-0">×{item.quantity}</span>
              <div className="min-w-0">
                <p className="font-medium text-sm truncate">{item.name}</p>
                {item.notes && <p className="text-xs opacity-70">{item.notes}</p>}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 ml-2">
              <span className="text-xs px-1.5 py-0.5 rounded bg-black bg-opacity-30 font-medium">{item.status}</span>
              {item.status !== 'dispatched' && (
                <button onClick={() => onDispatch(item.id)}
                  className="w-7 h-7 rounded-lg bg-emerald-600 hover:bg-emerald-500 flex items-center justify-center transition-colors"
                  title="Mark dispatched">
                  <Truck className="w-3.5 h-3.5 text-white" />
                </button>
              )}
              {item.status === 'dispatched' && (
                <CheckCircle className="w-5 h-5 text-emerald-400" />
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      {order.status === 'pending' && (
        <button onClick={() => onAck(order.id)}
          className="w-full bg-orange-600 hover:bg-orange-500 text-white font-bold py-2.5 rounded-xl transition-colors text-sm">
          ✅ Acknowledge & Start Cooking
        </button>
      )}
      {order.status === 'in_progress' && allDispatched && (
        <div className="text-center text-emerald-400 text-sm font-medium py-2 border border-emerald-700 rounded-xl">
          ✓ All items dispatched · awaiting payment
        </div>
      )}
      {order.status === 'in_progress' && !allDispatched && (
        <div className="text-center text-blue-300 text-xs py-2 opacity-70">
          {order.items.filter(i => i.status === 'dispatched').length}/{order.items.length} dispatched
        </div>
      )}
    </div>
  )
}
