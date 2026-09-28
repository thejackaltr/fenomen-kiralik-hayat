# Production image for fenomen.teserix.com (Dokploy). GitHub Pages keeps using .github/workflows/pages.yml.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# Umami (analiz.teserix.com) config comes from build args only (Dokploy env -> docker-compose build.args).
# Empty = analytics off. The script is still loaded only after the KVKK stats notice (src/analytics.js).
ARG VITE_UMAMI_SRC=
ARG VITE_UMAMI_WEBSITE_ID=
ARG VITE_UMAMI_DOMAINS=
ENV VITE_UMAMI_SRC=$VITE_UMAMI_SRC VITE_UMAMI_WEBSITE_ID=$VITE_UMAMI_WEBSITE_ID VITE_UMAMI_DOMAINS=$VITE_UMAMI_DOMAINS
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
