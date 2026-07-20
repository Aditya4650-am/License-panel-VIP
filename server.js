const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

const db = new sqlite3.Database('./database.db');

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS scripts (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        category TEXT DEFAULT 'General',
        version TEXT DEFAULT '1.0.0',
        content TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS keys (
        key_code TEXT PRIMARY KEY,
        script_id TEXT,
        duration_days INTEGER DEFAULT 30,
        device_limit INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME,
        is_active INTEGER DEFAULT 1,
        FOREIGN KEY(script_id) REFERENCES scripts(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS devices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key_code TEXT,
        hwid TEXT,
        FOREIGN KEY(key_code) REFERENCES keys(key_code)
    )`);
});

// Admin: Get Dashboard Stats & Lists
app.get('/api/admin/dashboard', (req, res) => {
    db.all(`SELECT * FROM scripts`, [], (err, scripts) => {
        db.all(`SELECT keys.*, scripts.title as script_name FROM keys LEFT JOIN scripts ON keys.script_id = scripts.id`, [], (err2, keys) => {
            db.get(`SELECT COUNT(*) as count FROM devices`, [], (err3, devices) => {
                res.json({
                    totalScripts: scripts.length,
                    totalKeys: keys.length,
                    activeKeys: keys.filter(k => k.is_active).length,
                    totalDevices: devices ? devices.count : 0,
                    scripts,
                    keys
                });
            });
        });
    });
});

// Admin: Upload Script
app.post('/api/admin/scripts', (req, res) => {
    const { title, category, version, content } = req.body;
    if (!title || !content) return res.status(400).json({ error: "Missing required fields" });

    const scriptId = crypto.randomUUID();
    db.run(`INSERT INTO scripts (id, title, category, version, content) VALUES (?, ?, ?, ?, ?)`,
        [scriptId, title, category || 'General', version || '1.0.0', content],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, id: scriptId });
        }
    );
});

// Admin: Generate Key
app.post('/api/admin/keys', (req, res) => {
    const { scriptId, durationDays = 30, deviceLimit = 1, customKey } = req.body;
    if (!scriptId) return res.status(400).json({ error: "Please select a script" });

    const keyCode = customKey && customKey.trim() !== "" 
        ? customKey.trim() 
        : Math.floor(100000 + Math.random() * 900000).toString();

    db.run(`INSERT INTO keys (key_code, script_id, duration_days, device_limit) VALUES (?, ?, ?, ?)`,
        [keyCode, scriptId, durationDays, deviceLimit],
        function(err) {
            if (err) return res.status(500).json({ error: "Key already exists or invalid script" });
            res.json({ success: true, keyCode });
        }
    );
});

// Client Endpoint: Script & Key Verification
app.post('/api/verify', (req, res) => {
    const { key, hwid, scriptId } = req.body;
    if (!key || !hwid) return res.status(400).json({ status: "error", message: "Key and HWID required" });

    db.get(`SELECT * FROM keys WHERE key_code = ? AND is_active = 1`, [key], (err, keyRecord) => {
        if (err || !keyRecord) return res.status(401).json({ status: "error", message: "Invalid license key!" });

        // Check if key is tied to this specific script (optional check)
        if (scriptId && keyRecord.script_id !== scriptId) {
            return res.status(403).json({ status: "error", message: "This key belongs to a different script!" });
        }

        // Activate expiry on first use
        if (!keyRecord.expires_at) {
            const expireDate = new Date();
            expireDate.setDate(expireDate.getDate() + keyRecord.duration_days);
            db.run(`UPDATE keys SET expires_at = ? WHERE key_code = ?`, [expireDate.toISOString(), key]);
        } else if (new Date(keyRecord.expires_at) < new Date()) {
            return res.status(403).json({ status: "error", message: "License key has expired!" });
        }

        // Check Device Limit & Bind HWID
        db.all(`SELECT hwid FROM devices WHERE key_code = ?`, [key], (err2, devices) => {
            const registeredHwids = devices.map(d => d.hwid);
            if (!registeredHwids.includes(hwid)) {
                if (registeredHwids.length >= keyRecord.device_limit) {
                    return res.status(403).json({ status: "error", message: "Device limit reached for this key!" });
                }
                db.run(`INSERT INTO devices (key_code, hwid) VALUES (?, ?)`, [key, hwid]);
            }

            // Return protected script code
            db.get(`SELECT content FROM scripts WHERE id = ?`, [keyRecord.script_id], (err3, script) => {
                if (err3 || !script) return res.status(404).json({ status: "error", message: "Linked script payload not found!" });
                res.json({ status: "success", content: script.content });
            });
        });
    });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Professional Vinzz Panel running on port ${PORT}`));
