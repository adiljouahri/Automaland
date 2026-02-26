
# 3-Panel AI Automation App - Architecture & Implementation Guide

## 1. Project Overview & Architecture

**Goal:** Build a desktop application using **Tauri (Rust)**, **React**, and a **Node.js Sidecar**. The application replaces visual node graphs with a streamlined "Three Panel" execution model.

**The Three Panels:**
1.  **UI Panel:** Generates dynamic forms from JSON Schema. Acts as the input layer.
2.  **ExtendScript Panel:** Contains Adobe automation code (.jsx) executed via OS bridging.
3.  **Node.js Panel:** Contains server-side logic, API calls, file handling, and heavy processing.

**Core Workflow:**
*   Users chat with an **AI Architect** to generate code for all three panels.
*   **Triggers:** Flows can be triggered manually, by File Watchers, API Polling (Cron), or External HTTP Requests.
*   **State:** A shared state object is passed between the UI, Node.js logic, and ExtendScript.
*   **Grid Dashboard:** Flows can be viewed as cards in a dashboard. Each card exposes "Quick Actions" derived from the Node.js exports.

---

## 2. Technology Stack

*   **Frontend:** React, TailwindCSS, Zustand (State), Monaco Editor (Code Editing).
*   **Theme:** Supports **Light Mode** and **Dark Mode**.
*   **Desktop Wrapper:** Tauri (v1 or v2).
*   **Backend:** Node.js Express Server (bundled as a Tauri Sidecar).
*   **Security:** AES-256 Encryption for Environment Variables.
*   **Database:** `lowdb` (JSON file) or `sqlite3` for storing flows, history, and settings locally.

---

## 3. The Three Panels (Detailed Specification)

### Panel 1: UI Generation (Input)
*   **Input:** JSON Schema (Draft 7).
*   **Rendering:** Use `@rjsf/core` or a custom recursive renderer.
*   **Behavior:**
    *   When the flow starts, this form captures user input.
    *   These inputs are accessible in other panels as `triggerData` or `uiState`.
*   **AI Instruction:** AI generates valid JSON Schema based on user requirements (e.g., "Ask for a file and a text prompt").

### Panel 2: ExtendScript (Adobe Automation)
*   **Environment:** Adobe ExtendScript (ES3).
*   **Injected Helpers:**
    *   `_`: Underscore.js (polyfill for ES3).
    *   `LOGGER`: Global object with `.init(name)` and `.log(msg)`. Logs must stream back to the React UI.
    *   `ENV`: Object containing decrypted environment variables.
*   **Execution:**
    *   The Node.js Sidecar writes the code to a temporary `.jsx` file.
    *   **Mac:** Executes via `osascript -e 'tell application "Adobe Photoshop 2024" to do javascript file "..."'`.
    *   **Windows:** Executes via COM Object or passing the file argument to the executable.
*   **Mocking:** Create a "Dummy API" mode where the code runs but API calls are mocked for testing without Adobe apps installed.

### Panel 3: Node.js Script (The Orchestrator)
*   **Environment:** Node.js VM Sandbox (vm2 or isolated-vm).
*   **Capabilities:**
    *   Full access to `fs` (FileSystem).
    *   Access to installed NPM libraries.
    *   Access to `state` (Shared memory).
*   **Quick Actions & Exports:**
    *   **Grid View Integration:** Any function exported via `exports.myAction = ...` is automatically detected by the UI.
    *   These exports appear as buttons on the Flow Card in Grid View and in the Quick Actions bar in Editor View.
    *   The default entry point is `exports.run`.
*   **Helpers:**
    *   `utils.downloadFile(url, dest)`
    *   `utils.zip(source, dest)`
    *   `utils.read(path)`
    *   `utils.upload(url, filePath)`

---

## 4. Automation, Triggers & Chaining

