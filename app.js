// ============================================================
// app.js
// All frontend logic for PromptVault lives in this single file.
// Organized into clearly labeled sections:
//   1. Auth (Register / Login / Logout / Forgot Password)
//   2. Auth State Router (redirects between index.html & dashboard.html)
//   3. Prompt CRUD (Add / Edit / Delete / View)
//   4. Search & Category Filter
//   5. Favorites
//   6. Profile (Name / Password / Profile Picture)
//   7. Utility helpers (toast, escaping, etc.)
// ============================================================

import { auth, db, storage, setAuthPersistence } from "./firebase.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  updatePassword,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  collection,
  addDoc,
  getDocs,
  writeBatch,
  query,
  where,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  ref,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

// ------------------------------------------------------------
// Shared state (kept simple, no framework needed)
// ------------------------------------------------------------
let currentUser = null;       // Firebase Auth user object
let allPrompts = [];           // Cached list of the user's prompts from Firestore
let favoriteIds = new Set();   // Set of promptIds marked favorite
let activeCategory = "All";    // Currently selected sidebar category
let searchTerm = "";           // Currently typed search text
let categories = [];             // User-owned categories (legacy prompts remain string-based)
let categoryInitPromise = null;
const DEFAULT_CATEGORIES = [
  "Writing",
  "Programming",
  "Graphic Design",
  "Video Editing",
  "Marketing",
  "Business",
  "Education",
  "Productivity",
  "AI Tools",
  "Coding",
  "Web Development",
  "UI/UX",
  "Social Media",
  "YouTube",
  "Blogging",
  "Resume",
  "Interview",
  "Story Writing",
  "Research",
  "Excel",
  "Finance",
  "Health",
  "Travel",
  "Gaming",
  "Custom Category"
];
const FALLBACK_CATEGORY = "Uncategorized";

// ============================================================
// 1. AUTH: Register / Login / Logout / Forgot Password
// (These handlers only exist / run on index.html)
// ============================================================

const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");
const forgotForm = document.getElementById("forgotForm");

if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;
    const remember = document.getElementById("rememberMe").checked;

    try {
      await setAuthPersistence(remember);
      await signInWithEmailAndPassword(auth, email, password);
      window.location.href = "dashboard.html";
    } catch (err) {
      showAuthMessage(friendlyAuthError(err), false);
    }
  });
}

if (registerForm) {
  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("registerName").value.trim();
    const email = document.getElementById("registerEmail").value.trim();
    const password = document.getElementById("registerPassword").value;
    const confirm = document.getElementById("registerConfirm").value;

    if (password !== confirm) {
      showAuthMessage("Passwords do not match.", false);
      return;
    }

    try {
      const userCred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(userCred.user, { displayName: name });

      // Create matching document in "users" collection
      await setDoc(doc(db, "users", userCred.user.uid), {
        name: name,
        email: email,
        photoURL: "",
        createdAt: serverTimestamp()
      });

      window.location.href = "dashboard.html";
    } catch (err) {
      showAuthMessage(friendlyAuthError(err), false);
    }
  });
}

if (forgotForm) {
  forgotForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("forgotEmail").value.trim();

    try {
      await sendPasswordResetEmail(auth, email);
      showAuthMessage("Reset link sent! Check your inbox.", true);
    } catch (err) {
      showAuthMessage(friendlyAuthError(err), false);
    }
  });
}

function showAuthMessage(message, isSuccess) {
  const box = document.getElementById("authMessage");
  if (!box) return;
  box.textContent = message;
  box.classList.remove("hidden", "success");
  if (isSuccess) box.classList.add("success");
}

function friendlyAuthError(err) {
  const code = err.code || "";
  if (code.includes("email-already-in-use")) return "This email is already registered.";
  if (code.includes("invalid-email")) return "Please enter a valid email address.";
  if (code.includes("weak-password")) return "Password should be at least 6 characters.";
  if (code.includes("user-not-found") || code.includes("wrong-password") || code.includes("invalid-credential")) {
    return "Incorrect email or password.";
  }
  return "Something went wrong. Please try again.";
}

// ============================================================
// 2. AUTH STATE ROUTER
// Runs on BOTH pages to keep the app in sync with login state.
// ============================================================

const isDashboardPage = document.body.classList.contains("dashboard-body");
const isAuthPage = document.body.classList.contains("auth-body");

onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    if (isAuthPage) {
      // Already logged in, skip the login screen
      window.location.href = "dashboard.html";
    }
    if (isDashboardPage) {
      await initDashboard();
    }
  } else {
    currentUser = null;
    if (isDashboardPage) {
      // Not logged in, kick back to login screen
      window.location.href = "index.html";
    }
  }
});

// ============================================================
// DASHBOARD INITIALIZATION (only runs on dashboard.html)
// ============================================================

async function initDashboard() {
  // Welcome message
  const userDocSnap = await getDoc(doc(db, "users", currentUser.uid));
  const userData = userDocSnap.exists() ? userDocSnap.data() : {};
  const displayName = userData.name || currentUser.displayName || "there";
  document.getElementById("welcomeMessage").textContent = `Welcome back, ${displayName}!`;

  // Pre-fill profile form
  document.getElementById("profileName").value = displayName;
  document.getElementById("profileEmail").value = currentUser.email;
  if (userData.photoURL) {
    document.getElementById("profilePicPreview").src = userData.photoURL;
  }

  // Logout button
  document.getElementById("logoutBtn").addEventListener("click", async () => {
    await signOut(auth);
  });

  // Live listener for this user's prompts
  const promptsQuery = query(collection(db, "prompts"), where("ownerId", "==", currentUser.uid));
  onSnapshot(promptsQuery, async (snapshot) => {
    allPrompts = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    await ensureCategories(allPrompts);
    renderPrompts();
  });

  // Live listener for this user's categories. Existing prompts are NOT rewritten just by loading the dashboard.
  const categoriesRef = collection(db, "users", currentUser.uid, "categories");
  onSnapshot(categoriesRef, (snapshot) => {
    categories = snapshot.docs
      .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    renderCategoryUI();
    renderPromptCategoryOptions();
  });

  // Live listener for this user's favorites
  const favQuery = query(collection(db, "favorites"), where("userId", "==", currentUser.uid));
  onSnapshot(favQuery, (snapshot) => {
    favoriteIds = new Set(snapshot.docs.map((d) => d.data().promptId));
    renderPrompts();
  });

  setupDashboardUI();
}

// ============================================================
// 3. PROMPT CRUD (Add / Edit / Delete / View)
// ============================================================

function setupDashboardUI() {
  const addPromptBtn = document.getElementById("addPromptBtn");
  const promptModal = document.getElementById("promptModal");
  const promptForm = document.getElementById("promptForm");
  const closePromptModal = document.getElementById("closePromptModal");

  addPromptBtn.addEventListener("click", () => openPromptModal());
  closePromptModal.addEventListener("click", () => promptModal.classList.add("hidden"));

  promptForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    await savePrompt();
  });

  // Search input
  document.getElementById("searchInput").addEventListener("input", (e) => {
    searchTerm = e.target.value.toLowerCase().trim();
    renderPrompts();
  });

  // Category sidebar clicks are attached dynamically in renderCategoryUI().
  document.getElementById("addCategoryBtn").addEventListener("click", () => openCategoryModal());
  document.getElementById("closeCategoryModal").addEventListener("click", () => {
    document.getElementById("categoryModal").classList.add("hidden");
  });
  document.getElementById("categoryForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    await saveCategory();
  });

  // View modal close
  document.getElementById("closeViewModal").addEventListener("click", () => {
    document.getElementById("viewModal").classList.add("hidden");
  });

  // Profile modal open/close
  document.getElementById("profileBtn").addEventListener("click", () => {
    document.getElementById("profileModal").classList.remove("hidden");
  });
  document.getElementById("closeProfileModal").addEventListener("click", () => {
    document.getElementById("profileModal").classList.add("hidden");
  });

  document.getElementById("profileForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    await saveProfile();
  });

  document.getElementById("profilePicInput").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) {
      document.getElementById("profilePicPreview").src = URL.createObjectURL(file);
    }
  });
}

function openPromptModal(prompt = null) {
  const modal = document.getElementById("promptModal");
  const title = document.getElementById("promptModalTitle");

  if (prompt) {
    title.textContent = "Edit Prompt";
    document.getElementById("promptId").value = prompt.id;
    document.getElementById("promptTitle").value = prompt.title;
    document.getElementById("promptContent").value = prompt.content;
    renderPromptCategoryOptions(prompt.category);
    document.getElementById("promptCategory").value = prompt.category;
    document.getElementById("promptTags").value = (prompt.tags || []).join(", ");
    document.getElementById("promptAiModel").value = prompt.aiModel || "";
  } else {
    title.textContent = "Add Prompt";
    document.getElementById("promptForm").reset();
    document.getElementById("promptId").value = "";
    renderPromptCategoryOptions();
  }

  modal.classList.remove("hidden");
}

