const express = require('express');
const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Disable HTTP caching globally
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

// Mock Key Database (Replace or connect with your SQLite database)
const KEYS_DB = {
  "VIP-KEY-12345": {
    expires_at: Math.floor(Date.now() / 1000) + (86400 * 30), // 30 Days
    bound_device: null,
    max_devices: 1
  }
};

// 0. Root Route (Fixes "Cannot GET /")
app.get('/', (req, res) => {
  res.type("text/html").send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>VIP Panel Status</title>
        <style>
          body { font-family: sans-serif; background: #0f172a; color: #f8fafc; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
          .card { background: #1e293b; padding: 2rem; border-radius: 12px; text-align: center; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
          .status { color: #22c55e; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>⚡ VIP Panel Server</h2>
          <p>Status: <span class="status">ONLINE & ACTIVE 🟢</span></p>
        </div>
      </body>
    </html>
  `);
});

// 1. Connection Probe Route
app.get('/gg/probe', (req, res) => {
  res.status(200).send("OK");
});

// 2. Key Activation Route (Returns Key-Value Format)
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

  // Check key expiration
  const currentTime = Math.floor(Date.now() / 1000);
  if (keyData.expires_at < currentTime) {
    return res.type("text/plain").send("status=ERROR\nreason=expired");
  }

  // Device binding check
  if (keyData.bound_device && keyData.bound_device !== device) {
    return res.type("text/plain").send("status=ERROR\nreason=device_mismatch");
  }

  // Bind device on first activation
  if (!keyData.bound_device) {
    keyData.bound_device = device;
  }

  // Return key-value string response expected by loader
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

// 3. Payload Fetch Route
app.get('/gg/payload', (req, res) => {
  const token = req.query.token;

  if (!token || !token.startsWith("AUTHORIZED_TOKEN_")) {
    return res.status(403).type("text/plain").send("Unauthorized request.");
  }

  // Plain Lua payload
  const luaScript = `
gg.toast("⚡ VIP Script Loaded Successfully!")
gg.alert("Welcome to Township VIP Script!")
  `;

  res.type("text/plain").send(luaScript);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
