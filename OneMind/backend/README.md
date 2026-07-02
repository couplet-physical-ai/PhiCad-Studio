# OneMind Backend

Bun HTTP server serving the landing page, collecting user feedback, and providing an admin dashboard.

## Features

- **Landing Page** - Marketing site served at `/` with security headers and static asset caching
- **Feedback API** - Multipart form data with image/log file attachments
- **Web Admin Interface** - Password-protected feedback management UI at `/admin`
- **File-based storage** - No database required
- **Docker ready** - Single container serves everything (replaces separate nginx + backend setup)

## Routes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | No | Landing page |
| GET | `/*.png,jpg,...` | No | Static assets (7d cache) |
| GET | `/health` | No | Health check |
| POST | `/v1/feedback` | No | Submit feedback |
| GET | `/admin` | No | Admin UI |
| POST | `/admin/login` | No | Authenticate |
| POST | `/admin/logout` | No | End session |
| GET | `/admin/api/feedbacks` | Yes | List feedbacks (paginated) |
| GET | `/admin/api/feedbacks/:id` | Yes | Single feedback |
| GET | `/admin/files/:id/:filename` | Yes | Download attachment |

## Quick Start

```bash
bun install && bun dev    # Dev with watch
bun start                 # Production

# Docker
docker-compose up -d      # Exposes :80 (landing) and :3000 (direct)
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | Server port |
| `DATA_DIR` | /data | Storage directory |
| `ADMIN_PASSWORD` | admin123 | Admin password |
| `SESSION_SECRET` | (auto-generated) | Session cookie secret |

## Project Structure

```
backend/
├── public/
│   ├── index.html        # Landing page
│   └── icon.png          # Brand icon
├── src/
│   ├── server.ts         # HTTP server + routing
│   ├── storage.ts        # File storage utilities
│   └── types.ts          # TypeScript interfaces
├── data/feedback/         # Feedback storage (runtime)
├── Dockerfile
├── docker-compose.yml
└── package.json
```

## Security Headers

All responses include:
- `X-Frame-Options: SAMEORIGIN`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`

Static assets get `Cache-Control: public, max-age=604800, immutable`.
