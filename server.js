const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const axios = require('axios');
const fs = require('fs'); // Library untuk baca/tulis file (Bawaan Node.js)

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

//Mengizinkan browser mengambil file css di folder ini
app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/dashboard.html');
});

const DB_FILE = 'data_kurs.json';
const MATA_UANG = ['USD', 'CNY', 'JPY', 'SGD', 'MYR'];

// --- FUNGSI DATABASE JSON ---

// 1. Baca Database
function readDB() {
    if (!fs.existsSync(DB_FILE)) {
        return []; // Jika file belum ada, kembalikan array kosong
    }
    const rawData = fs.readFileSync(DB_FILE);
    return JSON.parse(rawData);
}

// 2. Simpan/Tulis Database
function saveDB(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// --- LOGIKA UTAMA ---
async function updateDailyData() {
    // 1. Ambil tanggal hari ini (Format: YYYY-MM-DD)
    const todayDate = new Date().toISOString().split('T')[0];
    
    // 2. Baca data lama
    let history = readDB();

    // 3. Cek apakah data hari ini sudah ada?
    const isTodayExists = history.find(item => item.date === todayDate);

    if (!isTodayExists) {
        console.log(`📅 Hari baru (${todayDate}) terdeteksi. Mengambil data API...`);
        try {
            // Ambil Real Data dari API Exchange Rate
            const response = await axios.get('https://api.exchangerate-api.com/v4/latest/IDR');
            const rates = response.data.rates;

            // Format data mata uang
            let dailyRates = {};
            MATA_UANG.forEach(kode => {
                dailyRates[kode] = 1 / rates[kode]; // Balik kurs jadi IDR
            });

            // Masukkan ke array
            const newData = {
                date: todayDate,
                displayDate: new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short' }),
                rates: dailyRates
            };

            history.push(newData);

            // ATURAN: Jika lebih dari 1 minggu, hapus yang paling lama
            if (history.length > 7) {
                history.shift(); // Hapus elemen pertama (paling kiri/lama)
            }

            // Simpan ke file
            saveDB(history);
            console.log("✅ Data tersimpan ke data_kurs.json");

        } catch (error) {
            console.error("Gagal update data:", error.message);
        }
    } else {
        console.log("ℹ️ Data hari ini sudah ada di database. Tidak perlu request API.");
    }

    return history;
}

// --- JALANKAN SERVER ---
io.on('connection', (socket) => {
    console.log('User terhubung');
    // Kirim data yang ada di database saat ini
    const data = readDB();
    socket.emit('update_view', data);
});

// Jalankan sekali saat server start
updateDailyData().then(() => {
    console.log('Server siap dengan data terbaru.');
});

server.listen(3000, () => {
    console.log('Server berjalan di http://localhost:3000');
});