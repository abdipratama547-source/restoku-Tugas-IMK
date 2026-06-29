/* =========================================================
   RESTOKU — Customer Logic  (v3 — full sync)
   =========================================================
   Storage keys (harus sinkron dengan dapur.js):
     restoku_cart              → keranjang aktif
     restoku_last_order        → order terakhir (untuk struk)
     restoku_orders            → antrean dapur (array)
     restoku_active_order_id   → id order aktif untuk tracker
   BroadcastChannel: "restoku_channel"
   ========================================================= */

const CART_KEY    = "restoku_cart";
const ORDER_KEY   = "restoku_last_order";
const ORDERS_KEY  = "restoku_orders";       // shared dengan dapur
const BC_NAME     = "restoku_channel";

/* =========================================================
   Hamburger / Dropdown Nav
   ========================================================= */
function initHamburgerNav() {
  const btn      = document.getElementById("nav-hamburger");
  const dropdown = document.getElementById("nav-dropdown");
  const dim      = document.getElementById("nav-dim");
  if (!btn || !dropdown) return;

  function open() {
    btn.classList.add("is-open");
    dropdown.classList.add("is-open");
    if (dim) dim.classList.add("is-open");
    btn.setAttribute("aria-expanded", "true");
  }
  function close() {
    btn.classList.remove("is-open");
    dropdown.classList.remove("is-open");
    if (dim) dim.classList.remove("is-open");
    btn.setAttribute("aria-expanded", "false");
  }
  function toggle() {
    dropdown.classList.contains("is-open") ? close() : open();
  }

  btn.addEventListener("click", e => { e.stopPropagation(); toggle(); });
  if (dim) dim.addEventListener("click", close);
  document.addEventListener("keydown", e => { if (e.key === "Escape") close(); });
  dropdown.querySelectorAll("a").forEach(a => {
    a.addEventListener("click", () => setTimeout(close, 80));
  });
}

/* =========================================================
   Banner Slideshow
   ========================================================= */
function initBannerSlideshow() {
  const slides   = document.querySelectorAll(".ad-banner__slide");
  const dots     = document.querySelectorAll(".ad-banner__dots span");
  if (!slides.length || !dots.length) return;

  let current  = 0;
  let interval = null;

  function goTo(idx) {
    slides[current].classList.remove("is-active");
    dots[current].classList.remove("active");
    current = (idx + slides.length) % slides.length;
    slides[current].classList.add("is-active");
    dots[current].classList.add("active");
  }

  function next() { goTo(current + 1); }

  // Auto-play setiap 6 detik
  function startAuto() {
    interval = setInterval(next, 6000);
  }
  function stopAuto() {
    clearInterval(interval);
  }

  startAuto();

  // Klik dot untuk pindah slide
  dots.forEach((dot, i) => {
    dot.addEventListener("click", () => {
      stopAuto();
      goTo(i);
      startAuto();
    });
  });

  // Tombol panah manual
  const prevBtn = document.getElementById("banner-prev");
  const nextBtn = document.getElementById("banner-next");
  if (prevBtn) {
    prevBtn.addEventListener("click", () => {
      stopAuto();
      goTo(current - 1);
      startAuto();
    });
  }
  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      stopAuto();
      goTo(current + 1);
      startAuto();
    });
  }

  // Swipe support untuk mobile
  const banner = document.getElementById("ad-banner");
  if (banner) {
    let startX = 0;
    banner.addEventListener("touchstart", e => { startX = e.touches[0].clientX; }, { passive: true });
    banner.addEventListener("touchend", e => {
      const diff = startX - e.changedTouches[0].clientX;
      if (Math.abs(diff) > 40) {
        stopAuto();
        goTo(diff > 0 ? current + 1 : current - 1);
        startAuto();
      }
    }, { passive: true });
  }
}

/* =========================================================
   Cart helpers
   ========================================================= */
function getCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY)) || {}; }
  catch(e) { return {}; }
}
function saveCart(c) { localStorage.setItem(CART_KEY, JSON.stringify(c)); }
function cartTotalQty(c) { return Object.values(c).reduce((s,i) => s + i.qty, 0); }
function formatRupiah(n) { return "Rp." + n.toLocaleString("id-ID"); }

/* =========================================================
   Toast
   ========================================================= */
function showToast(msg) {
  let t = document.querySelector(".toast");
  if (!t) { t = document.createElement("div"); t.className = "toast"; document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._tmr);
  t._tmr = setTimeout(() => t.classList.remove("show"), 1800);
}

