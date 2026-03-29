FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run db:generate && npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4217
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1
ENV RUN_DB_PUSH_ON_START=true
ENV AUTH_COOKIE_SECURE=false
ENV DATABASE_PROVIDER=sqlite
ENV SQLITE_DATABASE_URL=file:/app/data/ticketera.db
ENV APP_CONFIG_ENCRYPTION_KEY=ticketera-local-dev-change-me

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/src ./src
COPY --from=builder /app/next.config.ts ./next.config.ts

RUN mkdir -p /app/data && chown -R appuser:appgroup /app

USER appuser

EXPOSE 4217

CMD ["sh", "-c", "mkdir -p /app/data && npm run db:generate && if [ \"${RUN_DB_PUSH_ON_START:-false}\" = \"true\" ]; then npm run db:push; fi && npm run start"]
