/* =========================================================
   RESTOKU — Dashboard Dapur  (v3 — full sync)
   =========================================================
   Storage keys (sinkron dengan main.js):
     restoku_orders    → antrean order dari customer (array)
     restoku_stok      → stok bahan baku
     restoku_history   → riwayat pesanan selesai (7 hari)
   BroadcastChannel: "restoku_channel"
   =========================================================

   Fitur:
   - Auto-sort priority (baru oldest first = paling urgent)
   - Tombol Undo setelah ubah status
   - Notifikasi suara (Web Audio API)
   - Aging timer — warna kartu berubah sesuai waktu tunggu
   - Visual "Dapur masih sepi" saat antrean kosong
   - Tracker customer diupdate via BroadcastChannel
   ========================================================= */

const ORDERS_KEY  = "restoku_orders";
const STOK_KEY    = "restoku_stok";
const HISTORY_KEY = "restoku_history";
const BC_NAME     = "restoku_channel";

/* ---------- State ---------- */
let orders        = [];
let stok          = [];
let currentFilter = "semua";
let stokEditId    = null;
let undoStack     = [];
let bc            = null;
let agingTick     = null;
let lastOrderCount = 0;

/* =========================================================
   BroadcastChannel
   ========================================================= */
function initBroadcast() {
  try {
    bc = new BroadcastChannel(BC_NAME);
    bc.onmessage = e => {
      if (e.data.type === "new_order") {
        if (!orders.find(o => o.id === e.data.order.id)) {
          orders.push(e.data.order);
          saveOrders();
          renderOrders();
          updateNavBadge();
          showToast("🍽️ Pesanan baru — Meja " + e.data.order.meja);
          playNotif();
        }
      }
    };
  } catch(err) {
    // Fallback polling untuk browser yang tidak support BroadcastChannel
    console.warn("BroadcastChannel tidak tersedia, pakai polling.");
    setInterval(pollOrders, 3000);
  }
}

function pollOrders() {
  const stored = loadOrders();
  if (stored.length > lastOrderCount) {
    const fresh = stored.slice(lastOrderCount);
    fresh.forEach(o => showToast("🍽️ Pesanan baru — Meja " + o.meja));
    playNotif();
    lastOrderCount = stored.length;
    orders = stored;
    renderOrders();
    updateNavBadge();
  }
}

/* Broadcast status update ke customer tracker */
function broadcastStatusUpdate() {
  try {
    const b2 = new BroadcastChannel(BC_NAME);
    b2.postMessage({ type: "orders_updated", orders });
    b2.close();
  } catch(e) {}
}

/* =========================================================
   Persistence
   ========================================================= */
function loadOrders() {
  try { return JSON.parse(localStorage.getItem(ORDERS_KEY)) || []; }
  catch(e) { return []; }
}
function saveOrders() {
  localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
  broadcastStatusUpdate();
}

function loadStok() {
  const s = localStorage.getItem(STOK_KEY);
  if (s) try { return JSON.parse(s); } catch(e) {}
  return [
    { id:"s1", nama:"Tepung Terigu",  qty:5000,  satuan:"gram",  min:1000 },
    { id:"s2", nama:"Minyak Goreng",  qty:3,     satuan:"liter", min:1    },
    { id:"s3", nama:"Bawang Merah",   qty:800,   satuan:"gram",  min:200  },
    { id:"s4", nama:"Kecap Manis",    qty:500,   satuan:"ml",    min:100  },
    { id:"s5", nama:"Cabai Merah",    qty:300,   satuan:"gram",  min:150  },
    { id:"s6", nama:"Ayam Utuh",      qty:12,    satuan:"ekor",  min:5    },
    { id:"s7", nama:"Beras",          qty:10000, satuan:"gram",  min:2000 },
    { id:"s8", nama:"Garam",          qty:200,   satuan:"gram",  min:50   },
  ];
}
function saveStok() { localStorage.setItem(STOK_KEY, JSON.stringify(stok)); }

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; }
  catch(e) { return []; }
}
function saveHistory(h) { localStorage.setItem(HISTORY_KEY, JSON.stringify(h)); }

/* =========================================================
   Helpers
   ========================================================= */
function formatRupiah(n) { return "Rp " + n.toLocaleString("id-ID"); }
function formatTime(ts)  {
  return new Date(ts).toLocaleTimeString("id-ID", { hour:"2-digit", minute:"2-digit" });
}
function todayKey() { return new Date().toLocaleDateString("id-ID"); }

