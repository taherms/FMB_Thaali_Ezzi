
// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyC8px49gIrlr9BT6HEOEN37dc3a5x7t_zo",
    authDomain: "fmb-ezzi-85d65.firebaseapp.com",
    projectId: "fmb-ezzi-85d65",
    storageBucket: "fmb-ezzi-85d65.firebasestorage.app",
    messagingSenderId: "331248092002",
    appId: "1:331248092002:web:5a26a3fd1d40dd08c8e23b",
    measurementId: "G-0FDCCDPDLT"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
