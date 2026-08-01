import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore, useDeviceStore } from './hooks/useAuth'
import { can, isWaitstaffOnly, type Capability } from './lib/permissions'
import { PosLockGuard } from './components/shared/PosLockGuard'
import LoginPage      from './pages/LoginPage'
import RegisterPage   from './pages/RegisterPage'
import DashboardPage  from './pages/DashboardPage'
import ProfilePage    from './pages/ProfilePage'
import StaffPage      from './pages/StaffPage'
import RegistersPage  from './pages/RegistersPage'
import LogsPage       from './pages/LogsPage'
import SettingsPage   from './pages/SettingsPage'
import AccommodationPage from './pages/AccommodationPage'
import FloorPlanPage  from './pages/FloorPlanPage'
import PosOrderPage   from './pages/PosOrderPage'
import KitchenPage    from './pages/KitchenPage'
import InventoryPage  from './pages/InventoryPage'
import AnalyticsPage  from './pages/AnalyticsPage'

/** Requires a live session; redirects to login if the token is gone (e.g. after restart). */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = useAuthStore(s => s.token)
  if (!token) return <Navigate to="/login" replace />
  return <>{children}</>
}

/** Requires a specific capability; falls back to the user's home if they lack it. */
function RequireCap({ cap, children }: { cap: Capability; children: React.ReactNode }) {
  const { token, user } = useAuthStore()
  if (!token) return <Navigate to="/login" replace />
  if (!can(user?.roles, cap)) {
    // POS-only users always land on the floor; others on dashboard.
    return <Navigate to={isWaitstaffOnly(user?.roles) ? '/floor' : '/dashboard'} replace />
  }
  return <>{children}</>
}

export default function App() {
  const token = useAuthStore(s => s.token)
  const user = useAuthStore(s => s.user)
  const business = useDeviceStore(s => s.business)

  // Onboarding shows ONLY when no business is registered on this device.
  // Once registered, /register redirects to login unless actively onboarding.
  function homeFor(): string {
    if (!token) return '/login'
    if (isWaitstaffOnly(user?.roles)) return '/floor'
    return '/dashboard'
  }
  const home = homeFor()

  return (
    <Routes>
      {/* Onboarding — only reachable if no business on device (else bounce to login) */}
      <Route path="/register" element={
        token ? <Navigate to={home} replace />
        : business ? <Navigate to="/login" replace />
        : <RegisterPage />
      } />
      <Route path="/login" element={token ? <Navigate to={home} replace /> : <LoginPage />} />

      {/* Dashboard-family routes — gated by capability, wrapped in the inactivity lock */}
      <Route path="/dashboard" element={<RequireCap cap="dashboard"><PosLockGuard><DashboardPage /></PosLockGuard></RequireCap>} />
      <Route path="/staff"     element={<RequireCap cap="staff"><PosLockGuard><StaffPage /></PosLockGuard></RequireCap>} />
      <Route path="/registers" element={<RequireCap cap="registers"><PosLockGuard><RegistersPage /></PosLockGuard></RequireCap>} />
      <Route path="/logs"      element={<RequireCap cap="logs"><PosLockGuard><LogsPage /></PosLockGuard></RequireCap>} />
      <Route path="/settings"  element={<RequireCap cap="settings"><PosLockGuard><SettingsPage /></PosLockGuard></RequireCap>} />
      <Route path="/accommodation" element={<RequireCap cap="accommodation"><PosLockGuard><AccommodationPage /></PosLockGuard></RequireCap>} />
      <Route path="/inventory" element={<RequireCap cap="inventory"><PosLockGuard><InventoryPage /></PosLockGuard></RequireCap>} />
      <Route path="/analytics" element={<RequireCap cap="analytics"><PosLockGuard><AnalyticsPage /></PosLockGuard></RequireCap>} />

      {/* Profile — everyone with a session */}
      <Route path="/profile" element={<RequireAuth><PosLockGuard><ProfilePage /></PosLockGuard></RequireAuth>} />

      {/* POS-family routes — gated by pos capability, wrapped in the inactivity lock */}
      <Route path="/floor"        element={<RequireCap cap="pos"><PosLockGuard><FloorPlanPage /></PosLockGuard></RequireCap>} />
      <Route path="/pos/:orderId" element={<RequireCap cap="pos"><PosLockGuard><PosOrderPage /></PosLockGuard></RequireCap>} />
      <Route path="/kitchen"      element={<RequireCap cap="kitchen"><PosLockGuard><KitchenPage /></PosLockGuard></RequireCap>} />

      <Route path="*" element={<Navigate to={home} replace />} />
    </Routes>
  )
}
