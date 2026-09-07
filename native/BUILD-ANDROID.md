# Building Arete for Android

Everything below is already installed on this machine. This file exists so the
setup can be reproduced, and so the one genuinely unrecoverable piece is
written down somewhere other than a chat log.

## Toolchain

| | |
|---|---|
| JDK | Temurin **21** at `~/devtools/jdk-21*` |
| Android SDK | `~/devtools/android-sdk` (platform 35, build-tools 35 + 34) |

JDK 21, not 17. AGP 8.7 only requires 17, but Capacitor 7's own Android module
compiles at source level 21, so 17 fails with `invalid source release: 21`.

```bash
export JAVA_HOME=$(find ~/devtools -maxdepth 1 -name "jdk-21*" -type d | head -1)/Contents/Home
export ANDROID_HOME=~/devtools/android-sdk
export PATH="$JAVA_HOME/bin:$PATH"
```

## Build

```bash
cd native && sh sync-www.sh          # copy the web app into the shell first
cd android
./gradlew assembleDebug              # APK, for installing on a device
./gradlew bundleRelease              # AAB, for the Play Store
```

Output lands in `app/build/outputs/`.

## Signing — read this part

The upload key is at `~/devtools/arete-signing/`, deliberately outside this
repository. A signing key committed to a public repo lets anyone publish an
update as you.

**Back up that folder somewhere safe, off this machine.** It holds both the
keystore and its password. If the Mac dies and the folder is gone with it, you
cannot upload another build under this key.

That is survivable but only because of Play App Signing: Google holds the real
app signing key and this is just the *upload* key, so a lost upload key can be
reset through Play Console support. Without Play App Signing it would be
terminal — the app could never be updated again by anyone.

`app/build.gradle` reads the keystore from that path and falls back to an
unsigned release if the file is missing, so a fresh clone still builds.

## Before the first upload

- `versionCode` and `versionName` are still `1` / `1.0` in `app/build.gradle`.
  Play rejects a re-upload of an existing `versionCode`, so bump it every time.
- The Play Console developer registration is a one-time $25 fee.
- Play App Signing should be left enabled — see above for why it matters.
