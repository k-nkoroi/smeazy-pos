// Thin wrapper around the Rust-side update commands (src-tauri/src/main.rs).
// The actual update endpoint is built and verified in Rust — the JS side only
// supplies which repo to check, matching the admin-configured Settings value.
// This keeps the cryptographic signature check (the real security boundary)
// entirely server/Rust-side while still letting the repo be admin-configurable.

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

export interface UpdateInfo {
  available: boolean
  current_version: string
  latest_version?: string | null
  notes?: string | null
}

export async function checkForUpdate(owner: string, repo: string): Promise<UpdateInfo> {
  if (!isTauri) throw new Error('Updates are only available in the desktop app')
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<UpdateInfo>('check_for_update', { owner, repo })
}

export async function installUpdate(owner: string, repo: string): Promise<void> {
  if (!isTauri) throw new Error('Updates are only available in the desktop app')
  const { invoke } = await import('@tauri-apps/api/core')
  await invoke('install_update', { owner, repo })
}

export async function relaunchApp(): Promise<void> {
  if (!isTauri) return
  const { relaunch } = await import('@tauri-apps/plugin-process')
  await relaunch()
}

export function isDesktopApp(): boolean {
  return isTauri
}
