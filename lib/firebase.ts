import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBCyVMNEaVCM9CCa-WemQ01aKhYZGFLaMo",
  authDomain: "smartedu-e8b4b.firebaseapp.com",
  projectId: "smartedu-e8b4b",
  storageBucket: "smartedu-e8b4b.firebasestorage.app",
  messagingSenderId: "3135442374",
  appId: "1:3135442374:web:986ae16d8835f00439f6c7",
  measurementId: "G-8R7JF7M6CN"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);
export const db = getFirestore(app); 

export default app;
