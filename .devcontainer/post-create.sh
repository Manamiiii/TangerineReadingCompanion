#!/usr/bin/env bash

set -u

if ! repo_root="$(git rev-parse --show-toplevel 2>/dev/null)"; then
  echo "warning: repository root was not found; skipping post-create setup" >&2
  exit 0
fi

cd "$repo_root" || {
  echo "warning: could not enter repository root; skipping post-create setup" >&2
  exit 0
}

# Dependency or registry failures should be visible, but must not force the
# Codespace into recovery mode. They can be retried from the terminal.
if ! npm ci; then
  echo "warning: dependency installation failed; retry with: npm ci" >&2
fi

# Keep Codex reproducible after a Codespace rebuild. A Codex registry/network
# failure must not make the development container unusable.
if ! npm install --global @openai/codex@0.144.4; then
  echo "warning: Codex CLI installation failed; retry with: npm install -g @openai/codex@0.144.4" >&2
fi

mkdir -p "$HOME/.codex" || echo "warning: could not pre-create \$HOME/.codex" >&2
if ! sudo chown "$(id -u):$(id -g)" "$HOME/.codex" 2>/dev/null; then
  echo "warning: could not set ownership on \$HOME/.codex" >&2
fi
chmod 700 "$HOME/.codex" || echo "warning: could not secure \$HOME/.codex permissions" >&2

# CODEX_HOME is backed by the named Docker volume in devcontainer.json. Force
# file storage because a container-local keyring does not survive a restart.
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

exit 0
