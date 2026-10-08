import { serverTimestamp, collection, addDoc, getDocs } from 'firebase/firestore';
import { db } from '$lib/firebase/client';
import { COLLECTIONS, searchFields } from '$lib/registrations/model';

export { COLLECTIONS };

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

  const snapshot = await getDocs(collection(db(), collectionName));

  for (const docSnap of snapshot.docs) {
    const data = docSnap.data();

    // Rejected teams may register again
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
          message: `This participant (Admission No: ${adm}) is already registered for this event.`
        };
      }
    }

    // Check for duplicate email
    for (const em of normEmails) {
      if (docEmails.has(em)) {
        return {
          isDuplicate: true,
          message: `This participant (Email: ${em}) is already registered for this event.`
        };
      }
    }
  }

  return { isDuplicate: false };
}

function buildPayload(event, teamSize, teamLeader, members) {
  const cleanMembers = members.map((m, index) => ({
    memberNumber: index + 1,
    name: m.name.trim(),
    admissionNumber: m.admissionNumber.trim(),
    email: m.email.trim()
  }));
  return {
    event,
    teamSize: Number(teamSize),
    teamLeader: {
      name: teamLeader.name.trim(),
      admissionNumber: teamLeader.admissionNumber.trim(),
      classSection: teamLeader.classSection.trim(),
      email: teamLeader.email.trim()
    },
    members: cleanMembers,
    status: 'pending',
    registeredAt: serverTimestamp(),
    ...searchFields(cleanMembers)
  };
}

/**
 * Registers a Hackathon team into Firestore.
 *
 * @param {Object} registrationData
 * @returns {Promise<string>} Document ID
 */
export async function registerHackathonTeam(registrationData) {
  const { teamSize, teamLeader, members } = registrationData;
  const docRef = await addDoc(
    collection(db(), COLLECTIONS.HACKATHON),
    buildPayload('Hackathon', teamSize, teamLeader, members)
  );
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
  const docRef = await addDoc(
    collection(db(), COLLECTIONS.PITCH_FEST),
    buildPayload('Pitch Fest', 2, teamLeader, members)
  );
  return docRef.id;
}
