/**
 * Firebase Admin SDK — Server-side token verification
 */
import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";

let _adminApp: App | undefined;
let _adminAuth: Auth | undefined;

function getAdminApp(): App {
  if (!_adminApp) {
    if (getApps().length > 0) {
      _adminApp = getApps()[0];
    } else {
      _adminApp = initializeApp({
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      });
    }
  }
  return _adminApp;
}

export function getAdminAuth(): Auth {
  if (!_adminAuth) {
    _adminAuth = getAuth(getAdminApp());
  }
  return _adminAuth;
}

/**
 * Verify a Firebase ID token from an Authorization header.
 * Returns the decoded token or null if invalid.
 */
export async function verifyAuthToken(authHeader: string | null): Promise<{
  uid: string;
  email?: string;
  name?: string;
} | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    return { uid: decoded.uid, email: decoded.email, name: decoded.name };
  } catch {
    return null;
  }
}
