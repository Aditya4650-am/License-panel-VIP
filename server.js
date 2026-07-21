const express = require('express');
const multer  = require('multer');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const app = express();

// Trust proxy for Render reverse proxy (Ensures correct HTTPS protocol detection for GameGuardian)
app.set('trust proxy', 1);

const upload = multer({ limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB limit

app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.json({ limit: '10mb' }));

// Anti-Caching Headers
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

// ==========================================
// SQLITE DATABASE SETUP
// ==========================================
const dataDir = fs.existsSync('/var/data') ? '/var/data' : __dirname;
const dbPath = path.join(dataDir, 'dashboard.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) console.error("Database connection error:", err);
  else console.log(`Connected to SQLite Database at: ${dbPath}`);
});

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS keys (
      code TEXT PRIMARY KEY,
      script_id INTEGER,
      duration_days INTEGER,
      expires_at INTEGER,
      bound_device TEXT,
      max_devices INTEGER DEFAULT 1,
      created_at TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS scripts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      content TEXT,
      is_active INTEGER DEFAULT 0,
      updated_at TEXT
    )
  `);

  // Default script if empty
  db.get("SELECT COUNT(*) as count FROM scripts", (err, row) => {
    if (row && row.count === 0) {
      db.run(
        "INSERT INTO scripts (name, content, is_active, updated_at) VALUES (?, ?, 1, ?)",
        ["Township VIP Default Payload", 'gg.toast("⚡ VIP Script Loaded Successfully!")\ngg.alert("Welcome to Zenitsu VIP Panel!")', new Date().toISOString()]
      );
    }
  });
});

// ==========================================
// 1. ADMIN DASHBOARD ROUTE (UI)
// ==========================================
app.get('/', (req, res) => {
  db.all("SELECT * FROM keys ORDER BY created_at DESC", [], (err, keys) => {
    if (err) keys = [];
    db.all("SELECT * FROM scripts ORDER BY id DESC", [], (err, scripts) => {
      if (err) scripts = [];
      
      const activeScriptObj = scripts.find(s => s.is_active === 1) || scripts[0] || null;
      const activeScriptContent = activeScriptObj ? activeScriptObj.content : "";
      const activeScriptName = activeScriptObj ? activeScriptObj.name : "None";
      const activeScriptId = activeScriptObj ? activeScriptObj.id : null;
      const currentTime = Math.floor(Date.now() / 1000);

      const activeKeysCount = keys.filter(k => k.expires_at === 0 || k.expires_at > currentTime).length;

      // Build License Keys Table Rows
      let keyRows = keys.map(k => {
        const isExpired = k.expires_at !== 0 && k.expires_at < currentTime;
        const expDate = k.expires_at === 0 ? "👑 Lifetime" : new Date(k.expires_at * 1000).toLocaleString();
        const linkedScript = scripts.find(s => s.id === k.script_id);
        const scriptLabel = linkedScript ? linkedScript.name : (activeScriptName || "General Payload");

        return `
          <tr>
            <td><code style="color:#00ff88;">${k.code}</code></td>
            <td style="color:#00e5ff; font-weight:600;">${scriptLabel}</td>
            <td>${k.bound_device ? `<code style="color:#00e5ff;">${k.bound_device}</code>` : '<span style="color: #64748b;">Unbound</span>'}</td>
            <td><span class="badge ${isExpired ? 'badge-red' : 'badge-green'}">${isExpired ? 'EXPIRED' : 'ACTIVE'}</span></td>
            <td style="color:#e2e8f0;">${expDate}</td>
            <td style="display: flex; gap: 0.5rem; align-items: center;">
              <button type="button" class="btn-action btn-copy" onclick="copyToClipboard('${k.code}')">📋 Copy</button>
              <form action="/admin/delete-key" method="POST" style="display:inline; margin:0;">
                <input type="hidden" name="code" value="${k.code}" />
                <button type="submit" class="btn-action btn-danger">🗑️ Delete</button>
              </form>
            </td>
          </tr>
        `;
      }).join('');

      // Build Saved Scripts Table Rows
      let scriptRows = scripts.map(s => {
        const isActive = s.id === activeScriptId;
        const payloadSize = (s.content ? s.content.length / 1024 : 0).toFixed(2) + " KB";
        return `
          <tr>
            <td><code>#${s.id}</code></td>
            <td style="font-weight: 700; color: #ffffff;">${s.name}</td>
            <td><code>${payloadSize}</code></td>
            <td><span class="badge ${isActive ? 'badge-green' : 'badge-inactive'}">${isActive ? '🟢 ACTIVE' : '⚪ SAVED'}</span></td>
            <td style="font-size:12px; color:#94a3b8;">${new Date(s.updated_at).toLocaleString()}</td>
            <td style="display: flex; gap: 0.4rem;">
              ${!isActive ? `
                <form action="/admin/select-script" method="POST" style="margin:0;">
                  <input type="hidden" name="script_id" value="${s.id}" />
                  <button type="submit" class="btn-action btn-copy">⚡ Set Active</button>
                </form>
              ` : '<span style="color:var(--neon-green); font-size:12px; font-weight:bold;">Active Target</span>'}
              <form action="/admin/delete-script" method="POST" onsubmit="return confirm('Delete this saved script?');" style="margin:0;">
                <input type="hidden" name="script_id" value="${s.id}" />
                <button type="submit" class="btn-action btn-danger">🗑️ Delete</button>
              </form>
            </td>
          </tr>
        `;
      }).join('');

      // Script Selection Options for Key Generator Dropdown
      let scriptOptions = scripts.map(s => {
        return `<option value="${s.id}" ${s.id === activeScriptId ? 'selected' : ''}>${s.name} ${s.id === activeScriptId ? '(Active)' : ''}</option>`;
      }).join('');

      res.type("text/html").send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>⚡ ZENITSU VIP CONTROL PANEL ⚡</title>
          <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@600;900&family=Rajdhani:wght@500;700&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
          <style>
            :root {
              --bg-dark: #020912;
              --card-bg: rgba(10, 25, 47, 0.85);
              --neon-blue: #00e5ff;
              --neon-green: #00ff88;
              --text-dark: #0a2540;
              --border-blue: rgba(0, 229, 255, 0.3);
            }
            * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Rajdhani', sans-serif; transition: all 0.2s ease; }
            body { background-color: var(--bg-dark); color: #e6f1ff; padding: 30px 15px; min-height: 100vh; }
            .container { max-width: 1100px; margin: 0 auto; }
            header { text-align: center; margin-bottom: 35px; }
            h1 { font-family: 'Orbitron', sans-serif; font-size: 2.2rem; font-weight: 900; background: linear-gradient(135deg, var(--neon-green), var(--neon-blue)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; text-shadow: 0 0 25px rgba(0, 229, 255, 0.4); }
            .status-bar { margin-top: 10px; font-family: 'JetBrains Mono', monospace; font-size: 13px; color: var(--neon-green); }
            .stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 30px; }
            .stat-card { background: var(--card-bg); border: 1px solid var(--border-blue); padding: 20px; border-radius: 14px; text-align: center; backdrop-filter: blur(10px); }
            .stat-card h3 { font-family: 'Orbitron', sans-serif; font-size: 0.85rem; color: var(--neon-blue); }
            .stat-card p { font-family: 'Orbitron', sans-serif; font-size: 2rem; font-weight: 900; color: var(--neon-green); margin-top: 5px; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
            .card { background: var(--card-bg); border: 1px solid var(--border-blue); border-radius: 16px; padding: 25px; margin-bottom: 25px; backdrop-filter: blur(10px); box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
            .card h2 { font-family: 'Orbitron', sans-serif; font-size: 1.1rem; color: var(--neon-green); margin-bottom: 18px; border-bottom: 1px solid rgba(0, 255, 136, 0.2); padding-bottom: 8px; display: flex; justify-content: space-between; align-items: center; }
            label { display: block; font-size: 0.85rem; font-weight: 700; color: var(--neon-blue); margin-top: 10px; margin-bottom: 5px; text-transform: uppercase; }
            input[type="text"], select, textarea, input[type="file"] { width: 100%; padding: 12px; background: rgba(2, 9, 18, 0.9); border: 1px solid var(--border-blue); border-radius: 8px; color: #fff; font-size: 14px; outline: none; }
            textarea { font-family: 'JetBrains Mono', monospace; height: 120px; resize: vertical; color: var(--neon-green); }
            input:focus, select:focus, textarea:focus { border-color: var(--neon-green); box-shadow: 0 0 10px rgba(0, 255, 136, 0.3); }
            .btn { width: 100%; padding: 14px; margin-top: 15px; background: linear-gradient(135deg, var(--neon-green), var(--neon-blue)); border: none; border-radius: 8px; color: var(--text-dark); font-family: 'Orbitron', sans-serif; font-weight: 900; font-size: 14px; cursor: pointer; text-transform: uppercase; }
            .btn:hover { transform: translateY(-2px); box-shadow: 0 5px 20px rgba(0, 229, 255, 0.4); }
            .btn-action { padding: 6px 12px; font-size: 12px; font-weight: 700; border-radius: 6px; cursor: pointer; border: none; }
            .btn-copy { background: rgba(0, 229, 255, 0.15); color: var(--neon-blue); border: 1px solid var(--neon-blue); }
            .btn-copy:hover { background: var(--neon-blue); color: var(--text-dark); }
            .btn-danger { background: rgba(255, 42, 95, 0.15); color: #ff2a5f; border: 1px solid #ff2a5f; }
            .btn-danger:hover { background: #ff2a5f; color: #fff; }
            .table-responsive { overflow-x: auto; border-radius: 10px; border: 1px solid var(--border-blue); }
            table { width: 100%; border-collapse: collapse; font-size: 14px; }
            th, td { padding: 12px 15px; text-align: left; border-bottom: 1px solid rgba(0, 229, 255, 0.1); }
            th { background: rgba(5, 15, 30, 0.95); font-family: 'Orbitron', sans-serif; color: var(--neon-blue); font-size: 11px; }
            code { font-family: 'JetBrains Mono', monospace; font-size: 13px; }
            .badge { padding: 4px 10px; border-radius: 12px; font-family: 'Orbitron', sans-serif; font-size: 10px; font-weight: 700; }
            .badge-green { background: rgba(0, 255, 136, 0.15); color: var(--neon-green); border: 1px solid var(--neon-green); }
            .badge-red { background: rgba(255, 42, 95, 0.15); color: #ff2a5f; border: 1px solid #ff2a5f; }
            .badge-inactive { background: rgba(148, 163, 184, 0.15); color: #94a3b8; border: 1px solid #64748b; }
            @media (max-width: 768px) { .grid, .stats-grid { grid-template-columns: 1fr; } }
          </style>
          <script>
            function copyToClipboard(text) {
              navigator.clipboard.writeText(text).then(() => alert("📋 Copied VIP Key: " + text));
            }
          </script>
        </head>
        <body>
          <div class="container">
            <header>
              <h1>⚡ ZENITSU VIP CONTROL PANEL ⚡</h1>
              <div class="status-bar">🟢 Server Active & Running | Persistent Storage Sync</div>
            </header>

            <div class="stats-grid">
              <div class="stat-card">
                <h3>📦 Saved Scripts</h3>
                <p>${scripts.length}</p>
              </div>
              <div class="stat-card">
                <h3>🔑 Total Licenses</h3>
                <p>${keys.length}</p>
              </div>
              <div class="stat-card">
                <h3>🟢 Active VIP Keys</h3>
                <p>${activeKeysCount}</p>
              </div>
            </div>

            <!-- SAVED SCRIPTS MANAGEMENT TABLE -->
            <div class="card">
              <h2>📦 Saved Scripts Library</h2>
              <div class="table-responsive">
                <table>
                  <thead>
                    <tr>
                      <th>Script ID</th>
                      <th>Script Name</th>
                      <th>Size</th>
                      <th>Status</th>
                      <th>Upload Date</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${scriptRows || '<tr><td colspan="6" style="text-align:center; color: var(--neon-blue);">No scripts saved yet. Upload or write one below!</td></tr>'}
                  </tbody>
                </table>
              </div>
            </div>

            <div class="grid">
              <!-- Create Key Section -->
              <div class="card">
                <h2>🔑 Generate VIP Access Key</h2>
                <form action="/admin/create-key" method="POST">
                  <div>
                    <label>Target Saved Script:</label>
                    <select name="script_id">
                      ${scriptOptions || '<option value="">Default Script</option>'}
                    </select>
                  </div>
                  <div>
                    <label>Custom License Key (Optional):</label>
                    <input type="text" name="custom_code" placeholder="Leave blank for auto-generate (ZENITSU-XXX)" />
                  </div>
                  <div>
                    <label>Key Duration:</label>
                    <select name="duration">
                      <option value="1">⚡ 1 Day Access</option>
                      <option value="7">⚡ 7 Days Access</option>
                      <option value="30" selected>🔥 30 Days (1 Month)</option>
                      <option value="365">💎 365 Days (1 Year)</option>
                      <option value="0">👑 Lifetime Access</option>
                    </select>
                  </div>
                  <button type="submit" class="btn">✨ Generate License Key</button>
                </form>
              </div>

              <!-- Upload / Save Script Section -->
              <div class="card">
                <h2>📤 Upload & Save New Script</h2>

                <form action="/admin/upload-script-file" method="POST" enctype="multipart/form-data">
                  <label>📁 Upload File (.lua / .txt):</label>
                  <input type="file" name="script_file" accept=".lua,.txt" required />
                  <button type="submit" class="btn" style="background: linear-gradient(135deg, var(--neon-blue), #0055ff); color:#fff; margin-top:8px;">📤 Upload & Save Script</button>
                </form>

                <hr style="border-color: rgba(0, 229, 255, 0.2); margin: 15px 0;" />

                <form action="/admin/update-script" method="POST">
                  <label>Script Title / Name:</label>
                  <input type="text" name="script_name" placeholder="e.g. Township Auto Farm v2" required />
                  <label>Lua Code Contents:</label>
                  <textarea name="lua_script" placeholder="Paste Lua Script Content..." required>${activeScriptContent}</textarea>
                  <button type="submit" class="btn">💾 Save New Script Payload</button>
                </form>
              </div>
            </div>

            <!-- Key Management Table -->
            <div class="card">
              <h2>
                <span>📊 Active VIP License Keys</span>
                <form action="/admin/delete-all-keys" method="POST" onsubmit="return confirm('WARNING: Delete ALL license keys?');" style="margin:0; display:inline;">
                  <button type="submit" class="btn-action btn-danger">⚠️ Delete All Keys</button>
                </form>
              </h2>
              <div class="table-responsive">
                <table>
                  <thead>
                    <tr>
                      <th>Key Code</th>
                      <th>Linked Script</th>
                      <th>Bound Device (HWID)</th>
                      <th>Status</th>
                      <th>Expiration</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${keyRows || '<tr><td colspan="6" style="text-align:center; color: var(--neon-blue);">No license keys generated yet.</td></tr>'}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </body>
        </html>
      `);
    });
  });
});

