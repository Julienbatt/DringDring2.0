# Release Checklist

## Pre-release
- Verify `main` is green in CI (`backend-tests`, `frontend-quality`, `smoke-e2e`).
- Confirm database migrations are reviewed and rollback strategy is documented.
- Confirm environment variables are set for target environment.
- Confirm no unexpected files are staged (`git status` clean for tracked files).

## Release
- Tag release commit and deploy from tagged commit.
- Run post-deploy smoke script:
  - `scripts/post_deploy_smoke.sh`
- Check backend health endpoint and frontend login page.
- Validate one protected route manually with test account.

## Rollback
- If smoke fails, rollback to previous known-good release.
- Re-run smoke script after rollback.
- Capture incident summary (what failed, impact, mitigation, next fix).

## Post-release
- Check error dashboard (5xx rate, auth errors, PDF generation errors).
- Check latency p95 on critical endpoints (`/reports/*`, `/billing/*`, `/deliveries/*`).
- Close release with short note in changelog.
