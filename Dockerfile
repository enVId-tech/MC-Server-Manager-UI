# Use the current Node LTS release
FROM node:24-bookworm-slim

# Update system certificates so Portainer and WebDAV servers with private CAs can be trusted
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && update-ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /nextapp

# Install dependencies first so they are cached until the lockfile changes
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Apply to both the build and the runtime
ENV NODE_OPTIONS="--use-system-ca"
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# Keep proxy definitions on the mounted volume
ENV PROXIES_CONFIG_PATH=/data/proxies.yaml

EXPOSE 3000

CMD ["npm", "start"]