/* Aging — berapa menit sejak order masuk */
function agingInfo(ts, status) {
  if (status === "selesai") return null;
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 5)  return { label: mins + "m",        cls: "age-fresh"    };
  if (mins < 12) return { label: mins + "m ⚡",     cls: "age-warn"     };
  return               { label: mins + "m 🔥",      cls: "age-critical" };
}

/* =========================================================
   Navigation
   ========================================================= */
function initNav() {
  document.querySelectorAll(".dp-nav__item").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".dp-nav__item").forEach(b => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      const page = btn.dataset.page;
      document.querySelectorAll(".dp-page").forEach(p => p.classList.remove("is-active"));
      document.getElementById("page-" + page).classList.add("is-active");
      document.getElementById("page-title").textContent =
        page === "pesanan"   ? "Pesanan Masuk"    :
        page === "stok"      ? "Stok Bahan Baku"  : "Statistik";
      if (page === "statistik") renderStatistik();
      document.getElementById("sidebar").classList.remove("is-open");
    });
  });
  document.getElementById("menu-toggle").addEventListener("click", () =>
    document.getElementById("sidebar").classList.toggle("is-open")
  );
}

function updateNavBadge() {
  const cnt = orders.filter(o => o.status === "baru").length;
  const badge = document.getElementById("nav-badge");
  badge.textContent    = cnt;
  badge.style.display  = cnt > 0 ? "inline-block" : "none";
  document.title       = cnt > 0 ? `(${cnt}) RESTOKU — Dapur` : "RESTOKU — Dapur";
}

/* =========================================================
   Clock
   ========================================================= */
function initClock() {
  const tick = () => {
    document.getElementById("clock").textContent =
      new Date().toLocaleTimeString("id-ID", { hour:"2-digit", minute:"2-digit", second:"2-digit" });
  };
  tick();
  setInterval(tick, 1000);
}

/* =========================================================
   Filter
   ========================================================= */
function initFilter() {
  document.querySelectorAll(".dp-filter-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".dp-filter-btn").forEach(b => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      currentFilter = btn.dataset.filter;
      renderOrders();
    });
  });
}

/* =========================================================
   ORDERS — render dengan auto-sort priority + aging
   ========================================================= */
function renderOrders() {
  const list  = document.getElementById("order-list");
  const empty = document.getElementById("orders-empty");

  const filtered = orders.filter(o =>
    currentFilter === "semua" || o.status === currentFilter
  );

  /* ---- POINT 5: Empty state visual ---- */
  if (filtered.length === 0) {
    list.style.display  = "none";
    empty.style.display = "flex";
    return;
  }
  list.style.display  = "grid";
  empty.style.display = "none";

  /* ---- POINT 3: Auto-sort priority ----
     baru (oldest first = paling lama nunggu = paling urgent)
     diproses (oldest first)
     selesai (newest first)
  */
  const sorted = [...filtered].sort((a, b) => {
    const w = { baru: 0, diproses: 1, selesai: 2 };
    if (w[a.status] !== w[b.status]) return w[a.status] - w[b.status];
    return a.status === "selesai" ? b.ts - a.ts : a.ts - b.ts;
  });

  list.innerHTML = sorted.map(order => {
    const age     = agingInfo(order.ts, order.status);
    const canUndo = undoStack.some(u => u.id === order.id);

    const itemsHtml = Object.values(order.items).map(i => {
      const noteHtml = i.note
        ? `<span class="dp-item-note">📝 ${i.note}</span>`
        : "";
      return `<li>
        <span class="item-name">${i.name}</span>
        ${noteHtml}
        <span class="qty">×${i.qty}</span>
      </li>`;
    }).join("");

    /* Tombol aksi utama */
    const actionBtn =
      order.status === "baru"
        ? `<button class="dp-btn dp-btn--primary" data-action="proses" data-id="${order.id}">🍳 Proses</button>`
      : order.status === "diproses"
        ? `<button class="dp-btn dp-btn--primary" data-action="selesai" data-id="${order.id}">✅ Selesai</button>`
        : `<span class="done-label">✅ Selesai</span>`;

    /* Tombol undo */
    const undoBtn = canUndo
      ? `<button class="dp-btn dp-btn--undo" data-action="undo" data-id="${order.id}" title="Batalkan aksi terakhir">↩ Undo</button>`
      : "";

    /* Aging badge */
    const ageBadge = age
      ? `<span class="dp-aging ${age.cls}" data-aging-id="${order.id}">${age.label}</span>`
      : "";

    return `
      <div class="dp-order-card is-${order.status}" id="order-${order.id}">
        <div class="dp-order-card__head">
          <div>
            <div class="dp-order-card__meja">Meja ${order.meja}</div>
            <div class="dp-order-card__nama">${order.nama || "Tamu"}</div>
          </div>
          <div class="dp-order-card__meta">
            <span class="dp-status-badge ${order.status}">${order.status}</span>
            <div class="dp-order-card__time">${formatTime(order.ts)}</div>
            ${ageBadge}
          </div>
        </div>
        <ul class="dp-order-card__items">${itemsHtml}</ul>
        <div class="dp-order-card__total">${formatRupiah(order.total)}</div>
        <div class="dp-order-card__actions">
          ${actionBtn}
          ${undoBtn}
          <button class="dp-btn dp-btn--ghost" data-action="delete" data-id="${order.id}">🗑️</button>
        </div>
      </div>
    `;
  }).join("");

  /* Event delegation — satu listener untuk semua tombol */
  list.onclick = e => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const id = btn.dataset.id;
    const action = btn.dataset.action;
    if (action === "proses")  updateStatus(id, "diproses");
    if (action === "selesai") updateStatus(id, "selesai");
    if (action === "undo")    undoStatus(id);
    if (action === "delete")  deleteOrder(id);
  };
}

