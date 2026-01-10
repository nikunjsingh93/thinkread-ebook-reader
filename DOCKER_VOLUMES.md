# Docker Volumes Configuration

This document explains how to configure ThinkRead with separate volumes for better storage management.

## Volume Structure

ThinkRead stores different types of data that can be separated for optimal storage:

- **Data Volume**: Contains application state, covers, fonts, and dictionary
  - `state.json` - Application state (users, progress, bookmarks)
  - `covers/` - Extracted cover images
  - `fonts/` - Uploaded fonts
  - `dictionary.json` - Dictionary data

- **Books Volume**: Contains uploaded book files
  - `books/` - EPUB, PDF, and MOBI files

## Configuration Options

### Option 1: Single Volume (Default)
All data is stored in one location. This is the original configuration.

```yaml
services:
  thinkread:
    volumes:
      - /path/to/data:/data
    environment:
      - DATA_DIR=/data
```

### Option 2: Separate Volumes
Books and data are stored in different locations (recommended for large book collections).

```yaml
services:
  thinkread:
    volumes:
      # Data volume (internal storage) - smaller, frequently accessed
      - /internal/storage/data:/data
      # Books volume (external HDD) - larger, less frequently accessed
      - /external/hdd/books:/books
    environment:
      - DATA_DIR=/data
      - BOOKS_DIR=/books
```

## Deployment Examples

### For your server setup:
```yaml
services:
  thinkread:
    image: nikunjsingh/thinkread-ebook-reader:latest
    ports:
      - "8020:8080"
    volumes:
      # Internal storage for app data
      - /home/wvx/Documents/dockerApps/thinkread/data:/data
      # External HDD for books
      - /external/hdd/books:/books
    environment:
      - DATA_DIR=/data
      - BOOKS_DIR=/books
    restart: unless-stopped
```

## Migration from Single Volume

If you have an existing single volume setup and want to migrate to separate volumes:

1. **Stop the container**:
   ```bash
   docker-compose down
   ```

2. **Move book files** (if using separate volumes):
   ```bash
   mkdir -p /external/hdd/books
   mv /path/to/data/books/* /external/hdd/books/
   ```

3. **Update docker-compose.yml** to use separate volumes as shown above

4. **Start the container**:
   ```bash
   docker-compose up -d
   ```

## Benefits of Separate Volumes

- **Storage optimization**: Books can be stored on cheaper, larger external storage
- **Backup flexibility**: Different backup strategies for data vs. books
- **Performance**: Frequently accessed data (covers, state) on faster internal storage
- **Scalability**: Easy to expand book storage without affecting app data

## Backward Compatibility

The application maintains full backward compatibility. If `BOOKS_DIR` is not set, books are stored in the default location within `DATA_DIR`.