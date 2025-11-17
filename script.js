/***************************************************************************
 *  FIREBASE INITIALIZATION
 ***************************************************************************/

// Your Firebase config (already safe to include client-side)
firebase.initializeApp({
  apiKey: "AIzaSyC7lCDQssJJkOe9ux49hmyUCD9Y5NMEdBs",
  authDomain: "test3-53d9d.firebaseapp.com",
  projectId: "test3-53d9d",
  storageBucket: "test3-53d9d.firebasestorage.app",
  messagingSenderId: "23633134126",
  appId: "1:23633134126:web:b9b021dcf5eff4087e95bf",
  measurementId: "G-4PWTYR2E9Q"
});

// Firestore reference
const db = firebase.firestore();
const itemsCollection = db.collection("items");


/***************************************************************************
 *  INDEXEDDB SETUP (OFFLINE DATABASE)
 ***************************************************************************/

let dbLocal;
const DB_NAME = "pockets-db";
const STORE = "items";

function initIndexedDB() {
  return new Promise((resolve, reject) => {
    const openReq = indexedDB.open(DB_NAME, 1);

    openReq.onupgradeneeded = (event) => {
      dbLocal = event.target.result;
      dbLocal.createObjectStore(STORE, { keyPath: "id" });
    };

    openReq.onsuccess = (event) => {
      dbLocal = event.target.result;
      resolve();
    };

    openReq.onerror = reject;
  });
}

// IndexedDB helpers
function idbAdd(item) {
  return new Promise((resolve) => {
    const tx = dbLocal.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(item);
    tx.oncomplete = resolve;
  });
}

function idbGetAll() {
  return new Promise((resolve) => {
    const tx = dbLocal.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
  });
}

function idbDelete(id) {
  return new Promise((resolve) => {
    const tx = dbLocal.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = resolve;
  });
}

function idbClear() {
  return new Promise((resolve) => {
    const tx = dbLocal.transaction(STORE, "readwrite");
    tx.objectStore(STORE).clear();
    tx.oncomplete = resolve;
  });
}


/***************************************************************************
 *  ONLINE / OFFLINE DETECTION
 ***************************************************************************/

function updateStatus() {
  const statusText = document.getElementById("statusText");
  statusText.textContent = navigator.onLine ? "Online" : "Offline";
  statusText.style.color = navigator.onLine ? "green" : "red";
}

window.addEventListener("online", handleReconnect);
window.addEventListener("offline", updateStatus);


/***************************************************************************
 *  SYNC LOGIC — When online, upload IndexedDB items to Firestore
 ***************************************************************************/

async function handleReconnect() {
  updateStatus();
  showToast("Back online — syncing...");

  await syncLocalToFirebase();
}

async function syncLocalToFirebase() {
  const localItems = await idbGetAll();
  if (localItems.length === 0) return;

  for (const item of localItems) {
    await itemsCollection.doc(item.id).set(item);
  }

  await idbClear();
  await loadItemsFromFirebase();

  showToast("Sync complete!");
}


/***************************************************************************
 *  CRUD OPERATIONS
 ***************************************************************************/

async function addItem(name, locationText) {
  const id = Date.now().toString();

  const item = {
    id,
    name,
    location: locationText,
    timestamp: Date.now()
  };

  if (navigator.onLine) {
    await itemsCollection.doc(id).set(item);
  } else {
    await id