// ==========================================
// 2. ADMIN ACTIONS
// ==========================================

// Create Key Action
app.post('/admin/create-key', (req, res) => {
  const customCode = req.body.custom_code ? req.body.custom_code.trim() : "";
  const durationDays = parseInt(req.body.duration) || 30;
  const scriptId = parseInt(req.body.script_id) || null;

  const code = customCode !== "" ? customCode : "ZENITSU-" + Math.random().toString(36).substring(2, 10).toUpperCase();
  const expiresAt = durationDays === 0 ? 0 : Math.floor(Date.now() / 1000) + (durationDays * 86400);

  db.run(
    "INSERT INTO keys (code, script_id, duration_days, expires_at, bound_device, max_devices, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [code, scriptId, durationDays, expiresAt, null, 1, new Date().toISOString()],
    () => res.redirect('/')
  );
});

// Set Selected Script Active
app.post('/admin/select-script', (req, res) => {
  const scriptId = parseInt(req.body.script_id);
  if (!scriptId) return res.redirect('/');

  db.serialize(() => {
    db.run("UPDATE scripts SET is_active = 0", []);
    db.run("UPDATE scripts SET is_active = 1 WHERE id = ?", [scriptId], () => {
      res.redirect('/');
    });
  });
});

// Delete Saved Script
app.post('/admin/delete-script', (req, res) => {
  const scriptId = parseInt(req.body.script_id);
  if (!scriptId) return res.redirect('/');

  db.run("DELETE FROM scripts WHERE id = ?", [scriptId], () => {
    // If deleted script was active, make the most recent one active
    db.get("SELECT id FROM scripts WHERE is_active = 1", [], (err, row) => {
      if (!row) {
        db.run("UPDATE scripts SET is_active = 1 WHERE id = (SELECT id FROM scripts ORDER BY id DESC LIMIT 1)");
      }
      res.redirect('/');
    });
  });
});

