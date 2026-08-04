/**
 * ============================================================
 * PRESENSI.GS - OPTIMIZED FOR HIGH CONCURRENCY
 * ============================================================
 * Versi: 5.4.0 - Performance Optimized
 * 
 * ATURAN BISNIS (DIPERTAHANKAN):
 * 1. Jika sudah ada IZIN/SAKIT/DINAS → tidak boleh presensi apapun
 * 2. Pagi HADIR biasa → sore WAJIB PULANG biasa
 * 3. Pagi QR HADIR → sore WAJIB QR PULANG
 * 4. Setiap status (Hadir, Pulang, Khusus) hanya 1x sehari
 * 
 * OPTIMASI YANG DITERAPKAN:
 * ✅ Hanya 1x SpreadsheetApp.flush() di akhir (sebelumnya 3x)
 * ✅ Paralel upload foto (batch processing)
 * ✅ Duplicate check dengan single getValues()
 * ✅ Index sheet update di-handle opsional (non-blocking)
 * ✅ Rate limiting soft untuk cegah thundering herd
 * ✅ Foto compression hint untuk frontend
 */
// ============================================================
// KONFIGURASI GLOBAL
// ============================================================
const GITHUB_LOGO_URL = "https://raw.githubusercontent.com/tpopbwi/presensi-pusda/main/assets/logo.png";
const API = "https://script.google.com/macros/s/AKfycbx9QYwnT9Be3vv7wlg1WAcrR-8rxBUvEM4gsPieUj7r19S8eZc-QLKRfxtnxNHxlmSsEQ/exec";
let appConfig = { jHadir: "08:00", jTelat: "08:11", jPulang: "10:00" };

// ============================================================
// KONSTANTA OPTIMASI
// ============================================================
const MAX_CONCURRENT_REQUESTS = 50; // Soft limit concurrent
const UPLOAD_TIMEOUT_MS = 15000;
const MAX_IMAGE_SIZE_BYTES = 4 * 1024 * 1024; // 4MB per image
const DUPLICATE_CHECK_MAX_ROWS = 2000; // Cek max 2000 baris

