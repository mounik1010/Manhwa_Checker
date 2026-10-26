/**
 * Manhwa Checker - Core Application Logic
 * 
 * GitHub Pages PWA + Cloudflare Worker CORS Proxy
 */

// Default Cloudflare Worker URL - User can configure in Settings modal
export const DEFAULT_WORKER_URL = "https://manhwa-proxy.yourname.workers.dev";
const STORAGE_KEY = "manhwa-checker:v1";

// In-session cache for chapter readability to avoid redundant network requests
const chapterReadabilityCache = new Map();

// Global runtime state
let state = {
  titles: [],
  settings: {
    theme: "system",
    workerUrl: DEFAULT_WORKER_URL,
  },
};

// Current active "Available to read" verification results
let availableResults = [];
let unverifiedTitles = [];

// Undo Toast state
let undoTimer = null;
let currentUndoAction = null;

// DOM Elements
let el = {};

/* ==========================================================================
   Initialization
   ========================================================================== */

document.addEventListener("DOMContentLoaded", () => {
  cacheDOMElements();
  loadData();
  applyTheme(state.settings.theme);
  bindEvents();
  renderMyList();
  renderAvailableSection();
  registerServiceWorker();
});

function cacheDOMElements() {
  el = {
    themeToggleBtn: document.getElementById("themeToggleBtn"),
    themeIconSun: document.getElementById("themeIconSun"),
    themeIconMoon: document.getElementById("themeIconMoon"),
    themeIconSystem: document.getElementById("themeIconSystem"),
    settingsBtn: document.getElementById("settingsBtn"),
    checkBtn: document.getElementById("checkBtn"),
    checkBtnText: document.getElementById("checkBtnText"),
    checkStatusMsg: document.getElementById("checkStatusMsg"),
    availableSection: document.getElementById("availableSection"),
    availableHeader: document.getElementById("availableHeader"),
    availableBadge: document.getElementById("availableBadge"),
    availableBody: document.getElementById("availableBody"),
    availableCardsContainer: document.getElementById("availableCardsContainer"),
    availableEmptyState: document.getElementById("availableEmptyState"),
    unverifiedBox: document.getElementById("unverifiedBox"),
    openAllBtn: document.getElementById("openAllBtn"),
    addTitleForm: document.getElementById("addTitleForm"),
    titleNameInput: document.getElementById("titleNameInput"),
    titleChapterInput: document.getElementById("titleChapterInput"),
    titlesListContainer: document.getElementById("titlesListContainer"),
    titlesCountBadge: document.getElementById("titlesCountBadge"),
    exportBtn: document.getElementById("exportBtn"),
    importBtn: document.getElementById("importBtn"),
    importFileInput: document.getElementById("importFileInput"),
    undoToast: document.getElementById("undoToast"),
    toastMessage: document.getElementById("toastMessage"),
    toastUndoBtn: document.getElementById("toastUndoBtn"),
    toastCloseBtn: document.getElementById("toastCloseBtn"),
    settingsModal: document.getElementById("settingsModal"),
    closeSettingsModal: document.getElementById("closeSettingsModal"),
    workerUrlInput: document.getElementById("workerUrlInput"),
    saveSettingsBtn: document.getElementById("saveSettingsBtn"),
    editTitleModal: document.getElementById("editTitleModal"),
    closeEditModal: document.getElementById("closeEditModal"),
    cancelEditBtn: document.getElementById("cancelEditBtn"),
    editTitleNameInput: document.getElementById("editTitleNameInput"),
    saveEditBtn: document.getElementById("saveEditBtn"),
    deleteConfirmModal: document.getElementById("deleteConfirmModal"),
    closeDeleteModal: document.getElementById("closeDeleteModal"),
    cancelDeleteBtn: document.getElementById("cancelDeleteBtn"),
    confirmDeleteBtn: document.getElementById("confirmDeleteBtn"),
    deleteConfirmText: document.getElementById("deleteConfirmText"),
    importChoiceModal: document.getElementById("importChoiceModal"),
    closeImportModal: document.getElementById("closeImportModal"),
    cancelImportBtn: document.getElementById("cancelImportBtn"),
    importMergeBtn: document.getElementById("importMergeBtn"),
    importReplaceBtn: document.getElementById("importReplaceBtn"),
    importSummaryText: document.getElementById("importSummaryText"),
  };
}

/* ==========================================================================
   Data Persistence (localStorage)
   ========================================================================== */

function getPreloadTitles() {
  return [
    {
      id: generateId(),
      name: "The Demonic Cult Instructor Returns",
      read: 0,
      slug: "/comics/the-demonic-cult-instructor-returns-3ebcc5a9",
    },
    {
      id: generateId(),
      name: "I Am the Fated Villain",
      read: 0,
      slug: "/comics/i-am-the-fated-villain-3ebcc5a9",
    },
  ];
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      state.titles = getPreloadTitles();
      state.settings = {
        theme: "system",
        workerUrl: DEFAULT_WORKER_URL,
      };
      saveData();
      return;
    }

    const parsed = JSON.parse(raw);
    state.titles = Array.isArray(parsed.titles) ? parsed.titles : getPreloadTitles();
    state.settings = {
      theme: parsed.settings?.theme || "system",
      workerUrl: parsed.settings?.workerUrl || DEFAULT_WORKER_URL,
    };

    // Sanitize titles
    state.titles = state.titles.map((t) => ({
      id: t.id || generateId(),
      name: String(t.name || "").trim(),
      read: Math.max(0, parseInt(t.read, 10) || 0),
      slug: t.slug || null,
    }));
  } catch (err) {
    console.error("Failed to load state from localStorage:", err);
    state.titles = getPreloadTitles();
    state.settings = { theme: "system", workerUrl: DEFAULT_WORKER_URL };
  }
}