/* ---- POINT 3: Aging timer — update label tanpa re-render penuh ---- */
function startAgingTimer() {
  if (agingTick) clearInterval(agingTick);
  agingTick = setInterval(() => {
    document.querySelectorAll("[data-aging-id]").forEach(el => {
      const order = orders.find(o => o.id === el.dataset.agingId);
      if (!order) return;
      const info = agingInfo(order.ts, order.status);
      if (!info) { el.remove(); return; }
      el.textContent = info.label;
      el.className   = `dp-aging ${info.cls}`;
    });
  }, 30000); // tiap 30 detik
}

/* =========================================================
   Status update + Undo
   ========================================================= */
function updateStatus(id, newStatus) {
  const order = orders.find(o => o.id === id);
  if (!order) return;

  const prev = order.status;
  order.status   = newStatus;
  order.statusTs = Date.now();

  /* simpan ke undo stack */
  undoStack = undoStack.filter(u => u.id !== id);
  undoStack.push({ id, prevStatus: prev });
  if (undoStack.length > 10) undoStack.shift();

  saveOrders();
  if (newStatus === "selesai") addToHistory(order);
  renderOrders();
  updateNavBadge();
  showToast(newStatus === "diproses" ? "🍳 Pesanan sedang diproses" : "✅ Pesanan selesai");
}

function undoStatus(id) {
  const entry = undoStack.find(u => u.id === id);
  const order = orders.find(o => o.id === id);
  if (!entry || !order) return;
  order.status = entry.prevStatus;
  delete order.statusTs;
  undoStack = undoStack.filter(u => u.id !== id);
  saveOrders();
  renderOrders();
  updateNavBadge();
  showToast("↩ Status dikembalikan ke: " + entry.prevStatus);
}

function deleteOrder(id) {
  orders    = orders.filter(o => o.id !== id);
  undoStack = undoStack.filter(u => u.id !== id);
  saveOrders();
  renderOrders();
  updateNavBadge();
}

function initClearDone() {
  document.getElementById("clear-done-btn").addEventListener("click", () => {
    const doneIds = orders.filter(o => o.status === "selesai").map(o => o.id);
    orders    = orders.filter(o => o.status !== "selesai");
    undoStack = undoStack.filter(u => !doneIds.includes(u.id));
    saveOrders();
    renderOrders();
    updateNavBadge();
    showToast("Pesanan selesai telah dibersihkan");
  });
}

/* =========================================================
   History & Statistik
   ========================================================= */
function addToHistory(order) {
  const h = loadHistory();
  if (h.find(x => x.id === order.id)) return; // jangan duplikat
  h.push({ ...order, doneDate: todayKey(), doneTs: Date.now() });
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  saveHistory(h.filter(x => x.doneTs >= cutoff));
}