async function ensureCategories(prompts) {
  if (!currentUser) return;
  if (categoryInitPromise) return categoryInitPromise;

  categoryInitPromise = (async () => {
    const categoryCollection = collection(db, "users", currentUser.uid, "categories");
    const settingsRef = doc(db, "users", currentUser.uid, "categorySettings", "config");
    const [settingsSnap, snapshot] = await Promise.all([
      getDoc(settingsRef),
      getDocs(categoryCollection)
    ]);

    // The initialization marker makes category deletion permanent.
    // Once the user has initialized categories, never recreate a category
    // just because its document is missing.
    if (settingsSnap.exists() && settingsSnap.data().initialized === true) {
      return;
    }

    // Existing users from an earlier version already have category documents.
    // Mark them initialized without recreating anything they may have deleted.
    if (!snapshot.empty) {
      await setDoc(settingsRef, {
        initialized: true,
        ownerId: currentUser.uid,
        initializedAt: serverTimestamp()
      }, { merge: true });
      return;
    }

    // First-time category setup: create the original built-in categories.
    // Uncategorized is NOT stored as a normal category. It is a system
    // navigation/filter item and is only used as a fallback prompt value.
    const missing = [];

    DEFAULT_CATEGORIES.forEach((name, index) => {
      const id = `builtin-${String(index + 1).padStart(2, "0")}`;
      missing.push({
        id,
        name,
        isBuiltin: true,
        isFallback: false
      });
    });

    // Preserve category names already used by existing prompts, including
    // legacy/custom categories from before this feature.
    const usedNames = new Set();
    prompts.forEach((prompt) => {
      const name = (prompt.category || "").trim();
      if (name && name !== FALLBACK_CATEGORY) usedNames.add(name);
    });

    usedNames.forEach((name) => {
      const alreadyExists = missing.some(
        (category) => category.name.toLowerCase() === name.toLowerCase()
      );

      if (!alreadyExists) {
        missing.push({
          id: `legacy-${stableHash(name)}`,
          name,
          isBuiltin: false,
          isFallback: false,
          isLegacy: true
        });
      }
    });

    const batch = writeBatch(db);

    missing.forEach((category) => {
      batch.set(
        doc(categoryCollection, category.id),
        {
          name: category.name,
          ownerId: currentUser.uid,
          isBuiltin: !!category.isBuiltin,
          isFallback: false,
          createdAt: serverTimestamp()
        },
        { merge: true }
      );
    });

    batch.set(settingsRef, {
      initialized: true,
      ownerId: currentUser.uid,
      initializedAt: serverTimestamp()
    }, { merge: true });

    await batch.commit();
  })();

  try {
    await categoryInitPromise;
  } finally {
    categoryInitPromise = null;
  }
}
function stableHash(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function renderCategoryUI() {
  const list = document.getElementById("categoryList");
  if (!list) return;

  list.innerHTML = "";
  list.appendChild(buildSpecialCategoryItem("All", "All Prompts"));
  list.appendChild(buildSpecialCategoryItem("Favorites", "⭐ Favorites"));
  list.appendChild(buildSpecialCategoryItem(FALLBACK_CATEGORY, "Uncategorized"));

  // Only user-managed categories appear below the system items.
  // Uncategorized is intentionally excluded from this list.
  categories
    .filter((category) => !category.isFallback && category.name !== FALLBACK_CATEGORY)
    .forEach((category) => {
      list.appendChild(buildCategoryItem(category));
    });

  // Keep the current selection when categories refresh; otherwise fall back to All.
  const active = [...list.querySelectorAll(".category-item")].find((item) => item.dataset.category === activeCategory);
  if (active) active.classList.add("active");
  else {
    activeCategory = "All";
    list.querySelector('[data-category="All"]')?.classList.add("active");
  }
}

function buildSpecialCategoryItem(value, label) {
  const item = document.createElement("li");
  item.className = "category-item";
  item.dataset.category = value;
  item.innerHTML = `<span class="category-name">${escapeHtml(label)}</span>`;
  attachCategorySelection(item);
  return item;
}

function buildCategoryItem(category) {
  const item = document.createElement("li");
  item.className = "category-item category-managed";
  item.dataset.category = category.name;

  const name = document.createElement("span");
  name.className = "category-name";
  name.textContent = category.name;

  const actions = document.createElement("span");
  actions.className = "category-actions";

  const renameBtn = document.createElement("button");
  renameBtn.type = "button";
  renameBtn.className = "category-action-btn";
  renameBtn.title = `Rename ${category.name}`;
  renameBtn.setAttribute("aria-label", `Rename ${category.name}`);
  renameBtn.textContent = "✏️";
  renameBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    openCategoryModal(category);
  });

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "category-action-btn delete-category-action";
  deleteBtn.title = `Delete ${category.name}`;
  deleteBtn.setAttribute("aria-label", `Delete ${category.name}`);
  deleteBtn.textContent = "🗑️";
  deleteBtn.addEventListener("click", async (event) => {
    event.stopPropagation();
    await deleteCategory(category);
  });

  actions.append(renameBtn, deleteBtn);
  item.append(name, actions);
  attachCategorySelection(item);
  return item;
}

