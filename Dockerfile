# The client stage only produces static JS/CSS, so it runs natively on the build host
# ($BUILDPLATFORM) instead of under QEMU emulation. server-build below deliberately stays
# per target platform: its node_modules (including the Prisma CLI that schema-sync runs at
# container start) is copied into the final image and must match the image architecture.
FROM --platform=$BUILDPLATFORM node:22-slim AS client-build
WORKDIR /app
# The yarn version must match "packageManager" in the root package.json. The .yarn directory
# is gitignored (nothing in it is tracked), so a clean checkout has nothing to COPY from it;
# Corepack provides yarn instead.
RUN corepack enable && corepack prepare yarn@4.13.0 --activate
COPY package.json yarn.lock* .yarnrc.yml ./
COPY client/package.json client/
COPY shared/package.json shared/
COPY server/package.json server/
RUN yarn install --immutable
COPY shared/ shared/
COPY client/ client/
RUN yarn workspace @docktor/shared build && yarn workspace @docktor/client build

FROM node:22-slim AS server-build
WORKDIR /app
# Keep in sync with "packageManager" in the root package.json (see client-build).
RUN corepack enable && corepack prepare yarn@4.13.0 --activate
COPY package.json yarn.lock* .yarnrc.yml ./
COPY server/package.json server/
COPY shared/package.json shared/
COPY client/package.json client/
RUN yarn install --immutable
COPY shared/ shared/
COPY server/ server/
# prisma generate MUST run before the server's tsc build: server/src/generated/prisma
# is gitignored, so on a fresh build it does not exist yet, and tsc's type-check of
# any Prisma-derived import is only meaningful once the real generated types are
# present. Running generate after tsc "works" only by accident of Docker layer
# caching reusing a stale generated client from a previous build of an older schema.
RUN yarn prisma generate --config=server/prisma/prisma.config.ts && yarn workspace @docktor/shared build && yarn workspace @docktor/server build

