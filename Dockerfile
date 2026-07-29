ARG NODE_BASE_IMAGE=node:22-alpine
ARG NGINX_BASE_IMAGE=nginx:1.28-alpine

FROM ${NODE_BASE_IMAGE} AS build

ARG NPM_REGISTRY=https://registry.npmjs.org

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --registry="$NPM_REGISTRY"

COPY . .
RUN npm run build

FROM ${NGINX_BASE_IMAGE} AS runtime

COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
RUN nginx -t
COPY --from=build /app/dist /usr/share/nginx/html/stonksup

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/healthz >/dev/null || exit 1