function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.error("Failed to save state to localStorage:", err);
  }
}

function generateId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "id-" + Date.now() + "-" + Math.random().toString(36).substr(2, 9);
}

/* ==========================================================================
   Theme Management
   ========================================================================== */

function applyTheme(theme) {
  state.settings.theme = theme;
  saveData();

  if (theme === "dark") {
    document.documentElement.dataset.theme = "dark";
    el.themeIconSun.style.display = "none";
    el.themeIconMoon.style.display = "block";
    el.themeIconSystem.style.display = "none";
  } else if (theme === "light") {
    document.documentElement.dataset.theme = "light";
    el.themeIconSun.style.display = "block";
    el.themeIconMoon.style.display = "none";
    el.themeIconSystem.style.display = "none";
  } else {
    // System
    document.documentElement.removeAttribute("data-theme");
    el.themeIconSun.style.display = "none";
    el.themeIconMoon.style.display = "none";
    el.themeIconSystem.style.display = "block";
  }

  // Update theme option in settings dialog
  document.querySelectorAll(".theme-option").forEach((opt) => {
    opt.classList.toggle("is-selected", opt.dataset.themeVal === theme);
  });
}

function cycleTheme() {
  const current = state.settings.theme;
  if (current === "system") applyTheme("dark");
  else if (current === "dark") applyTheme("light");
  else applyTheme("system");
}

/* ==========================================================================
   Event Listeners
   ========================================================================== */

let pendingEditTitleId = null;
let pendingDeleteTitleId = null;
let pendingImportData = null;

function bindEvents() {
  // Theme Toggle Button
  el.themeToggleBtn.addEventListener("click", cycleTheme);

  // Settings Modal
  el.settingsBtn.addEventListener("click", () => {
    el.workerUrlInput.value = state.settings.workerUrl || "";
    document.querySelectorAll(".theme-option").forEach((opt) => {
      opt.classList.toggle("is-selected", opt.dataset.themeVal === state.settings.theme);
    });
    openModal(el.settingsModal);
  });
  el.closeSettingsModal.addEventListener("click", () => closeModal(el.settingsModal));
  el.saveSettingsBtn.addEventListener("click", () => {
    state.settings.workerUrl = el.workerUrlInput.value.trim() || DEFAULT_WORKER_URL;
    saveData();
    closeModal(el.settingsModal);
    showStatusMsg("Settings saved.", 2500);
  });

  // Settings theme selector options
  document.querySelectorAll(".theme-option").forEach((opt) => {
    opt.addEventListener("click", () => {
      applyTheme(opt.dataset.themeVal);
    });
  });

  // Big Check Button
  el.checkBtn.addEventListener("click", handleCheck);

  // Available Section Header Collapse/Expand
  el.availableHeader.addEventListener("click", (e) => {
    // Avoid collapse when clicking "Open all"
    if (e.target.closest("#openAllBtn")) return;
    toggleAvailableSection();
  });

  // Available Section "Open all" button
  el.openAllBtn.addEventListener("click", handleOpenAll);

  // Add Title Form
  el.addTitleForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = el.titleNameInput.value.trim();
    const chapter = Math.max(0, parseInt(el.titleChapterInput.value, 10) || 0);
    if (!name) return;

    // Check duplicate
    const normalized = normalizeName(name);
    const existing = state.titles.find((t) => normalizeName(t.name) === normalized);
    if (existing) {
      alert(`"${name}" is already in your tracked list.`);
      return;
    }

    state.titles.unshift({
      id: generateId(),
      name,
      read: chapter,
      slug: null,
    });

    saveData();
    renderMyList();
    el.titleNameInput.value = "";
    el.titleChapterInput.value = "0";
    el.titleNameInput.focus();
  });

  // Export JSON
  el.exportBtn.addEventListener("click", handleExport);

  // Import JSON
  el.importBtn.addEventListener("click", () => el.importFileInput.click());
  el.importFileInput.addEventListener("change", handleImportFile);

  // Import Choice Modal buttons
  el.closeImportModal.addEventListener("click", () => closeModal(el.importChoiceModal));
  el.cancelImportBtn.addEventListener("click", () => closeModal(el.importChoiceModal));
  el.importMergeBtn.addEventListener("click", () => applyImport("merge"));
  el.importReplaceBtn.addEventListener("click", () => applyImport("replace"));

  // Edit Title Modal
  el.closeEditModal.addEventListener("click", () => closeModal(el.editTitleModal));
  el.cancelEditBtn.addEventListener("click", () => closeModal(el.editTitleModal));
  el.saveEditBtn.addEventListener("click", handleSaveEditTitle);

  // Delete Title Modal
  el.closeDeleteModal.addEventListener("click", () => closeModal(el.deleteConfirmModal));
  el.cancelDeleteBtn.addEventListener("click", () => closeModal(el.deleteConfirmModal));
  el.confirmDeleteBtn.addEventListener("click", handleConfirmDeleteTitle);

  // Toast events
  el.toastCloseBtn.addEventListener("click", hideUndoToast);
  el.toastUndoBtn.addEventListener("click", () => {
    if (currentUndoAction) {
      currentUndoAction();
      hideUndoToast();
    }
  });

  // Listen to system theme change if in "system" mode
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (state.settings.theme === "system") {
      applyTheme("system");
    }
  });
}

