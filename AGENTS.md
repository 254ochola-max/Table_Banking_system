# AGENTS.md

## Project Context

This is the Deborahs Table Banking application repository built with React, Vite, Tailwind CSS, and Supabase. Keep changes focused on the user's request and preserve existing project conventions.

## Architecture

- **Frontend**: React 18 SPA built with Vite and Tailwind CSS.
- **Backend / Database**: Supabase PostgreSQL database, Supabase Auth, Row Level Security (RLS) policies, and Supabase Storage.
- **Database Schema**: Managed in `supabase_schema.sql`.

## Key Files

- `src/`: Frontend application source.
- `src/api/supabaseClient.js`: Native Supabase client and data services.
- `src/api/client.js`: Primary API client exports.
- `supabase_schema.sql`: Complete Supabase PostgreSQL schema, RLS policies, and triggers.
- `vite.config.js`: Vite build configuration.

## Working Notes

- Use `npm run dev` for local development.
- Use `npm run build` to build for production.
- Run relevant checks from `package.json` before finishing code changes.
