/**
 * Catalogue of StoreLint checks, hardcoded from docs/STORELINT-SPEC.md ("Checks (minimum set)").
 * Served by the free `storelint_checks` tool.
 */
export interface CheckInfo {
  id: string;
  platform: "android" | "ios" | "both";
  severity: "blocker" | "warning" | "info";
  catches: string;
}

export const CHECKS: readonly CheckInfo[] = [
  // Android
  { id: "android.target-sdk", platform: "android", severity: "blocker", catches: "targetSdk < 35 (blocker); compileSdk < 35 (warning). Play requires API 35." },
  { id: "android.page-size-16kb", platform: "android", severity: "blocker", catches: "AGP < 8.5.1 or NDK < r28 while native deps exist (Flutter always has native). 16 KB page-size support is enforced for apps targeting Android 15+ since Nov 2025." },
  { id: "android.min-sdk", platform: "android", severity: "warning", catches: "minSdk < 21." },
  { id: "android.application-id", platform: "android", severity: "blocker", catches: "applicationId still com.example.*." },
  { id: "android.debug-signing", platform: "android", severity: "blocker", catches: "release buildType uses signingConfigs.debug or has no signingConfig." },
  { id: "android.keystore-in-repo", platform: "android", severity: "blocker", catches: "*.jks / *.keystore / key.properties tracked by git (secret leak)." },
  { id: "android.cleartext", platform: "android", severity: "warning", catches: "usesCleartextTraffic=\"true\" in the manifest." },
  { id: "android.exported", platform: "android", severity: "blocker", catches: "<activity|service|receiver> with an intent-filter but no android:exported (install fails on API 31+)." },
  { id: "android.play-core-legacy", platform: "android", severity: "warning", catches: "Legacy com.google.android.play:core dependency (rejected for SDK 34+)." },
  { id: "android.ads-id", platform: "android", severity: "warning", catches: "AD_ID permission declared without an ads SDK, or an ads SDK (AdMob/Facebook) present without the permission." },
  { id: "android.permissions-dangerous", platform: "android", severity: "info", catches: "Lists dangerous permissions in use, for the Data Safety form." },
  { id: "android.version-code", platform: "android", severity: "info", catches: "versionCode missing or flutterVersionCode fallback = 1." },
  { id: "android.proguard", platform: "android", severity: "warning", catches: "minifyEnabled true but no proguard-rules.pro." },
  { id: "android.play-billing", platform: "android", severity: "blocker", catches: "com.android.billingclient below the version Play currently requires (6.0.1+ since Aug 2025, 7+ for new apps in 2026)." },
  // iOS
  { id: "ios.deployment-target", platform: "ios", severity: "warning", catches: "IPHONEOS_DEPLOYMENT_TARGET < 13 (warning); < 12 (blocker)." },
  { id: "ios.privacy-manifest", platform: "ios", severity: "blocker", catches: "No PrivacyInfo.xcprivacy under ios/ (required since May 2024)." },
  { id: "ios.required-reason-apis", platform: "ios", severity: "warning", catches: "PrivacyInfo.xcprivacy exists but declares no NSPrivacyAccessedAPITypes while the app uses UserDefaults." },
  { id: "ios.usage-descriptions", platform: "ios", severity: "blocker", catches: "A plugin implies camera/photos/location/mic/contacts/bluetooth/Face ID but Info.plist lacks the matching NS*UsageDescription." },
  { id: "ios.encryption-flag", platform: "ios", severity: "info", catches: "ITSAppUsesNonExemptEncryption missing from Info.plist (export-compliance prompt on every upload)." },
  { id: "ios.ats", platform: "ios", severity: "warning", catches: "NSAllowsArbitraryLoads=true." },
  { id: "ios.bundle-id", platform: "ios", severity: "blocker", catches: "Bundle id still com.example.* or org.reactjs.native.example.*." },
  { id: "ios.xcode-version", platform: "ios", severity: "warning", catches: "Project objectVersion/LastUpgradeCheck implies Xcode < 16; Xcode 26 / iOS 26 SDK required for submissions since Apr 28 2026." },
  { id: "ios.push-entitlement", platform: "ios", severity: "blocker", catches: "Firebase Messaging / expo-notifications / OneSignal present but no aps-environment entitlement." },
  { id: "ios.launch-screen", platform: "ios", severity: "warning", catches: "No LaunchScreen.storyboard referenced." },
  // Cross-platform
  { id: "app.secrets", platform: "both", severity: "blocker", catches: "API keys in tracked source (AIza..., sk_live_, sk_test_, AKIA..., -----BEGIN PRIVATE KEY)." },
  { id: "app.dotenv-tracked", platform: "both", severity: "blocker", catches: ".env* files tracked by git." },
  { id: "app.placeholder-config", platform: "both", severity: "warning", catches: "YOUR_API_KEY, TODO, localhost or 10.0.2.2 in release config files." },
  { id: "app.icons", platform: "both", severity: "warning", catches: "Android adaptive icon or iOS AppIcon set incomplete (e.g. missing 1024 marketing icon)." },
  { id: "app.name", platform: "both", severity: "info", catches: "Display name still a default (flutter_app, MyApp, app)." },
  { id: "app.version-mismatch", platform: "both", severity: "info", catches: "pubspec/app.json version differs from native versions when not managed by the build." },
  { id: "app.flutter-version", platform: "both", severity: "warning", catches: "Flutter < 3.19." },
  { id: "app.rn-version", platform: "both", severity: "warning", catches: "React Native < 0.73." },
  { id: "app.expo", platform: "both", severity: "blocker", catches: "app.json missing ios.bundleIdentifier / android.package (blocker); expo SDK < 51 (warning)." },
];