function openModal(modal) {
  modal.classList.add("is-open");
}

function closeModal(modal) {
  modal.classList.remove("is-open");
}

function toggleAvailableSection() {
  const isOpen = el.availableBody.classList.contains("is-open");
  if (isOpen) {
    el.availableBody.classList.remove("is-open");
    el.availableHeader.classList.remove("is-open");
    el.availableHeader.setAttribute("aria-expanded", "false");
  } else {
    el.availableBody.classList.add("is-open");
    el.availableHeader.classList.add("is-open");
    el.availableHeader.setAttribute("aria-expanded", "true");
  }
}

function setAvailableSectionOpen(open) {
  if (open) {
    el.availableBody.classList.add("is-open");
    el.availableHeader.classList.add("is-open");
    el.availableHeader.setAttribute("aria-expanded", "true");
  } else {
    el.availableBody.classList.remove("is-open");
    el.availableHeader.classList.remove("is-open");
    el.availableHeader.setAttribute("aria-expanded", "false");
  }
}

/* ==========================================================================
   "My List" Rendering & Interactions
   ========================================================================== */

function renderMyList() {
  el.titlesCountBadge.textContent = `${state.titles.length} ${state.titles.length === 1 ? "title" : "titles"}`;
  el.titlesListContainer.innerHTML = "";

  if (state.titles.length === 0) {
    el.titlesListContainer.innerHTML = `
      <div class="empty-state">
        <div>No titles tracked yet.</div>
        <div class="empty-state-hint">Use the form above to add your first manhwa.</div>
      </div>
    `;
    return;
  }

  state.titles.forEach((title) => {
    const row = document.createElement("div");
    row.className = "title-row";
    row.dataset.id = title.id;

    // Title text & action buttons
    const titleInfo = document.createElement("div");
    titleInfo.className = "title-info";

    const nameText = document.createElement("span");
    nameText.className = "title-name-text";
    nameText.textContent = title.name;
    nameText.title = title.name;

    const editBtn = document.createElement("button");
    editBtn.className = "row-action-btn";
    editBtn.title = "Edit title name";
    editBtn.setAttribute("aria-label", `Edit name for ${title.name}`);
    editBtn.innerHTML = `
      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
      </svg>
    `;
    editBtn.addEventListener("click", () => openEditModal(title.id, title.name));

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "row-action-btn delete-btn";
    deleteBtn.title = "Delete title";
    deleteBtn.setAttribute("aria-label", `Delete ${title.name}`);
    deleteBtn.innerHTML = `
      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
      </svg>
    `;
    deleteBtn.addEventListener("click", () => openDeleteModal(title.id, title.name));

    titleInfo.appendChild(nameText);
    titleInfo.appendChild(editBtn);
    titleInfo.appendChild(deleteBtn);

    // Stepper: [ - ] [ input ] [ + ]
    const stepper = document.createElement("div");
    stepper.className = "stepper-container";

    const minusBtn = document.createElement("button");
    minusBtn.className = "stepper-btn";
    minusBtn.textContent = "−";
    minusBtn.title = "Decrease chapter";
    minusBtn.setAttribute("aria-label", `Decrease chapter for ${title.name}`);

    const numberInput = document.createElement("input");
    numberInput.type = "number";
    numberInput.className = "stepper-input";
    numberInput.min = "0";
    numberInput.value = title.read;
    numberInput.setAttribute("aria-label", `Read chapter number for ${title.name}`);

    const plusBtn = document.createElement("button");
    plusBtn.className = "stepper-btn";
    plusBtn.textContent = "+";
    plusBtn.title = "Increase chapter";
    plusBtn.setAttribute("aria-label", `Increase chapter for ${title.name}`);

    // Stepper event handlers (manual typing and +/- do NOT trigger undo toast per §2 & §5)
    minusBtn.addEventListener("click", () => {
      if (title.read > 0) {
        title.read -= 1;
        numberInput.value = title.read;
        saveData();
        updateAvailableCardsForTitle(title.id, title.read);
      }
    });

    plusBtn.addEventListener("click", () => {
      title.read += 1;
      numberInput.value = title.read;
      saveData();
      updateAvailableCardsForTitle(title.id, title.read);
    });

    numberInput.addEventListener("change", () => {
      const parsed = parseInt(numberInput.value, 10);
      const newVal = isNaN(parsed) || parsed < 0 ? 0 : parsed;
      title.read = newVal;
      numberInput.value = newVal;
      saveData();
      updateAvailableCardsForTitle(title.id, title.read);
    });

    stepper.appendChild(minusBtn);
    stepper.appendChild(numberInput);
    stepper.appendChild(plusBtn);

    row.appendChild(titleInfo);
    row.appendChild(stepper);
    el.titlesListContainer.appendChild(row);
  });
}

