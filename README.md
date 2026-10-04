# PromptVault – AI Prompt Library

PromptVault is a simple, clean web app for saving, organizing, and reusing your favorite AI prompts. Built for a college Cloud Computing mini project using **Firebase (Spark/Free Plan)** as the backend and **plain HTML/CSS/JavaScript** on the frontend — no frameworks required.

---

## 1. Project Overview

**Features:**
- Email/password Register, Login, Logout, Forgot Password
- "Remember me" persistent login
- Dashboard with welcome message, total prompt count, and search
- Add / Edit / Delete / View / Copy prompts
- Favorite prompts with one click
- User-managed categories: add, rename, and delete (including the original built-in categories)
- Profile editing: name, password, profile picture (Firebase Storage)
- Fully responsive (desktop, tablet, mobile)

**Tech stack:**
- Frontend: HTML5, CSS3, Vanilla JavaScript (ES6 modules)
- Backend: Firebase Authentication, Firebase Firestore, Firebase Storage
- Hosting: GitHub Pages (or Firebase Hosting)

---

## 2. Firebase Setup

1. Go to [https://console.firebase.google.com](https://console.firebase.google.com) and create a new project.
2. Inside the project, go to **Build > Authentication > Get Started** → enable the **Email/Password** sign-in method.
3. Go to **Build > Firestore Database > Create Database** → start in **production mode** → choose your nearest region.
4. Go to **Build > Storage > Get Started** → keep default rules for now (we'll tighten them for prompts/favorites via `firestore.rules`).
5. Go to **Project Settings (gear icon) > General > Your apps** → click the **Web (</>)** icon → register the app (no need for Firebase Hosting SDK).
6. Copy the `firebaseConfig` object shown and paste it into `firebase.js`, replacing the placeholder values:

```js
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

7. Deploy the security rules from `firestore.rules` via **Firestore Database > Rules** tab (copy-paste and Publish).

> ⚠️ For a real production app, avoid committing real API keys to a public GitHub repo. For a college demo project this is generally acceptable since Firebase API keys are not secret by design — access is enforced by Firestore Security Rules, not the key itself.

---

## 3. Installation Steps (Local Testing)

Since this project uses ES6 modules (`type="module"`), you cannot simply double-click `index.html` — it must be served over `http://` or `https://`.

**Option A — VS Code Live Server extension (easiest):**
1. Open the `PromptVault` folder in VS Code.
2. Install the "Live Server" extension.
3. Right-click `index.html` → "Open with Live Server".

**Option B — Python simple server:**
```bash
cd PromptVault
python -m http.server 8000
```
Then open `http://localhost:8000` in your browser.

---

## 4. Deployment Steps (GitHub Pages)

1. Create a new GitHub repository (e.g. `promptvault`).
2. Push all project files to the repository:
```bash
git init
git add .
git commit -m "Initial commit - PromptVault"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/promptvault.git
git push -u origin main
```
3. In your GitHub repo, go to **Settings > Pages**.
4. Under **Source**, select the `main` branch and `/ (root)` folder → **Save**.
5. After a minute, GitHub will give you a live URL like:
   `https://YOUR_USERNAME.github.io/promptvault/`
6. In Firebase Console, go to **Authentication > Settings > Authorized domains** and add your GitHub Pages domain (e.g. `YOUR_USERNAME.github.io`) so login works on the live site.

---

## 5. Firestore Collections (Quick Reference)

See `database.md` for full field-level details.

| Collection | Purpose |
|---|---|
| `users` | User profile info |
| `prompts` | All saved prompts |
| `favorites` | User-to-prompt favorite mapping |
| `users/{uid}/categories` | User-owned category definitions |

---

## 6. Project Structure

```
PromptVault/
├── index.html        Login / Register / Forgot Password
├── dashboard.html     Main dashboard UI
├── style.css          All styling (purple/white/gray theme)
├── app.js             All frontend logic
├── firebase.js        Firebase config & initialization
├── firestore.rules    Firestore security rules
├── firebase.json       Firebase hosting/rules config
├── README.md           This file
├── .gitignore
└── database.md         Firestore schema documentation
```

---

## 7. Notes for Demo/Viva

- All data operations use Firebase's free Spark plan — no billing required.
- Firestore Security Rules ensure a user can only read/write their own prompts and favorites (see `firestore.rules`).
- The `onAuthStateChanged` listener in `app.js` automatically redirects unauthenticated users away from `dashboard.html` and logged-in users away from `index.html`.


### Category migration / existing users

The category update is backward-compatible with existing prompt data. The app keeps the existing `prompts.category` string field, initializes the original built-in categories per user when needed, and preserves any legacy category names already used by that user's prompts. Renaming a category updates only that user's matching prompts. Deleting a category moves its prompts to the protected `Uncategorized` category instead of deleting the prompts.
