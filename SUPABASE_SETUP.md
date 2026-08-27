# The Deborah's — Final Supabase Edition

This package is the repaired React/Vite application with Supabase authentication and PostgreSQL database integration.

## 1. Install

From this folder:

```powershell
npm install
```

## 2. Add your Supabase key

Open:

```text
src/api/supabaseClient.js
```

Find:

```js
const SUPABASE_ANON_KEY = "PASTE_YOUR_SUPABASE_ANON_KEY_HERE";
```

Replace only the value with the **Supabase anon/public JWT key** from your Supabase project.

Example:

```js
const SUPABASE_ANON_KEY = "eyJ...";
```

The project URL is derived automatically from the JWT key.

**Never use a Supabase `service_role` or secret key in this React application.**

> If your Supabase dashboard only gives you an `sb_publishable_...` key, use the project's URL as well; that key format does not contain the project reference needed for automatic URL discovery.

## 3. Create the database

Open `supabase_schema.sql`.

In Supabase:

**SQL Editor → New query → paste the file → Run**

This creates:

- Supabase user profiles
- Automatic profile creation after registration
- Admin/user roles
- Members
- Contributions
- Loans
- Repayments
- Fines
- Transactions
- Group settings
- Group summary tables
- Row Level Security policies
- Required indexes

### Administrator bootstrap

The **first account registered after the SQL schema is installed becomes the administrator**.

Later registrations become regular users.

A regular user is sent to `/portal`; administrators can access the management dashboard.

To manually promote an account later:

```sql
update public.profiles
set role = 'admin'
where lower(email) = lower('your-email@example.com');
```

## 4. Start the application

```powershell
npm run dev
```

Then open the Vite URL shown in the terminal.

## Authentication included

- Email/password login
- Registration
- Supabase session persistence
- Logout
- Google OAuth
- Password reset
- Password recovery session handling
- Protected routes
- Admin/member role routing

## Important Supabase settings

For email confirmation and password reset, configure your Supabase project's **Authentication → URL Configuration**.

For local development, add:

```text
http://localhost:5173
```

as an allowed redirect URL.

For production, add your deployed website URL as well.

For Google login, enable Google under:

**Authentication → Providers → Google**

and enter the Google OAuth credentials requested by Supabase.

## Project root

`package.json` is in this directory. Do not run `npm run dev` from a parent folder.
