# Linux build and test environment for GCMD, used from Windows or macOS
# through Docker (`npm run linux:image`, then `npm run linux:check` or
# `npm run linux:build`; see tools/linux/run.sh). The image holds the Tauri 2
# Linux prerequisites (WebKitGTK 4.1, GTK 3, librsvg), stable Rust and
# Node 24; the repository is copied in at run time, never mounted, so the
# Windows node_modules and target directories stay untouched.
FROM rust:1-bookworm

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    build-essential ca-certificates curl file git pkg-config \
    libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev libssl-dev libxdo-dev \
    patchelf xdg-utils \
  && curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
  && apt-get install -y --no-install-recommends nodejs \
  && rm -rf /var/lib/apt/lists/*

RUN rustup component add clippy rustfmt

# Build output for AppImage needs FUSE unless the tooling is told to extract.
ENV APPIMAGE_EXTRACT_AND_RUN=1 \
    CARGO_TARGET_DIR=/cache/target \
    npm_config_cache=/cache/npm

WORKDIR /src
