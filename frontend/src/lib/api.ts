import axios from 'axios'
import { useAuthStore } from '../hooks/useAuth'

// In Tauri the frontend is served from tauri:// origin — API must be absolute.
const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
const BASE = isTauri ? 'http://127.0.0.1:8000' : ((import.meta as any).env?.VITE_API_URL ?? '/api')

export const api = axios.create({ baseURL: BASE, timeout: 15000 })

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})
api.interceptors.response.use(r => r, err => {
  if (err.response?.status === 401) { useAuthStore.getState().logout(); window.location.href = '/login' }
  return Promise.reject(err)
})

export const authApi = {
  register:        (d: any) => api.post('/auth/register', d),
  login:           (d: any) => api.post('/auth/login', d),
  pinLogin:        (d: any) => api.post('/auth/pin-login', d),
  verifyPin:       (d: any) => api.post('/auth/verify-pin', d),
  listRegisters:   ()       => api.get('/registers'),
  createRegister:  (d: any) => api.post('/registers', d),
  updateRegister:  (id: string, d: any) => api.put(`/registers/${id}`, d),
  auditLogs:       (params?: any) => api.get('/audit-logs', { params }),
  getSettings:     ()       => api.get('/settings'),
  paymentConfig:   ()       => api.get('/payment-config'),
  updateSettings:  (d: any) => api.put('/settings', { settings: d }),
  me:              ()       => api.get('/auth/me'),
  listStaffPos:    ()       => api.get('/auth/staff'),
  listStaff:       ()       => api.get('/staff'),
  createStaff:     (d: any) => api.post('/staff', d),
  updateStaff:     (uid: string, d: any) => api.put(`/staff/${uid}`, d),
  resetPin:        (uid: string) => api.post(`/staff/${uid}/reset-pin`),
  getProfile:      ()       => api.get('/auth/profile'),
  updateProfile:   (d: any) => api.put('/auth/profile', d),
  updateBusiness:  (d: any) => api.put('/auth/business', d),
}

export const receiptTemplatesApi = {
  list:   (type?: 'receipt'|'order_note') => api.get('/settings/receipt-templates', { params: { type } }),
  create: (d: any)                        => api.post('/settings/receipt-templates', d),
  update: (id: string, d: any)            => api.put(`/settings/receipt-templates/${id}`, d),
  remove: (id: string)                    => api.delete(`/settings/receipt-templates/${id}`),
}

export const tablesApi = {
  list:     ()       => api.get('/tables'),
  create:   (d: any) => api.post('/tables', d),
  update:   (id: string, d: any) => api.put(`/tables/${id}`, d),
  delete:   (id: string) => api.delete(`/tables/${id}`),
  transfer: (d: any) => api.post('/tables/transfer', d),
  merge:    (d: any) => api.post('/tables/merge', d),
}

export const posApi = {
  listOrders:       ()                        => api.get('/pos/orders'),
  getOrder:         (id: string)              => api.get(`/pos/orders/${id}`),
  createOrder:      (d: any)                  => api.post('/pos/orders', d),
  addItem:          (orderId: string, d: any) => api.post(`/pos/orders/${orderId}/items`, d),
  removeItem:       (orderId: string, itemId: string) => api.delete(`/pos/orders/${orderId}/items/${itemId}`),
  updateItemQuantity: (orderId: string, itemId: string, quantity: number) => api.put(`/pos/orders/${orderId}/items/${itemId}/quantity`, { quantity }),
  updateItemStatus: (itemId: string, d: any)  => api.put(`/pos/items/${itemId}/status`, d),
  updateWaitstaff:  (orderId: string, d: any) => api.put(`/pos/orders/${orderId}/waitstaff`, d),
  attachCustomer:   (orderId: string, d: any) => api.put(`/pos/orders/${orderId}/customer`, d),
  applyDiscount:    (orderId: string, d: any) => api.post(`/pos/orders/${orderId}/discount`, d),
  sendToKitchen:    (orderId: string, d: any) => api.post(`/pos/orders/${orderId}/kitchen`, d),
  checkout:         (orderId: string, d: any) => api.post(`/pos/orders/${orderId}/checkout`, d),
  payTab:           (orderId: string, d: any) => api.post(`/pos/orders/${orderId}/pay`, d),
  voidOrder:        (orderId: string)         => api.post(`/pos/orders/${orderId}/void`),
  summary:          (date?: string)           => api.get('/pos/summary', { params: { date } }),
}

export const customersApi = {
  search:  (q: string)      => api.get('/customers', { params: { search: q } }),
  list:    ()               => api.get('/customers'),
  create:  (d: any)         => api.post('/customers', d),
  get:     (id: string)     => api.get(`/customers/${id}`),
}

