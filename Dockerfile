# -------------------------------------------------------
# LinguistPro — production Docker image
# Node 20 LTS Alpine · stateless, all state in /app/data
# -------------------------------------------------------
FROM node:20-alpine AS deps

WORKDIR /app

# Build tools required to compile native sqlite3 binding via node-gyp
RUN apk add --no-cache python3 make g++ gcc

# Copy package manifests first for layer-cache efficiency
COPY package.json package-lock.json ./

# Install production dependencies (scripts needed for sqlite3 native build)
RUN npm ci --only=production

# -------------------------------------------------------
# Final image
# -------------------------------------------------------
FROM node:20-alpine

WORKDIR /app

# Runtime deps: sqlite3 native binding + su-exec (privilege drop in entrypoint)
RUN apk add --no-cache sqlite su-exec

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

# Least privilege: the Node process runs as the unprivileged `node` user.
# The entrypoint runs as root only to make the mounted /app/data volume writable
# by `node` (handles a pre-existing root-owned volume), then drops via su-exec.
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.sh && chmod +x /usr/local/bin/docker-entrypoint.sh
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "server.js"]