function attachCategorySelection(item) {
  item.addEventListener("click", () => {
    document.querySelectorAll(".category-item").forEach((el) => el.classList.remove("active"));
    item.classList.add("active");
    activeCategory = item.dataset.category;
    renderPrompts();
    document.getElementById("sidebar").classList.remove("sidebar-open");
  });
}

function renderPromptCategoryOptions(selectedCategory = "") {
  const select = document.getElementById("promptCategory");
  if (!select) return;

  const names = categories
    .filter((category) => !category.isFallback && category.name !== FALLBACK_CATEGORY)
    .map((category) => category.name);

  // Uncategorized is a system fallback and is available as a prompt value,
  // but it is not a user-managed category.
  names.push(FALLBACK_CATEGORY);

  if (selectedCategory && !names.includes(selectedCategory)) names.push(selectedCategory);
  if (!names.length) names.push(FALLBACK_CATEGORY);

  select.innerHTML = names.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("");
  if (selectedCategory) select.value = selectedCategory;
}

function openCategoryModal(category = null) {
  const modal = document.getElementById("categoryModal");
  const title = document.getElementById("categoryModalTitle");
  const input = document.getElementById("categoryName");
  const idInput = document.getElementById("categoryId");

  title.textContent = category ? "Rename Category" : "Add Category";
  input.value = category ? category.name : "";
  idInput.value = category ? category.id : "";
  modal.classList.remove("hidden");
  setTimeout(() => input.focus(), 0);
}

async function saveCategory() {
  const id = document.getElementById("categoryId").value;
  const name = document.getElementById("categoryName").value.trim();

  if (!name) {
    showToast("Please enter a category name.", "error");
    return;
  }
  if (name.length > 50) {
    showToast("Category name must be 50 characters or less.", "error");
    return;
  }

  if (name.toLowerCase() === FALLBACK_CATEGORY.toLowerCase()) {
    showToast("Uncategorized is a system feature and cannot be created or renamed.", "error");
    return;
  }

  const duplicate = categories.some((category) =>
    category.id !== id &&
    !category.isFallback &&
    category.name.trim().toLowerCase() === name.toLowerCase()
  );
  if (duplicate) {
    showToast("That category already exists.", "error");
    return;
  }

  try {
    if (!id) {
      await addDoc(collection(db, "users", currentUser.uid, "categories"), {
        name,
        ownerId: currentUser.uid,
        isBuiltin: false,
        isFallback: false,
        createdAt: serverTimestamp()
      });
      activeCategory = name;
      showToast("Category added!", "success");
    } else {
      const category = categories.find((item) => item.id === id);
      if (!category) return;
      if (category.isFallback || category.name === FALLBACK_CATEGORY) {
        showToast("Uncategorized is a system feature and cannot be renamed.", "error");
        return;
      }

      const oldName = category.name;
      await renamePromptCategory(oldName, name);
      await updateDoc(doc(db, "users", currentUser.uid, "categories", id), { name });
      if (activeCategory === oldName) activeCategory = name;
      showToast("Category renamed!", "success");
    }

    document.getElementById("categoryModal").classList.add("hidden");
  } catch (err) {
    console.error(err);
    showToast("Could not save category.", "error");
  }
}

