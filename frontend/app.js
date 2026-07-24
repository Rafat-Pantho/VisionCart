/* ============================================================
   VisionCart — Frontend logic
   Talks to the FastAPI backend:
     GET  /                 → health check
     GET  /api/inventory    → [{id, product_name, expected_quantity,
                                actual_quantity, low_stock_threshold}]
     POST /api/scan-shelf   → multipart "file" → {scan_id, inventory_updates, alerts}
   ============================================================ */

"use strict";

const API_BASE = "https://visioncart.onrender.com";

/* ----------  DOM refs  ---------- */
const $ = (id) => document.getElementById(id);
const dropzone = $("dropzone");
const fileInput = $("file-input");
const previewImg = $("preview-img");
const clearBtn = $("clear-btn");
const scanBtn = $("scan-btn");
const scanBtnText = $("scan-btn-text");
const fileNameBox = $("file-name");
const fileNameText = $("file-name-text");
const tableBody = $("table-body");
const searchInput = $("search");
const alertsCard = $("alerts-card");
const alertsList = $("alerts-list");
const alertsCount = $("alerts-count");
const connPill = $("conn");
const connText = $("conn-text");
const themeToggle = $("theme-toggle");
const toasts = $("toasts");
const footCount = $("foot-count");

/* ----------  App state  ---------- */
const state = {
  products: [],          // raw inventory from API
  filter: "all",         // all | ok | low | out
  search: "",
  sortKey: "product_name",
  sortDir: "asc",
  selectedFile: null,
};

/* ----------  Helpers  ---------- */

// A product's status derived from its quantities.
function statusOf(p) {
  if (p.actual_quantity <= 0) return "out";
  if (p.actual_quantity < p.low_stock_threshold) return "low";
  return "ok";
}

// Deterministic gradient avatar from a product name.
function avatarStyle(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  const h2 = (h + 42) % 360;
  return `background:linear-gradient(135deg, hsl(${h} 70% 55%), hsl(${h2} 72% 48%));`;
}

function initials(name) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

