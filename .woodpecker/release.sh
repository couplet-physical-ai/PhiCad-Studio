#!/usr/bin/env bash
# Roadrunner release + CoreLibrary trust check for PhiCad-Studio: the port of
# .github/workflows/release.yml (and ci.yml's corelib-trust job). Called by .woodpecker/*.yaml:
#   Linux engine VM (release.yaml; host has bash, git, curl and the dagger CLI):
#     bash .woodpecker/release.sh build linux|win   # -> dist/<platform>/ (installers, latest*.yml)
#     bash .woodpecker/release.sh publish           # tag runs: (re)create the GitHub prerelease
#   macOS agent (release-macos.yaml; node, git, gh, Xcode CLT on PATH; bash 3.2-safe):
#     bash .woodpecker/release.sh build-mac         # -> dist/mac/ (arm64 + x64 dmg/zip, latest-mac.yml)
#     bash .woodpecker/release.sh publish-mac       # tag runs: add the mac assets to that release
#   ci.yaml (push to main / manual): bash .woodpecker/release.sh corelib-trust
# Linux and Windows build inside a digest-pinned node:22-bookworm container through the host
# dagger CLI (the GitHub ubuntu/windows runners' role); `stage` is the body of one GitHub
# `build` matrix leg. GH_TOKEN (Woodpecker secret github_release_token) reaches containers only
# as a Dagger secret: fetch-core-library.ts needs an authenticated gh.
set -euo pipefail

NODE_IMAGE=public.ecr.aws/docker/library/node:22-bookworm@sha256:7702d8aa4d5910871692af4480eb3ba86f23047a6417a44d857d06c95d060d3f
BUN_VERSION=1.3.0
GH_VERSION=2.103.3
GH_SHA256=4c806978ffce1cec70853302a56d70ac6da4f19bae7adca4e1a8ab00633dd91d # linux_amd64
INSTALLERS='\.(exe|dmg|zip|AppImage|deb|rpm)$'

usage='usage: release.sh build linux|win | publish | build-mac | publish-mac | corelib-trust'
cmd=${1:?$usage}
# Host commands run from the checkout; container commands (/ci/release.sh) from /src.
case $cmd in deps | stage | smoke-prep | smoke) ;; *) cd "$(dirname "$0")/.." ;; esac
export GIT_TERMINAL_PROMPT=0
# macOS has no coreutils `timeout`: bound with perl's alarm instead.
command -v timeout >/dev/null || timeout() {
  local s=$1
  shift
  perl -e '$s = shift; alarm $s; exec @ARGV or die "exec $ARGV[0]: $!\n"' "$s" "$@"
}
# GitHub's github.ref_name: the tag, or the branch of a manual run.
REF_NAME=${CI_COMMIT_TAG:-${CI_COMMIT_BRANCH:-}}
REPO=${CI_REPO:-couplet-physical-ai/PhiCad-Studio}

# ---------------------------------------------------------------- host side (Linux engine VM)

