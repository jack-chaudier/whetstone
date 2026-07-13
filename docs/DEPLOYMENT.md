# GPT Sites deployment

Tenzon uses the Sites Vinext runtime. `npm run build` creates a Cloudflare Worker-compatible entry point at `dist/server/index.js` and copies deployment metadata to `dist/.openai/hosting.json`.

## Files and ownership

- `.openai/hosting.json` stores the opaque Sites `project_id` and optional logical D1/R2 names only.
- `vite.config.ts`, `build/sites-vite-plugin.ts`, and `worker/index.ts` create the deployable runtime.
- `.dev.vars` is local-only, ignored, and read by the Vinext Worker runtime.
- Sites owns production environment values and their revisions.
- Tenzon currently uses browser `localStorage`, so there are no D1 migrations or R2 assets.

Never place API keys in Git, `.openai/hosting.json`, a remote URL, a deployment archive, or a command log.

## First deployment workflow

1. Install the locked dependency tree and validate the application.

   ```bash
   npm ci
   npm run lint
   npm run build
   npm test
   git diff --check
   ```

2. Create the Sites project once. Persist the returned opaque ID unchanged as `project_id` in `.openai/hosting.json`. Reuse it for every later deployment.

3. Configure these production runtime values in Sites and mark each one secret:

   ```text
   ANTHROPIC_API_KEY
   OPENAI_API_KEY
   XAI_API_KEY
   OAUTH_COOKIE_SECRET
   ```

   Sites production values are intentionally separate from local `.dev.vars`. Generate `OAUTH_COOKIE_SECRET` as a random value of at least 32 characters. It seals per-browser xAI OAuth tokens and never leaves the Worker.

4. Validate the exact source, commit it, and push the same branch head to the normal GitHub origin and the Sites source repository. Use Sites’ short-lived write credential only as a per-command authorization header; never persist it in Git configuration or a remote URL.

5. Package the exact committed build.

   ```bash
   archive="$(mktemp -t tenzon-sites.XXXXXX.tgz)"
   npm run sites:package -- "$archive"
   ```

   The archive must contain `dist/server/index.js` and `dist/.openai/hosting.json`.

6. Save one Sites version with the pushed branch-head SHA and that archive.

7. Deploy the saved version privately. Poll the deployment until it reports `succeeded` before treating the URL as ready.

8. Open the production URL and complete the live checks:

   - The home, onboarding, progress, Covenant, and workbench routes load.
   - `GET /api/coach/status` lists the three API-key providers and the Grok subscription connection.
   - Connect one Grok subscription and confirm a refresh preserves the connection.
   - **Check all connections** reports `Connected` for each configured connection.
   - Select each hosted coach and make one real workbench request.
   - Browser responses and client bundles contain no secret values.
   - Refreshing preserves the local browser project.

## Subsequent deployment

Reuse the existing `project_id`. Validate, commit, push the exact head, rebuild if the source changed, package, save one new version, and deploy it privately. Do not call site creation again.

## Secret rotation

Updating Sites environment values changes the environment revision, not the source commit. After rotating, removing, or adding a secret:

1. Update only the intended key in Sites; preserve all others.
2. Keep the value marked secret.
3. Save and deploy a version so the new environment revision takes effect.
4. Run **Check all connections** again.

Rotating `OAUTH_COOKIE_SECRET` deliberately invalidates every existing `xai_oauth` cookie. Users must connect their Grok subscriptions again after the new environment revision is deployed.

If one connection fails, its row reports a sanitized cause while the other checks still complete. The scripted coach remains available.

## Rollback and access

Every Sites deployment points to a saved version. To roll back source behavior, deploy the last known-good saved version under the current intended environment revision. Re-run all connection checks after the deployment.

The initial deployment is owner-only. Do not switch it to shared or public access until the model-spending endpoints have authentication, authorization, rate limiting, and a deliberate usage policy.
