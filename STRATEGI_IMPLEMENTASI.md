# Strategi Implementasi: Integrasi Google Gemini API untuk OCR

Dokumen ini menguraikan strategi teknis untuk mengganti fungsionalitas OCR (Optical Character Recognition) yang ada berbasis Tesseract.js dengan Google Gemini API dalam aplikasi Papra. Tujuannya adalah untuk meningkatkan akurasi dan kemampuan ekstraksi teks dari dokumen yang diunggah.

## 1. Analisis Sistem Saat Ini

Setelah melakukan eksplorasi kode, alur kerja ekstraksi teks saat ini adalah sebagai berikut:

1.  **Upload File:** Pengguna mengunggah file melalui frontend. Endpoint `createDocument` di `apps/papra-server/src/modules/documents/documents.usecases.ts` menerima file tersebut.
2.  **Penyimpanan & Task Scheduling:** File disimpan ke dalam sistem penyimpanan (misalnya, disk lokal atau S3), dan sebuah entri dokumen dibuat di database. Setelah itu, sebuah pekerjaan latar belakang (background job) dengan nama `extract-document-file-content` dijadwalkan menggunakan `taskServices`.
3.  **Eksekusi Task:** Worker mengambil pekerjaan ini, yang kemudian memanggil use case `extractAndSaveDocumentFileContent`.
4.  **Ekstraksi Teks:** Use case ini memanggil `extractDocumentText` dari `apps/papra-server/src/modules/documents/documents.services.ts`.
5.  **Pemanggilan Paket `@papra/lecture`:** Fungsi `extractDocumentText` memanggil fungsi `extractTextFromFile` dari paket internal `@papra/lecture`.
6.  **Logika OCR:** Dalam `@papra/lecture`, logika ekstraksi ditangani oleh "extractor" yang sesuai dengan tipe file.
    *   `packages/lecture/src/extractors/img.extractor.ts`: Menggunakan `tesseract.js` untuk melakukan OCR pada file gambar.
    *   `packages/lecture/src/extractors/pdf.extractor.ts`: Menggunakan library `unpdf` untuk mengekstrak teks dari PDF berbasis teks. Jika gagal (menandakan PDF berbasis gambar), ia akan mengekstrak gambar dari PDF dan menggunakan `img.extractor.ts` untuk melakukan OCR pada setiap gambar.

Desain ini sangat modular, yang memungkinkan kita untuk menukar mesin OCR dengan dampak minimal pada bagian lain dari aplikasi.

## 2. Solusi yang Diusulkan: Integrasi Gemini API

Solusi yang diusulkan adalah mengganti `tesseract.js` dengan Google Gemini API (khususnya model yang mendukung vision, seperti `gemini-pro-vision`) di dalam paket `@papra/lecture`.

### Keuntungan:
*   **Akurasi Lebih Tinggi:** Model AI modern seperti Gemini umumnya menawarkan akurasi yang jauh lebih baik daripada Tesseract.
*   **Dukungan Bahasa yang Luas:** Kemampuan OCR yang lebih baik untuk berbagai bahasa.
*   **Perawatan Minimal:** Mengandalkan layanan terkelola (managed service) mengurangi beban perawatan.

### Perubahan Teknis:

#### Langkah 1: Penambahan Dependensi
Saya akan menambahkan library klien Google AI ke dalam paket `lecture`.

*   **File:** `packages/lecture/package.json`
*   **Dependensi:** `@google/generative-ai`
*   **Perintah:** `pnpm install` di root proyek setelah memodifikasi `package.json`.

#### Langkah 2: Modifikasi Image Extractor (`img.extractor.ts`)
Ini adalah inti dari perubahan. Saya akan menulis ulang fungsi `extractTextFromImage`.

*   **File:** `packages/lecture/src/extractors/img.extractor.ts`
*   **Logika Lama (Tesseract):**
    ```typescript
    import { createWorker } from 'tesseract.js';

    // ...
    const worker = await createWorker(languages);
    const { data: { text } } = await worker.recognize(buffer);
    await worker.terminate();
    return text;
    ```

