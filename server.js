const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
// Serve the main index.html page on the root URL
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


// Initialize SQLite database file
const db = new sqlite3.Database('./database.db');

db.serialize(() => {
    // Products / Applications table
    db.run(`CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // License Keys table
    db.run(`CREATE TABLE IF NOT EXISTS keys (
        key_code TEXT PRIMARY KEY,
        product_id TEXT,
        duration_days INTEGER DEFAULT 30,
        device_limit INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME,
        is_active INTEGER DEFAULT 1,
        FOREIGN KEY(product_id) REFERENCES products(id)
    )`);

    // Device Hardware ID Bindings table
    db.run(`CREATE TABLE IF NOT EXISTS devices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key_code TEXT,
        hwid TEXT,
        bound_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(key_code) REFERENCES keys(key_code)
    )`);
});

// Admin: Register a Product
app.post('/api/admin/products', (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "Product name required" });

    const productId = crypto.randomUUID();
    db.run(`INSERT INTO products (id, name) VALUES (?, ?)`, [productId, name], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, id: productId });
    });
});

// Admin: Get All Products
app.get('/api/admin/products', (req, res) => {
    db.all(`SELECT * FROM products`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Admin: Generate License Key
app.post('/api/admin/keys', (req, res) => {
    const { productId, durationDays = 30, deviceLimit = 1, customKey } = req.body;
    
    // Generate a random 6-digit numeric key or custom code
    const keyCode = customKey && customKey.trim() !== "" 
        ? customKey.trim() 
        : Math.floor(100000 + Math.random() * 900000).toString();

    db.run(
        `INSERT INTO keys (key_code, product_id, duration_days, device_limit) VALUES (?, ?, ?, ?)`,
        [keyCode, productId, durationDays, deviceLimit],
        function(err) {
            if (err) return res.status(500).json({ error: "Key generation failed or key already exists" });
            res.json({ success: true, keyCode });
        }
    );
});

// Admin: Get All Keys
app.get('/api/admin/keys', (req, res) => {
    const query = `
        SELECT keys.*, products.name as product_name 
        FROM keys 
        LEFT JOIN products ON keys.product_id = products.id
    `;
    db.all(query, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Client Endpoint: Verify License Key
app.post('/api/verify', (req, res) => {
    const { key, hwid } = req.body;
    if (!key || !hwid) {
        return res.status(400).json({ status: "error", message: "Key and HWID required" });
    }

    db.get(`SELECT * FROM keys WHERE key_code = ? AND is_active = 1`, [key], (err, keyRecord) => {
        if (err || !keyRecord) {
            return res.status(401).json({ status: "error", message: "Invalid license key" });
        }

        // Handle initial activation and expiry tracking
        if (!keyRecord.expires_at) {
            const expireDate = new Date();
            expireDate.setDate(expireDate.getDate() + keyRecord.duration_days);
            db.run(`UPDATE keys SET expires_at = ? WHERE key_code = ?`, [expireDate.toISOString(), key]);
        } else if (new Date(keyRecord.expires_at) < new Date()) {
            return res.status(403).json({ status: "error", message: "License key has expired" });
        }

        // Validate HWID binding
        db.all(`SELECT hwid FROM devices WHERE key_code = ?`, [key], (err, devices) => {
            const registeredHwids = devices.map(d => d.hwid);
            
            if (!registeredHwids.includes(hwid)) {
                if (registeredHwids.length >= keyRecord.device_limit) {
                    return res.status(403).json({ status: "error", message: "Device limit reached" });
                }
                db.run(`INSERT INTO devices (key_code, hwid) VALUES (?, ?)`, [key, hwid]);
            }

            res.json({ status: "success", message: "License validated successfully" });
        });
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

