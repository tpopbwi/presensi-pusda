Pada dasarnya, aplikasi web (HTML, CSS, JS) bersifat client-side. Artinya, file-file ini harus dikirim ke browser/HP pengguna agar bisa dirender menjadi tampilan aplikasi.

Secanggih apa pun teknologi web, tidak ada cara 100% mutlak untuk menyembunyikan HTML/CSS/JS dari pengguna karena browser butuh membaca kode tersebut untuk menampilkan UI. Perintah Ctrl+U (View Source) adalah fitur bawaan browser yang tidak bisa Anda "block" secara permanen.

Namun, kita bisa membuatnya sangat sulit untuk dibaca, disalin, atau dimodifikasi oleh orang awam (seperti pegawai yang iseng). Ini disebut Obfuscation (Kaburkan Kode) dan Minification (Kecilkan Kode).

Berikut adalah 3 lapisan perlindungan yang bisa kita terapkan:

1. Kompres & Minify CSS dan JS (Wajib)
Kode yang kita buat selama ini sangat rapi dan ber-spasi (untuk memudahkan kita saat coding). Kita bisa menghapus semua spasi, enter, dan mengubah nama variabel menjadi singkat. Ini membuat kode JS yang awalnya bisa dibaca menjadi 1 baris panjang yang membingungkan.

Cara Manual Online: Gunakan situs seperti https://javascript-minifier.com/ atau https://cssminifier.com/.
Copy isi app.js -> Paste di situs -> Dapatkan kode yang padat -> Simpan kembali ke app.js.
Efek Samping: Ukuran file menjadi jauh lebih kecil (loading lebih cepat), tapi sangat sulit dibaca manusia jika di-Ctrl+U.
2. Obfuscation (Kaburkan Logika JS)
Ini langkah lebih ekstrem. Obfuscation akan mengacak logika JavaScript Anda. Variabel appData bisa diubah menjadi _0xxa1b2. String seperti "getDashboardData" diubah menjadi kode Hex.

Cara Online: Gunakan https://obfuscator.io/
Cara Pakai: Copy seluruh kode presensi.js -> Paste ke obfuscator.io -> Klik Obfuscate -> Copy hasilnya -> Timpa file presensi.js Anda.
Efek: Jika seseorang menekan Ctrl+U dan membuka presensi.js, mereka akan melihat teks seperti var _0x5a3b=['\x68\x74\x74\x70...'] yang sangat sulit diutak-atik. Ini secara dramatis mengurangi risiko pegawai memodifikasi script presensi di HP mereka.
3. Nonaktifkan Klik Kanan & Tombol Developer Tools (F12)
Meski tidak bisa memblokir Ctrl+U, kita bisa memblokir klik kanan dan tombol F12 (Developer Tools) agar orang awam bingung. Tambahkan kode ini di bagian <head> di setiap file HTML Anda:

(Catatan: Trik No. 3 bisa diakali oleh orang yang paham cara mematikan JavaScript di browser. Tapi cukup efektif untuk menghentikan 95% pegawai biasa).

4. Pindahkan Logika Kritis ke Backend (Jangan Taruh di Frontend)
Ini adalah aturan emas keamanan web. Jangan pernah menyimpan rahasia di JavaScript.

Saat ini, URL API, logika perhitungan jarak GPS (Geo-fencing), dan aturan nilai ada di JS. Ini rentan.
Kita sudah memitigasi ini dengan memindahkan validasi waktu server ke presensi.gs (backend). URL API memang harus terlihat di JS, tapi token Admin dipindahkan ke backend (cache server), jadi tidak bisa dicuri dari JS.
Untuk data sensitif (seperti password admin atau kunci API), simpan 100% di Google Apps Script (Backend) dan jangan pernah dikirim ke JS.
Rekomendasi Saya:
Jika Anda ingin melindungi kode Anda sekarang, lakukan Langkah No. 1 dan 2 untuk file-file js/app.js, js/presensi.js, dan js/raport.js. Ini akan membuat file Anda kecil, load cepat, dan kode JS Anda tidak bisa dibaca begitu saja. Simpan file JS asli yang ber-spasi rapi di komputer Anda sebagai backup.
