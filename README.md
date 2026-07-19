# 🍔 Bite Rush — Online Food Ordering System

A full-stack, production-deployed online food ordering platform built with the MERN-style stack (MongoDB, Express.js, Node.js) and vanilla JavaScript + Bootstrap 5 on the frontend. Customers can browse a live menu, manage a cart, place orders, and track status in real time; restaurant admins get a dedicated dashboard to manage the menu and incoming orders.

**🔗 Live Demo:** [https://bite-rush-frontend.onrender.com](https://bite-rush-frontend.onrender.com)
**⚙️ Live API:** [https://bite-rush-api.onrender.com/api/health](https://bite-rush-api.onrender.com/api/health)

> Note: hosted on Render's free tier — the backend may take 30–50 seconds to "wake up" if it hasn't been used recently.

---

## ✨ Features

**Customer**
- Secure registration & login with JWT authentication and bcrypt password hashing
- Browse a dynamic, category-filtered menu (Starters, Main Course, Beverages, Desserts)
- Real-time cart with quantity controls, persisted across page refreshes (localStorage)
- One-click checkout with server-side price validation
- Order confirmation screen with a live status tracker (Received → Preparing → Ready → Delivered)
- Full order history

**Admin**
- Role-based dashboard, inaccessible to non-admin accounts
- Live incoming-orders table with inline status updates, auto-refreshing every 30 seconds
- Full menu CRUD (add / edit / delete items, toggle availability) via modal forms

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML5, CSS3, JavaScript (ES6+), Bootstrap 5 |
| Backend | Node.js, Express.js (REST API) |
| Database | MongoDB Atlas (Mongoose ODM) |
| Auth | JWT (JSON Web Tokens), bcrypt.js |
| Deployment | Render (Web Service + Static Site) |
| Tooling | Git, GitHub, Postman |

---

## 🏗️ Architecture

Bite Rush follows a clean 3-tier architecture with a fully decoupled frontend and backend, communicating over a REST API:

```
frontend/            → Static HTML/CSS/JS client (deployed as a Render Static Site)
backend/
  ├── config/         → Database connection
  ├── models/         → Mongoose schemas (User, Category, MenuItem, Order, OrderItem)
  ├── controllers/     → Business logic for each module
  ├── routes/          → Express route definitions
  ├── middleware/       → JWT auth & role-based access control
  └── server.js        → App entry point
```

### Data Model

- **User** → has many **Orders**
- **Order** → has many **OrderItems**
- **OrderItem** → references a **MenuItem** (with quantity & price captured at purchase time)
- **MenuItem** → belongs to a **Category**

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

Create a `.env` file in `backend/`:
```env
PORT=5000
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_secret_key
```

Run the server:
```bash
npm run dev
```

### 3. Run the frontend
Open `frontend/index.html` directly in your browser, or serve the `frontend/` folder with any static file server.

---

## 📡 API Reference

| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/api/auth/register` | Public | Register a new user |
| POST | `/api/auth/login` | Public | Log in, receive a JWT |
| GET | `/api/categories` | Public | List all categories |
| GET | `/api/menu` | Public | List all available menu items |
| GET | `/api/menu/category/:id` | Public | Filter menu items by category |
| POST | `/api/orders` | Customer | Place a new order |
| GET | `/api/orders/my` | Customer | Get logged-in user's order history |
| GET | `/api/menu/admin/all` | Admin | List all menu items (incl. unavailable) |
| POST / PUT / DELETE | `/api/menu/admin/...` | Admin | Menu item CRUD |
| GET | `/api/orders/admin/all` | Admin | View all orders |
| PUT | `/api/orders/admin/:id/status` | Admin | Update an order's status |

All protected routes require an `Authorization: Bearer <token>` header.

---

## 🗺️ Roadmap

- [ ] Payment gateway integration (Razorpay / Stripe)
- [ ] Real-time order notifications via WebSockets
- [ ] Multi-restaurant support
- [ ] React Native mobile app using the existing REST API

---

## 📄 License

This project was built as an academic project for the B.Tech CSE curriculum at Parul University.

---

**Built by [Ajitabh Kumar Jha](https://github.com/Ajitabhjha13)**
