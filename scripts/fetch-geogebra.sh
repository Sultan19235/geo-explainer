#!/usr/bin/env bash
# Downloads the GeoGebra Math Apps Bundle and unpacks the parts the lesson
# player needs (deployggb.js + the web3d HTML5 codebase) into public/geogebra.
#
# Then set NEXT_PUBLIC_GGB_CODEBASE=/geogebra (e.g. in .env.local) and the
# lesson player loads the engine from our own host instead of geogebra.org —
# faster and more reliable on school networks. Without the env var (or if the
# files are missing in a deploy) the player falls back to the geogebra.org CDN.
#
# public/geogebra is gitignored (~80 MB). For production either commit it
# deliberately, host it on a CDN/bucket and point NEXT_PUBLIC_GGB_CODEBASE at
# that URL, or run this script during the build.
#
# NOTE: GeoGebra is free for non-commercial use only; offering it inside a
# paid product needs a license agreement with GeoGebra (applies to CDN use
# too). See https://www.geogebra.org/license

set -euo pipefail
cd "$(dirname "$0")/.."

BUNDLE_URL="https://download.geogebra.org/package/geogebra-math-apps-bundle"
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

echo "Downloading GeoGebra Math Apps Bundle…"
curl -fL --progress-bar -o "$WORK_DIR/bundle.zip" "$BUNDLE_URL"

echo "Unpacking…"
unzip -oq "$WORK_DIR/bundle.zip" -d "$WORK_DIR/bundle"

echo "Installing into public/geogebra…"
rm -rf public/geogebra
mkdir -p public/geogebra/HTML5/5.0
cp "$WORK_DIR/bundle/GeoGebra/deployggb.js" public/geogebra/
cp -R "$WORK_DIR/bundle/GeoGebra/HTML5/5.0/web3d" public/geogebra/HTML5/5.0/
# The app resolves its stylesheets (toolbar, dialogs…) at <codebase>/../css.
cp -R "$WORK_DIR/bundle/GeoGebra/HTML5/5.0/css" public/geogebra/HTML5/5.0/

echo "Done: $(du -sh public/geogebra | cut -f1) in public/geogebra"
echo "Enable with NEXT_PUBLIC_GGB_CODEBASE=/geogebra"
