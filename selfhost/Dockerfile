# The self-host image: both Workers and their shims, bundled and configured at build time, served by workerd.
# Built from the repository root by docker-compose.yml (context ".."), with Dockerfile.dockerignore beside this file.
FROM node:22.21.1-bookworm-slim
WORKDIR /dfo
COPY selfhost/package.json selfhost/package-lock.json selfhost/
RUN npm ci --prefix selfhost --no-audit --no-fund
COPY . .
# Extra generator flags, for example "--metrics" or "--r2 s3".
ARG GENERATE_FLAGS=""
RUN node selfhost/generate.ts --data /data --relay-address "*:8787" --accounts-address "*:8788" $GENERATE_FLAGS
VOLUME /data
EXPOSE 8787 8788
CMD ["sh", "/dfo/selfhost/docker/start.sh"]
