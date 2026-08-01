import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Search, Trash2, ChefHat, CreditCard, CheckCircle, Truck, Users, Printer, Minus, Plus as PlusIcon } from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { posApi, inventoryApi, authApi } from '../lib/api'
import { useAuthStore, useDeviceStore } from '../hooks/useAuth'
import { Spinner } from '../components/shared/Spinner'

interface OrderItem { id:string;name:string;quantity:number;unit_price:number;discount:number;status:string;item_id?:string }
interface PaymentLine { method:string;amount:string;confirmed:boolean;reference:string }

const STATUS_STYLE: Record<string,string> = { new:'border-l-4 border-amber-400', processing:'border-l-4 border-blue-400', dispatched:'border-l-4 border-emerald-400' }
const METHOD_COLORS: Record<string,string> = { cash:'bg-emerald-600', mpesa:'bg-green-500', card:'bg-blue-600' }

export default function PosOrderPage() {
  const { orderId } = useParams<{ orderId: string }>()
  const navigate = useNavigate()
  const business = useDeviceStore(s => s.business)
  const registerDepartments = useDeviceStore(s => s.registerDepartments)
  const [order, setOrder] = useState<any|null>(null)
  const [items, setItems] = useState<OrderItem[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('All')
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'order'|'checkout'>('order')
  const [paymentLines, setPaymentLines] = useState<PaymentLine[]>([{method:'cash',amount:'',confirmed:false,reference:''}])
  const [cartDiscount, setCartDiscount] = useState('')
  const [processingPayment, setProcessingPayment] = useState(false)
  const [sendingKitchen, setSendingKitchen] = useState(false)
  const [showWaitstaffModal, setShowWaitstaffModal] = useState(false)
  const [staffList, setStaffList] = useState<any[]>([])
  const [receipt, setReceipt] = useState<any|null>(null)   // checkout result for printable receipt
  const [qtyBusy, setQtyBusy] = useState<string|null>(null)
  const [editingQtyId, setEditingQtyId] = useState<string|null>(null)
  const [editingQtyValue, setEditingQtyValue] = useState('')
  const [directorRate, setDirectorRate] = useState<null|'directors_promo'|'directors_discount'>(null)
  const user = useAuthStore(s => s.user)
  const vatRate = 0.16 // display rate; server is authoritative
  const [darajaEnabled, setDarajaEnabled] = useState(false)
  const [darajaShortcode, setDarajaShortcode] = useState('')
  const canAuthorizeDirector = (user?.roles ?? []).some(r => ['entrepreneur','admin_staff','executive_staff','cashier'].includes(r))

  const reload = useCallback(async () => {
    if (!orderId) return
    const res = await posApi.getOrder(orderId).catch(()=>null)
    if (res) { setOrder(res.data.data); setItems(res.data.data.items??[]) }
  }, [orderId])

  useEffect(() => {
    reload().then(()=>setLoading(false))
    inventoryApi.listCategories().then(r=>setCategories([{id:'All',name:'All'},...(r.data.data??[])]))
    inventoryApi.listItems(undefined,'product').then(r=>setProducts(r.data.data??[]))
    authApi.listStaffPos().then(r=>setStaffList(r.data.data??[])).catch(()=>{})
    authApi.paymentConfig().then(r=>{ const d=r.data.data; setDarajaEnabled(!!d.daraja_enabled); setDarajaShortcode(d.daraja_shortcode||'') }).catch(()=>{})
  }, [reload])

  const total = (order?.total_amount??0) - (order?.discount??0)
  const totalPaid = paymentLines.filter(p=>p.confirmed).reduce((s,p)=>s+(parseFloat(p.amount)||0),0)
  const remaining = Math.max(0, total - (parseFloat(cartDiscount)||0) - totalPaid)
  const changeDue = Math.max(0, totalPaid - total + (parseFloat(cartDiscount)||0))
  const canComplete = remaining <= 0.01

  // Register scoping: if a register is selected, only show products whose
  // category department is in the register's allowed departments.
  const inRegister = (p: any) =>
    registerDepartments.length === 0 || (p.category_department && registerDepartments.includes(p.category_department))

  const filteredProducts = products.filter((p:any) => {
    const matchCat = activeCategory==='All' || p.category_id===activeCategory || p.category_name===activeCategory
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.sku?.toLowerCase().includes(search.toLowerCase())
    return matchCat && matchSearch && inRegister(p) && p.sale_price!=null && p.sale_price>0
  })

  // Only show category tabs that have at least one product visible under the current register.
  const visibleCategories = categories.filter((cat:any) =>
    cat.id === 'All' || products.some((p:any) => (p.category_id===cat.id || p.category_name===cat.name) && inRegister(p)))

  async function addProduct(product:any) {
    if (!orderId) return
    try {
      await posApi.addItem(orderId,{item_id:product.id,name:product.name,sku:product.sku,quantity:1,unit_price:product.sale_price??0})
      reload()
    } catch { toast.error('Failed to add item') }
  }
  async function removeItem(itemId:string) { await posApi.removeItem(orderId!,itemId).catch(()=>null); reload() }
  async function changeQuantity(itemId:string, newQty:number) {
    if (newQty < 0) return
    setQtyBusy(itemId)
    try { await posApi.updateItemQuantity(orderId!, itemId, newQty) }
    catch (e:any) { toast.error(e.response?.data?.error?.message ?? 'Failed to update quantity') }
    finally { setQtyBusy(null); reload() }
  }
  async function commitQuantity(itemId:string) {
    const n = parseInt(editingQtyValue)
    setEditingQtyId(null)
    if (isNaN(n)) return
    await changeQuantity(itemId, n)
  }
  async function updateItemStatus(itemId:string,status:string) { await posApi.updateItemStatus(itemId,{status}).catch(()=>null); reload() }

  async function sendToKitchen() {
    if (!orderId||items.filter(i=>i.status==='new').length===0) return toast.error('No new items to send')
    setSendingKitchen(true)
    try { await posApi.sendToKitchen(orderId,{}); toast.success('🍽 Sent to kitchen!'); reload() }
    catch { toast.error('Failed to send') } finally { setSendingKitchen(false) }
  }

  async function assignWaitstaff(staffId:string, staffName:string) {
    await posApi.updateWaitstaff(orderId!,{waitstaff_id:staffId,waitstaff_name:staffName})
    setShowWaitstaffModal(false); reload(); toast.success(`Assigned to ${staffName}`)
  }

  function confirmPaymentLine(idx:number) {
    const line = paymentLines[idx]
    const amt = parseFloat(line.amount)
    if (isNaN(amt)||amt<=0) return toast.error('Enter a valid amount')
    setPaymentLines(prev=>{
      const u=[...prev]; u[idx]={...u[idx],confirmed:true}
      if (idx===prev.length-1 && remaining-amt>0.01)
        u.push({method:'cash',amount:String((remaining-amt).toFixed(2)),confirmed:false,reference:''})
      return u
    })
  }

  async function processCheckout() {
    if (!orderId||!canComplete) return
    setProcessingPayment(true)
    try {
      const payments = paymentLines.filter(p=>p.confirmed&&parseFloat(p.amount)>0).map(p=>({method:p.method,amount:parseFloat(p.amount),reference:p.reference||undefined}))
      const disc = parseFloat(cartDiscount)||0
      const res = await posApi.checkout(orderId,{
        payments,
        discount: disc>0?disc:undefined,
        discount_type: directorRate ?? undefined,
        authorized_by: directorRate ? user?.id : undefined,
      })
      setReceipt({ ...res.data.data, items:[...items], table_name:order.table_name, waitstaff_name:order.waitstaff_name, paid_at:new Date(), directorRate })
    } catch (err:any) { toast.error(err.response?.data?.error?.message??'Payment failed') }
    finally { setProcessingPayment(false) }
  }

  if (loading) return <div className="min-h-screen bg-slate-900 flex items-center justify-center"><Spinner size="lg"/></div>
  if (!order) return <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">Order not found</div>

  return (
    <div className="h-screen bg-slate-900 flex flex-col overflow-hidden">
      <div className="bg-slate-800 border-b border-slate-700 px-4 py-3 flex items-center gap-4 shrink-0 print:hidden">
        <button onClick={()=>navigate('/floor')} className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-700"><ArrowLeft className="w-5 h-5"/></button>
        <div className="flex items-center gap-3 text-sm flex-1 min-w-0">
          <span className="font-bold text-white text-lg">{order.table_name??'Takeaway'}</span>
          <span className="text-slate-400">|</span>
          <span className="text-slate-300">👥 {order.guest_count}</span>
          <span className="text-slate-400">|</span>
          <button onClick={()=>setShowWaitstaffModal(true)} className="flex items-center gap-1.5 text-slate-300 hover:text-white hover:bg-slate-700 px-2 py-1 rounded-lg transition-colors">
            <Users className="w-3.5 h-3.5 text-slate-400"/><span>{order.waitstaff_name??'Assign staff'}</span>
          </button>
        </div>
        <div className="flex gap-2 shrink-0">
          <button onClick={()=>setTab('order')} className={clsx('px-4 py-2 rounded-lg text-sm font-medium',tab==='order'?'bg-brand-600 text-white':'text-slate-400 hover:bg-slate-700 hover:text-white')}>Order</button>
          <button onClick={()=>setTab('checkout')} className={clsx('px-4 py-2 rounded-lg text-sm font-medium',tab==='checkout'?'bg-emerald-600 text-white':'text-slate-400 hover:bg-slate-700 hover:text-white')}>Checkout · KES {total.toLocaleString()}</button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden print:hidden">
        {tab==='order' ? (
          <>
            <div className="flex flex-col w-3/5 border-r border-slate-700 overflow-hidden">
              <div className="p-3 border-b border-slate-700">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"/>
                  <input value={search} onChange={e=>setSearch(e.target.value)}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg pl-9 pr-4 py-2.5 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:border-brand-500"
                    placeholder="Search product / SKU..."/>
                </div>
              </div>
              <div className="flex gap-1 px-3 py-2 border-b border-slate-700 overflow-x-auto shrink-0">
                {visibleCategories.map((cat:any)=>(
                  <button key={cat.id} onClick={()=>setActiveCategory(cat.id==='All'?'All':cat.name)}
                    className={clsx('px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap',
                      activeCategory===(cat.id==='All'?'All':cat.name)?'bg-brand-600 text-white':'text-slate-400 hover:bg-slate-700 hover:text-white')}>{cat.name}</button>
                ))}
              </div>
              <div className="flex-1 overflow-y-auto p-3 grid grid-cols-3 sm:grid-cols-4 gap-2 content-start">
                {filteredProducts.map((product:any)=>(
                  <button key={product.id} onClick={()=>addProduct(product)}
                    className="bg-slate-800 border border-slate-600 rounded-xl p-3 hover:border-brand-500 hover:bg-slate-700 transition-all text-left active:scale-95">
                    {product.image_url ? (
                      <img src={product.image_url} alt="" className="w-full h-14 object-contain rounded-lg mb-2 bg-slate-900" onError={e=>(e.currentTarget.style.display='none')}/>
                    ) : <div className="w-full h-14 bg-slate-700 rounded-lg mb-2 flex items-center justify-center text-slate-500 text-2xl">🍽</div>}
                    <p className="text-white text-xs font-medium line-clamp-2 leading-tight">{product.name}</p>
                    <p className="text-brand-400 font-bold text-sm mt-1">KES {product.sale_price?.toLocaleString()}</p>
                    {product.quantity_on_hand>0&&<p className="text-slate-500 text-xs">{product.quantity_on_hand} in stock</p>}
                  </button>
                ))}
                {filteredProducts.length===0&&<div className="col-span-4 text-center py-12 text-slate-500">No products found</div>}
              </div>
            </div>

            <div className="w-2/5 flex flex-col bg-slate-800 overflow-hidden">
              <div className="p-3 border-b border-slate-700 shrink-0">
                <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">Active Order · {items.length} item{items.length!==1?'s':''}</p>
              </div>
              <div className="flex-1 overflow-y-auto divide-y divide-slate-700 min-h-0">
                {items.length===0 ? (
                  <div className="p-8 text-center text-slate-500"><p className="text-4xl mb-3">🛒</p><p>Select items from the menu</p></div>
                ) : items.map(item=>(
                  <div key={item.id} className={clsx('flex items-start gap-3 p-3 pl-4',STATUS_STYLE[item.status]??'')}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-white text-sm font-medium truncate">{item.name}</p>
                        {item.status!=='new'&&(
                          <span className={clsx('text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0',
                            item.status==='processing'?'bg-blue-900 text-blue-300':item.status==='dispatched'?'bg-emerald-900 text-emerald-300':'bg-slate-700 text-slate-400')}>{item.status}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex items-center gap-1 bg-slate-800 rounded-lg px-1">
                          <button onClick={()=>changeQuantity(item.id,item.quantity-1)} disabled={qtyBusy===item.id}
                            className="w-5 h-5 flex items-center justify-center text-slate-400 hover:text-white disabled:opacity-40" title="Decrease quantity">
                            <Minus className="w-3 h-3"/>
                          </button>
                          {editingQtyId===item.id ? (
                            <input autoFocus type="number" min="0" value={editingQtyValue}
                              onChange={e=>setEditingQtyValue(e.target.value)}
                              onBlur={()=>commitQuantity(item.id)}
                              onKeyDown={e=>{ if(e.key==='Enter') commitQuantity(item.id); if(e.key==='Escape') setEditingQtyId(null) }}
                              className="w-10 bg-slate-700 text-white text-xs text-center rounded outline-none border border-brand-500"/>
                          ) : (
                            <button onClick={()=>{setEditingQtyId(item.id);setEditingQtyValue(String(item.quantity))}}
                              className="text-white text-xs font-semibold w-5 text-center hover:text-brand-400" title="Click to enter exact quantity">
                              {item.quantity}
                            </button>
                          )}
                          <button onClick={()=>changeQuantity(item.id,item.quantity+1)} disabled={qtyBusy===item.id}
                            className="w-5 h-5 flex items-center justify-center text-slate-400 hover:text-white disabled:opacity-40" title="Increase quantity">
                            <PlusIcon className="w-3 h-3"/>
                          </button>
                        </div>
                        <span className="text-slate-300 text-xs">KES {item.unit_price.toLocaleString()}</span>
                        <span className="text-brand-400 text-xs font-bold ml-auto">KES {(item.quantity*item.unit_price).toLocaleString()}</span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      {item.status==='dispatched'?<CheckCircle className="w-4 h-4 text-emerald-400"/>:(
                        <button onClick={()=>updateItemStatus(item.id,'dispatched')} className="text-slate-500 hover:text-emerald-400" title="Mark dispatched"><Truck className="w-4 h-4"/></button>
                      )}
                      <button onClick={()=>removeItem(item.id)} className="text-slate-500 hover:text-red-400"><Trash2 className="w-3.5 h-3.5"/></button>
                    </div>
                  </div>
                ))}
              </div>
              {/* Sticky action bar */}
              <div className="shrink-0 border-t border-slate-600 bg-slate-800 p-3 space-y-2">
                <div className="flex items-center justify-between text-white">
                  <span className="text-sm text-slate-300">Subtotal</span><span className="font-bold">KES {order.total_amount.toLocaleString()}</span>
                </div>
                {order.discount>0&&<div className="flex items-center justify-between text-emerald-400 text-sm"><span>Discount</span><span>- KES {order.discount.toLocaleString()}</span></div>}
                <div className="flex items-center justify-between text-white border-t border-slate-600 pt-2">
                  <span className="font-semibold">Total</span><span className="font-bold text-xl text-brand-400">KES {total.toLocaleString()}</span>
                </div>
                <div className="flex gap-2 pt-1">
                  <button onClick={sendToKitchen} disabled={sendingKitchen||items.filter(i=>i.status==='new').length===0}
                    className="flex-1 flex items-center justify-center gap-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white py-3 rounded-xl text-sm font-bold">
                    {sendingKitchen?<Spinner size="sm"/>:<><ChefHat className="w-4 h-4"/>Send to Kitchen</>}
                  </button>
                  <button onClick={()=>setTab('checkout')} className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-xl text-sm font-bold">
                    <CreditCard className="w-4 h-4"/>Pay
                  </button>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex overflow-auto p-6 gap-6">
            <div className="flex-1 min-w-0">
              <h2 className="text-white font-bold text-xl mb-1">Checkout</h2>
              <p className="text-slate-400 text-sm mb-6">Confirm payment for {order.table_name??'Takeaway'}</p>
              <div className="bg-slate-800 rounded-xl p-5 mb-5">
                <div className="flex justify-between items-center mb-1"><span className="text-slate-400">Subtotal</span><span className="text-white font-semibold">KES {order.total_amount.toLocaleString()}</span></div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-slate-400">Cart discount</span>
                  <input type="number" value={cartDiscount} onChange={e=>setCartDiscount(e.target.value)}
                    className="w-24 bg-slate-700 border border-slate-600 rounded-lg px-2 py-1 text-white text-sm text-right focus:outline-none focus:border-brand-500" placeholder="0" min="0"/>
                </div>
                <div className="flex justify-between items-center pt-3 border-t border-slate-600">
                  <span className="text-white font-bold text-lg">Total Due</span>
                  <span className="text-brand-400 font-bold text-2xl">KES {(directorRate==='directors_promo'?0:(total-(parseFloat(cartDiscount)||0))).toLocaleString()}</span>
                </div>
                {/* VAT breakdown (inclusive) */}
                {directorRate!=='directors_promo' && (
                  <div className="mt-2 pt-2 border-t border-slate-700 text-xs text-slate-400 space-y-0.5">
                    <div className="flex justify-between"><span>Net (excl. VAT)</span><span>KES {(( total-(parseFloat(cartDiscount)||0))*(1-vatRate)).toFixed(2)}</span></div>
                    <div className="flex justify-between"><span>VAT (16%)</span><span>KES {(( total-(parseFloat(cartDiscount)||0))*vatRate).toFixed(2)}</span></div>
                  </div>
                )}
                {/* Director subsidised rates — only for admins/managers */}
                {canAuthorizeDirector && (
                  <div className="mt-3 pt-3 border-t border-slate-700">
                    <p className="text-slate-400 text-xs mb-2">Director's rate (authorised)</p>
                    <div className="flex gap-2">
                      <button onClick={()=>setDirectorRate(directorRate==='directors_promo'?null:'directors_promo')}
                        className={clsx('flex-1 px-2 py-1.5 rounded-lg text-xs font-medium border',
                          directorRate==='directors_promo'?'bg-purple-600 border-purple-500 text-white':'border-slate-600 text-slate-300 hover:border-purple-500')}>
                        Promo (100% off)
                      </button>
                      <button onClick={()=>setDirectorRate(directorRate==='directors_discount'?null:'directors_discount')}
                        className={clsx('flex-1 px-2 py-1.5 rounded-lg text-xs font-medium border',
                          directorRate==='directors_discount'?'bg-purple-600 border-purple-500 text-white':'border-slate-600 text-slate-300 hover:border-purple-500')}>
                        At cost price
                      </button>
                    </div>
                    {directorRate && <p className="text-purple-300 text-xs mt-2">Inventory is still deducted; this is logged as a director consumption.</p>}
                  </div>
                )}
              </div>
              <h3 className="text-white font-semibold mb-3">Payment breakdown</h3>
              <div className="space-y-3">
                {paymentLines.map((line,idx)=>(
                  <div key={idx} className={clsx('bg-slate-800 rounded-xl p-4 border-2',line.confirmed?'border-emerald-500':'border-slate-600')}>
                    {line.confirmed ? (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className={clsx('text-white font-bold uppercase text-xs px-3 py-1.5 rounded-lg',METHOD_COLORS[line.method]??'bg-slate-600')}>{line.method}</span>
                          {line.reference&&<span className="text-slate-400 text-xs">Ref: {line.reference}</span>}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-emerald-400 font-bold">KES {parseFloat(line.amount).toLocaleString()}</span>
                          <CheckCircle className="w-5 h-5 text-emerald-400"/>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex gap-2">
                          <select value={line.method} onChange={e=>setPaymentLines(prev=>{const u=[...prev];u[idx]={...u[idx],method:e.target.value};return u})}
                            className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-brand-500">
                            <option value="cash">💵 Cash</option><option value="mpesa">📱 M-Pesa</option><option value="card">💳 Card</option>
                          </select>
                          <input type="number" value={line.amount}
                            onChange={e=>setPaymentLines(prev=>{const u=[...prev];u[idx]={...u[idx],amount:e.target.value};return u})}
                            onFocus={()=>{ if(!line.amount) setPaymentLines(prev=>{const u=[...prev];u[idx]={...u[idx],amount:remaining.toFixed(2)};return u}) }}
                            className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-brand-500" placeholder="Amount (KES)"/>
                        </div>
                        {line.method==='mpesa'&&(
                          <div>
                            {darajaEnabled ? (
                              <div className="mb-1.5 flex items-center gap-2 text-xs text-emerald-400 bg-emerald-950/40 border border-emerald-800 rounded-lg px-2.5 py-1.5">
                                <span>📲 STK push to Paybill {darajaShortcode || ''} — activating soon. Enter the code manually for now.</span>
                              </div>
                            ) : null}
                            <input value={line.reference} onChange={e=>setPaymentLines(prev=>{const u=[...prev];u[idx]={...u[idx],reference:e.target.value};return u})}
                              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-brand-500"
                              placeholder="M-Pesa confirmation code (e.g. SLJ7XK2ABC)"/>
                          </div>
                        )}
                        {line.method==='card'&&(
                          <input value={line.reference} onChange={e=>setPaymentLines(prev=>{const u=[...prev];u[idx]={...u[idx],reference:e.target.value};return u})}
                            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-brand-500"
                            placeholder="Card reference (optional)"/>
                        )}
                        <button onClick={()=>confirmPaymentLine(idx)} className="w-full bg-brand-600 hover:bg-brand-700 text-white py-2.5 rounded-lg text-sm font-semibold">Confirm Receipt</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {!canComplete&&totalPaid>0&&<div className="mt-4 bg-slate-800 rounded-xl p-4 flex justify-between"><span className="text-slate-400">Remaining</span><span className="text-amber-400 font-bold">KES {remaining.toFixed(2)}</span></div>}
              {changeDue>0.01&&<div className="mt-3 bg-emerald-900 border border-emerald-500 rounded-xl p-4 flex justify-between"><span className="text-emerald-300 font-semibold">💵 Change due</span><span className="text-emerald-300 font-bold text-xl">KES {changeDue.toFixed(2)}</span></div>}
            </div>
            <div className="w-72 shrink-0 flex flex-col">
              <h3 className="text-white font-semibold mb-3">Order summary</h3>
              <div className="bg-slate-800 rounded-xl divide-y divide-slate-700 mb-4 max-h-64 overflow-y-auto">
                {items.map(item=>(
                  <div key={item.id} className="flex justify-between items-center px-4 py-2.5">
                    <div><p className="text-white text-sm">{item.name}</p><p className="text-slate-400 text-xs">×{item.quantity} @ KES {item.unit_price.toLocaleString()}</p></div>
                    <span className="text-slate-300 text-sm font-medium">KES {(item.quantity*item.unit_price).toLocaleString()}</span>
                  </div>
                ))}
              </div>
              <button onClick={processCheckout} disabled={!canComplete||processingPayment}
                className={clsx('w-full py-4 rounded-xl text-white font-bold text-lg mt-auto',canComplete?'bg-emerald-600 hover:bg-emerald-500 shadow-lg':'bg-slate-700 cursor-not-allowed opacity-50')}>
                {processingPayment?<Spinner size="sm"/>:canComplete?'✅ Complete Order':`Remaining: KES ${remaining.toFixed(2)}`}
              </button>
              <button onClick={()=>setTab('order')} className="w-full mt-2 text-slate-400 hover:text-white py-2 text-sm">← Back to order</button>
            </div>
          </div>
        )}
      </div>

      {/* Waitstaff modal */}
      {showWaitstaffModal&&(
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 print:hidden">
          <div className="bg-slate-800 rounded-2xl p-6 w-80 border border-slate-600">
            <h2 className="text-white font-bold text-lg mb-4 flex items-center gap-2"><Users className="w-5 h-5"/>Assign Waitstaff</h2>
            <div className="space-y-2 max-h-64 overflow-y-auto mb-4">
              {staffList.map((s:any)=>(
                <button key={s.id} onClick={()=>assignWaitstaff(s.id, s.display_name??s.username)}
                  className={clsx('w-full text-left px-4 py-3 rounded-xl border-2 transition-colors',
                    order.waitstaff_id===s.id?'border-brand-500 bg-brand-900':'border-slate-600 hover:border-slate-400 bg-slate-700')}>
                  <p className="text-white font-medium">{s.display_name??s.username}</p>
                  <p className="text-slate-400 text-xs capitalize">{s.role?.replace(/_/g,' ')}</p>
                </button>
              ))}
              {staffList.length===0&&<p className="text-slate-400 text-sm text-center py-4">No staff found — add staff from the Staff page.</p>}
            </div>
            <button onClick={()=>setShowWaitstaffModal(false)} className="btn-secondary w-full">Cancel</button>
          </div>
        </div>
      )}

      {/* ═══ RECEIPT — printable, shown after successful checkout ═══ */}
      {receipt && (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 print:bg-white print:relative print:inset-auto">
          <div className="bg-white rounded-2xl w-80 max-h-[92vh] overflow-y-auto print:rounded-none print:w-full print:max-h-none print:shadow-none" id="receipt">
            <div className="p-6 text-center border-b border-dashed border-slate-300">
              {business?.logo_url && <img src={business.logo_url} alt="" className="w-16 h-16 object-contain mx-auto mb-2"/>}
              <h2 className="font-black text-lg">{business?.name ?? 'SMEazy POS'}</h2>
              <p className="text-xs text-slate-500 mt-1">{receipt.paid_at.toLocaleString('en-KE')}</p>
              <p className="text-xs text-slate-500">{receipt.table_name ?? 'Takeaway'}{receipt.waitstaff_name ? ` · Served by ${receipt.waitstaff_name}` : ''}</p>
            </div>
            <div className="p-6 space-y-1.5 border-b border-dashed border-slate-300 font-mono text-sm">
              {receipt.items.map((it:any)=>(
                <div key={it.id} className="flex justify-between gap-2">
                  <span className="truncate">{it.quantity}× {it.name}</span>
                  <span className="shrink-0">{(it.quantity*it.unit_price).toLocaleString()}</span>
                </div>
              ))}
            </div>
            <div className="p-6 space-y-1.5 font-mono text-sm border-b border-dashed border-slate-300">
              {receipt.directorRate && (
                <div className="flex justify-between text-purple-700 font-semibold">
                  <span>{receipt.directorRate==='directors_promo'?"DIRECTOR'S PROMO":"DIRECTOR'S RATE"}</span>
                  <span>{receipt.directorRate==='directors_promo'?'100% OFF':'AT COST'}</span>
                </div>
              )}
              <div className="flex justify-between text-slate-600"><span>Net (excl. VAT)</span><span>KES {(receipt.net_amount ?? (receipt.total*(1-vatRate))).toFixed(2)}</span></div>
              <div className="flex justify-between text-slate-600"><span>VAT (16%)</span><span>KES {(receipt.vat_amount ?? (receipt.total*vatRate)).toFixed(2)}</span></div>
              <div className="flex justify-between font-bold text-base pt-1 border-t border-slate-200"><span>TOTAL</span><span>KES {receipt.total.toLocaleString()}</span></div>
              {receipt.payments.map((p:any)=>(
                <div key={p.id} className="flex justify-between text-slate-500"><span className="uppercase">{p.method}{p.reference?` (${p.reference})`:''}</span><span>{p.amount.toLocaleString()}</span></div>
              ))}
              {receipt.change_due>0.01&&<div className="flex justify-between font-bold"><span>CHANGE</span><span>KES {receipt.change_due.toFixed(2)}</span></div>}
            </div>
            <div className="px-6 pb-2 text-center text-[10px] text-slate-400 font-mono">Price inclusive of 16% VAT</div>
            <div className="p-4 text-center text-xs text-slate-400">Thank you! Powered by SMEazy POS</div>
            <div className="p-4 flex gap-2 print:hidden">
              <button onClick={()=>window.print()} className="btn-secondary flex-1 flex items-center justify-center gap-2"><Printer className="w-4 h-4"/>Print</button>
              <button onClick={()=>navigate('/floor')} className="btn-primary flex-1">Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
