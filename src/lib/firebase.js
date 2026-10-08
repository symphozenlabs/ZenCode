import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getFirestore, 
  serverTimestamp, 
  collection, 
  addDoc, 
  getDocs 
} from 'firebase/firestore';

// Read Firebase client configuration from Vite environment variables
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

// Initialize or reuse existing Firebase app
export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const db = getFirestore(app);

export const COLLECTIONS = {
  HACKATHON: 'hackathon_registered_participants',
  PITCH_FEST: 'pitchfest_registered_participants'
};

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
          message: `You are already registered for the ${eventName}. (Admission No. ${adm} is already registered)`
        };
      }
    }

    // Check for duplicate email
    for (const em of normEmails) {
      if (docEmails.has(em)) {
        return {
          isDuplicate: true,
          message: `You are already registered for the ${eventName}. (Email ${em} is already registered)`
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
  const { teamSize, teamLeader, members } = registrationData;

  const docPayload = {
    event: "Hackathon",
    teamSize: Number(teamSize),
    teamLeader: {
      name: teamLeader.name.trim(),
      admissionNumber: teamLeader.admissionNumber.trim(),
      yearOfStudy: (teamLeader.yearOfStudy || '').trim(),
      email: teamLeader.email.trim()
    },
    members: members.map((m, index) => ({
      memberNumber: index + 1,
      name: m.name.trim(),
      admissionNumber: m.admissionNumber.trim(),
      yearOfStudy: (m.yearOfStudy || '').trim(),
      email: m.email.trim()
    })),
    registeredAt: serverTimestamp(),
    _searchAdmissionNumbers: members.map(m => m.admissionNumber.trim().toUpperCase()),
    _searchEmails: members.map(m => m.email.trim().toLowerCase())
  };

  const docRef = await addDoc(collection(db, COLLECTIONS.HACKATHON), docPayload);
  return docRef.id;
}

/**
 * Registers a Pitch Fest team into Firestore.
 *
 * @param {Object} registrationData
 * @returns {Promise<string>} Document ID
 */
export async function registerPitchFestTeam(registrationData) {
  const { teamLeader, members } = registrationData;

  const docPayload = {
    event: "Pitch Fest",
    teamSize: 2,
    teamLeader: {
      name: teamLeader.name.trim(),
      admissionNumber: teamLeader.admissionNumber.trim(),
      yearOfStudy: (teamLeader.yearOfStudy || '').trim(),
      email: teamLeader.email.trim()
    },
    members: members.map((m, index) => ({
      memberNumber: index + 1,
      name: m.name.trim(),
      admissionNumber: m.admissionNumber.trim(),
      yearOfStudy: (m.yearOfStudy || '').trim(),
      email: m.email.trim()
    })),
    registeredAt: serverTimestamp(),
    _searchAdmissionNumbers: members.map(m => m.admissionNumber.trim().toUpperCase()),
    _searchEmails: members.map(m => m.email.trim().toLowerCase())
  };

  const docRef = await addDoc(collection(db, COLLECTIONS.PITCH_FEST), docPayload);
  return docRef.id;
}
