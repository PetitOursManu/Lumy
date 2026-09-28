# Lumy: serve a documentation site with its dashboard, assistant and MCP server.
#
#   docker run -p 127.0.0.1:4000:4000 -v "$PWD:/site" -v lumy-data:/data ghcr.io/…/lumy
#
# /site holds lumy.config.json and docs/ (read-write, so an assistant can write
# pages through MCP). /data keeps accounts, settings, feedback and the built site.
FROM node:22-slim

# git gives pages their "Updated on" date; nothing else is installed.
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && git config --system --add safe.directory '*'

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY bin ./bin
COPY src ./src
COPY theme ./theme
COPY templates ./templates

RUN mkdir -p /site /data && chown node:node /site /data
ENV NODE_ENV=production \
    LUMY_DATA_DIR=/data \
    LUMY_OUT_DIR=/data/dist
VOLUME ["/data"]
EXPOSE 4000
USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:4000/_lumy/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["node", "/app/bin/lumy.js"]
CMD ["serve", "--root", "/site", "--host", "0.0.0.0", "--port", "4000", "--watch"]
