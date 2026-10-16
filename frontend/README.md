# PopChat frontend

The React/Vite application is documented in the [root README](../README.md). In development, Vite serves the UI on port 5173 and proxies `/api` and `/socket.io` to the local backend. In production, Express serves `frontend/dist` and both paths use the same origin.
