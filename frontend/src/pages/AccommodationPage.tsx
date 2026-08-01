import { useEffect, useState } from 'react'
import { BedDouble, Key, Sparkles, RefreshCw, Clock } from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { Layout } from '../components/shared/Layout'
import { accommodationApi } from '../lib/api'
import { Spinner } from '../components/shared/Spinner'
import { useAuthStore } from '../hooks/useAuth'

interface Room {
  item_id: string; room_name: string; sku?: string; status: string;
  current_order_id?: string; occupied_at?: string; next_readying_at?: string;
}

const STATUS_INFO: Record<string, { label: string; icon: any; card: string; badge: string }> = {
  ready:    { label: 'Ready',    icon: Key,       card: 'border-emerald-200 bg-emerald-50', badge: 'bg-emerald-100 text-emerald-700' },
  occupied: { label: 'Occupied', icon: BedDouble, card: 'border-red-200 bg-red-50',          badge: 'bg-red-100 text-red-700' },
  readying: { label: 'Readying', icon: Sparkles,  card: 'border-amber-200 bg-amber-50',       badge: 'bg-amber-100 text-amber-700' },
}

function fmtTime(iso?: string) {
  if (!iso) return null
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z')
  return d.toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' })
}

export default function AccommodationPage() {
  const roles = useAuthStore(s => s.user?.roles)
  const canSetReady = (roles ?? []).some(r => ['entrepreneur','admin_staff','executive_staff','cashier','storekeeper'].includes(r))
  const [rooms, setRooms] = useState<Room[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string|null>(null)

  async function load() {
    const res = await accommodationApi.listRooms().catch(() => null)
    if (res) setRooms(res.data.data ?? [])
    setLoading(false)
  }
  useEffect(() => {
    load()
    const t = setInterval(load, 30000) // statuses change autonomously — keep the board fresh
    return () => clearInterval(t)
  }, [])

  async function markReady(itemId: string) {
    setBusyId(itemId)
    try {
      await accommodationApi.setReady(itemId)
      toast.success('Room marked Ready')
      load()
    } catch (e: any) {
      toast.error(e.response?.data?.error?.message ?? 'Failed to update room')
    } finally { setBusyId(null) }
  }

  const counts = rooms.reduce((acc, r) => { acc[r.status] = (acc[r.status] ?? 0) + 1; return acc }, {} as Record<string, number>)

  return (
    <Layout>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><BedDouble className="w-6 h-6 text-brand-600" /> Accommodation</h1>
          <p className="text-slate-500 text-sm mt-0.5">{rooms.length} rooms · {counts.ready ?? 0} ready · {counts.occupied ?? 0} occupied · {counts.readying ?? 0} readying</p>
        </div>
        <button onClick={load} className="btn-secondary p-2.5"><RefreshCw className="w-4 h-4" /></button>
      </div>

      {loading ? <div className="flex justify-center pt-12"><Spinner size="lg" /></div> : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {rooms.map(room => {
            const info = STATUS_INFO[room.status] ?? STATUS_INFO.ready
            const Icon = info.icon
            return (
              <div key={room.item_id} className={clsx('card p-5 border-2', info.card)}>
                <div className="flex items-start justify-between mb-3">
                  <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-sm">
                    <Icon className="w-5 h-5 text-slate-700" />
                  </div>
                  <span className={clsx('px-2 py-0.5 rounded-full text-xs font-semibold', info.badge)}>{info.label}</span>
                </div>
                <p className="font-semibold">{room.room_name}</p>
                {room.sku && <p className="text-xs text-slate-400 font-mono">{room.sku}</p>}

                {room.status === 'occupied' && room.next_readying_at && (
                  <p className="text-xs text-slate-500 mt-2 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Checkout by {fmtTime(room.next_readying_at)}
                  </p>
                )}
                {room.status === 'readying' && (
                  <p className="text-xs text-amber-600 mt-2">Needs housekeeping before it can be marked Ready</p>
                )}

                {room.status !== 'ready' && canSetReady && (
                  <button onClick={() => markReady(room.item_id)} disabled={busyId === room.item_id}
                    className="mt-3 w-full flex items-center justify-center gap-1.5 bg-white border border-slate-200 hover:border-emerald-400 hover:text-emerald-700 text-slate-600 text-xs font-medium py-2 rounded-lg transition-colors disabled:opacity-50">
                    {busyId === room.item_id ? <Spinner size="sm" /> : <><Key className="w-3.5 h-3.5" /> Mark Ready (key at reception)</>}
                  </button>
                )}
              </div>
            )
          })}
          {rooms.length === 0 && (
            <div className="col-span-full card p-16 text-center text-slate-400">
              <BedDouble className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No rooms yet. Add products in a category tagged with the Accommodation department to see them here.</p>
            </div>
          )}
        </div>
      )}
    </Layout>
  )
}
