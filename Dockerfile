# syntax=docker/dockerfile:1.12
FROM node:24-alpine AS runtime-base

FROM runtime-base AS dependencies
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci

FROM dependencies AS builder
COPY tsconfig.base.json tsconfig.typecheck.json ./
COPY apps ./apps
COPY scripts ./scripts
COPY index.html styles.css ./
RUN npm run build

FROM runtime-base AS production
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist/api ./dist/api
COPY --from=builder /app/dist/web ./dist/web
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/health/live').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "dist/api/main.js"]
