# CoachFee · Coaching Fee Management System

A full-stack fee management, student ledger, and automated billing portal designed for coaching institutes. Built with **FastAPI**, **PostgreSQL**, **React**, and **TypeScript**.

---

## Features

- **Multi-Role Staff Portal**: Dedicated dashboards for Admin, Accounts, and Academic Counsellors.
- **Parent Portal**: View fee schedules, download GST tax receipts, track attendance, and pay online.
- **Automated Fee Ledgers**: FIFO instalment allocation, remainder paise absorption, and overdue tracking.
- **Statutory Compliance**: Indian GST tax invoices (9% CGST + 9% SGST) and DPDP statutory refund formulas.
- **Online Payment Gateway**: Integrated Cashfree PG and built-in mock payment gateway for testing.

---

## Tech Stack

| Layer | Technologies |
| :--- | :--- |
| **Backend** | Python 3.10+, FastAPI, SQLAlchemy, Uvicorn, Pydantic |
| **Database** | PostgreSQL (Local, Docker, or Neon) |
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS, TanStack Query |

---

## Prerequisites

Ensure you have the following installed locally:
- **Python 3.10+** ([python.org](https://www.python.org/))
- **Node.js 18+** & **npm** ([nodejs.org](https://nodejs.org/))
- **PostgreSQL** (running locally or a free cloud database like [Neon](https://neon.tech))

---

## Local Setup Guide

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/your-repo-name.git
cd your-repo-name
```

---

### 2. Backend Setup

1. **Navigate to the backend directory:**
   ```bash
   cd backend
   ```

2. **Create and activate a virtual environment:**
   - **Windows:**
     ```powershell
     python -m venv venv
     .\venv\Scripts\activate
     ```
   - **macOS / Linux:**
     ```bash
     python3 -m venv venv
     source venv/bin/activate
     ```

3. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

4. **Set up the environment file:**
   Copy the example environment file:
   ```bash
   cp .env.example .env
   ```
   Open `.env` in your editor and update the following settings:
   ```env
   # PostgreSQL database connection URL
   DATABASE_URL=postgresql://user:password@localhost:5432/coaching_fees

   # 64-character secret key for JWT session tokens
   # You can generate one with: python -c "import secrets; print(secrets.token_hex(32))"
   JWT_SECRET=your_generated_secret_key_here

   # Allowed frontend origins for CORS
   CORS_ORIGINS=http://localhost:5173,http://localhost:3000

   # Set to true for local testing (enables mock payment gateway)
   DEMO_MODE=true
   FRONTEND_URL=http://localhost:5173
   ```

5. **Initialize database schema and seed demo data:**
   ```bash
   python init_db.py
   ```
   *This creates all database tables, views, and seeds demo students, batches, centres, and fee instalments.*

6. **Start the FastAPI backend server:**
   ```bash
   uvicorn app.main:app --reload --port 8000
   ```
   The backend API will be running at `http://localhost:8000`.  
   Interactive Swagger documentation is available at `http://localhost:8000/docs`.

---

### 3. Frontend Setup

1. **Open a new terminal and navigate to the frontend directory:**
   ```bash
   cd frontend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up the environment file:**
   Copy the example environment file:
   ```bash
   cp .env.example .env
   ```
   Open `.env` and verify the settings:
   ```env
   VITE_API_BASE=/api/v1
   VITE_DEMO_MODE=true
   ```

4. **Start the development server:**
   ```bash
   npm run dev
   ```
   The frontend application will be running at `http://localhost:5173`.

---

## Project Structure

```text
├── backend/
│   ├── app/
│   │   ├── routers/       # API route controllers (auth, payments, parent, risk, etc.)
│   │   ├── services/      # Business logic, fee calculations, and reminders
│   │   ├── models.py      # SQLAlchemy database models
│   │   ├── schemas.py     # Pydantic request and response schemas
│   │   └── main.py        # FastAPI application entrypoint
│   ├── schema.sql         # Base PostgreSQL DDL and views
│   ├── init_db.py         # Database initialization script
│   ├── seed.py            # Demo data generator
│   └── requirements.txt   # Python package dependencies
│
└── frontend/
    ├── src/
    │   ├── components/    # Reusable UI components (ReceiptSheet, dialogs, etc.)
    │   ├── layouts/       # StaffLayout, ParentLayout
    │   ├── pages/         # Login, Staff Dashboard, Payments, Parent Portal, Legal
    │   └── lib/           # API client, auth utilities, currency formatters
    ├── package.json       # Node.js dependencies and scripts
    └── vite.config.ts     # Vite configuration and backend proxy
```

---

## Useful Commands

- **Build Frontend for Production:**
  ```bash
  npm --prefix frontend run build
  ```
- **Re-seed Database:**
  ```bash
  cd backend && python init_db.py
  ```

---

## License

This project is licensed under the MIT License.

