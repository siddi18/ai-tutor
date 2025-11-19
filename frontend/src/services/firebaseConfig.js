// Alternative Firebase configuration to handle WebChannel errors
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, enableNetwork, disableNetwork } from "firebase/firestore";

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyAK5Dc8Xn7-KRlEm136atuxyhaIi2PPtIE",
  authDomain: "ai-tutor-6bfe7.firebaseapp.com",
  projectId: "ai-tutor-6bfe7",
  storageBucket: "ai-tutor-6bfe7.firebasestorage.app",
  messagingSenderId: "908372470117",
  appId: "1:908372470117:web:bf05c2d6b861397a15d98c"
};

// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Initialize Auth
export const auth = getAuth(app);

// Initialize Firestore with aggressive error handling
let db;
let isFirestoreEnabled = true;

try {
  db = getFirestore(app);
  
  // Configure Firestore to handle WebChannel errors
  if (typeof window !== 'undefined') {
    console.log('Firestore initialized successfully');
    
    // Add global error handler for Firestore
    const originalConsoleError = console.error;
    console.error = (...args) => {
      const message = args.join(' ');
      if (message.includes('WebChannel') || message.includes('Firestore')) {
        console.warn('Firestore connection issue detected:', message);
        // Don't spam the console with these errors
        return;
      }
      originalConsoleError.apply(console, args);
    };
  }
} catch (error) {
  console.error('Firestore initialization error:', error);
  db = getFirestore(app);
}

// Function to temporarily disable Firestore operations
export const disableFirestore = async () => {
  try {
    await disableNetwork(db);
    isFirestoreEnabled = false;
    console.log('Firestore disabled due to connection issues');
  } catch (error) {
    console.warn('Could not disable Firestore:', error);
  }
};

// Function to re-enable Firestore operations
export const enableFirestore = async () => {
  try {
    await enableNetwork(db);
    isFirestoreEnabled = true;
    console.log('Firestore re-enabled');
  } catch (error) {
    console.warn('Could not enable Firestore:', error);
  }
};

// Check if Firestore is available
export const isFirestoreAvailable = () => isFirestoreEnabled;

export { db };

// Export app for other uses
export { app };

