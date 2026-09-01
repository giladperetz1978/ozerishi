# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- OZERISHI

OZERISHI is a React/Vite app with a Node.js Gemini backend and an Android WebView wrapper. It is separate from the legacy RemindMe project.

## Requirements

- Node.js 20 or newer
- Android Studio or Android SDK platform 36 and build-tools
- Java 17 or newer
- A Gemini API key for the backend

## Restore on another computer

```bash
git clone <OZERISHI-repository-url>
cd OS
npm install
cd server
npm install
cd ..
```

Copy `server/.env.example` to `server/.env` and fill in the settings. Never commit `.env` or server key files.

## Run the server

```bash
cd server
npm start
```

The server normally listens on port `8787`.

## Build web assets into Android

From the repository root in PowerShell:

```powershell
npm.cmd run build
Copy-Item -Path .\dist\* -Destination .\android\app\src\main\assets -Recurse -Force
$html = Get-Content .\android\app\src\main\assets\index.html -Raw
$html = $html -replace '<script type="module" crossorigin src="([^"]+)"></script>', '<script defer src="$1"></script>'
Set-Content -Path .\android\app\src\main\assets\index.html -Value $html -NoNewline
```

The relative paths and deferred script tag are required by the Android `file:///android_asset` WebView.

## Build the APK

```powershell
Set-Location android
& .\gradlew.bat clean assembleDebug --no-daemon --console=plain
Get-Item .\app\build\outputs\apk\debug\app-debug.apk | Format-List FullName,Length,LastWriteTime
```

The APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`. Increase `versionCode` and `versionName` in `android/app/build.gradle` before distributing a new build. On Linux/macOS use `./gradlew clean assembleDebug --no-daemon --console=plain`.

## Android setup

Allow microphone permission when prompted. For notification-based Outlook scanning, enable OZERISHI under Android Settings > Notification access. The Android UI does not require Outlook OAuth login.

## Git backup

```bash
git status
git add README.md server android src public package.json package-lock.json
git commit -m "Backup OZERISHI app and Android build instructions"
git push origin main
```

Do not commit `.env`, `node_modules`, `dist`, Android build output, or server key files. The APK can be rebuilt from tracked source using the commands above.
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