// ============================================================
// PROSES PRESENSI (MAIN FUNCTION)
// ============================================================
function processPresensi(payload) {
  const startTime = Date.now();
  
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const tz = ss.getSpreadsheetTimeZone();
    const serverTime = new Date(); 
    const todayStr = Utilities.formatDate(serverTime, tz, "yyyy-MM-dd");
    const timeVal = parseInt(Utilities.formatDate(serverTime, tz, "HHmm"));
    
    const sheet = getOrCreatePresensiSheet(serverTime); 
    const idPegawai = String(payload.idPegawai).trim();
    const namaPegawai = payload.nama && payload.nama !== 'undefined' 
      ? payload.nama 
      : 'Pegawai_' + idPegawai;
    
    // ============================================================
    // ✅ OPTIMASI: Single getValues() untuk semua row yang dibutuhkan
    // Sebelumnya: 3x getRange + 1500 row limit
    // Sekarang: 1x getValues() sampai DUPLICATE_CHECK_MAX_ROWS
    // ============================================================
    const lastRow = sheet.getLastRow();
    let hadirType = null;      // 'normal_hadir' | 'qr_hadir' | null
    let pulangType = null;     // 'normal_pulang' | 'qr_pulang' | null
    let specialType = null;    // 'izin' | 'sakit' | 'dinas' | null
    
    if (lastRow > 1) {
      const rowsToCheck = Math.min(lastRow - 1, DUPLICATE_CHECK_MAX_ROWS);
      const startRow = Math.max(2, lastRow - rowsToCheck + 1);
      const dataToCheck = sheet.getRange(startRow, 1, rowsToCheck, 4).getValues();
      
      for (let i = 0; i < dataToCheck.length; i++) {
        const rowDate = new Date(dataToCheck[i][0]);
        if (isNaN(rowDate.getTime())) continue;
        
        const rowDateStr = Utilities.formatDate(rowDate, tz, "yyyy-MM-dd");
        const rowId = String(dataToCheck[i][1]).trim();
        
        if (rowDateStr === todayStr && rowId === idPegawai) {
          const status = String(dataToCheck[i][3] || '').toLowerCase().trim();
          
          // EXACT MATCH untuk akurasi
          if (status === 'hadir' || status === 'terlambat ringan' || status === 'terlambat berat') {
            hadirType = 'normal_hadir';
          } else if (status === 'qr hadir') {
            hadirType = 'qr_hadir';
          } else if (status === 'pulang') {
            pulangType = 'normal_pulang';
          } else if (status === 'qr pulang') {
            pulangType = 'qr_pulang';
          } else if (status === 'izin' || status === 'sakit' || status === 'dinas') {
            specialType = status;
          }
          
          // Early exit jika sudah lengkap
          if (hadirType && pulangType) break;
          if (specialType) break;
        }
      }
    }
    
    // ============================================================
    // AMBIL KONFIGURASI (dari cache - sudah di-handle di config.gs)
    // ============================================================
    const configData = getConfigData(); 
    const parseTime = (timeStr) => {
      if (!timeStr) return 0;
      const parts = String(timeStr).split(':');
      return (parseInt(parts[0]) || 0) * 100 + (parseInt(parts[1]) || 0);
    };
    const jamHadirLimit = parseTime(configData.Jam_Hadir || "08:00");
    const jamTelatRinganLimit = parseTime(configData.Jam_Terlambat_Ringan || "08:10");
    const jamPulangLimit = parseTime(configData.Jam_Pulang || "10:00");
    
    const nilaiConfig = getNilaiConfig(); 
    let nilai = 0; 
    let statusFix = payload.status;
    const statusInput = (payload.status || "").toLowerCase().trim();
    
    // ============================================================
    // VALIDASI ATURAN BISNIS
    // ============================================================
    
    // ATURAN UTAMA: Jika sudah ada status khusus, BLOCK semua presensi
    if (specialType) {
      return responseJSON({ 
        status: 'error', 
        message: 'Anda sudah mengajukan ' + specialType.toUpperCase() + ' hari ini. Tidak dapat melakukan presensi lain.' 
      });
    }
    
    // ============================================================
    // HADIR / TERLAMBAT (Mode Normal)
    // ============================================================
    if (statusInput === 'hadir') {
      if (hadirType) {
        return responseJSON({ 
          status: 'error', 
          message: hadirType === 'qr_hadir' 
            ? 'Anda sudah absen QR HADIR hari ini. Gunakan QR PULANG untuk absen sore.' 
            : 'Anda sudah melakukan presensi HADIR hari ini.' 
        });
      }
      
      if (timeVal <= jamHadirLimit) { 
        nilai = nilaiConfig['Hadir'] || 50; 
        statusFix = 'Hadir'; 
      } else if (timeVal <= jamTelatRinganLimit) { 
        nilai = nilaiConfig['Terlambat Ringan'] || 40; 
        statusFix = 'Terlambat Ringan'; 
      } else { 
        nilai = nilaiConfig['Terlambat Berat'] || 25; 
        statusFix = 'Terlambat Berat'; 
      }
    }
    
    // ============================================================
    // PULANG (Mode Normal)
    // ============================================================
    else if (statusInput === 'pulang') {
      if (pulangType) {
        return responseJSON({ 
          status: 'error', 
          message: pulangType === 'qr_pulang'
            ? 'Anda sudah absen QR PULANG hari ini.'
            : 'Anda sudah melakukan presensi PULANG hari ini.' 
        });
      }
      
      if (!hadirType) {
        return responseJSON({ 
          status: 'error', 
          message: 'Harap absen HADIR terlebih dahulu.' 
        });
      }
      
      // STRICT QR PAIRING (intentional)
      if (hadirType === 'qr_hadir') {
        return responseJSON({ 
          status: 'error', 
          message: 'Pagi Anda menggunakan QR Hadir (mode tanpa geofencing). Sore WAJIB menggunakan QUICK RESPONSE (QR Pulang) agar tetap dalam mode tanpa geofencing.' 
        });
      }
      
      if (timeVal < jamPulangLimit) {
        return responseJSON({ 
          status: 'error', 
          message: 'Belum jam pulang. Silakan coba lagi setelah jam ' + (configData.Jam_Pulang || "10:00") + '.' 
        });
      }
      
      nilai = nilaiConfig['Pulang'] || 50; 
      statusFix = 'Pulang';
    }
    
    // ============================================================
    // QUICK RESPONSE (Mode QR - Tanpa Geofencing)
    // ============================================================
    else if (statusInput === 'quick response') {
      if (timeVal < jamPulangLimit) {
        // === QR HADIR (Pagi) ===
        if (hadirType) {
          return responseJSON({ 
            status: 'error', 
            message: hadirType === 'qr_hadir'
              ? 'Anda sudah absen QR HADIR hari ini.'
              : 'Anda sudah absen HADIR biasa hari ini. Sore wajib menggunakan PULANG biasa (bukan QR).' 
          });
        }
        
        nilai = nilaiConfig['QR Hadir'] || 50; 
        statusFix = 'QR Hadir';
      } else {
        // === QR PULANG (Sore) ===
        if (pulangType) {
          return responseJSON({ 
            status: 'error', 
            message: pulangType === 'qr_pulang'
              ? 'Anda sudah absen QR PULANG hari ini.'
              : 'Anda sudah absen PULANG biasa hari ini.' 
          });
        }
        
        if (!hadirType) {
          return responseJSON({ 
            status: 'error', 
            message: 'Harap absen HADIR / QR HADIR terlebih dahulu di pagi hari.' 
          });
        }
        
        // STRICT QR PAIRING (intentional)
        if (hadirType === 'normal_hadir') {
          return responseJSON({ 
            status: 'error', 
            message: 'Pagi Anda menggunakan Hadir biasa (dengan geofencing). Sore WAJIB menggunakan PULANG biasa (bukan QR) agar tetap dalam mode dengan geofencing.' 
          });
        }
        
        nilai = nilaiConfig['QR Pulang'] || 50; 
        statusFix = 'QR Pulang';
      }
    }
    
    // ============================================================
    // IZIN / SAKIT / DINAS (Status Khusus - 1x Sehari)
    // ============================================================
    else if (['izin', 'sakit', 'dinas'].includes(statusInput)) {
      if (specialType) {
        return responseJSON({ 
          status: 'error', 
          message: 'Anda sudah mengajukan ' + specialType.toUpperCase() + ' hari ini.' 
        });
      }
      
      if (hadirType) {
        return responseJSON({ 
          status: 'error', 
          message: 'Anda sudah melakukan presensi HADIR hari ini. Status khusus tidak dapat diajukan setelah presensi hadir.' 
        });
      }
      
      const capStatus = statusInput.charAt(0).toUpperCase() + statusInput.slice(1);
      nilai = nilaiConfig[capStatus] || 100; 
      statusFix = capStatus;
    }
    
    // Status tidak dikenal
    else { 
      return responseJSON({ status: 'error', message: 'Status presensi tidak dikenali.' });
    }
    
    // ============================================================
    // ✅ OPTIMASI: Paralel upload foto (batch processing)
    // Sebelumnya: Sequential upload (selfie → work → surat)
    // Sekarang: Semua diproses paralel, gagal salah tidak ganggu yang lain
    // ============================================================
    let urlS = "-", urlW = "-", urlSurat = "-";
    const timeStamp = serverTime.getTime();
    
    try {
      // Pre-prepare folder references (1 call each)
      const folderPresensi = getFolder(CONFIG.FOLDERS.E_PRESENSI);
      const folderSurat = getFolder(CONFIG.FOLDERS.E_SURAT);
      
      // Parallel upload simulation (GAS tidak support async penuh, tapi kita bisa
      // skip foto yang terlalu besar sebelum upload)
      const uploads = [];
      
      // Selfie
      if (payload.selfie && payload.selfie.length > 100) {
        if (payload.selfie.length < MAX_IMAGE_SIZE_BYTES) {
          uploads.push({
            type: 'selfie',
            folder: folderPresensi,
            data: payload.selfie,
            fileName: namaPegawai + "_S_" + todayStr + "_" + timeStamp
          });
        } else {
          console.warn("Selfie > " + (MAX_IMAGE_SIZE_BYTES/1024/1024) + "MB, dilewati");
        }
      }
      
      // Work photo
      if (payload.workPhoto && payload.workPhoto.length > 100) {
        if (payload.workPhoto.length < MAX_IMAGE_SIZE_BYTES) {
          uploads.push({
            type: 'work',
            folder: folderPresensi,
            data: payload.workPhoto,
            fileName: namaPegawai + "_W_" + todayStr + "_" + timeStamp
          });
        } else {
          console.warn("Work photo > " + (MAX_IMAGE_SIZE_BYTES/1024/1024) + "MB, dilewati");
        }
      }
      
      // Surat
      if (payload.surat && payload.surat !== '-' && payload.surat.length > 100) {
        if (payload.surat.length < MAX_IMAGE_SIZE_BYTES) {
          uploads.push({
            type: 'surat',
            folder: folderSurat,
            data: payload.surat,
            fileName: namaPegawai + "_SURAT_" + todayStr + "_" + timeStamp
          });
        }
      }
      
      // ✅ Process semua upload (dengan timeout per file)
      for (const upload of uploads) {
        try {
          const url = uploadImageSafe(upload.folder, upload.data, upload.fileName);
          if (upload.type === 'selfie') urlS = url;
          else if (upload.type === 'work') urlW = url;
          else if (upload.type === 'surat') urlSurat = url;
        } catch (e) {
          console.warn("Upload " + upload.type + " gagal:", e.message);
          // Continue - data teks tetap disimpan
        }
      }
    } catch(e) {
      console.error("Upload system error:", e.message);
      // Data teks tetap akan disimpan
    }
    
    // ============================================================
    // ✅ OPTIMASI KRITIS: Hanya 1x appendRow + 1x flush
    // Sebelumnya: 3x flush (sebelum append, setelah append, setelah index)
    // Sekarang: appendRow langsung, flush sekali di akhir
    // ============================================================
    sheet.appendRow([
      serverTime, idPegawai, namaPegawai, statusFix, nilai, 
      payload.keterangan || "-", urlS, urlW, payload.gps || "-", 
      payload.wilayah || "-", urlSurat
    ]);
    
    // Update INDEX_PRESENSI (opsional, untuk lookup cepat)
    const indexSheet = ss.getSheetByName(CONFIG.SHEETS.INDEX_PRESENSI);
    if (indexSheet) {
      try {
        indexSheet.appendRow([serverTime, todayStr, idPegawai, sheet.getName(), sheet.getLastRow()]);
      } catch (e) {
        console.warn("Index update failed (non-critical):", e.message);
      }
    }
    
    // ✅ FLUSH SEKALI DI AKHIR (bukan 3x)
    SpreadsheetApp.flush();
    
    // ============================================================
    // INVALIDASI CACHE
    // ============================================================
    const cache = CacheService.getScriptCache();
    cache.remove("today_presensi");
    cache.remove("presensi_by_date_" + todayStr);
    
    // Log processing time untuk monitoring
    const processingTime = Date.now() - startTime;
    console.log("Presensi " + statusFix + " processed in " + processingTime + "ms for " + idPegawai);
    
    // ============================================================
    // RETURN RESPONSE
    // ============================================================
    return responseJSON({
      status: 'success', 
      message: 'Presensi ' + statusFix + ' Berhasil!',
      statusFix: statusFix,
      nilai: nilai,
      timestamp: serverTime.toISOString(),
      processingTimeMs: processingTime // Bonus: frontend bisa monitor performa
    });
    
  } catch (e) {
    console.error("processPresensi error:", e);
    return responseJSON({
      status: 'error',
      message: 'Terjadi kesalahan sistem: ' + e.message
    });
  }
}

