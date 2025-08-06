# Panduan Lengkap Menjalankan Proyek Papra Secara Lokal

Berikut adalah panduan lengkap untuk menjalankan proyek Papra di komputer lokal Anda, mulai dari awal hingga aplikasi berjalan sepenuhnya.

## Langkah 1: Pengenalan Proyek dan Prasyarat

### Apa itu Papra?

Papra adalah platform manajemen dan pengarsipan dokumen yang minimalis. Tujuannya adalah untuk menyediakan tempat yang sederhana dan aman untuk menyimpan dokumen-dokumen penting Anda dalam jangka panjang, seperti arsip digital pribadi. Anda bisa menyimpan struk, garansi, kontrak, dan dokumen lainnya dengan mudah.

### Prasyarat (Hal yang Perlu Anda Siapkan)

Sebelum memulai, pastikan komputer Anda telah terinstal perangkat lunak berikut. Ini sangat penting agar proses instalasi berjalan lancar.

1.  **Git:** Anda memerlukan Git untuk mengunduh (clone) kode proyek dari GitHub. Jika belum punya, Anda bisa mengunduhnya dari [git-scm.com](https://git-scm.com/).

2.  **Node.js (Versi 22):** Proyek ini memerlukan Node.js versi 22. Cara termudah untuk mengelola versi Node.js adalah dengan menggunakan **nvm** (Node Version Manager).
    *   **Untuk menginstal nvm:** Ikuti petunjuk di [repositori resmi nvm](https://github.com/nvm-sh/nvm).
    *   Setelah nvm terinstal, Anda bisa menginstal dan menggunakan Node.js versi 22 dengan perintah: `nvm install 22 && nvm use 22`.

3.  **pnpm:** Proyek ini menggunakan `pnpm` sebagai manajer paket, bukan `npm` atau `yarn`. `pnpm` lebih efisien dalam mengelola dependensi dalam monorepo seperti ini.
    *   **Untuk menginstal pnpm:** Setelah Node.js terinstal, Anda bisa menginstal pnpm secara global dengan perintah: `npm install -g pnpm`.

## Langkah 2: Instalasi Proyek

Sekarang kita akan mengunduh kode proyek dan menginstal semua dependensi yang diperlukan. Ikuti perintah-perintah di bawah ini secara berurutan di terminal Anda.

1.  **Clone Repositori**
    Unduh kode sumber proyek dari GitHub ke komputer lokal Anda.
    ```bash
    git clone https://github.com/papra-hq/papra.git
    ```

2.  **Masuk ke Direktori Proyek**
    Setelah selesai, pindah ke dalam direktori proyek yang baru saja dibuat.
    ```bash
    cd papra
    ```

3.  **Aktifkan Versi Node.js yang Benar**
    Jika Anda menggunakan `nvm`, Anda bisa menjalankan perintah berikut untuk secara otomatis menggunakan versi Node.js yang ditentukan dalam file `.nvmrc` proyek ini (yaitu, versi 22).
    ```bash
    nvm use
    ```
    Anda akan melihat pesan konfirmasi seperti `Now using node v22.x.x (npm v10.x.x)`.

4.  **Instal Dependensi**
    Gunakan `pnpm` untuk menginstal semua paket dan pustaka yang dibutuhkan oleh proyek. Perintah ini akan membaca file `pnpm-lock.yaml` dan mengunduh semua yang diperlukan.
    ```bash
    pnpm install
    ```

5.  **Bangun Paket Internal (Build Packages)**
    Karena ini adalah monorepo, beberapa aplikasi (seperti server dan klien) bergantung pada paket-paket internal yang ada di dalam direktori `packages/`. Anda perlu membangun (build) paket-paket ini terlebih dahulu sebelum bisa menjalankan aplikasi utama.
    ```bash
    pnpm build:packages
    ```

## Langkah 3: Menjalankan Aplikasi

Aplikasi Papra terdiri dari dua bagian utama: **backend** (server) dan **frontend** (antarmuka pengguna). Keduanya harus dijalankan secara bersamaan di dua terminal yang terpisah.

### A. Menjalankan Backend (Server)

1.  **Buka Terminal Pertama.** Di terminal ini, navigasikan ke direktori server.
    ```bash
    cd apps/papra-server
    ```

2.  **Jalankan Migrasi Database.** Perintah ini akan membuat dan menyiapkan skema database SQLite lokal Anda.
    ```bash
    pnpm migrate:up
    ```

3.  **Mulai Server.** Setelah database siap, jalankan server dalam mode pengembangan.
    ```bash
    pnpm dev
    ```
    Biarkan terminal ini tetap terbuka. Server akan berjalan di port `1221`.

### B. Menjalankan Frontend (Client)

1.  **Buka Terminal Kedua (Baru).** Buka jendela atau tab terminal yang baru.

2.  **Navigasikan ke Direktori Klien.**
    ```bash
    cd apps/papra-client
    ```

3.  **Mulai Klien.** Jalankan klien dalam mode pengembangan.
    ```bash
    pnpm dev
    ```
    Server pengembangan frontend akan dimulai di `http://localhost:3000`.

## Langkah 4: Verifikasi dan Penggunaan Awal

1.  **Buka Aplikasi di Browser**
    Buka browser web Anda dan kunjungi: [**http://localhost:3000**](http://localhost:3000)

2.  **Verifikasi**
    Anda akan melihat halaman login aplikasi Papra. Ini menandakan semuanya berjalan dengan benar.

3.  **Membuat Akun Pertama**
    Buat akun baru untuk mulai menggunakan aplikasi.

**Selesai!** Anda sekarang telah berhasil menjalankan proyek Papra 100% di komputer lokal Anda.
