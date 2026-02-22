# --- Build the React web app ---
FROM node:20-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json* ./
RUN npm install
COPY web ./
# Copy PDF.js worker to public directory before building (in case it's not already there)
RUN mkdir -p public && cp node_modules/pdfjs-dist/build/pdf.worker.min.mjs public/pdf.worker.min.mjs || true
RUN npm run build

# --- Runtime server (serves API + static web build) ---
FROM node:20-slim
WORKDIR /app

# Install Calibre for MOBI to EPUB conversion, pico2wave for TTS, sox for audio speed adjustment,
# and canvas dependencies for PDF thumbnail extraction
# Enable non-free repository for libttspico-utils (pico2wave)
RUN echo "deb http://deb.debian.org/debian bookworm main non-free" >> /etc/apt/sources.list && \
    echo "deb http://deb.debian.org/debian bookworm-updates main non-free" >> /etc/apt/sources.list && \
    echo "deb http://security.debian.org/debian-security bookworm-security main non-free" >> /etc/apt/sources.list && \
    apt-get update && \
    apt-get install -y --no-install-recommends \
    calibre libttspico-utils sox poppler-utils unzip \
    build-essential \
    libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev \
    python3 && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
COPY server/package.json server/package-lock.json* ./
RUN npm install --omit=dev
COPY server ./
COPY --from=web /web/dist ./public
EXPOSE 8080
VOLUME ["/data"]
CMD ["node", "server.js"]
