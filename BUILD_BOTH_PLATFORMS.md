# Build for Both iOS and Android

## Step-by-Step Guide

### 1. Login to EAS (One-time setup)
```bash
eas login
```

Enter your Expo credentials or create a new account at https://expo.dev/signup

### 2. Configure EAS Build (One-time setup)
```bash
cd /Users/naomicollins/Desktop/MyFirstApp-Router/MyAPP/MyApp
eas build:configure
```

This will create/update your `eas.json` file.

### 3. Build for iOS
```bash
# Preview build (for testing on device)
eas build --platform ios --profile preview

# OR Production build (for App Store)
eas build --platform ios --profile production
```

### 4. Build for Android
```bash
# Preview build (for testing on device)
eas build --platform android --profile preview

# OR Production build (for Google Play Store)
eas build --platform android --profile production
```

### 5. Build for BOTH at once
```bash
# Preview builds for both platforms
eas build --platform all --profile preview

# OR Production builds for both platforms
eas build --platform all --profile production
```

## What You'll Get

### iOS Build
- **File type**: .ipa
- **How to install**:
  - Download from EAS build page
  - Use Apple Configurator or TestFlight
  - Or install directly via EAS CLI: `eas build:run --platform ios`
- **Liquid Glass Effect**: ✅ Works on iOS 18+ devices with native UITabBarController

### Android Build
- **File type**: .apk or .aab
- **How to install**:
  - Download .apk from EAS build page
  - Transfer to Android device and install
  - Or install directly via EAS CLI: `eas build:run --platform android`
- **Material Design**: ✅ Native Android tab bar with Material Design 3

## Quick Commands

### Build both platforms (recommended)
```bash
eas build --platform all --profile preview
```

### Build only iOS
```bash
eas build --platform ios --profile preview
```

### Build only Android
```bash
eas build --platform android --profile preview
```

### Check build status
```bash
eas build:list
```

### Download and install builds
```bash
# iOS
eas build:run --platform ios --latest

# Android
eas build:run --platform android --latest
```

## Build Profiles Explained

Your `eas.json` already has these profiles:

- **`preview`**: For testing on real devices (internal distribution)
- **`production`**: For App Store/Google Play submission

## Cost

- **Free tier**: 30 builds per month
- **Builds take**: 10-20 minutes each
- **Both platforms**: Can build simultaneously

## Next Steps After Build Completes

1. **iOS**: Install .ipa on iPhone
   - See Liquid Glass tabs on iOS 18+

2. **Android**: Install .apk on Android device
   - See Material Design tabs

3. **Submit to stores** (optional):
   ```bash
   eas submit --platform ios
   eas submit --platform android
   ```

## Need Help?

Run this to get started:
```bash
eas login
eas build --platform all --profile preview
```

The builds will run on Expo's cloud servers and you'll get download links when they're done!
