import { getDoc, doc, getFirestore as getFirestore$1 } from 'firebase/firestore';
import { D as DEFAULT_SITE_CONFIG, m as mergeSiteConfig } from './site-btfDK_Br.js';
import { p as private_env, b as public_env } from './index.js-fmqScc5X.js';
import { getApps, initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getApp, initializeApp as initializeApp$1 } from 'firebase/app';

let app;
function credential() {
  if (private_env.FIREBASE_SERVICE_ACCOUNT) {
    return cert(JSON.parse(private_env.FIREBASE_SERVICE_ACCOUNT));
  }
  if (private_env.FIREBASE_PROJECT_ID && private_env.FIREBASE_CLIENT_EMAIL && private_env.FIREBASE_PRIVATE_KEY) {
    return cert({
      projectId: private_env.FIREBASE_PROJECT_ID,
      clientEmail: private_env.FIREBASE_CLIENT_EMAIL,
      privateKey: private_env.FIREBASE_PRIVATE_KEY.replace(/\n/g, "\n")
    });
  }
  return applicationDefault();
}
function hasAdminCredentials() {
  return Boolean(
    private_env.FIREBASE_SERVICE_ACCOUNT || private_env.FIREBASE_PROJECT_ID && private_env.FIREBASE_CLIENT_EMAIL && private_env.FIREBASE_PRIVATE_KEY || private_env.GOOGLE_APPLICATION_CREDENTIALS || private_env.K_SERVICE
    // running on Google Cloud
  );
}
function adminDb() {
  if (!app) app = getApps()[0] ?? initializeApp({ credential: credential() });
  return getFirestore(app);
}
const APP_NAME = "zencode-server-public";
function publicDb() {
  if (!public_env.PUBLIC_FIREBASE_API_KEY || !public_env.PUBLIC_FIREBASE_PROJECT_ID) {
    throw new Error("Firebase is not configured. Set the PUBLIC_FIREBASE_* variables.");
  }
  let app2;
  try {
    app2 = getApp(APP_NAME);
  } catch {
    app2 = initializeApp$1(
      {
        apiKey: public_env.PUBLIC_FIREBASE_API_KEY,
        authDomain: public_env.PUBLIC_FIREBASE_AUTH_DOMAIN,
        projectId: public_env.PUBLIC_FIREBASE_PROJECT_ID,
        appId: public_env.PUBLIC_FIREBASE_APP_ID
      },
      APP_NAME
    );
  }
  return getFirestore$1(app2);
}
function hasPublicConfig() {
  return Boolean(public_env.PUBLIC_FIREBASE_API_KEY && public_env.PUBLIC_FIREBASE_PROJECT_ID);
}
let cache;
const TTL_MS = 3e4;
const TIMEOUT_MS = 5e3;
function withTimeout(p) {
  return Promise.race([
    p,
    new Promise((_, reject) => setTimeout(() => reject(new Error("timed out")), TIMEOUT_MS))
  ]);
}
async function readStored() {
  if (hasAdminCredentials()) {
    return (await adminDb().collection("config").doc("site").get()).data();
  }
  return (await getDoc(doc(publicDb(), "config", "site"))).data();
}
async function getSiteConfig({ fresh = false } = {}) {
  if (!fresh && cache && Date.now() - cache.at < TTL_MS) return cache.value;
  if (!hasAdminCredentials() && !hasPublicConfig()) return structuredClone(DEFAULT_SITE_CONFIG);
  try {
    const value = mergeSiteConfig(await withTimeout(readStored()));
    cache = { value, at: Date.now() };
    return value;
  } catch (err) {
    console.error("[site-config] falling back to defaults:", err.message);
    return cache?.value ?? structuredClone(DEFAULT_SITE_CONFIG);
  }
}

export { hasPublicConfig as a, adminDb as b, getSiteConfig as g, hasAdminCredentials as h, publicDb as p };
//# sourceMappingURL=site-config-h6fBR88p.js.map
