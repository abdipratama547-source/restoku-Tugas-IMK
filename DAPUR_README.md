# RESTOKU — Panel Dapur 🍳

## Cara Pakai

### Untuk Customer (sudah ada):
- Buka `index.html` → pesan menu → `pembayaran.html` → bayar → struk

### Untuk Dapur / Karyawan:
- Buka `dapur.html` di tab/device lain
- Pesanan dari customer akan **muncul otomatis** tanpa refresh!

---

## Fitur Dashboard Dapur

### 🍽️ Tab Pesanan
- Order baru ditandai merah 🔴
- Tombol **"Proses"** → status jadi kuning 🟡
- Tombol **"Selesai"** → status jadi hijau 🟢, masuk statistik
- Filter by status, tombol "Bersihkan Selesai"
- Notifikasi bunyi + badge counter di tab browser

### 📦 Tab Stok Bahan
- Tambah/edit/hapus bahan baku
- Bar progress: merah jika stok ≤ ambang minimum
- Input +/− untuk adjust qty langsung

### 📊 Tab Statistik
- Total order & pendapatan hari ini
- Rata-rata nilai per pesanan
- Ranking menu terlaris (bar chart)
- Grafik penjualan 7 hari terakhir

---

## Arsitektur Koneksi

```
[index.html / Customer] 
    → pesan & bayar
    → simpan ke localStorage("restoku_orders")  
    → BroadcastChannel.postMessage({ type:"new_order" })
         ↓
[dapur.html / Karyawan]
    → BroadcastChannel.onmessage → tampilkan notif + order baru
    → Fallback: polling localStorage setiap 3 detik (browser lama)
```

### Catatan untuk GitHub Pages:
- Semua data tersimpan di **localStorage browser** — tidak ada backend/database
- Tab customer & dapur harus di **browser yang sama** (atau gunakan shared hosting dengan server)
- Untuk produksi nyata, pertimbangkan Firebase Realtime Database / Supabase sebagai backend

---

## Struktur File Baru

```
restoku/
├── dapur.html          ← Dashboard dapur (BARU)
├── css/
│   ├── style.css       ← Styling customer (existing)
│   └── dapur.css       ← Styling dashboard (BARU)
├── js/
│   ├── main.js         ← Customer logic + broadcast order (dimodifikasi)
│   └── dapur.js        ← Dashboard dapur logic (BARU)
└── ...
```
