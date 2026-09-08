import { useEffect, useState } from 'react'
import { Settings as SettingsIcon, Percent, Smartphone, Save, Download, RefreshCw, CheckCircle2, Receipt, Plus, Star, Trash2, Edit2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { Layout } from '../components/shared/Layout'
import { authApi, receiptTemplatesApi } from '../lib/api'
import { Spinner } from '../components/shared/Spinner'
import { checkForUpdate, installUpdate, relaunchApp, isDesktopApp, type UpdateInfo } from '../lib/updater'

const EMPTY_TEMPLATE = {
  name: '', template_type: 'receipt' as 'receipt'|'order_note',
  font_family: 'mono', font_weight: 'normal', font_size: 'sm',
  header_text: '', footer_text: '', show_logo: true, show_vat_note: true,
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [s, setS] = useState<Record<string, string>>({})
  const [checking, setChecking] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)

  // Receipt / Order Note templates
  const [templates, setTemplates] = useState<any[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(true)
  const [editingTemplate, setEditingTemplate] = useState<any|null>(null)   // existing template being edited, or null
  const [showTemplateModal, setShowTemplateModal] = useState(false)
  const [templateForm, setTemplateForm] = useState({ ...EMPTY_TEMPLATE })
  const [savingTemplate, setSavingTemplate] = useState(false)

  async function load() {
    setLoading(true)
    const res = await authApi.getSettings().catch(() => null)
    if (res) setS(res.data.data ?? {})
    setLoading(false)
  }
  async function loadTemplates() {
    setTemplatesLoading(true)
    const res = await receiptTemplatesApi.list().catch(() => null)
    if (res) setTemplates(res.data.data ?? [])
    setTemplatesLoading(false)
  }
  useEffect(() => { load(); loadTemplates() }, [])

  const receiptTemplates = templates.filter(t => t.template_type === 'receipt')
  const orderNoteTemplates = templates.filter(t => t.template_type === 'order_note')

  function openNewTemplate(type: 'receipt'|'order_note') {
    setEditingTemplate(null)
    setTemplateForm({ ...EMPTY_TEMPLATE, template_type: type })
    setShowTemplateModal(true)
  }
  function openEditTemplate(tpl: any) {
    setEditingTemplate(tpl)
    setTemplateForm({
      name: tpl.name, template_type: tpl.template_type,
      font_family: tpl.font_family, font_weight: tpl.font_weight, font_size: tpl.font_size,
      header_text: tpl.header_text ?? '', footer_text: tpl.footer_text ?? '',
      show_logo: !!tpl.show_logo, show_vat_note: !!tpl.show_vat_note,
    })
    setShowTemplateModal(true)
  }
  async function saveTemplate() {
    if (!templateForm.name.trim()) return toast.error('Template name is required')
    setSavingTemplate(true)
    const payload = {
      name: templateForm.name.trim(), template_type: templateForm.template_type,
      font_family: templateForm.font_family, font_weight: templateForm.font_weight, font_size: templateForm.font_size,
      header_text: templateForm.header_text.trim() || undefined, footer_text: templateForm.footer_text.trim() || undefined,
      show_logo: templateForm.show_logo, show_vat_note: templateForm.show_vat_note,
    }
    try {
      if (editingTemplate) { await receiptTemplatesApi.update(editingTemplate.id, payload); toast.success('Template saved') }
      else { await receiptTemplatesApi.create(payload); toast.success('Template created') }
      setShowTemplateModal(false); loadTemplates()
    } catch (e: any) { toast.error(e.response?.data?.error?.message ?? 'Failed to save template') }
    finally { setSavingTemplate(false) }
  }
  async function makeDefaultTemplate(tpl: any) {
    try { await receiptTemplatesApi.update(tpl.id, { is_default: true }); toast.success(`"${tpl.name}" is now the default`); loadTemplates() }
    catch (e: any) { toast.error(e.response?.data?.error?.message ?? 'Failed to set default') }
  }
  async function deleteTemplate(tpl: any) {
    if (!confirm(`Delete the "${tpl.name}" template?`)) return
    try { await receiptTemplatesApi.remove(tpl.id); toast.success('Template deleted'); loadTemplates() }
    catch (e: any) { toast.error(e.response?.data?.error?.message ?? 'Failed to delete template') }
  }

  function set(k: string, v: string) { setS(p => ({ ...p, [k]: v })) }

  async function save() {
    setSaving(true)
    try {
      await authApi.updateSettings(s)
      toast.success('Settings saved')
    } catch (e: any) {
      toast.error(e.response?.data?.error?.message ?? 'Failed to save')
    } finally { setSaving(false) }
  }

  async function handleCheckForUpdate() {
    const owner = s.update_repo_owner || 'k-nkoroi'
    const repo = s.update_repo_name || 'smeazy-pos'
    setChecking(true); setUpdateInfo(null)
    try {
      const info = await checkForUpdate(owner, repo)
      setUpdateInfo(info)
      if (!info.available) toast.success("You're on the latest version")
    } catch (e: any) {
      toast.error(e.message ?? 'Update check failed')
    } finally { setChecking(false) }
  }

  async function handleInstallUpdate() {
    const owner = s.update_repo_owner || 'k-nkoroi'
    const repo = s.update_repo_name || 'smeazy-pos'
    setInstalling(true)
    try {
      await installUpdate(owner, repo)
      toast.success('Update installed — restarting...')
      await relaunchApp()
    } catch (e: any) {
      toast.error(e.message ?? 'Update install failed')
    } finally { setInstalling(false) }
  }

  const darajaOn = s.daraja_enabled === 'true'

  if (loading) return <Layout><div className="flex justify-center pt-16"><Spinner size="lg" /></div></Layout>

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2"><SettingsIcon className="w-6 h-6 text-brand-600" /> Settings</h1>
        <p className="text-slate-500 text-sm mt-0.5">Business configuration</p>
      </div>

      <div className="space-y-6 max-w-2xl">
        {/* VAT */}
        <div className="card p-6">
          <div className="flex items-center gap-2 mb-4">
            <Percent className="w-5 h-5 text-brand-600" />
            <h2 className="font-semibold text-lg">VAT</h2>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">VAT Rate (%)</label>
              <input type="number" className="input" value={s.vat_rate ?? '16'} onChange={e => set('vat_rate', e.target.value)} min="0" max="100" step="0.1" />
            </div>
            <div>
              <label className="label">Pricing</label>
              <select className="input" value={s.vat_inclusive ?? 'true'} onChange={e => set('vat_inclusive', e.target.value)}>
                <option value="true">Prices include VAT</option>
                <option value="false">Prices exclude VAT</option>
              </select>
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-3">
            When prices include VAT, a KES 100 item is shown on the receipt as KES {(100 * (1 - (parseFloat(s.vat_rate ?? '16') / 100))).toFixed(0)} net + KES {(100 * (parseFloat(s.vat_rate ?? '16') / 100)).toFixed(0)} VAT.
          </p>
        </div>

        {/* M-Pesa Daraja (scaffold — activated in a later update) */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-emerald-600" />
              <h2 className="font-semibold text-lg">M-Pesa Daraja (STK Push)</h2>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <span className="text-sm text-slate-500">{darajaOn ? 'Enabled' : 'Disabled'}</span>
              <button type="button" onClick={() => set('daraja_enabled', darajaOn ? 'false' : 'true')}
                className={clsx('w-11 h-6 rounded-full transition-colors relative', darajaOn ? 'bg-emerald-500' : 'bg-slate-300')}>
                <span className={clsx('absolute top-0.5 w-5 h-5 bg-white rounded-full transition-all', darajaOn ? 'left-5.5' : 'left-0.5')} style={{ left: darajaOn ? '22px' : '2px' }} />
              </button>
            </label>
          </div>
          <p className="text-xs text-slate-500 mb-4">
            Connect an existing Paybill to accept M-Pesa via STK push at checkout. When disabled, cashiers enter the confirmation code manually (default).
          </p>
          <div className={clsx('grid grid-cols-2 gap-4', !darajaOn && 'opacity-50 pointer-events-none')}>
            <div>
              <label className="label">Paybill / Shortcode</label>
              <input className="input" value={s.daraja_shortcode ?? ''} onChange={e => set('daraja_shortcode', e.target.value)} placeholder="e.g. 174379" />
            </div>
            <div>
              <label className="label">Environment</label>
              <select className="input" value={s.daraja_env ?? 'sandbox'} onChange={e => set('daraja_env', e.target.value)}>
                <option value="sandbox">Sandbox</option>
                <option value="production">Production</option>
              </select>
            </div>
            <div>
              <label className="label">Consumer Key</label>
              <input className="input" value={s.daraja_consumer_key ?? ''} onChange={e => set('daraja_consumer_key', e.target.value)} placeholder="Consumer key" />
            </div>
            <div>
              <label className="label">Consumer Secret</label>
              <input type="password" className="input" value={s.daraja_consumer_secret ?? ''} onChange={e => set('daraja_consumer_secret', e.target.value)} placeholder="Consumer secret" />
            </div>
            <div>
              <label className="label">Passkey</label>
              <input type="password" className="input" value={s.daraja_passkey ?? ''} onChange={e => set('daraja_passkey', e.target.value)} placeholder="STK passkey" />
            </div>
            <div>
              <label className="label">Callback URL</label>
              <input className="input" value={s.daraja_callback_url ?? ''} onChange={e => set('daraja_callback_url', e.target.value)} placeholder="https://your-callback" />
            </div>
          </div>
          <p className="text-xs text-amber-600 mt-3">Live STK push activates in an upcoming update. Configuration is saved now so it's ready to switch on.</p>
        </div>

        {/* Receipt Templates */}
        <div className="card p-6">
          <div className="flex items-center gap-2 mb-4">
            <Receipt className="w-5 h-5 text-brand-600" />
            <h2 className="font-semibold text-lg">Receipt Templates</h2>
          </div>
          <p className="text-xs text-slate-500 mb-4">
            Customize the font, header and footer of what prints at checkout. The <strong>Order Note</strong> is a separate,
            small internal ticket staff can print from an open order to track what's been sent to the kitchen — it never
            shows prices.
          </p>

          {templatesLoading ? <div className="flex justify-center py-8"><Spinner size="lg" /></div> : (
            <div className="space-y-5">
              {([['receipt', 'Customer Receipts', receiptTemplates], ['order_note', 'Order Notes', orderNoteTemplates]] as const).map(([type, label, list]) => (
                <div key={type}>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-slate-600">{label}</h3>
                    <button onClick={() => openNewTemplate(type)} className="flex items-center gap-1 text-brand-600 text-xs font-medium hover:underline">
                      <Plus className="w-3.5 h-3.5" /> New template
                    </button>
                  </div>
                  <div className="space-y-2">
                    {list.map((tpl: any) => (
                      <div key={tpl.id} className="flex items-center gap-3 border border-slate-200 rounded-xl px-4 py-2.5">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm truncate">{tpl.name}</p>
                            {!!tpl.is_default && <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-brand-100 text-brand-700 shrink-0">DEFAULT</span>}
                          </div>
                          <p className="text-xs text-slate-400 capitalize">{tpl.font_family} · {tpl.font_weight} · {tpl.font_size}</p>
                        </div>
                        {!tpl.is_default && (
                          <button onClick={() => makeDefaultTemplate(tpl)} title="Make default" className="p-1.5 rounded hover:bg-amber-50 text-slate-400 hover:text-amber-500"><Star className="w-4 h-4" /></button>
                        )}
                        <button onClick={() => openEditTemplate(tpl)} title="Edit" className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700"><Edit2 className="w-4 h-4" /></button>
                        <button onClick={() => deleteTemplate(tpl)} title="Delete" className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    ))}
                    {list.length === 0 && <p className="text-xs text-slate-400 py-2">No {label.toLowerCase()} yet.</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Software Update */}
        <div className="card p-6">
          <div className="flex items-center gap-2 mb-4">
            <Download className="w-5 h-5 text-brand-600" />
            <h2 className="font-semibold text-lg">Software Update</h2>
          </div>
          {!isDesktopApp() ? (
            <p className="text-sm text-slate-500">Updates are only available in the installed desktop app.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="label">GitHub owner</label>
                  <input className="input" value={s.update_repo_owner ?? 'k-nkoroi'} onChange={e => set('update_repo_owner', e.target.value)} placeholder="e.g. k-nkoroi" />
                </div>
                <div>
                  <label className="label">Repository</label>
                  <input className="input" value={s.update_repo_name ?? 'smeazy-pos'} onChange={e => set('update_repo_name', e.target.value)} placeholder="e.g. smeazy-pos" />
                </div>
              </div>
              <p className="text-xs text-slate-400 mb-4">
                The app checks this repository's GitHub Releases for a newer signed version. Your data stays on this device — updates only replace the application files.
              </p>

              <div className="flex items-center gap-3">
                <button onClick={handleCheckForUpdate} disabled={checking} className="btn-secondary flex items-center gap-2">
                  {checking ? <Spinner size="sm" /> : <RefreshCw className="w-4 h-4" />} Check for Updates
                </button>
                {updateInfo && !updateInfo.available && (
                  <span className="flex items-center gap-1.5 text-sm text-emerald-600"><CheckCircle2 className="w-4 h-4" /> Up to date (v{updateInfo.current_version})</span>
                )}
              </div>

              {updateInfo?.available && (
                <div className="mt-4 p-4 rounded-xl bg-brand-50 border border-brand-200">
                  <p className="font-medium text-sm text-brand-800">Version {updateInfo.latest_version} is available (current: v{updateInfo.current_version})</p>
                  {updateInfo.notes && <p className="text-xs text-slate-600 mt-1 whitespace-pre-wrap">{updateInfo.notes}</p>}
                  <button onClick={handleInstallUpdate} disabled={installing} className="btn-primary mt-3 flex items-center gap-2">
                    {installing ? <Spinner size="sm" /> : <Download className="w-4 h-4" />} Install &amp; Restart
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        <button onClick={save} disabled={saving} className="btn-primary flex items-center gap-2">
          {saving ? <Spinner size="sm" /> : <><Save className="w-4 h-4" /> Save Settings</>}
        </button>
      </div>

      {/* Receipt template editor modal */}
      {showTemplateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-bold text-xl">{editingTemplate ? 'Edit Template' : `New ${templateForm.template_type === 'receipt' ? 'Receipt' : 'Order Note'} Template`}</h2>
              <button onClick={() => setShowTemplateModal(false)} className="p-1 rounded hover:bg-slate-100"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="label">Template name *</label>
                <input className="input" value={templateForm.name} onChange={e => setTemplateForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Compact receipt" autoFocus />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="label">Font</label>
                  <select className="input" value={templateForm.font_family} onChange={e => setTemplateForm(p => ({ ...p, font_family: e.target.value }))}>
                    <option value="mono">Monospace</option>
                    <option value="sans">Sans-serif</option>
                    <option value="serif">Serif</option>
                  </select>
                </div>
                <div>
                  <label className="label">Weight</label>
                  <select className="input" value={templateForm.font_weight} onChange={e => setTemplateForm(p => ({ ...p, font_weight: e.target.value }))}>
                    <option value="normal">Normal</option>
                    <option value="medium">Medium</option>
                    <option value="bold">Bold</option>
                  </select>
                </div>
                <div>
                  <label className="label">Size</label>
                  <select className="input" value={templateForm.font_size} onChange={e => setTemplateForm(p => ({ ...p, font_size: e.target.value }))}>
                    <option value="xs">Extra small</option>
                    <option value="sm">Small</option>
                    <option value="base">Normal</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="label">Header text</label>
                <textarea className="input min-h-[60px] resize-none" value={templateForm.header_text} onChange={e => setTemplateForm(p => ({ ...p, header_text: e.target.value }))} placeholder="Shown below your business name/logo — e.g. address, tagline" />
              </div>
              <div>
                <label className="label">Footer text</label>
                <textarea className="input min-h-[60px] resize-none" value={templateForm.footer_text} onChange={e => setTemplateForm(p => ({ ...p, footer_text: e.target.value }))} placeholder="Shown at the bottom of the ticket — e.g. a thank-you note" />
              </div>
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input type="checkbox" checked={templateForm.show_logo} onChange={e => setTemplateForm(p => ({ ...p, show_logo: e.target.checked }))} className="w-4 h-4" />
                Show business logo
              </label>
              {templateForm.template_type === 'receipt' && (
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <input type="checkbox" checked={templateForm.show_vat_note} onChange={e => setTemplateForm(p => ({ ...p, show_vat_note: e.target.checked }))} className="w-4 h-4" />
                  Show "Price inclusive of VAT" note
                </label>
              )}
            </div>
            <div className="p-6 border-t border-slate-100 flex gap-3">
              <button className="btn-primary flex-1" onClick={saveTemplate} disabled={savingTemplate}>
                {savingTemplate ? <Spinner size="sm" /> : (editingTemplate ? 'Save Changes' : 'Create Template')}
              </button>
              <button className="btn-secondary" onClick={() => setShowTemplateModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
