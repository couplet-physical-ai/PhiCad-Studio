# OpenPCB Beta Install Guide

Beta builds are **not code-signed**. macOS reports that the developer cannot be verified, and
Windows SmartScreen warns before it will run the installer. Both are expected, both have a
workaround below, and the checksum published with every release is the real integrity check in the
meantime.

Signing and notarization are deferred while OpenPCB is a solo beta — see
[`../ROADMAP.md`](../ROADMAP.md) for the position and the triggers that revisit it.

## Verify your download first

Every release attaches `SHA256SUMS.txt`. Download it next to the installer and check it before you
run anything.

macOS and Linux:

```bash
shasum -a 256 -c SHA256SUMS.txt --ignore-missing
```

`--ignore-missing` skips the entries for platforms you did not download. To check a single file by
hand, run `shasum -a 256 <file>` and compare the output against the matching line.

Windows PowerShell:

```powershell
Get-FileHash .\OpenPCB-Setup-*.exe -Algorithm SHA256
```

Compare the printed hash against the matching line in `SHA256SUMS.txt`. If it does not match, do not
install the file.

## macOS

1. Open the `.dmg` and move `OpenPCB.app` to `Applications`.
2. Right-click the app.
3. Choose **Open**.
4. Confirm **Open** again.

If macOS still refuses, open `System Settings` → `Privacy & Security` and use **Open Anyway**.

Technical testers can remove the quarantine attribute instead:

```bash
xattr -dr com.apple.quarantine "/Applications/OpenPCB.app"
open "/Applications/OpenPCB.app"
```

macOS re-applies quarantine to each newly downloaded build, so this is needed once per update.

## Windows

1. Run the downloaded `Setup.exe`.
2. SmartScreen shows a blue dialog: **"Windows protected your PC"**. Click **More info**, then
   **Run anyway**.
3. Step through the installer and launch OpenPCB.

If Windows will not run the installer at all, the file may be marked as blocked by the browser that
downloaded it. Right-click the `.exe`, choose **Properties**, tick **Unblock** at the bottom of the
General tab, apply, and try again.

Prefer the NSIS `Setup.exe` over the portable build — the portable executable does not register the
`openpcb://` URL handler.

## Linux

The AppImage needs to be made executable before it will run:

```bash
chmod +x ./OpenPCB-*.AppImage
./OpenPCB-*.AppImage
```

The `.deb` and `.rpm` packages install through your system package manager and register the desktop
entry and URL handler through the system, which is more reliable than AppImage integration on some
desktop environments.

## Auto-update

- **Windows** (NSIS installer) and **Linux** (AppImage) update in place.
- **macOS does not.** Squirrel.Mac rejects the ad-hoc signature, so the app falls back to a
  notify-only check that links to the latest GitHub release; install new macOS versions manually.
  In-place macOS updates land with Developer ID signing.

## If something goes wrong

Logs are written under the app's user-data directory — `~/.config/OpenPCB/logs/` (Linux),
`%APPDATA%\OpenPCB\logs\` (Windows), and the OpenPCB folder under `~/Library/Logs/` (macOS).
Include the relevant portion, your OS and the app version from `Help → About` when reporting an
issue.

Maintainers verifying a release across all three platforms should follow
[`../docs/release-smoke.md`](../docs/release-smoke.md), which covers the same steps plus the full
per-OS acceptance checklist.
