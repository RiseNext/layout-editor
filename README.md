# Platform Real Estate Studio

A reusable property-layout editor and customer plot viewer. Each project owns an uploaded base drawing and independently stored vector overlays.

## Run locally

Requires Node.js 22.5 or newer.

1. Install dependencies with `npm install`.
2. Start the API in one terminal: `npm run api`.
3. Start Vite in another: `npm run dev -- --port 5174`.
4. Open `http://127.0.0.1:5174/admin` and set the first administrator password (12+ characters).

The API listens on `127.0.0.1:3001`; Vite proxies `/api` to it. The development server chooses an available Vite port if 5174 is also occupied.

## Project workflow

Create a project and upload a PNG, JPG, WEBP, or SVG plan. In the editor, draw irregular plot polygons, trace roads, place amenities and labels, edit normalized vector geometry, set plot properties and project status colors, and preview or publish. Changes autosave to the local API.

Published projects are available at `/project/<slug>` and `/embed/<slug>`. The editor's **Embed** action generates responsive iframe markup. Draft preview links require the administrator session.

## Local storage and security

SQLite data and uploaded assets are stored under `data/`; keep that directory private and back it up. The local API binds to loopback and is intended for development. Before public deployment, configure HTTPS, a production session secret, restricted first-admin bootstrap, backups, upload quotas, and production-grade access controls. The current API is a single-instance local foundation, not a multi-user hosted service.

## Build

Run `npm run build` for the production Next.js build. Run `npm run legacy:build` for the TypeScript-checked Vite build.

## Production deployment

The Next.js frontend can run on Vercel, with the Express API on Railway. The API uses SQLite and stores uploaded plans on disk, so it must run as a single Railway replica with a persistent volume.

1. Create a Railway service from this repository. Railway uses `railway.json` to start the API.
2. Attach a persistent volume to the service at `/data`.
3. Set the Railway variables `DATA_DIR=/data`, `NODE_ENV=production`, and `SESSION_SECRET` to a securely generated, stable random secret. Keep the volume attached so the database, uploaded plans, and generated session secret survive redeploys.
4. Generate a public domain for the Railway service and confirm its `/api/health` endpoint returns `{"status":"ok"}`.
5. Import this repository into Vercel as a Next.js project and set `API_ORIGIN` to the Railway origin (for example, `https://your-api.up.railway.app`, without a trailing slash). Vercel routes `/api/*` requests to this service.
6. Deploy the Vercel project, then immediately visit `/admin` and create the first administrator account.

The Railway service requires Node.js 22.5 or newer for `node:sqlite`. Do not run multiple API replicas with the SQLite database. Back up the persistent volume regularly.