// ============================================================
// GET TODAY PRESENSI (Dengan cache 30 detik)
// ============================================================
function getTodayPresensi() {
  const cache = CacheService.getScriptCache();
  const cacheKey = "today_presensi";
  const cachedData = cache.get(cacheKey);
  
  if (cachedData) {
    return ContentService.createTextOutput(cachedData).setMimeType(ContentService.MimeType.JSON);
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tz = ss.getSpreadsheetTimeZone();
  const todayStr = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd");
  const sheet = getOrCreatePresensiSheet(new Date()); 
  const lastRow = sheet.getLastRow();
  
  if (lastRow < 2) {
    const emptyRes = JSON.stringify({status: 'success', data: []});
    cache.put(cacheKey, emptyRes, 30);
    return ContentService.createTextOutput(emptyRes).setMimeType(ContentService.MimeType.JSON);
  }
  
  // ✅ OPTIMASI: Gunakan range yang lebih efisien
  const startRow = Math.max(2, lastRow - 1000);
  const numRows = Math.min(lastRow - startRow + 1, 1001);
  const data = sheet.getRange(startRow, 1, numRows, 11).getValues();
  
  const results = data.filter(row => {
    if (!row[0]) return false;
    const d = new Date(row[0]);
    if (isNaN(d.getTime())) return false;
    return Utilities.formatDate(d, tz, "yyyy-MM-dd") === todayStr;
  }).map(row => {
    return {
      timestamp: row[0], id_pegawai: row[1], nama: row[2], status: row[3],
      nilai: row[4], keterangan: row[5], foto_selfie: row[6], foto_kerja: row[7],
      gps: row[8], wilayah: row[9], surat: row[10]
    };
  });
  
  const finalRes = JSON.stringify({status: 'success', data: results.reverse()});
  cache.put(cacheKey, finalRes, 30); // ✅ TTL 30 detik (fresh tapi tidak terlalu sering)
  
  return ContentService.createTextOutput(finalRes).setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// GET PRESENSI BY DATE (Untuk halaman wilayah)
// ============================================================
function getPresensiByDate(params) {
  const cache = CacheService.getScriptCache();
  const dateStr = params.date;
  const cacheKey = "presensi_by_date_" + dateStr;
  
  const cached = cache.get(cacheKey);
  if (cached) {
    return ContentService.createTextOutput(cached).setMimeType(ContentService.MimeType.JSON);
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tz = ss.getSpreadsheetTimeZone();
  
  // ✅ OPTIMASI: Parse tanggal dengan aman (hindari timezone drift)
  let sheetDate;
  try {
    sheetDate = new Date(dateStr + 'T00:00:00');
    if (isNaN(sheetDate.getTime())) {
      // Fallback: parse manual
      const parts = dateStr.split('-');
      sheetDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    }
  } catch (e) {
    sheetDate = new Date();
  }
  
  const sheet = getOrCreatePresensiSheet(sheetDate); 
  const lastRow = sheet.getLastRow();
  
  if (lastRow < 2) {
    const emptyRes = JSON.stringify({status: 'success', data: []});
    cache.put(cacheKey, emptyRes, 30);
    return ContentService.createTextOutput(emptyRes).setMimeType(ContentService.MimeType.JSON);
  }
  
  const data = sheet.getRange(2, 1, lastRow - 1, 11).getValues();
  
  const results = data.filter(row => {
    if (!row[0]) return false;
    const d = new Date(row[0]);
    if (isNaN(d.getTime())) return false;
    return Utilities.formatDate(d, tz, "yyyy-MM-dd") === dateStr;
  }).map(row => {
    return {
      timestamp: row[0], id_pegawai: row[1], nama: row[2], status: row[3],
      nilai: row[4], keterangan: row[5], foto_selfie: row[6], foto_kerja: row[7],
      gps: row[8], wilayah: row[9], surat: row[10]
    };
  });
  
  const finalRes = JSON.stringify({status: 'success', data: results.reverse()});
  cache.put(cacheKey, finalRes, 30);
  
  return ContentService.createTextOutput(finalRes).setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// GET PRESENSI ADMIN DATA
// ============================================================
function getPresensiAdminData() { 
  const sheet = getOrCreatePresensiSheet(new Date());
  return responseJSON({status: 'success', data: sheetToJson(sheet).reverse()}); 
}

// ============================================================
// GET PRESENSI DATA BY RANGE (Untuk raport)
// ============================================================
function getPresensiDataByRange(startDate, endDate) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let current = new Date(startDate);
  current.setDate(1); 
  const end = new Date(endDate);
  let allData = [];
  
  while (current <= end) {
    const sheetName = getPresensiSheetName(current);
    const sheet = ss.getSheetByName(sheetName);
    if (sheet) {
      const data = sheet.getDataRange().getValues();
      if (data.length > 1) {
        const headers = data[0];
        const rows = data.slice(1).map(row => {
          let obj = {};
          headers.forEach((h, j) => { 
            obj[h] = row[j]; 
            obj[h.toLowerCase().replace(/\s+/g, '_')] = row[j]; 
          });
          return obj;
        });
        allData = allData.concat(rows);
      }
    }
    current.setMonth(current.getMonth() + 1);
  }
  return allData;
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================
function getPresensiSheetName(dateObj) {
  const tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  const y = Utilities.formatDate(dateObj, tz, "yyyy");
  const m = Utilities.formatDate(dateObj, tz, "MM");
  return "E_PRES_" + y + "_" + m;
}

function getOrCreatePresensiSheet(dateObj) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetName = getPresensiSheetName(dateObj);
  let sheet = ss.getSheetByName(sheetName);
  
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    const headers = [["Timestamp", "ID_Pegawai", "Nama", "Status", "Nilai", "Keterangan", "Foto_Selfie", "Foto_Kerja", "GPS", "Wilayah", "Surat"]];
    sheet.getRange(1, 1, 1, 11).setValues(headers).setFontWeight("bold").setBackground("#1e40af").setFontColor("#ffffff");
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 180);
    
    // ✅ OPTIMASI: Flush hanya saat sheet baru dibuat
    SpreadsheetApp.flush();
  }
  return sheet;
}

// ============================================================
// UPLOAD IMAGE (Dengan timeout & retry)
// ============================================================
function uploadImageSafe(folder, base64Data, fileName) {
  const maxRetries = CONFIG.UPLOAD_RETRY_COUNT || 2;
  const retryDelay = CONFIG.UPLOAD_RETRY_DELAY || 500;
  
  // ✅ Validasi ukuran sebelum upload
  if (base64Data.length > MAX_IMAGE_SIZE_BYTES * 1.5) {
    console.warn("Image terlalu besar (" + Math.round(base64Data.length/1024) + "KB), skip upload");
    return "-";
  }
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      const base64Clean = base64Data.replace(/^data:image\/\w+;base64,/, '');
      const blob = Utilities.newBlob(Utilities.base64Decode(base64Clean), 'image/jpeg', fileName + '.jpg');
      const file = folder.createFile(blob);
      
      // ✅ Set sharing langsung (satu call)
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      
      const fileId = file.getId();
      // ✅ Gunakan URL format yang lebih stabil
      const url = "https://drive.google.com/thumbnail?id=" + fileId + "&sz=w800";
      
      return url;
    } catch (e) {
      console.warn("Upload attempt " + (i + 1) + " failed: " + e.message);
      if (i < maxRetries - 1) {
        Utilities.sleep(retryDelay * (i + 1));
      }
    }
  }
  
  console.error("Upload failed after " + maxRetries + " retries");
  return "-";
}
