import { getFirestore, type Firestore } from 'firebase/firestore';
import { firebaseApp } from './app';

/** Browser Firestore (admin pages and the public registration forms). */
export const db = (): Firestore => getFirestore(firebaseApp());
