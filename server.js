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

if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ scripts: [], keys: [], devices: [] }, null, 2));
}

function readDB() {
    try {
        return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (err) {
        return { scripts: [], keys: [], devices: [] };
    }
}

function writeDB(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

app.get('/api/admin/dashboard', (req, res) => {
    const db = readDB();
    const scripts = db.scripts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const keys = db.keys.map(k => {
        const script = db.scripts.find(s => s.id === k.script_id);
        return { ...k, script_name: script ? script.title : 'Unassigned' };
    }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    res.json({
        totalScripts: scripts.length,
        totalKeys: keys.length,
        activeKeys: keys.filter(k => k.is_active).length,
        totalDevices: db.devices.length,
        scripts,
        keys
    });
});

app.post('/api/admin/scripts', (req, res) => {
    const { title, category, version, content } = req.body;
    if (!title || !content) return res.status(400).json({ error: "Title and Content required!" });

    const db = readDB();
    const scriptId = crypto.randomUUID();
    db.scripts.unshift({ id: scriptId, title, category: category || 'General', version: version || '1.0.0', content, created_at: new Date().toISOString() });
    writeDB(db);
    res.json({ success: true, id: scriptId });
});

app.post('/api/admin/keys', (req, res) => {
    const { scriptId, durationDays = 30, deviceLimit = 1, customKey } = req.body;
    if (!scriptId) return res.status(400).json({ error: "Select a script!" });

    const db = readDB();
    const keyCode = customKey && customKey.trim() !== "" ? customKey.trim() : Math.floor(100000 + Math.random() * 900000).toString();
    if (db.keys.some(k => k.key_code === keyCode)) return res.status(400).json({ error: "Key already exists!" });

    db.keys.unshift({ key_code: keyCode, script_id: scriptId, duration_days: parseInt(durationDays), device_limit: parseInt(deviceLimit), created_at: new Date().toISOString(), expires_at: null, is_active: 1 });
    writeDB(db);
    res.json({ success: true, keyCode });
});

// CLIENT VERIFICATION: Returns RAW SCRIPT CONTENT directly on success
app.post('/api/verify', (req, res) => {
    const { key, hwid, scriptId } = req.body;
    if (!key || !hwid) return res.status(400).send("ERROR: Key and HWID required");

    const db = readDB();
    const keyRecord = db.keys.find(k => k.key_code === key && k.is_active === 1);
    if (!keyRecord) return res.status(401).send("ERROR: Invalid license key!");

    if (scriptId && keyRecord.script_id !== scriptId) {
        return res.status(403).send("ERROR: Key belongs to a different script!");
    }

    const now = new Date();
    if (!keyRecord.expires_at) {
        const expireDate = new Date();
        expireDate.setDate(expireDate.getDate() + keyRecord.duration_days);
        keyRecord.expires_at = expireDate.toISOString();
    } else if (new Date(keyRecord.expires_at) < now) {
        return res.status(403).send("ERROR: License key has expired!");
    }

    const deviceRecords = db.devices.filter(d => d.key_code === key);
    const registeredHwids = deviceRecords.map(d => d.hwid);

    if (!registeredHwids.includes(hwid)) {
        if (registeredHwids.length >= keyRecord.device_limit) {
            return res.status(403).send("ERROR: Device limit reached for this key!");
        }
        db.devices.push({ key_code: key, hwid });
    }

    writeDB(db);

    const script = db.scripts.find(s => s.id === keyRecord.script_id);
    if (!script) return res.status(404).send("ERROR: Linked script payload not found!");

    // Send the raw Lua script code directly with text/plain
    res.setHeader('Content-Type', 'text/plain');
    res.send(script.content);
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
