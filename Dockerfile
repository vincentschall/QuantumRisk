# Game server image: compiled TypeScript on Node, no dev dependencies at runtime.
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.server.json ./
COPY src src
RUN npx tsc -p tsconfig.server.json

FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/build/src src
COPY design/map.yaml design/map.yaml
# The bit pool lives on a volume; the node user (uid 1000) must be able to write it.
RUN mkdir quantum-pool && chown node:node quantum-pool
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:8787/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "src/server/main.js"]
