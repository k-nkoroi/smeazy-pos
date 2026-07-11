import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface UserPublic { id: string; username: string; email: string; role: string; roles: string[]; display_name?: string }
interface BusinessPublic { id: string; name: string; industry_package: string; logo_url?: string }
interface TenantPublic { id: string; slug: string; name: string; plan_tier: string }

interface AuthState {
  // ── Session (NOT persisted — cleared on app restart) ──
  token: string | null
  user: UserPublic | null
  tenant: TenantPublic | null
  onboarding_complete: boolean
  // POS lock state
  posLocked: boolean

  setAuth: (data: { token: string; user: UserPublic; business?: BusinessPublic | null; tenant?: TenantPublic; onboarding_complete?: boolean }) => void
  setUser: (u: UserPublic) => void
  logout: () => void
  lockPos: () => void
  unlockPos: () => void
}

interface DeviceState {
  // ── Device registration (persisted — survives restart) ──
  business: BusinessPublic | null
  setBusiness: (b: BusinessPublic | null) => void
  clearBusiness: () => void
  // Selected register (till) for this device — scopes POS to its departments
  registerId: string | null
  registerName: string | null
  registerDepartments: string[]
  setRegister: (r: { id: string; name: string; departments: string[] } | null) => void
}

/**
 * Session store — deliberately NOT persisted. When the app restarts the token
 * is gone, so the user must log back in (Issue #6). The business/device
 * registration lives in a separate persisted store below.
 */
export const useAuthStore = create<AuthState>()((set) => ({
  token: null, user: null, tenant: null, onboarding_complete: false, posLocked: false,
  setAuth: (data) => {
    // Persist the business into the device store so onboarding is skipped next launch.
    if (data.business) useDeviceStore.getState().setBusiness(data.business)
    set({
      token: data.token, user: data.user, tenant: data.tenant ?? null,
      onboarding_complete: data.onboarding_complete ?? true, posLocked: false,
    })
  },
  setUser: (u) => set({ user: u }),
  logout: () => set({ token: null, user: null, tenant: null, onboarding_complete: false, posLocked: false }),
  lockPos: () => set({ posLocked: true }),
  unlockPos: () => set({ posLocked: false }),
}))

/**
 * Device store — persisted. Remembers which business is registered on THIS
 * device so we can skip onboarding and go straight to login on next launch.
 */
export const useDeviceStore = create<DeviceState>()(
  persist(
    (set) => ({
      business: null,
      setBusiness: (b) => set({ business: b }),
      clearBusiness: () => set({ business: null }),
      registerId: null,
      registerName: null,
      registerDepartments: [],
      setRegister: (r) => set({
        registerId: r?.id ?? null,
        registerName: r?.name ?? null,
        registerDepartments: r?.departments ?? [],
      }),
    }),
    { name: 'smeazy-device' }
  )
)

/** Convenience: the active business (from session if logged in, else device registration). */
export function useBusiness(): BusinessPublic | null {
  const deviceBiz = useDeviceStore((s) => s.business)
  return deviceBiz
}
