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
    itemsCollection = db
      .collection("users")
      .doc(currentUser.uid)
      .collection("items");

    showToast("Signed in");
    loadItems();
  } else {
    itemsCollection = null;
    items = [];
    renderItems();
  }

  updateAuthUI();
});


/***************************************************************************
 *  SYNC LOGIC — On reconnect, send IndexedDB → Firestore
 ***************************************************************************/

async function handleReconnect() {
  updateStatus();
  if (!currentUser || !itemsCollection) return;

  showToast("Back online — syncing...");
  await syncLocalToFirebase();
}

async function syncLocalToFirebase() {
  if (!currentUser || !itemsCollection) return;

  const localItems = await idbGetAll();
  const userItems = localItems.filter(item => item.userId === currentUser.uid);

  if (userItems.length === 0) return;

  for (const item of userItems) {
    await itemsCollection.doc(item.id).set(item);
  }

  // After syncing, reload from Firestore so both sides share Firestore IDs
  await idbClear();
  await loadItemsFromFirebase();

  showToast("Sync complete!");
}


/***************************************************************************
 *  CRUD OPERATIONS
 ***************************************************************************/

let items = [];

async function addItem(name, locationText) {
  if (!currentUser) {
    showToast("Please sign in first");
    return;
  }

  const id = Date.now().toString();

  const item = {
    id,
    userId: currentUser.uid,
    name,
    location: locationText,
    timestamp: Date.now()
  };

  if (navigator.onLine && itemsCollection) {
    await itemsCollection.doc(id).set(item);
  } else {
    await idbAdd(item);
  }

  await loadItems();
  showToast("Item added!");
}

async function deleteItem(id) {
  if (!currentUser) {
    showToast("Please sign in first");
    return;
  }

  if (navigator.onLine && itemsCollection) {
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

const loginBtn = document.getElementById("loginButton");
const logoutBtn = document.getElementById("logoutButton");

if (loginBtn) {
  loginBtn.addEventListener("click", async () => {
    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      await auth.signInWithPopup(provider);
      // onAuthStateChanged will handle UI + data
    } catch (err) {
      console.error(err);
      showToast("Sign-in failed");
    }
  });
}

if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    try {
      await auth.signOut();
      // onAuthStateChanged will clear UI + data
    } catch (err) {
      console.error(err);
      showToast("Sign-out failed");
    }
  });
}

function updateAuthUI() {
  const userInfo = document.getElementById("userInfo");
  if (!userInfo || !loginBtn || !logoutBtn) return;

  if (currentUser) {
    userInfo.textContent =
      currentUser.displayName || currentUser.email || "Signed in";
    loginBtn.style.display = "none";
    logoutBtn.style.display = "inline-block";
  } else {
    userInfo.textContent = "Not signed in";
    loginBtn.style.display = "inline-block";
    logoutBtn.style.display = "none";
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
  // auth.onAuthStateChanged will call loadItems when logged in
})();
