# Initial admin provisioning

The public `/api/auth/set-role` route does not provide a bootstrap-secret path. Use a trusted project operator to provision the first admin directly through the Firebase Console for the intended Firebase project, or through already-approved Firebase Admin tooling. Do not send a bootstrap secret to the application endpoint.

1. The operator confirms the intended Firebase project in the Console and creates or identifies the admin's Firebase Authentication account.
2. Before that account signs in to Casaio for the first time, the operator creates `users/{authUid}` in Firestore. Use the Authentication UID exactly as the document ID and `uid` value.
3. Populate the required profile fields from `UserProfile` and the Firestore create rules: `uid`, `email`, `displayName`, `role: "admin"`, `status: "active"`, `createdAt`, and `updatedAt`. Use ISO timestamp strings. `photoURL` is optional.
4. The operator verifies the account UID and profile in the selected project, then asks the admin to sign in through the normal Casaio flow. The session route reads the Firestore profile role; Firebase custom claims are not required for server authorization.

This procedure uses existing project access and schema only; it does not define credentials or grant new project access. Require the project's normal operator approval and account security controls before performing it.
