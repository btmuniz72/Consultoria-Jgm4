# Imagem única (API NestJS + frontend Angular servido pela própria API, mesma origem). Sem segredos: tudo vem de variáveis de ambiente.
# Build:  docker build -t jgm4-projects:<versao> .
# Migrar: docker run --rm --env-file <env> jgm4-projects:<versao> npm run prisma:migrate -w backend
# Rodar:  docker run -d --env-file <env> -p 127.0.0.1:3000:3000 jgm4-projects:<versao>   (atrás de proxy HTTPS)
ARG PUBLIC_BASE_PATH=/projetos
ARG API_BASE_PATH=/api
FROM node:24-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci
COPY . .
ARG PUBLIC_BASE_PATH
ARG API_BASE_PATH
RUN npm run db:generate && npm run build -w backend && PUBLIC_BASE_PATH="$PUBLIC_BASE_PATH" API_BASE_PATH="$API_BASE_PATH" npm run build:frontend

FROM node:24-slim
WORKDIR /app
ARG PUBLIC_BASE_PATH=/projetos
ARG API_BASE_PATH=/api
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 FRONTEND_DIST_DIR=/app/frontend/dist/frontend/browser PUBLIC_BASE_PATH=${PUBLIC_BASE_PATH} API_BASE_PATH=${API_BASE_PATH}
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates postgresql-client && rm -rf /var/lib/apt/lists/*
COPY --from=build /app /app
RUN mkdir -p /data/storage && chown -R node:node /data /app
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/api/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["npm", "run", "start", "-w", "backend"]
