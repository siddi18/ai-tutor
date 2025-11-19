// src/services/firebaseOffline.js
// Offline-first Firebase configuration with MongoDB synchronization

import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  signOut,
  updateProfile,
  onAuthStateChanged,
} from "firebase/auth";

// 🔑 Firebase config (from Firebase Console)
// const firebaseConfig = {
//   apiKey: "AIzaSyBiBgAVgffD1mtGBwP90MKBpTA-XWXJDuM",
//   authDomain: "sign-in-c985b.firebaseapp.com",
//   projectId: "sign-in-c985b",
//   storageBucket: "sign-in-c985b.appspot.com",
//   messagingSenderId: "604443497700",
//   appId: "1:604443497700:web:0bf80c7b26c028553b88f1",
// };

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
export const auth = getAuth(app);
export { onAuthStateChanged };
const googleProvider = new GoogleAuthProvider();

// API base URL for MongoDB backend - Auto-detect based on hostname
const getApiBaseUrl = () => {
  if (window.location.hostname.includes('onrender.com')) {
    return '/api';
  }
  return 'http://localhost:5000/api';
};
const API_BASE_URL = getApiBaseUrl();

/**
 * 🔄 Sync user with MongoDB
 * Called after every login/register
 * This ensures user data is stored in MongoDB immediately after authentication
 */
const syncUserWithMongoDB = async (user, extraData = {}, retries = 3) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`🔄 MongoDB sync attempt ${attempt}/${retries} for user:`, user.uid);
      console.log('📤 Sending data:', extraData);
      
      const idToken = await user.getIdToken(true); // Force refresh token
      const url = `${API_BASE_URL}/users/sync`;
      console.log('🌐 Sync URL:', url);
      
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify(extraData),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ MongoDB sync failed (attempt ${attempt}):`, response.status, errorText);
        
        // If it's the last attempt, throw the error
        if (attempt === retries) {
          throw new Error(`Failed to sync user with MongoDB: ${response.status} - ${errorText}`);
        }
        
        // Wait before retrying (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        continue;
      }

      const data = await response.json();
      console.log("✅ MongoDB sync successful:", data);
      
      // Store in localStorage immediately for fast access
      localStorage.setItem("mongoUser", JSON.stringify(data));
      console.log("💾 User data saved to localStorage");
      
      return data; // MongoDB user object
    } catch (error) {
      console.error(`❌ MongoDB sync error (attempt ${attempt}/${retries}):`, error);
      
      // If it's the last attempt, return null but log prominently
      if (attempt === retries) {
        console.error("❌ All sync attempts failed. User will need to refresh or try again.");
        return null; // allow Firebase auth to still succeed
      }
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
  return null;
};

/**
 * 📌 Register user with email & password
 */
export const registerWithEmail = async (firstName, lastName, email, password) => {
  try {
    if (!email || !password) throw new Error("Email and password are required");
    if (!firstName || !lastName) throw new Error("First and last name are required");

    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Set display name
    await updateProfile(user, {
      displayName: `${firstName.trim()} ${lastName.trim()}`,
    }).catch((err) => console.warn("Could not update display name:", err));

    // 🔄 Sync with MongoDB
    await syncUserWithMongoDB(user, { firstName, lastName });

    return userCredential;
  } catch (error) {
    console.error("Registration Error:", error);
    throw error;
  }
};

/**
 * 📌 Login with email & password
 */
export const loginWithEmail = async (email, password) => {
  try {
    if (!email || !password) throw new Error("Email and password are required");

    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // 🔄 Sync with MongoDB
    await syncUserWithMongoDB(user);

    return userCredential;
  } catch (error) {
    console.error("Login Error:", error);
    throw error;
  }
};

/**
 * 📌 Login with Google
 */
export const loginWithGoogle = async () => {
  try {
    console.log("🔐 Starting Google sign-in...");
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;

    // Split name
    const nameParts = user.displayName?.split(" ") || [];
    const firstName = nameParts[0] || "";
    const lastName = nameParts.slice(1).join(" ") || "";

    // 🔄 Sync with MongoDB
    const mongoUser = await syncUserWithMongoDB(user, { firstName, lastName });
    console.log("✅ Google sign-in complete. MongoDB user:", mongoUser);

    // Return both Firebase and MongoDB data
    return { ...result, mongoUser };
  } catch (error) {
    console.error("❌ Google Sign-in Error:", error);
    throw error;
  }
};

/**
 * 📌 Password reset
 */
export const sendPasswordReset = async (email) => {
  try {
    return await sendPasswordResetEmail(auth, email);
  } catch (error) {
    console.error("Password Reset Error:", error);
    throw error;
  }
};

/**
 * 📌 Logout
 */
export const logout = async () => {
  try {
    return await signOut(auth);
  } catch (error) {
    console.error("Logout Error:", error);
    throw error;
  }
};

/**
 * 📌 Fetch user profile from backend MongoDB
 */
export const fetchUserProfile = async (userId) => {
  try {
    const idToken = await auth.currentUser.getIdToken();
    const response = await fetch(`${API_BASE_URL}/users/${userId}`, {
      headers: { Authorization: `Bearer ${idToken}` },
    });

    if (!response.ok) throw new Error("Failed to fetch user profile");

    return await response.json();
  } catch (error) {
    console.error("Error fetching user profile:", error);
    return null;
  }
};

/**
 * 📌 Update user profile in MongoDB
 */
export const updateUserProfile = async (userId, updates) => {
  try {
    const idToken = await auth.currentUser.getIdToken();
    const response = await fetch(`${API_BASE_URL}/users/${userId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify(updates),
    });

    if (!response.ok) throw new Error("Failed to update user profile");

    return await response.json();
  } catch (error) {
    console.error("Error updating user profile:", error);
    throw error;
  }
};

/**
 * 📌 Friendly Firebase error messages
 */
export const getErrorMessage = (errorCode) => {
  switch (errorCode) {
    case "auth/user-not-found":
      return "No account found with this email address.";
    case "auth/wrong-password":
      return "Incorrect password. Please try again.";
    case "auth/email-already-in-use":
      return "An account with this email already exists.";
    case "auth/weak-password":
      return "Password should be at least 6 characters.";
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    case "auth/invalid-credential":
      return "Invalid email or password. Please check your credentials.";
    case "auth/user-disabled":
      return "This account has been disabled. Please contact support.";
    case "auth/too-many-requests":
      return "Too many failed attempts. Please try again later.";
    case "auth/network-request-failed":
      return "Network error. Please check your internet connection.";
    case "auth/popup-closed-by-user":
      return "Google sign-in was cancelled.";
    case "auth/popup-blocked":
      return "Popup was blocked by your browser. Please allow popups for this site.";
    case "auth/cancelled-popup-request":
      return "Another sign-in process is already in progress.";
    case "auth/account-exists-with-different-credential":
      return "An account already exists with this email using a different sign-in method.";
    default:
      return errorCode
        ? `Authentication error: ${errorCode}`
        : "An error occurred. Please try again.";
  }
};

export {syncUserWithMongoDB};
