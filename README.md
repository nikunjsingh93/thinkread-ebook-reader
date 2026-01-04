# <img src="web/public/logo.svg" alt="ThinkRead Logo" width="32" height="32"> ThinkRead

A dead‑simple self‑hosted EPUB library + reader:
- Upload multiple **EPUB** files from your device
- Browse them in a **shelf** view with **extracted book covers**
- Read in-browser with **themes + typography controls** (font, size, margins, line height, colors)
- **Upload and use custom fonts** (TTF, OTF, WOFF, WOFF2)
- Remembers your **last position** per book

## Screenshots

### Desktop

<img width="1470" height="832" alt="1" src="https://github.com/user-attachments/assets/01ed0ce6-da08-44d3-86a8-f853e05ad049" />

<img width="1468" height="832" alt="2" src="https://github.com/user-attachments/assets/b44866eb-6975-4c31-a0c9-b23cc50cb673" />

<img width="1470" height="833" alt="3" src="https://github.com/user-attachments/assets/096680e0-dee7-45de-9ca2-681317791f54" />

<img width="1470" height="823" alt="4" src="https://github.com/user-attachments/assets/d9db635c-eaa6-4f92-9bd9-e5968adb55e5" />

### Mobile

<img width="374" height="671" alt="5" src="https://github.com/user-attachments/assets/5211805c-90a5-4087-af03-62ac0db66b52" />

<img width="377" height="668" alt="6" src="https://github.com/user-attachments/assets/2bb4758a-28a7-4093-ad3a-ccb9f1728ad4" />

<img width="375" height="670" alt="7" src="https://github.com/user-attachments/assets/bf5f5086-c436-4dfb-802e-5658f51d19ea" />


## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Important Notes

- **Books**: This repository does not include any sample books. You must add your own EPUB files to the `data/books/` directory. Only include books you have the legal right to distribute.
- **Fonts**: Only open-source fonts are included. Custom fonts can be uploaded by users.
- **Dependencies**: All npm dependencies are open-source with permissive licenses.

## Deploy to Server

**Default User Credentials:**
- Username: `admin`
- Password: `admin`

### Docker Compose

```yaml
services:
  thinkread:
    image: nikunjsingh/thinkread-ebook-reader:latest
    ports:
      - "8080:8080"
    volumes:
      - ./data:/data # this is the data directory for the database and the files
    environment:
      - DATA_DIR=/data
    restart: unless-stopped
```

### Docker Run

```bash
docker run -d \
  --name thinkread \
  -p 8080:8080 \
  -v ./data:/data \
  -e DATA_DIR=/data \
  --restart unless-stopped \
  nikunjsingh/thinkread-ebook-reader:latest
```

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
