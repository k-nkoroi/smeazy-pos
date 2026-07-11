import { useEffect, useState, useRef } from 'react'
import { Plus, Upload, Download, AlertTriangle, Search, Edit2, Package, Tag, ClipboardList, ShoppingCart, Truck, Printer, CheckCircle2, Building, Soup, ChefHat, X } from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { Layout } from '../components/shared/Layout'
import { inventoryApi } from '../lib/api'
import { saveBlob } from '../lib/download'
import { DEPARTMENTS, can } from '../lib/permissions'
import { useAuthStore } from '../hooks/useAuth'
import { Spinner } from '../components/shared/Spinner'

type Tab = 'items'|'ingredients'|'categories'|'stocktake'|'orders'|'suppliers'|'alerts'

const EMPTY_ITEM = { name:'',sku:'',category_id:'',sale_price:'',cost_price:'',quantity:'',reorder_level:'5',unit_of_measure:'unit',image_url:'',tags:'' }
const EMPTY_SUPPLIER = { name:'',contact_name:'',phone:'',email:'',address:'',notes:'' }

export default function InventoryPage() {
  const roles = useAuthStore(s => s.user?.roles)
  const canEdit = can(roles, 'inventory_edit')
  const [tab, setTab] = useState<Tab>('items')
  const [spoilItem, setSpoilItem] = useState<any|null>(null)
  const [spoilQty, setSpoilQty] = useState('')
  const [spoilReason, setSpoilReason] = useState('')
  const [categories, setCategories] = useState<any[]>([])
  const [items, setItems] = useState<any[]>([])
  const [ingredients, setIngredients] = useState<any[]>([])
  const [recipeProduct, setRecipeProduct] = useState<any|null>(null)
  const [recipeData, setRecipeData] = useState<{is_assembled:boolean; components:any[]}>({ is_assembled:false, components:[] })
  const [recipeLoading, setRecipeLoading] = useState(false)
  const [alerts, setAlerts] = useState<any[]>([])
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [stockTakes, setStockTakes] = useState<any[]>([])
  const [requisitions, setRequisitions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeCat, setActiveCat] = useState('all')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importLoading, setImportLoading] = useState(false)

  // Modals
  const [showAddItem, setShowAddItem] = useState(false)
  const [editItem, setEditItem] = useState<any|null>(null)
  const [itemForm, setItemForm] = useState({ ...EMPTY_ITEM })
  const [showAddCat, setShowAddCat] = useState(false)
  const [editCat, setEditCat] = useState<any|null>(null)
  const [catForm, setCatForm] = useState({ name:'', color:'#6366f1', department:'' })
  const [showAddSupplier, setShowAddSupplier] = useState(false)
  const [editSupplier, setEditSupplier] = useState<any|null>(null)
  const [supplierForm, setSupplierForm] = useState({ ...EMPTY_SUPPLIER })

  // Stock take state
  const [activeStockTake, setActiveStockTake] = useState<any|null>(null)
  const [stCounts, setStCounts] = useState<Record<string,string>>({})

  // Purchase order state
  const [showNewPO, setShowNewPO] = useState(false)
  const [poSupplier, setPoSupplier] = useState('')
  const [poLines, setPoLines] = useState<Record<string,{checked:boolean;qty:string}>>({})
  const [poNotes, setPoNotes] = useState('')
  const [activePO, setActivePO] = useState<any|null>(null)
  const [receiveQtys, setReceiveQtys] = useState<Record<string,string>>({})

  async function load() {
    setLoading(true)
    const [catR, itemR, ingR, alertR, supR, stR, reqR] = await Promise.allSettled([
      inventoryApi.listCategories(),
      inventoryApi.listItems(undefined, 'product'),
      inventoryApi.listItems(undefined, 'assembly'),
      inventoryApi.alerts(),
      inventoryApi.listSuppliers(), inventoryApi.listStockTakes(), inventoryApi.listRequisitions(),
    ])
    if (catR.status==='fulfilled')  setCategories(catR.value.data.data ?? [])
    if (itemR.status==='fulfilled') setItems(itemR.value.data.data ?? [])
    if (ingR.status==='fulfilled')  setIngredients(ingR.value.data.data ?? [])
    if (alertR.status==='fulfilled') setAlerts(alertR.value.data.data ?? [])
    if (supR.status==='fulfilled')  setSuppliers(supR.value.data.data ?? [])
    if (stR.status==='fulfilled')   setStockTakes(stR.value.data.data ?? [])
    if (reqR.status==='fulfilled')  setRequisitions(reqR.value.data.data ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const filtered = items.filter(item => {
    const matchCat = activeCat==='all' || item.category_id===activeCat
    const matchSearch = !search || item.name.toLowerCase().includes(search.toLowerCase()) || item.sku.toLowerCase().includes(search.toLowerCase())
    return matchCat && matchSearch
  })

  const stockStatus = (item: any) => {
    if (item.quantity_on_hand <= 0) return { label:'Out of stock', cls:'bg-red-100 text-red-700' }
    if (item.quantity_on_hand <= item.reorder_level) return { label:'Low stock', cls:'bg-amber-100 text-amber-700' }
    return { label:'In stock', cls:'bg-emerald-100 text-emerald-700' }
  }

  // ── Item handlers ────────────────────────────────────────────────────────
  async function saveItem() {
    if (!itemForm.name.trim()) return toast.error('Item name required')
    // Creating from the Ingredients tab makes an assembly item; otherwise a product.
    const itemType = (itemForm as any).item_type || (tab === 'ingredients' ? 'assembly' : 'product')
    const payload: any = {
      name: itemForm.name, sku: itemForm.sku||undefined, category_id: itemForm.category_id||undefined,
      item_type: itemType,
      sale_price: itemType==='assembly' ? undefined : (itemForm.sale_price?parseFloat(itemForm.sale_price):undefined),
      cost_price: itemForm.cost_price?parseFloat(itemForm.cost_price):undefined,
      quantity: itemForm.quantity?parseFloat(itemForm.quantity):0,
      reorder_level: parseFloat(itemForm.reorder_level||'5'),
      unit_of_measure: itemForm.unit_of_measure, image_url: itemForm.image_url||undefined, tags: itemForm.tags||undefined,
    }
    try {
      if (editItem) { await inventoryApi.updateItem(editItem.id, payload); toast.success('Saved'); setEditItem(null) }
      else { await inventoryApi.createItem(payload); toast.success(itemType==='assembly'?'Ingredient added':'Product added'); setShowAddItem(false) }
      setItemForm({ ...EMPTY_ITEM }); load()
    } catch (e:any) { toast.error(e.response?.data?.error?.message ?? 'Failed to save item') }
  }
  function openEditItem(it:any) {
    setEditItem(it)
    setItemForm({ name:it.name, sku:it.sku, category_id:it.category_id??'', sale_price:it.sale_price?.toString()??'', cost_price:it.cost_price?.toString()??'', quantity:it.quantity_on_hand.toString(), reorder_level:it.reorder_level.toString(), unit_of_measure:it.unit_of_measure, image_url:it.image_url??'', tags:it.tags??'' })
  }
  async function adjustStock(item:any) {
    const delta = prompt(`Adjust stock for "${item.name}" (current: ${item.quantity_on_hand})\nEnter +/- amount:`)
    if (!delta) return
    const n = parseFloat(delta)
    if (isNaN(n)) return toast.error('Invalid number')
    await inventoryApi.adjustStock(item.id, { delta:n, reason:'manual adjustment' })
    toast.success('Stock adjusted'); load()
  }
  async function submitSpoil() {
    if (!spoilItem) return
    const q = parseFloat(spoilQty)
    if (isNaN(q) || q <= 0) return toast.error('Enter a valid quantity')
    try {
      await inventoryApi.recordSpoil(spoilItem.id, { quantity: q, reason: spoilReason || 'spoilage' })
      toast.success('Spoilage recorded')
      setSpoilItem(null); setSpoilQty(''); setSpoilReason(''); load()
    } catch (e:any) {
      toast.error(e.response?.data?.error?.message ?? 'Failed to record spoilage')
    }
  }

  async function openRecipe(product:any) {
    setRecipeProduct(product); setRecipeLoading(true)
    try {
      const res = await inventoryApi.getRecipe(product.id)
      const r = res.data.data
      setRecipeData({ is_assembled: r.is_assembled, components: r.components.map((c:any)=>({ ingredient_id:c.ingredient_id, quantity:c.quantity })) })
    } catch { setRecipeData({ is_assembled:false, components:[] }) }
    finally { setRecipeLoading(false) }
  }
  async function saveRecipe() {
    if (!recipeProduct) return
    try {
      await inventoryApi.setRecipe(recipeProduct.id, recipeData)
      toast.success('Recipe saved'); setRecipeProduct(null); load()
    } catch (e:any) { toast.error(e.response?.data?.error?.message ?? 'Failed to save recipe') }
  }
  function addComponent() { setRecipeData(p=>({ ...p, components:[...p.components, { ingredient_id:'', quantity:1 }] })) }
  function updateComponent(i:number, field:string, value:any) {
    setRecipeData(p=>({ ...p, components: p.components.map((c,idx)=>idx===i?{...c,[field]:value}:c) }))
  }
  function removeComponent(i:number) { setRecipeData(p=>({ ...p, components: p.components.filter((_,idx)=>idx!==i) })) }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    setImportLoading(true)
    try {
      const text = await file.text()
      const res = await inventoryApi.importCsv(text)
      toast.success(`Imported ${res.data.data.imported}, skipped ${res.data.data.skipped}`)
      load()
    } catch { toast.error('Import failed') }
    finally { setImportLoading(false); if (fileInputRef.current) fileInputRef.current.value='' }
  }
  async function handleExport() {
    const res = await inventoryApi.exportCsv().catch(()=>null); if (!res) return toast.error('Export failed')
    const blob = res.data instanceof Blob ? res.data : new Blob([res.data], { type:'text/csv' })
    const ok = await saveBlob('smeazy_inventory.csv', blob)
    if (ok) toast.success('Inventory exported')
  }

  // ── Supplier handlers ────────────────────────────────────────────────────
  async function saveSupplier() {
    if (!supplierForm.name.trim()) return toast.error('Supplier name required')
    try {
      if (editSupplier) { await inventoryApi.updateSupplier(editSupplier.id, supplierForm); toast.success('Supplier updated'); setEditSupplier(null) }
      else { await inventoryApi.createSupplier(supplierForm); toast.success('Supplier created'); setShowAddSupplier(false) }
      setSupplierForm({ ...EMPTY_SUPPLIER }); load()
    } catch { toast.error('Failed to save supplier') }
  }

  // ── Stock take handlers ──────────────────────────────────────────────────
  async function startStockTake() {
    const res = await inventoryApi.startStockTake({ notes: undefined }).catch(()=>null)
    if (!res) return toast.error('Failed to start stock take')
    setActiveStockTake(res.data.data); setStCounts({}); load()
  }
  async function openStockTake(id: string) {
    const res = await inventoryApi.getStockTake(id).catch(()=>null)
    if (res) {
      setActiveStockTake(res.data.data)
      const counts: Record<string,string> = {}
      for (const l of res.data.data.lines) if (l.counted_qty != null) counts[l.id] = String(l.counted_qty)
      setStCounts(counts)
    }
  }
  async function saveCount(lineId: string) {
    const v = parseFloat(stCounts[lineId])
    if (isNaN(v)) return
    await inventoryApi.countLine(lineId, { counted_qty: v }).catch(()=>null)
    const res = await inventoryApi.getStockTake(activeStockTake.id).catch(()=>null)
    if (res) setActiveStockTake(res.data.data)
  }
  async function completeStockTake() {
    if (!confirm('Complete this stock take? Counted quantities will replace current stock levels.')) return
    const res = await inventoryApi.completeStockTake(activeStockTake.id).catch(()=>null)
    if (!res) return toast.error('Failed to complete')
    toast.success('Stock take completed — inventory updated')
    setActiveStockTake(res.data.data); load()
  }

  // ── PO handlers ──────────────────────────────────────────────────────────
  function openNewPO() {
    // Pre-populate with low-stock items
    const lines: Record<string,{checked:boolean;qty:string}> = {}
    for (const a of alerts) {
      const suggested = Math.max(a.reorder * 2 - a.on_hand, 1)
      lines[a.item_id] = { checked: true, qty: String(Math.ceil(suggested)) }
    }
    setPoLines(lines); setPoSupplier(''); setPoNotes(''); setShowNewPO(true)
  }
  async function createPO() {
    const selected = alerts.filter(a => poLines[a.item_id]?.checked)
    if (selected.length === 0) return toast.error('Select at least one item')
    const lines = selected.map(a => ({
      item_id: a.item_id, item_name: a.name, item_sku: a.sku,
      unit_of_measure: a.unit_of_measure,
      requested_qty: parseFloat(poLines[a.item_id].qty) || 1,
      unit_cost: a.cost_price ?? undefined,
    }))
    try {
      const res = await inventoryApi.createRequisition({ supplier_id: poSupplier||undefined, notes: poNotes||undefined, lines })
      await inventoryApi.submitRequisition(res.data.data.id)
      toast.success(`Purchase order ${res.data.data.ref_number} created`)
      setShowNewPO(false); load()
    } catch { toast.error('Failed to create PO') }
  }
  async function openPO(id: string) {
    const res = await inventoryApi.getRequisition(id).catch(()=>null)
    if (res) {
      setActivePO(res.data.data)
      const qtys: Record<string,string> = {}
      for (const l of res.data.data.lines) qtys[l.id] = String(l.received_qty || l.requested_qty)
      setReceiveQtys(qtys)
    }
  }
  async function receivePOLine(lineId: string) {
    const qty = parseFloat(receiveQtys[lineId])
    if (isNaN(qty) || qty < 0) return toast.error('Invalid quantity')
    await inventoryApi.receiveLine(lineId, { received_qty: qty }).catch(()=>null)
    toast.success('Stock updated')
    openPO(activePO.id); load()
  }

  const TABS: { key:Tab; label:string; icon:any; badge?:number }[] = [
    { key:'items',       label:'Products',        icon:Package },
    { key:'ingredients', label:'Ingredients',     icon:Soup },
    { key:'categories',  label:'Categories',      icon:Tag },
    { key:'stocktake',   label:'Stock Take',      icon:ClipboardList },
    { key:'orders',      label:'Purchase Orders', icon:ShoppingCart },
    { key:'suppliers',   label:'Suppliers',       icon:Building },
    { key:'alerts',      label:'Alerts',          icon:AlertTriangle, badge: alerts.length },
  ]

  return (
    <Layout>
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Inventory</h1>
          <p className="text-slate-500 text-sm mt-0.5">{items.length} items · {suppliers.length} suppliers · {alerts.length} low stock</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {canEdit && <>
          <input type="file" ref={fileInputRef} accept=".csv" onChange={handleImport} className="hidden" />
          <button onClick={()=>fileInputRef.current?.click()} disabled={importLoading} className="btn-secondary flex items-center gap-2">
            {importLoading?<Spinner size="sm"/>:<Upload className="w-4 h-4"/>} Import CSV
          </button>
          <button onClick={handleExport} className="btn-secondary flex items-center gap-2"><Download className="w-4 h-4"/> Export CSV</button>
          <button onClick={()=>setShowAddItem(true)} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4"/> Add Item</button>
          </>}
          {!canEdit && <span className="text-xs text-slate-400 self-center">View-only · levels adjust via sales &amp; spoils</span>}
        </div>
      </div>

      <div className="flex gap-1 mb-5 flex-wrap">
        {TABS.map(({key,label,icon:Icon,badge})=>(
          <button key={key} onClick={()=>{setTab(key);setActiveStockTake(null);setActivePO(null)}}
            className={clsx('flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              tab===key?'bg-brand-600 text-white':'text-slate-600 hover:bg-slate-200')}>
            <Icon className="w-4 h-4"/>{label}
            {badge!=null && badge>0 && <span className="bg-red-500 text-white text-xs px-1.5 rounded-full">{badge}</span>}
          </button>
        ))}
      </div>

      {loading ? <div className="flex justify-center pt-12"><Spinner size="lg"/></div> : (
        <>
          {/* ═══ ITEMS ═══ */}
          {tab==='items' && (
            <>
              <div className="flex gap-3 mb-5 flex-wrap">
                <div className="relative flex-1 max-w-xs">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"/>
                  <input value={search} onChange={e=>setSearch(e.target.value)} className="input pl-9" placeholder="Search items, SKU..."/>
                </div>
                <div className="flex gap-1 flex-wrap">
                  <button onClick={()=>setActiveCat('all')} className={clsx('px-3 py-1.5 rounded-lg text-sm', activeCat==='all'?'bg-slate-800 text-white':'bg-slate-100 text-slate-600')}>All</button>
                  {categories.map(cat=>(
                    <button key={cat.id} onClick={()=>setActiveCat(cat.id)} className={clsx('px-3 py-1.5 rounded-lg text-sm', activeCat===cat.id?'text-white':'text-slate-600')}
                      style={activeCat===cat.id?{backgroundColor:cat.color}:{backgroundColor:'#f1f5f9'}}>{cat.name}</button>
                  ))}
                  <button onClick={()=>setShowAddCat(true)} className="px-3 py-1.5 rounded-lg text-sm bg-slate-100 text-slate-600 hover:bg-slate-200">+ Category</button>
                </div>
              </div>
              <div className="card overflow-hidden">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-slate-100 bg-slate-50">
                    {['Item','SKU','Category','Price','Cost','Stock','Status','Actions'].map(h=>(<th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">{h}</th>))}
                  </tr></thead>
                  <tbody className="divide-y divide-slate-50">
                    {filtered.map(item=>{ const ss=stockStatus(item); return (
                      <tr key={item.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium">{item.name}</td>
                        <td className="px-4 py-3 text-slate-500 font-mono text-xs">{item.sku}</td>
                        <td className="px-4 py-3">{item.category_name?<span className="px-2 py-1 rounded-full text-xs bg-slate-100 text-slate-700">{item.category_name}</span>:'—'}</td>
                        <td className="px-4 py-3 font-semibold">{item.sale_price!=null?`KES ${item.sale_price.toLocaleString()}`:'—'}</td>
                        <td className="px-4 py-3 text-slate-500">{item.cost_price!=null?`KES ${item.cost_price.toLocaleString()}`:'—'}</td>
                        <td className="px-4 py-3">
                          {canEdit
                            ? <button onClick={()=>adjustStock(item)} className="font-semibold hover:underline">{item.quantity_on_hand} {item.unit_of_measure}</button>
                            : <button onClick={()=>setSpoilItem(item)} title="Record spoilage" className="font-semibold hover:underline decoration-dotted">{item.quantity_on_hand} {item.unit_of_measure}</button>}
                        </td>
                        <td className="px-4 py-3">
                          {item.is_assembled
                            ? <span className="px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-700">Assembled</span>
                            : <span className={clsx('px-2 py-1 rounded-full text-xs font-medium', ss.cls)}>{ss.label}</span>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <button onClick={()=>openEditItem(item)} className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700" title="Edit"><Edit2 className="w-4 h-4"/></button>
                            {canEdit && <button onClick={()=>openRecipe(item)} className="p-1.5 rounded hover:bg-orange-100 text-slate-400 hover:text-orange-600" title="Recipe / ingredients"><ChefHat className="w-4 h-4"/></button>}
                          </div>
                        </td>
                      </tr>
                    )})}
                    {filtered.length===0 && <tr><td colSpan={8} className="px-4 py-12 text-center text-slate-400">No items found</td></tr>}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* ═══ INGREDIENTS (assembly items) ═══ */}
          {tab==='ingredients' && (
            <>
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-slate-500">Raw kitchen stock. Ingredients are consumed automatically when assembled products are sold or spoiled. Purchase orders restock ingredients.</p>
                {canEdit && (
                  <button onClick={()=>{ setItemForm({ ...EMPTY_ITEM, item_type:'assembly' } as any); setShowAddItem(true) }} className="btn-primary flex items-center gap-2 shrink-0">
                    <Plus className="w-4 h-4"/> Add Ingredient
                  </button>
                )}
              </div>
              <div className="card overflow-hidden">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-slate-100 bg-slate-50">
                    {['Ingredient','SKU','Unit','Cost','On Hand','Status','Actions'].map(h=>(<th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">{h}</th>))}
                  </tr></thead>
                  <tbody className="divide-y divide-slate-50">
                    {ingredients.filter(i=>!search||i.name.toLowerCase().includes(search.toLowerCase())).map(item=>{ const ss=stockStatus(item); return (
                      <tr key={item.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium">{item.name}</td>
                        <td className="px-4 py-3 text-slate-500 font-mono text-xs">{item.sku}</td>
                        <td className="px-4 py-3 text-slate-500">{item.unit_of_measure}</td>
                        <td className="px-4 py-3 text-slate-500">{item.cost_price!=null?`KES ${item.cost_price.toLocaleString()}`:'—'}</td>
                        <td className="px-4 py-3">
                          {canEdit
                            ? <button onClick={()=>adjustStock(item)} className="font-semibold hover:underline">{item.quantity_on_hand} {item.unit_of_measure}</button>
                            : <button onClick={()=>setSpoilItem(item)} title="Record spoilage" className="font-semibold hover:underline decoration-dotted">{item.quantity_on_hand} {item.unit_of_measure}</button>}
                        </td>
                        <td className="px-4 py-3"><span className={clsx('px-2 py-1 rounded-full text-xs font-medium', ss.cls)}>{ss.label}</span></td>
                        <td className="px-4 py-3">{canEdit && <button onClick={()=>openEditItem(item)} className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700"><Edit2 className="w-4 h-4"/></button>}</td>
                      </tr>
                    )})}
                    {ingredients.length===0 && <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-400">No ingredients yet. Add raw kitchen stock here, then attach it to products via recipes.</td></tr>}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* ═══ CATEGORIES ═══ */}
          {tab==='categories' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {categories.map(cat=>{
                const count = items.filter(i=>i.category_id===cat.id).length
                return (
                  <div key={cat.id} className="card p-5 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{backgroundColor:cat.color+'22'}}>
                      <Tag className="w-6 h-6" style={{color:cat.color}}/>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold truncate">{cat.name}</p>
                      <p className="text-xs text-slate-400">{count} items{cat.department?` · ${cat.department}`:''}</p>
                    </div>
                    {canEdit && (
                      <button onClick={()=>{ setEditCat(cat); setCatForm({ name:cat.name, color:cat.color||'#6366f1', department:cat.department||'' }); setShowAddCat(true) }}
                        className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 shrink-0"><Edit2 className="w-4 h-4"/></button>
                    )}
                  </div>
                )
              })}
              {canEdit && (
                <button onClick={()=>{ setEditCat(null); setCatForm({name:'',color:'#6366f1',department:''}); setShowAddCat(true) }} className="card p-5 border-dashed border-2 flex items-center justify-center gap-2 text-slate-400 hover:text-brand-600 hover:border-brand-300 transition-colors">
                  <Plus className="w-5 h-5"/> Add Category
                </button>
              )}
            </div>
          )}

          {/* ═══ STOCK TAKE ═══ */}
          {tab==='stocktake' && !activeStockTake && (
            <>
              <div className="flex justify-between items-center mb-4">
                <p className="text-slate-500 text-sm">Physical stock counts with automatic variance flagging. Completing a stock take updates inventory levels.</p>
                <button onClick={startStockTake} className="btn-primary flex items-center gap-2"><ClipboardList className="w-4 h-4"/> Start New Stock Take</button>
              </div>
              <div className="card overflow-hidden">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-slate-100 bg-slate-50">
                    {['Started','Performed By','Status','Completed',''].map(h=>(<th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">{h}</th>))}
                  </tr></thead>
                  <tbody className="divide-y divide-slate-50">
                    {stockTakes.map(st=>(
                      <tr key={st.id} className="hover:bg-slate-50 cursor-pointer" onClick={()=>openStockTake(st.id)}>
                        <td className="px-4 py-3">{st.started_at}</td>
                        <td className="px-4 py-3">{st.performer_name ?? '—'}</td>
                        <td className="px-4 py-3"><span className={clsx('px-2 py-0.5 rounded-full text-xs font-medium', st.status==='completed'?'bg-emerald-100 text-emerald-700':'bg-amber-100 text-amber-700')}>{st.status}</span></td>
                        <td className="px-4 py-3 text-slate-500">{st.completed_at ?? '—'}</td>
                        <td className="px-4 py-3 text-brand-600 text-xs font-medium">Open →</td>
                      </tr>
                    ))}
                    {stockTakes.length===0 && <tr><td colSpan={5} className="px-4 py-12 text-center text-slate-400">No stock takes yet</td></tr>}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {tab==='stocktake' && activeStockTake && (
            <>
              <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
                <div>
                  <button onClick={()=>setActiveStockTake(null)} className="text-brand-600 text-sm hover:underline">← All stock takes</button>
                  <h2 className="font-bold text-lg mt-1">Stock Take · {activeStockTake.started_at}
                    <span className={clsx('ml-3 px-2 py-0.5 rounded-full text-xs font-medium align-middle', activeStockTake.status==='completed'?'bg-emerald-100 text-emerald-700':'bg-amber-100 text-amber-700')}>{activeStockTake.status}</span>
                  </h2>
                </div>
                <div className="flex gap-2">
                  <button onClick={()=>window.print()} className="btn-secondary flex items-center gap-2"><Printer className="w-4 h-4"/> Print / PDF</button>
                  {activeStockTake.status!=='completed' && (
                    <button onClick={completeStockTake} className="btn-primary flex items-center gap-2"><CheckCircle2 className="w-4 h-4"/> Complete Stock Take</button>
                  )}
                </div>
              </div>
              <div className="card overflow-hidden">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-slate-100 bg-slate-50">
                    {['Item','SKU','Category','Expected','Counted','Variance','Restock?'].map(h=>(<th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">{h}</th>))}
                  </tr></thead>
                  <tbody className="divide-y divide-slate-50">
                    {activeStockTake.lines.map((line:any)=>{
                      const counted = line.counted_qty
                      const needsRestock = (counted ?? line.expected_qty) <= line.reorder_level
                      const outOfStock = (counted ?? line.expected_qty) <= 0
                      return (
                        <tr key={line.id} className={clsx('hover:bg-slate-50', line.variance!=null&&line.variance!==0&&'bg-amber-50')}>
                          <td className="px-4 py-2.5 font-medium">{line.item_name}</td>
                          <td className="px-4 py-2.5 font-mono text-xs text-slate-400">{line.item_sku}</td>
                          <td className="px-4 py-2.5 text-slate-500 text-xs">{line.category_name ?? '—'}</td>
                          <td className="px-4 py-2.5 font-semibold">{line.expected_qty} {line.unit_of_measure}</td>
                          <td className="px-4 py-2.5">
                            {activeStockTake.status==='completed' ? (
                              <span className="font-semibold">{counted ?? '—'}</span>
                            ) : (
                              <input type="number" className="input py-1 w-24 text-sm"
                                value={stCounts[line.id] ?? ''}
                                onChange={e=>setStCounts(p=>({...p,[line.id]:e.target.value}))}
                                onBlur={()=>saveCount(line.id)}
                                placeholder="Count" />
                            )}
                          </td>
                          <td className="px-4 py-2.5">
                            {line.variance!=null ? (
                              <span className={clsx('font-bold', line.variance===0?'text-emerald-600':line.variance>0?'text-blue-600':'text-red-600')}>
                                {line.variance>0?'+':''}{line.variance}
                              </span>
                            ) : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-4 py-2.5">
                            {outOfStock ? <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">OUT OF STOCK</span>
                            : needsRestock ? <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">Restock</span>
                            : <span className="text-slate-300 text-xs">OK</span>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* ═══ PURCHASE ORDERS ═══ */}
          {tab==='orders' && !activePO && (
            <>
              <div className="flex justify-between items-center mb-4">
                <p className="text-slate-500 text-sm">Raise POs from low-stock items, tied to a supplier. Confirm received items to auto-restock inventory.</p>
                <button onClick={openNewPO} className="btn-primary flex items-center gap-2"><ShoppingCart className="w-4 h-4"/> New Purchase Order</button>
              </div>
              <div className="card overflow-hidden">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-slate-100 bg-slate-50">
                    {['Ref','Supplier','Raised','Status',''].map(h=>(<th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">{h}</th>))}
                  </tr></thead>
                  <tbody className="divide-y divide-slate-50">
                    {requisitions.map(r=>(
                      <tr key={r.id} className="hover:bg-slate-50 cursor-pointer" onClick={()=>openPO(r.id)}>
                        <td className="px-4 py-3 font-mono font-semibold text-xs">{r.ref_number}</td>
                        <td className="px-4 py-3">{r.supplier_name ?? '—'}</td>
                        <td className="px-4 py-3 text-slate-500">{r.created_at}</td>
                        <td className="px-4 py-3">
                          <span className={clsx('px-2 py-0.5 rounded-full text-xs font-medium',
                            r.status==='received'?'bg-emerald-100 text-emerald-700':
                            r.status==='partially_received'?'bg-blue-100 text-blue-700':
                            r.status==='submitted'?'bg-amber-100 text-amber-700':'bg-slate-100 text-slate-600')}>{r.status.replace(/_/g,' ')}</span>
                        </td>
                        <td className="px-4 py-3 text-brand-600 text-xs font-medium">Open →</td>
                      </tr>
                    ))}
                    {requisitions.length===0 && <tr><td colSpan={5} className="px-4 py-12 text-center text-slate-400">No purchase orders yet</td></tr>}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {tab==='orders' && activePO && (
            <>
              <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
                <div>
                  <button onClick={()=>setActivePO(null)} className="text-brand-600 text-sm hover:underline">← All purchase orders</button>
                  <h2 className="font-bold text-lg mt-1 font-mono">{activePO.ref_number}
                    <span className="ml-3 text-sm font-sans font-normal text-slate-500">{activePO.supplier_name ? `Supplier: ${activePO.supplier_name}` : 'No supplier'}</span>
                  </h2>
                </div>
                <button onClick={()=>window.print()} className="btn-secondary flex items-center gap-2"><Printer className="w-4 h-4"/> Print / PDF</button>
              </div>
              <div className="card overflow-hidden">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-slate-100 bg-slate-50">
                    {['Item','SKU','Requested','Received Qty','Unit Cost','Status','Confirm'].map(h=>(<th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">{h}</th>))}
                  </tr></thead>
                  <tbody className="divide-y divide-slate-50">
                    {activePO.lines.map((line:any)=>(
                      <tr key={line.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5 font-medium">{line.item_name}</td>
                        <td className="px-4 py-2.5 font-mono text-xs text-slate-400">{line.item_sku ?? '—'}</td>
                        <td className="px-4 py-2.5 font-semibold">{line.requested_qty} {line.unit_of_measure}</td>
                        <td className="px-4 py-2.5">
                          {line.received_at ? <span className="font-bold text-emerald-600">{line.received_qty}</span> : (
                            <input type="number" className="input py-1 w-24 text-sm"
                              value={receiveQtys[line.id] ?? ''}
                              onChange={e=>setReceiveQtys(p=>({...p,[line.id]:e.target.value}))} />
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-slate-500">{line.unit_cost!=null?`KES ${line.unit_cost.toLocaleString()}`:'—'}</td>
                        <td className="px-4 py-2.5">
                          {line.received_at
                            ? <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">Received</span>
                            : <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">Pending</span>}
                        </td>
                        <td className="px-4 py-2.5">
                          {!line.received_at && (
                            <button onClick={()=>receivePOLine(line.id)} className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg">
                              <Truck className="w-3 h-3"/> Restock
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* ═══ SUPPLIERS ═══ */}
          {tab==='suppliers' && (
            <>
              <div className="flex justify-end mb-4">
                <button onClick={()=>setShowAddSupplier(true)} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4"/> Add Supplier</button>
              </div>
              <div className="card overflow-hidden">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-slate-100 bg-slate-50">
                    {['Supplier','Contact','Phone','Email','Address',''].map(h=>(<th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">{h}</th>))}
                  </tr></thead>
                  <tbody className="divide-y divide-slate-50">
                    {suppliers.map(sup=>(
                      <tr key={sup.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium">{sup.name}</td>
                        <td className="px-4 py-3 text-slate-500">{sup.contact_name ?? '—'}</td>
                        <td className="px-4 py-3 text-slate-500">{sup.phone ?? '—'}</td>
                        <td className="px-4 py-3 text-slate-500 text-xs">{sup.email ?? '—'}</td>
                        <td className="px-4 py-3 text-slate-500 text-xs">{sup.address ?? '—'}</td>
                        <td className="px-4 py-3">
                          <button onClick={()=>{setEditSupplier(sup);setSupplierForm({name:sup.name,contact_name:sup.contact_name??'',phone:sup.phone??'',email:sup.email??'',address:sup.address??'',notes:sup.notes??''})}}
                            className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700"><Edit2 className="w-4 h-4"/></button>
                        </td>
                      </tr>
                    ))}
                    {suppliers.length===0 && <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-400">No suppliers yet — add one to raise purchase orders</td></tr>}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* ═══ ALERTS ═══ */}
          {tab==='alerts' && (
            <div className="space-y-2">
              {alerts.length>0 && (
                <div className="flex justify-end mb-2">
                  <button onClick={()=>{setTab('orders');openNewPO()}} className="btn-primary flex items-center gap-2">
                    <ShoppingCart className="w-4 h-4"/> Raise PO for Low Stock
                  </button>
                </div>
              )}
              {alerts.map((alert:any)=>(
                <div key={alert.item_id} className="card flex items-center gap-4 p-4 border-l-4 border-amber-400">
                  <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0"/>
                  <div className="flex-1"><p className="font-semibold">{alert.name}</p><p className="text-sm text-slate-500">SKU: {alert.sku} · {alert.category_name ?? 'Uncategorized'}</p></div>
                  <div className="text-right"><p className="font-bold text-amber-600">{alert.on_hand} remaining</p><p className="text-xs text-slate-400">Reorder at ≤ {alert.reorder}</p></div>
                </div>
              ))}
              {alerts.length===0 && <div className="card p-12 text-center text-slate-400"><Package className="w-12 h-12 mx-auto mb-3 opacity-30"/><p>No low stock alerts</p></div>}
            </div>
          )}
        </>
      )}

      {/* ═══ MODALS — all inline JSX (input focus bug fixed) ═══ */}

      {(showAddItem || editItem) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-100"><h2 className="font-bold text-xl">{editItem?'Edit Item':'Add Inventory Item'}</h2></div>
            <div className="p-6 grid grid-cols-2 gap-4">
              <div className="col-span-2"><label className="label">Name *</label>
                <input className="input" value={itemForm.name} onChange={e=>setItemForm(p=>({...p,name:e.target.value}))} placeholder="Product name"/></div>
              <div><label className="label">SKU</label>
                <input className="input" value={itemForm.sku} onChange={e=>setItemForm(p=>({...p,sku:e.target.value}))} placeholder="Auto-generated"/></div>
              <div><label className="label">Category</label>
                <select className="input" value={itemForm.category_id} onChange={e=>setItemForm(p=>({...p,category_id:e.target.value}))}>
                  <option value="">No category</option>
                  {categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                </select></div>
              <div><label className="label">Sale Price (KES)</label>
                <input type="number" className="input" value={itemForm.sale_price} onChange={e=>setItemForm(p=>({...p,sale_price:e.target.value}))} min="0"/></div>
              <div><label className="label">Cost Price (KES)</label>
                <input type="number" className="input" value={itemForm.cost_price} onChange={e=>setItemForm(p=>({...p,cost_price:e.target.value}))} min="0"/></div>
              <div><label className="label">Stock Qty</label>
                <input type="number" className="input" value={itemForm.quantity} onChange={e=>setItemForm(p=>({...p,quantity:e.target.value}))}/></div>
              <div><label className="label">Reorder Level</label>
                <input type="number" className="input" value={itemForm.reorder_level} onChange={e=>setItemForm(p=>({...p,reorder_level:e.target.value}))} min="0"/></div>
              <div><label className="label">Unit</label>
                <select className="input" value={itemForm.unit_of_measure} onChange={e=>setItemForm(p=>({...p,unit_of_measure:e.target.value}))}>
                  {['unit','kg','g','litre','ml','bottle','glass','serving','pack','dozen'].map(u=><option key={u} value={u}>{u}</option>)}
                </select></div>
              <div><label className="label">Tags</label>
                <input className="input" value={itemForm.tags} onChange={e=>setItemForm(p=>({...p,tags:e.target.value}))} placeholder="beer, cold"/></div>
              <div className="col-span-2"><label className="label">Image URL</label>
                <input className="input" value={itemForm.image_url} onChange={e=>setItemForm(p=>({...p,image_url:e.target.value}))} placeholder="https://..."/></div>
            </div>
            <div className="p-6 border-t border-slate-100 flex gap-3">
              <button className="btn-primary flex-1" onClick={saveItem}>{editItem?'Update Item':'Add Item'}</button>
              <button className="btn-secondary" onClick={()=>{setShowAddItem(false);setEditItem(null);setItemForm({...EMPTY_ITEM})}}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Recipe editor modal */}
      {recipeProduct && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ChefHat className="w-5 h-5 text-orange-600" />
                <h2 className="font-bold text-xl">Recipe · {recipeProduct.name}</h2>
              </div>
              <button onClick={()=>setRecipeProduct(null)} className="p-1 rounded hover:bg-slate-100"><X className="w-5 h-5"/></button>
            </div>
            {recipeLoading ? <div className="p-12 flex justify-center"><Spinner size="lg"/></div> : (
            <div className="p-6 space-y-4">
              <label className="flex items-center gap-3 p-3 rounded-xl bg-orange-50 border border-orange-200 cursor-pointer">
                <input type="checkbox" checked={recipeData.is_assembled} onChange={e=>setRecipeData(p=>({...p,is_assembled:e.target.checked}))} className="w-4 h-4"/>
                <div>
                  <p className="font-medium text-sm">Assembled product</p>
                  <p className="text-xs text-slate-500">When on, selling/spoiling this product depletes the ingredients below instead of its own stock.</p>
                </div>
              </label>

              {recipeData.is_assembled && (
                <>
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-sm">Ingredients (per 1 {recipeProduct.unit_of_measure})</p>
                    <button onClick={addComponent} className="text-brand-600 text-sm font-medium hover:underline flex items-center gap-1"><Plus className="w-4 h-4"/> Add</button>
                  </div>
                  {recipeData.components.length===0 && <p className="text-sm text-slate-400 text-center py-4">No ingredients yet. Add the raw items that make this product.</p>}
                  <div className="space-y-2">
                    {recipeData.components.map((c,i)=>(
                      <div key={i} className="flex items-center gap-2">
                        <select className="input flex-1" value={c.ingredient_id} onChange={e=>updateComponent(i,'ingredient_id',e.target.value)}>
                          <option value="">Select ingredient...</option>
                          {ingredients.map(ing=><option key={ing.id} value={ing.id}>{ing.name} ({ing.unit_of_measure})</option>)}
                        </select>
                        <input type="number" className="input w-24" value={c.quantity} min="0" step="any"
                          onChange={e=>updateComponent(i,'quantity',parseFloat(e.target.value)||0)} placeholder="Qty"/>
                        <button onClick={()=>removeComponent(i)} className="p-2 rounded hover:bg-red-50 text-slate-400 hover:text-red-500"><X className="w-4 h-4"/></button>
                      </div>
                    ))}
                  </div>
                  {ingredients.length===0 && <p className="text-xs text-amber-600">No ingredients exist yet. Add them in the Ingredients tab first.</p>}
                </>
              )}
            </div>
            )}
            <div className="p-6 border-t border-slate-100 flex gap-3">
              <button className="btn-primary flex-1" onClick={saveRecipe}>Save Recipe</button>
              <button className="btn-secondary" onClick={()=>setRecipeProduct(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {spoilItem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-80">
            <h2 className="font-bold text-xl mb-1">Record Spoilage</h2>
            <p className="text-slate-500 text-sm mb-4">{spoilItem.name} · on hand {spoilItem.quantity_on_hand} {spoilItem.unit_of_measure}</p>
            <div className="mb-4">
              <label className="label">Quantity spoiled *</label>
              <input type="number" className="input" value={spoilQty} onChange={e=>setSpoilQty(e.target.value)} placeholder="e.g. 2" min="0" step="any" autoFocus />
            </div>
            <div className="mb-5">
              <label className="label">Reason</label>
              <input className="input" value={spoilReason} onChange={e=>setSpoilReason(e.target.value)} placeholder="e.g. expired, breakage" />
            </div>
            <div className="flex gap-3">
              <button className="btn-primary flex-1" onClick={submitSpoil}>Record Spoilage</button>
              <button className="btn-secondary" onClick={()=>{setSpoilItem(null);setSpoilQty('');setSpoilReason('')}}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showAddCat && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-80">
            <h2 className="font-bold text-xl mb-4">{editCat ? 'Edit Category' : 'Add Category'}</h2>
            <div className="mb-4"><label className="label">Name *</label>
              <input className="input" value={catForm.name} onChange={e=>setCatForm(p=>({...p,name:e.target.value}))} placeholder="e.g. Beverages"/></div>
            <div className="mb-4"><label className="label">Department</label>
              <select className="input" value={catForm.department} onChange={e=>setCatForm(p=>({...p,department:e.target.value}))}>
                <option value="">None (shows on all registers)</option>
                {DEPARTMENTS.map(d=><option key={d} value={d}>{d}</option>)}
              </select>
              <p className="text-xs text-slate-400 mt-1">Registers only show categories in their assigned departments.</p>
            </div>
            <div className="mb-5"><label className="label">Color</label>
              <input type="color" value={catForm.color} onChange={e=>setCatForm(p=>({...p,color:e.target.value}))} className="w-12 h-10 rounded-lg cursor-pointer border border-slate-200"/></div>
            <div className="flex gap-3">
              <button className="btn-primary flex-1" onClick={async()=>{
                if(!catForm.name.trim()) return toast.error('Name required')
                try {
                  if (editCat) { await inventoryApi.updateCategory(editCat.id, { ...catForm, department: catForm.department||undefined }); toast.success('Category updated') }
                  else { await inventoryApi.createCategory({ ...catForm, department: catForm.department||undefined }); toast.success('Category created') }
                  setShowAddCat(false); setEditCat(null); setCatForm({name:'',color:'#6366f1',department:''}); load()
                } catch { toast.error('Failed') }
              }}>{editCat ? 'Save' : 'Create'}</button>
              <button className="btn-secondary" onClick={()=>{setShowAddCat(false);setEditCat(null)}}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {(showAddSupplier || editSupplier) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md">
            <div className="p-6 border-b border-slate-100"><h2 className="font-bold text-xl">{editSupplier?'Edit Supplier':'Add Supplier'}</h2></div>
            <div className="p-6 space-y-4">
              <div><label className="label">Supplier Name *</label>
                <input className="input" value={supplierForm.name} onChange={e=>setSupplierForm(p=>({...p,name:e.target.value}))} placeholder="e.g. Nairobi Beverages Ltd"/></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Contact Person</label>
                  <input className="input" value={supplierForm.contact_name} onChange={e=>setSupplierForm(p=>({...p,contact_name:e.target.value}))}/></div>
                <div><label className="label">Phone</label>
                  <input className="input" value={supplierForm.phone} onChange={e=>setSupplierForm(p=>({...p,phone:e.target.value}))} placeholder="+254..."/></div>
              </div>
              <div><label className="label">Email</label>
                <input type="email" className="input" value={supplierForm.email} onChange={e=>setSupplierForm(p=>({...p,email:e.target.value}))}/></div>
              <div><label className="label">Address</label>
                <input className="input" value={supplierForm.address} onChange={e=>setSupplierForm(p=>({...p,address:e.target.value}))}/></div>
              <div><label className="label">Notes</label>
                <textarea className="input min-h-[60px] resize-none" value={supplierForm.notes} onChange={e=>setSupplierForm(p=>({...p,notes:e.target.value}))}/></div>
            </div>
            <div className="p-6 border-t border-slate-100 flex gap-3">
              <button className="btn-primary flex-1" onClick={saveSupplier}>{editSupplier?'Update':'Create Supplier'}</button>
              <button className="btn-secondary" onClick={()=>{setShowAddSupplier(false);setEditSupplier(null);setSupplierForm({...EMPTY_SUPPLIER})}}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showNewPO && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-100">
              <h2 className="font-bold text-xl">New Purchase Order</h2>
              <p className="text-slate-500 text-sm mt-1">Pre-populated with items at or below reorder level</p>
            </div>
            <div className="p-6 space-y-4">
              <div><label className="label">Supplier</label>
                <select className="input" value={poSupplier} onChange={e=>setPoSupplier(e.target.value)}>
                  <option value="">No supplier (internal)</option>
                  {suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                {suppliers.length===0 && <p className="text-xs text-amber-600 mt-1">No suppliers yet — add one in the Suppliers tab first</p>}
              </div>
              <div>
                <label className="label">Items to order ({alerts.filter(a=>poLines[a.item_id]?.checked).length} selected)</label>
                <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-72 overflow-y-auto">
                  {alerts.map(a=>(
                    <div key={a.item_id} className="flex items-center gap-3 px-4 py-2.5">
                      <input type="checkbox" checked={poLines[a.item_id]?.checked??false}
                        onChange={e=>setPoLines(p=>({...p,[a.item_id]:{checked:e.target.checked,qty:p[a.item_id]?.qty??'1'}}))}
                        className="w-4 h-4 rounded"/>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{a.name}</p>
                        <p className="text-xs text-slate-400">{a.on_hand} on hand · reorder at {a.reorder}</p>
                      </div>
                      <input type="number" className="input py-1 w-20 text-sm" min="1"
                        value={poLines[a.item_id]?.qty??'1'}
                        onChange={e=>setPoLines(p=>({...p,[a.item_id]:{checked:p[a.item_id]?.checked??true,qty:e.target.value}}))}/>
                      <span className="text-xs text-slate-400 w-10">{a.unit_of_measure}</span>
                    </div>
                  ))}
                  {alerts.length===0 && <p className="px-4 py-8 text-center text-slate-400 text-sm">No low-stock items — all inventory is healthy</p>}
                </div>
              </div>
              <div><label className="label">Notes</label>
                <input className="input" value={poNotes} onChange={e=>setPoNotes(e.target.value)} placeholder="Delivery instructions, urgency, etc."/></div>
            </div>
            <div className="p-6 border-t border-slate-100 flex gap-3">
              <button className="btn-primary flex-1" onClick={createPO}>Create & Submit PO</button>
              <button className="btn-secondary" onClick={()=>setShowNewPO(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