### A. Watchers
The Node.js sidecar runs a persistent process manager.
1.  **File Watcher:** Uses `chokidar`. Watch folder -> On Add/Change -> Trigger Flow.
2.  **API Watcher:** `setInterval` (Min 1 min). Polls an external API. If response matches criteria -> Trigger Flow.

### B. External API Trigger
The application exposes a local endpoint: `POST http://localhost:3000/api/trigger/:flowId`
*   **Body:** `{ "uiVariables": { ... }, "secret": "..." }`
*   **Usage:** Allows external tools (Zapier, Postman, custom scripts) to run the desktop automation.

### C. Process Chaining (Async)
The API/Runner must support sequential execution defined by the user or API request.
*   **Scenario:** Trigger "Button A" (Generate Image) -> Wait -> Trigger "Button B" (Photoshop Mockup).
*   **Implementation:**
    ```javascript
    // Inside Node.js Panel
    const resultA = await flow.run('ButtonA', { input: '...' });
    state.imagePath = resultA.path; // Store in shared state
    await flow.run('ButtonB', { input: state.imagePath });
    ```

---

## 5. Security & Environment Variables

### Requirements
1.  **Login:** Simple password protection on app startup.
    *   Env Var: `SKIP_AUTH=true` to bypass during dev.
2.  **Encryption:**
    *   User enters API Keys (OpenAI, Shopify, Custom).
    *   App encrypts them using a master key (derived from login password or system keychain) before saving to disk.
    *   Decrypted *only* in memory at runtime and injected into the VM/ExtendScript context.

---

## 6. Backend API (Node.js Sidecar) Specification

The sidecar is the heart of the app. It must be bundled using `pkg` for the Tauri binary.

### Swagger / API Definition

```yaml
openapi: 3.0.0
info:
  title: AI Flow Runner API
  version: 1.0.0
paths:
  /api/execute:
    post:
      summary: Run a specific code block (Node or ExtendScript)
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                type: 
                  type: string
                  enum: [nodejs, extendscript]
                code:
                  type: string
                context:
                  type: object
                envVars:
                  type: object
  /api/install-lib:
    post:
      summary: Install an NPM package dynamically
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                packageName: 
                  type: string
  /api/trigger/{flowId}:
    post:
      summary: Trigger a full 3-panel flow
      parameters:
        - name: flowId
          in: path
          required: true
          schema:
            type: string
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                inputs:
                  type: object
                  description: Matches the UI Schema keys
```

### Prebuilt Helper Functions (Injected into Node.js Context)

1.  **`utils.downloadFile(url, destPath)`**
    *   Streams file to disk. Handles 302 redirects.
2.  **`utils.zipFolder(sourceDir, destFile)`**
    *   Uses `archiver` library.
3.  **`utils.readFile(path, encoding)`**
    *   Safe wrapper around `fs.readFile`.
4.  **`utils.shopifyRequest(store, token, query)`**
    *   Pre-configured fetch wrapper for Shopify GraphQL/Admin API.

---

## 7. AI Chat Architect Features

The chat interface generates the code for the panels.

*   **Context Awareness:** When the user asks to "Change the script to handle PDFs", the AI sends the *current* content of the Node.js panel in the context window.
*   **Multi-File Generation:** The AI can return a JSON object containing updates for all 3 panels simultaneously.
    ```json
    {
      "ui": { ...jsonSchema... },
      "node": "const fs = require('fs')...",
      "adobe": "var doc = app.activeDocument..."
    }
    ```
*   **Settings:**
    *   User provides their own API Key (Gemini/OpenAI).
    *   Model selection (Gemini 3 Series).
*   **Action Recognition:** The AI is instructed to break down complex workflows into discrete named exports in the Node.js file (e.g., `exports.downloadAssets`, `exports.processImages`), which become clickable actions in the UI.

---

## 8. Development & Build Instructions

### Prerequisites
*   Node.js v18+
*   Rust (latest stable)
*   Visual Studio Build Tools (Windows) or Xcode (Mac)