function updateTitleInputInDOM(titleId, newRead) {
  const row = el.titlesListContainer.querySelector(`.title-row[data-id="${titleId}"]`);
  if (row) {
    const input = row.querySelector(".stepper-input");
    if (input) input.value = newRead;
  }
}

function openEditModal(id, currentName) {
  pendingEditTitleId = id;
  el.editTitleNameInput.value = currentName;
  openModal(el.editTitleModal);
  el.editTitleNameInput.focus();
}

function handleSaveEditTitle() {
  const newName = el.editTitleNameInput.value.trim();
  if (!newName) return;

  const title = state.titles.find((t) => t.id === pendingEditTitleId);
  if (title) {
    title.name = newName;
    saveData();
    renderMyList();
    renderAvailableSection();
  }
  closeModal(el.editTitleModal);
}

function openDeleteModal(id, name) {
  pendingDeleteTitleId = id;
  el.deleteConfirmText.textContent = `Are you sure you want to delete "${name}" from your tracked list?`;
  openModal(el.deleteConfirmModal);
}

function handleConfirmDeleteTitle() {
  if (pendingDeleteTitleId) {
    state.titles = state.titles.filter((t) => t.id !== pendingDeleteTitleId);
    availableResults = availableResults.filter((r) => r.id !== pendingDeleteTitleId);
    saveData();
    renderMyList();
    renderAvailableSection();
  }
  closeModal(el.deleteConfirmModal);
}

/* ==========================================================================
   Export / Import System
   ========================================================================== */