/* ----------  Animated counters  ---------- */
function animateCount(el, to) {
  const from = Number(el.dataset.count || 0);
  if (from === to) { el.textContent = to; return; }
  el.dataset.count = to;
  const dur = 600;
  const start = performance.now();
  function tick(now) {
    const t = Math.min((now - start) / dur, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = Math.round(from + (to - from) * eased);
    if (t < 1) requestAnimationFrame(tick);
    else el.textContent = to;
  }
  requestAnimationFrame(tick);
}

/* ----------  KPIs  ---------- */
function updateKpis() {
  const p = state.products;
  const ok = p.filter((x) => statusOf(x) === "ok").length;
  const low = p.filter((x) => statusOf(x) === "low").length;
  const out = p.filter((x) => statusOf(x) === "out").length;

  animateCount($("kpi-total"), p.length);
  animateCount($("kpi-ok"), ok);
  animateCount($("kpi-low"), low + out);
  animateCount($("kpi-out"), out);

  $("fc-all").textContent = p.length;
  $("fc-ok").textContent = ok;
  $("fc-low").textContent = low;
  $("fc-out").textContent = out;
}

/* ----------  Table rendering  ---------- */
function getVisibleProducts() {
  let rows = state.products.slice();

  if (state.filter !== "all") {
    rows = rows.filter((p) => statusOf(p) === state.filter);
  }
  if (state.search) {
    const q = state.search.toLowerCase();
    rows = rows.filter((p) => p.product_name.toLowerCase().includes(q));
  }

  const { sortKey, sortDir } = state;
  rows.sort((a, b) => {
    let av = a[sortKey], bv = b[sortKey];
    if (typeof av === "string") { av = av.toLowerCase(); bv = bv.toLowerCase(); }
    if (av < bv) return sortDir === "asc" ? -1 : 1;
    if (av > bv) return sortDir === "asc" ? 1 : -1;
    return 0;
  });
  return rows;
}

const STATUS_META = {
  ok:  { cls: "badge--ok",  label: "In Stock", icon: '<path d="M20 6 9 17l-5-5"></path>', color: "var(--ok)" },
  low: { cls: "badge--low", label: "Low Stock", icon: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"></path><path d="M12 9v3M12 16h.01"></path>', color: "var(--low)" },
  out: { cls: "badge--out", label: "Out of Stock", icon: '<circle cx="12" cy="12" r="9"></circle><path d="M15 9l-6 6M9 9l6 6"></path>', color: "var(--out)" },
};

function renderTable() {
  const rows = getVisibleProducts();

  if (state.products.length === 0) {
    tableBody.innerHTML = emptyRow(
      "inbox",
      "No inventory yet",
      "Scan a shelf photo to populate your inventory, or make sure the backend database is seeded."
    );
    footCount.textContent = "0 products";
    return;
  }

  if (rows.length === 0) {
    tableBody.innerHTML = emptyRow(
      "search",
      "No matches",
      "No products match your current search or filter. Try clearing them."
    );
    footCount.textContent = "0 of " + state.products.length + " shown";
    return;
  }

  tableBody.innerHTML = rows.map((p, i) => {
    const st = statusOf(p);
    const meta = STATUS_META[st];
    const denom = Math.max(p.expected_quantity, p.low_stock_threshold, p.actual_quantity, 1);
    const pct = Math.max(4, Math.min(100, (p.actual_quantity / denom) * 100));
    return `
      <tr class="row-enter" style="animation-delay:${Math.min(i * 22, 300)}ms">
        <td>
          <div class="prod">
            <span class="prod__ava" style="${avatarStyle(p.product_name)}">${escapeHtml(initials(p.product_name))}</span>
            <span class="prod__name">${escapeHtml(p.product_name)}</span>
          </div>
        </td>
        <td class="num">${p.expected_quantity}</td>
        <td class="num">
          <div class="stock">
            <span class="stock__num">${p.actual_quantity}</span>
            <span class="stock__bar"><span class="stock__fill" style="width:${pct}%;background:${meta.color}"></span></span>
          </div>
        </td>
        <td class="num">${p.low_stock_threshold}</td>
        <td>
          <span class="badge ${meta.cls}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${meta.icon}</svg>
            ${meta.label}
          </span>
        </td>
      </tr>`;
  }).join("");

  footCount.textContent = rows.length === state.products.length
    ? `${rows.length} product${rows.length !== 1 ? "s" : ""}`
    : `${rows.length} of ${state.products.length} shown`;
}

function emptyRow(kind, title, msg) {
  const icons = {
    inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"></path><path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1z"></path>',
    search: '<circle cx="11" cy="11" r="7"></circle><path d="m21 21-4.3-4.3"></path>',
    error: '<circle cx="12" cy="12" r="9"></circle><path d="M12 8v4M12 16h.01"></path>',
  };
  const cls = kind === "error" ? "empty error" : "empty";
  return `<tr><td colspan="5"><div class="${cls}">
    <div class="empty__ill"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icons[kind]}</svg></div>
    <h3>${escapeHtml(title)}</h3><p>${escapeHtml(msg)}</p>
  </div></td></tr>`;
}

function renderSkeleton() {
  const widths = [60, 42, 55, 48, 50, 44];
  tableBody.innerHTML = widths.map(() => `
    <tr>
      <td><div class="prod"><span class="skel" style="width:34px;height:34px;border-radius:10px"></span><span class="skel" style="width:120px;height:12px"></span></div></td>
      <td class="num"><span class="skel" style="width:26px;height:12px"></span></td>
      <td class="num"><span class="skel" style="width:70px;height:12px"></span></td>
      <td class="num"><span class="skel" style="width:26px;height:12px"></span></td>
      <td><span class="skel" style="width:84px;height:22px;border-radius:999px"></span></td>
    </tr>`).join("");
}

/* ----------  Alerts  ---------- */
function renderAlerts(alerts) {
  if (!alerts || alerts.length === 0) {
    alertsCard.classList.add("hidden");
    alertsList.innerHTML = "";
    return;
  }
  alertsCount.textContent = alerts.length;
  alertsList.innerHTML = alerts.map((a, i) => `
    <li style="animation-delay:${Math.min(i * 40, 400)}ms"><span class="adot"></span><span>${escapeHtml(a)}</span></li>
  `).join("");
  alertsCard.classList.remove("hidden");
}

/* ----------  Toasts  ---------- */
function toast(type, title, msg) {
  const icons = {
    error: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"></path><path d="M12 9v4M12 17h.01"></path>',
    success: '<path d="M22 11.1V12a10 10 0 1 1-5.9-9.1"></path><path d="m22 4-10 10.01L9 11"></path>',
    info: '<circle cx="12" cy="12" r="9"></circle><path d="M12 16v-4M12 8h.01"></path>',
  };
  const el = document.createElement("div");
  el.className = `toast toast--${type}`;
  el.innerHTML = `
    <span class="toast__icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icons[type]}</svg></span>
    <div class="toast__body"><div class="toast__title">${escapeHtml(title)}</div>${msg ? `<div class="toast__msg">${escapeHtml(msg)}</div>` : ""}</div>`;
  toasts.appendChild(el);
  const remove = () => {
    el.classList.add("out");
    setTimeout(() => el.remove(), 350);
  };
  const t = setTimeout(remove, 4000);
  el.addEventListener("click", () => { clearTimeout(t); remove(); });
}

/* ----------  Connection status  ---------- */
async function checkConnection() {
  connPill.dataset.state = "checking";
  connText.textContent = "Connecting…";
  try {
    const res = await fetch(`${API_BASE}/`, { method: "GET" });
    if (!res.ok) throw new Error();
    connPill.dataset.state = "online";
    connText.textContent = "Backend online";
    return true;
  } catch {
    connPill.dataset.state = "offline";
    connText.textContent = "Backend offline";
    return false;
  }
}

/* ----------  Data fetching  ---------- */
async function fetchInventory({ showSkeleton = false } = {}) {
  if (showSkeleton) renderSkeleton();
  try {
    const res = await fetch(`${API_BASE}/api/inventory`);
    if (!res.ok) throw new Error(`Request failed (${res.status})`);
    state.products = await res.json();
    connPill.dataset.state = "online";
    connText.textContent = "Backend online";
    renderTable();
    updateKpis();
  } catch (err) {
    connPill.dataset.state = "offline";
    connText.textContent = "Backend offline";
    tableBody.innerHTML = emptyRow(
      "error",
      "Couldn't reach the backend",
      `Make sure the API is running at ${API_BASE}. (${err.message})`
    );
    footCount.textContent = "—";
    toast("error", "Connection failed", "The inventory API is unreachable.");
  }
}

/* ----------  Scan  ---------- */
async function scanShelf() {
  if (!state.selectedFile) {
    toast("info", "No image selected", "Choose a shelf photo first.");
    return;
  }

  dropzone.classList.add("scanning");
  scanBtn.disabled = true;
  scanBtnText.textContent = "Scanning…";
  scanBtn.querySelector("svg").outerHTML = '<span class="spinner"></span>';

  try {
    const formData = new FormData();
    formData.append("file", state.selectedFile);

    let res;
    try {
      res = await fetch(`${API_BASE}/api/scan-shelf`, { method: "POST", body: formData });
    } catch {
      throw new Error("Couldn't reach the AI service. Is the backend running?");
    }

    if (!res.ok) {
      let detail = "AI processing failed. Please try a clearer image.";
      try {
        const body = await res.json();
        if (body && body.detail) detail = String(body.detail);
      } catch {}
      throw new Error(detail);
    }

    const result = await res.json();
    renderAlerts(result.alerts);
    await fetchInventory();

    const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    $("kpi-lastscan").textContent = `Last scan: ${now}`;

    const detected = (result.inventory_updates || []).length;
    const alertN = (result.alerts || []).length;
    if (alertN > 0) {
      toast("info", "Scan complete", `${detected} products reconciled · ${alertN} need restock.`);
    } else {
      toast("success", "Scan complete", `${detected} products reconciled — all healthy.`);
    }
  } catch (err) {
    toast("error", "Scan failed", err.message);
  } finally {
    dropzone.classList.remove("scanning");
    scanBtn.disabled = false;
    scanBtnText.textContent = "Scan Shelf";
    const sp = scanBtn.querySelector(".spinner");
    if (sp) sp.outerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"></path><path d="M7 12h10"></path></svg>';
  }
}

/* ----------  File handling  ---------- */
function setFile(file) {
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    toast("error", "Not an image", "Please choose a PNG, JPG, or WEBP file.");
    return;
  }
  state.selectedFile = file;

  const url = URL.createObjectURL(file);
  previewImg.src = url;
  previewImg.onload = () => URL.revokeObjectURL(url);

  dropzone.classList.add("has-image");
  fileNameText.textContent = file.name;
  fileNameBox.classList.add("show");
  scanBtn.disabled = false;
}

function clearFile() {
  state.selectedFile = null;
  previewImg.removeAttribute("src");
  dropzone.classList.remove("has-image");
  fileNameBox.classList.remove("show");
  fileInput.value = "";
  scanBtn.disabled = true;
}

/* ----------  Sorting UI  ---------- */
function applySortHeaders() {
  document.querySelectorAll("thead th.sortable").forEach((th) => {
    if (th.dataset.sort === state.sortKey) th.dataset.dir = state.sortDir;
    else th.removeAttribute("data-dir");
  });
}

/* ----------  Theme  ---------- */
function initTheme() {
  themeToggle.addEventListener("click", () => {
    const cur = document.documentElement.getAttribute("data-theme") || "dark";
    const next = cur === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("vc-theme", next); } catch {}
  });
}

