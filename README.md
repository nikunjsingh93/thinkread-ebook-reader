# Simple E‑Book Reader (React + Docker)

A dead‑simple self‑hosted EPUB library + reader (Kindle-ish):
- Upload multiple **EPUB** files from your device
- Browse them in a **shelf** view
- Read in-browser with **themes + typography controls** (font, size, margins, line height, colors)
- Remembers your **last position** per book

## Quick start (Docker)

1) Install Docker Desktop (or Docker Engine)  
2) From this folder:

```bash
docker compose up --build
```

3) Open:
- http://localhost:8080

Uploaded books + app data are stored in `./data` (mapped to `/data` inside the container).

## Notes / limitations (kept intentionally simple)
- **EPUB only** (no MOBI/KFX). EPUB is the most browser-friendly format.
- Covers are placeholders generated from the filename (easy to upgrade later).

## Dev (optional, without Docker)

In two terminals:

```bash
cd server
npm install
npm run dev
```

```bash
cd web
npm install
npm run dev
```

Then open the Vite URL and the API will be at `http://localhost:5174`.