function handleExport() {
  const exportPayload = {
    titles: state.titles,
    settings: state.settings,
    exportedAt: new Date().toISOString(),
  };

  const jsonStr = JSON.stringify(exportPayload, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const now = new Date().toISOString().split("T")[0];
  const a = document.createElement("a");
  a.href = url;
  a.download = `manhwa-checker-backup-${now}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function handleImportFile(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const parsed = JSON.parse(event.target.result);
      let incomingTitles = [];

      if (Array.isArray(parsed)) {
        incomingTitles = parsed;
      } else if (parsed && Array.isArray(parsed.titles)) {
        incomingTitles = parsed.titles;
      } else {
        alert("Invalid backup file format. Expected a JSON file with a 'titles' list.");
        return;
      }

      // Validate entries
      const validTitles = incomingTitles.filter((t) => t && typeof t.name === "string" && t.name.trim().length > 0).map((t) => ({
        id: t.id || generateId(),
        name: t.name.trim(),
        read: Math.max(0, parseInt(t.read, 10) || 0),
        slug: t.slug || null,
      }));

      if (validTitles.length === 0) {
        alert("No valid titles found in the selected file.");
        return;
      }

      pendingImportData = validTitles;
      el.importSummaryText.textContent = `Found ${validTitles.length} titles in the file. Choose whether to merge with your current list or replace it completely.`;
      openModal(el.importChoiceModal);
    } catch (err) {
      alert("Failed to parse JSON file: " + err.message);
    } finally {
      el.importFileInput.value = "";
    }
  };
  reader.readAsText(file);
}

function applyImport(mode) {
  if (!pendingImportData) return;

  if (mode === "replace") {
    state.titles = pendingImportData;
  } else {
    // Merge: add new titles, update existing if imported read count is higher
    const existingMap = new Map();
    state.titles.forEach((t) => existingMap.set(normalizeName(t.name), t));

    pendingImportData.forEach((incoming) => {
      const norm = normalizeName(incoming.name);
      if (existingMap.has(norm)) {
        const curr = existingMap.get(norm);
        if (incoming.read > curr.read) {
          curr.read = incoming.read;
        }
        if (!curr.slug && incoming.slug) {
          curr.slug = incoming.slug;
        }
      } else {
        state.titles.push(incoming);
      }
    });
  }

  saveData();
  renderMyList();
  renderAvailableSection();
  closeModal(el.importChoiceModal);
  showStatusMsg(`Successfully imported titles (${mode === "replace" ? "replaced" : "merged"}).`, 3000);
  pendingImportData = null;
}

/* ==========================================================================
   Checking & Parser Engine
   ========================================================================== */

async function handleCheck() {
  if (state.titles.length === 0) {
    showStatusMsg("Add some manhwa to your list first!");
    return;
  }

  const workerUrl = (state.settings.workerUrl || DEFAULT_WORKER_URL).replace(/\/$/, "");
  if (!workerUrl || workerUrl.includes("yourname.workers.dev")) {
    openModal(el.settingsModal);
    showStatusMsg("Please configure your Cloudflare Worker URL in Settings first.");
    return;
  }

  // Set UI state to checking
  el.checkBtn.disabled = true;
  el.checkBtn.classList.add("is-checking");
  el.checkBtnText.textContent = "Checking Asura Scans...";
  showStatusMsg("Fetching latest releases from Asura Scans...");
  unverifiedTitles = [];

  try {
    // 1. Fetch latest releases homepage through the worker
    const targetUrl = "https://asurascans.com/";
    const proxyUrl = `${workerUrl}/?url=${encodeURIComponent(targetUrl)}`;
    
    let htmlText;
    try {
      const resp = await fetch(proxyUrl);
      if (!resp.ok) {
        const errJson = await resp.json().catch(() => null);
        throw new Error(errJson?.error || `Worker returned HTTP ${resp.status}`);
      }
      htmlText = await resp.text();
    } catch (err) {
      throw new Error(`Worker connection failed: ${err.message}. Check your Worker URL in Settings.`);
    }

    showStatusMsg("Parsing latest releases...");

    // 2. Parse releases from homepage
    const releases = parseLatestReleases(htmlText);
    if (!releases || releases.length === 0) {
      throw new Error("Could not parse releases from Asura Scans. The site layout may have changed.");
    }

    // 3. Match against user's titles
    showStatusMsg(`Found ${releases.length} recent releases. Matching with your list...`);
    const matchedItems = [];

    state.titles.forEach((userTitle) => {
      const userNorm = normalizeName(userTitle.name);
      
      // Match by normalized name or previously cached slug
      const match = releases.find((rel) => {
        if (rel.normalizedName === userNorm) return true;
        if (userTitle.slug && rel.publicUrl && userTitle.slug === rel.publicUrl) return true;
        return false;
      });

      if (match) {
        // Cache the live URL path
        if (match.publicUrl && match.publicUrl !== userTitle.slug) {
          userTitle.slug = match.publicUrl;
        }

        if (match.latestChapter > userTitle.read) {
          matchedItems.push({
            title: userTitle,
            release: match,
          });
        }
      }
    });

    saveData(); // Save any updated slugs

    if (matchedItems.length === 0) {
      availableResults = [];
      renderAvailableSection();
      showStatusMsg("Check complete: None of your titles have updates on the first page.", 3500);
      return;
    }

    // 4. Verify chapter readability for each matched title
    showStatusMsg(`Verifying readability for ${matchedItems.length} updated ${matchedItems.length === 1 ? "title" : "titles"}...`);
    availableResults = [];

    for (let i = 0; i < matchedItems.length; i++) {
      const item = matchedItems[i];
      const seriesTitle = item.title.name;
      const readCh = item.title.read;
      const latestCh = item.release.latestChapter;
      const seriesPath = item.release.publicUrl;

      showStatusMsg(`Checking ${seriesTitle} (Ch. ${latestCh})...`);

      try {
        const newestReadable = await findNewestReadableChapter(workerUrl, seriesPath, readCh, latestCh);
        if (newestReadable !== null && newestReadable > readCh) {
          availableResults.push({
            id: item.title.id,
            name: seriesTitle,
            read: readCh,
            newestReadable,
            newCount: newestReadable - readCh,
            seriesPath,
          });
        }
      } catch (err) {
        console.warn(`Could not verify readability for ${seriesTitle}:`, err);
        unverifiedTitles.push({
          name: seriesTitle,
          reason: err.message,
        });
      }
    }

    renderAvailableSection();
    
    // Automatically expand section if new chapters found
    if (availableResults.length > 0) {
      setAvailableSectionOpen(true);
      showStatusMsg(`Check complete! ${availableResults.length} ${availableResults.length === 1 ? "title has" : "titles have"} new readable chapters.`, 4000);
    } else {
      showStatusMsg("Check complete: No new readable chapters available for your titles.", 3500);
    }
  } catch (err) {
    console.error("Check failed:", err);
    showStatusMsg(`Check failed: ${err.message}`, 6000);
  } finally {
    el.checkBtn.disabled = false;
    el.checkBtn.classList.remove("is-checking");
    el.checkBtnText.textContent = "Check for Updates";
  }
}

/**
 * Normalizes title names for robust comparison.
 * - Lowercase
 * - Strips punctuation, hyphens, and brackets
 * - Converts curly quotes/apostrophes to straight
 * - Normalizes whitespace
 */
function normalizeName(str) {
  if (!str) return "";
  return str
    .toLowerCase()
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parses Asura Scans latest updates.
 * Implements:
 * 1. Astro island props parsing (Primary, highly reliable and fast)
 * 2. DOM parsing fallback (Secondary)
 */
function parseLatestReleases(html) {
  const releases = [];
  const mapByName = new Map();

  // --- METHOD 1: Astro Island Props ---
  try {
    const islandMatch = html.match(/<astro-island[^>]+LatestUpdates[^>]*>/i);
    if (islandMatch) {
      const propsMatch = islandMatch[0].match(/props="([^"]+)"/);
      if (propsMatch) {
        const decoded = decodeHtmlEntities(propsMatch[1]);
        const parsed = JSON.parse(decoded);
        const deserialized = deserializeAstroProps(parsed);

        if (deserialized && Array.isArray(deserialized.chapters)) {
          deserialized.chapters.forEach((ch) => {
            const name = ch.comic_name;
            const publicUrl = ch.comic_public_url; // e.g. /comics/infinite-titles-3ebcc5a9
            const chNum = typeof ch.number === "number" ? ch.number : parseInt(ch.name, 10);

            if (name && !isNaN(chNum)) {
              const norm = normalizeName(name);
              if (!mapByName.has(norm)) {
                mapByName.set(norm, {
                  name,
                  normalizedName: norm,
                  publicUrl,
                  latestChapter: chNum,
                });
              } else {
                const existing = mapByName.get(norm);
                if (chNum > existing.latestChapter) {
                  existing.latestChapter = chNum;
                }
                if (!existing.publicUrl && publicUrl) {
                  existing.publicUrl = publicUrl;
                }
              }
            }
          });
        }
      }
    }
  } catch (err) {
    console.warn("Astro props parsing failed, falling back to DOM parsing:", err);
  }

  if (mapByName.size > 0) {
    return Array.from(mapByName.values());
  }

  // --- METHOD 2: DOM Parsing Fallback ---
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    // Look for links to comics in latest updates
    const comicLinks = doc.querySelectorAll('a[href*="/comics/"]');
    comicLinks.forEach((link) => {
      const href = link.getAttribute("href") || "";
      const text = link.textContent.trim();

      // Check if this is a series root link: /comics/<slug-hash> without /chapter/
      const seriesMatch = href.match(/^(\/comics\/[a-z0-9-]+)(?:\/)?$/i);
      if (seriesMatch && text.length > 1) {
        const publicUrl = seriesMatch[1];
        const norm = normalizeName(text);

        // Find sibling or child chapter links
        const parent = link.closest(".grid, .flex, div, article") || link.parentElement;
        let highestCh = 0;

        if (parent) {
          const chLinks = parent.querySelectorAll(`a[href^="${publicUrl}/chapter/"]`);
          chLinks.forEach((cl) => {
            const chHref = cl.getAttribute("href") || "";
            const chMatch = chHref.match(/\/chapter\/(\d+)/);
            if (chMatch) {
              const num = parseInt(chMatch[1], 10);
              if (num > highestCh) highestCh = num;
            }
          });
        }

        if (highestCh > 0) {
          if (!mapByName.has(norm) || highestCh > mapByName.get(norm).latestChapter) {
            mapByName.set(norm, {
              name: text,
              normalizedName: norm,
              publicUrl,
              latestChapter: highestCh,
            });
          }
        }
      }
    });
  } catch (domErr) {
    console.error("DOM fallback parsing failed:", domErr);
  }

  return Array.from(mapByName.values());
}

/**
 * Deserializes Astro island props format:
 * [0, value] -> primitive or object
 * [1, [items...]] -> array
 */
function deserializeAstroProps(val) {
  if (val === null || val === undefined) return val;
  if (Array.isArray(val) && val.length >= 2 && typeof val[0] === "number") {
    const type = val[0];
    const inner = val[1];
    if (type === 0) {
      if (inner !== null && typeof inner === "object") {
        if (Array.isArray(inner)) return inner.map(deserializeAstroProps);
        const obj = {};
        for (const [k, v] of Object.entries(inner)) {
          obj[k] = deserializeAstroProps(v);
        }
        return obj;
      }
      return inner;
    }
    if (type === 1) {
      return Array.isArray(inner) ? inner.map(deserializeAstroProps) : [];
    }
    return inner;
  }
  if (typeof val === "object") {
    const obj = Array.isArray(val) ? [] : {};
    for (const [k, v] of Object.entries(val)) {
      obj[k] = deserializeAstroProps(v);
    }
    return obj;
  }
  return val;
}

function decodeHtmlEntities(str) {
  const txt = document.createElement("textarea");
  txt.innerHTML = str;
  return txt.value;
}

/**
 * Verifies readability of chapters stepping down from latestChapter.
 * Returns highest readable chapter number > readCh, or null if none.
 */
async function findNewestReadableChapter(workerUrl, seriesPath, readCh, latestCh) {
  // Step down up to 5 chapters to find readable one
  const maxSteps = 5;
  let currentCh = latestCh;
  let stepsTaken = 0;

  while (currentCh > readCh && stepsTaken < maxSteps) {
    const isReadable = await checkChapterReadability(workerUrl, seriesPath, currentCh);
    if (isReadable) {
      return currentCh;
    }
    currentCh -= 1;
    stepsTaken += 1;
  }

  // If newest chapter was locked and we stepped down to readCh, no new readable chapter
  return null;
}

/**
 * Checks whether an individual chapter is readable (not locked / sign-in restricted).
 */
async function checkChapterReadability(workerUrl, seriesPath, chapterNum) {
  const cacheKey = `${seriesPath}/chapter/${chapterNum}`;
  if (chapterReadabilityCache.has(cacheKey)) {
    return chapterReadabilityCache.get(cacheKey);
  }

  const chapterUrl = `https://asurascans.com${seriesPath}/chapter/${chapterNum}`;
  const proxyUrl = `${workerUrl}/?url=${encodeURIComponent(chapterUrl)}`;

  try {
    const resp = await fetch(proxyUrl);
    if (!resp.ok) {
      // 404 or other HTTP error -> treat as unreadable
      chapterReadabilityCache.set(cacheKey, false);
      return false;
    }

    const html = await resp.text();

    // 1. Check ChapterReader Astro props
    const readerMatch = html.match(/<astro-island[^>]+ChapterReader[^>]*>/i);
    if (readerMatch) {
      const propsMatch = readerMatch[0].match(/props="([^"]+)"/);
      if (propsMatch) {
        try {
          const rawJson = decodeHtmlEntities(propsMatch[1]);
          const parsed = JSON.parse(rawJson);
          const readerProps = deserializeAstroProps(parsed);

          // If explicitly locked or premium
          if (readerProps.isLocked === true || readerProps.isPremium === true) {
            chapterReadabilityCache.set(cacheKey, false);
            return false;
          }

          // If unlockTime is set in the future
          if (readerProps.unlockTime) {
            const unlockDate = new Date(readerProps.unlockTime);
            if (!isNaN(unlockDate.getTime()) && unlockDate > new Date()) {
              chapterReadabilityCache.set(cacheKey, false);
              return false;
            }
          }
        } catch (err) {
          console.warn("Could not parse ChapterReader props:", err);
        }
      }
    }

    // 2. Check chapter page images
    // Free chapters contain <img> tags with asura-images/chapters/<series>/<ch>/...
    const hasChapterImages =
      /src=["'][^"']*cdn\.asurascans\.com\/asura-images\/chapters\/[^"']+["']/i.test(html) ||
      /alt=["']Page \d+ - Chapter \d+/i.test(html) ||
      /data-page-index=["']\d+["']/i.test(html);

    if (!hasChapterImages) {
      chapterReadabilityCache.set(cacheKey, false);
      return false;
    }

    // 3. Check for sign-in / early-access lock messages
    const hasLockText =
      /Checking chapter access/i.test(html) ||
      /Early Access/i.test(html) ||
      /Sign in to read/i.test(html) ||
      /Unlock Chapter/i.test(html);

    if (hasLockText) {
      chapterReadabilityCache.set(cacheKey, false);
      return false;
    }

    // Passed all checks: readable!
    chapterReadabilityCache.set(cacheKey, true);
    return true;
  } catch (err) {
    console.error(`Readability check error for ${chapterUrl}:`, err);
    // Fail-safe: default to false (locked/unknown)
    chapterReadabilityCache.set(cacheKey, false);
    return false;
  }
}

/* ==========================================================================
   "Available to Read" Rendering & Actions
   ========================================================================= */

function renderAvailableSection() {
  const count = availableResults.length;
  el.availableBadge.textContent = `${count} new`;
  el.availableBadge.classList.toggle("badge-zero", count === 0);
  el.availableSection.classList.toggle("has-updates", count > 0);

  // Show or hide "Open all"
  el.openAllBtn.style.display = count > 0 ? "flex" : "none";

  // Empty state
  el.availableEmptyState.style.display = count === 0 ? "block" : "none";
  el.availableCardsContainer.innerHTML = "";

  // Render cards
  availableResults.forEach((item) => {
    const card = createAvailableCard(item);
    el.availableCardsContainer.appendChild(card);
  });

  // Render unverified note
  if (unverifiedTitles.length > 0) {
    el.unverifiedBox.style.display = "block";
    el.unverifiedBox.innerHTML = `<strong>Note:</strong> Couldn't verify latest readability for: ${unverifiedTitles.map((t) => escapeHtml(t.name)).join(", ")}.`;
  } else {
    el.unverifiedBox.style.display = "none";
    el.unverifiedBox.textContent = "";
  }
}

function createAvailableCard(item) {
  const card = document.createElement("div");
  card.className = "update-card";
  card.dataset.id = item.id;

  const topRow = document.createElement("div");
  topRow.className = "update-card-top";

  const titleEl = document.createElement("div");
  titleEl.className = "update-card-title";
  titleEl.textContent = item.name;

  const progressEl = document.createElement("div");
  progressEl.className = "update-card-progress";
  progressEl.textContent = `${item.read} → ${item.newestReadable} (${item.newCount} new)`;

  topRow.appendChild(titleEl);
  topRow.appendChild(progressEl);

  const actionsRow = document.createElement("div");
  actionsRow.className = "update-card-actions";

  const markAllBtn = document.createElement("button");
  markAllBtn.className = "btn-card-action btn-mark-all";
  markAllBtn.textContent = "Mark all as read";
  markAllBtn.setAttribute("aria-label", `Mark all chapters as read for ${item.name}`);

  const openBtn = document.createElement("button");
  openBtn.className = "btn-card-action btn-open-next";
  const nextCh = item.read + 1;
  openBtn.textContent = `Open Ch. ${nextCh}`;
  openBtn.setAttribute("aria-label", `Open chapter ${nextCh} for ${item.name} in a new tab`);

  // Direct click handler on Open button
  openBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    handleOpenNextChapter(item);
  });

  // Direct click handler on Mark all as read button
  markAllBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    handleMarkAllAsRead(item);
  });

  // Clicking card itself also triggers opening next chapter
  card.addEventListener("click", () => {
    handleOpenNextChapter(item);
  });

  actionsRow.appendChild(markAllBtn);
  actionsRow.appendChild(openBtn);

  card.appendChild(topRow);
  card.appendChild(actionsRow);

  return card;
}

