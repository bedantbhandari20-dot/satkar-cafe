import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
import 'firebase/compat/storage';
import 'firebase/compat/auth';

const firebaseConfig = {
  apiKey: "AIzaSyDdANf8pk7uJavzd4rpeFVYZ7wVnS2Hmr0",
  authDomain: "satkar-cafe.firebaseapp.com",
  projectId: "satkar-cafe",
  storageBucket: "satkar-cafe.appspot.com",
  messagingSenderId: "175789641767",
  appId: "1:175789641767:web:c5e7456f3debdb456d7e02"
};

// Initialize Firebase compat app
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

export const __db = firebase.firestore();
export const __storage = firebase.storage();
export const __auth = firebase.auth();

// Removed window.__db and window.__storage for security

// Persistent per-tab session ID
if (!sessionStorage.getItem('satkar_sid')) {
  sessionStorage.setItem('satkar_sid', crypto.randomUUID());
}
export const __sessionId = sessionStorage.getItem('satkar_sid');
window.__sessionId = __sessionId;
