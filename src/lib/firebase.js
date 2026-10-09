import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getFirestore, 
  serverTimestamp, 
  collection, 
  doc,
  getDocs,
  writeBatch
} from 'firebase/firestore';

// Read Firebase client configuration safely across Vite dev, build, and Node contexts
const metaEnv = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : {};
const procEnv = (typeof process !== 'undefined' && process.env) ? process.env : {};

const firebaseConfig = {
  apiKey: metaEnv.VITE_FIREBASE_API_KEY || procEnv.VITE_FIREBASE_API_KEY,
  authDomain: metaEnv.VITE_FIREBASE_AUTH_DOMAIN || procEnv.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: metaEnv.VITE_FIREBASE_PROJECT_ID || procEnv.VITE_FIREBASE_PROJECT_ID,
  storageBucket: metaEnv.VITE_FIREBASE_STORAGE_BUCKET || procEnv.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: metaEnv.VITE_FIREBASE_MESSAGING_SENDER_ID || procEnv.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: metaEnv.VITE_FIREBASE_APP_ID || procEnv.VITE_FIREBASE_APP_ID,
  measurementId: metaEnv.VITE_FIREBASE_MEASUREMENT_ID || procEnv.VITE_FIREBASE_MEASUREMENT_ID
};


// Initialize or reuse existing Firebase app
export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const db = getFirestore(app);

export const COLLECTIONS = {
  HACKATHON: 'hackathon_registered_participants',
  PITCH_FEST: 'pitchfest_registered_participants',
  // Admin-only contact details, keyed by the registration's document ID.
  // Registrations themselves are publicly readable, so phone numbers live here.
  CONTACTS: 'registration_contacts'
};

/**
 * Saves a registration together with its private contact document in one
 * atomic write, so a team is never stored without its leader's mobile number.
 */
async function saveRegistration(collectionName, docPayload, mobileNumber) {
  const regRef = doc(collection(db, collectionName));
  const batch = writeBatch(db);
  batch.set(regRef, docPayload);
  batch.set(doc(db, COLLECTIONS.CONTACTS, regRef.id), {
    event: docPayload.event,
    mobileNumber: (mobileNumber || '').trim(),
    createdAt: serverTimestamp()
  });
  await batch.commit();
  return regRef.id;
}

/**
 * Checks if any given admission number or email is already registered for an event.
 * Duplicate checking is event-specific.
 *
 * @param {string} collectionName
 * @param {string} eventName - "Hackathon" or "Pitch Fest"
 * @param {Array<string>} admissionNumbers
 * @param {Array<string>} emails
 * @returns {Promise<{ isDuplicate: boolean, message?: string }>}
 */
export async function checkDuplicateRegistration(collectionName, eventName, admissionNumbers, emails) {
  const normAdmissions = admissionNumbers.map(a => (a || '').trim().toUpperCase()).filter(Boolean);
  const normEmails = emails.map(e => (e || '').trim().toLowerCase()).filter(Boolean);

  const snapshot = await getDocs(collection(db, collectionName));
  
  for (const docSnap of snapshot.docs) {
    const data = docSnap.data();

    // A rejected team frees its members to register again.
    if (data.status === 'rejected') continue;

    // Collect all admissions in this document
    const docAdmissions = new Set();
    if (data.teamLeader?.admissionNumber) {
      docAdmissions.add(data.teamLeader.admissionNumber.trim().toUpperCase());
    }
    if (Array.isArray(data.members)) {
      data.members.forEach(m => {
        if (m?.admissionNumber) docAdmissions.add(m.admissionNumber.trim().toUpperCase());
      });
    }
    if (Array.isArray(data._searchAdmissionNumbers)) {
      data._searchAdmissionNumbers.forEach(a => docAdmissions.add(a.trim().toUpperCase()));
    }

    // Collect all emails in this document
    const docEmails = new Set();
    if (data.teamLeader?.email) {
      docEmails.add(data.teamLeader.email.trim().toLowerCase());
    }
    if (Array.isArray(data.members)) {
      data.members.forEach(m => {
        if (m?.email) docEmails.add(m.email.trim().toLowerCase());
      });
    }
    if (Array.isArray(data._searchEmails)) {
      data._searchEmails.forEach(e => docEmails.add(e.trim().toLowerCase()));
    }

    // Check for duplicate admission number
    for (const adm of normAdmissions) {
      if (docAdmissions.has(adm)) {
        return {
          isDuplicate: true,
          message: `Participant with Admission Number "${adm}" is already registered for ${eventName}.`
        };
      }
    }

    // Check for duplicate email
    for (const em of normEmails) {
      if (docEmails.has(em)) {
        return {
          isDuplicate: true,
          message: `Participant with Email "${em}" is already registered for ${eventName}.`
        };
      }
    }
  }

  return { isDuplicate: false };
}