function renderStatistik() {
  const h      = loadHistory();
  const today  = todayKey();
  const todayH = h.filter(x => x.doneDate === today);
  const todayTotal = todayH.reduce((s, x) => s + x.total, 0);
  const avg = todayH.length ? Math.round(todayTotal / todayH.length) : 0;

  document.getElementById("stat-total-order").textContent = h.length;
  document.getElementById("stat-pendapatan").textContent  = formatRupiah(todayTotal);
  document.getElementById("stat-avg").textContent         = formatRupiah(avg);
  document.getElementById("stat-selesai").textContent     = todayH.length;

  /* Menu terlaris */
  const menuCount = {};
  h.forEach(o => Object.values(o.items).forEach(i => {
    menuCount[i.name] = (menuCount[i.name] || 0) + i.qty;
  }));
  const top    = Object.entries(menuCount).sort((a,b) => b[1]-a[1]).slice(0, 5);
  const maxQty = top[0]?.[1] || 1;
  const topEl  = document.getElementById("top-menu-list");

  topEl.innerHTML = top.length === 0
    ? `<div class="dp-no-data">Belum ada data. Tandai pesanan sebagai Selesai untuk mulai mencatat.</div>`
    : top.map(([name, qty], i) => `
        <div class="dp-top-menu-item">
          <span class="dp-top-menu-item__rank">#${i+1}</span>
          <span class="dp-top-menu-item__name">${name}</span>
          <div class="dp-top-menu-item__bar-wrap">
            <div class="dp-top-menu-item__bar" style="width:${Math.round(qty/maxQty*100)}%"></div>
          </div>
          <span class="dp-top-menu-item__count">${qty}x</span>
        </div>
      `).join("");

  renderChart(h);
}

function renderChart(h) {
  const canvas = document.getElementById("sales-chart");
  const ctx    = canvas.getContext("2d");
  const W      = Math.max(canvas.parentElement.offsetWidth - 40, 200);
  const H      = 180;
  canvas.width  = W;
  canvas.height = H;

  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 864e5);
    days.push({
      key:   d.toLocaleDateString("id-ID"),
      label: d.toLocaleDateString("id-ID", { weekday:"short", day:"numeric" }),
    });
  }

  const vals   = days.map(d => h.filter(x => x.doneDate === d.key).reduce((s,x) => s + x.total, 0));
  const maxVal = Math.max(...vals, 1);
  const pad    = { t:20, r:10, b:40, l:54 };
  const cW     = W - pad.l - pad.r;
  const cH     = H - pad.t - pad.b;
  const barW   = cW / days.length * 0.5;
  const gap    = cW / days.length;

  ctx.clearRect(0, 0, W, H);

  /* Grid lines + Y labels */
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth   = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.t + cH - (i/4) * cH;
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke();
    ctx.fillStyle   = "rgba(255,255,255,0.3)";
    ctx.font        = "9px Inter";
    ctx.textAlign   = "right";
    const lbl = maxVal < 100000
      ? formatRupiah(Math.round(maxVal * i/4 / 1000) * 1000)
      : "Rp " + Math.round(maxVal * i/4 / 1000) + "k";
    ctx.fillText(lbl, pad.l - 4, y + 3);
  }

  /* Bars */
  const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + cH);
  grad.addColorStop(0, "#ff8a3d");
  grad.addColorStop(1, "#e3432b");

  vals.forEach((v, i) => {
    const x    = pad.l + i * gap + gap/2 - barW/2;
    const barH = Math.max((v/maxVal) * cH, v > 0 ? 3 : 0);
    const y    = pad.t + cH - barH;
    ctx.fillStyle = grad;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, barW, barH, [3,3,0,0]);
    else ctx.rect(x, y, barW, barH);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.font      = "9px Inter";
    ctx.textAlign = "center";
    ctx.fillText(days[i].label, x + barW/2, H - 8);
  });
}

/* =========================================================
   Stok Bahan
   ========================================================= */
function renderStok() {
  const grid = document.getElementById("stok-grid");
  if (stok.length === 0) {
    grid.innerHTML = `<div class="dp-no-data" style="grid-column:1/-1">Belum ada bahan. Klik "+ Tambah Bahan" untuk mulai.</div>`;
    return;
  }
  grid.innerHTML = stok.map(item => {
    const pct    = Math.min(100, Math.round(item.qty / Math.max(item.min * 3, 1) * 100));
    const isLow  = item.qty <= item.min;
    const barClr = isLow ? "var(--red)" : "var(--green)";
    return `
      <div class="dp-stok-card ${isLow ? "is-low" : "is-ok"}">
        <div class="dp-stok-card__name">${item.nama}</div>
        <div style="display:flex;align-items:baseline;gap:5px">
          <span class="dp-stok-card__qty">${item.qty.toLocaleString("id-ID")}</span>
          <span class="dp-stok-card__satuan">${item.satuan}</span>
        </div>
        ${isLow ? `<div class="dp-stok-card__warning">⚠️ Menipis (min: ${item.min} ${item.satuan})</div>` : ""}
        <div class="dp-stok-card__bar-wrap">
          <div class="dp-stok-card__bar" style="width:${pct}%;background:${barClr}"></div>
        </div>
        <div class="dp-stok-card__actions">
          <input type="number" min="0" placeholder="jumlah" id="stok-input-${item.id}" />
          <button class="dp-btn dp-btn--primary dp-btn--sm" onclick="adjustStok('${item.id}',1)">+ Tambah</button>
          <button class="dp-btn dp-btn--ghost dp-btn--sm"   onclick="adjustStok('${item.id}',-1)">− Kurang</button>
        </div>
        <div class="dp-stok-card__mgmt">
          <button class="dp-btn dp-btn--ghost dp-btn--icon" onclick="editStok('${item.id}')">✏️ Edit</button>
          <button class="dp-btn dp-btn--ghost dp-btn--icon dp-btn--danger" onclick="deleteStok('${item.id}')">🗑️ Hapus</button>
        </div>
      </div>
    `;
  }).join("");
}

