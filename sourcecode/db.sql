CREATE DATABASE dana_api;
USE dana_api;

-- Tabel untuk menyimpan kredensial & session
CREATE TABLE accounts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    phone_number VARCHAR(20) UNIQUE NOT NULL,
    session_id VARCHAR(255), -- ALIPAYJSESSIONID
    access_token TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Tabel untuk menyimpan data mutasi
CREATE TABLE transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    transaction_id VARCHAR(100) UNIQUE NOT NULL, -- ID unik dari DANA
    account_id INT,
    amount DECIMAL(15, 2),
    type ENUM('IN', 'OUT'),
    description TEXT,
    transaction_date DATETIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES accounts(id)
);