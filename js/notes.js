// per-holding notes. a ledger of short timestamped entries about one stock: why
// you bought it, what would make you sell, whatever you want to read back when
// the price moves. entries hang off a spine in the order you wrote them, so the
// column itself is the story of the position.
//
// storage lives in js/store.js, keyed by ticker. notes outlive the holding on
// purpose: deleting a position leaves its ledger intact for a re-add.

const NOTE_STARTERS = ["why i bought", "sell trigger", "thesis"];
const NOTE_SAVE_DELAY = 500;   // quiet typing time before a write
const NOTE_FLASH_HOLD = 1400;  // how long the saved line stays up
const NOTE_ARM_HOLD = 3000;    // how long a remove stays armed

let noteTicker = null;    // ticker the mounted section belongs to
let noteEditingId = null; // entry currently open in an inline editor
let noteSaveTimer = null;
let noteFlashTimer = null;
let noteArmTimer = null;

// ---- mount ----------------------------------------------------------------

// called by renderHoldingModal after it writes the modal markup. builds the
// shell once per open, then hands the entry list to renderNoteList.
function mountNotes(ticker) {
  const root = document.getElementById("hm-notes");
  if (!root) return;

  noteTicker = String(ticker).toUpperCase();
  noteEditingId = null;
  clearTimeout(noteSaveTimer);
  clearTimeout(noteFlashTimer);
  clearTimeout(noteArmTimer);

  const draft = loadNoteDraft(noteTicker);

  root.innerHTML = `
    <div class="hnotes-head">
      <h4 class="hnotes-title">notes</h4>
      <span class="hnotes-count" id="hnote-count"></span>
    </div>
    <div id="hnote-list-wrap"></div>
    <form class="hnote-composer" id="hnote-composer" autocomplete="off">
      <input type="text" class="hnote-label-input" id="hnote-label" list="hnote-labels"
             maxlength="40" placeholder="label it. why i bought, sell trigger, anything.">
      <datalist id="hnote-labels">${NOTE_STARTERS.map((s) => `<option value="${s}">`).join("")}</datalist>
      <textarea class="hnote-input" id="hnote-body" rows="3"
                placeholder="what you want to remember about ${escapeHtml(noteTicker)} later."></textarea>
      <div class="hnote-foot">
        <span class="hnote-saved" id="hnote-saved" role="status" aria-live="polite"></span>
        <button type="submit" class="btn btn-primary btn-sm">add entry</button>
      </div>
    </form>`;

  // set the draft through .value, never through markup, so a stray quote or
  // angle bracket in a half-written note cannot break out of the attribute.
  const labelEl = document.getElementById("hnote-label");
  const bodyEl = document.getElementById("hnote-body");
  labelEl.value = draft.label;
  bodyEl.value = draft.body;
  autoSize(bodyEl);

  renderNoteList();
  wireNotes(root);
}

function wireNotes(root) {
  root.addEventListener("click", onNoteClick);
  root.addEventListener("submit", onNoteSubmit);

  const labelEl = document.getElementById("hnote-label");
  const bodyEl = document.getElementById("hnote-body");
  const onDraft = () => {
    autoSize(bodyEl);
    queueSave(() => {
      const ok = saveNoteDraft(noteTicker, { label: labelEl.value, body: bodyEl.value });
      flashNote(ok ? "draft saved" : storageFullMsg(), !ok);
    });
  };
  labelEl.addEventListener("input", onDraft);
  bodyEl.addEventListener("input", onDraft);
}

// ---- entry list -----------------------------------------------------------

function renderNoteList() {
  const wrap = document.getElementById("hnote-list-wrap");
  const countEl = document.getElementById("hnote-count");
  if (!wrap) return;

  const entries = loadNotes(noteTicker);
  countEl.textContent = entries.length === 0
    ? ""
    : entries.length + (entries.length === 1 ? " entry" : " entries");

  if (entries.length === 0) {
    wrap.innerHTML = noteEmptyHtml();
    return;
  }
  wrap.innerHTML = `<ol class="hnote-list">${entries.map(noteEntryHtml).join("")}</ol>`;
}

