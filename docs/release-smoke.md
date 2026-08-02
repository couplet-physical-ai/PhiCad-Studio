# Release smoke — per-OS install, launch and verification

Manual runbook for verifying a release build on each supported platform. Run it after every release
workflow run, on a **fresh user account** wherever possible, because the failure modes this catches
— quarantine, missing runtime, protocol registration, first-run database creation — are exactly the
ones a developer machine hides.

Builds are unsigned, so this runbook also documents what an ordinary user will see and what they
have to do about it. The user-facing version of those steps lives in
[`../electron/README-BETA-INSTALL.md`](../electron/README-BETA-INSTALL.md); keep the two consistent.

## Trigger a build

```bash
gh workflow run release.yml -f artifact_suffix=smoke
gh run watch
```

When the matrix completes, download the artifacts from the run page or with
`gh run download <run-id>`. Expect six: `openpcb-mac-arm64`, `openpcb-mac-x64`, `openpcb-win-x64`,
`openpcb-linux-x64-AppImage`, `openpcb-linux-x64-deb`, `openpcb-linux-x64-rpm`.

## Checksums — do this first, on every platform

`SHA256SUMS.txt` ships with the release. Verify before installing anything; a mismatch stops the
smoke run.

```bash
# macOS / Linux
shasum -a 256 -c SHA256SUMS.txt --ignore-missing
```

```powershell
# Windows PowerShell — compare against the matching line in SHA256SUMS.txt
Get-FileHash .\OpenPCB-Setup-*.exe -Algorithm SHA256
```

`--ignore-missing` skips entries for the platforms you did not download.

## macOS (.dmg, arm64 and x64)

1. Open the `.dmg` and drag `OpenPCB.app` to `Applications`.
2. First launch is blocked — the build is neither Developer ID signed nor notarized. Either:
   - right-click the app, choose **Open**, then confirm **Open** again; or
   - `System Settings → Privacy & Security → Open Anyway`; or, for technical testers,
     `xattr -dr com.apple.quarantine "/Applications/OpenPCB.app"`.
3. The app launches and the home screen is visible.
4. Create a design, place a part, route a trace, run DRC, export a manufacturing ZIP, open the 3D
   preview. Quit and relaunch; the design is still there.
5. Confirm the update check reports a notify-only result and links to the latest release —
   in-place auto-update is not available on macOS.

Gatekeeper re-quarantines on every fresh download, so step 2 is required on each new build until
signing and notarization land. That is expected, not a regression.

## Windows (NSIS `Setup.exe`)

1. Run the installer. **SmartScreen will warn** because the binary is unsigned: the dialog reads
   "Windows protected your PC". Click **More info**, then **Run anyway**. If the file came from a
   browser download, Windows may also mark it blocked — right-click the `.exe`, choose
   **Properties**, tick **Unblock**, and apply.
2. Step through the installer and launch the app.
3. The app launches and the home screen is visible.
4. Create a design, place a part, route a trace, run DRC, export a manufacturing ZIP, open the 3D
   preview. Quit and relaunch; the design is still there.
5. Install a prior release first if you are testing the update path, then confirm in-place
   auto-update finds and applies this build.

The portable `.exe` does not register the URL protocol globally — use the NSIS installer for smoke
runs.

## Linux (AppImage, .deb, .rpm)

1. AppImage: `chmod +x ./OpenPCB-*.AppImage && ./OpenPCB-*.AppImage`.
   For `.deb` / `.rpm`, install through the system package manager.
2. The app launches and the home screen is visible.
3. Create a design, place a part, route a trace, run DRC, export a manufacturing ZIP, open the 3D
   preview. Quit and relaunch; the design is still there.
4. Confirm in-place auto-update works for the AppImage build.

AppImage desktop integration is desktop-environment dependent. If handler registration does not
survive a reboot, install the `.deb` or `.rpm` instead — those use the system `.desktop`
registration.

## Deep-link verification (only once teams and sharing ship)

The `openpcb://` protocol handler exists for invite links, which belong to the teams and sharing
feature. **Desktop integration for that feature is not shipped**, so this section is not part of
the pass criteria today. Run it, and treat it as blocking, only once shared designs are a user-
visible feature.

| Platform | Command                                                    |
| -------- | ---------------------------------------------------------- |
| macOS    | `open 'openpcb://invite?token=smoke'`                       |
| Linux    | `xdg-open 'openpcb://invite?token=smoke'`                   |
| Windows  | `start "" "openpcb://invite?token=smoke"` — from `cmd`, not PowerShell, which mangles `://` |

Expected in each case: OpenPCB comes to the foreground and the Accept Invite modal opens in the
already-running app. Register the handler by launching the installed build at least once first.

## Pass criteria

- Checksums verify on every downloaded artifact.
- All three platforms install and launch from a clean account.
- The design round-trip in each platform section completes: create, place, route, DRC, export,
  3D preview, restart, data intact.
- Auto-update applies in place on Windows and Linux; macOS reports notify-only.
- No crash reports appear in `~/Library/Logs/DiagnosticReports/` (macOS),
  `~/.config/OpenPCB/logs/` (Linux) or `%APPDATA%\OpenPCB\logs\` (Windows).
- Deep-link behaviour, **only once teams and sharing ship**.

## Known issues to expect

- **macOS Gatekeeper** re-quarantines each downloaded build; the right-click-Open or `xattr` step is
  required until the app is signed and notarized.
- **Windows SmartScreen** warns on every unsigned installer, and browsers may additionally mark the
  download blocked.
- **Windows portable `.exe`** does not register the URL protocol globally.
- **Linux AppImage** integration varies by desktop environment; the `.deb` and `.rpm` packages are
  the reliable path when handler registration matters.
