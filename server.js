const express = require('express');
const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Disable HTTP caching globally across GameGuardian & Browser requests
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

// In-Memory Database (Keys & Active Payload)
// Note: For permanent storage across Render restarts, connect this to SQLite or MongoDB.
let KEYS_DB = {
  "VIP-KEY-12345": {
    code: "VIP-KEY-12345",
    expires_at: Math.floor(Date.now() / 1000) + (86400 * 30), // 30 Days
    bound_device: null,
    max_devices: 1,
    created_at: new Date().toISOString()
  }
};

let CURRENT_LUA_SCRIPT = `
gg.toast("⚡ VIP Script Loaded Successfully!")
gg.alert("Welcome to Township VIP Script!")
`;

// ==========================================
// 1. ADMIN DASHBOARD ROUTE (WEB PANEL UI)
// ==========================================
app.get('/', (req, res) => {
  const activeKeysCount = Object.keys(KEYS_DB).length;
  
  let keyRows = Object.values(KEYS_DB).map(k => {
    const isExpired = k.expires_at < Math.floor(Date.now() / 1000);
    const expDate = k.expires_at === 0 ? "Lifetime" : new Date(k.expires_at * 1000).toLocaleString();
    return `
      <tr>
        <td style="font-family: monospace; font-weight: bold;">${k.code}</td>
        <td>${k.bound_device || '<span style="color: #94a3b8;">Unbound</span>'}</td>
        <td><span class="badge ${isExpired ? 'badge-red' : 'badge-green'}">${isExpired ? 'EXPIRED' : 'ACTIVE'}</span></td>
        <td>${expDate}</td>
        <td>
          <form action="/admin/delete-key" method="POST" style="display:inline;">
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
        .card h2 { font-size: 1.2rem; color: #cbd5e1; margin-bottom: 1rem; border-bottom: 1px solid #334155; padding-bottom: 0.5rem; }
        form { display: flex; flex-direction: column; gap: 1rem; }
        label { font-size: 0.9rem; color: #94a3b8; margin-bottom: 0.2rem; display: block; }
        input, select, textarea { width: 100%; padding: 0.75rem; background: #0f172a; border: 1px solid #334155; color: #fff; border-radius: 6px; font-size: 0.95rem; }
        textarea { font-family: monospace; height: 150px; resize: vertical; }
        button { background: #0284c7; color: white; border: none; padding: 0.75rem 1.25rem; border-radius: 6px; cursor: pointer; font-weight: 600; transition: background 0.2s; }
        button:hover { background: #0369a1; }
        .btn-danger { background: #ef4444; padding: 0.4rem 0.8rem; font-size: 0.8rem; }
        .btn-danger:hover { background: #dc2626; }
        table { width: 100%; border-collapse: collapse; margin-top: 1rem; text-align: left; }
        th, td { padding: 0.75rem; border-bottom: 1px solid #334155; font-size: 0.9rem; }
        th { color: #94a3b8; font-weight: 600; background: #0f172a; }
        .badge { padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: bold; }
        .badge-green { background: #166534; color: #4ade80; }
        .badge-red { background: #991b1b; color: #fca5a5; }
        .status-dot { height: 10px; width: 10px; background-color: #22c55e; border-radius: 50%; display: inline-block; margin-right: 6px; }
      </style>
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
            <h2>📜 Manage Remote Lua Script</h2>
            <form action="/admin/update-script" method="POST">
              <div>
                <label>Lua Payload (Executed directly in RAM):</label>
                <textarea name="lua_script">${CURRENT_LUA_SCRIPT}</textarea>
              </div>
              <button type="submit">Save Lua Script</button>
            </form>
          </div>
        </div>

        <!-- Key Management Table -->
        <div class="card">
          <h2>📊 Active VIP License Keys (${activeKeysCount})</h2>
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

// ==========================================
// 2. ADMIN ACTIONS (CREATE / DELETE / UPDATE)
// ==========================================

// Create Key Action
app.post('/admin/create-key', (req, res) => {
  const customCode = req.body.custom_code ? req.body.custom_code.trim() : "";
  const durationDays = parseInt(req.body.duration) || 30;

  const code = customCode !== "" ? customCode : "VIP-" + Math.random().toString(36).substring(2, 10).toUpperCase();
  const expiresAt = durationDays === 0 ? 0 : Math.floor(Date.now() / 1000) + (durationDays * 86400);

  KEYS_DB[code] = {
    code: code,
    expires_at: expiresAt,
    bound_device: null,
    max_devices: 1,
    created_at: new Date().toISOString()
  };

  res.redirect('/');
});

// Delete Key Action
app.post('/admin/delete-key', (req, res) => {
  const code = req.body.code;
  if (KEYS_DB[code]) {
    delete KEYS_DB[code];
  }
  res.redirect('/');
});

// Update Remote Script Action
app.post('/admin/update-script', (req, res) => {
  if (req.body.lua_script) {
    CURRENT_LUA_SCRIPT = req.body.lua_script;
  }
  res.redirect('/');
});

// ==========================================
// 3. GAMEGUARDIAN LOADER ENDPOINTS
// ==========================================

// Connection Probe Route
app.get('/gg/probe', (req, res) => {
  res.status(200).send("OK");
});

// Key Activation Route (Key-Value Format matching HUY loader)
app.post('/gg/activate', (req, res) => {
  const code = req.body.code;
  const device = req.body.device;

  if (!code || !device) {
    return res.type("text/plain").send("status=ERROR\nreason=missing_parameters");
  }

  const keyData = KEYS_DB[code];

  if (!keyData) {
    return res.type("text/plain").send("status=ERROR\nreason=invalid_key");
  }

  // Check key expiration (0 = Lifetime)
  const currentTime = Math.floor(Date.now() / 1000);
  if (keyData.expires_at !== 0 && keyData.expires_at < currentTime) {
    return res.type("text/plain").send("status=ERROR\nreason=expired");
  }

  // Device binding check
  if (keyData.bound_device && keyData.bound_device !== device) {
    return res.type("text/plain").send("status=ERROR\nreason=device_mismatch");
  }

  // Bind device on first use
  if (!keyData.bound_device) {
    keyData.bound_device = device;
  }

  // Generate ticket URL for payload download
  const ticketUrl = `https://my-vip-panel.onrender.com/gg/payload?token=AUTHORIZED_TOKEN_${code}`;
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

// Payload Delivery Route
app.get('/gg/payload', (req, res) => {
  const token = req.query.token;

  if (!token || !token.startsWith("AUTHORIZED_TOKEN_")) {
    return res.status(403).type("text/plain").send("Unauthorized request.");
  }

  res.type("text/plain").send(CURRENT_LUA_SCRIPT);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