/**
 * Opens next chapter in a new tab directly in click handler,
 * updates my read number to read + 1, shows undo toast.
 */
function handleOpenNextChapter(item) {
  const nextCh = item.read + 1;
  const chapterUrl = `https://asurascans.com${item.seriesPath}/chapter/${nextCh}`;

  // Open synchronously directly in the click event
  window.open(chapterUrl, "_blank", "noopener");

  const prevRead = item.read;
  const newRead = nextCh;

  // Update state
  const title = state.titles.find((t) => t.id === item.id);
  if (title) {
    title.read = newRead;
    saveData();
    updateTitleInputInDOM(title.id, newRead);
  }

  // Update card or remove if reached latest readable
  item.read = newRead;
  item.newCount = item.newestReadable - newRead;

  if (item.read >= item.newestReadable) {
    availableResults = availableResults.filter((r) => r.id !== item.id);
  }

  renderAvailableSection();

  // Show Undo toast
  showUndoToast(`${prevRead} → ${newRead}`, () => {
    if (title) {
      title.read = prevRead;
      saveData();
      updateTitleInputInDOM(title.id, prevRead);
      // Re-add to available results
      item.read = prevRead;
      item.newCount = item.newestReadable - prevRead;
      if (!availableResults.find((r) => r.id === item.id)) {
        availableResults.push(item);
      }
      renderAvailableSection();
    }
  });
}

