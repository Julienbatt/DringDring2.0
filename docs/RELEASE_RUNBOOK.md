# Release Runbook

## Objective
Safe, repeatable release process with fast validation and rollback.

## Inputs
- Target commit/tag
- Deployment environment URL (`FRONTEND_URL`, `BACKEND_URL`)
- Optional smoke credentials (`SMOKE_TEST_EMAIL`, `SMOKE_TEST_PASSWORD`)

## Deploy Procedure
1. Ensure CI is green on target commit.
2. Deploy backend.
3. Deploy frontend.
4. Run smoke:
   - `FRONTEND_URL=https://... BACKEND_URL=https://... scripts/post_deploy_smoke.sh`
5. Verify dashboards:
   - health endpoint returns `200`
   - home/login accessible
   - one authenticated route reachable

## Failure Handling
1. If smoke fails, rollback immediately to previous release.
2. Re-run smoke on rollback target.
3. Open incident task with:
   - failing step
   - user impact
   - fix owner
   - ETA

## Ownership
- Release owner: triggers deploy and validates smoke.
- Backend owner: validates API health and errors.
- Frontend owner: validates routing/session and key UI routes.