# Downloads, checksum-verifies, and decompresses a pinned restic release. Kept as its
# own stage (rather than a RUN in the final image) purely so bzip2 — needed only to
# decompress the .bz2 release asset, and not present in node:22-slim by default — never
# ships in the final image; only the resulting /usr/local/bin/restic binary is copied
# out. Bump RESTIC_VERSION here to upgrade; nothing does this automatically, so it
# needs periodic manual review. Never use "latest" — pinning keeps builds reproducible.
# The release asset is chosen per target architecture (amd64 or arm64) from the
# TARGETARCH build argument that BuildKit/buildx sets.
FROM node:22-slim AS restic-install
ARG TARGETARCH
RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates curl bzip2 && \
    rm -rf /var/lib/apt/lists/*
# Single RUN: if checksum verification fails, the whole layer fails and there is no
# intermediate state where an unverified restic binary could be picked up by a later
# step — important because this binary will run with access to the host Docker socket.
RUN set -eu; \
    case "${TARGETARCH}" in \
      amd64|arm64) ;; \
      *) echo "Unsupported TARGETARCH '${TARGETARCH}' (build with BuildKit/buildx)" >&2; exit 1 ;; \
    esac; \
    RESTIC_VERSION=0.19.1; \
    ASSET="restic_${RESTIC_VERSION}_linux_${TARGETARCH}"; \
    cd /tmp; \
    curl -fsSLO "https://github.com/restic/restic/releases/download/v${RESTIC_VERSION}/${ASSET}.bz2"; \
    curl -fsSLO "https://github.com/restic/restic/releases/download/v${RESTIC_VERSION}/SHA256SUMS"; \
    grep " ${ASSET}.bz2\$" SHA256SUMS | sha256sum -c -; \
    bzip2 -d "${ASSET}.bz2"; \
    mv "${ASSET}" /usr/local/bin/restic; \
    chmod +x /usr/local/bin/restic; \
    rm -f SHA256SUMS

FROM node:22-slim
WORKDIR /app

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      ca-certificates \
      curl \
      git \
      iproute2 \
      lsof && \
    rm -rf /var/lib/apt/lists/*
# git (#19): GitExecutor shells out to it to clone/pull template repositories.
# iproute2 (provides ss) and lsof (#21, D-13): SocketInspector's best-effort
# tier-3 port-conflict lookup shells out to one of these two tools.

COPY --from=restic-install /usr/local/bin/restic /usr/local/bin/restic

# Install docker CLI and compose plugin. Both run with the same host Docker
# socket access as restic (see restic-install above), so they get the same
# checksum-verification treatment (WR-03), per target architecture. docker/compose
# publishes a checksums.txt per release, verified below the same way restic's
# SHA256SUMS is. download.docker.com does NOT publish a checksum manifest for the
# static CLI tarball, so DOCKER_CLI_SHA256 is pinned per architecture to the sha256
# of the exact docker-27.5.1.tgz artifact: it guards against CDN corruption or
# tampering during the build even without an upstream-signed manifest. The x86_64
# digest is the long-standing pin; the aarch64 digest is trust-on-first-use (computed
# from one TLS download). Bump both digests together with DOCKER_VERSION: recompute
# each with `sha256sum` on the new tarball for its own architecture.
ARG TARGETARCH
RUN set -eu; \
    DOCKER_VERSION=27.5.1; \
    COMPOSE_VERSION=2.33.1; \
    case "${TARGETARCH}" in \
      amd64) DOCKER_ARCH=x86_64;  DOCKER_CLI_SHA256=4f798b3ee1e0140eab5bf30b0edc4e84f4cdb53255a429dc3bbae9524845d640 ;; \
      arm64) DOCKER_ARCH=aarch64; DOCKER_CLI_SHA256=e6b53725a73763ab3f988c73f8772eaed429754c1a579db5ff11f21990fd1817 ;; \
      *) echo "Unsupported TARGETARCH '${TARGETARCH}' (build with BuildKit/buildx)" >&2; exit 1 ;; \
    esac; \
    cd /tmp; \
    curl -fsSLO "https://download.docker.com/linux/static/stable/${DOCKER_ARCH}/docker-${DOCKER_VERSION}.tgz"; \
    echo "${DOCKER_CLI_SHA256}  docker-${DOCKER_VERSION}.tgz" | sha256sum -c -; \
    tar xzf "docker-${DOCKER_VERSION}.tgz" --strip-components=1 -C /usr/local/bin docker/docker; \
    mkdir -p /usr/local/lib/docker/cli-plugins; \
    curl -fsSLO "https://github.com/docker/compose/releases/download/v${COMPOSE_VERSION}/docker-compose-linux-${DOCKER_ARCH}"; \
    curl -fsSLO "https://github.com/docker/compose/releases/download/v${COMPOSE_VERSION}/checksums.txt"; \
    grep -E " \*docker-compose-linux-${DOCKER_ARCH}\$" checksums.txt | sha256sum -c -; \
    mv "docker-compose-linux-${DOCKER_ARCH}" /usr/local/lib/docker/cli-plugins/docker-compose; \
    chmod +x /usr/local/lib/docker/cli-plugins/docker-compose; \
    rm -f "docker-${DOCKER_VERSION}.tgz" checksums.txt

COPY --from=server-build /app/node_modules ./node_modules
COPY --from=server-build /app/server/dist ./dist/server
COPY --from=server-build /app/shared/package.json ./shared/package.json
COPY --from=server-build /app/shared/dist ./shared/dist
COPY --from=server-build /app/server/prisma ./server/prisma
COPY --from=client-build /app/client/dist ./client-dist

ENV NODE_ENV=production
ENV CLIENT_DIST_PATH=./client-dist
# Docktor runs Docker-outside-of-Docker: this value must equal the HOST-side
# path of the stacks directory volume mount (docker-compose.yml), because
# `docker compose` running inside this container resolves relative bind
# mounts in managed stacks against its own filesystem view, then hands the
# resulting absolute path to the host's Docker daemon over the socket. A
# mismatch here silently misplaces every relative-volume stack's data (see
# .planning/todos/pending/2026-08-28-dood-bind-mount-path-mismatch.md). This
# default is therefore expected to be overridden per deployment — compose
# drives it from DOCKTOR_STACKS_HOST_DIR so the two sides cannot drift apart.
ENV DOCKTOR_STACKS_DIR=/opt/docktor/stacks
# Default the stacks-directory watcher to polling mode. process.platform inside this
# image is always "linux", so the Windows auto-detect in file-watcher.ts can never
# trigger here — but the /stacks bind mount's host side may be a Docker Desktop
# (Windows/Mac) virtualized filesystem that doesn't propagate inotify into the
# container either. Polling costs a small, bounded amount of CPU (1s interval over
# the stacks directory) in exchange for correct instant-detection everywhere;
# operators who've confirmed a native Linux host can override with
# DOCKTOR_FS_POLLING=false to skip it.
ENV DOCKTOR_FS_POLLING=true
# Applies pending Prisma migrations on startup, before the HTTP server
# starts listening, so a fresh `docker compose up` against an empty
# database creates the schema instead of crashing on a missing table. An
# existing install whose schema was created by the older schemaless
# `db push` mechanism is detected and baselined into migration history
# automatically on first boot after upgrade — no operator action required
# (see the Database schema section of
# https://github.com/docktor-app/docks/blob/main/reference/deployment.md#database-schema).
# Set DOCKTOR_DB_AUTO_MIGRATE=false to disable this step entirely.
ENV DOCKTOR_DB_AUTO_MIGRATE=true
# Deprecated alias for DOCKTOR_DB_AUTO_MIGRATE above, honoured only when the
# new variable is unset — kept so an operator who already set this to
# "false" on an existing install keeps that opt-out across the upgrade.
ENV DOCKTOR_DB_AUTO_PUSH=true

EXPOSE 3000

CMD ["node", "dist/server/index.js"]
