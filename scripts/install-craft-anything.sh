#!/bin/bash
# Builds the Craft Anything CLI from source and registers its MCP server and
# skill with Claude Code. Idempotent: an existing build is reused.
#
# Usage: bash scripts/install-craft-anything.sh
# Needs Rust 1.97 or newer. Override the install location with TOOLS_DIR
# (default: $HOME/tools).
set -euo pipefail

TOOLS_DIR="${TOOLS_DIR:-$HOME/tools}"
SRC_DIR="$TOOLS_DIR/craft-anything"
BIN_ROOT="$TOOLS_DIR/craft-anything-bin"
CLI="$BIN_ROOT/bin/craft-anything-cli"
COMMIT="e047eda0" # craft-anything 0.6.1

mkdir -p "$TOOLS_DIR"

if [ ! -x "$CLI" ]; then
  if [ ! -d "$SRC_DIR/.git" ]; then
    echo "Fetching Craft Anything source..."
    git clone -q https://github.com/storytold/craft-anything.git "$SRC_DIR"
  fi
  git -C "$SRC_DIR" checkout -q "$COMMIT"
  echo "Building Craft Anything (several minutes)..."
  cargo install --locked --path "$SRC_DIR/apps/craft-anything-cli" --root "$BIN_ROOT"
fi

echo "Registering Craft Anything with Claude Code..."
"$CLI" setup --client claude_code --yes --format text

echo "$("$CLI" --version) installed at $CLI."
