# NetScope – Selenium Chrome Security Testing Tool

**NetScope** is a professional desktop security testing application that combines **Selenium WebDriver-controlled Google Chrome**, Chrome DevTools-style inspection (Console, DOM Elements, Sources, Storage, Security), and Burp Suite-style HTTP/HTTPS interception, request/response editing, and repeater capabilities.

---

## 1. Architecture Overview

```
 ┌───────────────────────────────────────────────────────────────┐
 │                   NetScope Desktop UI                         │
 │   (Electron + React 19 + TypeScript + Vite + Tailwind CSS)    │
 ├───────────────────────────────┬───────────────────────────────┤
 │     Selenium Google Chrome    │     Inspection Workspace      │
 │  (Separate Window or Embed)   │  - Live Network (DevTools)   │
 │   Controlled via WebDriver    │  - Intercept (Burp Suite)     │
 │   Dedicated Profile Dir       │  - Response Intercept         │
 │   CDP Debugger Port 9222      │  - HTTP Repeater (Multi-tab)  │
 │                               │  - Persistent SQLite History  │
 │                               │  - Elements, Console, Sources │
 │                               │  - Decoder & Scope Manager    │
 └──────────────┬────────────────┴───────────────┬───────────────┘
                │ Proxy: 127.0.0.1:8080          │
                ▼                                │
 ┌───────────────────────────────┐               │ WebSocket IPC
 │    Mitmproxy Python Engine    │◄──────────────┘
 │   (mitmdump + addon.py)       │
 └──────────────┬────────────────┘
                ▼
      Target Web Applications (HTTP & HTTPS)
```

### Key Subsystems:
- **Selenium Chrome Controller**: Spawns a real separate Google Chrome browser window using Selenium WebDriver (`proxy/chrome_launcher.py`), configured with `--proxy-server=http://127.0.0.1:8080`, `--ignore-certificate-errors`, and an isolated testing user-data profile.
- **Interception Engine**: Real-time traffic interception powered by Python `mitmproxy` and a custom addon (`proxy/addon.py`) communicating over an authenticated loopback WebSocket IPC channel.
- **Chrome DevTools Protocol (CDP)**: Direct debugger connection for live DOM inspection, computed CSS styles, console log interception, and script sources.
- **Data Persistence**: Persistent SQLite database storing full HTTP request/response histories, target scopes, and repeater states with parameterized queries.

---

## 2. Requirements

- **Node.js**: v20+ 
- **npm**: v10+
- **Python**: v3.11+ with `mitmproxy` and `selenium` installed (`pip install -r requirements.txt`)
- **Google Chrome**: Installed on Windows (default location: `C:\Program Files\Google\Chrome\Application\chrome.exe`)

---

## 3. Quick Start

### ⚡ One-Step Full Setup (Recommended)
Run the automated installer script to install all Node.js and Python dependencies and build the app:
```bash
bash req.txt
```
*(On Windows Command Prompt without bash, you can also run `install.bat`)*

---

### Or Manual Step-by-Step Installation:

#### Step 1: Install Node Dependencies
```bash
npm install
```

#### Step 2: Install Python Proxy & Selenium Requirements
```bash
pip install -r requirements.txt
```

### Step 3: Run the Test Server
In a separate terminal, launch the local target test server:
```bash
npm run mock-server
```
*(Starts at `http://127.0.0.1:4000` with interactive GET, POST, cookies, and redirect endpoints)*

### Step 4: Run the Application
```bash
npm run build
npm start
```
*(Or `npm run dev` for Vite hot-reloading)*

### Step 5: Click "Launch Chrome"
Inside NetScope, click the prominent **"Launch Chrome"** button in the top navigation bar. NetScope will:
1. Automatically start the local mitmproxy on port 8080.
2. Launch a real Google Chrome browser window with Selenium WebDriver configured with the proxy and certificate bypass flags.
3. Capture every HTTP and HTTPS request/response across all tabs in real-time inside the NetScope inspection panels.

---

## 4. HTTPS Certificate Authority Setup (Windows)

To intercept and inspect HTTPS traffic without browser security warnings:

1. Start NetScope (or start mitmproxy once) to initialize the local Certificate Authority.
2. The certificate is stored at:
   ```
   %USERPROFILE%\.mitmproxy\mitmproxy-ca-cert.cer
   ```
3. Install and trust it in the Windows Current User Root store:
   ```powershell
   certutil -addstore -user Root "%USERPROFILE%\.mitmproxy\mitmproxy-ca-cert.cer"
   ```
4. Alternatively, open **Settings & Scope** in the application to copy the exact command with a single click.

---

## 5. Inspection Panels Guide

| Panel | Description |
|---|---|
| **Network** | Real-time DevTools-style traffic table with live filtering by resource type, method, status, search, and detailed drawer with raw headers and payloads. |
| **Intercept** | Burp Suite-style request interception. Pause incoming requests, modify methods, URLs, headers, and bodies before forwarding. |
| **Responses** | Pause and edit server responses before they reach the embedded browser. |
| **Repeater** | Multi-tab HTTP repeater tool with syntax highlighting, latency timing, and target scope enforcement. |
| **HTTP History** | Persistent SQLite search engine with full-text search across URLs and request/response bodies, plus CSV/JSON exports. |
| **Console** | Real-time browser console viewer capturing `console.log`, warnings, errors, and uncaught exceptions. |
| **Elements** | Live interactive DOM tree inspector with computed CSS styles and tag selector copying. |
| **Sources** | Inspection of all loaded client-side JavaScript scripts. |
| **Application** | Storage inspector for cookies, `localStorage`, and `sessionStorage`. |
| **Security** | TLS status and automated security headers audit (CSP, HSTS, X-Content-Type-Options, etc.). |
| **Decoder** | Encode, decode, format, and hash strings (URL, Base64, Hex, HTML, JSON, SHA-256, SHA-1). |
| **Settings & Scope** | Target domain whitelisting, strict scope enforcement, proxy status, and automated HTML report generation. |

---

## 6. Keyboard Shortcuts

- `Ctrl + L`: Focus the address bar
- `Ctrl + R` / `F5`: Reload active browser tab
- `Ctrl + Shift + N`: Open a new browser tab
- `Ctrl + W`: Close current tab
- `Ctrl + Shift + I`: Toggle embedded browser window visibility

---

## 7. Automated Testing

NetScope includes an automated test suite verifying server endpoints, pattern matching, database migrations, decoder transformations, header recalculations, and proxy addon syntax.

Run all tests:
```bash
npm test
```

---

## 8. Production Packaging

To compile and package the Windows installer and portable binary:
```bash
npm run build
npx electron-builder
```
The output installers will be generated in `dist/release/`.

---

## 9. Troubleshooting

- **Port Conflict (Port 8080 in use)**:
  Change the proxy port in the top navigation or via Settings.
- **Python / mitmproxy not found**:
  Verify Python is in your PATH (`py --version` or `python --version`) and mitmproxy is installed (`pip install mitmproxy`).
- **HTTPS Certificate Warnings**:
  Execute `certutil -addstore -user Root "%USERPROFILE%\.mitmproxy\mitmproxy-ca-cert.cer"` in PowerShell.
