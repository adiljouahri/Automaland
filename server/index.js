

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs-extra');
const path = require('path');
const vm = require('vm'); 
const chokidar = require('chokidar');
const axios = require('axios');
const archiver = require('archiver');
const ExtendScriptFacade = require('./core/ExtendScriptFacade');

const app = express();
// Default start port, will increment if busy
let PORT = 3001; 

// --- Setup Logging paths ---
const USER_DATA_DIR = path.join(require('os').homedir(), '.tripanel');
const LOGS_DIR = path.join(USER_DATA_DIR, 'logs');
fs.ensureDirSync(LOGS_DIR);
const SERVER_LOG_PATH = path.join(LOGS_DIR, 'server.log');

// Log Rotation / Management can be added here, for now simple append
function writeToDisk(type, ...args) {
    try {
        const msg = args.map(arg => 
            typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
        ).join(' ');
        
        const timestamp = new Date().toISOString();
        const logLine = `[${timestamp}] [${type}] ${msg}\n`;
        
        fs.appendFileSync(SERVER_LOG_PATH, logLine, 'utf8');
    } catch (e) {
        // Fallback to std err if disk write fails
        process.stdout.write("Logging failed: " + e.message + "\n");
    }
}

// --- Log Streaming Setup (SSE) ---
const logClients = [];

function broadcastLog(type, message) {
    // Determine source based on type, allowing explicit AUTH_SUCCESS and UI_SYNC
    let source = 'NODE';
    if (['HOST', 'UI_SYNC', 'AUTH_SUCCESS'].includes(type)) {
        source = type;
    }

    const payload = JSON.stringify({
        timestamp: new Date().toLocaleTimeString(),
        source: source,
        type: type === 'HOST' ? 'info' : (type === 'ERROR' ? 'error' : 'info'), 
        message: message
    });
    
    logClients.forEach(client => {
        client.write(`data: ${payload}\n\n`);
    });
}

const originalLog = console.log;
const originalError = console.error;

console.log = (...args) => {
    writeToDisk('INFO', ...args);
    // Original log goes to stdout, which Tauri captures for its own debugging/logs if running in shell
    originalLog.apply(console, args); 
    
    // Broadcast for UI
    const msg = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
    ).join(' ');
    broadcastLog('INFO', msg);        
};

console.error = (...args) => {
    writeToDisk('ERROR', ...args);
    originalError.apply(console, args);
    
    const msg = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
    ).join(' ');
    broadcastLog('ERROR', msg);
};

