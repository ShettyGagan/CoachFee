# Deployment & Local Setup Guide

This guide provides step-by-step instructions for running the **Coaching Fee Management System** locally, deploying it to production environments, configuring required environment variables, and accessing the application using demo accounts.

---

## 1. Architecture & Tech Stack

- **Backend**: Python 3.10+, FastAPI, SQLAlchemy 2.0, PostgreSQL (Neon / local Postgres), Pydantic v2
- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, TanStack Query, Lucide Icons, Recharts
- **Authentication**: JWT in secure HTTP-only cookies (Staff password-based; Parent OTP via Firebase Phone Auth)
- **Payments**: Cashfree Payment Gateway integration with fallback built-in Mock Gateway for automated testing & demo evaluation
- **Background Tasks**: Automated daily reminder job scheduler (09:00 AM IST) and dropout risk detection

---

## 2. Step-by-Step Local Setup

### Prerequisites
- **Python**: version 3.10 or higher
- **Node.js**: version 18.x or higher and `npm`
- **PostgreSQL**: PostgreSQL 14+ instance (either local or cloud database such as [Neon](https://neon.tech))

---

### Step 1: Clone and Inspect Directory Structure

The project is structured as a monorepo with separate `backend` and `frontend` folders:
```text
ISOassignment/
├── backend/
│   ├── app/                 # FastAPI application (routers, services, models, rules)
│   ├── init_db.py           # Initializes DB schema, views, and seeds data
│   ├── create_views.py      # Standalone view creation utility
│   ├── seed.py              # Realistic demo seed data generator
│   ├── schema.sql           # Complete PostgreSQL DDL definitions
│   ├── requirements.txt     # Python production dependencies
│   ├── .env.example         # Template for backend environment variables
│   └── .gitignore
├── frontend/
│   ├── src/                 # React components, pages, hooks, layouts
│   ├── public/              # Static assets (logo, imagery)
│   ├── package.json         # Node scripts & dependencies
│   ├── vite.config.ts       # Vite bundler configuration
│   ├── .env.example         # Template for frontend environment variables
│   └── .gitignore
├── deployment.md            # This deployment documentation
└── .gitignore               # Root gitignore
```

---

### Step 2: Backend Setup & Execution

1. **Open a terminal and navigate to the backend directory**:
   ```bash
   cd backend
   ```

2. **Create and activate a Python virtual environment**:
   - On Windows (PowerShell):
     ```powershell
     python -m venv venv
     .\venv\Scripts\Activate.ps1
     ```
   - On macOS / Linux:
     ```bash
     python3 -m venv venv
     source venv/bin/activate
     ```

3. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

4. **Configure environment variables**:
   Create a `.env` file in the `backend/` directory by copying `.env.example`:
   ```bash
   cp .env.example .env
   ```
   *Edit `backend/.env` with your PostgreSQL database URL, JWT secret, and desired flags.*

5. **Initialize database schema, views, and seed data**:
   Run the all-in-one database initialization script:
   ```bash
   python init_db.py
   ```
   *This command connects to the database specified in `DATABASE_URL`, builds all tables, creates the `instalment_status` and `unmatched_payments` views, and seeds ~130 students across 4 centres with attendance records, test scores, instalments, and mock payments.*

6. **Start the FastAPI backend server**:
   ```bash
   uvicorn app.main:app --reload --port 8000
   ```
   - The backend API will be available at: `http://localhost:8000`
   - Interactive Swagger API docs: `http://localhost:8000/docs`
   - Health check endpoint: `http://localhost:8000/api/v1/health`

---

### Step 3: Frontend Setup & Execution

1. **Open a separate terminal and navigate to the frontend directory**:
   ```bash
   cd frontend
   ```

2. **Install Node dependencies**:
   ```bash
   npm install
   ```

3. **Configure environment variables**:
   Create a `.env` file in the `frontend/` directory by copying `.env.example`:
   ```bash
   cp .env.example .env
   ```
   *For local development with the Vite proxy, `VITE_API_BASE=/api/v1` and `VITE_DEMO_MODE=true` can be kept as default.*

4. **Start the frontend development server**:
   ```bash
   npm run dev
   ```
   - The React frontend application will launch at: `http://localhost:5173`
   - Open `http://localhost:5173` in your browser.

5. **Production Build Verification**:
   To test the production build locally:
   ```bash
   npm run build
   npm run preview
   ```

---

## 3. Production Deployment Guide

### Backend Deployment (e.g. Render, Railway, AWS, Fly.io)

1. **Environment Setup**:
   - Build pack: Python 3.10+
   - Build Command:
     ```bash
     pip install -r requirements.txt
     ```
   - Start Command:
     ```bash
     uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 4
     ```

2. **Database Migration / Initialization**:
   - Point `DATABASE_URL` to your production managed PostgreSQL database (e.g. Neon, AWS RDS).
   - In production, run `python init_db.py` once or execute `schema.sql` and `create_views.py` directly against the database before launching traffic.

3. **CORS & Domain Configuration**:
   - Set `CORS_ORIGINS` to your production frontend URL (e.g. `https://your-domain.com`).
   - Set `FRONTEND_URL` to `https://your-domain.com` for callback redirections.

---

### Frontend Deployment (e.g. Vercel, Netlify, Cloudflare Pages)

1. **Environment Setup**:
   - Framework preset: Vite
   - Root directory: `frontend`
   - Build Command: `npm run build`
   - Output Directory: `dist`

2. **SPA Routing Rule**:
   - Ensure Single Page Application (SPA) rewrite rules are configured so all unmatched paths resolve to `/index.html`:
     - **Vercel**: Handled automatically or via `vercel.json` rewrites.
     - **Netlify**: Ensure a `_redirects` file exists with `/* /index.html 200`.

3. **Backend Proxy / API Base**:
   - Set `VITE_API_BASE` to `https://your-backend-api.com/api/v1` (or use CDN edge proxying).

---

## 4. Environment Variables Reference

> **Note on Security**: Never commit actual `.env` files or secret keys to version control. Below is the list of required variable names.

### Backend (`backend/.env`)

| Variable Name | Required | Description |
|---|---|---|
| `DATABASE_URL` | **Yes** | PostgreSQL connection string (supports pooled connection strings). |
| `JWT_SECRET` | **Yes** | 32+ character random secret string used for signing session JWT tokens. |
| `CORS_ORIGINS` | **Yes** | Comma-separated list of allowed frontend origins (e.g. `http://localhost:5173,https://yourdomain.com`). |
| `FRONTEND_URL` | **Yes** | Public URL of the frontend application for redirection callbacks. |
| `DEMO_MODE` | No | `true` or `false`. Enables built-in mock payment gateway and OTP demo bypass. Defaults to `false` if omitted. |
| `FIREBASE_PROJECT_ID` | Optional | Firebase project ID for parent phone OTP verification. |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Optional | Firebase Admin SDK service account credentials JSON string for token verification. |
| `CASHFREE_APP_ID` | Optional | Cashfree Merchant App ID for live or sandbox payment gateway. |
| `CASHFREE_SECRET_KEY` | Optional | Cashfree Merchant Secret Key. |
| `CASHFREE_ENV` | Optional | `sandbox` or `production`. |

---

### Frontend (`frontend/.env`)

| Variable Name | Required | Description |
|---|---|---|
| `VITE_API_BASE` | **Yes** | Base API path prefix (e.g. `/api/v1` or full backend API URL). |
| `VITE_DEMO_MODE` | No | `true` or `false`. Shows pre-filled demo login buttons on the login screen. |
| `VITE_FIREBASE_API_KEY` | Optional | Firebase Web SDK API Key for phone authentication. |
| `VITE_FIREBASE_AUTH_DOMAIN` | Optional | Firebase authentication domain. |
| `VITE_FIREBASE_PROJECT_ID` | Optional | Firebase project identifier. |
| `VITE_FIREBASE_STORAGE_BUCKET`| Optional | Firebase storage bucket URL. |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Optional | Firebase cloud messaging sender ID. |
| `VITE_FIREBASE_APP_ID` | Optional | Firebase web application identifier. |

---

## 5. Demo Login Details for Reviewers

The system includes pre-seeded accounts covering all roles across the organization.

### A. Staff Portal Logins
*Click the **Staff** tab on `/login`:*

| Role | Email | Password | Access Scope & Permissions |
|---|---|---|---|
| **Admin** | `admin@coaching.in` | `admin123` | **Full Multi-Centre Access**: System setup, fee structures, financial dashboards across all centres, risk flags review, and manual reminder trigger. |
| **Accounts** | `accounts@coaching.in` | `accounts123` | **Centre-Scoped (Jaipur Centre 1)**: Record cash/bank payments, allocate unmatched payments, manage refunds, view student fee ledgers, and monitor fee collections. |
| **Counsellor** | `counsellor@coaching.in` | `counsellor123` | **Centre-Scoped (Jaipur Centre 1)**: Review explainable dropout risk intelligence flags, student attendance and test performance drops, and log call resolution notes. |

---

### B. Parent Portal Logins
*Click the **Parent (OTP)** tab on `/login`:*

| Student Name | Registered Parent | Mobile Number | Scenario / Ledger Status |
|---|---|---|---|
| **Aarav Meena** | Ramesh Meena | `9000000001` | First instalment fully paid (₹30,000 paid). Next instalments scheduled. |
| **Ishita Sharma** | Rakesh Sharma | `9000000002` | First instalment partially paid (₹15,000 paid, ₹15,000 remaining balance). |
| **Mohit Gurjar** | Suresh Gurjar | `9000000003` | Zero payments recorded. Overdue instalments and pending fee reminders. |

#### Parent Portal OTP Authentication Flow
1. Enter any of the registered mobile numbers above (e.g. `9000000001`).
2. In **Demo Mode** (`DEMO_MODE=true` / `VITE_DEMO_MODE=true`):
   - You can enter any 6-digit OTP code (e.g. `123456`) or use the one-click demo login accordion provided directly on the login page.
3. In **Production / Live Firebase Mode**:
   - An SMS OTP code will be sent to the phone number via Firebase Phone Authentication.

---

### C. Testing the Payment Gateway Flow

1. Log in to the **Parent Portal** using `9000000002` or `9000000003`.
2. Navigate to **Pay Fees** or click **Pay Now** on an unpaid instalment.
3. When using the built-in **Mock Gateway**:
   - You will be redirected to the secure gateway simulation page (`/pay/:token`).
   - You can simulate **Success**, **Bank Drop / Timeout**, or **Payment Failure**.
   - Upon clicking **Simulate Successful Payment**, a real-time GST tax invoice and receipt number (e.g. `RCPT-2026-000001`) is issued, the instalment balance is cleared, and all pending reminders for that instalment are immediately cancelled.
   - Staff logged into the dashboard will receive a real-time notification alert via the notification bell in the top navigation bar.

