const express = require('express');
const multer  = require('multer');
const sqlite3 = require('sqlite3').verbose();

const app = express();
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
// SQLITE DATABASE SETUP (Persistent Storage)
// ==========================================
const db = new sqlite3.Database('./dashboard.db', (err) => {
  if (err) console.error("Database connection error:", err);
  else console.log("Connected to SQLite Database.");
});

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS keys (
      code TEXT PRIMARY KEY,
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
      updated_at TEXT
    )
  `);

  // Default script if empty
  db.get("SELECT COUNT(*) as count FROM scripts", (err, row) => {
    if (row && row.count === 0) {
      db.run(
        "INSERT INTO scripts (name, content, updated_at) VALUES (?, ?, ?)",
        ["Default Payload", 'gg.toast("⚡ VIP Script Loaded Successfully!")\ngg.alert("Welcome to Township VIP Script!")', new Date().toISOString()]
      );
    }
  });
});

// ==========================================
// 1. ADMIN DASHBOARD ROUTE (WEB PANEL UI)
// ==========================================
app.get('/', (req, res) => {
  db.all("SELECT * FROM keys ORDER BY created_at DESC", [], (err, keys) => {
    if (err) keys = [];
    db.get("SELECT * FROM scripts ORDER BY id DESC LIMIT 1", [], (err, script) => {
      const activeScript = script ? script.content : "";
      const scriptName = script ? script.name : "None";
      const currentTime = Math.floor(Date.now() / 1000);

      let keyRows = keys.map(k => {
        const isExpired = k.expires_at !== 0 && k.expires_at < currentTime;
        const expDate = k.expires_at === 0 ? "Lifetime" : new Date(k.expires_at * 1000).toLocaleString();
        return `
          <tr>
            <td style="font-family: monospace; font-weight: bold; color: #38bdf8;">${k.code}</td>
            <td>${k.bound_device || '<span style="color: #94a3b8;">Unbound</span>'}</td>
            <td><span class="badge ${isExpired ? 'badge-red' : 'badge-green'}">${isExpired ? 'EXPIRED' : 'ACTIVE'}</span></td>
            <td>${expDate}</td>
            <td style="display: flex; gap: 0.5rem; align-items: center;">
              <button type="button" class="btn-copy" onclick="copyToClipboard('${k.code}')">Copy</button>
              <form action="/admin/delete-key" method="POST" style="display:inline; margin:0;">
                <input type="hidden" name="code" value="${k.code}" />
                <button type="submit" class="btn-danger">Delete</button>
              </form>
            </td>
          </tr>
        `;
      }).join('');

      res.type("text/html").send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>VIP Admin Panel</title>
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; padding: 2rem; }
            .container { max-width: 1100px; margin: 0 auto; }
            header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; border-bottom: 1px solid #334155; padding-bottom: 1rem; }
            h1 { color: #38bdf8; font-size: 1.8rem; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-bottom: 2rem; }
            .card { background: #1e293b; border: 1px solid #334155; padding: 1.5rem; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
            .card h2 { font-size: 1.2rem; color: #cbd5e1; margin-bottom: 1rem; border-bottom: 1px solid #334155; padding-bottom: 0.5rem; display: flex; justify-content: space-between; align-items: center; }
            form { display: flex; flex-direction: column; gap: 1rem; }
            label { font-size: 0.9rem; color: #94a3b8; margin-bottom: 0.2rem; display: block; }
            input, select, textarea { width: 100%; padding: 0.75rem; background: #0f172a; border: 1px solid #334155; color: #fff; border-radius: 6px; font-size: 0.95rem; }
            textarea { font-family: monospace; height: 140px; resize: vertical; }
            button { background: #0284c7; color: white; border: none; padding: 0.75rem 1.25rem; border-radius: 6px; cursor: pointer; font-weight: 600; transition: background 0.2s; }
            button:hover { background: #0369a1; }
            .btn-success { background: #16a34a; }
            .btn-success:hover { background: #15803d; }
            .btn-danger { background: #ef4444; padding: 0.4rem 0.8rem; font-size: 0.8rem; }
            .btn-danger:hover { background: #dc2626; }
            .btn-copy { background: #334155; color: #f8fafc; padding: 0.4rem 0.8rem; font-size: 0.8rem; border-radius: 4px; }
            .btn-copy:hover { background: #475569; }
            table { width: 100%; border-collapse: collapse; margin-top: 1rem; text-align: left; }
            th, td { padding: 0.75rem; border-bottom: 1px solid #334155; font-size: 0.9rem; }
            th { color: #94a3b8; font-weight: 600; background: #0f172a; }
            .badge { padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: bold; }
            .badge-green { background: #166534; color: #4ade80; }
            .badge-red { background: #991b1b; color: #fca5a5; }
            .status-dot { height: 10px; width: 10px; background-color: #22c55e; border-radius: 50%; display: inline-block; margin-right: 6px; }
            .file-upload-box { border: 2px dashed #334155; padding: 1rem; text-align: center; border-radius: 6px; background: #0f172a; cursor: pointer; }
            .file-upload-box:hover { border-color: #0284c7; }
          </style>
          <script>
            function copyToClipboard(text) {
              navigator.clipboard.writeText(text).then(() => {
                alert("Copied key: " + text);
              });
            }
          </script>
        </head>
        <body>
          <div class="container">
            <header>
              <h1>⚡ VIP Script Control Panel</h1>
              <div><span class="status-dot"></span> Server Active</div>
            </header>

            <div class="grid">
              <!-- Create Key Section -->
              <div class="card">
                <h2>🔑 Generate License Key</h2>
                <form action="/admin/create-key" method="POST">
                  <div>
                    <label>Custom Key Code (Optional):</label>
                    <input type="text" name="custom_code" placeholder="Leave blank to auto-generate" />
                  </div>
                  <div>
                    <label>Key Duration:</label>
                    <select name="duration">
                      <option value="1">1 Day</option>
                      <option value="7">7 Days</option>
                      <option value="30" selected>30 Days</option>
                      <option value="365">1 Year</option>
                      <option value="0">Lifetime</option>
                    </select>
                  </div>
                  <button type="submit">Generate VIP Key</button>
                </form>
              </div>

              <!-- Script Management Section -->
              <div class="card">
                <h2>
                  <span>📜 Manage Remote Script</span>
                  <span style="font-size: 0.8rem; color: #38bdf8;">Active: ${scriptName}</span>
                </h2>

                <!-- Direct Upload Section -->
                <form action="/admin/upload-script-file" method="POST" enctype="multipart/form-data" style="margin-bottom: 1rem;">
                  <label>📁 Upload New Lua File (.lua):</label>
                  <div style="display: flex; gap: 0.5rem;">
                    <input type="file" name="script_file" accept=".lua,.txt" required style="padding: 0.4rem;" />
                    <button type="submit" class="btn-success" style="white-space: nowrap;">Upload Script</button>
                  </div>
                </form>

                <hr style="border-color: #334155; margin: 0.5rem 0 1rem 0;" />

                <!-- Text Mode -->
                <form action="/admin/update-script" method="POST">
                  <div>
                    <label>Or Edit Code Directly:</label>
                    <textarea name="lua_script">${activeScript}</textarea>
                  </div>
                  <button type="submit">Save Editor Changes</button>
                </form>
              </div>
            </div>

            <!-- Key Management Table -->
            <div class="card">
              <h2>
                <span>📊 Active VIP License Keys (${keys.length})</span>
                <form action="/admin/delete-all-keys" method="POST" onsubmit="return confirm('Are you sure you want to delete ALL keys?');" style="margin:0; display:inline;">
                  <button type="submit" class="btn-danger">Delete All Keys</button>
                </form>
              </h2>
              <table>
                <thead>
                  <tr>
                    <th>License Key</th>
                    <th>Bound Device ID</th>
                    <th>Status</th>
                    <th>Expiration</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${keyRows || '<tr><td colspan="5" style="text-align:center; color:#94a3b8;">No license keys found. Generate one above!</td></tr>'}
                </tbody>
              </table>
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

  const code = customCode !== "" ? customCode : "VIP-" + Math.random().toString(36).substring(2, 10).toUpperCase();
  const expiresAt = durationDays === 0 ? 0 : Math.floor(Date.now() / 1000) + (durationDays * 86400);

  db.run(
    "INSERT INTO keys (code, duration_days, expires_at, bound_device, max_devices, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    [code, durationDays, expiresAt, null, 1, new Date().toISOString()],
    () => res.redirect('/')
  );
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

// Update Script Action (Text Editor)
app.post('/admin/update-script', (req, res) => {
  if (req.body.lua_script) {
    db.run(
      "INSERT INTO scripts (name, content, updated_at) VALUES (?, ?, ?)",
      ["Text Editor Paste", req.body.lua_script, new Date().toISOString()],
      () => res.redirect('/')
    );
  } else {
    res.redirect('/');
  }
});

// Upload Script File Action (.lua)
app.post('/admin/upload-script-file', upload.single('script_file'), (req, res) => {
  if (!req.file) return res.redirect('/');

  const fileName = req.file.originalname;
  const content = req.file.buffer.toString('utf8');

  db.run(
    "INSERT INTO scripts (name, content, updated_at) VALUES (?, ?, ?)",
    [fileName, content, new Date().toISOString()],
    () => res.redirect('/')
  );
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

  db.get("SELECT content FROM scripts ORDER BY id DESC LIMIT 1", [], (err, row) => {
    if (err || !row) {
      return res.type("text/plain").send("gg.alert('No script found on server.')");
    }
    res.type("text/plain").send(row.content);
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
