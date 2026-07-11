# SMEazy POS — Upgrade 4: Staff PINs fix, Stock Take UI, Purchase Orders, Suppliers, Tauri Desktop App

## 1 · Apply the file changes

Copy every file in this bundle over your project, preserving paths:

| Bundle path | Destination | What changed |
|---|---|---|
| `migrations/003_suppliers_logo_perf.sql` | `migrations/` | NEW — suppliers table, business logo column, PO↔supplier link |
| `crates/smeazy-inventory/src/*.rs` | same | Suppliers CRUD; PO tied to supplier; full stock-take service |
| `crates/smeazy-iam/src/*.rs` | same | Direct enterprise registration + business logo endpoint |
| `crates/smeazy-analytics/src/*.rs` | same | Staff performance report + per-tab CSV exports |
| `crates/smeazy-api/src/main.rs` | same | CORS opened for Tauri webview; binds 127.0.0.1 |
| `frontend/src/**` | same | All pages below |
| `src-tauri/**` | NEW folder at project root | Tauri 2 desktop shell |

Frontend files: `App.tsx`, `lib/api.ts`, `hooks/useAuth.ts`, `components/shared/Sidebar.tsx`,
pages: `LoginPage`, `RegisterPage` (new direct onboarding + logo upload), `StaffPage` (typing bug FIXED),
`InventoryPage` (Stock Take / Purchase Orders / Suppliers tabs, typing bug FIXED), `AnalyticsPage` (Staff tab),
`PosOrderPage` (printable receipt).

> **Delete `OnboardPage.tsx` from routing** — App.tsx no longer references it. The file can stay on disk unused.

## 2 · The typing bug — what it was

`StaffForm` / `ItemModal` were React components **defined inside** the page component. Every keystroke updated state → re-rendered the page → recreated the modal component → React unmounted/remounted every input → focus lost after one character. Fix: the modal JSX is now written **inline** in the page's return, so inputs persist across re-renders. This pattern is fixed in StaffPage and InventoryPage.

## 3 · Database

Migration 003 runs automatically, but existing DBs also carry migrations 001–002. If your DB predates 002:
```cmd
del smeazy.db      :: only if you're ok starting fresh
```
Otherwise just run — sqlx applies only new migrations.

## 4 · Rebuild backend

```cmd
cargo build --release -p smeazy-api -j 1
```

## 5 · Web mode still works exactly as before

```cmd
.\target\release\smeazy-api.exe        :: terminal 1
cd frontend && npm run dev             :: terminal 2
```

---

## 6 · Tauri 2.0 Desktop App — one-click .exe + installer

### One-time setup on your build machine

```cmd
:: Rust target + Tauri CLI
cargo install tauri-cli --version "^2"

:: Node deps (if not already)
cd frontend && npm install && cd ..
```

Tauri on Windows also needs **WebView2** (pre-installed on Win 10/11) and the
**Visual Studio Build Tools** you already have from building the backend.

### Prepare the sidecar binary

Tauri bundles the backend as a "sidecar". It must be named with the target triple:

```cmd
cargo build --release -p smeazy-api
copy target\release\smeazy-api.exe src-tauri\binaries\smeazy-api-x86_64-pc-windows-msvc.exe
```

### An icon

Put any square PNG (512×512) at `src-tauri\icons\icon.png`, then:
```cmd
cargo tauri icon src-tauri\icons\icon.png
```
This generates `icon.ico` and all sizes automatically.

### Run in dev mode (hot reload)

```cmd
cargo tauri dev
```
Opens the desktop window, spawns the backend sidecar automatically. No terminal needed after this.

### Build the installer

```cmd
cargo tauri build
```

Outputs:
- **Standalone app**: `src-tauri\target\release\smeazy-pos-app.exe`
- **NSIS installer**: `src-tauri\target\release\bundle\nsis\SMEazy POS_2.0.0_x64-setup.exe`

The installer is what you share with other machines — it installs the app + embedded backend + WebView2 bootstrapper if missing, creates Start-menu and Desktop shortcuts. The SQLite DB lives per-machine in `%APPDATA%\ke.co.cotr.smeazypos\smeazy.db`, so each installation has its own data and survives app updates.

### How it works

`src-tauri/src/main.rs` spawns `smeazy-api` as a child process on startup with `DATABASE_PATH` pointed at the app-data dir, then opens the webview at your built frontend. `frontend/src/lib/api.ts` detects Tauri (`__TAURI_INTERNALS__`) and calls `http://127.0.0.1:8000` directly.

---

## 7 · What's new in this upgrade (summary)

1. **Typing bug fixed** — modals no longer lose focus per character
2. **Stock Take** — start → snapshot expected levels → enter physical counts (auto-saves on blur) → variance flagged in amber/red → Complete applies counts to inventory + logs movements. History table with performer & timestamps. Print/PDF button.
3. **Purchase Orders** — "New PO" auto-populates from low-stock alerts with suggested quantities (2×reorder − on-hand), tick items, pick supplier, create & submit. Open a PO → adjust received qty per line → **Restock** button updates inventory automatically. Status flows draft → submitted → partially_received → received.
4. **Suppliers** — CRUD tab; POs are tied to a supplier.
5. **Direct onboarding** — register page collects business + owner in one step, with **logo upload** (stored as data-URL, shown in sidebar and receipts).
6. **Staff performance analytics** — new Staff tab: sales, orders, avg order, items sold, guests served, share-of-sales bar per waitstaff; chart + CSV export.
7. **Printable receipts** — after Complete Order a receipt (with your logo) pops up with a Print button. Use the browser/Tauri print dialog → "Save as PDF" for PDF copies. Same Print/PDF buttons on Stock Takes, POs, and Analytics.
8. **Report filenames** now include the filtered date range (e.g. `staff_2026-06-01_2026-06-30.csv`).
9. **Tauri desktop app** — standalone exe + shareable NSIS installer.
