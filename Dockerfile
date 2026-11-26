FROM oven/bun:1.4.2-slim@sha256:cb3bbbb08e13a4a2ff400f24c7a2a1d5efa83f6ef8544d52d95a519631e2fc61 AS builder

WORKDIR /usr/local/src/openpwd

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
# The build validates that the environment is declared. These placeholders are read at
# runtime only and never end up in the output: the real values come from the deployment.
RUN SUPABASE_URL=http://build.invalid \
    SUPABASE_PUBLISHABLE_KEY=build-placeholder \
    ALLOWED_GOOGLE_DOMAIN=build.invalid \
    KMS_MODE=google \
    bun run build

FROM gcr.io/distroless/nodejs26-debian13:nonroot@sha256:a84242e747fbb5aaaa0180c273b6f7130ca34b3300082192ef58eea96089eb3c

WORKDIR /usr/local/lib/openpwd

COPY --from=builder /usr/local/src/openpwd/package.json ./package.json
COPY --from=builder /usr/local/src/openpwd/docker/healthcheck.js ./healthcheck.js
COPY --from=builder /usr/local/src/openpwd/build ./

ENV NODE_ENV=production \
    PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD ["/nodejs/bin/node", "healthcheck.js"]

USER 65532:65532

CMD ["index.js"]
