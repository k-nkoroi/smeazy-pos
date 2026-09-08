# SMEazy POS — Offline-First Hospitality Point of Sale (v2.6)

A modular, production-grade point-of-sale platform built for hospitality businesses (bars, restaurants, pools, accommodation). **Fully offline-first**: the Rust binary embeds SQLite and auto-creates the database on first run — no Docker, no PostgreSQL, no network required. Ships as a native Windows desktop app via Tauri 2, or run the API + web frontend separately for development.

## What's new in 2.6.1

**Customizable receipt templates.** Settings → **Receipt Templates** lets you save named print templates — font (monospace/sans/serif), weight, size, and custom header/footer text — and mark one as the default per type. The checkout receipt now prints using your saved default template instead of a fixed layout.

**Order Note.** A new small, minimal internal ticket, separate from the customer receipt and carrying no prices. Print it from the **Order Note** button in an open order's header, any time before checkout, as many times as needed. It shows the order's short reference, table, time, and assigned waitstaff, then every item currently on the order with its quantity and the time it was added — items not yet sent to the kitchen are flagged **●NEW**, and items already dispatched from the kitchen print with a strikethrough, so floor and kitchen staff can see at a glance what's outstanding. Order Notes get their own template (also editable in Settings → Receipt Templates) so they can be styled independently from the customer receipt.

**CI fix.** The Windows build workflow now fails fast with a clear message if the Tauri updater's signing key was never configured, instead of a cryptic `failed to decode pubkey ... Invalid symbol 95, offset 7` deep into the build. If you're hitting that error: it means `src-tauri/tauri.conf.json`'s `plugins.updater.pubkey` still has its placeholder value — see **One-time setup** below.

## What's new in 2.6

**Customer tabs / partial payments.** At checkout, a cashier or waiter can attach a customer to an order by typing a name into a live search box — matching existing customers are suggested as they type (with their outstanding balance shown), or a new customer is created automatically if no match exists. With a customer attached, an order can be checked out with a partial payment, opening a **tab**: goods are served and inventory is still deducted, but the unpaid balance is tracked against that customer. A new **Customers** page lists every customer, their open tabs, and total balance due, and lets staff settle a tab (in full or in part) from the customer's order history.

**Inventory batch tracking & expiry dates.** Every inventory item (ingredient or product) can now be tracked by **batch**, each with a system-generated batch number. Receiving a purchase order line automatically creates a batch and lets the storekeeper set its expiry date on the spot; batches can also be added or have their expiry set manually at any time from the Inventory list via the new Batches view per item.

