import { useEffect, useState } from 'react'
import { Settings as SettingsIcon, Percent, Smartphone, Save, Download, RefreshCw, CheckCircle2 } from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { Layout } from '../components/shared/Layout'
import { authApi } from '../lib/api'
import { Spinner } from '../components/shared/Spinner'
import { checkForUpdate, installUpdate, relaunchApp, isDesktopApp, type UpdateInfo } from '../lib/updater'

export default function SettingsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [s, setS] = useState<Record<string, string>>({})
  const [checking, setChecking] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)

  async function load() {
    setLoading(true)
    const res = await authApi.getSettings().catch(() => null)
    if (res) setS(res.data.data ?? {})
    setLoading(false)
  }
  useEffect(() => { load() }, [])

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
    </Layout>
  )
}
