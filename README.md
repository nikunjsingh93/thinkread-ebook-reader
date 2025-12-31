# ThinkRead (React + Docker)

A dead‑simple self‑hosted EPUB library + reader (Kindle-ish):
- Upload multiple **EPUB** files from your device
- Browse them in a **shelf** view with **extracted book covers**
- Read in-browser with **themes + typography controls** (font, size, margins, line height, colors)
- Remembers your **last position** per book

## Development Mode (with Docker)

For development with hot-reload and watch mode:

```bash
docker compose -f docker-compose.dev.yml up --build
```

**Access:**
- Web UI: http://localhost:5173
- API Server: http://localhost:8080

## Production Build (Docker)

For production deployment:

```bash
docker compose up --build
```

**Access:**
- Application: http://localhost:8080

Uploaded books + app data are stored in `./data` (mapped to `/data` inside the container).

## Notes / Limitations

- **EPUB only** (no MOBI/KFX). EPUB is the most browser-friendly format.
- **EPUB covers are automatically extracted** and displayed in the shelf view.
