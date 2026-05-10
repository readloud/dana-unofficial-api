### mock-environment

1. Start mock server:
   cd mock-server
   npm install
   node index.mjs

2. Start webhook receiver:
   cd webhook
   npm install
   node receiver.mjs

3. Jalankan klien (contoh di php-client dan node-client).

Docker (recommended):
- Install Docker & docker-compose
- Edit docker/.env
- docker-compose up --build
---
# Check mock server
curl http://localhost:3000/

# Check webhook server  
curl http://localhost:4000/

# Test API endpoint
curl http://localhost:3000/balance \
  -H "Authorization: Bearer YOUR_TOKEN"

Running in TEST MODE - No actual API calls will be made
Set DANA_TEST_MODE=false to make real calls
