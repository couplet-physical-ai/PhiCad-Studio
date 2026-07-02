FROM oven/bun:1

WORKDIR /app

# Copy package files and install deps
COPY package.json bun.lock* ./
RUN bun install --production

# Copy source code and public assets
COPY src/ ./src/
COPY public/ ./public/
COPY tsconfig.json ./

# Create data directory
RUN mkdir -p /data

# Expose the server port
EXPOSE 3000

# Set environment defaults
ENV PORT=3000
ENV DATA_DIR=/data

# Run the server
CMD ["bun", "src/server.ts"]
