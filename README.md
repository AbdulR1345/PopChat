# PopChat

PopChat is a one-to-one realtime messaging application. It uses a React/Vite client and an Express, Socket.IO, and MongoDB backend. The project began from a purchased starter application and has since been substantially customized with messaging, account, privacy, and conversation features.

## Features

Cookie-based accounts; realtime text and image messages; online status and typing indicators; delivery and read receipts; reactions, replies, edit and delete; conversation previews, unread counts, pin, archive, and mute; profile customization and email privacy; shared media; multi-tab updates; responsive UI.

## Stack and architecture

React, Vite, Redux Toolkit, Axios, Node.js, Express 5, Socket.IO, MongoDB Atlas/Mongoose, and Cloudinary. One Node HTTP server handles `/api/*`, `/socket.io/*`, `/health`, and the built React files. Production browser requests stay on the Render service origin. JWTs stay in `HttpOnly` cookies.

## Local setup

Use Node.js 24.21.0 and npm. From this repository root:

```text
npm ci --prefix backend
npm ci --prefix frontend
```

Create `backend/.env` using [backend/.env.example](backend/.env.example) as a list of names, with your own development values. Never commit credentials. Start the backend with `npm run dev --prefix backend` and the frontend with `npm run dev --prefix frontend` in separate terminals. The backend defaults to port 5000; Vite defaults to 5173. If the backend uses another port, set `VITE_SERVER_URL` in `frontend/.env` to its local origin. This value configures only the Vite development proxy; production client code uses relative URLs.

## Production build and checks

```text
npm ci --omit=dev --prefix backend
npm ci --include=dev --prefix frontend
npm run build --prefix frontend
npm start --prefix backend
```

Run `node --test` inside each of `backend` and `frontend`. Run `npm run lint --prefix frontend` and `npm run build --prefix frontend` from the root. A production backend requires `NODE_ENV=production`, `MONGODB_URL`, `JWT_SECRET`, `FRONTEND_ORIGIN`, `CLOUD_NAME`, `API_KEY`, and `API_SECRET`. Render supplies `PORT`; local development defaults to 5000. `FRONTEND_ORIGIN` must be the exact HTTPS origin of the Render service, with no trailing slash.

## Security and limitations

The session cookie is `HttpOnly`; in production it is `Secure`, host-only, `SameSite=Lax`, and scoped to `/`. Mutation requests and Socket.IO browser origins are checked against `FRONTEND_ORIGIN`; socket identity comes from the verified cookie. Image uploads require authentication and check size, MIME type, and file signature. Cloudinary image delivery URLs are public to anyone who has the URL. The legacy GET logout endpoint remains for compatibility, but new clients should use POST.

This version has no distributed signup or login rate limit. The free Render plan sleeps after inactivity and may interrupt realtime connections; it is suitable for a demo rather than reliable production traffic. See [the Render deployment guide](docs/RENDER_DEPLOYMENT.md) for operational checks and database/media isolation.

Logout clears the browser cookie and disconnects sockets using that token. A copied JWT remains valid until its seven-day expiry because this version has no server-side token revocation store.

## Screenshots and links

- Screenshots: add approved screenshots before publication.
- Live demo: add the URL after deployment.
- GitHub: add the public repository URL after publication.

## Credits

PopChat includes a purchased starter application and its artwork. Later engineering work added the current messaging, profile, privacy, conversation, security, and deployment behavior. Preserve any seller or third-party attribution required by the purchase terms; the repository does not contain a project-wide license grant or an original seller notice. Dependency licenses remain with their respective packages.
