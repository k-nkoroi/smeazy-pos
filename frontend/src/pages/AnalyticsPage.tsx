import { useEffect, useState } from 'react'
import { Download, TrendingUp, BarChart2, ShoppingBag, Tag, Calendar, Users, Printer, TrendingDown } from 'lucide-react'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { Layout } from '../components/shared/Layout'
import { analyticsApi } from '../lib/api'
import { saveBlob } from '../lib/download'
import { can } from '../lib/permissions'
import { useAuthStore } from '../hooks/useAuth'
import { Spinner } from '../components/shared/Spinner'

type ReportTab = 'revenue'|'products'|'categories'|'staff'
type ChartType = 'line'|'bar'

const DATE_PRESETS = [
  { label:'Today', days:0 }, { label:'Yesterday', days:1 },
  { label:'Last 7d', days:7 }, { label:'Last 30d', days:30 }, { label:'Last 90d', days:90 },
]

function fmt(n: number) { return n.toLocaleString('en-KE', { maximumFractionDigits: 0 }) }

function KPICard({ label, value, prefix='KES', icon:Icon, color }: any) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-slate-500">{label}</span>
        <div className={clsx('w-9 h-9 rounded-lg flex items-center justify-center', color)}><Icon className="w-4 h-4 text-white"/></div>
      </div>
      <p className="text-2xl font-bold">{prefix} {typeof value==='number'?fmt(value):value}</p>
    </div>
  )
}

