// ============================================================
// firebase.js
// Single source of truth for Firebase initialization.
// Replace the firebaseConfig values below with YOUR project's
// config from Firebase Console > Project Settings > General.
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

// TODO: Replace with your own Firebase project config.
// Tip: Keep this file out of public repos if the project is not
// purely academic, or use environment-based build injection.
const firebaseConfig = {
  apiKey: "AIzaSyA0mI7R5mo4FHgEN1p5sku79haw18Vr9ns",
  authDomain: "cloud-computing-54e53.firebaseapp.com",
  projectId: "cloud-computing-54e53",
  storageBucket: "cloud-computing-54e53.firebasestorage.app",
  messagingSenderId: "234826570482",
  appId: "1:234826570482:web:e7c95db26b2a63090d0e6b",
  measurementId: "G-5JQKGFZ2D5"
};

// Initialize Firebase app
const app = initializeApp(firebaseConfig);

// Export shared instances used across app.js
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Helper: set login persistence based on "Remember Me" checkbox
// (imported and used inside app.js during login)
export function setAuthPersistence(remember) {
  const persistenceType = remember ? browserLocalPersistence : browserSessionPersistence;
  return setPersistence(auth, persistenceType);
}
