#!/bin/zsh

cd "$(dirname "$0")" || exit 1

if ! command -v bun >/dev/null 2>&1; then
  echo "Bun is not installed or is not available in PATH."
  echo "Install Bun first: https://bun.sh"
  echo
  echo "Press Enter to close this window."
  read -r _
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo "node_modules was not found. Installing dependencies with bun install..."
  bun install
  install_status=$?
  if [ "$install_status" -ne 0 ]; then
    echo
    echo "Dependency installation failed with exit code $install_status."
    echo "Press Enter to close this window."
    read -r _
    exit "$install_status"
  fi
fi

echo "Starting 1Code desktop app..."
echo
bun run dev
status=$?

echo
echo "1Code exited with code $status."
echo "Press Enter to close this window."
read -r _
exit "$status"