async function renamePromptCategory(oldName, newName) {
  if (oldName === newName) return;
  const promptQuery = query(collection(db, "prompts"), where("ownerId", "==", currentUser.uid));
  const snapshot = await getDocs(promptQuery);
  const matchingDocs = snapshot.docs.filter((promptDoc) => promptDoc.data().category === oldName);
  await updatePromptCategoriesInBatches(matchingDocs, newName);
}

async function deleteCategory(category) {
  if (category.isFallback || category.name === FALLBACK_CATEGORY) {
    showToast("Uncategorized is a system feature and cannot be deleted.", "error");
    return;
  }

  const confirmed = confirm(`Delete "${category.name}"? Prompts in this category will be moved to Uncategorized, not deleted.`);
  if (!confirmed) return;

  try {
    const promptQuery = query(collection(db, "prompts"), where("ownerId", "==", currentUser.uid));
    const snapshot = await getDocs(promptQuery);
    const matchingDocs = snapshot.docs.filter((promptDoc) => promptDoc.data().category === category.name);
    await updatePromptCategoriesInBatches(matchingDocs, FALLBACK_CATEGORY);
    await deleteDoc(doc(db, "users", currentUser.uid, "categories", category.id));

    if (activeCategory === category.name) activeCategory = "All";
    showToast("Category deleted. Prompts were kept safe.", "success");
  } catch (err) {
    console.error(err);
    showToast("Could not delete category.", "error");
  }
}

async function updatePromptCategoriesInBatches(promptDocs, newCategory) {
  // Firestore batches are limited to 500 writes.
  for (let start = 0; start < promptDocs.length; start += 450) {
    const batch = writeBatch(db);
    promptDocs.slice(start, start + 450).forEach((promptDoc) => {
      batch.update(promptDoc.ref, { category: newCategory });
    });
    if (start < promptDocs.length) await batch.commit();
  }
}

async function savePrompt() {
  const id = document.getElementById("promptId").value;
  const title = document.getElementById("promptTitle").value.trim();
  const content = document.getElementById("promptContent").value.trim();
  const category = document.getElementById("promptCategory").value;
  const tags = document.getElementById("promptTags").value
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const aiModel = document.getElementById("promptAiModel").value.trim();

  const promptData = { title, content, category, tags, aiModel, ownerId: currentUser.uid };

  try {
    if (id) {
      // Editing existing prompt
      await updateDoc(doc(db, "prompts", id), promptData);
      showToast("Prompt updated!", "success");
    } else {
      // Creating new prompt
      promptData.createdAt = serverTimestamp();
      await addDoc(collection(db, "prompts"), promptData);
      showToast("Prompt added!", "success");
    }
    document.getElementById("promptModal").classList.add("hidden");
  } catch (err) {
    showToast("Failed to save prompt.", "error");
  }
}

async function deletePrompt(promptId) {
  const confirmed = confirm("Delete this prompt? This cannot be undone.");
  if (!confirmed) return;

  try {
    await deleteDoc(doc(db, "prompts", promptId));
    showToast("Prompt deleted.", "success");
  } catch (err) {
    showToast("Failed to delete prompt.", "error");
  }
}

function viewPrompt(prompt) {
  document.getElementById("viewPromptTitle").textContent = prompt.title;
  document.getElementById("viewPromptCategory").textContent = prompt.category;
  document.getElementById("viewPromptModel").textContent = prompt.aiModel || "No model set";
  document.getElementById("viewPromptContent").textContent = prompt.content;
  document.getElementById("viewPromptTags").textContent = (prompt.tags || []).map((t) => `#${t}`).join("  ");
  document.getElementById("viewPromptDate").textContent = formatDate(prompt.createdAt);

  const copyBtn = document.getElementById("copyFromViewBtn");
  copyBtn.onclick = () => copyToClipboard(prompt.content);

  document.getElementById("viewModal").classList.remove("hidden");
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text)
    .then(() => showToast("Copied to clipboard!", "success"))
    .catch(() => showToast("Copy failed.", "error"));
}

// ============================================================
// 5. FAVORITES
// ============================================================

async function toggleFavorite(promptId) {
  const favDocId = `${currentUser.uid}_${promptId}`;
  const favRef = doc(db, "favorites", favDocId);

  try {
    if (favoriteIds.has(promptId)) {
      await deleteDoc(favRef);
    } else {
      await setDoc(favRef, { userId: currentUser.uid, promptId, createdAt: serverTimestamp() });
    }
  } catch (err) {
    showToast("Could not update favorite.", "error");
  }
}

