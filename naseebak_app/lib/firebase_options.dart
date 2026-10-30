import 'package:firebase_core/firebase_core.dart';

/// Firebase project `naseebak-app` (push). Android reads android/app/google-services.json; iOS uses these options,
/// so no GoogleService-Info.plist has to be added to the Xcode project. Client identifiers, not secrets.
const iosFirebaseOptions = FirebaseOptions(
  apiKey: 'AIzaSyAt4ue4GPu0RDnN-h5ZBR-1vCIXUmbcJ3g',
  appId: '1:215267934979:ios:d9d9a949811cfb90569f36',
  messagingSenderId: '215267934979',
  projectId: 'naseebak-app',
  storageBucket: 'naseebak-app.firebasestorage.app',
  iosBundleId: 'com.naseebak.naseebakApp',
);