# ctr <platform> <dagger core args after the source is mounted...>: node image + per-platform
# apt deps (as root) + the checkout owned by `node` + GH_TOKEN as a secret env.
ctr() {
  : "${GH_TOKEN:?GH_TOKEN must be set (secret github_release_token)}"
  local platform=$1
  shift
  export _EXPERIMENTAL_DAGGER_RUNNER_HOST=${_EXPERIMENTAL_DAGGER_RUNNER_HOST:-unix:///run/dagger-engine/engine.sock}
  timeout 5400 dagger --progress=plain core container from --address="$NODE_IMAGE" \
    with-env-variable --name=CI --value=true \
    with-env-variable --name=CI_PIPELINE_EVENT --value="${CI_PIPELINE_EVENT:-manual}" \
    with-env-variable --name=CI_COMMIT_TAG --value="${CI_COMMIT_TAG:-}" \
    with-env-variable --name=CI_COMMIT_BRANCH --value="${CI_COMMIT_BRANCH:-}" \
    with-env-variable --name=CORELIB_TAG --value="${CORELIB_TAG:-}" \
    with-directory --path=/ci --source=.woodpecker \
    with-exec --args=bash,/ci/release.sh,deps,"$platform" \
    with-directory --path=/src --source=. --owner=node \
    --exclude=.git,node_modules,dist,.cache,.build,electron/out,test-results,playwright-report \
    with-workdir --path=/src \
    with-secret-variable --name=GH_TOKEN --secret=env://GH_TOKEN \
    with-user --name=node \
    "$@"
}

# build linux|win: one GitHub matrix leg in the container, then export its dist/<platform>.
build() {
  local platform=$1
  case $platform in linux | win) ;; *) echo "$usage" >&2; exit 1 ;; esac
  rm -rf "dist/$platform"
  mkdir -p dist
  if [ "$platform" = linux ]; then
    # Packaged-app smoke under Xvfb: browser system libs + a setuid chrome-sandbox need root.
    ctr linux with-exec --args=bash,/ci/release.sh,stage,linux \
      with-user --name=root with-exec --args=bash,/ci/release.sh,smoke-prep \
      with-user --name=node with-exec --args=bash,/ci/release.sh,smoke \
      directory --path=/src/dist/linux export --path=./dist/linux
  else
    ctr win with-exec --args=bash,/ci/release.sh,stage,win \
      directory --path=/src/dist/win export --path=./dist/win
  fi
  ls -l "dist/$platform"
}