/* =========================================================
   Cart badge
   ========================================================= */
function refreshCartBadge() {
  const b = document.querySelector(".cart-fab__badge");
  if (!b) return;
  const qty = cartTotalQty(getCart());
  b.textContent = qty;
  b.style.display = qty > 0 ? "flex" : "none";
}

/* =========================================================
   Qty mutation  (stores note too)
   ========================================================= */
let currentSheetId = null;
let currentSheetDraftNote = "";

function changeCartQty(id, name, price, delta) {
  const cart = getCart();
  const cur  = cart[id]?.qty || 0;
  const next = Math.max(0, cur + delta);
  if (next === 0) {
    delete cart[id];
  } else {
    const existingNote = cart[id]?.note;
    const note = existingNote !== undefined
      ? existingNote
      : (id === currentSheetId ? currentSheetDraftNote : "");
    cart[id] = { name, price, qty: next, note };
  }
  saveCart(cart);
  refreshCartBadge();
  updateCardQtyUI(id, next);
  updateSheetQtyUI(id, next);
}

function updateNoteInCart(id, note) {
  const cart = getCart();
  if (cart[id]) {
    cart[id].note = note;
    saveCart(cart);
  }
  if (id === currentSheetId) currentSheetDraftNote = note;
}

function updateCardQtyUI(id, qty) {
  const card = document.querySelector(`.menu-card[data-id="${id}"]`);
  if (!card) return;
  const lbl = card.querySelector(".menu-card__qty");
  if (qty > 0) { lbl.textContent = qty; lbl.classList.add("show"); }
  else lbl.classList.remove("show");
}

function updateSheetQtyUI(id, qty) {
  if (id !== currentSheetId) return;
  const el = document.querySelector("[data-detail-qty]");
  if (el) el.textContent = qty;
}

/* =========================================================
   index.html — menu page
   ========================================================= */
function initMenuPage() {
  const tabs   = document.querySelectorAll(".tab");
  const panels = document.querySelectorAll("[data-category-panel]");
  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      tabs.forEach(t => t.classList.remove("is-active"));
      tab.classList.add("is-active");
      panels.forEach(p => {
        p.style.display = p.dataset.categoryPanel === tab.dataset.category ? "grid" : "none";
      });
    });
  });

  document.querySelectorAll(".menu-card").forEach(card => {
    const id    = card.dataset.id;
    const price = parseInt(card.dataset.price, 10);
    const name  = card.dataset.name;
    const plusBtn  = card.querySelector(".qty-btn--plus");
    const minusBtn = card.querySelector(".qty-btn--minus");
    if (plusBtn)  plusBtn.addEventListener("click",  e => { e.stopPropagation(); changeCartQty(id, name, price, 1); });
    if (minusBtn) minusBtn.addEventListener("click", e => { e.stopPropagation(); changeCartQty(id, name, price, -1); });
    card.addEventListener("click", () => openDetailSheet(card));
    updateCardQtyUI(id, getCart()[id]?.qty || 0);
  });
  refreshCartBadge();
}

/* =========================================================
   Detail Bottom Sheet  (with custom note)
   ========================================================= */
function openDetailSheet(card) {
  const overlay = document.querySelector("[data-detail-overlay]");
  if (!overlay) return;
  const id    = card.dataset.id;
  const name  = card.dataset.name;
  const price = parseInt(card.dataset.price, 10);
  const desc  = card.dataset.desc || "";
  currentSheetId = id;

  const mediaWrap = overlay.querySelector("[data-detail-media]");
  const imgEl     = card.querySelector(".menu-card__img-wrap img");
  const phEl      = card.querySelector(".menu-card__img-wrap.is-placeholder");
  mediaWrap.innerHTML = "";
  mediaWrap.classList.toggle("is-placeholder", !imgEl);
  if (imgEl) { const im = document.createElement("img"); im.src = imgEl.src; im.alt = name; mediaWrap.appendChild(im); }
  else if (phEl) mediaWrap.innerHTML = phEl.innerHTML;

  overlay.querySelector("[data-detail-name]").textContent  = name;
  overlay.querySelector("[data-detail-price]").textContent = formatRupiah(price);
  overlay.querySelector("[data-detail-desc]").textContent  = desc;
  overlay.querySelector("[data-detail-qty]").textContent   = getCart()[id]?.qty || 0;

  const noteEl = overlay.querySelector("[data-detail-note]");
  if (noteEl) {
    currentSheetDraftNote = getCart()[id]?.note || "";
    noteEl.value   = currentSheetDraftNote;
    noteEl.oninput = () => updateNoteInCart(id, noteEl.value.trim());
  }

  overlay.querySelector("[data-detail-minus]").onclick = () => changeCartQty(id, name, price, -1);
  overlay.querySelector("[data-detail-plus]").onclick  = () => changeCartQty(id, name, price, 1);

  overlay.classList.remove("is-open");
  void overlay.querySelector("[data-detail-sheet]").offsetWidth;
  requestAnimationFrame(() => overlay.classList.add("is-open"));
  document.body.style.overflow = "hidden";
}

