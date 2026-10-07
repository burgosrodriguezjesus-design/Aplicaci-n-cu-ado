# Imagen de la aplicación: compila la web y el servidor y lo arranca en el puerto 3000.
# Base de datos: Postgres con DATABASE_URL, o PGlite local en /data si no se indica.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
VOLUME ["/data"]
EXPOSE 3000
CMD ["node", "dist/server.js"]
