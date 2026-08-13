#!/usr/bin/env bash

set -u

if ! repo_root="$(git rev-parse --show-toplevel 2>/dev/null)"; then
  echo "warning: repository root was not found; skipping automatic Vite startup" >&2
  exit 0
fi

cd "$repo_root" || {
  echo "warning: could not enter repository root; skipping automatic Vite startup" >&2
  exit 0
}

mkdir -p "$HOME/.codex" || echo "warning: could not pre-create \$HOME/.codex" >&2
if ! sudo chown "$(id -u):$(id -g)" "$HOME/.codex" 2>/dev/null; then
  echo "warning: could not set ownership on \$HOME/.codex" >&2
fi
chmod 700 "$HOME/.codex" || echo "warning: could not secure \$HOME/.codex permissions" >&2

# Reassert file-based auth on every start so the IDE and CLI never select a
# container-local keyring instead of the persistent CODEX_HOME volume.
codex_config="$HOME/.codex/config.toml"
if ! grep -Eq '^[[:space:]]*cli_auth_credentials_store[[:space:]]*=' "$codex_config" 2>/dev/null; then
  if [ -s "$codex_config" ]; then
    sed -i '1i cli_auth_credentials_store = "file"' "$codex_config" || \
      echo "warning: could not configure file-based Codex credentials" >&2
  else
    printf '%s\n' 'cli_auth_credentials_store = "file"' > "$codex_config" || \
      echo "warning: could not configure file-based Codex credentials" >&2
  fi
fi

if [ -e "$codex_config" ] && ! chmod 600 "$codex_config"; then
  echo "warning: could not secure \$HOME/.codex/config.toml permissions" >&2
fi

codex_auth="$HOME/.codex/auth.json"
if [ -e "$codex_auth" ] && ! chmod 600 "$codex_auth"; then
  echo "warning: could not secure \$HOME/.codex/auth.json permissions" >&2
fi

if curl --fail --silent --show-error http://127.0.0.1:5173/ >/dev/null 2>&1; then
  echo "TangerineTools is already running on port 5173."
  exit 0
fi

nohup npm run dev -- --host 0.0.0.0 > /tmp/tangerine-tools-vite.log 2>&1 &
echo "Starting TangerineTools on port 5173 (log: /tmp/tangerine-tools-vite.log)."

exit 0