*   **Logika Baru (Gemini):**
    ```typescript
    import { GoogleGenerativeAI } from '@google/generative-ai';

    // ...
    // API Key akan diambil dari konfigurasi
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-pro-vision' });

    const prompt = "Extract all text from this document. Provide only the text content without any additional formatting or explanation.";

    // Mengubah Buffer ke base64 untuk dikirim ke API
    const imagePart = {
      inlineData: {
        data: buffer.toString('base64'),
        mimeType: 'image/png', // atau mimeType yang sesuai
      },
    };

    const result = await model.generateContent([prompt, imagePart]);
    const response = await result.response;
    const text = response.text();

    return text;
    ```

#### Langkah 3: Manajemen Konfigurasi API Key
Kunci API Gemini adalah rahasia dan harus dikelola dengan aman.

1.  **Menambahkan ke Konfigurasi Server:**
    *   Saya akan menambahkan variabel lingkungan baru, `GEMINI_API_KEY`, ke dalam konfigurasi server.
    *   **File:** `apps/papra-server/src/modules/config/config.schema.ts` dan `apps/papra-server/src/modules/config/config.ts`.
    *   Ini akan membaca `process.env.GEMINI_API_KEY`.

2.  **Meneruskan Konfigurasi ke `@papra/lecture`:**
    *   Saat ini, `extractTextFromFile` menerima `config: { tesseract: ... }`. Saya akan memodifikasinya untuk juga menerima konfigurasi Gemini.
    *   **File:** `apps/papra-server/src/modules/documents/documents.services.ts`
        ```typescript
        // Perubahan panggilan
        await extractTextFromFile({
          file,
          config: {
            tesseract: { languages: ocrLanguages },
            gemini: { apiKey: config.gemini.apiKey } // Mengambil dari config server
          }
        });
        ```
    *   **File:** `packages/lecture/src/extractors.usecases.ts`
        *   Fungsi `extractTextFromFile` akan menerima konfigurasi baru ini dan meneruskannya ke extractor yang relevan.
    *   **File:** `packages/lecture/src/extractors/img.extractor.ts`
        *   Extractor gambar akan menerima `apiKey` dari argumen `extract` dan menggunakannya untuk menginisialisasi klien Gemini.

## 3. Strategi Pengujian

1.  **Setup Lokal:** Saya akan mengikuti `PANDUAN.md` untuk menjalankan proyek secara lokal.
2.  **Konfigurasi Lingkungan:** Saya akan membuat file `.env` di `apps/papra-server` dan menambahkan `GEMINI_API_KEY=...` dengan kunci API yang valid.
3.  **Pengujian Fungsional:**
    *   **Upload Gambar:** Mengunggah beberapa file gambar (PNG, JPG) dengan teks yang jelas dan teks yang sedikit buram untuk memverifikasi akurasi.
    *   **Upload PDF Pindaian:** Mengunggah file PDF yang merupakan hasil pindaian (image-based) untuk memastikan alur `pdf.extractor.ts` -> `img.extractor.ts` -> Gemini API berfungsi dengan benar.
    *   **Upload PDF Teks:** Mengunggah PDF normal untuk memastikan fungsionalitas ekstraksi teks langsung (non-OCR) tidak terpengaruh.
4.  **Verifikasi:**
    *   Memeriksa log server untuk setiap error dari Gemini API.
    *   Memeriksa UI Papra untuk memastikan bahwa konten yang diekstraksi muncul dengan benar di detail dokumen.
    *   Membandingkan hasil ekstraksi Gemini dengan hasil Tesseract sebelumnya (jika memungkinkan) untuk menilai peningkatannya.

## 4. Rencana Eksekusi

Setelah strategi ini disetujui, saya akan melanjutkan dengan rencana eksekusi yang telah saya buat sebelumnya, yang sejalan dengan langkah-langkah teknis yang diuraikan di atas.

1.  Instalasi dependensi.
2.  Modifikasi `img.extractor.ts`.
3.  Update penanganan konfigurasi.
4.  Pengujian menyeluruh.
5.  Submit perubahan untuk ditinjau.