/**
 * Registers a Hackathon team into Firestore.
 *
 * @param {Object} registrationData
 * @returns {Promise<string>} Document ID
 */
export async function registerHackathonTeam(registrationData) {
  const { teamName, teamSize, teamLeader, members } = registrationData;

  const docPayload = {
    event: "Hackathon",
    teamSize: Number(teamSize),
    qrGenerated: true,
    qrVersion: 1,
    confirmationEmailStatus: "pending",
    ...((teamName || '').trim() ? { teamName: teamName.trim() } : {}),
    teamLeader: {
      name: teamLeader.name.trim(),
      admissionNumber: teamLeader.admissionNumber.trim(),
      yearOfStudy: (teamLeader.yearOfStudy || teamLeader.classSection || '').trim(),
      classSection: (teamLeader.yearOfStudy || teamLeader.classSection || '').trim(),
      email: teamLeader.email.trim()
    },
    members: members.map((m, index) => ({
      memberNumber: index + 1,
      name: m.name.trim(),
      admissionNumber: m.admissionNumber.trim(),
      yearOfStudy: (m.yearOfStudy || m.classSection || '').trim(),
      classSection: (m.yearOfStudy || m.classSection || '').trim(),
      email: m.email.trim()
    })),
    registeredAt: serverTimestamp(),
    _searchAdmissionNumbers: members.map(m => m.admissionNumber.trim().toUpperCase()),
    _searchEmails: members.map(m => m.email.trim().toLowerCase())
  };

  return saveRegistration(COLLECTIONS.HACKATHON, docPayload, teamLeader.mobileNumber);
}

/**
 * Registers a Pitch Fest team into Firestore.
 *
 * @param {Object} registrationData
 * @returns {Promise<string>} Document ID
 */
export async function registerPitchFestTeam(registrationData) {
  const { teamName, teamLeader, members } = registrationData;

  const docPayload = {
    event: "Pitch Fest",
    teamSize: members.length,
    qrGenerated: true,
    qrVersion: 1,
    confirmationEmailStatus: "pending",
    ...((teamName || '').trim() ? { teamName: teamName.trim() } : {}),
    teamLeader: {
      name: teamLeader.name.trim(),
      admissionNumber: teamLeader.admissionNumber.trim(),
      yearOfStudy: (teamLeader.yearOfStudy || teamLeader.classSection || '').trim(),
      classSection: (teamLeader.yearOfStudy || teamLeader.classSection || '').trim(),
      email: teamLeader.email.trim()
    },
    members: members.map((m, index) => ({
      memberNumber: index + 1,
      name: m.name.trim(),
      admissionNumber: m.admissionNumber.trim(),
      yearOfStudy: (m.yearOfStudy || m.classSection || '').trim(),
      classSection: (m.yearOfStudy || m.classSection || '').trim(),
      email: m.email.trim()
    })),
    registeredAt: serverTimestamp(),
    _searchAdmissionNumbers: members.map(m => m.admissionNumber.trim().toUpperCase()),
    _searchEmails: members.map(m => m.email.trim().toLowerCase())
  };

  return saveRegistration(COLLECTIONS.PITCH_FEST, docPayload, teamLeader.mobileNumber);
}

