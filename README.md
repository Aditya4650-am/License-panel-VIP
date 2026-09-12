## 🛡️ License Panel VIP

A high-performance, full-stack license management and activation system engineered for modern web applications, SaaS platforms, and software distribution control. **License Panel VIP** provides a secure administrative dashboard, client key verification API, and interactive control panel.

---
## DEVELOPED BY AM TECH.
## ✨ Features

- 🔑 **License Key Generation & Management**: Create, extend, revoke, and inspect multi-tier activation keys with custom expiration dates and dynamic seat limits.
- ⚡ **Real-Time Activation API**: Express/Node.js backend endpoints for high-throughput, low-latency validation from client software.
- 🖥️ **Interactive Web Dashboard**: Intuitive frontend interface built for system administrators to track active sessions, system logs, and user permissions.
- 🔒 **Role-Based Access & Security**: Secure user session handling with encrypted token validation and protected admin endpoints.
- 📊 **Analytics & Telemetry**: Monitor key usage, device hardware IDs (HWID binding), and activation geography in real time.

---

## 🏗️ Project Architecture

```
License-panel-VIP/
├── public/              # Static frontend assets & client interface
│   └── index.html       # Web dashboard entry point
├── server.js            # Node.js / Express backend server & API routes
├── package.json         # Node.js dependencies and scripts
└── README.md            # Project documentation
```

---

## 🚀 Quick Start Guide

### Prerequisites

Ensure you have the following installed on your system:
- **Node.js**: v14.x or higher
- **npm**: v6.x or higher (or `yarn` / `pnpm`)

### 1. Installation

Clone the repository and install the required dependencies:

```bash
git clone [https://github.com/your-username/License-panel-VIP.git](https://github.com/your-username/License-panel-VIP.git)
cd License-panel-VIP
npm install
```

### 2. Environment Configuration

Create a `.env` file in the root directory and set your environment variables:

```env
PORT=3000
NODE_ENV=development
JWT_SECRET=your_super_secret_jwt_key
DATABASE_URL=your_database_connection_string
```

### 3. Running the Application

#### **Development Mode**
Starts the server with auto-reloading enabled:
```bash
npm run dev
```

#### **Production Mode**
Starts the optimized production server:
```bash
npm start
```

Once running, access the dashboard at: **`http://localhost:3000`**

---

## 🔌 API Endpoints Overview

| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :---: |
| `POST` | `/api/license/verify` | Validate a license key and return status | ❌ |
| `POST` | `/api/license/activate` | Bind a license key to a specific device/HWID | ❌ |
| `GET` | `/api/admin/licenses` | Retrieve all generated license keys | ✅ |
| `POST` | `/api/admin/generate` | Generate new batch of license keys | ✅ |
| `DELETE` | `/api/admin/revoke/:id` | Instantly revoke an active license | ✅ |

---

## 🛠️ Tech Stack

- **Server Backend**: [Node.js](https://nodejs.org/) & [Express.js](https://expressjs.com/)
- **Frontend Panel**: HTML5, Modern CSS3 / Glassmorphism UI, JavaScript (ES6+)
- **Package Manager**: [npm](https://www.npmjs.com/)

---

## 📜 License

This project is released under the **MIT License**. Feel free to modify and distribute according to the license terms.
## ZENITSU491
