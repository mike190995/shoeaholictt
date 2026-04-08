# Build Timestamp: 2026-04-07T13:26:00Z
# ─── Stage 1: Root Node Modules ───────────────
FROM node:22-alpine AS root-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ─── Stage 2: Frontend Node Modules ───────────
FROM node:22-alpine AS frontend-deps
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

# ─── Stage 3: Build Frontend ──────────────────
FROM node:22-alpine AS frontend-build
WORKDIR /app
COPY --from=frontend-deps /app/frontend/node_modules ./frontend/node_modules
COPY frontend ./frontend
RUN cd frontend && chmod -R +x node_modules/.bin && npm run build

# ─── Stage 4: Build Backend ───────────────────
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=root-deps /app/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.json prisma.config.ts ./
COPY prisma ./prisma
COPY src ./src
RUN DATABASE_URL=postgresql://dummy:dummy@localhost:5432/dummy npx prisma generate
RUN chmod -R +x node_modules/.bin && npm run build

# ─── Stage 5: Production Image ────────────────
FROM node:22-alpine AS production

WORKDIR /app

# Copy production node_modules (we need to prune devDeps from the build stage or re-ci)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy built backend & frontend
COPY --from=build /app/dist ./dist
COPY --from=build /app/src/views ./src/views
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/prisma ./prisma
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

# Cloud Run uses PORT env var
ENV PORT=8080
ENV NODE_ENV=production
ENV REDIS_HOST=10.219.61.187
EXPOSE 8080

# Run as non-root user
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001
USER appuser

CMD ["node", "dist/index.js"]
