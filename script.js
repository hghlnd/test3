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

// Firebase services
const db = firebase.firestore();
const auth = firebase.auth();

let currentUser = null;
let itemsCollection = null;
let isGuest = false;   // guest mode flag


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
  if (!statusText) return;

  statusText.textContent = navigator.onLine ? "Online" : "Offline";
  statusText.style.color = navigator.onLine ? "green" : "red";
}

window.addEventListener("online", handleReconnect);
window.addEventListener("offline", updateStatus);


/***************************************************************************
 *  AUTH STATE LISTENER
 ***************************************************************************/

auth.onAuthStateChanged(user => {
  currentUser = user;

  if (currentUser) {
    isGuest = false; // leaving guest mode
    itemsCollection = db
      .collection("users")
      .doc(currentUser.uid)
      .collection("items");

    showToast("Signed in");
    loadItems();
  } else {
    itemsCollection = null;

    // Only clear items if we are NOT in guest mode
    if (!isGuest) {
      items = [];
      renderItems();
    }
  }

  updateAuthUI();
});


/***************************************************************************
 *  SYNC LOGIC — On reconnect, send IndexedDB → Firestore
 ***************************************************************************/

async function handleReconnect() {
  updateStatus();
  if (!currentUser || !itemsCollection || isGuest) return;

  showToast("Back online — syncing...");
  await syncLocalToFirebase();
}

async function syncLocalToFirebase() {
  if (!currentUser || !itemsCollection || isGuest) return;

  const localItems = await idbGetAll();
  const userItems = localItems.filter(item => item.userId === currentUser.uid);

  if (userItems.length === 0) return;

  for (const item of userItems) {
    await itemsCollection.doc(item.id).set(item);
  }

  await idbClear();
  await loadItemsFromFirebase();

  showToast("Sync complete!");
}


/***************************************************************************
 *  CRUD OPERATIONS
 ***************************************************************************/

let items = [];

async function addItem(name, locationText) {
  const id = Date.now().toString();

  const item = {
    id,
    userId: currentUser ? currentUser.uid : null,
    name,
    location: locationText,
    timestamp: Date.now()
  };

  // Guest mode: in-memory only, no saving
  if (isGuest) {
    items.push(item);
    renderItems();
    showToast("Item added (guest — not saved)");
    return;
  }

  // Require sign-in if not guest
  if (!currentUser || !itemsCollection) {
    showToast("Please sign in or use guest mode");
    return;
  }

  if (navigator.onLine) {
    await itemsCollection.doc(id).set(item);
  } else {
    await idbAdd(item);
  }

  await loadItems();
  showToast("Item added!");
}

async function deleteItem(id) {
  // Guest mode: remove from local array only
  if (isGuest) {
    items = items.filter(i => i.id !== id);
    renderItems();
    showToast("Item deleted (guest)");
    return;
  }

  if (!currentUser || !itemsCollection) {
    showToast("Please sign in first");
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
  if (isGuest) {
    // In guest mode, items are only in memory
    renderItems();
    return;
  }

  if (!currentUser) {
    items = [];
    renderItems();
    return;
  }

  if (navigator.onLine && itemsCollection) {
    await loadItemsFromFirebase();
  } else {
    await loadItemsFromIndexedDB();
  }

  renderItems();
}

async function loadItemsFromFirebase() {
  if (!itemsCollection) {
    items = [];
    return;
  }
  const snapshot = await itemsCollection.orderBy("timestamp").get();
  items = snapshot.docs.map(doc => doc.data());
}

async function loadItemsFromIndexedDB() {
  if (!currentUser) {
    items = [];
    return;
  }
  const all = await idbGetAll();
  items = all.filter(item => item.userId === currentUser.uid);
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


/***************************************************************************
 *  USER INPUT HANDLERS
 ***************************************************************************/

document.getElementById("addItemButton").addEventListener("click", async () => {
  const name = document.getElementById("itemName").value.trim();
  const locationText = document.getElementById("itemLocation").value.trim();

  if (!name) {
    showToast("Please enter an item name");
    return;
  }

  await addItem(name, locationText);

  document.getElementById("itemName").value = "";
  document.getElementById("itemLocation").value = "";
});

document.getElementById("syncButton")?.addEventListener("click", async () => {
  if (isGuest) {
    showToast("Guest mode — nothing to sync");
    return;
  }

  if (!navigator.onLine) {
    showToast("Offline — Cannot sync");
    return;
  }

  if (!currentUser) {
    showToast("Please sign in first");
    return;
  }

  showToast("Syncing...");
  await syncLocalToFirebase();
});


/***************************************************************************
 *  AUTH BUTTON HANDLERS
 ***************************************************************************/

const loginEmailInput = document.getElementById("loginEmail");
const loginPasswordInput = document.getElementById("loginPassword");
const signupButton = document.getElementById("signupButton");
const signinButton = document.getElementById("signinButton");
const guestButton = document.getElementById("guestButton");
const logoutButton = document.getElementById("logoutButton");

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
      showToast("Sign-up failed");
    }
  });
}

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
      showToast("Sign-in failed");
    }
  });
}

if (guestButton) {
  guestButton.addEventListener("click", async () => {
    isGuest = true;
    if (auth.currentUser) {
      await auth.signOut();
    }
    items = [];
    renderItems();
    showToast("Guest mode — items will not be saved");
    updateAuthUI();
  });
}

if (logoutButton) {
  logoutButton.addEventListener("click", async () => {
    isGuest = false;
    try {
      await auth.signOut();
      showToast("Signed out");
    } catch (err) {
      console.error(err);
      showToast("Sign-out failed");
    }
  });
}

function updateAuthUI() {
  const userInfo = document.getElementById("userInfo");
  if (!userInfo) return;

  if (currentUser) {
    userInfo.textContent = currentUser.email || "Signed in";
    logoutButton.style.display = "inline-block";
    guestButton.style.display = "none";
  } else if (isGuest) {
    userInfo.textContent = "Guest mode (not saved)";
    logoutButton.style.display = "none";
    guestButton.style.display = "inline-block";
  } else {
    userInfo.textContent = "Not signed in";
    logoutButton.style.display = "none";
    guestButton.style.display = "inline-block";
  }
}


/***************************************************************************
 *  REMINDER SYSTEM
 ***************************************************************************/

let reminderIntervalId = null;

document.getElementById("setReminderButton").addEventListener("click", () => {
  const mins = parseInt(document.getElementById("reminderInterval").value);

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
      .map(i => `${i.name}${i.location ? ` (${i.location})` : ""}`)
      .join(", ");

    alert("Reminder: " + listText);
  }, mins * 60 * 1000);

  showToast("Reminder set!");
});

document.getElementById("cancelReminderButton")?.addEventListener("click", () => {
  if (reminderIntervalId) {
    clearInterval(reminderIntervalId);
    reminderIntervalId = null;
    showToast("Reminder canceled");
  }
});


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
  // auth.onAuthStateChanged will handle loading user data
})();
