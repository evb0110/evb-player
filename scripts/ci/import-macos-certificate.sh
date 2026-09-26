#!/bin/bash
# Imports the Developer ID certificate (base64 .p12 in CSC_LINK) into a throwaway keychain and
# exports CSC_KEYCHAIN for electron-builder. electron-builder's own import passes the .p12
# password where the keychain password belongs and fails, so the build step must not see CSC_LINK.
set -euo pipefail

: "${CSC_LINK:?CSC_LINK is required}"
: "${CSC_KEY_PASSWORD:?CSC_KEY_PASSWORD is required}"
: "${RUNNER_TEMP:?RUNNER_TEMP is required}"
: "${GITHUB_ENV:?GITHUB_ENV is required}"

certificate="$RUNNER_TEMP/developer-id.p12"
printf '%s' "$CSC_LINK" | base64 --decode > "$certificate"

keychain="$RUNNER_TEMP/evb-player-signing.keychain-db"
keychain_password="$(uuidgen)-$(uuidgen)"
security create-keychain -p "$keychain_password" "$keychain"
security set-keychain-settings -lut 21600 "$keychain"
security unlock-keychain -p "$keychain_password" "$keychain"
security import "$certificate" -k "$keychain" -P "$CSC_KEY_PASSWORD" -T /usr/bin/codesign -T /usr/bin/security >/dev/null
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$keychain_password" "$keychain" >/dev/null
security list-keychains -d user -s "$keychain" $(security list-keychains -d user | tr -d '"')
rm -f "$certificate"

if ! security find-identity -v -p codesigning "$keychain" | grep -q 'Developer ID Application'; then
  echo "::error::The imported certificate has no Developer ID Application identity"
  exit 1
fi

echo "CSC_KEYCHAIN=$keychain" >> "$GITHUB_ENV"
