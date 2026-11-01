<p align="center">
  <img src="docs/banner.png" alt="Bite Rush banner" width="100%">
</p>

<p align="center">
  <b>A full-stack, production-deployed online food ordering platform — browse a live menu, build a cart,<br>
  checkout with server-validated pricing, and track your order in real time.</b>
</p>

<p align="center">
  <a href="https://bite-rush-frontend.onrender.com"><img src="https://img.shields.io/badge/Live_Demo-Open_App-E8A93B?style=for-the-badge&logo=googlechrome&logoColor=white" alt="Live Demo"></a>
  <a href="https://bite-rush-api.onrender.com/api/health"><img src="https://img.shields.io/website?url=https%3A%2F%2Fbite-rush-api.onrender.com%2Fapi%2Fhealth&style=for-the-badge&label=API&up_message=online&down_message=sleeping&logo=render&logoColor=white" alt="API Status"></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=node.js&logoColor=white">
  <img src="https://img.shields.io/badge/Express.js-000000?style=flat-square&logo=express&logoColor=white">
  <img src="https://img.shields.io/badge/MongoDB-47A248?style=flat-square&logo=mongodb&logoColor=white">
  <img src="https://img.shields.io/badge/Bootstrap_5-7952B3?style=flat-square&logo=bootstrap&logoColor=white">
  <img src="https://img.shields.io/badge/JWT-000000?style=flat-square&logo=jsonwebtokens&logoColor=white">
  <img src="https://img.shields.io/badge/Render-00000F?style=flat-square&logo=render&logoColor=white">
</p>

<br>

<p align="center">
  <img src="docs/screenshots/home.png" alt="Bite Rush home page" width="100%">
</p>

<p align="center"><sub>Screenshots use demo orders and fictional customers.</sub></p>

> Note: hosted on Render's free tier — the backend may take 30–50 seconds to "wake up" if it hasn't been used recently.

---

## 📑 Contents

