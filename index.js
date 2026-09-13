const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { LiveChat } = require('youtube-chat');
const readline = require('readline');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// Masalar yapısı
let masalar = {};
let skorTablosu = {}; 

setInterval(() => {
    console.log("[SİSTEM] 24 saatlik skor tablosu sıfırlandı.");
    skorTablosu = {};
    io.emit('skorGuncelle', skorTablosu);
}, 24 * 60 * 60 * 1000);

function desteyiOlusturveKaristir() {
    let yeniDeste = [];
    const renkler = ['sari', 'mavi', 'siyah', 'kirmizi'];
    let idCounter = 1;

    for (let tekrar = 0; tekrar < 2; tekrar++) {
        for (let renk of renkler) {
            for (let sayi = 1; sayi <= 13; sayi++) {
                yeniDeste.push({ id: idCounter++, sayi: sayi, renk: renk, sahteOkey: false });
            }
        }
    }
    yeniDeste.push({ id: idCounter++, sayi: 0, renk: 'ozel', sahteOkey: true });
    yeniDeste.push({ id: idCounter++, sayi: 0, renk: 'ozel', sahteOkey: true });

    for (let i = yeniDeste.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [yeniDeste[i], yeniDeste[j]] = [yeniDeste[j], yeniDeste[i]];
    }
    return yeniDeste;
}

function masaOyunuBaslat(masaAdi) {
    let masa = masalar[masaAdi];
    if (!masa || masa.oyuncular.length < 4) {
        console.log(`[HATA] ${masaAdi} masasında oyunun başlaması için 4 oyuncu gereklidir!`);
        return;
    }

    masa.oyunBasladi = true;
    masa.taslar = desteyiOlusturveKaristir();
    masa.oyuncuElleri = {};
    masa.yerdekiTaslar = [];
    masa.siraIndex = 0;

    masa.gosterge = masa.taslar.pop();
    let okeySayisi = masa.gosterge.sayi === 13 ? 1 : masa.gosterge.sayi + 1;
    masa.okeyTasi = { sayi: okeySayisi, renk: masa.gosterge.renk };

    masa.oyuncular.forEach((oyuncu, index) => {
        let tasSayisi = (index === 0) ? 15 : 14;
        masa.oyuncuElleri[oyuncu.isim] = masa.taslar.splice(0, tasSayisi);
        
        if (skorTablosu[oyuncu.isim] === undefined) {
            skorTablosu[oyuncu.isim] = 0;
        }
    });

    console.log(`--- ${masaAdi.toUpperCase()} MASASINDA OYUN BAŞLADI ---`);
    console.log(`[SIRA] Şimdi sıra: ${masa.oyuncular[masa.siraIndex].isim}`);
    
    durumuGuncelleVeGonder(masaAdi);
}

function durumuGuncelleVeGonder(masaAdi) {
    let masa = masalar[masaAdi];
    if (!masa) return;

    io.emit('masaDurumuGuncelle', {
        masaAdi: masaAdi,
        oyunBasladi: masa.oyunBasladi,
        ayarlar: masa.ayarlar,
        gosterge: masa.gosterge,
        okeyTasi: masa.okeyTasi,
        oyuncular: masa.oyuncular,
        sira: masa.oyuncular[masa.siraIndex] ? masa.oyuncular[masa.siraIndex].isim : null,
        yerdekiTaslar: masa.yerdekiTaslar,
        oyuncuElleri: masa.oyuncuElleri
    });
    io.emit('skorGuncelle', skorTablosu);
}

