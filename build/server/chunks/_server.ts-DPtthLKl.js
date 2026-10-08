import { j as json } from './index.js-fmqScc5X.js';
import { randomInt } from 'node:crypto';
import { doc, getDoc, writeBatch } from 'firebase/firestore';
import { h as hasAdminCredentials, a as hasPublicConfig, g as getSiteConfig, b as adminDb, p as publicDb } from './site-config-h6fBR88p.js';
import { s as sanitizeRegistration, v as validateAll, r as registrationKeyId } from './registration-BcueNbWR.js';
import './site-btfDK_Br.js';
import 'firebase-admin/app';
import 'firebase-admin/firestore';
import 'firebase/app';

const hits = /* @__PURE__ */ new Map();
function rateLimit(key, limit, windowMs) {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5e3) hits.clear();
  return true;
}
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function registrationId() {
  let id = "ZC-";
  for (let i = 0; i < 6; i++) id += ALPHABET[randomInt(ALPHABET.length)];
  return id;
}
function fail(status, message, errors) {
  return json({ ok: false, message, errors }, { status });
}
const DUPLICATE = () => fail(409, "This email is already registered for this event.", {
  "personal.email": "Already registered for this event."
});
class Duplicate extends Error {
}
class Full extends Error {
}
async function saveWithAdmin(doc2, capacity) {
  const db = adminDb();
  const col = db.collection("registrations");
  const existing = await col.where("emailLower", "==", doc2.emailLower).where("event", "==", doc2.event).limit(5).get();
  if (existing.docs.some((d) => d.get("status") !== "rejected")) throw new Duplicate();
  if (capacity != null) {
    const count = await col.where("event", "==", doc2.event).where("status", "in", ["pending", "approved"]).count().get();
    if (count.data().count >= capacity) throw new Full();
  }
  const batch = db.batch();
  batch.create(col.doc(doc2.registrationId), doc2);
  batch.set(db.collection("registrationKeys").doc(registrationKeyId(doc2.event, doc2.emailLower)), {
    registrationId: doc2.registrationId,
    event: doc2.event,
    emailLower: doc2.emailLower,
    createdAt: doc2.createdAt
  });
  await batch.commit();
}
async function saveWithRules(reg) {
  const db = publicDb();
  const keyRef = doc(db, "registrationKeys", registrationKeyId(reg.event, reg.emailLower));
  if ((await getDoc(keyRef)).exists()) throw new Duplicate();
  const batch = writeBatch(db);
  batch.set(doc(db, "registrations", reg.registrationId), reg);
  batch.set(keyRef, {
    registrationId: reg.registrationId,
    event: reg.event,
    emailLower: reg.emailLower,
    createdAt: reg.createdAt
  });
  await batch.commit();
}
const POST = async ({ request, getClientAddress }) => {
  const useAdmin = hasAdminCredentials();
  if (!useAdmin && !hasPublicConfig()) {
    return fail(503, "Registration is temporarily unavailable. Please try again shortly.");
  }
  if (!rateLimit(`register:${getClientAddress()}`, 8, 10 * 6e4)) {
    return fail(429, "Too many attempts. Please wait a few minutes and try again.");
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return fail(400, "We could not read your registration. Please try again.");
  }
  const input = sanitizeRegistration(body);
  const config = await getSiteConfig({ fresh: true });
  const eventConfig = input.event ? config.events[input.event] : null;
  const errors = validateAll(input, eventConfig);
  if (Object.keys(errors).length || !input.event || !eventConfig) {
    return fail(422, "Please fix the highlighted fields.", errors);
  }
  if (eventConfig.registrationDeadline) {
    const deadline = /* @__PURE__ */ new Date(`${eventConfig.registrationDeadline}T23:59:59`);
    if (Date.now() > deadline.getTime()) return fail(409, "Registration for this event has closed.");
  }
  const now = Date.now();
  for (let attempt = 0; attempt < 3; attempt++) {
    const reg = {
      ...input,
      event: input.event,
      registrationId: registrationId(),
      emailLower: input.personal.email.toLowerCase(),
      status: "pending",
      createdAt: now,
      updatedAt: now,
      reviewedBy: null
    };
    try {
      if (useAdmin) await saveWithAdmin(reg, eventConfig.capacity);
      else await saveWithRules(reg);
      return json({ ok: true, registrationId: reg.registrationId, createdAt: now });
    } catch (err) {
      if (err instanceof Duplicate) return DUPLICATE();
      if (err instanceof Full) return fail(409, "This event is full. Registration is no longer available.");
      if (err.code === 6) continue;
      console.error("[register]", err);
      const code = err.code;
      if (code === "permission-denied") {
        return fail(
          503,
          "Registration is not accepting entries right now. Organisers: publish firestore.rules in the Firebase console."
        );
      }
      return fail(500, "We could not save your registration. Please try again.");
    }
  }
  return fail(500, "We could not save your registration. Please try again.");
};

export { POST };
//# sourceMappingURL=_server.ts-DPtthLKl.js.map
