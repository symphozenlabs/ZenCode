// Admin is a client-only app: Firebase Auth state lives in the browser and
// every read is enforced by Firestore security rules.
export const ssr = false;
export const prerender = false;
