# Contributing to DringDring

## Branching Strategy

```
main (production)           ← Protected. Deploys to dringdring.me
  │
  └── staging               ← Protected. Deploys to staging.dringdring.me
        │
        ├── feat/...        ← New features
        ├── fix/...         ← Bug fixes
        └── chore/...       ← Maintenance, config, CI
```

### Rules

1. **Never push directly to `main` or `staging`.** All changes go through Pull Requests.
2. **Never force push.** If you need to fix a commit, create a new one.
3. **All work happens on feature/fix branches** created from `staging`.
4. **PRs to `staging`** for testing. CI must pass before merge.
5. **PRs from `staging` to `main`** for production releases. Review required.

### Workflow

```bash
# 1. Start new work (always branch from staging)
git checkout staging
git pull origin staging
git checkout -b feat/my-feature

# 2. Work, commit often with clear messages
git add <files>
git commit -m "feat: add delivery notification"

# 3. Push and create PR to staging
git push -u origin feat/my-feature
# Create PR: feat/my-feature → staging

# 4. After CI passes and review, merge to staging
# Test on staging.dringdring.me

# 5. When ready for production, create PR: staging → main
```

### Branch Naming

| Prefix | Usage | Example |
|--------|-------|---------|
| `feat/` | New features | `feat/courier-tracking` |
| `fix/` | Bug fixes | `fix/billing-rounding` |
| `chore/` | Maintenance, CI, config | `chore/update-deps` |
| `docs/` | Documentation only | `docs/api-reference` |

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): short description

feat:     New feature
fix:      Bug fix
chore:    Maintenance (CI, deps, config)
docs:     Documentation
refactor: Code restructuring (no behavior change)
test:     Adding/updating tests
```

### Before You Push

- [ ] Code compiles without errors
- [ ] Existing tests pass (`pytest backend/tests`)
- [ ] No secrets or credentials in the code
- [ ] No `.env` files or `.log` files committed

### Database Migrations

- Migrations go in `backend/migrations/` with format `update_<description>_v<N>.sql`
- Always test migrations on staging before applying to production
- Migrations must be backwards-compatible (no dropping columns in use)

### Environments

| Branch | URL | Database |
|--------|-----|----------|
| `staging` | staging.dringdring.me | dringdring-staging (Supabase) |
| `main` | dringdring.me | dringdring-prod (Supabase) |
