# Apple Sign-In Setup (Firebase + App Store)

Date: 2026-02-11

## Current status in code

- Apple login is already implemented in app code.
- It is controlled by env flag:
  - `VITE_ENABLE_APPLE_SIGN_IN=false` (default)
  - set `VITE_ENABLE_APPLE_SIGN_IN=true` to show the button.

## Prerequisites

- Active Apple Developer Program membership (Apple charges annual fee).
- Firebase project with Authentication enabled.

## Step-by-step configuration

1. Apple Developer: create/update App ID

- Go to Apple Developer > Certificates, IDs & Profiles > Identifiers.
- Open your app identifier (bundle id) and enable `Sign In with Apple`.

2. Apple Developer: create Service ID (for web auth flow used by Firebase)

- In Identifiers, create `Service IDs`.
- Enable `Sign In with Apple` on that Service ID.
- Configure Domains and Return URLs:
  - Domain: `<your-firebase-project-id>.firebaseapp.com`
  - Return URL: `https://<your-firebase-project-id>.firebaseapp.com/__/auth/handler`

3. Apple Developer: create key for Sign In with Apple

- Go to Keys > create a new key.
- Enable `Sign In with Apple`.
- Download `.p8` private key once.
- Save these values:
  - `Team ID`
  - `Key ID`
  - `Service ID` (from step 2)
  - private key contents (`.p8`)

4. Firebase Console: enable Apple provider

- Go to Firebase Console > Authentication > Sign-in method > Apple.
- Fill:
  - Service ID
  - Apple Team ID
  - Key ID
  - Private key (`.p8` content)
- Save.

5. Firebase Console: authorized domains

- Authentication > Settings > Authorized domains.
- Ensure these are present:
  - your production domain (example: `vinctus.app`)
  - preview domain(s) you use
  - localhost domain used in dev

6. Local env and run

- In `.env.local`:
  - `VITE_ENABLE_APPLE_SIGN_IN=true`
- Restart dev server:

```bash
npm run dev
```

7. Functional test

- Open login page.
- Confirm `Continuar con Apple` button is visible.
- Complete Apple flow and confirm:
  - session is created
  - user profile docs are created/updated in `users/{uid}` and `users_public/{uid}`

## Common errors and what they mean

- `auth/operation-not-allowed`
  - Apple provider is not enabled in Firebase.
- `auth/unauthorized-domain`
  - Domain missing in Firebase authorized domains.
- `auth/invalid-credential`
  - Apple credentials in Firebase (Service ID, Team ID, Key ID, p8) do not match.

## Notes for App Store review

- If Google Sign-In is visible, Apple Sign-In should also be visible for iOS review.
- If Apple is not configured yet, keep `VITE_ENABLE_APPLE_SIGN_IN=false` to avoid exposing a broken flow.
