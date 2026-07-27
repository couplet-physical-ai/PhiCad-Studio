# OpenPCB macOS Beta Install

This is an unsigned/ad-hoc-signed beta build. macOS will warn that the developer cannot be
verified: the build is not Developer ID signed and is not notarized.

## Open the app

1. Move `OpenPCB.app` to `Applications`.
2. Right-click the app.
3. Click `Open`.
4. Confirm `Open` again.

If macOS still blocks it, open `System Settings` → `Privacy & Security` → `Open Anyway`.

Technical testers can also remove quarantine:

```bash
xattr -dr com.apple.quarantine "/Applications/OpenPCB.app"
open "/Applications/OpenPCB.app"
```

## Verify download checksum

Every release attaches `SHA256SUMS.txt`. Download it next to the installer, then:

```bash
shasum -a 256 -c SHA256SUMS.txt --ignore-missing
```

`--ignore-missing` skips the entries for platforms you did not download. To check a single file by
hand instead:

```bash
shasum -a 256 OpenPCB-v0.1.1-beta-arm64.dmg
```

and compare the output against the matching line in `SHA256SUMS.txt`.

## Auto-update

Auto-update is **not** available on macOS: Squirrel.Mac rejects the ad-hoc signature, so the app
falls back to a notify-only check that links to the latest GitHub release. Windows (NSIS installer)
and Linux (AppImage) update in place. macOS auto-update lands with Developer ID signing.
