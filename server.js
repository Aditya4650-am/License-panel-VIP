const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// Connect to SQLite database (Persistent storage setup)
const dbFile = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbFile, (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log('Connected to persistent SQLite database.');
        initTables();
    }
});

// Initialize database schema tables
function initTables() {
    db.run(`CREATE TABLE IF NOT EXISTS scripts (
        id TEXT PRIMARY KEY,
        title TEXT,
        category TEXT,
        version TEXT,
        content TEXT,
        created_at TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS keys (
        key_code TEXT PRIMARY KEY,
        script_id TEXT,
        duration_days INTEGER,
        device_limit INTEGER,
        created_at TEXT,
        expires_at TEXT,
        is_active INTEGER
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS devices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key_code TEXT,
        hwid TEXT
    )`);
}

// 1. ADMIN DASHBOARD API: Returns comprehensive statistics, active keys, and uploaded scripts details
app.get('/api/admin/dashboard', (req, res) => {
    db.all(`SELECT * FROM scripts ORDER BY created_at DESC`, [], (err, scripts) => {
        if (err) return res.status(500).json({ error: err.message });

        db.all(`
            SELECT k.*, s.title as script_name 
            FROM keys k 
            LEFT JOIN scripts s ON k.script_id = s.id 
            ORDER BY k.created_at DESC
        `, [], (err, keys) => {
            if (err) return res.status(500).json({ error: err.message });

            db.all(`SELECT * FROM devices`, [], (err, devices) => {
                if (err) return res.status(500).json({ error: err.message });

                res.json({
                    totalScripts: scripts.length,
                    totalKeys: keys.length,
                    activeKeys: keys.filter(k => k.is_active === 1).length,
                    totalDevices: devices.length,
                    scripts: scripts || [],
                    keys: keys || []
                });
            });
        });
    });
});

// 2. ADMIN SCRIPT UPLOAD API: Add new scripts to the permanent database
app.post('/api/admin/scripts', (req, res) => {
    const { title, category, version, content } = req.body;
    if (!title || !content) return res.status(400).json({ error: "Title and Content are required!" });

    const scriptId = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    db.run(`INSERT INTO scripts (id, title, category, version, content, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
        [scriptId, title, category || 'General', version || '1.0.0', content, createdAt],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, id: scriptId });
        }
    );
});

// 3. ADMIN KEY GENERATOR API: Supports 7 Days, 1 Month, 1 Year, and Lifetime options
app.post('/api/admin/keys', (req, res) => {
    const { scriptId, durationType, deviceLimit = 1, customKey } = req.body;
    if (!scriptId) return res.status(400).json({ error: "Script selection is required!" });

    let durationDays = 30; // default 1 month
    if (durationType === '7days') durationDays = 7;
    else if (durationType === '1month') durationDays = 30;
    else if (durationType === '1year') durationDays = 365;
    else if (durationType === 'lifetime') durationDays = 36500; // 100 years

    const randomHex = () => crypto.randomBytes(2).toString('hex').toUpperCase();
    const keyCode = customKey && customKey.trim() !== "" 
        ? customKey.trim() 
        : `VIP-${randomHex()}-${randomHex()}-${randomHex()}-${randomHex()}-${randomHex()}`;

    db.get(`SELECT key_code FROM keys WHERE key_code = ?`, [keyCode], (err, row) => {
        if (row) return res.status(400).json({ error: "Key already exists!" });

        const createdAt = new Date().toISOString();
        db.run(`INSERT INTO keys (key_code, script_id, duration_days, device_limit, created_at, expires_at, is_active) VALUES (?, ?, ?, ?, ?, NULL, 1)`,
            [keyCode, scriptId, parseInt(durationDays), parseInt(deviceLimit), createdAt],
            function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true, keyCode });
            }
        );
    });
});

// 4. CLIENT VERIFICATION API: Validates keys, HWID limits, expiration, and delivers raw script code securely
app.post('/api/verify', (req, res) => {
    const { key, hwid, scriptId } = req.body;
    if (!key || !hwid) return res.status(400).send("Key and HWID are required");

    db.get(`SELECT * FROM keys WHERE key_code = ? AND is_active = 1`, [key], (err, keyRecord) => {
        if (err || !keyRecord) return res.status(401).send("Invalid license key!");

        if (scriptId && keyRecord.script_id !== scriptId) {
            return res.status(403).send("Key belongs to a different script!");
        }

        const now = new Date();
        let expiresAt = keyRecord.expires_at;

        if (!expiresAt) {
            const expireDate = new Date();
            expireDate.setDate(expireDate.getDate() + keyRecord.duration_days);
            expiresAt = expireDate.toISOString();
            db.run(`UPDATE keys SET expires_at = ? WHERE key_code = ?`, [expiresAt, key]);
        } else if (new Date(expiresAt) < now) {
            return res.status(403).send("License key has expired!");
        }

        db.all(`SELECT * FROM devices WHERE key_code = ?`, [key], (err, deviceRecords) => {
            if (err) return res.status(500).send("Database error");

            const registeredHwids = deviceRecords.map(d => d.hwid);

            if (!registeredHwids.includes(hwid)) {
                if (registeredHwids.length >= keyRecord.device_limit) {
                    return res.status(403).send("Device limit reached for this key!");
                }
                db.run(`INSERT INTO devices (key_code, hwid) VALUES (?, ?)`, [key, hwid]);
            }

            db.get(`SELECT content FROM scripts WHERE id = ?`, [keyRecord.script_id], (err, script) => {
                if (err || !script) return res.status(404).send("Linked script payload not found!");

                res.setHeader('Content-Type', 'text/plain');
                res.send(script.content);
            });
        });
    });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running securely on port ${PORT}`));
