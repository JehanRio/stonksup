ARG POSTGRES_BASE=docker.io/library/postgres:17-alpine@sha256:742f40ea20b9ff2ff31db5458d127452988a2164df9e17441e191f3b72252193

FROM ${POSTGRES_BASE} AS builder

ARG PGVECTOR_VERSION=0.8.2

RUN apk add --no-cache \
      build-base \
      postgresql17-dev

ADD https://github.com/pgvector/pgvector/archive/refs/tags/v${PGVECTOR_VERSION}.tar.gz /tmp/pgvector.tar.gz

RUN mkdir -p /tmp/pgvector-src /tmp/pgvector-install \
    && tar -xzf /tmp/pgvector.tar.gz --strip-components=1 -C /tmp/pgvector-src \
    && make -C /tmp/pgvector-src PG_CONFIG=/usr/bin/pg_config OPTFLAGS="" \
    && make -C /tmp/pgvector-src PG_CONFIG=/usr/bin/pg_config \
         DESTDIR=/tmp/pgvector-install install

FROM ${POSTGRES_BASE}

ARG PGVECTOR_VERSION=0.8.2

COPY --from=builder /tmp/pgvector-install/usr/lib/postgresql17/vector.so /usr/local/lib/postgresql/vector.so
COPY --from=builder /tmp/pgvector-install/usr/share/postgresql17/extension/ /usr/local/share/postgresql/extension/

RUN test -f /usr/local/lib/postgresql/vector.so \
    && test -f /usr/local/share/postgresql/extension/vector.control

LABEL org.opencontainers.image.title="StonksUp PostgreSQL with pgvector"
LABEL org.opencontainers.image.description="PostgreSQL 17 Alpine with pgvector, optimized for Tencent Cloud deployment"
LABEL org.opencontainers.image.version="${PGVECTOR_VERSION}"