function adjustStok(id, sign) {
  const item  = stok.find(s => s.id === id);
  if (!item) return;
  const input = document.getElementById("stok-input-" + id);
  const delta = parseFloat(input.value) || 0;
  if (delta === 0) { showToast("Masukkan jumlah dulu"); return; }
  item.qty = Math.max(0, item.qty + sign * delta);
  input.value = "";
  saveStok(); renderStok();
  showToast(`${item.nama} → ${item.qty.toLocaleString("id-ID")} ${item.satuan}`);
}

function editStok(id) {
  const item = stok.find(s => s.id === id);
  if (!item) return;
  stokEditId = id;
  document.getElementById("modal-title").textContent = "Edit Bahan";
  document.getElementById("stok-nama").value   = item.nama;
  document.getElementById("stok-qty").value    = item.qty;
  document.getElementById("stok-satuan").value = item.satuan;
  document.getElementById("stok-min").value    = item.min;
  document.getElementById("stok-modal").style.display = "flex";
}

function deleteStok(id) {
  stok = stok.filter(s => s.id !== id);
  saveStok(); renderStok();
}

function initStokModal() {
  document.getElementById("add-stok-btn").addEventListener("click", () => {
    stokEditId = null;
    document.getElementById("modal-title").textContent = "Tambah Bahan";
    ["stok-nama","stok-qty","stok-satuan","stok-min"].forEach(id =>
      document.getElementById(id).value = ""
    );
    document.getElementById("stok-modal").style.display = "flex";
  });
  document.getElementById("modal-cancel").addEventListener("click", () =>
    document.getElementById("stok-modal").style.display = "none"
  );
  document.getElementById("stok-modal").addEventListener("click", e => {
    if (e.target === document.getElementById("stok-modal"))
      document.getElementById("stok-modal").style.display = "none";
  });
  document.getElementById("modal-save").addEventListener("click", () => {
    const nama   = document.getElementById("stok-nama").value.trim();
    const qty    = parseFloat(document.getElementById("stok-qty").value) || 0;
    const satuan = document.getElementById("stok-satuan").value.trim() || "unit";
    const min    = parseFloat(document.getElementById("stok-min").value) || 0;
    if (!nama) { showToast("Nama bahan wajib diisi"); return; }
    if (stokEditId) Object.assign(stok.find(s => s.id === stokEditId), { nama, qty, satuan, min });
    else stok.push({ id:"s"+Date.now(), nama, qty, satuan, min });
    saveStok(); renderStok();
    document.getElementById("stok-modal").style.display = "none";
    showToast(stokEditId ? "Bahan diperbarui ✓" : "Bahan ditambahkan ✓");
    stokEditId = null;
  });
}

/* =========================================================
   Toast
   ========================================================= */
let toastTmr = null;
function showToast(msg) {
  const t = document.getElementById("dp-toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTmr);
  toastTmr = setTimeout(() => t.classList.remove("show"), 2800);
}

/* =========================================================
   Notifikasi suara (Web Audio API — double beep)
   ========================================================= */
function playNotif() {
  try {
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    [0, 180].forEach(delay => {
      const osc  = ac.createOscillator();
      const gain = ac.createGain();
      osc.connect(gain); gain.connect(ac.destination);
      osc.type = "sine";
      osc.frequency.value = delay === 0 ? 880 : 1100;
      const t = ac.currentTime + delay/1000;
      gain.gain.setValueAtTime(0.22, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      osc.start(t); osc.stop(t + 0.3);
    });
  } catch(e) {}
}

/* =========================================================
   INIT
   ========================================================= */
document.addEventListener("DOMContentLoaded", () => {
  orders         = loadOrders();
  lastOrderCount = orders.length;
  stok           = loadStok();

  initNav();
  initClock();
  initFilter();
  initClearDone();
  initStokModal();
  initBroadcast();
  startAgingTimer();

  renderOrders();
  updateNavBadge();
  renderStok();
});