// Delete Key Action
app.post('/admin/delete-key', (req, res) => {
  db.run("DELETE FROM keys WHERE code = ?", [req.body.code], () => {
    res.redirect('/');
  });
});

// Delete All Keys Action
app.post('/admin/delete-all-keys', (req, res) => {
  db.run("DELETE FROM keys", [], () => {
    res.redirect('/');
  });
});

// Save Script Action (Text Editor)
app.post('/admin/update-script', (req, res) => {
  const scriptName = req.body.script_name ? req.body.script_name.trim() : "Custom Editor Payload";
  const content = req.body.lua_script;

  if (content) {
    db.serialize(() => {
      db.run("UPDATE scripts SET is_active = 0", []);
      db.run(
        "INSERT INTO scripts (name, content, is_active, updated_at) VALUES (?, ?, 1, ?)",
        [scriptName, content, new Date().toISOString()],
        () => res.redirect('/')
      );
    });
  } else {
    res.redirect('/');
  }
});

// Upload Script File Action (.lua / .txt)
app.post('/admin/upload-script-file', upload.single('script_file'), (req, res) => {
  if (!req.file) return res.redirect('/');

  const fileName = req.file.originalname;
  const content = req.file.buffer.toString('utf8').replace(/^\uFEFF/, '');

  db.serialize(() => {
    db.run("UPDATE scripts SET is_active = 0", []);
    db.run(
      "INSERT INTO scripts (name, content, is_active, updated_at) VALUES (?, ?, 1, ?)",
      [fileName, content, new Date().toISOString()],
      () => res.redirect('/')
    );
  });
});

