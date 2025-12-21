"use client"

import { initializeApp, getApps, type FirebaseApp } from "firebase/app"
import { getAuth, type Auth } from "firebase/auth"
import { getFirestore, type Firestore } from "firebase/firestore"

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

let firebaseApp: FirebaseApp | null = null
let firebaseAuth: Auth | null = null
let firebaseDb: Firestore | null = null
let initialized = false

function initFirebase(): FirebaseApp | null {
  if (typeof window === "undefined") return null

  if (!initialized) {
    initialized = true
    try {
      firebaseApp = getApps().length ? getApps()[0] : initializeApp(firebaseConfig)
    } catch {
      return null
    }
  }
  return firebaseApp
}

export function getFirebaseAuth(): Auth | null {
  if (typeof window === "undefined") return null

  if (!firebaseAuth) {
    const app = initFirebase()
    if (app) {
      try {
        firebaseAuth = getAuth(app)
      } catch {
        return null
      }
    }
  }
  return firebaseAuth
}

export function getFirebaseDb(): Firestore | null {
  if (typeof window === "undefined") return null

  if (!firebaseDb) {
    const app = initFirebase()
    if (app) {
      try {
        firebaseDb = getFirestore(app)
      } catch {
        return null
      }
    }
  }
  return firebaseDb
}

export const getApp = initFirebase
