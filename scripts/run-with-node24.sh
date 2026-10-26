#!/usr/bin/env bash

set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
required_version="$(tr -d '[:space:]' < "${repository_root}/.nvmrc")"
required_major="${required_version%%.*}"

current_major=""
if command -v node >/dev/null 2>&1; then
  current_major="$(node --version | sed -E 's/^v([0-9]+).*/\1/')"
fi

if [[ "${current_major}" == "${required_major}" ]]; then
  exec "$@"
fi

for node24_directory in \
  "/opt/homebrew/opt/node@24/bin" \
  "/usr/local/opt/node@24/bin"
do
  if [[ -x "${node24_directory}/node" ]]; then
    export PATH="${node24_directory}:${PATH}"
    exec "$@"
  fi
done

cat >&2 <<EOF
Aizu Connect requires Node.js ${required_version}.
Install it with one of the following commands, then retry:
  brew install node@24
  nvm install ${required_version}
EOF
exit 1
