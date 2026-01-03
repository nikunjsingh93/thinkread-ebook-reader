# Installing the Android APK

## Debug APK (Recommended for Testing)

The debug APK is automatically signed and ready to install:

**Location:** `web/android/app/build/outputs/apk/debug/app-debug.apk` (4.6 MB)

### Installation Steps:

1. **Enable "Install from Unknown Sources" on your Android device:**
   - Go to Settings > Security (or Settings > Apps > Special access)
   - Enable "Install unknown apps" or "Unknown sources"
   - Or when you try to install, Android will prompt you to allow the file manager

2. **Transfer the APK to your device:**
   - Via USB: `adb install web/android/app/build/outputs/apk/debug/app-debug.apk`
   - Via email/cloud: Send the APK file to yourself and download on device
   - Via file manager: Copy to device storage and open with file manager

3. **Install:**
   - Open the APK file on your device
   - Tap "Install"
   - If prompted about security, tap "Install anyway" or "Allow"

### Using ADB (Android Debug Bridge):

If you have ADB installed and USB debugging enabled:

```bash
cd web/android
adb install app/build/outputs/apk/debug/app-debug.apk
```

## Release APK (For Distribution)

The release APK needs to be signed. To create a signed release APK:

### Option 1: Quick Sign with Debug Keystore (for testing)

```bash
cd web/android
jarsigner -verbose -sigalg SHA256withRSA -digestalg SHA-256 -keystore ~/.android/debug.keystore -storepass android -keypass android app/build/outputs/apk/release/app-release-unsigned.apk androiddebugkey
zipalign -v 4 app/build/outputs/apk/release/app-release-unsigned.apk app/build/outputs/apk/release/app-release-signed.apk
```

### Option 2: Create Your Own Keystore (for production)

1. Generate a keystore:
```bash
keytool -genkey -v -keystore thinkread-release-key.jks -keyalg RSA -keysize 2048 -validity 10000 -alias thinkread
```

2. Sign the APK:
```bash
cd web/android
jarsigner -verbose -sigalg SHA256withRSA -digestalg SHA-256 -keystore ../thinkread-release-key.jks app/build/outputs/apk/release/app-release-unsigned.apk thinkread
zipalign -v 4 app/build/outputs/apk/release/app-release-unsigned.apk app/build/outputs/apk/release/app-release-signed.apk
```

## Troubleshooting

### "App not installed - appears to be invalid"
- Make sure you're using the **debug APK** (`app-debug.apk`), not the unsigned release APK
- Enable "Install from unknown sources" in device settings
- Try uninstalling any previous version first: `adb uninstall com.thinkread.app`

### "Package appears to be corrupt"
- Rebuild the APK: `cd web/android && ./gradlew clean assembleDebug`
- Make sure the APK file wasn't corrupted during transfer

### "App not installed - package conflicts with existing package"
- Uninstall the existing app first
- Or change the package name in `web/android/app/build.gradle` (applicationId)

## Current APK Files

- **Debug APK (Ready to install):** `web/android/app/build/outputs/apk/debug/app-debug.apk`
- **Release APK (Unsigned):** `web/android/app/build/outputs/apk/release/app-release-unsigned.apk`

Use the **debug APK** for testing - it's automatically signed and ready to install!