/**
 * Marks all as read up to latest readable chapter without opening tabs.
 */
function handleMarkAllAsRead(item) {
  const prevRead = item.read;
  const newRead = item.newestReadable;

  const title = state.titles.find((t) => t.id === item.id);
  if (title) {
    title.read = newRead;
    saveData();
    updateTitleInputInDOM(title.id, newRead);
  }

  // Remove from available results
  availableResults = availableResults.filter((r) => r.id !== item.id);
  renderAvailableSection();

  // Show Undo toast
  showUndoToast(`${prevRead} → ${newRead}`, () => {
    if (title) {
      title.read = prevRead;
      saveData();
      updateTitleInputInDOM(title.id, prevRead);
      item.read = prevRead;
      item.newCount = item.newestReadable - prevRead;
      if (!availableResults.find((r) => r.id === item.id)) {
        availableResults.push(item);
      }
      renderAvailableSection();
    }
  });
}

/**
 * Opens next chapter for each available card synchronously.
 */
function handleOpenAll() {
  if (availableResults.length === 0) return;

  const snapshots = [];
  let blockedCount = 0;

  // Open all tabs synchronously in the click handler
  availableResults.forEach((item) => {
    const nextCh = item.read + 1;
    const chapterUrl = `https://asurascans.com${item.seriesPath}/chapter/${nextCh}`;

    try {
      const win = window.open(chapterUrl, "_blank", "noopener");
      if (!win || win.closed || typeof win.closed === "undefined") {
        blockedCount++;
      }
    } catch {
      blockedCount++;
    }

    snapshots.push({
      id: item.id,
      itemRef: item,
      prevRead: item.read,
      newRead: nextCh,
    });
  });

  // Apply updates to state
  snapshots.forEach((snap) => {
    const title = state.titles.find((t) => t.id === snap.id);
    if (title) {
      title.read = snap.newRead;
      updateTitleInputInDOM(title.id, snap.newRead);
    }
    snap.itemRef.read = snap.newRead;
    snap.itemRef.newCount = snap.itemRef.newestReadable - snap.newRead;
  });

  saveData();

  // Filter out any that reached latest readable
  availableResults = availableResults.filter((r) => r.read < r.newestReadable);
  renderAvailableSection();

  if (blockedCount > 0) {
    showStatusMsg("Allow pop-ups for this site, then try again to open all tabs at once.", 5000);
  }

  // Show one combined undo toast
  showUndoToast(`Opened next chapter for ${snapshots.length} titles`, () => {
    snapshots.forEach((snap) => {
      const title = state.titles.find((t) => t.id === snap.id);
      if (title) {
        title.read = snap.prevRead;
        updateTitleInputInDOM(title.id, snap.prevRead);
      }
      snap.itemRef.read = snap.prevRead;
      snap.itemRef.newCount = snap.itemRef.newestReadable - snap.prevRead;
      if (!availableResults.find((r) => r.id === snap.id)) {
        availableResults.push(snap.itemRef);
      }
    });
    saveData();
    renderAvailableSection();
  });
}