// Catch unhandled rejections/exceptions to log them before crash
process.on('uncaughtException', (err) => {
    console.error('UNCAUGHT EXCEPTION:', err);
    writeToDisk('FATAL', err.stack || err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('UNHANDLED REJECTION:', reason);
    writeToDisk('FATAL', 'Unhandled Rejection at:', promise, 'reason:', reason);
});


// --- Initialization ---
const GLOBAL_STATE = {};
const libPath = path.join(__dirname, 'lib');
const hostBridge = new ExtendScriptFacade(libPath);

// --- Bridge Message Listener for Logging ---
hostBridge.on('message', (event) => {
    // Capture $.writeln output from ExtendScript
    if (event.message && event.message.body) {
        let msg = event.message.body;
        // Basic cleanup if it's wrapped in XML CDATA
        if (msg.includes("<![CDATA[")) {
            const match = msg.match(/<!\[CDATA\[(.*?)\]\]>/s);
            if (match) msg = match[1];
        }
        
        // Log to disk specifically as HOST
        writeToDisk('HOST', msg);
        
        // Broadcast to UI
        broadcastLog('HOST', msg);
    }
});

let bridgeReady = false;
let installedApps = [];

// --- Setup User Standard Library ---
const USER_LIB_DIR = path.join(USER_DATA_DIR, 'lib');
const SOURCE_JSX_DIR = path.join(__dirname, 'jsx');

// Ensure directories exist
fs.ensureDirSync(USER_LIB_DIR);

// Define paths for the libraries
const LIB_JSON = path.join(USER_LIB_DIR, 'json.jsx');
const LIB_UNDERSCORE = path.join(USER_LIB_DIR, 'underscore.jsx');
const LIB_LOGGER = path.join(USER_LIB_DIR, 'logger.jsx');
const LIB_CORE = path.join(USER_LIB_DIR, 'core.jsx');
const LIB_HANDLER = path.join(USER_LIB_DIR, 'handler.jsx');

// --- Sync JSX Libs ---
const libsToSync = [
    { name: 'json.jsx', default: '// JSON Polyfill Placeholder\nif(typeof JSON!=="object"){JSON={};}' },
    { name: 'underscore.jsx', default: '// Underscore Placeholder\nvar _ = {};' },
    { 
        name: 'logger.jsx', 
        default: `
function logger(name_user) {
  var folder_log = Folder.myDocuments.fsName.replace(/\\\\/g, "/") + "/" + name_user;
  if (!Folder(folder_log).exists) {
    Folder(folder_log).create();
  }

  this.log_path = File(folder_log + "/log.log");
  // Optional: Clean previous log if needed, or append. Here we append.
  // if (this.log_path.exists) this.log_path.remove();
  this.log("log Extendscript inited");
}
logger.prototype.log = function (msg, event) {
  try {
    var today = new Date();
    var date =
      today.getFullYear() +
      "-" +
      (today.getMonth() + 1) +
      "-" +
      today.getDate();
    var time =
      today.getHours() + ":" + today.getMinutes() + ":" + today.getSeconds();
    var dateTime = date + " " + time;

    var f = this.log_path;
    f.encoding = "UTF-8";
    f.open("a");
    var logLine = "ExtendScript: " + dateTime + ":  " + (event ? event : " INFO ") + " ====> " + msg;
    f.writeln(logLine);
    f.close();
    $.writeln(logLine);
  } catch (e) {
      $.writeln("Logger Error: " + e.message);
  }
};
var LOGGER = new logger("triPaneltApp");
` 
    },
    { 
        name: 'handler.jsx', 
        default: `
function requestHandler() {}
requestHandler.prototype = {
  parse: function (req) {
    var res = {};
    if (typeof req == "string") {
      try {
        // Decode URI component to handle special characters (including %27 for single quotes)
        var decoded = decodeURIComponent(req);
        res = JSON.parse(decoded);
      } catch (e) {
         if (LOGGER) LOGGER.log("RH.parse Error: " + e.message, "ERROR");
         // Return empty object on failure to avoid script crash
         res = {};
      }
    } else {
        return req;
    }
    return res;
  },
  toString: function (res) {
    try {
        return JSON.stringify(res);
    } catch(e) {
        if (LOGGER) LOGGER.log("RH.toString Error: " + e.message, "ERROR");
        return "{}";
    }
  },
  args: {
    get: function (obj, key) {
      var obj_key = obj[key];
      if (obj_key) return obj_key;
      else {
        return {};
      } 
    },
    push: function () {},
  },
  error: {
    find: function () {},
    push: function () {},
  },
  verify: function(obj) {
      return (typeof obj !== 'undefined' && obj !== null) ? obj : {};
  }
};
var RH = new requestHandler();
` 
    }
];

libsToSync.forEach(lib => {
    const destPath = path.join(USER_LIB_DIR, lib.name);
    const srcPath = path.join(SOURCE_JSX_DIR, lib.name);
    
    let content = lib.default;
    
    if (fs.existsSync(srcPath)) {
        try {
            content = fs.readFileSync(srcPath, 'utf8');
            if (content.charCodeAt(0) === 0xFEFF) {
                content = content.slice(1);
            }
            console.log(`[Sidecar] Loaded ${lib.name} from source.`);
        } catch (e) {
            console.warn(`[Sidecar] Failed to read source lib ${lib.name}: ${e.message}`);
        }
    } else {
        console.log(`[Sidecar] Source lib ${lib.name} not found, using default.`);
    }
    
    try {
        fs.writeFileSync(destPath, content, 'utf8');
    } catch (e) {
        console.error(`[Sidecar] Failed to write user lib ${lib.name}: ${e.message}`);
    }
});

const CORE_CONTENT = `
// TriPanel Core Wrapper
function __tripanel_wrap__(userFunc) {
    try {
        LOGGER.log("Starting Execution...");
        
        try {
            var funcStr = userFunc.toString();
            var logCode = funcStr.length > 250 ? funcStr.substring(0, 250) + "..." : funcStr;
            LOGGER.log("Function Body: " + logCode);
        } catch(e) {}

        var result = userFunc();
        if (typeof result === 'undefined') {
            result = null;
        } else if (result instanceof File || result instanceof Folder) {
            result = result.fsName;
        }
        
        LOGGER.log("Execution Success");
        
        return JSON.stringify({
            success: true,
            data: result
        });
    } catch (e) {
        var errInfo = e.message + " (Line " + e.line + ")";
        LOGGER.log("Execution Error: " + errInfo, "ERROR");
        
        return JSON.stringify({
            success: false,
            data: errInfo
        });
    }
}
`;
fs.writeFileSync(LIB_CORE, CORE_CONTENT, 'utf8');

// Initialize Bridge
(async () => {
    try {
        console.log("[Sidecar] Initializing Host Bridge...");
        console.log(`[Sidecar] Lib Path: ${libPath}`);
        
        const success = await hostBridge.initialize("tripanel-sidecar");
        if (success === true) {
            bridgeReady = true;
            installedApps = hostBridge.getInstalledApps();
            console.log("[Sidecar] Host Bridge Ready.");
        } else {
            console.warn("[Sidecar] Host Bridge did not initialize (Simulation Mode).");
            bridgeReady = false;
        }
    } catch (e) {
        console.warn("[Sidecar] Host Bridge failed to initialize (Simulation Mode).", e.message);
        bridgeReady = false;
    }
})();

app.use(cors());
app.use(bodyParser.json({ limit: '100mb' }));

const utils = {
    downloadFile: async (url, dest) => {
        const writer = fs.createWriteStream(dest);
        const response = await axios({ url, method: 'GET', responseType: 'stream' });
        response.data.pipe(writer);
        return new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });
    },
    zipFolder: (source, dest) => {
        const output = fs.createWriteStream(dest);
        const archive = archiver('zip');
        archive.pipe(output);
        archive.directory(source, false);
        return archive.finalize();
    },
    readFile: (p) => fs.readFileSync(p, 'utf8'),
    getHomeDir: () => process.env.HOME || process.env.USERPROFILE,
};

