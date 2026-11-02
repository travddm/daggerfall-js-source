# The image every self-hosted CI job runs in (docs/ci/self-hosted-runner.md). One container per job, removed after it.
# Build:  docker build -t dfo-ci-runner:$(date +%Y%m%d) \
#           --build-arg RUNNER_VERSION=<actions/runner release, no "v"> \
#           --build-arg PLAYWRIGHT_VERSION=<package-lock.json "playwright"> tools/ci-runner
FROM ubuntu:24.04

ARG RUNNER_VERSION
ARG PLAYWRIGHT_VERSION
ARG NODE_VERSION=22.18.0
ENV DEBIAN_FRONTEND=noninteractive

# The tools the workflows call outside Node: git (checkout, release-notes), curl, jq and grep -P (account-deploy and
# the Cloudflare jobs), unzip (tools/fetch-data.sh), gh (release-notes, publish), build tools (native npm modules).
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl git gh jq unzip zip xz-utils tar gzip build-essential python3 \
    && rm -rf /var/lib/apt/lists/*

# Node as a fallback for `npx`; the jobs' own setup-node@v4 still picks node 22 for the run.
RUN curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz" \
    | tar -xJ -C /usr/local --strip-components=1

# Chromium and its system libraries, installed once as root: the job user has no sudo, so the workflow's
# `playwright install --with-deps` cannot run there.
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers
RUN npx --yes playwright@${PLAYWRIGHT_VERSION} install --with-deps chromium \
    && rm -rf /var/lib/apt/lists/* /root/.npm

# The runner application and the libraries it needs (installdependencies.sh runs apt, so root).
RUN useradd --create-home --uid 10001 --shell /bin/bash runner \
    && mkdir /home/runner/actions-runner && cd /home/runner/actions-runner \
    && curl -fsSL "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz" | tar -xz \
    && ./bin/installdependencies.sh && rm -rf /var/lib/apt/lists/* \
    && chown -R runner:runner /home/runner /opt/pw-browsers

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod 0755 /usr/local/bin/entrypoint.sh

USER runner
WORKDIR /home/runner/actions-runner
ENV RUNNER_MANUALLY_TRAP_SIG=1 ACTIONS_RUNNER_PRINT_LOG_TO_STDOUT=1
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
