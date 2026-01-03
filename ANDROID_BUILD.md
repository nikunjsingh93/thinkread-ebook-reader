# Android Build Instructions

## Prerequisites

1. **Java Development Kit (JDK) 21 or later**
   - Install via Homebrew: `brew install openjdk@21`
   - Or download from: https://adoptium.net/
   - Set JAVA_HOME: `export JAVA_HOME=$(/usr/libexec/java_home -v 21)`

2. **Android Studio** (optional, but recommended)
   - Download from: https://developer.android.com/studio
   - Includes Android SDK and build tools

3. **Android SDK** (if not using Android Studio)
   - Install via Homebrew: `brew install --cask android-sdk`
   - Set ANDROID_HOME: `export ANDROID_HOME=$HOME/Library/Android/sdk`

## Building the APK

### Option 1: Using Android Studio (Recommended)

1. Open Android Studio
2. Select "Open an Existing Project"
3. Navigate to `web/android` and open it
4. Wait for Gradle sync to complete
5. Go to **Build > Build Bundle(s) / APK(s) > Build APK(s)**
6. The APK will be generated at: `web/android/app/build/outputs/apk/release/app-release.apk`

### Option 2: Using Command Line

1. Set up environment variables:
   ```bash
   export JAVA_HOME=$(/usr/libexec/java_home -v 21)
   export ANDROID_HOME=$HOME/Library/Android/sdk
   export PATH=$PATH:$ANDROID_HOME/tools:$ANDROID_HOME/platform-tools
   ```

2. Navigate to the Android project:
   ```bash
   cd web/android
   ```

3. Build the APK:
   ```bash
   ./gradlew assembleRelease
   ```

4. The APK will be at: `web/android/app/build/outputs/apk/release/app-release.apk`

### Option 3: Using Capacitor CLI

1. Build the web app:
   ```bash
   cd web
   npm run build
   ```

2. Sync with Capacitor:
   ```bash
   npx cap sync android
   ```

3. Open in Android Studio:
   ```bash
   npx cap open android
   ```

4. Build APK from Android Studio (see Option 1)

## Signing the APK (for Release)

For a release build, you'll need to sign the APK:

1. Generate a keystore:
   ```bash
   keytool -genkey -v -keystore thinkread-release-key.jks -keyalg RSA -keysize 2048 -validity 10000 -alias thinkread
   ```

2. Create `web/android/key.properties`:
   ```
   storePassword=your-store-password
   keyPassword=your-key-password
   keyAlias=thinkread
   storeFile=../thinkread-release-key.jks
   ```

3. Update `web/android/app/build.gradle` to use the keystore (see Android documentation)

## Current Status

✅ Capacitor initialized
✅ Android platform added
✅ App icons created
✅ Permissions configured
✅ Web app built and synced

⚠️  Java/JDK required to build APK
⚠️  Android SDK required to build APK

## Next Steps

1. Install Java JDK 21+
2. Install Android SDK (via Android Studio or standalone)
3. Build the APK using one of the methods above

## Troubleshooting

- **Java not found**: Install JDK 21+ and set JAVA_HOME
- **Android SDK not found**: Install Android Studio or Android SDK
- **Gradle sync fails**: Check Java version and Android SDK path
- **Build fails**: Check error messages and ensure all dependencies are installed