# publish (tag runs): GitHub's `publish` job for the Linux + Windows assets. The macOS
# workflow (depends_on: release) adds its assets and SHA256SUMS lines afterwards.
publish() {
  : "${GH_TOKEN:?GH_TOKEN must be set}" "${CI_COMMIT_TAG:?publish runs on tag events only}"
  local tools="$PWD/.release-tools" gh_name="gh_${GH_VERSION}_linux_amd64"
  mkdir -p "$tools"
  [ -f "$tools/$gh_name.tar.gz" ] || timeout 300 curl -fsSL --retry 3 -o "$tools/$gh_name.tar.gz" \
    "https://github.com/cli/cli/releases/download/v$GH_VERSION/$gh_name.tar.gz"
  echo "$GH_SHA256  $tools/$gh_name.tar.gz" | sha256sum -c --quiet -
  tar -xzf "$tools/$gh_name.tar.gz" -C "$tools"
  export GH_CONFIG_DIR="$tools/gh-config" GH_PROMPT_DISABLED=1 GH_NO_UPDATE_NOTIFIER=1
  local gh="$tools/$gh_name/bin/gh" f files=()
  for f in dist/linux/* dist/win/*; do
    if [[ $(basename "$f") =~ $INSTALLERS || $(basename "$f") == latest*.yml ]]; then files+=("$f"); fi
  done
  # Installers only, basenames (what a user has on disk), sorted by name.
  for f in "${files[@]}"; do
    if [[ $(basename "$f") =~ $INSTALLERS ]]; then (cd "$(dirname "$f")" && sha256sum "$(basename "$f")"); fi
  done | sort -k2 >dist/SHA256SUMS.txt
  [ -s dist/SHA256SUMS.txt ] || { echo "release.sh: no installers found to checksum" >&2; exit 1; }
  cat dist/SHA256SUMS.txt
  files+=(dist/SHA256SUMS.txt)
  printf 'Publishing artifacts:\n'
  printf '  %s\n' "${files[@]}"
  timeout 120 "$gh" release delete "$CI_COMMIT_TAG" --yes --repo "$REPO" || true
  timeout 3600 "$gh" release create "$CI_COMMIT_TAG" --repo "$REPO" --verify-tag --prerelease \
    --title "$CI_COMMIT_TAG" --notes-file dist/linux/release-notes.md "${files[@]}"
}

# corelib-trust (ci.yaml): `bun scripts/fetch-core-library.ts` against the latest stable release.
corelib_trust() {
  ctr corelib with-exec --args=bash,/ci/release.sh,stage,corelib sync >/dev/null
  echo "CoreLibrary release trust: ok"
}

# ---------------------------------------------------------------- container / macOS side

# deps <platform> (container, root): system packages GitHub's runner images ship or the
# workflow apt-installed, plus a pinned gh for fetch-core-library.ts.
deps() {
  local pkgs=""
  case $1 in
    linux) pkgs="fakeroot dpkg rpm xvfb xauth" ;;
    win) dpkg --add-architecture i386; pkgs="wine wine32 wine64" ;; # electron-builder runs rcedit/NSIS under wine
  esac
  if [ -n "$pkgs" ]; then
    timeout 900 apt-get update -qq
    DEBIAN_FRONTEND=noninteractive timeout 1800 apt-get install -y -qq --no-install-recommends $pkgs >/dev/null
  fi
  local gh_name="gh_${GH_VERSION}_linux_amd64"
  timeout 300 curl -fsSL --retry 3 -o "/tmp/$gh_name.tar.gz" \
    "https://github.com/cli/cli/releases/download/v$GH_VERSION/$gh_name.tar.gz"
  echo "$GH_SHA256  /tmp/$gh_name.tar.gz" | sha256sum -c --quiet -
  tar -xzf "/tmp/$gh_name.tar.gz" -C /usr/local --strip-components=1 "$gh_name/bin/gh"
  rm -f "/tmp/$gh_name.tar.gz"
}

# setup: npm ci + bun (scratch prefix, no global install) + the opclib-pack sanity check.
setup() {
  export ELECTRON_CACHE="$PWD/.cache/electron" ELECTRON_BUILDER_CACHE="$PWD/.cache/electron-builder"
  timeout 1800 npm ci --no-audit --no-fund
  timeout 300 npm install --prefix "$PWD/.cache/bun" --no-save --no-audit --no-fund "bun@$BUN_VERSION" >/dev/null
  export PATH="$PWD/.cache/bun/node_modules/.bin:$PATH"
  bun --version
  echo "installed @openpcb/opclib-pack version: $(node -p "require('./node_modules/@openpcb/opclib-pack/package.json').version")"
  if ! grep -q 'signManifest' node_modules/@openpcb/opclib-pack/dist/index.d.ts; then
    echo "FATAL: opclib-pack dist missing signManifest export" >&2
    exit 1
  fi
}

# fetch_corelib <summary.json>: fetch + verify the CoreLibrary release (CORELIB_TAG overrides).
fetch_corelib() {
  if [ -n "${CORELIB_TAG:-}" ]; then
    timeout 900 bun scripts/fetch-core-library.ts "--tag=$CORELIB_TAG" >"$1"
  else
    timeout 900 bun scripts/fetch-core-library.ts >"$1"
  fi
  cat "$1"
}

# stage linux|win|mac|corelib: one GitHub `build` leg (or ci.yml's corelib-trust job).
stage() {
  local platform=$1 out="dist/$1" native
  if [ "$platform" = corelib ]; then
    setup
    fetch_corelib /tmp/corelib.json
    return
  fi
  export CSC_IDENTITY_AUTO_DISCOVERY=false
  rm -rf "$out" electron/out
  mkdir -p "$out"
  setup
  fetch_corelib "$out/corelib.json"
  # Optional native build tools (rollup, lightningcss, oxide) for the machine that builds:
  # linux-x64-gnu in the container, darwin-arm64 on the Mac, whatever the target platform.
  native=$(node -p "process.platform + '-' + process.arch + (process.platform === 'linux' ? '-gnu' : '')")
  local rollup lightningcss oxide
  rollup=$(node -p "require('./package-lock.json').packages['node_modules/rollup'].version")
  lightningcss=$(node -p "require('./package-lock.json').packages['node_modules/lightningcss'].version")
  oxide=$(node -p "require('./package-lock.json').packages['node_modules/@tailwindcss/oxide'].version")
  timeout 600 npm install --no-save --no-audit --no-fund "@rollup/rollup-$native@$rollup" \
    "lightningcss-$native@$lightningcss" "@tailwindcss/oxide-$native@$oxide"
  REF_NAME="$REF_NAME" node <<'NODE'
const fs = require('node:fs');
const rootPackage = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const electronPackage = JSON.parse(fs.readFileSync('electron/package.json', 'utf8'));
const refName = process.env.REF_NAME || '';
if (rootPackage.version !== electronPackage.version) {
  throw new Error(`Root package version ${rootPackage.version} does not match electron package version ${electronPackage.version}`);
}
if (process.env.CI_PIPELINE_EVENT === 'manual') {
  console.log(`Manual release smoke for ${refName} — skipping strict tag/package version match (package version ${electronPackage.version})`);
} else if (refName.startsWith('dev-')) {
  console.log(`Dev tag ${refName} — skipping strict version match (package version ${electronPackage.version})`);
} else {
  const tagVersion = refName.replace(/^v/, '');
  if (tagVersion !== electronPackage.version) {
    throw new Error(`Tag version ${tagVersion} does not match electron package version ${electronPackage.version}`);
  }
  console.log(`Release version ${tagVersion} validated`);
}
NODE
  # Tests and typecheck stay on the Linux leg (ci.yaml covers every PR and push).
  [ "$platform" != linux ] || timeout 1200 npm run typecheck
  timeout 1200 npm run build:frontend
  timeout 600 npm run build --workspace electron
  local archs="--x64"
  [ "$platform" != mac ] || archs="--arm64 --x64" # one run: one latest-mac.yml listing both
  (cd electron && RELEASE_NAME="$REF_NAME" timeout 3600 npx --no-install electron-builder \
    "--$platform" $archs --config electron-builder.cjs --publish never)
  timeout 600 bun scripts/verify-packaged-opclib.ts electron/out
  find electron/out -maxdepth 3 -type f \
    \( -name '*.exe' -o -name '*.dmg' -o -name '*.zip' -o -name '*.AppImage' \
    -o -name '*.deb' -o -name '*.rpm' -o -name 'latest*.yml' \) -print | sort
  local f n=0
  for f in electron/out/*; do
    case $(basename "$f") in
      *.exe | *.dmg | *.zip | *.AppImage | *.deb | *.rpm | latest*.yml) cp "$f" "$out/"; n=$((n + 1)) ;;
    esac
  done
  [ "$n" -gt 0 ] || { echo "release.sh: no build artifacts in electron/out" >&2; exit 1; }
  if [ "$platform" = linux ]; then
    # GitHub's publish-job release notes, with the bundled CoreLibrary from this leg.
    node - "$out/corelib.json" "$out/release-notes.md" <<'NODE'
const fs = require('node:fs');
const [summaryFile, notesFile] = process.argv.slice(2);
const c = JSON.parse(fs.readFileSync(summaryFile, 'utf8'));
fs.writeFileSync(notesFile, `Unsigned beta builds (electron-builder). macOS arm64/x64 dmg+zip, Windows x64 NSIS+portable, Linux x64 AppImage/deb/rpm. Runtime update checks are disabled by default; an operator must explicitly launch with PHICAD_STUDIO_ENABLE_UPDATES=1 to opt in to the attached latest*.yml feeds.

macOS Gatekeeper and Windows SmartScreen will warn on first launch — these builds are not Developer ID signed or notarized. **Verify your download against \`SHA256SUMS.txt\`** (attached): \`sha256sum -c SHA256SUMS.txt --ignore-missing\` on Linux/Windows, \`shasum -a 256 -c SHA256SUMS.txt --ignore-missing\` on macOS.

**Bundled CoreLibrary:** [${c.tag}](https://github.com/OpenPCB-app/CoreLibrary/releases/tag/${c.tag}) — v${c.version} (${c.symbols} symbols, ${c.footprints} footprints, ${c.components} components)
`);
NODE
  fi
}

# smoke-prep (Linux container, root): Chromium's system libs, and the packaged app's
# chrome-sandbox setuid root as the .deb installs it (the container has no user namespaces).
smoke_prep() {
  timeout 1200 npx --no-install playwright install-deps chromium
  chown root:root electron/out/linux-unpacked/chrome-sandbox
  chmod 4755 electron/out/linux-unpacked/chrome-sandbox
}

# smoke (Linux container, as node): the packaged desktop E2E smoke under Xvfb.
smoke() {
  local exe="$PWD/electron/out/linux-unpacked/openpcb"
  test -f "$exe" || { echo "Packaged executable not found: $exe" >&2; exit 1; }
  chmod 755 "$exe"
  echo "OPENPCB_ELECTRON_EXECUTABLE=$exe"
  OPENPCB_ELECTRON_EXECUTABLE="$exe" OPENPCB_E2E_NO_WEBSERVER=1 OPENPCB_ELECTRON_EXPECT_PACKAGED=1 \
    ELECTRON_ENABLE_LOGGING=1 timeout 1800 xvfb-run -a npm run test:e2e:electron
}

# build-mac (macOS agent): the two GitHub macOS legs as one arm64-host build (x64 cross-packaged,
# ad-hoc signed by electron/build/afterSign.cjs). Lean: no tests, caches in the workspace only.
build_mac() {
  : "${GH_TOKEN:?GH_TOKEN must be set (secret github_release_token): fetch-core-library.ts uses gh}"
  export ELECTRON_CACHE="$PWD/.cache/electron" ELECTRON_BUILDER_CACHE="$PWD/.cache/electron-builder"
  export npm_config_cache="$PWD/.cache/npm"
  stage mac
  test -f dist/mac/latest-mac.yml || { echo "release.sh: latest-mac.yml missing" >&2; exit 1; }
  ls -l dist/mac
}

# publish-mac (tag runs, macOS agent, after release.yaml created the release): upload the mac
# assets and merge their hashes into SHA256SUMS.txt.
publish_mac() {
  : "${GH_TOKEN:?GH_TOKEN must be set}" "${CI_COMMIT_TAG:?publish-mac runs on tag events only}"
  export GH_PROMPT_DISABLED=1 GH_NO_UPDATE_NOTIFIER=1
  local f sums=dist/mac-sums assets=""
  rm -rf "$sums"
  mkdir -p "$sums"
  timeout 300 gh release download "$CI_COMMIT_TAG" --repo "$REPO" --pattern SHA256SUMS.txt --dir "$sums"
  for f in dist/mac/*; do
    case $(basename "$f") in
      *.dmg | *.zip)
        assets="$assets $(basename "$f")"
        (cd dist/mac && shasum -a 256 "$(basename "$f")") >>"$sums/mac.txt"
        ;;
    esac
  done
  [ -s "$sums/mac.txt" ] || { echo "release.sh: no mac installers in dist/mac" >&2; exit 1; }
  # Replace this run's names (a rerun), keep the Linux/Windows lines, sort by name.
  awk 'NR==FNR { mine[$2] = 1; print; next } !($2 in mine)' "$sums/mac.txt" "$sums/SHA256SUMS.txt" |
    sort -k2 >"$sums/merged.txt"
  mv "$sums/merged.txt" "$sums/SHA256SUMS.txt"
  cat "$sums/SHA256SUMS.txt"
  (cd dist/mac && timeout 3600 gh release upload "$CI_COMMIT_TAG" --repo "$REPO" --clobber $assets latest-mac.yml)
  timeout 300 gh release upload "$CI_COMMIT_TAG" --repo "$REPO" --clobber "$sums/SHA256SUMS.txt"
}

case "$cmd" in
  build) build "${2:?$usage}" ;;
  publish) publish ;;
  build-mac) build_mac ;;
  publish-mac) publish_mac ;;
  corelib-trust) corelib_trust ;;
  deps) deps "${2:?$usage}" ;;
  stage) stage "${2:?$usage}" ;;
  smoke-prep) smoke_prep ;;
  smoke) smoke ;;
  *) echo "$usage" >&2; exit 1 ;;
esac