function closeDetailSheet() {
  const overlay = document.querySelector("[data-detail-overlay]");
  if (!overlay) return;
  overlay.classList.remove("is-open");
  currentSheetId = null;
  document.body.style.overflow = "";
}

function initDetailSheet() {
  const overlay = document.querySelector("[data-detail-overlay]");
  if (!overlay) return;
  overlay.addEventListener("click", e => { if (e.target === overlay) closeDetailSheet(); });
  const cb = overlay.querySelector("[data-detail-close]");
  if (cb) cb.addEventListener("click", closeDetailSheet);
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeDetailSheet(); });
}

/* =========================================================
   FAQ (bantuan.html)
   ========================================================= */
function initFaqPage() {
  document.querySelectorAll(".faq-item").forEach(item => {
    const q = item.querySelector(".faq-item__q");
    const a = item.querySelector(".faq-item__a");
    q.addEventListener("click", () => {
      const open = item.classList.contains("is-open");
      document.querySelectorAll(".faq-item.is-open").forEach(o => {
        o.classList.remove("is-open");
        o.querySelector(".faq-item__a").style.maxHeight = null;
      });
      if (!open) { item.classList.add("is-open"); a.style.maxHeight = a.scrollHeight + 20 + "px"; }
    });
  });
}

/* =========================================================
   Pembayaran — konfirmasi ringkasan + submit
   ========================================================= */
function initPaymentPage() {
  const linesWrap = document.querySelector("[data-order-lines]");
  const totalWrap = document.querySelector("[data-order-total]");
  const emptyMsg  = document.querySelector("[data-empty-cart]");
  const form      = document.querySelector("[data-payment-form]");
  if (!linesWrap || !totalWrap || !form) return;

  const cart = getCart();
  const ids  = Object.keys(cart);
  if (ids.length === 0) {
    if (emptyMsg) emptyMsg.style.display = "block";
    form.style.display = "none";
    return;
  }

  let total = 0;
  linesWrap.innerHTML = "";
  ids.forEach(id => {
    const item = cart[id];
    const sub  = item.price * item.qty;
    total += sub;
    const line = document.createElement("div");
    line.className = "order-line";
    line.innerHTML = `
      <span class="order-line__name">${item.name}</span>
      ${item.note ? `<span class="order-line__note">📝 ${item.note}</span>` : ""}
      <span class="order-line__qty">x${item.qty}</span>
      <span class="order-line__price">${formatRupiah(sub)}</span>
    `;
    linesWrap.appendChild(line);
  });
  totalWrap.textContent = formatRupiah(total);

  form.addEventListener("submit", e => {
    e.preventDefault();
    const nama   = form.querySelector("#nama").value.trim() || "-";
    const meja   = form.querySelector("#meja").value.trim() || "-";
    const metode = form.querySelector('input[name="metode"]:checked');
    if (!metode) { showToast("Pilih metode pembayaran terlebih dahulu"); return; }
    showConfirmModal({ nama, meja, cart, total, metode: metode.value });
  });
}

/* ---------- Konfirmasi modal sebelum order dikirim ---------- */
function showConfirmModal({ nama, meja, cart, total, metode }) {
  const overlay = document.getElementById("confirm-overlay");
  if (!overlay) { doSubmitOrder({ nama, meja, cart, total }); return; }

  // Isi data confirm
  document.getElementById("confirm-meja").textContent   = "Meja " + meja;
  document.getElementById("confirm-nama").textContent   = nama;
  document.getElementById("confirm-total").textContent  = formatRupiah(total);
  document.getElementById("confirm-metode").textContent = metode;

  const itemsEl = document.getElementById("confirm-items");
  itemsEl.innerHTML = Object.values(cart).map(i =>
    `<li>
       <span class="ci-name">${i.name}</span>
       <span class="ci-qty">×${i.qty}</span>
       <span class="ci-price">${formatRupiah(i.price * i.qty)}</span>
       ${i.note ? `<span class="ci-note">📝 ${i.note}</span>` : ""}
     </li>`
  ).join("");

  overlay.classList.add("is-open");

  document.getElementById("confirm-yes").onclick = () => {
    overlay.classList.remove("is-open");
    doSubmitOrder({ nama, meja, cart, total });
  };
  document.getElementById("confirm-no").onclick = () => overlay.classList.remove("is-open");
}

