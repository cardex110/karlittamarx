import { initializeApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCKYSSyYSjsnVtldC3BSKUPTio93W8GOw0",
  authDomain: "karlittamarx-dd681.firebaseapp.com",
  projectId: "karlittamarx-dd681",
  storageBucket: "karlittamarx-dd681.firebasestorage.app",
  messagingSenderId: "592781374164",
  appId: "1:592781374164:web:b9480e49fb1ed2ebdc4141"
};

export const firebaseApp = initializeApp(firebaseConfig);
export const db = getFirestore(firebaseApp);