// --- Core Execution Logic ---
async function runNodeCode({ code, triggerData, envVars, entryPoint, targetApp, timeout = 10000, appCode }) {
    console.log(`[Execute] Running Node Code. AppCode Length: ${appCode ? appCode.length : '0 (None)'}`);

    const $ = {
        run_jsx: async (jsxCode, specificApp) => {
            let appToUse = specificApp || targetApp;
            if (bridgeReady && installedApps.length > 0) {
                const match = installedApps.find(a => a.specifier === appToUse || a.id === appToUse || a.name.toLowerCase().includes(appToUse.toLowerCase()));
                if (match) appToUse = match.specifier;
            }
            
            const formatPath = (p) => process.platform === 'win32' ? p.replace(/\\/g, '\\\\') : p;

            // Custom escape function for injecting data INTO ExtendScript
            function escape2(key, val) {
                if (typeof (val) != "string") return val;
                return val
                    .replace(/[\\]/g, '\\\\')
                    .replace(/[\/]/g, '\\/')
                    .replace(/[\b]/g, '\\b')
                    .replace(/[\f]/g, '\\f')
                    .replace(/[\n]/g, '\\n')
                    .replace(/[\r]/g, '\\r')
                    .replace(/[\t]/g, '\\t')
                    .replace(/[\"]/g, '\\"')
                    // .replace(/\\'/g, "\\'")
                    .replace(/'/g, "####");
            }

            const encodeJSX = (obj) => {
                if (!obj) return '%7B%7D'; // Encoded "{}"
                // DEFAULT TO EMPTY OBJECT IF UNDEFINED/NULL
                try {
                    var stringified = obj ? encodeURIComponent(escape2(JSON.stringify(obj))) : ''
                    // 1. Stringify to JSON
                    // 2. Escape using custom logic for the string literal
                    // 3. URI Encode to ensure transport safety through Bridge/OS
                    // const stringified = JSON.stringify(obj);
                    return encodeURIComponent(escape(stringified));
                } catch (e) { 
                    console.log(e.message)
                    return '%7B%7D';
                 }
            };


            // SAFE ENCODING
            const encodedState = encodeJSX(GLOBAL_STATE);
            const encodedTrigger = encodeJSX(triggerData);

            // Injected global variables 'state' and 'triggerData' using RH.parse
            // We verify they are objects after parsing to be safe.
            const finalJsx = `
#include "${formatPath(LIB_JSON)}"
#include "${formatPath(LIB_UNDERSCORE)}"
#include "${formatPath(LIB_LOGGER)}"
#include "${formatPath(LIB_HANDLER)}"
#include "${formatPath(LIB_CORE)}"

// Inject State via RH.parse (which handles unescape/decode)
var rawState = RH.parse('${encodedState}');
var rawTrigger = RH.parse('${encodedTrigger}');

// Fallback to empty object if something went wrong
var state = (rawState === null || typeof rawState === 'undefined') ? {} : rawState;
var triggerData = (rawTrigger === null || typeof rawTrigger === 'undefined') ? {} : rawTrigger;

// --- HOST APP LIBRARY (Panel 2) ---
${appCode || '// No Host App Code provided'}
// ----------------------------------

__tripanel_wrap__(function() {
    ${jsxCode}
});
            `;

            if (!bridgeReady) {
                console.log(`[Sidecar] Running JSX in Simulation Mode for ${appToUse}.`);
                return `Simulation Result from ${appToUse}: Success`;
            }

            try {
                const resultRaw = await hostBridge.evaluate(appToUse, finalJsx, "main", timeout, true);
                
                // When receiving data BACK from ExtendScript, we expect valid JSON 
                // because __tripanel_wrap__ uses JSON.stringify.
                let jsonResult;
                try {
                    jsonResult = JSON.parse(resultRaw);
                } catch (parseErr) {
                    console.error("Failed to parse app response:", resultRaw);
                    throw new Error(`Invalid JSON returned from app: ${resultRaw}`);
                }

                if (jsonResult.success) {
                    return jsonResult.data;
                } else {
                    throw new Error(`Script Error: ${jsonResult.data}`);
                }
            } catch (e) {
                throw new Error(`Bridge Error: ${e.message}`);
            }
        },
        sleep: (ms) => new Promise(r => setTimeout(r, ms)),
        state: GLOBAL_STATE
    };

    const sandbox = {
        console: console, 
        require: require,
        process: { ...process, env: { ...process.env, ...envVars } },
        Buffer: Buffer,
        setTimeout, clearTimeout, setInterval, clearInterval,
        state: GLOBAL_STATE,
        triggerData: triggerData || {}, // Node side default
        utils: {
            ...utils,
            setUI: (key, value) => {
                const payload = {};
                payload[key] = value;
                broadcastLog('UI_SYNC', JSON.stringify(payload));
            }
        },
        $: $,
        exports: {},
        module: { exports: {} }
    };
    
    sandbox.module.exports = sandbox.exports;

    try {
        const context = vm.createContext(sandbox);
        vm.runInContext(code, context);
        const exportedModule = sandbox.module.exports;

        if (exportedModule && typeof exportedModule[entryPoint] === 'function') {
            return await exportedModule[entryPoint](triggerData);
        } else if (typeof exportedModule === 'function' && entryPoint === 'run') {
            return await exportedModule(triggerData);
        } else {
             if (sandbox.exports && typeof sandbox.exports[entryPoint] === 'function') {
                return await sandbox.exports[entryPoint](triggerData);
            }
            throw new Error(`Entry point '${entryPoint}' not found.`);
        }
    } catch (e) {
        throw new Error(`Script Execution Error: ${e.message}`);
    }
}

// --- Watcher Management ---
const activeWatchers = {}; 

app.get('/api/logs', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    logClients.push(res);
    res.write(`data: ${JSON.stringify({ timestamp: new Date().toLocaleTimeString(), source: 'SYSTEM', type: 'info', message: 'Connected to Log Stream' })}\n\n`);
    req.on('close', () => {
        const index = logClients.indexOf(res);
        if (index !== -1) logClients.splice(index, 1);
    });
});

// Auth State Machine
let authState = {
    status: 'idle', // idle, pending, success, error
    data: null,
    error: null,
    timestamp: 0
};

app.get('/api/auth/poll', (req, res) => {
    // Check timeout (2 minute expiry to allow for slow user action)
    if (Date.now() - authState.timestamp > 120000 && authState.status !== 'idle') {
         // Don't auto-clear success state too aggressively, the frontend might be slow to poll
         if (authState.status === 'pending') {
            authState = { status: 'idle', data: null, error: null, timestamp: 0 };
         }
    }
    res.json(authState);
});

app.get('/api/auth/callback', async (req, res) => {
    // Debug log to see exactly what Strapi sent us
    console.log("[Auth] Callback Received. Query Keys:", Object.keys(req.query));

    // Strapi standard Oauth return: ?id_token=...&access_token=...&jwt=...&user=...
    let { jwt, user, error, access_token, id_token, strapiUrl } = req.query;
    
    // --- 1. Defensive Parsing ---
    if (Array.isArray(jwt)) jwt = jwt[jwt.length - 1];
    if (Array.isArray(user)) user = user[user.length - 1];
    if (Array.isArray(error)) error = error[0];
    if (Array.isArray(access_token)) access_token = access_token[0];
    if (Array.isArray(id_token)) id_token = id_token[0];
    if (Array.isArray(strapiUrl)) strapiUrl = strapiUrl[0];

    if (typeof jwt === 'string') jwt = jwt.trim();
    if (typeof access_token === 'string') access_token = access_token.trim();
    
    // --- 2. Error Handling from Provider ---
    if (error) {
        const errorMsg = typeof error === 'string' ? error : JSON.stringify(error);
        console.error("[Auth] Provider returned error:", errorMsg);
        authState = { status: 'error', error: errorMsg, data: null, timestamp: Date.now() };
        return res.status(400).send(`
            <html><body style="font-family:sans-serif;text-align:center;padding:50px;">
                <h1 style="color:red">Login Failed</h1>
                <p>Provider Error: ${errorMsg}</p>
            </body></html>
        `);
    }

    const targetStrapi = strapiUrl || 'http://localhost:1337';
    const cleanStrapi = targetStrapi.replace(/\/$/, "");

    // --- 3. TOKEN EXCHANGE (Recovery for 'access_token' mode) ---
    // Pass the access_token to the frontend as the 'jwt'.
    // The frontend will handle the exchange if it's not a valid JWT.
    if (!jwt && access_token) {
        console.log("[Auth] 'access_token' found. Passing to frontend for validation/exchange.");
        jwt = access_token;
    }

    // --- 4. RECOVERY: ID Token Exchange ---
    // Same logic if we only got an id_token
    if (!jwt && id_token) {
        try {
            console.log("[Auth] Attempting Google Token Exchange via id_token...");
            const exchangeUrl = `${cleanStrapi}/api/auth/google/callback?access_token=${id_token}`;
            const response = await axios.get(exchangeUrl);
            if (response.data && response.data.jwt) {
                jwt = response.data.jwt;
                if(response.data.user) user = response.data.user;
                console.log("[Auth] Token Exchange Successful (id_token).");
            }
        } catch(e) {
            console.error(`[Auth] Token Exchange (id_token) Failed: ${e.message}`);
        }
    }

    // --- 5. Validation ---
    if (!jwt) {
        console.warn("[Auth] No JWT resolved.");
        authState = { status: 'error', error: "Login Incomplete: No valid JWT found.", data: null, timestamp: Date.now() };
        return res.status(400).send(`
            <html><body style="font-family:sans-serif;text-align:center;padding:50px;">
                <h1 style="color:orange">Login Incomplete</h1>
                <p>No valid session token could be retrieved.</p>
            </body></html>
        `);
    }

    // --- 6. Success Processing ---
    let parsedUser = null;

    // Check if we already have a user object
    if (user) {
        if (typeof user === 'string') {
             // Basic check to ensure it's not HTML before parsing
             if (user.trim().startsWith('<')) {
                 console.warn("[Auth] Received HTML instead of JSON user object. Ignoring.");
             } else {
                 try { parsedUser = JSON.parse(user); } catch(e) {}
             }
        } else if (typeof user === 'object') {
             parsedUser = user;
        }
    }

    // If still no user, fetch from Strapi
    if (!parsedUser && jwt) {
         try {
             // Best-effort fetch.
             const checkRes = await axios.get(`${cleanStrapi}/api/users/me`, {
                headers: { 
                    'Authorization': `Bearer ${jwt}`,
                    'Accept': 'application/json'
                },
                timeout: 5000
            });
            // Ensure response is JSON
            if (checkRes.status === 200 && checkRes.data && !((typeof checkRes.data === 'string') && checkRes.data.trim().startsWith('<'))) {
                parsedUser = checkRes.data;
            }
         } catch(e) {
             const errMsg = e.response ? `Status ${e.response.status}` : e.message;
             console.log(`[Auth] User fetch failed (${errMsg}). Using placeholder.`);
         }
    }

    // Fallback if still null
    if (!parsedUser) {
        parsedUser = { username: 'Visitor', id: 0, email: 'loading@tripanel.app' };
    }
    
    try {
        const payload = {
            jwt: jwt,
            user: parsedUser
        };
        
        console.log("[Auth] Login Flow Complete. Sending to Frontend.");
        writeToDisk('AUTH', `Login success for: ${parsedUser.username}`);

        authState = {
            status: 'success',
            data: payload,
            error: null,
            timestamp: Date.now()
        };
        
        broadcastLog('AUTH_SUCCESS', JSON.stringify(payload));
        
        res.send(`
            <html>
                <body style="font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; background: #f0f9ff; color: #0c4a6e; text-align: center; padding: 20px;">
                    <div style="background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); max-width: 500px; width: 100%;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: #0ea5e9; margin-bottom: 20px;"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                        <h1 style="margin: 0 0 10px 0; font-size: 24px;">Login Successful</h1>
                        <p style="margin-bottom: 20px; color: #64748b;">You can close this window.</p>
                        <textarea readonly style="width: 100%; height: 60px; font-family: monospace; font-size: 11px; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px; resize: none; background: #f8fafc; color: #334155;">${jwt}</textarea>
                        <script>setTimeout(() => { try { window.close(); } catch(e){} }, 3000);</script>
                    </div>
                </body>
            </html>
        `);
    } catch (e) {
        console.error("[Auth] Fatal Error during Success Processing:", e);
        authState = { status: 'error', error: "Internal Error", data: null, timestamp: Date.now() };
        res.status(500).send("Internal Error.");
    }
});

app.get('/api/adobe/apps', async (req, res) => {
    if (!bridgeReady) {
        return res.json([
            { id: 'photoshop', name: 'Photoshop (Simulated)', specifier: 'photoshop' },
            { id: 'illustrator', name: 'Illustrator (Simulated)', specifier: 'illustrator' },
            { id: 'indesign', name: 'InDesign (Simulated)', specifier: 'indesign' }
        ]);
    }
    res.json(hostBridge.getInstalledApps());
});

app.post('/api/execute/node', async (req, res) => {
    try {
        const { code, triggerData, envVars, entryPoint, targetApp, timeout, appCode } = req.body;
        const execTimeout = timeout ? parseInt(timeout) * 1000 : 10000;
        
        const result = await runNodeCode({
            code, 
            triggerData: triggerData || {}, // Safety default
            envVars, 
            entryPoint, 
            targetApp, 
            timeout: execTimeout,
            appCode: appCode || ''
        });
        res.json({ success: true, result, state: GLOBAL_STATE });
    } catch (error) {
        console.error(error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/watchers/sync', (req, res) => {
    const { configs, envVars } = req.body; 

    const incomingIds = configs.map(c => c.id);

    // 1. Remove watchers (both File and Schedule)
    Object.keys(activeWatchers).forEach(id => {
        if (!incomingIds.includes(id)) {
            console.log(`[Watcher] Stopping watcher ${id}`);
            const w = activeWatchers[id];
            // Close Chokidar watcher
            if (w.watcher && typeof w.watcher.close === 'function') w.watcher.close();
            // Clear Interval timer
            if (w.timer) clearInterval(w.timer);
            
            delete activeWatchers[id];
        }
    });

    // 2. Add or Update watchers
    configs.forEach(config => {
        const executeFlow = (eventType, detail) => {
            const currentContext = activeWatchers[config.id]?.flowContext;
            
            if (!currentContext) {
                console.error(`[Watcher] Context missing for ${config.id}`);
                return;
            }

            console.log(`[Watcher] Trigger (${eventType}): ${detail}`);
            
            runNodeCode({
                code: currentContext.code,
                triggerData: {
                    eventType: eventType,
                    detail: detail,
                    timestamp: Date.now()
                },
                envVars: envVars || {},
                entryPoint: 'run',
                targetApp: currentContext.targetApp,
                appCode: currentContext.appCode
            }).catch(err => console.error(`[Watcher] Execution Error: ${err.message}`));
        };

        const existing = activeWatchers[config.id];
        
        // If config exists, check if we need to restart it
        if (existing) {
            existing.flowContext = config.flowContext;
            
            const targetChanged = existing.target !== config.target;
            const intervalChanged = existing.interval !== config.interval;
            const typeChanged = existing.type !== config.type;

            // If key parameters haven't changed, we don't need to restart
            if (!targetChanged && !intervalChanged && !typeChanged) {
                return;
            }
            
            console.log(`[Watcher] Config changed for ${config.id}, restarting...`);
            if (existing.watcher && typeof existing.watcher.close === 'function') existing.watcher.close();
            if (existing.timer) clearInterval(existing.timer);
            delete activeWatchers[config.id]; 
        }

        console.log(`[Watcher] Starting ${config.type} on: ${config.target}`);
        
        try {
            if (config.type === 'SCHEDULE') {
                // Config.interval is expected to be in Seconds
                const intervalSeconds = config.interval && config.interval > 0 ? config.interval : 60; 
                const intervalMs = intervalSeconds * 1000;
                
                // Start Interval
                const timer = setInterval(() => {
                    executeFlow('schedule', config.target || 'Scheduled Task');
                }, intervalMs);

                activeWatchers[config.id] = {
                    type: 'SCHEDULE',
                    timer,
                    interval: config.interval,
                    target: config.target,
                    flowContext: config.flowContext
                };
            } else {
                // Default to FOLDER
                const watcher = chokidar.watch(config.target, { persistent: true, ignoreInitial: true, depth: 0 });
                watcher.on('add', (fp) => executeFlow('add', fp));
                watcher.on('change', (fp) => executeFlow('change', fp));

                activeWatchers[config.id] = {
                    type: 'FOLDER',
                    watcher,
                    target: config.target,
                    flowContext: config.flowContext
                };
            }
        } catch (e) {
            console.error(`[Watcher] Failed to start watcher for ${config.target}: ${e.message}`);
        }
    });

    res.json({ success: true, activeCount: Object.keys(activeWatchers).length });
});

// --- Dynamic Port Startup ---
function startServer(retryPort) {
    const server = app.listen(retryPort, () => {
        console.log(`Sidecar running on port ${retryPort}`);
        PORT = retryPort; 
        
        try {
            const configPath = path.join(USER_DATA_DIR, 'server.json');
            fs.writeJsonSync(configPath, { 
                port: retryPort, 
                url: `http://localhost:${retryPort}`,
                updated: Date.now()
            });
            console.log(`[Config] Written to ${configPath}`);
        } catch (e) {
            console.error("[Config] Failed to write server.json", e);
        }
    });

    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.warn(`Port ${retryPort} in use, trying ${retryPort + 1}...`);
            startServer(retryPort + 1);
        } else {
            console.error("Server start error:", err);
        }
    });
}

// Start with default 3001
startServer(3001);