#!/usr/bin/env bash
# Runs the Linux check or build inside the Docker image from tools/linux/
# (build it once with `npm run linux:image`). The working tree is copied
# into a fresh container, so nothing here touches the host's node_modules
# or target directories; the cargo and npm caches live in a named volume.
#
#   bash tools/linux/run.sh check   # npm ci && npm run check on Linux
#   bash tools/linux/run.sh build   # .deb and AppImage -> src-tauri/target/linux-bundle/
#   bash tools/linux/run.sh shell   # interactive shell in the prepared tree
set -euo pipefail
# Git Bash on Windows would rewrite container paths like /src to C:/...
export MSYS_NO_PATHCONV=1

mode="${1:-check}"
image="gcmd-linux-build"
volume="gcmd-linux-cache"
root="$(cd "$(dirname "$0")/../.." && pwd)"
out="$root/src-tauri/target/linux-bundle"

case "$mode" in
  check) command='npm ci --no-audit --no-fund && npm run check' ;;
  build) command='npm ci --no-audit --no-fund && npx tauri build --bundles deb,appimage' ;;
  shell) command='bash' ;;
  *) echo "usage: $0 check|build|shell" >&2; exit 2 ;;
esac

if ! docker image inspect "$image" >/dev/null 2>&1; then
  echo "image $image missing: run 'npm run linux:image' first" >&2
  exit 1
fi

tty_flags=()
if [ "$mode" = "shell" ]; then
  tty_flags=(-it)
fi

cid="$(docker create "${tty_flags[@]}" -v "$volume:/cache" -w /src "$image" bash -c "$command")"
trap 'docker rm -f "$cid" >/dev/null 2>&1 || true' EXIT

# Copy the tree without host build output; docker cp reads a tar stream.
tar -C "$root" -cf - \
  --exclude=./node_modules --exclude=./dist --exclude=./src-tauri/target \
  --exclude=./src-tauri/gen --exclude=./.git \
  . | docker cp - "$cid:/src"

docker start -a "$cid"

if [ "$mode" = "build" ]; then
  rm -rf "$out"
  mkdir -p "$out"
  # docker cp needs a host path; with path conversion off, Git Bash must
  # hand it the Windows spelling (`pwd -W`), elsewhere pwd is fine.
  out_host="$(cd "$out" && (pwd -W 2>/dev/null || pwd))"
  docker cp "$cid:/cache/target/release/bundle/." "$out_host"
  echo "Linux bundles copied to $out"
  ls -R "$out" | grep -E '\.(deb|AppImage)$' || true
fi
