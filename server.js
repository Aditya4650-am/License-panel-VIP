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

const dbFile = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbFile, (err) => {
    if (err) console.error('Database connection error:', err.message);
    else {
        console.log('Connected to SQLite persistent database.');
        initTables();
    }
});

function initTables() {
    db.serialize(() => {
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

        db.run(`CREATE INDEX IF NOT EXISTS idx_keys_code ON keys(key_code)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_devices_key ON devices(key_code)`);
    });
}

// Anti-cache Headers for Verification Routes
app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
});

// Admin Dashboard Stats
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
                    totalScripts: (scripts || []).length,
                    totalKeys: (keys || []).length,
                    activeKeys: (keys || []).filter(k => k.is_active === 1).length,
                    totalDevices: (devices || []).length,
                    scripts: scripts || [],
                    keys: keys || []
                });
            });
        });
    });
});

// Upload Script Payload
app.post('/api/admin/scripts', (req, res) => {
    const { title, category, version, content } = req.body;
    if (!title || !content) return res.status(400).json({ error: "Title and Content required!" });

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

// Delete Script Endpoint
app.post('/api/admin/scripts/delete', (req, res) => {
    const { scriptId } = req.body;
    if (!scriptId) return res.status(400).json({ error: "Script ID is required!" });

    db.run(`DELETE FROM scripts WHERE id = ?`, [scriptId], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) {
            return res.status(404).json({ error: "Script not found!" });
        }

        db.all(`SELECT key_code FROM keys WHERE script_id = ?`, [scriptId], (err, keys) => {
            if (!err && keys && keys.length > 0) {
                const keyCodes = keys.map(k => k.key_code);
                const placeholders = keyCodes.map(() => '?').join(',');

                db.run(`DELETE FROM devices WHERE key_code IN (${placeholders})`, keyCodes);
                db.run(`DELETE FROM keys WHERE script_id = ?`, [scriptId]);
            }
        });

        res.json({ success: true, message: "Script and linked data deleted successfully." });
    });
});

// Generate VIP Key
app.post('/api/admin/keys', (req, res) => {
    const { scriptId, durationType, deviceLimit = 1, customKey } = req.body;
    if (!scriptId) return res.status(400).json({ error: "Please select a script payload!" });

    let durationDays = 30;
    if (durationType === '7days') durationDays = 7;
    else if (durationType === '1month') durationDays = 30;
    else if (durationType === '1year') durationDays = 365;
    else if (durationType === 'lifetime') durationDays = 36500;

    const randomHex = () => crypto.randomBytes(2).toString('hex').toUpperCase();
    const keyCode = customKey && customKey.trim() !== "" 
        ? customKey.trim() 
        : `VIP-${randomHex()}-${randomHex()}-${randomHex()}-${randomHex()}`;

    db.get(`SELECT key_code FROM keys WHERE key_code = ?`, [keyCode], (err, row) => {
        if (row) return res.status(400).json({ error: "Key code already exists!" });

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

// Revoke Key
app.post('/api/admin/keys/revoke', (req, res) => {
    const { keyCode } = req.body;
    if (!keyCode) return res.status(400).json({ error: "Key code required" });

    db.run(`UPDATE keys SET is_active = 0 WHERE key_code = ?`, [keyCode], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, message: "Key revoked successfully" });
    });
});

// Key Verification Endpoint
app.post('/api/verify', (req, res) => {
    const { key, hwid } = req.body;
    if (!key || !hwid) {
        return res.status(400).send("Invalid request payload (Missing Key or HWID)");
    }

    const cleanKey = key.trim();

    db.get(`SELECT * FROM keys WHERE key_code = ? AND is_active = 1`, [cleanKey], (err, keyRecord) => {
        if (err || !keyRecord) {
            return res.status(401).send("Invalid or revoked license key!");
        }

        const now = new Date();
        let expiresAt = keyRecord.expires_at;

        if (!expiresAt) {
            const expireDate = new Date();
            expireDate.setDate(expireDate.getDate() + keyRecord.duration_days);
            expiresAt = expireDate.toISOString();
            db.run(`UPDATE keys SET expires_at = ? WHERE key_code = ?`, [expiresAt, cleanKey]);
        } else if (new Date(expiresAt) < now) {
            return res.status(403).send("License key has expired!");
        }

        db.all(`SELECT hwid FROM devices WHERE key_code = ?`, [cleanKey], (err, deviceRecords) => {
            if (err) return res.status(500).send("Database error");

            const registeredHwids = (deviceRecords || []).map(d => d.hwid);

            if (!registeredHwids.includes(hwid)) {
                if (registeredHwids.length >= keyRecord.device_limit) {
                    return res.status(403).send("Device limit reached for this key!");
                }
                db.run(`INSERT INTO devices (key_code, hwid) VALUES (?, ?)`, [cleanKey, hwid]);
            }

            db.get(`SELECT content FROM scripts WHERE id = ?`, [keyRecord.script_id], (err, script) => {
                if (err || !script || !script.content) {
                    return res.status(404).send("No script payload linked to this key!");
                }

                res.setHeader('Content-Type', 'text/plain');
                res.send(script.content);
            });
        });
    });
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