export default function AnalyticsPage() {
  const [tab, setTab] = useState<ReportTab>('revenue')
  const roles = useAuthStore(s => s.user?.roles)
  const canViewStaff = can(roles, 'staff_analytics')
  const [chartType, setChartType] = useState<ChartType>('bar')
  const [preset, setPreset] = useState(30)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [compare, setCompare] = useState('')
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [revenueData, setRevenueData] = useState<any>(null)
  const [productsData, setProductsData] = useState<any>(null)
  const [categoriesData, setCategoriesData] = useState<any>(null)
  const [staffData, setStaffData] = useState<any>(null)

  function getDateRange() {
    const end = new Date()
    const start = new Date(); start.setDate(start.getDate()-preset)
    return {
      start_date: startDate || start.toISOString().slice(0,10),
      end_date:   endDate   || end.toISOString().slice(0,10),
      compare_period: compare || undefined,
    }
  }

  useEffect(() => {
    const params = getDateRange()
    setLoading(true)
    const done = () => setLoading(false)
    if (tab==='revenue')    analyticsApi.revenue(params).then(r=>setRevenueData(r.data.data)).catch(()=>{}).finally(done)
    else if (tab==='products')   analyticsApi.products({...params, limit:100}).then(r=>setProductsData(r.data.data)).catch(()=>{}).finally(done)
    else if (tab==='categories') analyticsApi.categories(params).then(r=>setCategoriesData(r.data.data)).catch(()=>{}).finally(done)
    else if (tab==='staff')      analyticsApi.staff(params).then(r=>setStaffData(r.data.data)).catch(()=>{}).finally(done)
  }, [tab, preset, startDate, endDate, compare])

  async function handleExport() {
    try {
      const params = getDateRange()
      const start = params.start_date, end = params.end_date
      let res: any, filename: string
      if (tab==='revenue')         { res = await analyticsApi.exportRevenue(params);    filename = `revenue_${start}_${end}.csv` }
      else if (tab==='products')   { res = await analyticsApi.exportProducts(params);   filename = `products_${start}_${end}.csv` }
      else if (tab==='categories') { res = await analyticsApi.exportCategories(params); filename = `categories_${start}_${end}.csv` }
      else                         { res = await analyticsApi.exportStaff(params);      filename = `staff_${start}_${end}.csv` }
      const ok = await saveBlob(filename, res.data instanceof Blob ? res.data : new Blob([res.data], { type:'text/csv' }))
      if (ok) toast.success('Report exported')
    } catch { toast.error('Export failed') }
  }

  const chartData = revenueData?.summary?.map((r:any)=>({ date:r.period.slice(5), 'Net Sales':r.net_sales, 'Orders':r.orders_count })) ?? []
  const totals = revenueData?.totals

  return (
    <Layout>
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Analytics</h1>
          <p className="text-slate-500 text-sm mt-0.5">Sales, product &amp; staff performance</p>
        </div>
        <div className="flex gap-2">
          <button onClick={()=>window.print()} className="btn-secondary flex items-center gap-2"><Printer className="w-4 h-4"/> Print / PDF</button>
          <button onClick={handleExport} className="btn-secondary flex items-center gap-2"><Download className="w-4 h-4"/> Export CSV</button>
        </div>
      </div>

      {/* Date controls */}
      <div className="card p-4 mb-5 flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          {DATE_PRESETS.map(p=>(
            <button key={p.days} onClick={()=>{setPreset(p.days);setStartDate('');setEndDate('')}}
              className={clsx('px-3 py-1.5 rounded-lg text-xs font-medium', preset===p.days&&!startDate?'bg-brand-600 text-white':'text-slate-600 hover:bg-slate-100')}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Calendar className="w-4 h-4 text-slate-400"/>
          <input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)} className="input py-1.5 text-xs w-36"/>
          <span className="text-slate-400">→</span>
          <input type="date" value={endDate} onChange={e=>setEndDate(e.target.value)} className="input py-1.5 text-xs w-36"/>
        </div>
        {tab==='revenue' && (
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none ml-auto">
            <input type="checkbox" checked={!!compare} onChange={e=>setCompare(e.target.checked?'previous_period':'')} className="w-4 h-4 rounded"/>
            Compare to previous
          </label>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5">
        {[
          { key:'revenue',    label:'Revenue',    icon:TrendingUp, show:true },
          { key:'products',   label:'Products',   icon:ShoppingBag, show:true },
          { key:'categories', label:'Categories', icon:Tag, show:true },
          { key:'staff',      label:'Staff',      icon:Users, show:canViewStaff },
        ].filter(t=>t.show).map(({key,label,icon:Icon})=>(
          <button key={key} onClick={()=>setTab(key as ReportTab)}
            className={clsx('flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium', tab===key?'bg-brand-600 text-white':'text-slate-600 hover:bg-slate-100')}>
            <Icon className="w-4 h-4"/>{label}
          </button>
        ))}
      </div>

      {loading ? <div className="flex justify-center pt-12"><Spinner size="lg"/></div> : (
        <>
          {/* REVENUE */}
          {tab==='revenue' && revenueData && (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <KPICard label="Gross Sales" value={totals?.gross_sales??0} icon={TrendingUp} color="bg-emerald-500"/>
                <KPICard label="Net Sales" value={totals?.net_sales??0} icon={TrendingUp} color="bg-brand-600"/>
                <KPICard label="Orders" value={totals?.total_orders??0} icon={BarChart2} color="bg-violet-500" prefix=""/>
                <KPICard label="Avg Order" value={Math.round(totals?.average_order_value??0)} icon={ShoppingBag} color="bg-amber-500"/>
              </div>
              <div className="card p-5 mb-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold">Revenue trend</h2>
                  <div className="flex gap-1">
                    {(['bar','line'] as ChartType[]).map(t=>(
                      <button key={t} onClick={()=>setChartType(t)} className={clsx('px-3 py-1.5 rounded-lg text-xs capitalize', chartType===t?'bg-slate-900 text-white':'text-slate-500 hover:bg-slate-100')}>{t}</button>
                    ))}
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={280}>
                  {chartType==='bar' ? (
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/><XAxis dataKey="date" tick={{fontSize:11}}/><YAxis tick={{fontSize:11}} tickFormatter={v=>`${(v/1000).toFixed(0)}k`}/>
                      <Tooltip formatter={(v:number)=>[`KES ${fmt(v)}`,'']}/>
                      <Bar dataKey="Net Sales" fill="#6366f1" radius={[4,4,0,0]}/>
                    </BarChart>
                  ) : (
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/><XAxis dataKey="date" tick={{fontSize:11}}/><YAxis tick={{fontSize:11}} tickFormatter={v=>`${(v/1000).toFixed(0)}k`}/>
                      <Tooltip formatter={(v:number)=>[`KES ${fmt(v)}`,'']}/>
                      <Line type="monotone" dataKey="Net Sales" stroke="#6366f1" strokeWidth={2} dot={false}/>
                    </LineChart>
                  )}
                </ResponsiveContainer>
              </div>
              <div className="card overflow-hidden">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-slate-100 bg-slate-50">
                    {['Date','Orders','Gross','Discounts','Net Sales'].map(h=>(<th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">{h}</th>))}
                  </tr></thead>
                  <tbody className="divide-y divide-slate-50">
                    {revenueData.summary?.map((row:any)=>(
                      <tr key={row.period} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5 font-medium">{row.period}</td>
                        <td className="px-4 py-2.5">{row.orders_count}</td>
                        <td className="px-4 py-2.5">KES {fmt(row.gross_sales)}</td>
                        <td className="px-4 py-2.5 text-red-500">- KES {fmt(row.discounts)}</td>
                        <td className="px-4 py-2.5 font-bold text-emerald-700">KES {fmt(row.net_sales)}</td>
                      </tr>
                    ))}
                    {totals && (
                      <tr className="bg-slate-900 text-white font-bold">
                        <td className="px-4 py-3">TOTAL</td><td className="px-4 py-3">{totals.total_orders}</td>
                        <td className="px-4 py-3">KES {fmt(totals.gross_sales)}</td>
                        <td className="px-4 py-3">KES {fmt(totals.total_discounts)}</td>
                        <td className="px-4 py-3">KES {fmt(totals.net_sales)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* PRODUCTS */}
          {tab==='products' && productsData && (
            <>
              <div className="grid grid-cols-3 gap-4 mb-5">
                <KPICard label="Items Sold" value={productsData.total_items_sold} icon={ShoppingBag} color="bg-brand-600" prefix=""/>
                <KPICard label="Net Sales" value={productsData.total_net_sales} icon={TrendingUp} color="bg-emerald-500"/>
                <KPICard label="Orders" value={productsData.total_orders} icon={BarChart2} color="bg-violet-500" prefix=""/>
              </div>
              <input value={search} onChange={e=>setSearch(e.target.value)} className="input max-w-xs text-sm mb-3" placeholder="Filter by name or SKU..."/>
              <div className="card overflow-hidden">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-slate-100 bg-slate-50">
                    {['Product','SKU','Category','Sold','Net Sales','Orders'].map(h=>(<th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">{h}</th>))}
                  </tr></thead>
                  <tbody className="divide-y divide-slate-50">
                    {(productsData.items??[]).filter((p:any)=>!search||p.name?.toLowerCase().includes(search.toLowerCase())||p.sku?.toLowerCase().includes(search.toLowerCase())).map((p:any)=>(
                      <tr key={p.name} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5 font-medium">{p.name}</td>
                        <td className="px-4 py-2.5 text-slate-400 font-mono text-xs">{p.sku}</td>
                        <td className="px-4 py-2.5">{p.category_name?<span className="px-2 py-0.5 bg-slate-100 rounded-full text-xs">{p.category_name}</span>:'—'}</td>
                        <td className="px-4 py-2.5 font-bold">{p.items_sold}</td>
                        <td className="px-4 py-2.5 text-emerald-700 font-bold">KES {fmt(p.net_sales)}</td>
                        <td className="px-4 py-2.5">{p.orders_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* CATEGORIES */}
          {tab==='categories' && categoriesData && (
            <>
              <div className="grid grid-cols-2 gap-4 mb-5">
                <KPICard label="Total Net Sales" value={categoriesData.total_net_sales} icon={TrendingUp} color="bg-emerald-500"/>
                <KPICard label="Items Sold" value={categoriesData.total_items_sold} icon={ShoppingBag} color="bg-brand-600" prefix=""/>
              </div>
              <div className="card p-5 mb-5">
                <h2 className="font-semibold mb-4">Sales by category</h2>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={(categoriesData.categories??[]).slice(0,10).map((c:any)=>({name:c.category_name.slice(0,12),sales:c.net_sales}))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/><XAxis dataKey="name" tick={{fontSize:11}}/><YAxis tick={{fontSize:11}} tickFormatter={v=>`${(v/1000).toFixed(0)}k`}/>
                    <Tooltip formatter={(v:number)=>[`KES ${fmt(v)}`,'Net Sales']}/>
                    <Bar dataKey="sales" fill="#6366f1" radius={[4,4,0,0]}/>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="card overflow-hidden">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-slate-100 bg-slate-50">
                    {['Category','Sold','Net Sales','Orders'].map(h=>(<th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">{h}</th>))}
                  </tr></thead>
                  <tbody className="divide-y divide-slate-50">
                    {(categoriesData.categories??[]).map((c:any)=>(
                      <tr key={c.category_name} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium">{c.category_name}</td>
                        <td className="px-4 py-3 font-bold">{c.items_sold}</td>
                        <td className="px-4 py-3 text-emerald-700 font-bold">KES {fmt(c.net_sales)}</td>
                        <td className="px-4 py-3">{c.orders_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* STAFF PERFORMANCE */}
          {tab==='staff' && staffData && (
            <>
              <div className="grid grid-cols-2 gap-4 mb-5">
                <KPICard label="Total Attributed Sales" value={staffData.total_net_sales} icon={TrendingUp} color="bg-emerald-500"/>
                <KPICard label="Total Orders" value={staffData.total_orders} icon={BarChart2} color="bg-brand-600" prefix=""/>
              </div>
              <div className="card p-5 mb-5">
                <h2 className="font-semibold mb-4">Sales by staff member</h2>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={(staffData.staff??[]).map((s:any)=>({name:s.staff_name.slice(0,14),sales:s.net_sales,orders:s.orders_count}))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/><XAxis dataKey="name" tick={{fontSize:11}}/><YAxis tick={{fontSize:11}} tickFormatter={v=>`${(v/1000).toFixed(0)}k`}/>
                    <Tooltip formatter={(v:number)=>[`KES ${fmt(v)}`,'Net Sales']}/>
                    <Bar dataKey="sales" fill="#10b981" radius={[4,4,0,0]}/>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="card overflow-hidden">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-slate-100 bg-slate-50">
                    {['Staff Member','Orders','Net Sales','Avg Order','Items Sold','Guests Served','Share of Sales'].map(h=>(<th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">{h}</th>))}
                  </tr></thead>
                  <tbody className="divide-y divide-slate-50">
                    {(staffData.staff??[]).map((s:any)=>{
                      const share = staffData.total_net_sales>0 ? (s.net_sales/staffData.total_net_sales*100) : 0
                      return (
                        <tr key={s.staff_name} className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-medium">{s.staff_name}</td>
                          <td className="px-4 py-3">{s.orders_count}</td>
                          <td className="px-4 py-3 text-emerald-700 font-bold">KES {fmt(s.net_sales)}</td>
                          <td className="px-4 py-3">KES {fmt(s.avg_order_value)}</td>
                          <td className="px-4 py-3">{s.items_sold}</td>
                          <td className="px-4 py-3">{s.total_guests}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 max-w-[100px] h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div className="h-full bg-emerald-500 rounded-full" style={{width:`${share}%`}}/>
                              </div>
                              <span className="text-xs font-medium text-slate-500">{share.toFixed(1)}%</span>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                    {(staffData.staff??[]).length===0 && <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-400">No staff sales data for this period</td></tr>}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </Layout>
  )
}
