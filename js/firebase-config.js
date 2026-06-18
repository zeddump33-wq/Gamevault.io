// ============================================================
// firebase-config.js
// Single source of truth for Firebase initialization.
// Import this in any module that needs Firestore.
// ============================================================

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey:            'AIzaSyCntbq001YBLq3ZDqw9D-tRInDnhX631bM',
  authDomain:        'gamevault-6f5b1.firebaseapp.com',
  projectId:         'gamevault-6f5b1',
  storageBucket:     'gamevault-6f5b1.firebasestorage.app',
  messagingSenderId: '958994391207',
  appId:             '1:958994391207:web:7c398da9bc39437c7ebb82',
  measurementId:     'G-8TFM4KS3LL'
};

const app = initializeApp(firebaseConfig);
export const db  = getFirestore(app);
