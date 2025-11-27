const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const axios = require('axios');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Mengizinkan browser mengambil file css/html di folder ini
app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/dashboard.html');
});

const DB_FILE = 'data_kurs.json';
const MATA_UANG = ['USD', 'CNY', 'JPY', 'SGD', 'MYR', 'SAR']; // Tambahkan SAR sesuai dashboard
// Interval pengecekan (Contoh: 300000 ms = 5 menit)
const CHECK_INTERVAL = 5 * 60 * 1000; 

// --- FUNGSI DATABASE JSON ---

function readDB() {
    if (!fs.existsSync(DB_FILE)) {
        return [];
    }
    const rawData = fs.readFileSync(DB_FILE);
    return JSON.parse(rawData);
}

function saveDB(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// --- LOGIKA UTAMA (PEMBARUAN OTOMATIS) ---
async function fetchAndProcessData() {
    try {
        console.log(`🔄 Mengecek pembaruan data ke API...`);
        
        // 1. Ambil Real Data dari API
        const response = await axios.get('https://api.exchangerate-api.com/v4/latest/IDR');
        const apiRates = response.data.rates;
        const lastUpdateUnix = response.data.time_last_updated; // Waktu update dari API

        // 2. Format data mata uang (1 Asing = Berapa IDR)
        let newRates = {};
        MATA_UANG.forEach(kode => {
            // Jika mata uang ada di API, hitung kebalikan kurs (karena base IDR)
            if(apiRates[kode]) {
                newRates[kode] = 1 / apiRates[kode]; 
            }
        });

        // 3. Siapkan Struktur Data Baru
        const todayDate = new Date().toISOString().split('T')[0];
        const newData = {
            date: todayDate,
            last_update_api: lastUpdateUnix, // Opsional: untuk debug
            displayDate: new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short' }),
            rates: newRates
        };

        // 4. Baca Database Lama
        let history = readDB();
        
        // Cari index data hari ini
        const todayIndex = history.findIndex(item => item.date === todayDate);

        let dataChanged = false;

        if (todayIndex !== -1) {
            // --- SKENARIO A: Data hari ini SUDAH ada ---
            // Kita cek apakah harganya berbeda dengan yang tersimpan?
            const currentSavedRates = JSON.stringify(history[todayIndex].rates);
            const newRatesString = JSON.stringify(newRates);

            if (currentSavedRates !== newRatesString) {
                console.log("⚡ Ada perubahan harga dari API! Mengupdate database...");
                history[todayIndex] = newData; // Timpa data hari ini dengan yang baru
                dataChanged = true;
            } else {
                console.log("💤 Harga stabil (tidak ada perubahan dari pengecekan sebelumnya).");
            }
        } else {
            // --- SKENARIO B: Hari baru (belum ada data hari ini) ---
            console.log("📅 Hari baru terdeteksi. Menambahkan entry baru.");
            history.push(newData);
            
            // Hapus data terlama jika lebih dari 7 hari
            if (history.length > 7) {
                history.shift(); 
            }
            dataChanged = true;
        }

        // 5. Jika ada perubahan, Simpan ke File & Broadcast ke Client
        if (dataChanged) {
            saveDB(history);
            io.emit('update_view', history); // Kirim ke semua browser yang sedang buka
            console.log("✅ Database diperbarui & Client dinotifikasi.");
        }

    } catch (error) {
        console.error("❌ Gagal mengambil data:", error.message);
    }
}

// --- JALANKAN SERVER ---

io.on('connection', (socket) => {
    console.log('👤 User terhubung');
    // Kirim data terakhir saat user baru buka
    const data = readDB();
    socket.emit('update_view', data);
});

// 1. Jalankan pengecekan pertama kali saat server start
fetchAndProcessData();

// 2. Jalankan pengecekan berulang (Interval)
setInterval(fetchAndProcessData, CHECK_INTERVAL);

server.listen(3000, () => {
    console.log(`🚀 Server berjalan di http://localhost:3000`);
    console.log(`⏱️  Pengecekan API otomatis setiap ${CHECK_INTERVAL/1000} detik.`);
});