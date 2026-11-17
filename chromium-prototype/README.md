# Chromium compatibility experiment

This directory is an isolated compatibility experiment, not a finished RightTab browser or a source-built Chromium fork. It uses the official unbranded Chromium macOS arm64 snapshot 1737016 (Chromium 159.0.8146.0), built from `4094fb9d093e9fdc7b1c79921decf607c14d9506`. It is a full Chromium browser, not Electron. It uses Chromium's app identity, UI, and security behavior; the launcher has a separate profile. It does not auto-update and is unsuitable for everyday browsing. The snapshot is ad-hoc signed, not a production release; platform authentication features may be unavailable.

## Run

On Apple Silicon macOS, from the repository root:

```sh
chromium-prototype/bin/fetch-chromium
chromium-prototype/bin/righttab-chromium "$HOME/Library/Application Support/RightTab/Extensions/dac9adf2-78f7-44c1-aa8d-479deb5408d4"
```

The existing copy of the extension is read directly and is not edited. The `key` in its manifest preserves its extension ID. A separate profile is stored in `chromium-prototype/profile`; do not commit, copy over, or delete it while the browser is running. The archive is downloaded from Chromium's official snapshot storage and checked against the pinned MD5 provided by that storage. MD5 detects accidental corruption here; it is not a cryptographic signature. No browser identity is impersonated and no remote-debugging port is enabled by the launcher.

For a harmless test page, run `python3 -m http.server 8765 --bind 127.0.0.1 --directory chromium-prototype/test-page`, then navigate to `http://127.0.0.1:8765/`. Ask the extension to read the heading, click the button, and type in the input. This has not yet succeeded with the extension.

## Reproducing a source build

A source build was not attempted: this machine had 22 GiB free, less than the roughly 30 GB Git cache alone described in Chromium's Mac instructions. A checkout, dependencies, and output require additional space. Use a separate APFS volume with ample free space, Xcode and its compatible SDK, and follow [Chromium's current Mac instructions](https://chromium.googlesource.com/chromium/src/+/main/docs/mac_build_instructions.md). From a path without spaces on that volume:

```sh
git clone https://chromium.googlesource.com/chromium/tools/depot_tools.git
export PATH="$PATH:$PWD/depot_tools"
mkdir chromium && cd chromium
fetch --no-history chromium
cd src
git fetch origin 4094fb9d093e9fdc7b1c79921decf607c14d9506
git checkout --detach 4094fb9d093e9fdc7b1c79921decf607c14d9506
gclient sync -D
mkdir -p out/RightTab
cp /absolute/path/to/righttab/chromium-prototype/args.gn out/RightTab/args.gn
gn gen out/RightTab
autoninja -C out/RightTab chrome
out/RightTab/Chromium.app/Contents/MacOS/Chromium --user-data-dir=/absolute/path/to/a/new/test-profile
```

This is a prepared configuration, not a verified build or a RightTab-branded executable. The checkout's toolchain/SDK compatibility and build command must be verified on the build machine. A production fork still requires its own bundle identity, signing, update mechanism, and UI integration.

## Data migration status

No import has been implemented. Existing RightTab settings, bookmarks, and saved sessions remain in the original profile and need a versioned, previewable importer after the target browser's profile and UI formats are established. Electron cookies, passwords, logins, and extension storage must not be assumed portable: encryption, application identity, storage formats and service-side session policies need separate investigation. Reauthenticate where required. The original app and profile remain the rollback path.
