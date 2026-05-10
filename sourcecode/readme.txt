### Node.js:
```bash
npm install
node index.js
# or with nodemon for development
npm run dev
```

### PHP:
```bash
composer install
php -S localhost:3000 index.php
```

---

## 📡 Contoh Request & Response

### Get Mutasi
```bash
curl http://localhost:3000/api/mutasi?page=1&limit=10
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "orderId": "TX123456789",
      "amount": 50000,
      "type": "SEND",
      "description": "Transfer to 081234567890",
      "timestamp": "2026-05-09T10:30:00Z",
      "status": "COMPLETED"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 25
  }
}
```

### Transfer
```bash
curl -X POST http://localhost:3000/api/transfer \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"081234567890","amount":50000,"note":"Test transfer"}'
```

**Response:**
```json
{
  "success": true,
  "transactionId": "TX123456789",
  "amount": 50000,
  "receiver": "081234567890",
  "status": "completed",
  "timestamp": "2026-05-09T10:30:00.000Z"
}
```
Running in TEST MODE - No actual API calls will be made
Set DANA_TEST_MODE=false to make real calls
---

