const express = require('express');
const fs = require('fs');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

const DB_FILE = path.join(__dirname, 'database.json');

// Initialize database file if it doesn't exist
if (!fs.existsSync(DB_FILE)) {
    const initialData = {
        scripts: [],
        keys: [],
        devices: []
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2));
}

function readDB() {
    try {
        const data = fs.readFileSync(DB_FILE, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        return { scripts: [], keys: [], devices: [] };
    }
}

function writeDB(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// Admin: Get Dashboard Stats & Lists
app.get('/api/admin/dashboard', (req, res) => {
    const db = readDB();
    const scripts = db.scripts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    
    const keys = db.keys.map(k => {
        const script = db.scripts.find(s => s.id === k.script_id);
        return {
            ...k,
            script_name: script ? script.title : 'Unassigned'
        };
    }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    res.json({
        totalScripts: scripts.length,
        totalKeys: keys.length,
        activeKeys: keys.filter(k => k.is_active).length,
        totalDevices: db.devices.length,
        scripts: scripts,
        keys: keys
    });
});

// Admin: Upload Script
app.post('/api/admin/scripts', (req, res) => {
    const { title, category, version, content } = req.body;
    if (!title || !content) {
        return res.status(400).json({ error: "Script Title and Content are required!" });
    }

    const db = readDB();
    const scriptId = crypto.randomUUID();
    const newScript = {
        id: scriptId,
        title,
        category: category || 'General',
        version: version || '1.0.0',
        content,
        created_at: new Date().toISOString()
    };

    db.scripts.unshift(newScript);
    writeDB(db);
    res.json({ success: true, id: scriptId });
});

// Admin: Generate Key
app.post('/api/admin/keys', (req, res) => {
    const { scriptId, durationDays = 30, deviceLimit = 1, customKey } = req.body;
    if (!scriptId) return res.status(400).json({ error: "Please select a target script!" });

    const db = readDB();
    const keyCode = customKey && customKey.trim() !== "" 
        ? customKey.trim() 
        : Math.floor(100000 + Math.random() * 900000).toString();

    if (db.keys.some(k => k.key_code === keyCode)) {
        return res.status(400).json({ error: "Key code already exists!" });
    }

    const newKey = {
        key_code: keyCode,
        script_id: scriptId,
        duration_days: parseInt(durationDays),
        device_limit: parseInt(deviceLimit),
        created_at: new Date().toISOString(),
        expires_at: null,
        is_active: 1
    };

    db.keys.unshift(newKey);
    writeDB(db);
    res.json({ success: true, keyCode });
});

// Client Endpoint: Script & Key Verification
app.post('/api/verify', (req, res) => {
    const { key, hwid, scriptId } = req.body;
    if (!key || !hwid) return res.status(400).json({ status: "error", message: "Key and HWID required" });

    const db = readDB();
    const keyRecord = db.keys.find(k => k.key_code === key && k.is_active === 1);
    if (!keyRecord) return res.status(401).json({ status: "error", message: "Invalid license key!" });

    if (scriptId && keyRecord.script_id !== scriptId) {
        return res.status(403).json({ status: "error", message: "This key belongs to a different script!" });
    }

    const now = new Date();
    if (!keyRecord.expires_at) {
        const expireDate = new Date();
        expireDate.setDate(expireDate.getDate() + keyRecord.duration_days);
        keyRecord.expires_at = expireDate.toISOString();
    } else if (new Date(keyRecord.expires_at) < now) {
        return res.status(403).json({ status: "error", message: "License key has expired!" });
    }

    const deviceRecords = db.devices.filter(d => d.key_code === key);
    const registeredHwids = deviceRecords.map(d => d.hwid);

    if (!registeredHwids.includes(hwid)) {
        if (registeredHwids.length >= keyRecord.device_limit) {
            return res.status(403).json({ status: "error", message: "Device limit reached for this key!" });
        }
        db.devices.push({ key_code: key, hwid });
    }

    writeDB(db);

    const script = db.scripts.find(s => s.id === keyRecord.script_id);
    if (!script) return res.status(404).json({ status: "error", message: "Linked script payload not found!" });

    res.json({ status: "success", content: script.content });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Zenitsu & Evil VIP Server running on port ${PORT}`));
         

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Zenitsu & Evil VIP Server running on port ${PORT}`));
    

    db.run(`INSERT INTO keys (key_code, script_id, duration_days, device_limit) VALUES (?, ?, ?, ?)`,
        [keyCode, scriptId, durationDays, deviceLimit],
        function(err) {
            if (err) return res.status(500).json({ error: "Key already exists or invalid script selection!" });
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

        if (scriptId && keyRecord.script_id !== scriptId) {
            return res.status(403).json({ status: "error", message: "This key belongs to a different script!" });
        }

        if (!keyRecord.expires_at) {
            const expireDate = new Date();
            expireDate.setDate(expireDate.getDate() + keyRecord.duration_days);
            db.run(`UPDATE keys SET expires_at = ? WHERE key_code = ?`, [expireDate.toISOString(), key]);
        } else if (new Date(keyRecord.expires_at) < new Date()) {
            return res.status(403).json({ status: "error", message: "License key has expired!" });
        }

        db.all(`SELECT hwid FROM devices WHERE key_code = ?`, [key], (err2, devices) => {
            const registeredHwids = devices.map(d => d.hwid);
            if (!registeredHwids.includes(hwid)) {
                if (registeredHwids.length >= keyRecord.device_limit) {
                    return res.status(403).json({ status: "error", message: "Device limit reached for this key!" });
                }
                db.run(`INSERT INTO devices (key_code, hwid) VALUES (?, ?)`, [key, hwid]);
            }

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
app.listen(PORT, () => console.log(`Zenitsu & Evil VIP Server running on port ${PORT}`));
