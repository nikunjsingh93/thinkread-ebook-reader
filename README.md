# <img src="web/public/logo.svg" alt="ThinkRead Logo" width="32" height="32"> ThinkRead

A dead‑simple self‑hosted EPUB library + reader:
- Upload multiple **EPUB** files from your device
- Browse them in a **shelf** view with **extracted book covers**
- Read in-browser with **themes + typography controls** (font, size, margins, line height, colors)
- **Upload and use custom fonts** (TTF, OTF, WOFF, WOFF2)
- Remembers your **last position** per book

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Important Notes

- **Books**: This repository does not include any sample books. You must add your own EPUB files to the `data/books/` directory. Only include books you have the legal right to distribute.
- **Fonts**: Only open-source fonts are included. Custom fonts can be uploaded by users.
- **Dependencies**: All npm dependencies are open-source with permissive licenses.

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
- **Custom fonts**: Upload TTF, OTF, WOFF, or WOFF2 files in the reader settings for personalized typography.