function masaKurVeyaKatil(isim, cinsiyet = 'e', socketId = 'terminal_user', hedefMasa = 'Genel') {
    if (!masalar[hedefMasa]) {
        masalar[hedefMasa] = {
            oyuncular: [],
            oyunBasladi: false,
            taslar: [],
            gosterge: null,
            okeyTasi: null,
            oyuncuElleri: {},
            yerdekiTaslar: [],
            siraIndex: 0,
            ayarlar: { mod: "tekli", katlamali: false }
        };
        console.log(`[MASA] "${hedefMasa}" isimli yeni masa kuruldu!`);
    }

    let masa = masalar[hedefMasa];

    if (masa.oyunBasladi) {
        console.log(`[HATA] ${hedefMasa} masasında oyun çoktan başladı, katılamazsınız!`);
        return;
    }

    for (let mAd in masalar) {
        let m = masalar[mAd];
        let varMi = m.oyuncular.find(o => o.socketId === socketId || o.isim === isim);
        if (varMi) {
            console.log(`[HATA] ${isim} zaten bir masada oturuyor!`);
            return;
        }
    }

    if (masa.oyuncular.length < 4) {
        let avatarIcon = (cnsiy => cnsiy === 'k' || cnsiy === 'kadın' ? '👩' : '👨')(cinsiyet.toLowerCase());
        
        masa.oyuncular.push({
            isim: isim,
            avatar: avatarIcon,
            socketId: socketId
        });

        if (skorTablosu[isim] === undefined) {
            skorTablosu[isim] = 0;
        }

        console.log(`[MASA] ${isim} (${avatarIcon}), "${hedefMasa}" masasına katıldı! (${masa.oyuncular.length}/4)`);
        durumuGuncelleVeGonder(hedefMasa);

        if (masa.oyuncular.length === 4) {
            console.log(`[BİLGİ] ${hedefMasa} masasında 4 oyuncu tamamlandı, oyun başlatılıyor...`);
            masaOyunuBaslat(hedefMasa);
        }
    }
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

console.log("--- 101 OKEY ÇOKLU MASA SİSTEMİ ---");

rl.on('line', (line) => {
    const parts = line.trim().split(" ");
    const komut = parts[0];
    const arg1 = parts[1]; 
    const arg2 = parts[2]; 
    const arg3 = parts[3]; 

    if (komut === "!katil") {
        if (arg1) {
            let cinsiyet = ['e', 'k', 'erkek', 'kadın'].includes(arg2?.toLowerCase()) ? arg2 : 'e';
            let masaAdi = arg3 || (!['e', 'k', 'erkek', 'kadın'].includes(arg2?.toLowerCase()) ? arg2 : 'Genel');
            if(['e', 'k', 'erkek', 'kadın'].includes(arg2?.toLowerCase())) {
                masaAdi = arg3 || 'Genel';
            }
            masaKurVeyaKatil(arg1, cinsiyet, 'terminal_' + arg1, masaAdi);
        }
    }
});

const LIVE_STREAM_VIDEO_ID = "AKTIF_YAYIN_ID_YAZIN_VEYA_BOS_BIRAKIN"; 

if (LIVE_STREAM_VIDEO_ID && LIVE_STREAM_VIDEO_ID !== "AKTIF_YAYIN_ID_YAZIN_VEYA_BOS_BIRAKIN") {
    const liveChat = new LiveChat({ roomId: LIVE_STREAM_VIDEO_ID });

    liveChat.on("chat", (chatItem) => {
        const mesaj = chatItem.message.trim();
        const yazar = chatItem.author.name;
        const channelId = chatItem.author.channelId;
        const parts = mesaj.split(" ");
        const komut = parts[0];
        const arg1 = parts[1]; 
        const arg2 = parts[2]; 
        const arg3 = parts[3]; 

        if (komut === "!katil" || komut === "!masa") {
            let hedefMasa = arg3 || arg2 || 'Genel';
            if(['e', 'k', 'erkek', 'kadın'].includes(arg2?.toLowerCase())) {
                hedefMasa = arg3 || 'Genel';
            }
            let cinsiyet = ['e', 'k', 'erkek', 'kadın'].includes(arg1?.toLowerCase()) ? arg1 : (['e', 'k', 'erkek', 'kadın'].includes(arg2?.toLowerCase()) ? arg2 : 'e');
            let oyuncuAdi = arg1 && !['e', 'k', 'erkek', 'kadın', 'kur', 'katil'].includes(arg1.toLowerCase()) ? arg1 : yazar;
            
            masaKurVeyaKatil(oyuncuAdi, cinsiyet, channelId, hedefMasa);
        }
    });

    liveChat.start()
        .then(() => console.log("[YOUTUBE] Canlı sohbet dinlenmeye başlandı..."))
        .catch(() => console.log("[YOUTUBE UYARI] Canlı yayın bulunamadı, terminal modu aktif."));
}

io.on('connection', (socket) => {
    console.log('OBS / Arayüz bağlandı.');
    socket.emit('skorGuncelle', skorTablosu);
    if (masalar['Genel']) {
        durumuGuncelleVeGonder('Genel');
    }

    socket.on('koltugaKatil', (data) => {
        if (!data || !data.isim) return;
        let hedefMasa = data.masaAdi || 'Genel';
        let cinsiyet = data.cinsiyet || 'e';
        let oyuncuAdi = data.isim.trim();
        masaKurVeyaKatil(oyuncuAdi, cinsiyet, socket.id, hedefMasa);
    });

    socket.on('tasAt', (data) => {
        let masa = masalar[data.masaAdi || 'Genel'];
        if (!masa || !masa.oyunBasladi) return;

        let siradaki = masa.oyuncular[masa.siraIndex];
        if (!siradaki || siradaki.isim !== data.oyuncuAdi) return;

        let el = masa.oyuncuElleri[data.oyuncuAdi];
        if (!el) return;

        let index = el.findIndex(t => t.id === data.tasId);
        if (index !== -1) {
            let atilanTas = el.splice(index, 1)[0];
            masa.yerdekiTaslar.push(atilanTas);
            console.log(`[OYUN] ${data.oyuncuAdi} yere taş attı: ${atilanTas.renk} ${atilanTas.sayi}`);
            
            masa.siraIndex = (masa.siraIndex + 1) % masa.oyuncular.length;
            durumuGuncelleVeGonder(data.masaAdi || 'Genel');
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Okey sunucusu ${PORT} portunda aktif!`);
});