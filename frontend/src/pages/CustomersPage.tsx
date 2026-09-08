import { useEffect, useState } from 'react'
import { Search, Users, Wallet, ArrowLeft, CheckCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { Layout } from '../components/shared/Layout'
import { customersApi, posApi } from '../lib/api'
import { Spinner } from '../components/shared/Spinner'

const METHOD_COLORS: Record<string,string> = { cash:'bg-emerald-600', mpesa:'bg-green-500', card:'bg-blue-600' }

export default function CustomersPage() {
  const [loading, setLoading] = useState(true)
  const [customers, setCustomers] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [detail, setDetail] = useState<any|null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [settleOrder, setSettleOrder] = useState<any|null>(null)
  const [settleMethod, setSettleMethod] = useState('cash')
  const [settleAmount, setSettleAmount] = useState('')
  const [settleRef, setSettleRef] = useState('')
  const [settling, setSettling] = useState(false)

  async function load() {
    setLoading(true)
    const res = await customersApi.list().catch(()=>null)
    if (res) setCustomers(res.data.data ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function openCustomer(id: string) {
    setDetailLoading(true)
    const res = await customersApi.get(id).catch(()=>null)
    if (res) setDetail(res.data.data)
    setDetailLoading(false)
  }

  const filtered = customers.filter((c:any) =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.phone?.toLowerCase().includes(search.toLowerCase()))

  const totalOwed = customers.reduce((s,c)=>s+(c.balance_due||0), 0)

  function openSettle(order: any) {
    setSettleOrder(order); setSettleMethod('cash'); setSettleAmount(String(order.balance_due.toFixed(2))); setSettleRef('')
  }

  async function submitSettle() {
    if (!settleOrder) return
    const amt = parseFloat(settleAmount)
    if (isNaN(amt) || amt <= 0) return toast.error('Enter a valid amount')
    setSettling(true)
    try {
      await posApi.payTab(settleOrder.id, { payments: [{ method: settleMethod, amount: amt, reference: settleRef || undefined }] })
      toast.success('Payment recorded')
      setSettleOrder(null)
      await openCustomer(detail.id)
      load()
    } catch (e:any) { toast.error(e.response?.data?.error?.message ?? 'Failed to record payment') }
    finally { setSettling(false) }
  }

  return (
    <Layout>
      {!detail ? (
        <>
          <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-bold">Customers</h1>
              <p className="text-slate-500 text-sm mt-0.5">{customers.length} customers · KES {totalOwed.toLocaleString()} outstanding on tabs</p>
            </div>
            <div className="relative max-w-xs w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"/>
              <input value={search} onChange={e=>setSearch(e.target.value)} className="input pl-9" placeholder="Search name or phone..."/>
            </div>
          </div>

          {loading ? <div className="flex justify-center pt-12"><Spinner size="lg"/></div> : (
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-slate-100 bg-slate-50">
                  {['Customer','Phone','Open Tabs','Balance Due',''].map(h=>(<th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">{h}</th>))}
                </tr></thead>
                <tbody className="divide-y divide-slate-50">
                  {filtered.map((c:any)=>(
                    <tr key={c.id} className="hover:bg-slate-50 cursor-pointer" onClick={()=>openCustomer(c.id)}>
                      <td className="px-4 py-3 font-medium">{c.name}</td>
                      <td className="px-4 py-3 text-slate-500">{c.phone ?? '—'}</td>
                      <td className="px-4 py-3">{c.open_tabs>0 ? <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">{c.open_tabs}</span> : <span className="text-slate-300">—</span>}</td>
                      <td className="px-4 py-3">{c.balance_due>0.01 ? <span className="font-bold text-amber-600">KES {c.balance_due.toLocaleString()}</span> : <span className="text-emerald-600 text-xs">Settled</span>}</td>
                      <td className="px-4 py-3 text-brand-600 text-xs font-medium">View →</td>
                    </tr>
                  ))}
                  {filtered.length===0 && <tr><td colSpan={5} className="px-4 py-12 text-center text-slate-400">No customers yet — they're created automatically from the POS order screen</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <>
          <button onClick={()=>setDetail(null)} className="flex items-center gap-1.5 text-brand-600 text-sm hover:underline mb-4"><ArrowLeft className="w-4 h-4"/> All customers</button>
          {detailLoading ? <div className="flex justify-center pt-12"><Spinner size="lg"/></div> : (
            <>
              <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-brand-100 flex items-center justify-center"><Users className="w-6 h-6 text-brand-600"/></div>
                  <div>
                    <h1 className="text-2xl font-bold">{detail.name}</h1>
                    <p className="text-slate-500 text-sm">{detail.phone ?? 'no phone on file'}{detail.email?` · ${detail.email}`:''}</p>
                  </div>
                </div>
                <div className={clsx('rounded-xl px-5 py-3 flex items-center gap-3', detail.balance_due>0.01?'bg-amber-50 border border-amber-200':'bg-emerald-50 border border-emerald-200')}>
                  <Wallet className={clsx('w-5 h-5', detail.balance_due>0.01?'text-amber-600':'text-emerald-600')}/>
                  <div>
                    <p className="text-xs text-slate-500">Outstanding balance</p>
                    <p className={clsx('font-bold text-lg', detail.balance_due>0.01?'text-amber-700':'text-emerald-700')}>KES {detail.balance_due.toLocaleString()}</p>
                  </div>
                </div>
              </div>

              <h2 className="font-semibold mb-3">Order history</h2>
              <div className="card overflow-hidden">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-slate-100 bg-slate-50">
                    {['Opened','Table','Total','Balance','Status',''].map(h=>(<th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">{h}</th>))}
                  </tr></thead>
                  <tbody className="divide-y divide-slate-50">
                    {detail.orders.map((o:any)=>(
                      <tr key={o.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 text-slate-500">{o.opened_at}</td>
                        <td className="px-4 py-3">{o.table_name ?? 'Takeaway'}</td>
                        <td className="px-4 py-3 font-semibold">KES {o.total_amount.toLocaleString()}</td>
                        <td className="px-4 py-3">{o.balance_due>0.01 ? <span className="font-bold text-amber-600">KES {o.balance_due.toLocaleString()}</span> : '—'}</td>
                        <td className="px-4 py-3">
                          <span className={clsx('px-2 py-0.5 rounded-full text-xs font-medium',
                            o.status==='paid'?'bg-emerald-100 text-emerald-700':
                            o.status==='tab'?'bg-amber-100 text-amber-700':
                            o.status==='voided'?'bg-red-100 text-red-700':'bg-slate-100 text-slate-600')}>{o.status}</span>
                        </td>
                        <td className="px-4 py-3">
                          {o.status==='tab' && (
                            <button onClick={()=>openSettle(o)} className="flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg">
                              <CheckCircle className="w-3.5 h-3.5"/> Settle
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {detail.orders.length===0 && <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-400">No orders yet</td></tr>}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {settleOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-96">
            <h2 className="font-bold text-xl mb-1">Settle Tab</h2>
            <p className="text-slate-500 text-sm mb-4">{settleOrder.table_name ?? 'Takeaway'} · balance KES {settleOrder.balance_due.toLocaleString()}</p>
            <div className="mb-3">
              <label className="label">Method</label>
              <select className="input" value={settleMethod} onChange={e=>setSettleMethod(e.target.value)}>
                <option value="cash">💵 Cash</option><option value="mpesa">📱 M-Pesa</option><option value="card">💳 Card</option>
              </select>
            </div>
            <div className="mb-3">
              <label className="label">Amount (KES) *</label>
              <input type="number" className="input" value={settleAmount} onChange={e=>setSettleAmount(e.target.value)} min="0" step="any" autoFocus/>
            </div>
            {settleMethod!=='cash' && (
              <div className="mb-4">
                <label className="label">Reference</label>
                <input className="input" value={settleRef} onChange={e=>setSettleRef(e.target.value)} placeholder={settleMethod==='mpesa'?'M-Pesa confirmation code':'Card reference (optional)'}/>
              </div>
            )}
            <div className="flex gap-3 mt-2">
              <button onClick={submitSettle} disabled={settling} className={clsx('flex-1 flex items-center justify-center gap-2 text-white py-2.5 rounded-xl font-semibold', METHOD_COLORS[settleMethod]??'bg-brand-600 hover:bg-brand-700')}>
                {settling?<Spinner size="sm"/>:'Record Payment'}
              </button>
              <button className="btn-secondary" onClick={()=>setSettleOrder(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
