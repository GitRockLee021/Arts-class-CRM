FROM node:22-slim AS client-build
WORKDIR /client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev
COPY server/ ./
COPY --from=client-build /client/dist ../client/dist
ENV PORT=5001
EXPOSE 5001
CMD ["node", "src/index.js"]