# ---------- Build stage ----------
FROM node:20-alpine AS build
WORKDIR /app

# Avoid root's npm cache bloat; keep installs reproducible
COPY package*.json ./
RUN npm ci --no-audit --no-fund

# Copy sources and build
COPY . .
# Optional build-time envs (passed as --build-arg)
ARG VITE_AI_TIME_MS
ARG VITE_DEFAULT_DEPTH
ENV VITE_AI_TIME_MS=${VITE_AI_TIME_MS}
ENV VITE_DEFAULT_DEPTH=${VITE_DEFAULT_DEPTH}

# Produce optimized bundle in /app/dist
RUN npm run build


# ---------- Runtime stage ----------
FROM nginx:1.27-alpine

# Minimal, hardened Nginx config with SPA fallback + caching
# - Serves /usr/share/nginx/html (Vite output)
# - Caches hashed assets aggressively
# - Falls back to index.html for client-side routing
RUN <<'EOF' ash
cat >/etc/nginx/conf.d/default.conf <<'NGINX_CONF'
server {
    listen 80;
    server_name _;

    # Document root
    root /usr/share/nginx/html;

    # Try exact files first, then index.html (SPA fallback)
    location / {
        try_files $uri /index.html;
    }

    # Cache immutable, hashed assets longer
    location ~* \.(?:js|mjs|css|woff2?|ttf|otf|eot|png|jpg|jpeg|gif|svg|webp)$ {
        expires 30d;
        add_header Cache-Control "public, max-age=2592000, immutable";
        try_files $uri =404;
    }

    # Basic security headers (adjust as needed)
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options DENY always;
    add_header Referrer-Policy no-referrer-when-downgrade always;
    add_header X-XSS-Protection "1; mode=block" always;
}
NGINX_CONF
EOF

# Copy build artifacts from builder
COPY --from=build /app/dist /usr/share/nginx/html

# Healthcheck (ensure index loads)
RUN apk add --no-cache curl
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD curl -fsS http://localhost/ || exit 1

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

# # Build (optionally pass build-time vars)
# docker build -t quoridor-web --build-arg VITE_AI_TIME_MS=1000 --build-arg VITE_DEFAULT_DEPTH=3 .

# # Run
# docker run -d -p 8080:80 --name quoridor quoridor-web
# # Open http://localhost:8080

# docker run -d `
#   -p 3000:80 `
#   --name quoridor `
#   --read-only `
#   --cpus="1.0" `
#   --memory="256m" `
#   --pids-limit=256 `
#   --security-opt no-new-privileges `
#   quoridor-web
