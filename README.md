# The Deborahs Table Banking System

A modern, cloud-native table banking and financial group management platform powered by **React 18**, **Vite**, **Tailwind CSS**, and **Supabase (PostgreSQL & Auth)**.

---

## Features

- **Member Management**: Registration, multi-role access (Admin, Chairperson, Treasurer, Secretary, Member), profile verification, and document auditing.
- **Contributions & Savings**: Track monthly member contributions, targets, receipts, and summaries.
- **Loan Management**: System loan terms (compounded monthly interest, maximum multiplier of savings, eligibility validations, overdue rules, multi-leader approval workflow).
- **Loan Reminders**: Automated email notices for upcoming and overdue loan installments.
- **Repayments & Statements**: Installment tracking, payment evidence submission (M-Pesa, Bank Transfer, Cash), and balance reconciliations.
- **Fines & Penalties**: Fine issuance, late contribution penalties, and instant clearance on settlement.
- **Reports & Analytics**: Full financial ledger, monthly summary tables, cash flow charts, and PDF/Excel reports.

---

## Tech Stack

- **Frontend**: React 18, Vite, Tailwind CSS, Radix UI, Lucide Icons, Moment.js, Recharts.
- **Backend / Database**: Supabase (PostgreSQL, Supabase Auth, Row Level Security policies, Supabase Storage).
- **Database Schema**: All table schemas, functions, and RLS policies are in `supabase_schema.sql`.

---

## Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Supabase
Your Supabase credentials are configured in `src/api/supabaseClient.js`:
- `SUPABASE_URL`: Your Supabase Project URL.
- `SUPABASE_ANON_KEY`: Your Supabase Publishable / Anon key.

### 3. Run Locally
```bash
npm run dev
```

### 4. Build for Production
```bash
npm run build
```
