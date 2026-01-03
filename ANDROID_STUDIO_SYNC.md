# How to Sync Changes in Android Studio

After making changes to your web code, follow these steps:

## Method 1: Using Terminal (Recommended)

1. **Build the web app:**
   ```bash
   cd web
   npm run build
   ```

2. **Sync to Android:**
   ```bash
   npx cap sync android
   ```

3. **Rebuild in Android Studio:**
   - Open Android Studio
   - Click "Build" → "Rebuild Project" (or press `Cmd+Shift+F9` on Mac, `Ctrl+Shift+F9` on Windows/Linux)
   - Or click the "Run" button to build and install

## Method 2: Using Android Studio

1. **Build the web app first:**
   ```bash
   cd web
   npm run build
   ```

2. **In Android Studio:**
   - Open the project: `web/android/`
   - Wait for Gradle sync to complete
   - Click "Build" → "Rebuild Project"
   - Or use "Run" → "Run 'app'" to build and install

## Method 3: Automatic Sync (if configured)

Some setups allow automatic syncing, but manual sync is more reliable:

```bash
cd web
npm run build
npx cap sync android
```

Then rebuild in Android Studio.

## Important Notes

- **Always run `npm run build` first** - This compiles your React/JS code
- **Then run `npx cap sync android`** - This copies the built files to Android
- **Finally rebuild in Android Studio** - This creates the APK with your changes

## Troubleshooting

If changes don't appear:
1. Make sure you ran `npm run build` (check `web/dist/` folder exists and is updated)
2. Make sure you ran `npx cap sync android` (check `web/android/app/src/main/assets/public/` is updated)
3. Clean and rebuild in Android Studio: "Build" → "Clean Project", then "Build" → "Rebuild Project"
4. Uninstall the app from your device/emulator and reinstall

## Quick Command (All-in-one)

```bash
cd web && npm run build && npx cap sync android && echo "✅ Sync complete! Now rebuild in Android Studio"
```

