# Deployment (Vercel + Render + Supabase)

This project is deployed as:
- Frontend (Next.js): Vercel
- Backend (FastAPI): Render (Docker)
- Database/Auth/Storage: Supabase

## 1) Frontend (Vercel)
Required env vars:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_API_URL` (example: `https://<render-backend>.onrender.com/api/v1`)

Notes:
- Any change to `NEXT_PUBLIC_API_URL` requires a Vercel redeploy.
- If a custom API domain is not ready (SSL pending), use the Render URL temporarily.

## 2) Backend (Render)
Recommended start command:
```
uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

Required env vars (minimum):
- `DATABASE_URL`
- `SUPABASE_JWT_SECRET`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`

Database connection:
- Prefer Supabase **Session Pooler** URI (IPv4, port **6543**) for Render and local tooling.
- Direct connection (`db.<project>.supabase.co:5432`) can fail on IPv6-only networks.

Optional but used in billing/PDF:
- `BILLING_CREDITOR_NAME`
- `BILLING_CREDITOR_IBAN`
- `BILLING_CREDITOR_ADDRESS`
- `BILLING_CREDITOR_STREET`
- `BILLING_CREDITOR_HOUSE_NUM`
- `BILLING_CREDITOR_POSTAL_CODE`
- `BILLING_CREDITOR_CITY`
- `BILLING_CREDITOR_COUNTRY`
- `BILLING_PAYMENT_MESSAGE`

Optional for routing:
- `OSRM_BASE_URL` (default uses public OSRM)

## 3) CORS
Update backend CORS to include the Vercel domain(s).
File: `backend/app/core/config.py` (`CORS_ORIGINS`).

## 4) Custom domains & SSL (staging/prod)
Render custom domain **must** be added on the backend service to get a valid SSL cert.

Example staging:
- DNS (Infomaniak): `api-staging.dringdring.me` → CNAME `dringdring2-0.onrender.com`
- Render → Settings → Custom Domains: add `api-staging.dringdring.me`
- Wait for **Certificate pending → Active**

Until SSL is active, the frontend must point to:
`https://dringdring2-0.onrender.com/api/v1`  
Otherwise the browser shows `ERR_SSL_VERSION_OR_CIPHER_MISMATCH` and login loops.

## 4) Migrations
Run migrations in order (see `backend/README.md`).
Important recent ones: v41 - v47 (billing + views + basket value).

## 5) Health checks
- Backend: `/api/v1/health`
- Frontend: `/login` (should render)

## 6) Environments (staging vs prod)
Best practice: separate projects for **staging** and **prod**:
- Supabase: two projects (distinct URL/keys/db)
- Render: two services (distinct `DATABASE_URL`, `SUPABASE_*`)
- Vercel: two projects or two env sets
