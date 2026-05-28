# -------------------------------------------------------
# LinguistPro — production Docker image
# Node 20 LTS Alpine · stateless, all state in /app/data
# -------------------------------------------------------
FROM node:20-alpine AS deps

WORKDIR /app

# Copy package manifests first for layer-cache efficiency
COPY package.json package-lock.json ./

# Install production dependencies only
RUN npm ci --only=production --ignore-scripts

# -------------------------------------------------------
# Final image
# -------------------------------------------------------
FROM node:20-alpine

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
