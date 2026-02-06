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

### 1.1) GitHub + Vercel: how we log in and trigger deploys
**GitHub login (SSH)**
1) Generate a key:
   ```
   ssh-keygen -t ed25519 -C "you@example.com"
   ```
2) Add the key to the agent:
   ```
   eval "$(ssh-agent -s)"
   ssh-add ~/.ssh/id_ed25519
   ```
3) Add the public key to GitHub:
   - GitHub → Settings → SSH and GPG keys → New SSH key
   - Paste the contents of `~/.ssh/id_ed25519.pub`

**Vercel Git deploy (frontend)**
1) Vercel → Project → Settings → Git  
   - Repo connected: `Julienbatt/DringDring2.0`
2) Vercel → Settings → Build & Deployment  
   - **Root Directory** = `frontend`  
   - Framework = Next.js
3) Vercel → Settings → Environment Variables  
   - Make sure `NEXT_PUBLIC_*` are set for **Production**
4) Deploy on new commits
   - A push to `main` should auto-deploy.
   - If not: Deployments → Redeploy → **Clear cache**

If Vercel shows “vercel deploy” as the source, it’s a CLI deploy, not Git.  
Use Git-connected deploys so changes follow the repository.

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
- `FRONTEND_URL` (used for invite redirects, example: `https://staging.dringdring.me`)

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
Important recent ones: v41 - v49 (billing + views + basket value + invite fields + dispatch/cms updates).

## 5) Health checks
- Backend: `/api/v1/health`
- Frontend: `/login` (should render)

## 6) Environments (staging vs prod)
Best practice: separate projects for **staging** and **prod**:
- Supabase: two projects (distinct URL/keys/db)
- Render: two services (distinct `DATABASE_URL`, `SUPABASE_*`)
- Vercel: two projects or two env sets

## 7) Production checklist (copy from staging)
1) **Supabase (prod)**: create a new project
   - Collect: `Project URL`, `anon public key`, `service_role key`, `JWT secret`
   - Database URI: **Session Pooler** (port **6543**)
2) **Render (backend prod)**: create a new service
   - Set env:
     - `DATABASE_URL` = pooler **prod** URI
     - `SUPABASE_URL` = **prod**
     - `SUPABASE_SERVICE_KEY` = **prod**
     - `SUPABASE_JWT_SECRET` = **prod**
     - `FRONTEND_URL` = `https://dringdring.me`
     - `CORS_ORIGINS_STR` = `https://dringdring.me`
3) **Vercel (frontend prod)**: create a new project or prod env
   - Set env:
     - `NEXT_PUBLIC_SUPABASE_URL` = **prod**
     - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = **prod**
     - `NEXT_PUBLIC_API_URL` = `https://api.dringdring.me/api/v1`
4) **DNS (Infomaniak)**
   - `api.dringdring.me` → CNAME Render service
   - `dringdring.me` → Vercel A record (76.76.21.21)
5) **Render Custom Domain**
   - Add `api.dringdring.me`
   - Wait for **Certificate issued**
6) **Supabase Auth (prod)**
   - Site URL: `https://dringdring.me`
   - Redirect URLs: `https://dringdring.me/*`
7) **Smoke tests**
   - `https://api.dringdring.me/api/v1/health`
   - `https://dringdring.me/login`