// ==========================================
// 3. GAMEGUARDIAN LOADER ENDPOINTS
// ==========================================

app.get('/gg/probe', (req, res) => {
  res.status(200).send("OK");
});

app.post('/gg/activate', (req, res) => {
  const code = req.body.code;
  const device = req.body.device;

  if (!code || !device) {
    return res.type("text/plain").send("status=ERROR\nreason=missing_parameters");
  }

  db.get("SELECT * FROM keys WHERE code = ?", [code], (err, keyData) => {
    if (err || !keyData) {
      return res.type("text/plain").send("status=ERROR\nreason=invalid_key");
    }

    const currentTime = Math.floor(Date.now() / 1000);
    if (keyData.expires_at !== 0 && keyData.expires_at < currentTime) {
      return res.type("text/plain").send("status=ERROR\nreason=expired");
    }

    if (keyData.bound_device && keyData.bound_device !== device) {
      return res.type("text/plain").send("status=ERROR\nreason=device_mismatch");
    }

    if (!keyData.bound_device) {
      db.run("UPDATE keys SET bound_device = ? WHERE code = ?", [device, code]);
    }

    const host = req.get('host');
    const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
    const ticketUrl = `${protocol}://${host}/gg/payload?token=AUTHORIZED_TOKEN_${code}`;

    const responseBody = [
      "status=OK",
      `ticket_url=${ticketUrl}`,
      `expires_at=${keyData.expires_at}`,
      "total_devices=1",
      "max_devices=1",
      `client_id=${device}`
    ].join("\n");

    res.type("text/plain").send(responseBody);
  });
});

app.get('/gg/payload', (req, res) => {
  const token = req.query.token;

  if (!token || !token.startsWith("AUTHORIZED_TOKEN_")) {
    return res.status(403).type("text/plain").send("Unauthorized request.");
  }

  const code = token.replace("AUTHORIZED_TOKEN_", "");

  db.get("SELECT script_id FROM keys WHERE code = ?", [code], (err, keyRow) => {
    let scriptQuery = "SELECT content FROM scripts WHERE is_active = 1 LIMIT 1";
    let params = [];

    if (keyRow && keyRow.script_id) {
      scriptQuery = "SELECT content FROM scripts WHERE id = ?";
      params = [keyRow.script_id];
    }

    db.get(scriptQuery, params, (err, row) => {
      if (err || !row) {
        db.get("SELECT content FROM scripts ORDER BY id DESC LIMIT 1", [], (err, fallbackRow) => {
          if (!fallbackRow) return res.type("text/plain").send("gg.alert('No script found on server.')");
          res.type("text/plain").send(fallbackRow.content);
        });
      } else {
        res.type("text/plain").send(row.content);
      }
    });
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
