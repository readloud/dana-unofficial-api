Running in TEST MODE - No actual API calls will be made
Set DANA_TEST_MODE=false to make real calls

# node.js wrapper

```bash
npm init -y
npm install axios crypto-js dotenv
npm install --save-dev nodemon
```
## demo 1
```bash
npx nodemon dana-unofficial.js
node --inspect dana-unofficial.js
```
## demo 2
```bash
npx nodemon dana-wrapper.js
node --inspect dana-wrapper.js
```
# php wrapper

```bash
composer install

## demo 1
```bash
php dana-unofficial.php
```

## demo 2
```bash
php dana-wrapper.php
```
// Skip host verification (not recommended for production)
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);

# Set environment variables (optional but recommended)
export DANA_SESSION_ID="your_session_id_here"
export DANA_ENCRYPTION_KEY="your_32_byte_encryption_key"
export DANA_IV="your_16_byte_iv"
export DANA_TEST_MODE=true  # Set to false when ready
