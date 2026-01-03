# Google Play Store Submission Checklist for ThinkRead v1.1

## ✅ Completed

1. **Version Number**: Updated to v1.1
   - `package.json`: 1.1.0
   - `build.gradle`: versionCode 2, versionName "1.1"

2. **Privacy Policy**: Added in-app privacy policy
   - Created `PrivacyPolicy.jsx` component
   - Added "Privacy Policy" link in App Settings drawer
   - Privacy policy explains that all data is stored locally, no data collection

## 🔍 Play Store Requirements to Complete

### 1. Privacy Policy URL (REQUIRED)
- [ ] Create a privacy policy webpage (can use GitHub Pages, your website, etc.)
- [ ] Add the privacy policy URL to Play Console → App Content → Privacy Policy
- [ ] The URL must be publicly accessible and match the in-app policy

### 2. Data Safety Section (REQUIRED)
In Play Console → App Content → Data Safety, declare:
- [ ] **Data Collection**: Select "No, we don't collect any user data"
  - Since all data is stored locally, no data is collected
- [ ] **Data Sharing**: Select "No, we don't share user data"
- [ ] **Security Practices**: Optional - mention that data is stored locally on device
- [ ] **Data Deletion**: Since no data is collected, this doesn't apply

### 3. Permissions Justification
Review permissions in `AndroidManifest.xml`:
- ✅ `READ_EXTERNAL_STORAGE` / `READ_MEDIA_*` - Justified: To read ebook files from device
- ✅ `WRITE_EXTERNAL_STORAGE` (maxSdkVersion 32) - Justified: To save reading progress locally
- ⚠️ `INTERNET` - Consider removing if not used (currently declared but not actively used)

### 4. Target SDK Version
- [ ] Check current `targetSdkVersion` in `variables.gradle`
- [ ] Ensure it's at least API 34 (Android 14) or higher
- [ ] As of 2025, API 35 (Android 15) is recommended for new apps

### 5. App Listing Requirements
- [ ] **App Name**: ThinkRead
- [ ] **Short Description**: (80 characters max)
- [ ] **Full Description**: Detailed description of features
- [ ] **App Icon**: ✅ Already created (1024x1024px)
- [ ] **Feature Graphic**: 1024x500px banner
- [ ] **Screenshots**: 
  - Phone: At least 2, up to 8 (16:9 or 9:16 ratio)
  - Tablet: Optional but recommended
- [ ] **Content Rating**: Complete questionnaire
- [ ] **Category**: Books & Reference

### 6. Content Rating
- [ ] Complete IARC (International Age Rating Coalition) questionnaire
- [ ] Since this is an ebook reader, it should be rated for "Everyone" or similar
- [ ] No age restrictions unless your app requires specific content warnings

### 7. Account Deletion (If Applicable)
- ✅ **Not Required**: ThinkRead doesn't require user accounts
- ✅ All data is stored locally on the device

### 8. 64-bit Support
- ✅ Capacitor/Android apps automatically support 64-bit
- ✅ No additional configuration needed

### 9. Testing
- [ ] Test on multiple Android devices/emulators
- [ ] Test book upload functionality
- [ ] Test reading features
- [ ] Test settings and preferences
- [ ] Test back button behavior
- [ ] Test on different Android versions (minimum SDK to latest)

### 10. Release Management
- [ ] Create a release in Play Console
- [ ] Upload signed APK or AAB (App Bundle recommended)
- [ ] Add release notes for v1.1
- [ ] Choose rollout percentage (start with 20% for testing)
- [ ] Monitor for crashes and user feedback

## 🔒 Security & Privacy Notes

Your app is **privacy-friendly**:
- ✅ All data stored locally on device
- ✅ No network requests (except optional dictionary download from public GitHub)
- ✅ No analytics or tracking
- ✅ No user accounts required
- ✅ No third-party SDKs that collect data

## 📝 Recommended Privacy Policy Content

The in-app privacy policy covers:
- Data collection (none)
- Local storage explanation
- Permissions justification
- No third-party services
- Data security
- Children's privacy (safe for all ages)

Ensure your external privacy policy URL matches this content.

## ⚠️ Important Notes

1. **INTERNET Permission**: Currently declared but not actively used. Consider removing if dictionary download is the only use case (can use user-initiated download).

2. **Storage Permissions**: Required for Android 13+ (API 33+), use scoped storage. Your app should work with `READ_MEDIA_*` permissions on newer Android versions.

3. **Target SDK**: Check `variables.gradle` to ensure you're targeting a recent Android version (API 34+ recommended).

4. **Testing**: Test thoroughly before submitting, especially:
   - Book upload on different Android versions
   - Reading functionality
   - Settings persistence
   - Font upload/usage

## ✅ Ready for Submission?

Before submitting, ensure:
- [ ] Privacy policy URL is created and accessible
- [ ] Data Safety section is completed in Play Console
- [ ] All required screenshots and graphics are uploaded
- [ ] App has been tested on multiple devices
- [ ] Release notes are written
- [ ] Signed release APK/AAB is ready

Good luck with your Play Store submission! 🚀

