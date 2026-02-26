# Railway Deploy (Frontend + Backend Monolith)

This app is configured to run as one Railway service:
- Vite frontend is built to `dist`
- Express server serves `dist` and handles `/api/*` render endpoints

## Required Railway settings

1. Create one service from this repo.
2. Ensure deploy uses:
   - Build command: `npm run build`
   - Start command: `npm run start`
3. Optional but recommended: add a Volume and mount at `/data`.
4. Set environment variable:
   - `STORAGE_DIR=/data` (or omit to use ephemeral local disk)

## Notes

- Do **not** set `VITE_RENDER_API_URL` for monolith Railway hosting.
- App uploads and rendered files are served by the same service:
  - `POST /api/render`
  - `GET /output/:filename`
- Health check endpoint:
  - `GET /api/health`
