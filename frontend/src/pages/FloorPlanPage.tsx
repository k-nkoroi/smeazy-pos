import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, RefreshCw, ArrowRight, Merge, LayoutDashboard, Trash2, CreditCard } from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { Layout } from '../components/shared/Layout'
import { tablesApi, posApi, authApi } from '../lib/api'
import { Spinner } from '../components/shared/Spinner'
import { useAuthStore, useDeviceStore } from '../hooks/useAuth'
import { isWaitstaffOnly } from '../lib/permissions'

interface TableStatus {
  id: string; area_name: string; table_name: string;
  capacity: number; status: string; order_id?: string;
  order_total?: number; waitstaff_name?: string; guest_count?: number; opened_at?: string;
}

export default function FloorPlanPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [tables, setTables] = useState<TableStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [activeArea, setActiveArea] = useState<string>('All')
  const [contextMenu, setContextMenu] = useState<{ table: TableStatus; x: number; y: number } | null>(null)
  const [openModal, setOpenModal] = useState<TableStatus | null>(null)
  const [guestCount, setGuestCount] = useState(2)
  const [waitstaff, setWaitstaff] = useState<any[]>([])
  const [selectedWaiter, setSelectedWaiter] = useState('')
  const [selectedWaiterName, setSelectedWaiterName] = useState('')
  const [newTableName, setNewTableName] = useState('')
  const [newTableArea, setNewTableArea] = useState('Main Hall')
  const [newTableCapacity, setNewTableCapacity] = useState('')
  const [showAddTable, setShowAddTable] = useState(false)
  const [opening, setOpening] = useState(false)
  const intervalRef = useRef<any>(null)
  const [assignWaitstaffOrder, setAssignWaitstaffOrder] = useState<string|null>(null)
  const { registerName, setRegister } = useDeviceStore()
  const [registers, setRegisters] = useState<any[]>([])
  const [showRegisterPicker, setShowRegisterPicker] = useState(false)

  const areas = ['All', ...Array.from(new Set(tables.map(t => t.area_name)))]

  async function load() {
    const res = await tablesApi.list().catch(() => null)
    if (res) setTables(res.data.data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    // listStaffPos returns UserPublic {id,...} — the id matches users(id) FK on pos_orders.
    authApi.listStaffPos().then(r => setWaitstaff(r.data.data ?? [])).catch(() => {})
    authApi.listRegisters().then(r => setRegisters(r.data.data ?? [])).catch(() => {})
    intervalRef.current = setInterval(load, 15000) // auto-refresh every 15s
    return () => clearInterval(intervalRef.current)
  }, [])

  const filtered = activeArea === 'All' ? tables : tables.filter(t => t.area_name === activeArea)

  function handleContextMenu(e: React.MouseEvent, table: TableStatus) {
    e.preventDefault()
    setContextMenu({ table, x: e.clientX, y: e.clientY })
  }

  async function openTable(table: TableStatus) {
    if (table.status === 'occupied' && table.order_id) {
      navigate(`/pos/${table.order_id}`)
      return
    }
    setOpenModal(table)
    setGuestCount(2)
  }

  async function createOrder() {
    if (!openModal) return
    setOpening(true)
    try {
      // Waitstaff-only staff cannot assign the table to someone else — it always
      // defaults to their own account. Cashiers/managers/admins may pick anyone.
      const forceSelf = isWaitstaffOnly(user?.roles)
      const res = await posApi.createOrder({
        table_id: openModal.id,
        table_name: openModal.table_name,
        guest_count: guestCount,
        waitstaff_id: forceSelf ? user?.id : (selectedWaiter || user?.id),
        waitstaff_name: forceSelf ? (user?.display_name || user?.username) : (selectedWaiterName || user?.display_name || user?.username),
      })
      toast.success(`Table ${openModal.table_name} opened`)
      setOpenModal(null)
      navigate(`/pos/${res.data.data.id}`)
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message ?? 'Failed to open table')
    } finally { setOpening(false) }
  }

  async function addTable() {
    if (!newTableName) return toast.error('Table name required')
    try {
      await tablesApi.create({ table_name: newTableName, area_name: newTableArea, capacity: newTableCapacity ? parseInt(newTableCapacity) : undefined })
      toast.success('Table added')
      setShowAddTable(false); setNewTableName(''); setNewTableCapacity(''); load()
    } catch { toast.error('Failed to add table') }
  }

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <div className="bg-slate-800 border-b border-slate-700 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="text-white font-bold text-lg">🍽 Floor Plan</span>
          <div className="flex gap-1">
            {areas.map(area => (
              <button key={area} onClick={() => setActiveArea(area)}
                className={clsx('px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                  activeArea === area ? 'bg-brand-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-700')}>
                {area}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowRegisterPicker(true)}
            className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-white px-3 py-2 rounded-lg text-sm font-medium">
            <CreditCard className="w-4 h-4" /> {registerName ?? 'All Departments'}
          </button>
          {!isWaitstaffOnly(user?.roles) && (
            <button onClick={() => navigate('/dashboard')}
              className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-white px-3 py-2 rounded-lg text-sm font-medium">
              <LayoutDashboard className="w-4 h-4" /> Dashboard
            </button>
          )}
          <button onClick={load} className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-700">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button onClick={() => setShowAddTable(true)} className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-3 py-2 rounded-lg text-sm font-medium">
            <Plus className="w-4 h-4" /> Add Table
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center pt-20"><Spinner size="lg" /></div>
      ) : (
        <div className="p-6 grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
          {filtered.map(table => (
            <div key={table.id}
              className={clsx('rounded-xl p-4 cursor-pointer select-none transition-all duration-200 relative',
                'border-2 hover:scale-105',
                table.status === 'occupied'
                  ? 'bg-red-900 border-red-500 hover:bg-red-800'
                  : 'bg-emerald-900 border-emerald-500 hover:bg-emerald-800'
              )}
              onClick={() => openTable(table)}
              onContextMenu={e => handleContextMenu(e, table)}>
              <div className="text-center">
                <div className="text-white font-bold text-lg">{table.table_name}</div>
                <div className="text-xs mt-1" style={{ color: table.status === 'occupied' ? '#fca5a5' : '#86efac' }}>
                  {table.status === 'occupied' ? '● Occupied' : '○ Available'}
                </div>
                {table.status === 'occupied' && (
                  <>
                    <div className="mt-2 bg-black bg-opacity-30 rounded-lg px-2 py-1">
                      <div className="text-yellow-300 font-bold text-sm">
                        KES {(table.order_total ?? 0).toLocaleString()}
                      </div>
                    </div>
                    {table.waitstaff_name && (
                      <div className="text-xs text-red-200 mt-1 truncate">{table.waitstaff_name}</div>
                    )}
                    {table.guest_count && (
                      <div className="text-xs text-red-300">👥 {table.guest_count}</div>
                    )}
                  </>
                )}
                {table.capacity && table.status === 'available' && (
                  <div className="text-xs text-emerald-300 mt-1">👥 {table.capacity} max</div>
                )}
              </div>
            </div>
          ))}

          {filtered.length === 0 && (
            <div className="col-span-full text-center text-slate-500 py-16">
              <p className="text-lg">No tables in this area</p>
              <button onClick={() => setShowAddTable(true)} className="mt-4 text-brand-400 hover:underline">Add your first table →</button>
            </div>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="fixed bottom-4 left-60 flex gap-4 text-xs">
        <div className="flex items-center gap-2 bg-slate-800 rounded-lg px-3 py-2">
          <div className="w-3 h-3 rounded bg-emerald-500" /><span className="text-slate-300">Available</span>
        </div>
        <div className="flex items-center gap-2 bg-slate-800 rounded-lg px-3 py-2">
          <div className="w-3 h-3 rounded bg-red-500" /><span className="text-slate-300">Occupied</span>
        </div>
        <div className="bg-slate-800 rounded-lg px-3 py-2 text-slate-300">
          Right-click for table options
        </div>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} />
          <div className="fixed z-50 bg-slate-800 border border-slate-600 rounded-xl shadow-xl py-1 min-w-[180px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}>
            <div className="px-4 py-2 text-xs font-semibold text-slate-400 border-b border-slate-700">
              Table {contextMenu.table.table_name}
            </div>
            {contextMenu.table.status === 'occupied' && (
              <>
                <button className="w-full text-left px-4 py-2.5 text-sm text-white hover:bg-slate-700 flex items-center gap-2"
                  onClick={() => { navigate(`/pos/${contextMenu.table.order_id}`); setContextMenu(null) }}>
                  <ArrowRight className="w-4 h-4" /> Open Order
                </button>
                <button className="w-full text-left px-4 py-2.5 text-sm text-white hover:bg-slate-700 flex items-center gap-2"
                  onClick={async () => {
                    const to = filtered.find(t => t.status === 'available' && t.id !== contextMenu.table.id)
                    if (!to) return toast.error('No available tables to transfer to')
                    await tablesApi.transfer({ from_table_id: contextMenu.table.id, to_table_id: to.id })
                    toast.success('Table transferred'); setContextMenu(null); load()
                  }}>
                  <ArrowRight className="w-4 h-4" /> Transfer Table
                </button>
                {!isWaitstaffOnly(user?.roles) && (
                  <button className="w-full text-left px-4 py-2.5 text-sm text-white hover:bg-slate-700 flex items-center gap-2"
                    onClick={() => { setAssignWaitstaffOrder(contextMenu.table.order_id ?? null); setContextMenu(null) }}>
                    <ArrowRight className="w-4 h-4" /> Assign Waitstaff
                  </button>
                )}
                <button className="w-full text-left px-4 py-2.5 text-sm text-red-300 hover:bg-red-900/40 flex items-center gap-2 border-t border-slate-700"
                  onClick={async () => {
                    const oid = contextMenu.table.order_id
                    setContextMenu(null)
                    if (!oid) return
                    if (!confirm(`Clear table ${contextMenu.table.table_name}? This voids the open order (use only if opened by mistake).`)) return
                    try {
                      await posApi.voidOrder(oid)
                      toast.success('Table cleared')
                      load()
                    } catch (err: any) {
                      toast.error(err.response?.data?.error?.message ?? 'Failed to clear table')
                    }
                  }}>
                  <Trash2 className="w-4 h-4" /> Clear Table
                </button>
              </>
            )}
          </div>
        </>
      )}

      {/* Open table modal */}
      {openModal && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-2xl p-6 w-96 border border-slate-600">
            <h2 className="text-white font-bold text-xl mb-1">Open Table {openModal.table_name}</h2>
            <p className="text-slate-400 text-sm mb-5">{openModal.area_name}</p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-300 mb-2">Number of guests</label>
              <div className="flex items-center gap-3">
                <button onClick={() => setGuestCount(g => Math.max(1, g-1))} className="w-10 h-10 rounded-lg bg-slate-700 text-white font-bold text-xl hover:bg-slate-600">-</button>
                <span className="text-white font-bold text-2xl w-10 text-center">{guestCount}</span>
                <button onClick={() => setGuestCount(g => g+1)} className="w-10 h-10 rounded-lg bg-slate-700 text-white font-bold text-xl hover:bg-slate-600">+</button>
              </div>
            </div>
            {waitstaff.length > 0 && !isWaitstaffOnly(user?.roles) && (
              <div className="mb-5">
                <label className="block text-sm font-medium text-slate-300 mb-2">Assign waitstaff</label>
                <select className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm"
                  value={selectedWaiter} onChange={e => {
                    setSelectedWaiter(e.target.value)
                    const w = waitstaff.find((s: any) => s.id === e.target.value)
                    setSelectedWaiterName(w?.display_name ?? w?.username ?? '')
                  }}>
                  <option value="">Use my account ({user?.username})</option>
                  {waitstaff.map((s: any) => <option key={s.id} value={s.id}>{s.display_name ?? s.username}</option>)}
                </select>
              </div>
            )}
            {isWaitstaffOnly(user?.roles) && (
              <p className="text-slate-400 text-xs mb-5">This table will be assigned to you.</p>
            )}
            <div className="flex gap-3">
              <button className="flex-1 btn-primary" onClick={createOrder} disabled={opening}>
                {opening ? <Spinner size="sm" /> : 'Open Table'}
              </button>
              <button className="btn-secondary" onClick={() => setOpenModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Assign waitstaff modal */}
      {assignWaitstaffOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-2xl p-6 w-80 border border-slate-600">
            <h2 className="text-white font-bold text-lg mb-4">Assign Waitstaff</h2>
            <div className="space-y-2 max-h-64 overflow-y-auto mb-4">
              {waitstaff.map((s: any) => (
                <button key={s.id} onClick={async () => {
                    await posApi.updateWaitstaff(assignWaitstaffOrder, { waitstaff_id: s.id, waitstaff_name: s.display_name ?? s.username })
                    toast.success(`Assigned to ${s.display_name ?? s.username}`)
                    setAssignWaitstaffOrder(null); load()
                  }}
                  className="w-full text-left px-4 py-3 rounded-xl border border-slate-600 hover:border-brand-500 bg-slate-700 hover:bg-slate-600 transition-colors">
                  <p className="text-white font-medium">{s.display_name ?? s.username}</p>
                  <p className="text-slate-400 text-xs capitalize">{s.role?.replace(/_/g,' ')}</p>
                </button>
              ))}
              {waitstaff.length === 0 && <p className="text-slate-400 text-sm text-center py-4">No staff found. Add staff from the Staff page.</p>}
            </div>
            <button onClick={() => setAssignWaitstaffOrder(null)} className="btn-secondary w-full">Cancel</button>
          </div>
        </div>
      )}

      {/* Register picker modal */}
      {showRegisterPicker && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-2xl p-6 w-80 border border-slate-600">
            <h2 className="text-white font-bold text-lg mb-1">Select Register</h2>
            <p className="text-slate-400 text-sm mb-4">Scopes the POS to a register's departments</p>
            <div className="space-y-2 max-h-72 overflow-y-auto mb-4">
              <button onClick={() => { setRegister(null); setShowRegisterPicker(false) }}
                className={clsx('w-full text-left px-4 py-3 rounded-xl border-2 transition-colors',
                  !registerName ? 'border-brand-500 bg-brand-900' : 'border-slate-600 hover:border-slate-400 bg-slate-700')}>
                <p className="text-white font-medium">All Departments</p>
                <p className="text-slate-400 text-xs">Show every product</p>
              </button>
              {registers.map((r: any) => (
                <button key={r.id} onClick={() => { setRegister({ id: r.id, name: r.name, departments: r.departments }); setShowRegisterPicker(false) }}
                  className={clsx('w-full text-left px-4 py-3 rounded-xl border-2 transition-colors',
                    registerName === r.name ? 'border-brand-500 bg-brand-900' : 'border-slate-600 hover:border-slate-400 bg-slate-700')}>
                  <p className="text-white font-medium">{r.name}</p>
                  <p className="text-slate-400 text-xs">{r.departments.join(', ') || 'No departments'}</p>
                </button>
              ))}
              {registers.length === 0 && <p className="text-slate-400 text-sm text-center py-4">No registers configured. Create them from the Registers page.</p>}
            </div>
            <button onClick={() => setShowRegisterPicker(false)} className="btn-secondary w-full">Close</button>
          </div>
        </div>
      )}

      {/* Add table modal */}
      {showAddTable && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-2xl p-6 w-80 border border-slate-600">
            <h2 className="text-white font-bold text-lg mb-4">Add New Table</h2>
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-300 mb-2">Table name / number</label>
              <input className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm placeholder:text-slate-500"
                placeholder="e.g. T9, VIP1, Bar" value={newTableName} onChange={e => setNewTableName(e.target.value)} />
            </div>
            <div className="mb-5">
              <label className="block text-sm font-medium text-slate-300 mb-2">Area</label>
              <input className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm"
                placeholder="Main Hall" value={newTableArea} onChange={e => setNewTableArea(e.target.value)} />
            </div>
            <div className="mb-5">
              <label className="block text-sm font-medium text-slate-300 mb-2">Max guests</label>
              <input type="number" min="1" className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm"
                placeholder="4" value={newTableCapacity} onChange={e => setNewTableCapacity(e.target.value)} />
              <p className="text-xs text-slate-500 mt-1">Set higher for large-party tables (e.g. 25+ for group bookings).</p>
            </div>
            <div className="flex gap-3">
              <button className="flex-1 btn-primary" onClick={addTable}>Add Table</button>
              <button className="btn-secondary" onClick={() => setShowAddTable(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