**Staged kitchen production for made-from-scratch items.** Kitchen products can now be marked **One-step** (default — ingredients are deducted directly from stock when the product is sold, e.g. Nyama Choma) or **Staged** (the product has an intermediate **processing** state before it's ready to sell, e.g. samosas or burger patties made ahead and held in the freezer). For staged items, a **Start processing** action deducts the recipe's raw ingredients up front and moves the batch into a "processing" (work-in-progress) state; a **Complete processing** action then moves finished, ready-to-eat quantity into sellable stock. This keeps raw ingredient levels (e.g. beef) accurate in real time even when some of it has already been turned into a not-yet-sold prepared item.

## What's new in 2.5

**Self-updating desktop app.** Admins can go to **Settings → Software Update** and click **Check for Updates** — the app checks the configured GitHub repository's Releases for a newer signed version, and **Install & Restart** downloads and installs it in place, then relaunches. Your database lives in the OS app-data folder, entirely separate from the install directory an update replaces, so your data is untouched. The GitHub repository to check is admin-configurable in Settings; see the CI section below for the one-time signing setup this requires.

**Accommodation / room status board.** Any product in a category tagged with the `Accommodation` department automatically appears on a new **Accommodation** dashboard view as a Room. Rooms move through **Ready → Occupied → Readying → Ready** automatically as they're added to POS orders, paid, or the checkout-time cutoff (11am the day after check-in) passes — with a manual "key is at reception" override available to Storekeeper role and above.

**Purchase orders by search.** The "New PO" screen no longer auto-populates every low-stock item — search for exactly the products or ingredients you want and set an exact quantity per line.

**Click-to-edit quantities on the bill.** Click a line item's quantity on the active order screen to type an exact amount, or use the +/- stepper, instead of re-adding the product repeatedly.

**Large-party tables.** Table capacity is a free number with no cap — set it as high as you need for big group bookings.

## What's new in 2.4

**Audit trail & activity logs.** Every state-changing action (sales, spoils, stock adjustments, item/category edits, imports, staff changes, register and recipe changes, settings updates) is written to an append-only audit log with the acting user, role, timestamp, and structured details. Admins review it in a filterable **Logs** view.

**Transaction-driven stock.** Stock levels only move through transactions — PO restocking, sales, and spoils. Cashiers can record spoils and now also apply director's rates. Direct stock edits, imports, and exports are limited to admins and managers; cashiers get a view-only inventory list.

**Kitchen dual-inventory with recipes.** Kitchen stock is split into **ingredients** (assembly items) and **products** (finished goods). A product can be marked "assembled" and given a recipe (bill of materials) of ingredients with per-unit quantities. Selling or spoiling an assembled product automatically depletes its ingredients; purchase orders restock ingredients. Bar products continue to sell directly from their own stock.

**Director's rates.** Admins, managers and cashiers can apply a director's promotion (100% off) or director's discount (sell at cost) at checkout — inventory is still deducted and the action is logged.

**VAT.** Prices are VAT-inclusive (default 16%, configurable). Receipts show the net and VAT split.

**M-Pesa Daraja (scaffold).** A Settings view lets admins configure and enable/disable an M-Pesa Daraja STK-push integration against an existing Paybill. The default checkout flow remains manual entry of the M-Pesa confirmation code; live STK push activates in a future update.

**Permissions.** Staff analytics is limited to admins and managers. Waitstaff-only staff cannot reassign a table — it defaults to their own account. Categories are editable and bind to departments so their products appear on the matching registers.

**Screen lock.** POS screens lock after 15 seconds of inactivity; entering a PIN signs in whoever entered it with their full role capabilities.

## Building the Windows app with GitHub Actions

A ready-to-use workflow lives at `.github/workflows/build.yml`. It builds the Rust API sidecar, then uses Tauri's official `tauri-action` to build, **sign**, and publish a Windows installer plus an auto-update manifest (`latest.json`) as a GitHub Release — no local toolchain required.

### One-time setup

**1. Generate a signing keypair.** The self-updater refuses to install anything not signed with your key, so this can't be skipped. Run this once, locally, wherever you have the Tauri CLI:
```bash
cargo install tauri-cli --version "^2" --locked
cargo tauri signer generate -w ~/.tauri/smeazy-pos.key
```
This prints a **public key** and writes a **private key** file (optionally password-protect it when prompted). Keep the private key secret — never commit it or paste it into chat.

**2. Put the public key in the app config.** Open `src-tauri/tauri.conf.json` and replace the placeholder:
```json
"plugins": { "updater": { "pubkey": "REPLACE_WITH_YOUR_PUBLIC_KEY_FROM_cargo_tauri_signer_generate" } }
```
> **Skipping this step is the #1 cause of a failed build.** If CI fails with `failed to decode pubkey ... Invalid symbol 95, offset 7`, this is why — `_` (ASCII 95) only ever shows up here because the placeholder string was never replaced. The build workflow now checks for this and fails fast with a clear message instead of that cryptic error, but the fix is the same either way: paste your real public key here.

**3. Add the private key to GitHub secrets.** Repo → **Settings → Secrets and variables → Actions** → add:
- `TAURI_SIGNING_PRIVATE_KEY` — the full contents of the private key file
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — the password you set (leave the secret empty/omit if you didn't set one)

**4. Enable workflow write access.** Repo → **Settings → Actions → General → Workflow permissions** → **Read and write permissions**.

**5. Point the app at your repo.** In the running app, an admin sets the GitHub owner/repository under **Settings → Software Update** (defaults to this project's own repo). The `endpoints` URL in `tauri.conf.json` is the build-time fallback; the Settings values are what the app actually checks at runtime.

### Build a versioned release
```bash
git tag v2.6.1
git push origin v2.6.1
```
The workflow builds, signs, and publishes a GitHub Release with the installer and `latest.json` attached — nothing further to do. Existing installs of the app will find this via **Settings → Check for Updates**.

### Build on demand (no release)
Repo → **Actions** tab → **Build SMEazy POS (Tauri)** → **Run workflow**. Download the **smeazy-pos-windows** artifact when it finishes — this path skips signing/publishing and is just for grabbing a build to test.

### What the workflow does
- Installs Rust (MSVC target) and Node 20.
- `npm ci` in `frontend/`.
- Builds `smeazy-api` for `x86_64-pc-windows-msvc` and copies it to `src-tauri/binaries/smeazy-api-x86_64-pc-windows-msvc.exe` (the sidecar name Tauri expects).
- Runs `tauri-apps/tauri-action`, which builds the frontend, bundles the installer, signs it (if the signing secrets are present), and publishes a GitHub Release with `latest.json` — the file the updater's endpoint reads to know a new version exists.

> The icon at `src-tauri/icons/icon.ico` is bundled automatically; replace it with your own square PNG via `cargo tauri icon path/to/logo.png` if you'd like custom branding.

## What's new in 2.3
- Multi-role staff, Cashier & Storekeeper roles, registers with department scoping, dual Dashboard/POS login, 15s auto-lock, plus fixes for table assignment, clear-table, CSV export, and stay-logged-in.

## What's new in 2.2
- Removed dead code that broke `tsc && vite build`: four unused frontend pages and their four dormant backend stub crates.

## What's new in 2.1
- Staff management with role-based accounts and auto-generated POS PINs for waitstaff
- Physical Stock Take workflow with variance flagging and audit trail
- Purchase Order / Requisition workflow tied to Suppliers, with one-click restock
- Staff performance analytics (sales, orders, items sold, guests served per waitstaff)
- Direct single-step business registration with logo upload
- Printable checkout receipts
- Native Tauri 2.0 desktop app + shareable Windows installer

---

## Architecture overview

```
smeazy_v2/
├── crates/
│   ├── smeazy-domain      # Pure types (Money, UserRoleType, ItemStatus…)
│   ├── smeazy-common      # HTTP helpers, JWT middleware
│   ├── smeazy-iam         # Auth: register, login, onboarding (unchanged from V1)
│   ├── smeazy-inventory   # Stock management + CSV import/export + categories
│   ├── smeazy-pos         # Order lifecycle, split payments, kitchen dispatch
│   ├── smeazy-tables      # Floor plan: areas, tables, transfer, merge
│   ├── smeazy-kitchen     # Kitchen display screen orders
│   ├── smeazy-analytics   # Revenue / product / category analytics
│   └── smeazy-api         # Axum binary — wires everything together
├── migrations/
│   └── 001_initial_schema.sql   # SQLite schema (runs automatically)
├── seeds/
│   └── products_cotr.csv        # 242 normalized CoTR products ready to import
├── frontend/
│   └── src/
│       ├── pages/         # FloorPlanPage, PosOrderPage, KitchenPage…
│       └── lib/api.ts     # All API endpoints
└── .env.example
```

---

## Prerequisites

### Windows (your environment)

| Tool | Version | Install |
|------|---------|---------|
| Rust toolchain | stable ≥ 1.75 | `winget install Rustlang.Rustup` then `rustup update stable` |
| Node.js | ≥ 18 LTS | `winget install OpenJS.NodeJS.LTS` |
| Git | any | `winget install Git.Git` |

> **No Docker needed.** No PostgreSQL. No Redis. The SQLite database file (`smeazy.db`) is created automatically in whichever directory you run the binary from.

### macOS / Linux

```bash
# Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env

# Node.js (via nvm)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
nvm install --lts
```

---

## Quick start

### 1 — Clone & configure

```cmd
cd C:\Users\Mwenda\Downloads\nkoroi
git clone <repo> smeazy_v2
cd smeazy_v2

:: Copy environment file
copy .env.example .env
```

Edit `.env` — at minimum change `JWT_SECRET` to a long random string (32+ chars).

### 2 — Build the backend

```cmd
:: Windows (use -j 1 to keep RAM usage down)
cargo build --release -p smeazy-api -j 1

:: macOS / Linux (faster parallel build)
cargo build --release -p smeazy-api
```

The first build downloads and compiles all Rust crates (~5–8 min). Subsequent builds are incremental (<30 s).

### 3 — Run the backend

```cmd
:: Windows
set DATABASE_PATH=smeazy.db
set JWT_SECRET=your-secret-here
.\target\release\smeazy-api.exe

:: macOS / Linux
./target/release/smeazy-api
```

On first run you will see:
```
✅ SQLite database ready at: smeazy.db
✅ Migrations applied
🌍 SMEazy API listening on http://0.0.0.0:8000
```

The database file `smeazy.db` is created in the current directory. It persists across restarts.

### 4 — Install and run the frontend

```cmd
cd frontend
npm install
npm run dev
```

Open **http://localhost:3000** in your browser.

---

## First-time setup (onboarding)

1. Navigate to **http://localhost:3000/register**
2. Fill in username, email, and password
3. Choose **Enterprise** account type
4. Enter your business name (e.g. "CoTR Restaurant") and select **Hospitality** package
5. You will be redirected to the floor plan once registered

Default tables are seeded automatically (Main Hall T1–T8, Terrace P1–P4).

---

## Importing your product catalog

### Import the included CoTR seed file

In the Inventory page → click **Import CSV** → select `seeds/products_cotr.csv`

This imports **242 deduplicated products** across 9 categories from your previous POS export:

| Category | Products |
|----------|----------|
| CoTR Bar | 153 |
| CoTR Kitchen | 64 |
| Accomodation | 9 |
| Swimming Pool | 7 |
| Snack Bar | 3 |
| Room Sales | 3 |
| Others | 3 |

### Import your own WooCommerce export

The system accepts both formats:

**WooCommerce export format** (direct from OpenPOS "Export Products"):
```
ID, Name, Categories, Regular price, Cost, Stock, Low stock amount, Tags, Images, ...
```

**SMEazy normalized format**:
```
name, category, sku, sale_price, cost_price, stock_qty, reorder_level, image_url, tags, legacy_id
```

Categories are **auto-created** during import if they don't already exist.

### Export current inventory

Inventory page → **Export CSV** → downloads `smeazy_inventory.csv` in the normalized format.

---

## API endpoints reference

All endpoints (except `/auth/register` and `/auth/login`) require:
```
Authorization: Bearer <jwt_token>
```

### Auth (`/auth/`)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/register` | Register new user (personal or enterprise) |
| POST | `/auth/login` | Login, returns JWT |
| GET | `/auth/me` | Current user context |
| POST | `/auth/onboard/business` | Complete business onboarding |
| GET | `/auth/staff` | List all staff for waitstaff assignment |

### Floor tables (`/tables/`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/tables` | List all tables with live occupancy status |
| POST | `/tables` | Create new table |
| PUT | `/tables/:id` | Update table metadata |
| DELETE | `/tables/:id` | Deactivate table |
| POST | `/tables/transfer` | Transfer order from one table to another |
| POST | `/tables/merge` | Merge two tables into one bill |

### POS orders (`/pos/`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/pos/orders` | List all open orders |
| POST | `/pos/orders` | Open a new order for a table |
| GET | `/pos/orders/:id` | Get order with items + payments |
| POST | `/pos/orders/:id/items` | Add item to order |
| DELETE | `/pos/orders/:id/items/:item_id` | Remove item from order |
| PUT | `/pos/items/:item_id/status` | Update item status (new/processing/dispatched) |
| POST | `/pos/orders/:id/kitchen` | Send new items to kitchen |
| POST | `/pos/orders/:id/checkout` | Process split payment & close order |
| POST | `/pos/orders/:id/void` | Void an open order |
| PUT | `/pos/orders/:id/waitstaff` | Reassign waitstaff on order |
| POST | `/pos/orders/:id/discount` | Apply cart-level discount |
| GET | `/pos/summary?date=YYYY-MM-DD` | Daily sales summary |

### Inventory (`/inventory/`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/inventory/categories` | List all product categories |
| POST | `/inventory/categories` | Create category |
| GET | `/inventory/items?category_id=` | List items (optionally filtered by category) |
| POST | `/inventory/items` | Create inventory item |
| PUT | `/inventory/items/:id` | Update item |
| POST | `/inventory/items/:id/adjust` | Adjust stock level (+ or -) |
| GET | `/inventory/alerts` | Items at or below reorder level |
| POST | `/inventory/import` | Import CSV (body = raw CSV text, Content-Type: text/csv) |
| GET | `/inventory/export` | Export inventory as CSV download |

### Kitchen (`/kitchen/`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/kitchen/orders` | List all active (non-completed) kitchen orders |
| POST | `/kitchen/orders/:id/ack` | Acknowledge order (starts cooking) |
| PUT | `/kitchen/items/:id/dispatch` | Mark item as dispatched |

### Analytics (`/analytics/`)

All analytics endpoints accept query params: `start_date`, `end_date`, `compare_period` (`previous_period` or `previous_year`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/analytics/revenue` | Revenue report with daily breakdown and totals |
| GET | `/analytics/products` | Product performance (items sold, net sales, orders) |
| GET | `/analytics/categories` | Category rollup performance |
| GET | `/analytics/revenue/export` | Download revenue CSV |

---

## Payment flow

V2 uses **manual payment confirmation only** — no external APIs, fully offline.

1. Waitstaff clicks **Pay** on an order
2. The checkout tab opens showing Total Due
3. Waitstaff creates payment lines:
   - Selects method: **Cash / M-Pesa / Card**
   - Enters amount (defaults to remaining balance)
   - Enters optional reference (M-Pesa code, card auth)
   - Clicks **Confirm Receipt** — locks that row
4. Repeat for split payments until **Remaining Balance = 0**
5. **Complete Order** button activates — click to finalize
6. Stock is automatically deducted from inventory
7. Table turns green (Available) on the floor plan

> **Change due**: Only Cash payment lines can produce change. M-Pesa and Card must be exact or less than remaining.

---

## Kitchen screen workflow

1. Waitstaff adds items to order (items start as `new`)
2. Clicks **Send to Kitchen** — sends only `new` items, creates a Kitchen Order
3. Items update to `processing`
4. Kitchen Display (http://localhost:3000/kitchen) shows the order
5. Kitchen staff clicks **Acknowledge** — order moves to `in_progress`
6. For each prepared item, click the dispatch (truck) icon → item becomes `dispatched`
7. Dispatched items show a green checkmark on the POS order screen
8. Adding new items to an already-sent order marks them `new` again — clicking Send to Kitchen sends another kitchen order
9. When the bill is paid, kitchen order is automatically marked `completed` and removed from the screen

---

## Item status flow

```
new → (Send to Kitchen) → processing → (Dispatch) → dispatched → (Checkout) → paid
```

Items can be dispatched individually at different times (e.g. drinks dispatched before food), while all remain on the open bill until checkout.

---

## Development workflow

### Rebuild after code changes

```cmd
:: Backend only
cargo build -p smeazy-api -j 1

:: Specific crate (faster)
cargo build -p smeazy-inventory -j 1
cargo build -p smeazy-pos -j 1
```

### Reset database (start fresh)

```cmd
:: Stop the server first, then:
del smeazy.db

:: Restart — migrations run automatically on fresh DB
.\target\release\smeazy-api.exe
```

### Add staff users

Currently create via the standard `/auth/register` endpoint with role `operational_staff`. They will appear in the waitstaff dropdown when opening tables.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `error: linker cc not found` on Windows | Install Visual Studio Build Tools: `winget install Microsoft.VisualStudio.2022.BuildTools` |
| `CORS error` in browser | Ensure Rust server is running on port 8000 before starting frontend |
| Products not showing in POS | Check inventory items have a `sale_price > 0` and `is_active = 1` |
| Kitchen orders not updating | The kitchen page polls every 8 seconds — wait or click the refresh button |
| `JWT_SECRET too short` warning | Use at least 32 characters in your `.env` file |
| Stock not deducting after sale | Item must be linked via `item_id` in the order (auto-set when adding from POS grid) |
| CSV import skipping rows | Check column names match either WooCommerce or normalized format exactly |

---

## V2 Changelog (from V1)

- ✅ **Offline-first SQLite** — zero infrastructure, single binary
- ✅ **Manual payment confirmation** — replaces M-Pesa Daraja API
- ✅ **Full POS UI** — category tabs, product grid with images, split-column layout
- ✅ **Floor plan screen** — color-coded tables, right-click context menu, transfer/merge
- ✅ **Kitchen display screen** — real-time order cards, per-item dispatch, urgency flags
- ✅ **Item status tracking** — new → processing → dispatched → paid per line item
- ✅ **Inventory ↔ POS linkage** — products from inventory displayed in POS; stock auto-deducted on sale
- ✅ **Product categories** — full CRUD, color-coded, used for POS tab navigation
- ✅ **CSV import/export** — WooCommerce format + normalized format, auto-creates categories
- ✅ **Analytics dashboard** — revenue/products/categories with charts, date ranges, comparison periods, CSV export
- ✅ **Onboarding preserved** — personal/enterprise/solopreneur flows unchanged from V1
