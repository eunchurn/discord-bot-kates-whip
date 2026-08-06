FROM oven/bun:1.2 AS deps

WORKDIR /app

# postinstall runs `prisma generate`, which needs the schema and config.
COPY package.json bun.lock* prisma.config.ts ./
COPY prisma/ ./prisma/
RUN bun install --frozen-lockfile

FROM oven/bun:1.2 AS runtime

WORKDIR /app

# openssl: Prisma probes for it at startup. tzdata: IANA zones for luxon/Intl.
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl tzdata \
    && rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/src/generated ./src/generated
COPY package.json tsconfig.json prisma.config.ts ./
COPY prisma/ ./prisma/
COPY src/ ./src/
COPY docker-entrypoint.sh /usr/local/bin/

ENV NODE_ENV=production \
    DATA_DIR=/data \
    DATABASE_URL=file:/data/kates-whip.db

RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
    && mkdir -p /data \
    && chown -R bun:bun /data /app

USER bun

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["bun", "src/index.ts"]
