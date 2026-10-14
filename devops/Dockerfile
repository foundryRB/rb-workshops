# syntax=docker/dockerfile:1
# The app image (rb-workshops-app): the FastAPI backend serving the built
# SPA document from app/, the REST API and the MCP door, from one image. The
# frontend is built and committed into app/ (the served path the walking
# skeleton claim reads), so this image needs no node stage. The renderer's
# bytes are resolved at start from the configured source and verified against
# renderer.lock; the tree carries the pin, never the template.
FROM python:3.13-slim
ARG BUILD=dev
WORKDIR /srv
COPY pyproject.toml renderer.lock ./
COPY backend/ backend/
RUN pip install --no-cache-dir . && mkdir -p /var/cache/renderer
COPY app/ app/
# The build stamp the health route reports: the image's own build moment, so a
# probe can tell a fresh release from a stale pod or an edge cache (the shared
# CI passes no build argument, and a content hash is not freshness).
RUN date -u +%Y-%m-%dT%H:%M:%SZ > /srv/BUILD
ENV PORT=8000 \
    WORKSHOPS_STATIC_DIR=/srv/app \
    WORKSHOPS_RENDERER_LOCK=/srv/renderer.lock \
    WORKSHOPS_RENDERER_CACHE_DIR=/var/cache/renderer \
    WORKSHOPS_BUILD=${BUILD} \
    WORKSHOPS_BUILD_FILE=/srv/BUILD
EXPOSE 8000
CMD ["python", "-m", "backend.run"]
