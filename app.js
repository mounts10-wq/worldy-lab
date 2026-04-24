const API_BASE = "https://api.dictionaryapi.dev/api/v2/entries/en/";

const form = document.getElementById("searchForm");
const input = document.getElementById("wordInput");
const result = document.getElementById("result");
const loading = document.getElementById("loading");
const errorEl = document.getElementById("error");

const savedList = document.getElementById("savedList");
const clearSavedBtn = document.getElementById("clearSaved");
const themeToggle = document.getElementById("themeToggle");

const STORAGE_KEYS = {
  SAVED: "wordly_saved_words",
  THEME: "wordly_theme"
};

let savedWords = new Set(loadSavedWords());

initTheme();
renderSavedWords();

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const word = input.value.trim().toLowerCase();
  if (!word) return showError("Please type a word first.");
  await searchWord(word);
});

clearSavedBtn.addEventListener("click", () => {
  savedWords.clear();
  persistSavedWords();
  renderSavedWords();
  // also update highlight if a result is showing
  highlightSavedState();
});

themeToggle.addEventListener("click", () => {
  const isLight = document.body.classList.toggle("light");
  localStorage.setItem(STORAGE_KEYS.THEME, isLight ? "light" : "dark");
  themeToggle.textContent = isLight ? "☀️" : "🌙";
});

async function searchWord(word) {
  setLoading(true);
  clearError();
  hideResult();

  try {
    const res = await fetch(API_BASE + encodeURIComponent(word));
    const data = await res.json();

    if (!res.ok) {
      // API often returns {title, message, resolution} on errors
      const msg = data?.message || "Word not found. Try another one.";
      throw new Error(msg);
    }

    // Successful responses are usually an array
    const entry = Array.isArray(data) ? data[0] : data;
    renderResult(entry);
  } catch (err) {
    showError(err.message || "Something went wrong. Please try again.");
  } finally {
    setLoading(false);
  }
}

function renderResult(entry) {
  const word = entry.word || "";
  const phonetic = entry.phonetic || "";
  const audioUrl = pickAudio(entry.phonetics);

  const isSaved = savedWords.has(word.toLowerCase());

  result.innerHTML = `
    <div class="row">
      <div>
        <h2 style="margin:0">${escapeHtml(word)}</h2>
        ${phonetic ? `<span class="badge">${escapeHtml(phonetic)}</span>` : ""}
      </div>

      <div class="row" style="justify-content:flex-end">
        ${audioUrl ? `<button id="playAudio" class="btn ghost" type="button">🔊</button>` : ""}
        <button id="saveWord" class="btn ${isSaved ? "" : "ghost"}" type="button">
          ${isSaved ? "★ Saved" : "☆ Save"}
        </button>
      </div>
    </div>

    ${renderMeanings(entry.meanings)}
  `;

  result.classList.remove("hidden");

  const saveBtn = document.getElementById("saveWord");
  saveBtn.addEventListener("click", () => toggleSave(word));

  const playBtn = document.getElementById("playAudio");
  if (playBtn && audioUrl) {
    playBtn.addEventListener("click", () => new Audio(audioUrl).play());
  }

  highlightSavedState();
}

function renderMeanings(meanings = []) {
  if (!Array.isArray(meanings) || meanings.length === 0) {
    return `<p class="def">No meanings available.</p>`;
  }

  return meanings.map(m => {
    const part = m.partOfSpeech ? `<span class="badge">${escapeHtml(m.partOfSpeech)}</span>` : "";
    const defs = Array.isArray(m.definitions) ? m.definitions.slice(0, 3) : [];
    const syns = collectSynonyms(m).slice(0, 12);

    return `
      <div class="meaning">
        <div class="row" style="justify-content:flex-start; gap:10px;">
          <strong>Meaning</strong> ${part}
        </div>

        ${defs.map(d => `
          <div class="def">• ${escapeHtml(d.definition || "")}
            ${d.example ? `<div class="example">"${escapeHtml(d.example)}"</div>` : ""}
          </div>
        `).join("")}

        ${syns.length ? `<p class="example"><strong>Synonyms:</strong> ${syns.map(escapeHtml).join(", ")}</p>` : ""}
      </div>
    `;
  }).join("");
}

function collectSynonyms(meaning) {
  const direct = Array.isArray(meaning.synonyms) ? meaning.synonyms : [];
  const fromDefs = (Array.isArray(meaning.definitions) ? meaning.definitions : [])
    .flatMap(d => Array.isArray(d.synonyms) ? d.synonyms : []);
  return Array.from(new Set([...direct, ...fromDefs])).filter(Boolean);
}

function pickAudio(phonetics = []) {
  if (!Array.isArray(phonetics)) return "";
  const withAudio = phonetics.find(p => p?.audio && p.audio.trim());
  if (!withAudio) return "";

  // Some API audio URLs start with // (protocol-relative)
  const raw = withAudio.audio.trim();
  return raw.startsWith("//") ? `https:${raw}` : raw;
}

function toggleSave(word) {
  const key = word.toLowerCase();
  if (savedWords.has(key)) savedWords.delete(key);
  else savedWords.add(key);

  persistSavedWords();
  renderSavedWords();
  highlightSavedState();

  // re-render result button label without refetching:
  const btn = document.getElementById("saveWord");
  if (btn) {
    const isSaved = savedWords.has(key);
    btn.textContent = isSaved ? "★ Saved" : "☆ Save";
    btn.classList.toggle("ghost", !isSaved);
  }
}

function renderSavedWords() {
  const items = Array.from(savedWords).sort();
  savedList.innerHTML = items.length
    ? items.map(w => `
        <li>
          <button class="chip saved-on" data-word="${escapeHtml(w)}" type="button">${escapeHtml(w)}</button>
          <button class="chip" data-remove="${escapeHtml(w)}" type="button" aria-label="Remove ${escapeHtml(w)}">✕</button>
        </li>
      `).join("")
    : `<p class="example" style="margin:0">No saved words yet. Save one with ☆.</p>`;

  savedList.querySelectorAll("[data-word]").forEach(btn => {
    btn.addEventListener("click", () => {
      input.value = btn.dataset.word;
      searchWord(btn.dataset.word);
    });
  });

  savedList.querySelectorAll("[data-remove]").forEach(btn => {
    btn.addEventListener("click", () => {
      savedWords.delete(btn.dataset.remove);
      persistSavedWords();
      renderSavedWords();
      highlightSavedState();
    });
  });
}

function highlightSavedState() {
  // Optional: could add “saved-on” class to things in the results area if needed
}

function setLoading(isLoading) {
  loading.classList.toggle("hidden", !isLoading);
}

function showError(message) {
  errorEl.textContent = message;
  errorEl.classList.remove("hidden");
}

function clearError() {
  errorEl.textContent = "";
  errorEl.classList.add("hidden");
}

function hideResult() {
  result.classList.add("hidden");
  result.innerHTML = "";
}

function persistSavedWords() {
  localStorage.setItem(STORAGE_KEYS.SAVED, JSON.stringify(Array.from(savedWords)));
}

function loadSavedWords() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SAVED);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function initTheme() {
  const theme = localStorage.getItem(STORAGE_KEYS.THEME) || "dark";
  const isLight = theme === "light";
  document.body.classList.toggle("light", isLight);
  themeToggle.textContent = isLight ? "☀️" : "🌙";
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, s => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;"
  }[s]));
}