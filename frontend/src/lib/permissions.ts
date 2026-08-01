// Central role → permission mapping for SMEazy POS.
// A staff member can hold multiple roles and inherits the union of their permissions.

export type Role =
  | 'entrepreneur'      // business owner — everything
  | 'admin_staff'       // full management
  | 'executive_staff'   // shift manager — POS + reports + discounts, no staff mgmt
  | 'cashier'           // POS + analytics (Sales & Inventory dept)
  | 'storekeeper'       // inventory only (Sales & Inventory dept)
  | 'operational_staff' // Waitstaff — POS floor only
  | 'guest_contractor'  // profile only

export const ROLE_LABELS: Record<string, string> = {
  entrepreneur:      'Owner',
  admin_staff:       'Admin Staff',
  executive_staff:   'Executive Staff',
  cashier:           'Cashier',
  storekeeper:       'Storekeeper',
  operational_staff: 'Waitstaff',
  guest_contractor:  'Contractor',
}

// Which capabilities each role grants.
export type Capability =
  | 'dashboard'   // can see the dashboard shell + nav to it
  | 'pos'         // floor plan + order screen
  | 'kitchen'     // kitchen display
  | 'inventory'   // inventory management (view; editing gated separately)
  | 'inventory_edit' // create/edit/import/export/adjust inventory (admin+manager)
  | 'analytics'   // analytics/reports
  | 'staff_analytics' // staff performance reports (admin+manager)
  | 'staff'       // staff management
  | 'registers'   // register management
  | 'logs'        // audit log view (admin/owner only)
  | 'settings'    // business settings
  | 'accommodation' // Room status board (view for all dashboard roles; manual Ready action gated server-side to Storekeeper+)

const ROLE_CAPS: Record<string, Capability[]> = {
  entrepreneur:      ['dashboard','pos','kitchen','inventory','inventory_edit','analytics','staff_analytics','staff','registers','logs','settings','accommodation'],
  admin_staff:       ['dashboard','pos','kitchen','inventory','inventory_edit','analytics','staff_analytics','staff','registers','logs','settings','accommodation'],
  executive_staff:   ['dashboard','pos','kitchen','analytics','staff_analytics','inventory','inventory_edit','accommodation'],
  cashier:           ['dashboard','pos','kitchen','analytics','inventory','accommodation'],  // inventory VIEW only
  storekeeper:       ['dashboard','inventory','inventory_edit','accommodation'],
  operational_staff: ['pos','kitchen'],          // NO dashboard
  guest_contractor:  [],                         // profile only
}

/** Union of capabilities across all a user's roles. */
export function capabilitiesOf(roles: string[] | undefined): Set<Capability> {
  const caps = new Set<Capability>()
  for (const r of roles ?? []) {
    for (const c of (ROLE_CAPS[r] ?? [])) caps.add(c)
  }
  return caps
}

export function can(roles: string[] | undefined, cap: Capability): boolean {
  return capabilitiesOf(roles).has(cap)
}

/** True if the user's ONLY role is Waitstaff (operational_staff). */
export function isWaitstaffOnly(roles: string[] | undefined): boolean {
  const r = (roles ?? []).filter(Boolean)
  return r.length > 0 && r.every(x => x === 'operational_staff')
}

/** True if the user has any dashboard-capable role (so a "Go to Dashboard" button should show). */
export function hasDashboardAccess(roles: string[] | undefined): boolean {
  return can(roles, 'dashboard')
}

/** Departments used to tag inventory categories and scope registers. */
export const DEPARTMENTS = ['Kitchen','Bar','Accommodation','Pool','Games','Toys'] as const
export type Department = typeof DEPARTMENTS[number]