/* ---------- Kirim order ke localStorage + BroadcastChannel ---------- */
function doSubmitOrder({ nama, meja, cart, total }) {
  // simpan untuk halaman struk
  localStorage.setItem(ORDER_KEY, JSON.stringify({ nama, meja, items: cart, total }));
  localStorage.removeItem(CART_KEY);

  // buat object order yang sinkron dengan schema dapur.js
  const dapurOrder = {
    id:     "ord-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
    nama,
    meja,
    items:  cart,     // { [id]: { name, price, qty, note } }
    total,
    status: "baru",   // baru | diproses | selesai
    ts:     Date.now(),
  };

  // simpan ke antrean dapur
  try {
    const existing = JSON.parse(localStorage.getItem(ORDERS_KEY) || "[]");
    existing.push(dapurOrder);
    localStorage.setItem(ORDERS_KEY, JSON.stringify(existing));
  } catch(e) {}

  // simpan id aktif untuk live tracker
  localStorage.setItem("restoku_active_order_id", dapurOrder.id);

  // broadcast real-time ke tab dapur
  try {
    const bc = new BroadcastChannel(BC_NAME);
    bc.postMessage({ type: "new_order", order: dapurOrder });
    bc.close();
  } catch(e) {}

  window.location.href = "struk.html";
}

/* =========================================================
   Struk — live order tracker + dynamic ETA + rating modal
   ========================================================= */
