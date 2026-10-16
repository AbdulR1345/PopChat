# Single-origin Render deployment

This is a preparation guide. No cloud resources are created by the repository changes.

## Render service

Create **one Web Service** from the intended GitHub repository, branch `main`, Node runtime, root directory **repository root** (leave Render's root-directory field empty). Set the build command to:

```text
npm ci --omit=dev --prefix backend && npm ci --include=dev --prefix frontend && npm run build --prefix frontend
```

Set the start command to `npm start --prefix backend` and health check path to `/health`. The root `.node-version` pins Node.js 24.21.0. Render supplies `PORT`; the backend listens on `0.0.0.0` using that value. The successful startup log is `db connected` followed by `server started`; startup also waits for existing User, Message, and ConversationPreference indexes. A missing build or database connection prevents listening. Do not set `VITE_SERVER_URL` in production.

Configure `NODE_ENV=production`, `MONGODB_URL`, `JWT_SECRET`, `FRONTEND_ORIGIN`, `CLOUD_NAME`, `API_KEY`, and `API_SECRET` as private Render environment variables. Use a long random JWT secret. `FRONTEND_ORIGIN` is the exact assigned `https://...onrender.com` origin, without a path or trailing slash. The service may need to be created before its URL is known: let its initial startup fail closed, set the assigned URL as `FRONTEND_ORIGIN`, and redeploy. Never substitute a wildcard, localhost, another service's URL, or an invented host. Keep preview services isolated with their own origin and data.

## Data and uploads

Create a **separate** Atlas database and a separate least-privilege database user for the public demo. Put its connection string only in `MONGODB_URL`. Verify existing User unique indexes, Message indexes (including message-id uniqueness and shared-media index), and ConversationPreference uniqueness in deployment logs or Atlas before admitting users. This code initializes them before listening; no schema or index definitions are changed here. Arrange backups and practice recovery appropriate to the data. Limit Atlas network access to known outbound sources where practical. If a stable Render outbound IP is unavailable, any broad Atlas allowlist entry materially increases exposure: use strong least-privilege credentials, monitor access, and prefer a controlled egress or network arrangement when available. Do not use existing personal or production data for the demo.

Use isolated Cloudinary credentials or an isolated media namespace for demo uploads. Backend names are `CLOUD_NAME`, `API_KEY`, and `API_SECRET`. Existing uploads are authenticated and limited to 5 MB JPEG, PNG, or WebP files with matching MIME and signature. Delivered `secure_url` image links are accessible to anyone who possesses them. Use synthetic accounts, non-sensitive images, and no personal conversations. Retain an inventory of demo uploads; remove both demo database records and associated Cloudinary assets when retiring the demo, after reviewing any retention needs.

## Release verification

1. Verify `GET /health` returns `{"status":"ok"}` after database and index readiness; a transient database disconnect returns 503.
2. Refresh `/`, `/login`, `/signup`, and `/profile`. Confirm static assets load and an unknown `/api` path returns JSON 404 rather than HTML.
3. In browser developer tools, confirm API and `/socket.io` requests use the same HTTPS origin and WebSocket upgrades use WSS. Check polling, upgrades, reconnection, login, session refresh, multi-tab logout, messaging, and media uploads.
4. Inspect `Set-Cookie`: `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, and no `Domain`. Confirm the cookie works over public HTTPS. Local HTTP cannot verify `Secure` behavior.
5. Check that mutation requests from another origin are rejected, the frontend console is clear, and Cloudinary images contain only safe demo content.

Render's free Web Service may sleep after inactivity, restart, or take roughly a minute to wake. This affects first request latency and can interrupt sockets; the client reconnects. The free plan is a demo or hobby choice, not an uptime guarantee. If a release fails, use Render's rollback to a previously healthy deployment, then verify `/health` and the browser flow. Avoid rolling back across incompatible database changes; none are added in this phase.

## Remaining security work

Signup and login have no distributed abuse limit. A process-local limiter would reset on restart and cannot reliably identify individual clients behind an unverified proxy header chain. Choose a trusted edge limit or shared store before treating the demo as resistant to credential stuffing. The existing GET logout route is retained for compatibility; use POST in new clients.

Logout clears the browser cookie and disconnects active sockets for that token. A copied JWT is still usable until its seven-day expiry; immediate server-side revocation would require additional approved state management.