### Folder Structure
```
/
├── src/              # React Frontend
├── src-tauri/        # Rust Configuration
├── server/           # Node.js Sidecar
│   ├── index.js      # Main Entry
│   ├── helpers/      # Utility functions
│   └── package.json
└── package.json
```

### Step 1: Develop (Hot Reload)
1.  **Setup Server:** `cd server && npm install`
2.  **Build Server Binary:**
    *   Mac: `npm run build:tauri:mac` (Uses `pkg`)
    *   Win: `npm run build:tauri:win`
3.  **Run App:** `npm run tauri dev`

### Step 2: Testing Strategy

**A. Unit Testing (Node Server):**
*   Use `jest`.
*   Mock `fs` to test file watchers.
*   Mock `child_process` to test ExtendScript execution commands.

**B. Integration Testing (Flows):**
*   Create a "Test Flow" that:
    1.  UI: Accepts a text string.
    2.  Node: Writes string to a file `test.txt`.
    3.  ExtendScript: Reads `test.txt` and logs it.
*   Run this flow via the API Trigger `/api/trigger/test-flow`.
*   Assert that the log contains the input string.

**C. Manual Testing:**
*   **Watch Folder:** Drop a file in a watched folder -> Verify Chat Log updates.
*   **Library:** Type `axios` in library manager -> Click Install -> Verify usage in Node.js panel.

### Step 3: Production Build

**Target: Mac (Universal/Apple Silicon)**
```bash
# 1. Build Sidecar
cd server
npm install
npm run build:tauri:mac-arm 

# 2. Build App
cd ..
npm install
npm run tauri build
```
*Output:* `src-tauri/target/release/bundle/dmg/`

**Target: Windows**
```bash
# 1. Build Sidecar
cd server
npm install
npm run build:tauri:win

# 2. Build App
cd ..
npm install
npm run tauri build
```
*Output:* `src-tauri/target/release/bundle/msi/`

---

## 9. Troubleshooting Strapi Deployment (Auth & Cookies)

If you are experiencing errors like `Invalid callback URL provided` or `Cannot send secure cookie over unencrypted connection` after deploying Strapi:

### Fix 1: Trusting the Proxy (Secure Cookie Error)
If deploying to a platform like Render, Heroku, or DigitalOcean App Platform, SSL is terminated at the load balancer. You must tell Strapi to trust the proxy so it knows it is secure.

**Update `config/server.js` on your Strapi Server:**
```javascript
module.exports = ({ env }) => ({
  host: env('HOST', '0.0.0.0'),
  port: env.int('PORT', 1337),
  // Important: Use the 'url' property to define the public URL
  url: env('PUBLIC_URL', 'https://your-app-name.herokuapp.com'),
  app: {
    keys: env.array('APP_KEYS'),
  },
  // CRITICAL: Set proxy to true to fix "secure cookie" errors
  proxy: true, 
  webhooks: {
    populateRelations: env.bool('WEBHOOKS_POPULATE_RELATIONS', false),
  },
});
```

### Fix 2: Whitelisting the Desktop App Callback
Strapi v4/v5 validates where it redirects users after login. Since the Desktop App runs on `http://localhost:3001` (the sidecar), you must whitelist this URL.

1. Go to **Strapi Admin Panel** -> **Settings**.
2. Go to **Users & Permissions** -> **Advanced Settings**.
3. Find **Allowed redirection URLs**.
4. Add the following line:
   `http://localhost:3001`
5. Click **Save**.

### Fix 3: Configuring Google Provider
Ensure `config/plugins.js` is set up to read from your environment variables:
```javascript
module.exports = ({ env }) => ({
  'users-permissions': {
    config: {
      providers: {
        google: {
          enabled: true,
          clientId: env('GOOGLE_CLIENT_ID'),
          clientSecret: env('GOOGLE_CLIENT_SECRET'),
          redirectUri: env('GOOGLE_REDIRECT_URI'), // Must match Google Cloud Console
        },
      },
    },
  },
});
```