function initReceiptPage() {
  const body    = document.querySelector("[data-receipt-body]");
  const totalEl = document.querySelector("[data-receipt-total]");
  const namaEl  = document.querySelector("[data-receipt-nama]");
  const mejaEl  = document.querySelector("[data-receipt-meja]");
  if (!body || !totalEl || !namaEl || !mejaEl) return;

  const raw = localStorage.getItem(ORDER_KEY);
  if (!raw) return;
  const order = JSON.parse(raw);
  namaEl.textContent = order.nama;
  mejaEl.textContent = order.meja;

  body.innerHTML = "";
  Object.values(order.items).forEach(item => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${item.name}${item.note ? `<br><small class="item-note-small">📝 ${item.note}</small>` : ""}</td>
      <td>x ${item.qty}</td>
      <td>${formatRupiah(item.price * item.qty)}</td>
    `;
    body.appendChild(row);
  });
  totalEl.textContent = formatRupiah(order.total);

  initLiveTracker();
}

/* ---------- Live Order Tracker ---------- */
function initLiveTracker() {
  const tracker = document.getElementById("live-tracker");
  if (!tracker) return;

  const orderId = localStorage.getItem("restoku_active_order_id");
  if (!orderId) return;

  function getOrderFromStorage() {
    try {
      const all = JSON.parse(localStorage.getItem(ORDERS_KEY) || "[]");
      return all.find(o => o.id === orderId) || null;
    } catch(e) { return null; }
  }

  const STEPS   = ["baru",          "diproses",          "selesai"];
  const LABELS  = ["Pesanan Diterima", "Sedang Dimasak",  "Siap Disajikan"];
  const ETA_MAP = {
    baru:     () => "Estimasi ~10–15 menit",
    diproses: (o) => {
      const elap = Math.floor((Date.now() - o.ts) / 60000);
      return `Estimasi ~${Math.max(1, 12 - elap)} menit lagi`;
    },
    selesai:  () => "Pesanan siap! 🎉",
  };

  function renderTracker(o) {
    if (!o) return;
    const idx = STEPS.indexOf(o.status);
    const eta = ETA_MAP[o.status] ? ETA_MAP[o.status](o) : "";

    tracker.innerHTML = `
      <div class="tracker-steps">
        ${STEPS.map((s, i) => `
          <div class="tracker-step ${i < idx ? "is-done" : ""} ${i === idx ? "is-active" : ""}">
            <div class="tracker-step__dot">${i < idx ? "✓" : ""}</div>
            <div class="tracker-step__connector ${i < STEPS.length - 1 && i < idx ? "is-filled" : ""}"></div>
            <div class="tracker-step__label">${LABELS[i]}</div>
          </div>
        `).join("")}
      </div>
      <div class="tracker-eta ${o.status === "selesai" ? "is-done" : ""}">${eta}</div>
    `;

    if (o.status === "selesai" && !localStorage.getItem("restoku_rated_" + orderId)) {
      setTimeout(() => showRatingModal(orderId), 1500);
    }
  }

  // render awal
  renderTracker(getOrderFromStorage());

  // polling setiap 5 detik (fallback)
  setInterval(() => renderTracker(getOrderFromStorage()), 5000);

  // real-time via BroadcastChannel
  try {
    const bc = new BroadcastChannel(BC_NAME);
    bc.onmessage = e => {
      if (e.data.type === "orders_updated") renderTracker(getOrderFromStorage());
    };
  } catch(e) {}
}

/* ---------- Rating Modal ---------- */
function showRatingModal(orderId) {
  const modal = document.getElementById("rating-modal");
  if (!modal) return;
  if (localStorage.getItem("restoku_rated_" + orderId)) return;
  modal.classList.add("is-open");

  let selected = 0;
  const stars = modal.querySelectorAll(".rating-star");

  // Reset semua bintang
  stars.forEach(s => { s.classList.remove("is-active", "is-hover"); });

  // Clone untuk hapus event lama, lalu pasang ulang
  stars.forEach((star, i) => {
    const fresh = star.cloneNode(true);
    star.parentNode.replaceChild(fresh, star);
  });

  const freshStars = modal.querySelectorAll(".rating-star");
  freshStars.forEach((star, i) => {
    star.addEventListener("click", () => {
      selected = i + 1;
      freshStars.forEach((s, j) => {
        s.classList.toggle("is-active", j < selected);
        s.classList.remove("is-hover");
      });
    });
    star.addEventListener("mouseenter", () => {
      freshStars.forEach((s, j) => s.classList.toggle("is-hover", j <= i));
    });
    star.addEventListener("mouseleave", () => {
      freshStars.forEach(s => s.classList.remove("is-hover"));
    });
  });

  const submitBtn = modal.querySelector("#rating-submit");
  const skipBtn   = modal.querySelector("#rating-skip");

  const newSubmit = submitBtn.cloneNode(true);
  submitBtn.parentNode.replaceChild(newSubmit, submitBtn);
  const newSkip = skipBtn.cloneNode(true);
  skipBtn.parentNode.replaceChild(newSkip, skipBtn);

  newSubmit.addEventListener("click", () => {
    if (!selected) { showToast("Pilih bintang dulu ya!"); return; }
    localStorage.setItem("restoku_rated_" + orderId, selected);
    showToast(selected >= 4 ? "Terima kasih! Senang bisa melayani 🙏" : "Terima kasih! Kami akan terus meningkatkan pelayanan.");
    modal.classList.remove("is-open");
  });
  newSkip.addEventListener("click", () => {
    localStorage.setItem("restoku_rated_" + orderId, "skip");
    modal.classList.remove("is-open");
  });
}

/* =========================================================
   Login
   ========================================================= */
function initLoginPage() {
  const form = document.querySelector("[data-login-form]");
  if (!form) return;
  form.addEventListener("submit", e => {
    e.preventDefault();
    showToast("Fitur login akan segera tersedia");
    setTimeout(() => (window.location.href = "index.html"), 900);
  });
}

/* =========================================================
   Cart FAB guard
   ========================================================= */
function initCartGuard() {
  const fab = document.querySelector(".cart-fab");
  if (!fab) return;
  fab.addEventListener("click", e => {
    if (cartTotalQty(getCart()) === 0) {
      e.preventDefault();
      showToast("Pilih menu dulu sebelum masuk ke keranjang ya!");
      fab.classList.add("shake");
      setTimeout(() => fab.classList.remove("shake"), 400);
    }
  });
}

/* =========================================================
   INIT
   ========================================================= */
document.addEventListener("DOMContentLoaded", () => {
  [
    initHamburgerNav,
    initBannerSlideshow,
    refreshCartBadge,
    initMenuPage,
    initFaqPage,
    initPaymentPage,
    initReceiptPage,
    initLoginPage,
    initCartGuard,
    initDetailSheet,
  ].forEach(task => {
    try { task(); }
    catch(err) { console.error("RESTOKU:", task.name, err); }
  });
});
