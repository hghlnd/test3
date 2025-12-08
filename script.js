/***************************************************************************
 *  FIREBASE INITIALIZATION
 ***************************************************************************/

// Firebase config
firebase.initializeApp({
  apiKey: "AIzaSyC7lCDQssJJkOe9ux49hmyUCD9Y5NMEdBs",
  authDomain: "test3-53d9d.firebaseapp.com",
  projectId: "test3-53d9d",
  storageBucket: "test3-53d9d.appspot.com",
  messagingSenderId: "23633134126",
  appId: "1:23633134126:web:b9b021dcf5eff4087e95bf",
  measurementId: "G-4PWTYR2E9Q"
});

const db = firebase.firestore();
const auth = firebase.auth();
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
 *  GLOBAL STATE & ELEMENTS
 ***************************************************************************/

let items = [];
let isGuest = false;
let reminderIntervalId = null;

const statusText = document.getElementById("statusText");
const syncButton = document.getElementById("syncButton");
const userInfo = document.getElementById("userInfo");

const loginEmailInput = document.getElementById("loginEmail");
const loginPasswordInput = document.getElementById("loginPassword");
const signupButton = document.getElementById("signupButton");
const signinButton = document.getElementById("signinButton");
const guestButton = document.getElementById("guestButton");
const signoutButton = document.getElementById("signoutButton");

console.log("script.js loaded");


/***************************************************************************
 *  ONLINE / OFFLINE DETECTION
 ***************************************************************************/

function updateStatus() {
  if (!statusText) return;
  statusText.textContent = navigator.onLine ? "Online" : "Offline";
  statusText.style.color = navigator.onLine ? "green" : "red";
}

window.addEventListener("online", handleReconnect);
window.addEventListener("offline", updateStatus);


/***************************************************************************
 *  AUTH STATE LISTENER
 ***************************************************************************/

auth.onAuthStateChanged(async (user) => {
  console.log("Auth state changed, user:", user ? user.email : "none");

  if (user) {
    // Signed-in user
    isGuest = false;
    if (userInfo) {
      userInfo.textContent = `Signed in as: ${user.email}`;
    }
    await loadItems();
  } else {
    // No Firebase user
    if (!isGuest) {
      // Fully signed out (not guest) – clear items
      items = [];
      renderItems();
      if (userInfo) {
        userInfo.textContent = "Not signed in";
      }
    } else {
      // Guest mode active
      if (userInfo) {
        userInfo.textContent = "Guest mode (data not saved)";
      }
    }
  }
});


/***************************************************************************
 *  AUTH BUTTON HANDLERS
 ***************************************************************************/

// Create Account
if (signupButton) {
  signupButton.addEventListener("click", async () => {
    const email = loginEmailInput.value.trim();
    const password = loginPasswordInput.value;

    if (!email || !password) {
      showToast("Enter email and password");
      return;
    }

    try {
      await auth.createUserWithEmailAndPassword(email, password);
      isGuest = false;
      showToast("Account created");
    } catch (err) {
      console.error(err);
      showToast(err.message || "Sign-up failed");
    }
  });
}

// Sign In
if (signinButton) {
  signinButton.addEventListener("click", async () => {
    const email = loginEmailInput.value.trim();
    const password = loginPasswordInput.value;

    if (!email || !password) {
      showToast("Enter email and password");
      return;
    }

    try {
      await auth.signInWithEmailAndPassword(email, password);
      isGuest = false;
      showToast("Signed in");
    } catch (err) {
      console.error(err);
      showToast(err.message || "Sign-in failed");
    }
  });
}

// Continue as Guest
if (guestButton) {
  guestButton.addEventListener("click", () => {
    isGuest = true;
    items = [];
    renderItems();
    if (userInfo) {
      userInfo.textContent = "Guest mode (data not saved)";
    }
    showToast("Guest mode enabled");
  });
}

// Sign Out
if (signoutButton) {
  signoutButton.addEventListener("click", async () => {
    try {
      isGuest = false;
      await auth.signOut();
      items = [];
      renderItems();
      if (userInfo) userInfo.textContent = "Not signed in";
      showToast("Signed out");
    } catch (err) {
      console.error("Sign-out error:", err);
      showToast("Sign-out failed");
    }
  });
}


/***************************************************************************
 *  SYNC LOGIC — On reconnect, send IndexedDB → Firestore
 ***************************************************************************/

async function handleReconnect() {
  updateStatus();
  showToast("Back online — syncing...");
  await syncLocalToFirebase();
}