[Why I built it](#-why-i-built-it) · [Highlights](#-highlights) · [Screenshots](#-screenshots) · [Architecture](#️-architecture) · [Data Model](#-data-model) · [Security](#️-security) · [Tech Stack](#️-tech-stack) · [Project Structure](#-project-structure) · [Getting Started](#-getting-started-local-development) · [API Reference](#-api-reference) · [Roadmap](#️-roadmap)

---

## 💡 Why I built it

Every food-ordering project I'd seen followed the same shape: a menu, a cart, an order. I wanted to build something that actually felt like it could run a real outlet — not just a CRUD demo with a cart bolted on.

So Bite Rush became an exercise in building things **the way a production app would need them**, even for a solo college project: prices are recalculated and validated on the server at checkout, not trusted from the browser; every destructive or privileged action checks ownership and role server-side, not just hidden in the UI; and the database schema is normalized so a menu price change can never silently rewrite the total of an order someone already paid for.

**I kept iterating on it long after the "minimum" feature set was done** — adding item customization, combo bundles, order cancellation — because the goal was never to finish a checklist, it was to build something that behaves correctly under real use.

---

## ✨ Highlights

| 🛒 Full ordering flow<br>Category-filtered **live menu**, a persistent **cart** (localStorage, survives refresh), **quantity steppers** right on the menu card, and a full **checkout** flow with order confirmation. | 🌶️ Per-dish customization<br>Items can be marked with a **spice level picker** (Mild / Medium / Hot) in a detail modal — opt-in per dish, validated server-side so only dishes that support it can carry a spice choice into an order. |
| --- | --- |
| 🍱 **Combo meals**<br>Admin-built bundles of existing menu items at a discounted price, with the **savings auto-computed** from the live prices of the items inside — never a stale, hand-typed number. | 📦 **Order lifecycle**<br>Received → Preparing → Ready → Delivered, with a live **status tracker**. Customers can **cancel** their own order while it's still queued, and **reorder** a past order in one click. |
| 🔐 **Server-validated pricing**<br>Every order total is recalculated from the database at checkout — the price a client sends is never trusted, closing the most common e-commerce tampering vector. | 🛡️ **Role-based admin dashboard**<br>A separate, protected dashboard for menu CRUD, live incoming orders (auto-refreshing), and combo management — completely inaccessible to non-admin accounts, enforced on the API itself. |
| 🪑 **Table booking with deposits**<br>Day-ahead reservations (5 slots, 10 tables, a separate online-only table pool). A seat is **held for 2 minutes** while the customer pays a ₹100 deposit via **Razorpay (test mode)**; double-booking is prevented at the **database level** with partial unique indexes, and a **tiered refund** (100% / 50% / 0%) applies on cancellation. | 🗓️ **Admin reservations grid**<br>Table × time-slot view for any date, with customer details, **Seated / No-show** check-in, restaurant-side **cancel with a full refund**, a retry button for failed refunds, and per-table **online / walk-in** switches. |
| 🖼️ **Self-hosted images**<br>Dish photos live in the project's own `images/` folder, not hot-linked from a third party — so the menu never breaks if an external image host changes or removes a file. | ✅ **Defensive input validation**<br>Every write endpoint runs through `express-validator` server-side — registration, login, menu changes, and order placement all reject malformed input before it ever reaches the database. |

---

## 📸 Screenshots

| Menu — search, sort, categories, prep time, spice & veg markers | Combo meals — "Save ₹X" computed from live prices |
|---|---|
| ![Menu page](docs/screenshots/menu.png) | ![Combo meals](docs/screenshots/combo-meals.png) |

| Cart — regular items, a combo and a spice level | Order history — live status tracker and one-click reorder |
|---|---|
| ![Cart with combo](docs/screenshots/cart.png) | ![Order tracking](docs/screenshots/order-tracking.png) |

| Admin — live incoming orders (auto-refresh every 30s) | Admin — menu management |
|---|---|
| ![Admin orders](docs/screenshots/admin-orders.png) | ![Admin menu management](docs/screenshots/admin-menu.png) |

<p align="center"><b>Mobile</b> — the same flow on a phone: home, menu, cart and order tracking</p>
<p align="center"><img src="docs/screenshots/mobile.png" alt="Bite Rush on mobile" width="100%"></p>

---

## 🏗️ Architecture

Bite Rush follows a clean, fully decoupled 3-tier architecture — a static frontend, a stateless REST API, and a managed cloud database — talking entirely over JSON + JWT.

<p align="center">
  <img src="docs/diagrams/architecture.png" alt="Architecture diagram" width="90%">
</p>

```
frontend/            → Static HTML/CSS/JS client (Render Static Site)
  ├── index.html, menu.html, outlets.html, order.html, admin.html, login.html, register.html
  ├── css/style.css   → Design tokens, hero/menu/admin/auth styling
  └── js/             → One concern per file (cart, auth, menu, order, admin, combo-aware checkout)

backend/
  ├── config/         → Database connection
  ├── models/         → Mongoose schemas (User, Category, MenuItem, Combo, Order, OrderItem)
  ├── controllers/     → Business logic per module
  ├── routes/          → Express route definitions
  ├── middleware/       → JWT auth, role-based access control, validation error handling
  ├── validators/       → express-validator rule sets per module
  └── server.js         → App entry point
```

### Data Model

<p align="center">
  <img src="docs/diagrams/er_diagram.png" alt="Entity-relationship diagram" width="85%">
</p>

- **User** → places many **Orders**
- **Order** → contains many **OrderItems**
- **OrderItem** → refers to **either** a `MenuItem` **or** a `Combo` (never both), and snapshots `unit_price` + an optional `spice_level` at the moment of purchase — so a later menu price change, or deleting a combo, can never alter a historical order's total
- **MenuItem** → belongs to a **Category**, optionally flagged `has_spice_level`
- **Combo** → bundles multiple **MenuItems**; its "you save ₹X" badge is computed live from their current prices, never hand-entered

---

## 🛡️ Security

| Layer | What it does |
|---|---|
| **Password hashing** | bcrypt, salted — plaintext passwords are never stored, ever. |
| **JWT auth** | Stateless `Authorization: Bearer` tokens carrying user id + role; verified server-side on every protected route via middleware. |
| **Role-based access control** | `adminOnly` middleware rejects non-admin tokens on every admin route — menu CRUD, order status updates, combo management — at the API layer, not just hidden UI. |
| **Ownership checks** | Cancelling an order verifies the order belongs to the requesting user server-side — a customer can't cancel (or even see) someone else's order by guessing an id. |
| **Server-side price validation** | Checkout recalculates every line item's price from the current database record; a tampered client-side price is simply ignored. |
| **Input validation** | `express-validator` rule sets on every write endpoint (auth, menu, orders, combos) reject malformed or out-of-range input before it reaches a controller. |
| **Payment integrity** | The deposit amount is decided server-side; checkout signatures (HMAC) and Razorpay webhooks (raw-body signature, event-id de-duplication) are verified with constant-time comparison, and one code path confirms every payment so the two can never disagree. A refund is claimed atomically, so it can never be issued twice. |
| **Secrets management** | `JWT_SECRET` and `MONGO_URI` live only in environment variables (`.env`, Render env vars) — never committed; `.env` is git-ignored from day one. |

---

## 🛠️ Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | HTML5, CSS3, Vanilla JavaScript, Bootstrap 5 | No framework overhead for a project this size — every line is mine to explain, and Bootstrap's grid/components keep the UI consistent without hand-rolling layout CSS. |
| Backend | Node.js, Express.js | A minimal, unopinionated REST framework — lets the whole stack (frontend + backend) stay in one language, JavaScript. |
| Database | MongoDB Atlas (Mongoose ODM) | Document model fits a menu/order system whose schema kept evolving (spice levels, combos, prep time) without needing a migration every time. |
| Auth | JWT + bcrypt.js | Stateless sessions that scale horizontally with no server-side session store; bcrypt is the industry-standard slow hash for passwords. |
| Validation | express-validator | Declarative, centralized validation rules instead of scattered manual `if` checks in every controller. |
| Deployment | Render (Web Service + Static Site) | Free tier, automatic redeploys on every push to `main`, zero server management. |
| Tooling | Git, GitHub, Postman | Version control and manual API testing throughout development. |

---

## 📁 Project Structure

```
bite-rush/
├── backend/
│   ├── config/db.js
│   ├── controllers/      # authController, categoryController, menuController, orderController, comboController
│   ├── models/            # User, Category, MenuItem, Combo, Order, OrderItem
│   ├── routes/             # authRoutes, categoryRoutes, menuRoutes, orderRoutes, comboRoutes
│   ├── middleware/          # authMiddleware (protect, adminOnly), validate (handleValidationErrors)
│   ├── validators/           # authValidators, menuValidators, orderValidators, comboValidators
│   └── server.js
├── frontend/
│   ├── index.html, menu.html, outlets.html, order.html
│   ├── admin.html, login.html, register.html
│   ├── images/menu/            # self-hosted dish photos
│   ├── css/style.css
│   └── js/
│       ├── config.js, auth.js, cart.js, toast.js, validation.js
│       ├── menu.js, homepage.js, outlets.js, outlet-data.js, order.js
│       └── admin.js
└── docs/                        # README images (banner, screenshots, diagrams)
```

---

## 🚀 Getting Started (Local Development)

### Prerequisites

- Node.js (v18+)
- A free [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) cluster

### 1. Clone the repo

```bash
git clone https://github.com/Ajitabhjha13/bite-rush.git
cd bite-rush
```

### 2. Set up the backend

```bash
cd backend
npm install
```

Create a `.env` file in `backend/` (see `.env.example`):

```
PORT=5000
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_long_random_secret
# Table booking payments (Razorpay TEST keys only) — see .env.example
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxx
RAZORPAY_KEY_SECRET=your_razorpay_test_key_secret
RAZORPAY_WEBHOOK_SECRET=another_long_random_string
```

Create the 10 tables once, then run the automated tests any time:

```bash
node seedTables.js
npm test
```

Run the server:

```bash
npm run dev
```

### 3. Run the frontend

Open `frontend/index.html` directly in your browser, or serve the `frontend/` folder with any static file server (e.g. VS Code's Live Server).

---

## 📡 API Reference

| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/api/auth/register` | Public | Register a new user |
| POST | `/api/auth/login` | Public | Log in, receive a JWT |
| GET | `/api/categories` | Public | List all categories |
| GET | `/api/menu` | Public | List all available menu items |
| GET | `/api/menu/category/:id` | Public | Filter menu items by category |
| GET | `/api/combos` | Public | List all available combo meals (with live savings) |
| POST | `/api/orders` | Customer | Place a new order (items and/or combos) |
| GET | `/api/orders/my` | Customer | Get logged-in user's order history |
| PUT | `/api/orders/:id/cancel` | Customer | Cancel your own order (only while status = Received) |
| GET | `/api/menu/admin/all` | Admin | List all menu items (incl. unavailable) |
| POST / PUT / DELETE | `/api/menu/admin/...` | Admin | Menu item CRUD |
| POST / PUT / DELETE | `/api/combos/admin/...` | Admin | Combo CRUD |
| GET | `/api/bookings/policy` · `/api/bookings/availability?date=` | Public | Booking rules; free tables per slot |
| POST | `/api/bookings/hold` | Customer | Hold a table for 2 minutes and create a Razorpay order |
| POST | `/api/bookings/:id/confirm` | Customer | Confirm after payment (signature verified) |
| GET | `/api/bookings/my` | Customer | My bookings |
| PUT | `/api/bookings/:id/cancel` | Customer | Cancel; refund by how close the slot is |
| POST | `/api/payments/webhook` | Razorpay | Signed webhook (payment captured) |
| GET | `/api/bookings/admin/grid?date=` | Admin | Table × slot grid with summary |
| PUT | `/api/bookings/admin/:id/attendance` · `/cancel` · `/retry-refund` | Admin | Seated / no-show; cancel with full refund; retry a failed refund |
| PUT | `/api/tables/:id` | Admin | Switch a table online / walk-in or in / out of service |
| GET | `/api/orders/admin/all` | Admin | View all orders |
| PUT | `/api/orders/admin/:id/status` | Admin | Update an order's status |

All protected routes require an `Authorization: Bearer <token>` header.

---

## 🗺️ Roadmap

- [x] Core ordering flow — menu, cart, checkout, order tracking
- [x] JWT auth with role-based admin dashboard
- [x] Server-side price validation at checkout
- [x] Item detail modal with spice-level customization
- [x] Combo meals with auto-computed savings
- [x] Order cancellation
- [x] Self-hosted dish images
- [ ] Pagination on admin orders/menu tables
- [x] Automated tests (Jest + Supertest + in-memory MongoDB, 92 tests)
- [x] Table booking with Razorpay deposit (test mode), tiered refunds and an admin reservations grid
- [ ] Real-time order notifications via WebSockets
- [ ] React Native mobile app using the existing REST API

---

## 📄 License

This project was built as an academic project for the B.Tech CSE curriculum at Parul University.

---

<p align="center">
<b>Built by <a href="https://github.com/Ajitabhjha13">Ajitabh Kumar Jha</a></b><br>
CSE · Parul University · Vadodara, Gujarat
</p>

<p align="center">
  <a href="https://github.com/Ajitabhjha13"><img src="https://img.shields.io/badge/GitHub-Ajitabhjha13-181717?style=flat-square&logo=github&logoColor=white"></a>
</p>
