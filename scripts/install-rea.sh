#!/bin/bash
# Installs REA (Reverse Engineer Anything) from source with the Ghidra native
# analysis engine, and registers its MCP server and skill with Claude Code.
# Idempotent: finished steps are skipped on a second run.
#
# Usage: bash scripts/install-rea.sh
# Override the install location with TOOLS_DIR (default: $HOME/tools).
set -euo pipefail

TOOLS_DIR="${TOOLS_DIR:-$HOME/tools}"
REA_DIR="$TOOLS_DIR/rea"
REA_COMMIT="6c4e2bba9d79e54446f5fdff2ac32e54503a4a2b" # rea-agents 6.9.0
GHIDRA_VERSION="12.1.4"
GHIDRA_BUILD="20260921"
GHIDRA_ZIP="ghidra_${GHIDRA_VERSION}_PUBLIC_${GHIDRA_BUILD}.zip"
GHIDRA_URL="https://github.com/NationalSecurityAgency/ghidra/releases/download/Ghidra_${GHIDRA_VERSION}_build/${GHIDRA_ZIP}"
# SHA-256 of the archive this script was tested with.
GHIDRA_SHA256="ddac49f903da9d5bac833e5cc79395098b9c33cfd3279be5f31bd00387d2d4db"
GHIDRA_DIR="$TOOLS_DIR/ghidra_${GHIDRA_VERSION}_PUBLIC"

mkdir -p "$TOOLS_DIR"

# Ghidra needs a 64-bit JDK 21 or newer.
if [ -z "${JAVA_HOME:-}" ]; then
  java_bin="$(readlink -f "$(command -v java)")"
  JAVA_HOME="$(dirname "$(dirname "$java_bin")")"
fi
export JAVA_HOME

if [ ! -x "$GHIDRA_DIR/support/analyzeHeadless" ]; then
  echo "Downloading Ghidra ${GHIDRA_VERSION}..."
  zip_path="$TOOLS_DIR/$GHIDRA_ZIP"
  curl -sS -L --fail --retry 3 -o "$zip_path" "$GHIDRA_URL"
  echo "$GHIDRA_SHA256  $zip_path" | sha256sum -c -
  unzip -q -o "$zip_path" -d "$TOOLS_DIR"
  rm -f "$zip_path"
fi

if [ ! -d "$REA_DIR/.git" ]; then
  echo "Fetching REA source..."
  git init -q "$REA_DIR"
  git -C "$REA_DIR" remote add origin https://github.com/morluto/rea.git
  git -C "$REA_DIR" fetch -q --depth 1 origin "$REA_COMMIT"
  git -C "$REA_DIR" checkout -q FETCH_HEAD
fi

if [ ! -d "$REA_DIR/dist" ]; then
  echo "Building REA..."
  (cd "$REA_DIR" && npm ci --no-audit --no-fund && npm run build:cached)
fi

echo "Registering REA with Claude Code..."
(cd "$REA_DIR" && GHIDRA_INSTALL_DIR="$GHIDRA_DIR" \
  node scripts/rea.mjs setup --client claude_code --yes --json >/dev/null)

echo "REA $(node "$REA_DIR/scripts/rea.mjs" --version) installed with Ghidra ${GHIDRA_VERSION}."