export const accommodationApi = {
  listRooms: ()               => api.get('/accommodation/rooms'),
  setReady:  (itemId: string, notes?: string) => api.put(`/accommodation/rooms/${itemId}/ready`, { notes }),
}

export const inventoryApi = {
  listCategories: ()               => api.get('/inventory/categories'),
  createCategory: (d: any)         => api.post('/inventory/categories', d),
  updateCategory: (id: string, d: any) => api.put(`/inventory/categories/${id}`, d),
  listItems:      (catId?: string, itemType?: string) => api.get('/inventory/items', { params: { ...(catId?{category_id:catId}:{}), ...(itemType?{item_type:itemType}:{}) } }),
  createItem:     (d: any)         => api.post('/inventory/items', d),
  updateItem:     (id: string, d: any) => api.put(`/inventory/items/${id}`, d),
  bulkDeleteItems: (ids: string[])     => api.post('/inventory/items/bulk-delete', { ids }),
  adjustStock:    (id: string, d: any) => api.post(`/inventory/items/${id}/adjust`, d),
  recordSpoil:    (id: string, d: any) => api.post(`/inventory/items/${id}/spoil`, d),
  getRecipe:      (id: string) => api.get(`/inventory/items/${id}/recipe`),
  setRecipe:      (id: string, d: any) => api.put(`/inventory/items/${id}/recipe`, d),
  alerts:         ()               => api.get('/inventory/alerts'),
  importCsv:      (csvText: string) => api.post('/inventory/import', csvText, { headers: { 'Content-Type': 'text/csv' } }),
  exportCsv:      ()               => api.get('/inventory/export', { responseType: 'blob' }),
  listStockTakes:    ()            => api.get('/inventory/stocktakes'),
  startStockTake:    (d: any)      => api.post('/inventory/stocktakes', d),
  getStockTake:      (id: string)  => api.get(`/inventory/stocktakes/${id}`),
  completeStockTake: (id: string)  => api.post(`/inventory/stocktakes/${id}/complete`),
  countLine:         (lineId: string, d: any) => api.put(`/inventory/stocktake-lines/${lineId}/count`, d),
  listSuppliers:  ()               => api.get('/inventory/suppliers'),
  createSupplier: (d: any)         => api.post('/inventory/suppliers', d),
  updateSupplier: (id: string, d: any) => api.put(`/inventory/suppliers/${id}`, d),
  listRequisitions:  ()            => api.get('/inventory/requisitions'),
  createRequisition: (d: any)      => api.post('/inventory/requisitions', d),
  getRequisition:    (id: string)  => api.get(`/inventory/requisitions/${id}`),
  submitRequisition: (id: string)  => api.post(`/inventory/requisitions/${id}/submit`),
  receiveLine:       (lineId: string, d: any) => api.put(`/inventory/requisition-lines/${lineId}/receive`, d),
  listBatches:       (itemId: string)         => api.get(`/inventory/items/${itemId}/batches`),
  createBatch:       (itemId: string, d: any) => api.post(`/inventory/items/${itemId}/batches`, d),
  updateBatch:       (batchId: string, d: any) => api.put(`/inventory/batches/${batchId}`, d),
  expiringBatches:   (days?: number)          => api.get('/inventory/batches/expiring', { params: { days } }),
  processBatch:      (itemId: string, d: any) => api.post(`/inventory/items/${itemId}/process`, d),
  completeProcessing: (itemId: string, d: any) => api.post(`/inventory/items/${itemId}/complete-processing`, d),
}

export const kitchenApi = {
  listActive:  ()               => api.get('/kitchen/orders'),
  acknowledge: (id: string)     => api.post(`/kitchen/orders/${id}/ack`),
  dispatch:    (itemId: string) => api.put(`/kitchen/items/${itemId}/dispatch`),
}

export const analyticsApi = {
  revenue:          (params?: any) => api.get('/analytics/revenue', { params }),
  products:         (params?: any) => api.get('/analytics/products', { params }),
  categories:       (params?: any) => api.get('/analytics/categories', { params }),
  staff:            (params?: any) => api.get('/analytics/staff', { params }),
  exportRevenue:    (params?: any) => api.get('/analytics/revenue/export',    { params, responseType: 'blob' }),
  exportProducts:   (params?: any) => api.get('/analytics/products/export',   { params, responseType: 'blob' }),
  exportCategories: (params?: any) => api.get('/analytics/categories/export', { params, responseType: 'blob' }),
  exportStaff:      (params?: any) => api.get('/analytics/staff/export',      { params, responseType: 'blob' }),
}
