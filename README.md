# API Unofficial DANA - Transfer & Mutasi

### Persiapan:

| Komponen | Cara Mendapatkan |
|----------|------------------|
| **ALIPAYJSESSIONID** | Capture cookie dari request login DANA via proxy (Charles/Proxyman) |
| **Encryption Key** | Analisis fungsi `gsk()` di file JS DANA yang di-minify |
| **IV (Initialization Vector)** | Analisis fungsi enkripsi di aplikasi DANA |
| **API Endpoints** | Capture semua endpoint dari network traffic |

---

  *Catatan: Session ID ini akan expired setelah beberapa waktu atau setelah logout*
  
---

## ⚠️ Peringatan

**Script TIDAK AKAN BERJALAN** tanpa melakukan reverse engineering terlebih dahulu untuk mendapatkan:
1. Endpoint API yang benar
2. Algoritma enkripsi asli
3. Format signature yang valid
4. Device fingerprinting mechanism

**reverse engineering**:

1. **Install Proxy Tool**: Charles Proxy, Proxyman, atau Burp Suite 
2. **Setup SSL Certificate**: Install certificate proxy di device untuk decrypt HTTPS traffic
3. **Login ke DANA**: Buka aplikasi DANA dan lakukan login
4. **Capture Request**: Tangkap request yang dikirim saat login
5. **Extract Session**: Ambil `ALIPAYJSESSIONID` dari cookie response header 

### Step-by-step dengan Charles Proxy:

```bash
# 1. Install Charles Proxy
# Download dari: https://www.charlesproxy.com/download/

# 2. Setup SSL Certificate di Android/iOS
# - Buka Charles > Help > SSL Proxying > Install Charles Root Certificate on Mobile Device
# - Ikuti instruksi untuk install certificate di HP

# 3. Enable SSL Proxying di Charles
# Proxy > SSL Proxying Settings > Enable > Add host: api.dana.id, port: 443

# 4. Buka aplikasi DANA dan login

# 5. Capture request ke /auth/login
# Cari response dengan header "Set-Cookie: ALIPAYJSESSIONID=..."

# 6. Extract nilai cookie
# Contoh output:
# ALIPAYJSESSIONID=abc123def456xyz789; Path=/; Domain=.dana.id; HttpOnly

### Alternatif dengan Browser DevTools (Web Version):
// Buka console browser saat login ke web DANA
document.cookie.split('; ').find(row => row.startsWith('ALIPAYJSESSIONID='))
```
```
***Source***: [alipay-sdk](https://github.com/alipay/alipay-sdk-java-all.git)

```bash
# Contoh extract session dari response header
curl -X POST https://api.dana.id/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"...","password":"..."}' \
  -v 2>&1 | grep -i "set-cookie"
```
---

## 🚨 Catatan

1. **Endpoint DANA dapat berubah** - Kode di atas menggunakan endpoint berdasarkan observasi umum (seperti `/mapi/my/transaction/list`). Endpoint sebenarnya mungkin berbeda dan perlu ditemukan melalui reverse engineering aplikasi web DANA.
2. **Keamanan** - Jangan pernah menyimpan session ID di kode yang commit ke repository. Gunakan environment variables.
3. **Rate Limiting** - DANA mungkin membatasi jumlah request. Implementasikan delay antar request jika diperlukan.
4. **Legal** - Pastikan penggunaan API unofficial ini tidak melanggar ketentuan layanan DANA.
5. **Testing** - Selalu uji dengan akun dan nominal kecil terlebih dahulu.
6. **kerangka/template** yang membutuhkan implementasi spesifik berdasarkan hasil reverse engineering Anda. Endpoint, header, parameter, dan algoritma enkripsi **harus disesuaikan** dengan hasil analisis Anda terhadap aplikasi DANA.

## Untuk Development

| Langkah | Deskripsi |
|---------|-----------|
| **1. Analisis Endpoint** | Gunakan proxy untuk menemukan semua endpoint API yang diperlukan  |
| **2. Cari Algoritma Enkripsi** | Analisis file JS yang di-minify untuk menemukan fungsi `gsk()` atau sejenisnya  |
| **3. Simulasi Request** | Replicate request structure dengan parameter yang sesuai |
| **4. Testing di Sandbox** | JANGAN gunakan akun dengan saldo riil untuk testing |

---

## Referensi Proyek Terkait

- **Laravel DANA Library**: `otnansirk/laravel-dana` - Library resmi untuk integrasi payment gateway 
- **DANA UAT Script**: Repositori resmi untuk testing sandbox 
- **Node.js DANA Client**: Tersedia di GitHub DANA ID untuk official API 

**⚠️ Disclaimer**: Kode ini hanya untuk tujuan **pembelajaran dan research**. Penggunaan untuk transaksi riil dilarang dan dapat mengakibatkan pemblokiran akun serta kerugian finansial. Selalu gunakan **Official API DANA** untuk keperluan bisnis/produksi.

Untuk implementasi production dengan transfer dana, sangat disarankan untuk menggunakan **official API DANA** sebagai merchant terdaftar .

# Oficial DANA API

1. [**dana-php**](https://github.com/dana-id/dana-php.git)
2. [**dana-node**](https://github.com/dana-id/dana-node.git)
3. [**dana-uat-script**]( https://github.com/dana-id/uat-script.git)