// ============================================================
// 4. RENDER + SEARCH/FILTER LOGIC
// ============================================================

function renderPrompts() {
  let filtered = [...allPrompts];

  // Category filter
  if (activeCategory === "Favorites") {
    filtered = filtered.filter((p) => favoriteIds.has(p.id));
  } else if (activeCategory === FALLBACK_CATEGORY) {
    filtered = filtered.filter((p) => !p.category || p.category === FALLBACK_CATEGORY);
  } else if (activeCategory !== "All") {
    filtered = filtered.filter((p) => p.category === activeCategory);
  }

  // Search filter (title, content, tags)
  if (searchTerm) {
    filtered = filtered.filter((p) => {
      const haystack = [p.title, p.content, ...(p.tags || [])].join(" ").toLowerCase();
      return haystack.includes(searchTerm);
    });
  }

  const grid = document.getElementById("promptGrid");
  const emptyState = document.getElementById("emptyState");
  grid.innerHTML = "";

  document.getElementById("totalPromptCount").textContent = allPrompts.length;

  if (filtered.length === 0) {
    emptyState.classList.remove("hidden");
    return;
  }
  emptyState.classList.add("hidden");

  filtered.forEach((prompt) => {
    grid.appendChild(buildPromptCard(prompt));
  });
}

function buildPromptCard(prompt) {
  const card = document.createElement("div");
  card.className = "prompt-card";

  const isFav = favoriteIds.has(prompt.id);

  card.innerHTML = `
    <div class="prompt-card-header">
      <span class="prompt-card-title">${escapeHtml(prompt.title)}</span>
      <span class="favorite-star ${isFav ? "active" : ""}" data-id="${prompt.id}">★</span>
    </div>
    <span class="badge">${escapeHtml(prompt.category)}</span>
    <p class="prompt-card-preview">${escapeHtml(prompt.content)}</p>
    <div class="prompt-card-actions">
      <button class="view-btn">View</button>
      <button class="copy-btn">Copy</button>
      <button class="edit-btn">Edit</button>
      <button class="delete-btn">Delete</button>
    </div>
  `;

  card.querySelector(".favorite-star").addEventListener("click", () => toggleFavorite(prompt.id));
  card.querySelector(".view-btn").addEventListener("click", () => viewPrompt(prompt));
  card.querySelector(".copy-btn").addEventListener("click", () => copyToClipboard(prompt.content));
  card.querySelector(".edit-btn").addEventListener("click", () => openPromptModal(prompt));
  card.querySelector(".delete-btn").addEventListener("click", () => deletePrompt(prompt.id));

  return card;
}

// ============================================================
// 6. PROFILE (Name / Password / Profile Picture)
// ============================================================

async function saveProfile() {
  const name = document.getElementById("profileName").value.trim();
  const newPassword = document.getElementById("profileNewPassword").value;
  const file = document.getElementById("profilePicInput").files[0];

  try {
    let photoURL = null;

    // Upload new profile picture if selected (Firebase Storage, Spark plan compatible)
    if (file) {
      const fileRef = ref(storage, `profilePictures/${currentUser.uid}`);
      await uploadBytes(fileRef, file);
      photoURL = await getDownloadURL(fileRef);
      await updateProfile(currentUser, { photoURL });
    }

    // Update name
    await updateProfile(currentUser, { displayName: name });

    // Update Firestore "users" doc
    const updateData = { name };
    if (photoURL) updateData.photoURL = photoURL;
    await updateDoc(doc(db, "users", currentUser.uid), updateData);

    // Update password if provided
    if (newPassword) {
      await updatePassword(currentUser, newPassword);
    }

    document.getElementById("welcomeMessage").textContent = `Welcome back, ${name}!`;
    document.getElementById("profileModal").classList.add("hidden");
    showToast("Profile updated!", "success");
  } catch (err) {
    showToast("Could not update profile. You may need to re-login.", "error");
  }
}

// ============================================================
// 7. UTILITY HELPERS
// ============================================================

function showToast(message, type) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.className = `toast ${type}`;
  setTimeout(() => toast.classList.add("hidden"), 2500);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

function formatDate(timestamp) {
  if (!timestamp || !timestamp.toDate) return "";
  return timestamp.toDate().toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}