/* ----------  Event wiring  ---------- */
function initEvents() {
  // Dropzone → open picker
  dropzone.addEventListener("click", (e) => {
    if (e.target.closest("#clear-btn")) return;
    if (state.selectedFile) return; // don't reopen when previewing
    fileInput.click();
  });
  dropzone.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && !state.selectedFile) { e.preventDefault(); fileInput.click(); }
  });

  fileInput.addEventListener("change", () => setFile(fileInput.files[0]));
  clearBtn.addEventListener("click", (e) => { e.stopPropagation(); clearFile(); });
  scanBtn.addEventListener("click", scanShelf);

  // Drag & drop
  ["dragenter", "dragover"].forEach((ev) =>
    dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.add("dragover"); })
  );
  ["dragleave", "dragend"].forEach((ev) =>
    dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.remove("dragover"); })
  );
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
    if (e.dataTransfer.files && e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]);
  });

  // Search (debounced)
  let searchTimer;
  searchInput.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { state.search = searchInput.value.trim(); renderTable(); }, 120);
  });

  // Filters
  document.querySelectorAll(".filters button").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".filters button").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.filter = btn.dataset.filter;
      renderTable();
    });
  });

  // Sorting
  document.querySelectorAll("thead th.sortable").forEach((th) => {
    th.addEventListener("click", () => {
      const key = th.dataset.sort;
      if (state.sortKey === key) {
        state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
      } else {
        state.sortKey = key;
        state.sortDir = key === "product_name" ? "asc" : "desc";
      }
      applySortHeaders();
      renderTable();
    });
  });
}

/* ----------  Boot  ---------- */
async function init() {
  initTheme();
  initEvents();
  applySortHeaders();
  renderSkeleton();
  await checkConnection();
  await fetchInventory();
  // Periodically re-check backend health so the pill stays accurate.
  setInterval(checkConnection, 30000);
}

document.addEventListener("DOMContentLoaded", init);