function updateAvailableCardsForTitle(titleId, newRead) {
  const item = availableResults.find((r) => r.id === titleId);
  if (item) {
    item.read = newRead;
    item.newCount = item.newestReadable - newRead;
    if (item.read >= item.newestReadable) {
      availableResults = availableResults.filter((r) => r.id !== titleId);
    }
    renderAvailableSection();
  }
}

/* ==========================================================================
   Undo Toast System
   ========================================================================== */

function showUndoToast(msg, onUndoCallback) {
  if (undoTimer) {
    clearTimeout(undoTimer);
    undoTimer = null;
  }

  el.toastMessage.textContent = msg;
  currentUndoAction = onUndoCallback;
  el.undoToast.classList.add("is-visible");

  // Auto-dismiss after 5 seconds (~5000ms per §2)
  undoTimer = setTimeout(() => {
    hideUndoToast();
  }, 5000);
}

function hideUndoToast() {
  if (undoTimer) {
    clearTimeout(undoTimer);
    undoTimer = null;
  }
  el.undoToast.classList.remove("is-visible");
  currentUndoAction = null;
}

function showStatusMsg(msg, duration = 0) {
  el.checkStatusMsg.textContent = msg;
  if (duration > 0) {
    setTimeout(() => {
      if (el.checkStatusMsg.textContent === msg) {
        el.checkStatusMsg.textContent = "";
      }
    }, duration);
  }
}

function escapeHtml(str) {
  if (!str) return "";
  return str.replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}

/* ==========================================================================
   Service Worker Registration
   ========================================================================== */

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      // Relative path to support GitHub Pages project sites
      navigator.serviceWorker
        .register("./sw.js")
        .then((reg) => {
          console.log("Service Worker registered successfully:", reg.scope);
        })
        .catch((err) => {
          console.warn("Service Worker registration failed:", err);
        });
    });
  }
}
