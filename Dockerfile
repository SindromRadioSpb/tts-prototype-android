# -------------------------------------------------------
# LinguistPro — production Docker image
# Node 22 LTS Alpine · persistent server state in /app/data
# -------------------------------------------------------
FROM node:22-alpine AS deps

WORKDIR /app

# Build tools required to compile native sqlite3 binding via node-gyp.
# Keep the native source-build fallback available when a prebuilt binary
# cannot be downloaded. sqlite3 6 uses the maintained node-gyp 12 toolchain.
RUN apk add --no-cache python3 py3-setuptools make g++ gcc

# Copy package manifests first for layer-cache efficiency
COPY package.json package-lock.json ./

# Install production dependencies (scripts needed for sqlite3 native build)
RUN npm ci --only=production

# -------------------------------------------------------
# Final image
# -------------------------------------------------------
FROM node:22-alpine

WORKDIR /app

# Runtime deps for sqlite3 native binding
RUN apk add --no-cache sqlite

# Copy production node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy application source (everything not in .dockerignore)
COPY . .

# Persistent data directory — mount a named volume here
# storage.js auto-creates sub-dirs (audio-cache, gemini-cache, backups, research)
VOLUME ["/app/data"]

# Override DATA_DIR so all sub-paths resolve correctly inside container
ENV DATA_DIR=/app/data \
    NODE_ENV=production \
    PORT=3000

EXPOSE 3000

CMD ["node", "server.js"]