async function syncLocalToFirebase() {
  const user = auth.currentUser;
  if (!user) return;

  const localItems = await idbGetAll();
  const mine = localItems.filter(i => i.userId === user.uid);

  if (mine.length === 0) return;

  for (const item of mine) {
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
  const user = auth.currentUser;

  const item = {
    id,
    name,
    location: locationText,
    timestamp: Date.now(),
    userId: user ? user.uid : null
  };

  // Guest mode: keep items only in memory
  if (!user) {
    items.push(item);
    renderItems();
    showToast("Item added (guest — not saved)");
    return;
  }

  // Signed-in user
  if (navigator.onLine) {
    await itemsCollection.doc(id).set(item);
  } else {
    await idbAdd(item);
  }

  await loadItems();
  showToast("Item added!");
}

async function deleteItem(id) {
  const user = auth.currentUser;

  // Guest mode
  if (!user) {
    items = items.filter(i => i.id !== id);
    renderItems();
    showToast("Item deleted");
    return;
  }

  if (navigator.onLine) {
    await itemsCollection.doc(id).delete();
  } else {
    await idbDelete(id);
  }

  await loadItems();
  showToast("Item deleted");
}


/***************************************************************************
 *  LOAD ITEMS FROM THE CORRECT SOURCE
 ***************************************************************************/

async function loadItems() {
  const user = auth.currentUser;

  // Guest: just render in-memory items
  if (!user) {
    console.log("Loading items in guest mode");
    renderItems();
    return;
  }

  console.log("Loading items for user:", user.uid);

  if (navigator.onLine) {
    await loadItemsFromFirebase();
  } else {
    await loadItemsFromIndexedDB();
  }

  renderItems();
}

async function loadItemsFromFirebase() {
  const user = auth.currentUser;
  if (!user) {
    items = [];
    return;
  }

  try {
    // No orderBy to avoid composite index issues
    const snapshot = await itemsCollection
      .where("userId", "==", user.uid)
      .get();

    items = snapshot.docs.map(doc => doc.data());
    console.log("Loaded from Firestore:", items.length, "items");
  } catch (err) {
    console.error("Error loading from Firestore:", err);
    items = [];
  }
}

async function loadItemsFromIndexedDB() {
  const user = auth.currentUser;
  if (!user) {
    items = [];
    return;
  }

  const all = await idbGetAll();
  items = all.filter(i => i.userId === user.uid);
  console.log("Loaded from IndexedDB:", items.length, "items");
}


/***************************************************************************
 *  RENDER ITEMS INTO UI
 ***************************************************************************/

function renderItems() {
  const list = document.getElementById("itemList");
  if (!list) return;

  list.innerHTML = "";

  if (items.length === 0) {
    list.innerHTML = "<li><em>No items yet</em></li>";
    return;
  }

  items.forEach(item => {
    const li = document.createElement("li");

    li.innerHTML = `
      <div class="item-main">
        <span class="item-name">${item.name}</span>
        <span class="item-meta">${item.location || "No location provided"}</span>
      </div>
      <button class="delete-btn" onclick="deleteItem('${item.id}')">
        <img src="delete-icon.png" alt="Delete" />
      </button>
    `;

    list.appendChild(li);
  });
}

// Expose deleteItem for inline onclick
window.deleteItem = deleteItem;


/***************************************************************************
 *  USER INPUT HANDLERS
 ***************************************************************************/

const addItemButton = document.getElementById("addItemButton");
if (addItemButton) {
  addItemButton.addEventListener("click", async () => {
    const nameInput = document.getElementById("itemName");
    const locationInput = document.getElementById("itemLocation");

    const name = nameInput.value.trim();
    const locationText = locationInput.value.trim();

    if (!name) {
      showToast("Please enter an item name");
      return;
    }

    await addItem(name, locationText);

    nameInput.value = "";
    locationInput.value = "";
  });
}

if (syncButton) {
  syncButton.addEventListener("click", async () => {
    if (!navigator.onLine) {
      showToast("Offline — Cannot sync");
      return;
    }

    showToast("Syncing...");
    await syncLocalToFirebase();
  });
}


/***************************************************************************
 *  REMINDER SYSTEM
 ***************************************************************************/

const setReminderButton = document.getElementById("setReminderButton");
const cancelReminderButton = document.getElementById("cancelReminderButton");

if (setReminderButton) {
  setReminderButton.addEventListener("click", () => {
    const mins = parseInt(document.getElementById("reminderInterval").value, 10);

    if (isNaN(mins) || mins <= 0) {
      showToast("Enter a valid number");
      return;
    }

    if (reminderIntervalId) clearInterval(reminderIntervalId);

    reminderIntervalId = setInterval(() => {
      if (items.length === 0) {
        alert("Check your pockets!");
        return;
      }

      const listText = items
        .map(i => `${i.name}${i.location ? " (" + i.location + ")" : ""}`)
        .join(", ");

      alert("Reminder: " + listText);
    }, mins * 60 * 1000);

    showToast("Reminder set!");
  });
}

if (cancelReminderButton) {
  cancelReminderButton.addEventListener("click", () => {
    if (reminderIntervalId) {
      clearInterval(reminderIntervalId);
      reminderIntervalId = null;
      showToast("Reminder canceled");
    }
  });
}


/***************************************************************************
 *  TOAST POPUP FUNCTION
 ***************************************************************************/

function showToast(msg) {
  const toast = document.getElementById("toast");
  if (!toast) return;

  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2200);
}


/***************************************************************************
 *  INITIAL APP SETUP
 ***************************************************************************/

(async function init() {
  await initIndexedDB();
  updateStatus();
  await loadItems();
})();