function noteEntryHtml(n) {
  // only call it edited once the change is a real second pass, not the autosave
  // that lands a beat after the entry was added.
  const wasEdited = n.updated && n.updated - n.created > 60000;
  const edited = wasEdited
    ? `<span class="hnote-edited">edited ${escapeHtml(fmtNoteTime(n.updated))}</span>`
    : "";
  return `
    <li class="hnote" data-note-id="${escapeHtml(n.id)}">
      <div class="hnote-label">${escapeHtml(n.label)}</div>
      <div class="hnote-body">${escapeHtml(n.body)}</div>
      <div class="hnote-meta">
        <span class="hnote-time">${escapeHtml(fmtNoteTime(n.created))}</span>
        ${edited}
        <span class="hnote-acts">
          <button type="button" class="hnote-act" data-note-action="edit">edit</button>
          <button type="button" class="hnote-act" data-note-action="remove">remove</button>
        </span>
      </div>
    </li>`;
}

// an empty ledger asks for the first entry and gives you three ways in.
function noteEmptyHtml() {
  return `
    <div class="hnote-empty">
      <p>nothing written down for ${escapeHtml(noteTicker)} yet. start with why you bought it,
         and what would make you sell.</p>
      <div class="hnote-starts">
        ${NOTE_STARTERS.map((s) =>
          `<button type="button" class="hnote-start" data-note-start="${escapeHtml(s)}">${escapeHtml(s)}</button>`
        ).join("")}
      </div>
    </div>`;
}

// ---- actions --------------------------------------------------------------

function onNoteClick(e) {
  const starter = e.target.closest("[data-note-start]");
  if (starter) {
    const labelEl = document.getElementById("hnote-label");
    const bodyEl = document.getElementById("hnote-body");
    labelEl.value = starter.dataset.noteStart;
    saveNoteDraft(noteTicker, { label: labelEl.value, body: bodyEl.value });
    bodyEl.focus();
    return;
  }

  const btn = e.target.closest("[data-note-action]");
  if (!btn) return;
  const li = btn.closest(".hnote");
  if (!li) return;
  const id = li.dataset.noteId;

  if (btn.dataset.noteAction === "edit") {
    // the same button reads "done" while the entry is open, so it toggles.
    if (noteEditingId === id) finishNoteEdit();
    else startNoteEdit(id);
  } else if (btn.dataset.noteAction === "remove") {
    armOrRemove(btn, id);
  }
}

function onNoteSubmit(e) {
  e.preventDefault();
  addNoteEntry();
}

function addNoteEntry() {
  const labelEl = document.getElementById("hnote-label");
  const bodyEl = document.getElementById("hnote-body");
  const body = bodyEl.value.trim();

  if (!body) {
    flashNote("write the note first, then add it.", true);
    bodyEl.focus();
    return;
  }

  const now = Date.now();
  const entries = loadNotes(noteTicker);
  entries.push({
    id: cryptoId(),
    label: labelEl.value.trim() || "note",
    body,
    created: now,
    updated: now
  });

  if (!saveNotes(noteTicker, entries)) {
    flashNote(storageFullMsg(), true);
    return;
  }

  clearNoteDraft(noteTicker);
  labelEl.value = "";
  bodyEl.value = "";
  autoSize(bodyEl);
  renderNoteList();
  flashNote("added");
  // the card grid carries a mark for tickers that have notes.
  if (typeof renderCards === "function") renderCards();
  labelEl.focus();
}

// remove takes two clicks. the first arms it and says so, the second does it,
// and it disarms itself if you walk away.
function armOrRemove(btn, id) {
  if (btn.classList.contains("is-armed")) {
    clearTimeout(noteArmTimer);
    removeNoteEntry(id);
    return;
  }
  clearTimeout(noteArmTimer);
  const wrap = document.getElementById("hnote-list-wrap");
  if (wrap) {
    wrap.querySelectorAll(".hnote-act.is-armed").forEach((b) => {
      b.classList.remove("is-armed");
      b.textContent = "remove";
    });
  }
  btn.classList.add("is-armed");
  btn.textContent = "sure?";
  noteArmTimer = setTimeout(() => {
    btn.classList.remove("is-armed");
    btn.textContent = "remove";
  }, NOTE_ARM_HOLD);
}

function removeNoteEntry(id) {
  const entries = loadNotes(noteTicker).filter((n) => n.id !== id);
  if (!saveNotes(noteTicker, entries)) {
    flashNote(storageFullMsg(), true);
    return;
  }
  if (noteEditingId === id) noteEditingId = null;
  renderNoteList();
  flashNote("removed");
  if (typeof renderCards === "function") renderCards();
}

// ---- inline edit ----------------------------------------------------------

// swaps one entry's body for a textarea in place. saves as you type and again on
// blur, so there is nothing to lose by clicking away. no re-render on blur, so
// clicking straight onto another entry's button still lands.
function startNoteEdit(id) {
  if (noteEditingId && noteEditingId !== id) renderNoteList();
  noteEditingId = id;

  const li = document.querySelector(`.hnote[data-note-id="${cssEscape(id)}"]`);
  if (!li) return;
  const bodyEl = li.querySelector(".hnote-body");
  const editBtn = li.querySelector('[data-note-action="edit"]');
  const entry = loadNotes(noteTicker).find((n) => n.id === id);
  if (!bodyEl || !entry) return;

  const ta = document.createElement("textarea");
  ta.className = "hnote-edit-area";
  ta.value = entry.body;
  ta.setAttribute("aria-label", "edit the " + entry.label + " note");
  bodyEl.replaceWith(ta);
  autoSize(ta);
  ta.focus();
  ta.setSelectionRange(ta.value.length, ta.value.length);

  if (editBtn) editBtn.textContent = "done";

  const commit = () => {
    const all = loadNotes(noteTicker);
    const target = all.find((n) => n.id === id);
    if (!target) return true;
    const next = ta.value.trim();
    if (next === target.body) return true; // nothing changed, no false "saved"
    target.body = next;
    target.updated = Date.now();
    return saveNotes(noteTicker, all);
  };

  ta.addEventListener("input", () => {
    autoSize(ta);
    queueSave(() => {
      const ok = commit();
      flashNote(ok ? "saved" : storageFullMsg(), !ok);
    });
  });

  ta.addEventListener("blur", () => {
    clearTimeout(noteSaveTimer);
    if (!commit()) flashNote(storageFullMsg(), true);
  });

  // escape leaves the editor without closing the whole modal.
  ta.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    e.stopPropagation();
    finishNoteEdit();
  });
}

// closes the open editor and puts the entry back to reading form. the blur
// handler does the committing, so this is safe to call from either button or key.
function finishNoteEdit() {
  clearTimeout(noteSaveTimer);
  const ta = document.querySelector(".hnote-edit-area");
  if (ta) ta.blur();
  noteEditingId = null;
  renderNoteList();
}

// ---- helpers --------------------------------------------------------------

function queueSave(fn) {
  clearTimeout(noteSaveTimer);
  noteSaveTimer = setTimeout(fn, NOTE_SAVE_DELAY);
}

// the write is instant and invisible, and this modal closes on a backdrop click.
// the line is how you know the paragraph you just typed is safe.
function flashNote(msg, isWarn) {
  const el = document.getElementById("hnote-saved");
  if (!el) return;
  clearTimeout(noteFlashTimer);
  el.textContent = msg;
  el.classList.toggle("is-warn", !!isWarn);
  el.classList.add("is-on");
  noteFlashTimer = setTimeout(() => el.classList.remove("is-on"), isWarn ? NOTE_FLASH_HOLD * 2 : NOTE_FLASH_HOLD);
}

function storageFullMsg() {
  return "could not save. this browser's storage is full.";
}

// textareas grow with their content instead of scrolling inside a fixed box.
function autoSize(el) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = el.scrollHeight + "px";
}

// ids come from crypto.randomUUID, but the fallback path can emit characters a
// selector would choke on.
function cssEscape(str) {
  if (window.CSS && CSS.escape) return CSS.escape(str);
  return String(str).replace(/["\\]/g, "\\$&");
}
