
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs-extra');
const path = require('path');
const vm = require('vm'); 
const chokidar = require('chokidar');
const axios = require('axios');
const archiver = require('archiver');
// Force bundler to include fast-xml-parser
const FastXMLParserLib = require('fast-xml-parser');
const EventEmitter = require('events');

const app = express();
// Default start port, will increment if busy
let PORT = 3001; 

// --- Setup Logging paths ---
const USER_DATA_DIR = path.join(require('os').homedir(), '.tripanel');
const LOGS_DIR = path.join(USER_DATA_DIR, 'logs');
fs.ensureDirSync(LOGS_DIR);
const SERVER_LOG_PATH = path.join(LOGS_DIR, 'server.log');

// Ensure Axios Instance and default export
// We capture this once at startup to avoid require issues later
const rawAxios = axios.default || axios;
const AXIOS_INSTANCE = rawAxios;
if (!AXIOS_INSTANCE.default) {
    AXIOS_INSTANCE.default = AXIOS_INSTANCE;
}

// --- Log Rotation & Cleanup ---
function manageLogs() {
    try {
        const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 1 Day Retention
        const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB Limit for Active Log

        // 1. Rotate Active Log if too big or too old (creation time)
        if (fs.existsSync(SERVER_LOG_PATH)) {
            const stats = fs.statSync(SERVER_LOG_PATH);
            const age = Date.now() - stats.birthtimeMs;
            
            // Only rotate if file has content
            if (stats.size > 0) {
                 if (stats.size > MAX_SIZE_BYTES || age > MAX_AGE_MS) {
                    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                    const archivePath = path.join(LOGS_DIR, `server-archive-${timestamp}.log`);
                    fs.renameSync(SERVER_LOG_PATH, archivePath);
                    // Note: We use process.stdout to avoid recursion
                    try { process.stdout.write(`[LogManager] Rotated server.log to ${archivePath}\n`); } catch(e){}
                 }
            }
        }

        // 2. Clean Old Archives
        const files = fs.readdirSync(LOGS_DIR);
        const now = Date.now();
        
        files.forEach(file => {
            // Filter for log files
            if (!file.endsWith('.log')) return;
            if (file === 'server.log') return; // Skip active

            const filePath = path.join(LOGS_DIR, file);
            try {
                const stats = fs.statSync(filePath);
                if (now - stats.mtimeMs > MAX_AGE_MS) {
                    fs.unlinkSync(filePath);
                    try { process.stdout.write(`[LogManager] Pruned old log: ${file}\n`); } catch(e){}
                }
            } catch(e) {}
        });
    } catch (e) {
        try { process.stdout.write(`[LogManager] Error: ${e.message}\n`); } catch(err){}
    }
}

// Run maintenance on startup
manageLogs();
// Run maintenance every hour
setInterval(manageLogs, 60 * 60 * 1000);


function writeToDisk(type, ...args) {
    try {
        const msg = args.map(arg => 
            typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
        ).join(' ');
        
        const timestamp = new Date().toISOString();
        const logLine = `[${timestamp}] [${type}] ${msg}\n`;
        
        fs.appendFileSync(SERVER_LOG_PATH, logLine, 'utf8');
    } catch (e) {
        // Silent fail if disk write fails to avoid crash loops
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
        try {
            client.write(`data: ${payload}\n\n`);
        } catch(e) {
            // Client likely disconnected
        }
    });
}

const originalLog = console.log;
const originalError = console.error;

console.log = (...args) => {
    writeToDisk('INFO', ...args);
    try {
        originalLog.apply(console, args); 
    } catch (e) {
        if (e.code !== 'EPIPE') {
            writeToDisk('SYS_ERR', 'Stdout write failed:', e.message);
        }
    }
    try {
        const msg = args.map(arg => 
            typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
        ).join(' ');
        broadcastLog('INFO', msg);        
    } catch(e) {}
};

console.error = (...args) => {
    writeToDisk('ERROR', ...args);
    try {
        originalError.apply(console, args);
    } catch (e) {
        if (e.code !== 'EPIPE') {
            writeToDisk('SYS_ERR', 'Stderr write failed:', e.message);
        }
    }
    try {
        const msg = args.map(arg => 
            typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
        ).join(' ');
        broadcastLog('ERROR', msg);
    } catch(e) {}
};

// Catch unhandled rejections/exceptions to log them before crash
process.on('uncaughtException', (err) => {
    if (err.code === 'EPIPE') return;

    writeToDisk('FATAL', 'UNCAUGHT EXCEPTION:', err.stack || err);
    try {
        originalError.call(console, 'UNCAUGHT EXCEPTION:', err);
    } catch(e) {}
});

process.on('unhandledRejection', (reason, promise) => {
    if (reason && reason.code === 'EPIPE') return;

    writeToDisk('FATAL', 'Unhandled Rejection at:', promise, 'reason:', reason);
    try {
        originalError.call(console, 'UNHANDLED REJECTION:', reason);
    } catch(e) {}
});


// --- Initialization ---
const GLOBAL_STATE = {};
let libPath = path.join(__dirname, 'lib');

// Fix: Remove Windows extended path prefix (\\?\) which causes issues with native module loading
if (process.platform === 'win32' && libPath.startsWith('\\\\?\\')) {
    libPath = libPath.replace(/^\\\\\?\\/, '');
}

console.log(`[Sidecar] Library path set to: ${libPath}`);
console.log(`[Sidecar] Axios Check: ${!!AXIOS_INSTANCE}`);

// Dynamic Bridge State
let hostBridge = null;
let bridgeReady = false;
let installedApps = [];

// Helper to Bootstrap the Bridge from Frontend Source Code
async function ensureBridge(adapterCode) {
    if (hostBridge) return hostBridge;
    if (!adapterCode) {
        console.warn("[Sidecar] No adapter code provided. Cannot initialize bridge.");
        return null;
    }
    
    try {
        console.log("[Sidecar] Compiling Adapter Code...");
        const sandbox = {
            require: (moduleName) => {
                if (moduleName === 'fast-xml-parser') return FastXMLParserLib;
                if (moduleName === 'fs') return fs;
                if (moduleName === 'path') return path;
                if (moduleName === 'events') return EventEmitter;
                if (moduleName === 'process') return process;
                try { return require(moduleName); } catch(e) { 
                    console.error(`[Sandbox] Failed to require: ${moduleName}`);
                    return null; 
                }
            },
            console: console,
            process: process,
            Buffer: Buffer,
            setTimeout, clearTimeout, setInterval, clearInterval,
            // Expose Global Fetch API
            fetch: global.fetch,
            Headers: global.Headers,
            Request: global.Request,
            Response: global.Response,
            FormData: global.FormData,
            Blob: global.Blob,
            URL: global.URL,
            URLSearchParams: global.URLSearchParams,
            __dirname: __dirname,
            module: { exports: {} },
            exports: {}
        };
        sandbox.exports = sandbox.module.exports;
        
        const context = vm.createContext(sandbox);
        vm.runInContext(adapterCode, context);
        
        const FacadeClass = sandbox.module.exports;
        
        console.log(`[Sidecar] Initializing Host Bridge with Lib Path: ${libPath}`);
        hostBridge = new FacadeClass(libPath);
        
        // Setup Listener
        hostBridge.on('message', (event) => {
            if (event.message && event.message.body) {
                let msg = event.message.body;
                if (msg.includes("<![CDATA[")) {
                    const match = msg.match(/<!\[CDATA\[(.*?)\]\]>/s);
                    if (match) msg = match[1];
                }
                writeToDisk('HOST', msg);
                broadcastLog('HOST', msg);
            }
        });

        const success = await hostBridge.initialize("tripanel-sidecar");
        if (success === true) {
            bridgeReady = true;
            installedApps = hostBridge.getInstalledApps();
            console.log("[Sidecar] Host Bridge Ready.");
        } else {
            console.warn("[Sidecar] Host Bridge did not initialize (Simulation Mode).");
            bridgeReady = false;
        }

        return hostBridge;
    } catch (e) {
        console.error("Bridge Init Failed:", e);
        return null;
    }
}


// --- Setup User Standard Library ---
const USER_LIB_DIR = path.join(USER_DATA_DIR, 'lib');
const SOURCE_JSX_DIR = path.join(__dirname, 'jsx');
fs.ensureDirSync(USER_LIB_DIR);

const LIB_JSON = path.join(USER_LIB_DIR, 'json.jsx');
const LIB_UNDERSCORE = path.join(USER_LIB_DIR, 'underscore.jsx');
const LIB_LOGGER = path.join(USER_LIB_DIR, 'logger.jsx');
const LIB_CORE = path.join(USER_LIB_DIR, 'core.jsx');
const LIB_HANDLER = path.join(USER_LIB_DIR, 'handler.jsx');

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
  this.log("log Extendscript inited");
}
logger.prototype.log = function (msg, event) {
  try {
    var f = this.log_path;
    f.encoding = "UTF-8";
    f.open("a");
    var logLine = "ExtendScript: " + new Date().toTimeString() + ": " + msg;
    f.writeln(logLine);
    f.close();
    $.writeln(logLine);
  } catch (e) { $.writeln("Logger Error: " + e.message); }
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
      try { res = JSON.parse(decodeURIComponent(req)); } 
      catch (e) { res = {}; }
    } else { return req; }
    return res;
  },
  toString: function (res) { try { return JSON.stringify(res); } catch(e) { return "{}"; } },
  args: { get: function (obj, key) { return obj[key] || {}; }, push: function () {} },
  error: { find: function () {}, push: function () {} },
  verify: function(obj) { return (typeof obj !== 'undefined' && obj !== null) ? obj : {}; }
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
            if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);
        } catch (e) {}
    }
    try { fs.writeFileSync(destPath, content, 'utf8'); } catch (e) {}
});

const CORE_CONTENT = `
function __tripanel_wrap__(userFunc) {
    try {
        LOGGER.log("Starting Execution...");
        var result = userFunc();
        if (typeof result === 'undefined') result = null;
        else if (result instanceof File || result instanceof Folder) result = result.fsName;
        LOGGER.log("Execution Success");
        return JSON.stringify({ success: true, data: result });
    } catch (e) {
        var errInfo = e.message + " (Line " + e.line + ")";
        LOGGER.log("Execution Error: " + errInfo, "ERROR");
        return JSON.stringify({ success: false, data: errInfo });
    }
}
`;
fs.writeFileSync(LIB_CORE, CORE_CONTENT, 'utf8');

app.use(cors());
app.use(bodyParser.json({ limit: '100mb' }));

const utils = {
    downloadFile: async (url, dest) => {
        const writer = fs.createWriteStream(dest);
        const response = await AXIOS_INSTANCE({ url, method: 'GET', responseType: 'stream' });
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

            function escape2(key, val) {
                if (typeof (val) != "string") return val;
                return val.replace(/[\\]/g, '\\\\').replace(/[\/]/g, '\\/').replace(/[\b]/g, '\\b')
                    .replace(/[\f]/g, '\\f').replace(/[\n]/g, '\\n').replace(/[\r]/g, '\\r')
                    .replace(/[\t]/g, '\\t').replace(/[\"]/g, '\\"').replace(/'/g, "####");
            }

            const encodeJSX = (obj) => {
                if (!obj) return '%7B%7D';
                try {
                    var stringified = obj ? encodeURIComponent(escape2(JSON.stringify(obj))) : ''
                    return encodeURIComponent(escape(stringified));
                } catch (e) { return '%7B%7D'; }
            };

            const encodedState = encodeJSX(GLOBAL_STATE);
            const encodedTrigger = encodeJSX(triggerData);

            const finalJsx = `
      
#include "${formatPath(LIB_JSON)}"
#include "${formatPath(LIB_UNDERSCORE)}"
#include "${formatPath(LIB_LOGGER)}"
#include "${formatPath(LIB_HANDLER)}"
#include "${formatPath(LIB_CORE)}"

var rawState = RH.parse('${encodedState}');
var rawTrigger = RH.parse('${encodedTrigger}');
var state = (rawState === null || typeof rawState === 'undefined') ? {} : rawState;
var triggerData = (rawTrigger === null || typeof rawTrigger === 'undefined') ? {} : rawTrigger;

${appCode || '// No Host App Code provided'}

__tripanel_wrap__(function() {
    ${jsxCode}
});
            `;
            console.log(appToUse)
            if (!bridgeReady) return `Simulation Result from ${appToUse}: Success`;

            try {
                if (hostBridge) {
                    let targetEngine='main'
                    if(appToUse.indexOf('premierepro')>-1){
                        targetEngine='NewWorld'
                    }
                    const resultRaw = await hostBridge.evaluate(appToUse, finalJsx,targetEngine, timeout, true);
                    let jsonResult;
                    console.log('resultRaw',resultRaw)
                    try { jsonResult = JSON.parse(resultRaw); } 
                    catch (parseErr) { throw new Error(`Invalid JSON returned from app: ${resultRaw}`); }
    
                    if (jsonResult.success) return jsonResult.data;
                    else throw new Error(`Script Error: ${jsonResult.data}`);
                } else throw new Error("Bridge not initialized.");
            } catch (e) { throw new Error(`Bridge Error: ${e.message}`); }
        },
        sleep: (ms) => new Promise(r => setTimeout(r, ms)),
        state: GLOBAL_STATE
    };

    // Custom require to inject bundled modules into the VM
    const customRequire = (moduleName) => {
        let name = '';
        try { name = String(moduleName).trim(); } catch(e){}

        // Debug log for require
        // writeToDisk('SANDBOX_REQ', `Require: "${name}"`);

        if (name === 'axios' || name === 'axios/index.js') {
             return AXIOS_INSTANCE;
        }

        // --- Handle Common Modules (Pre-loaded) ---
        if (name === 'fs' || name === 'fs-extra' || name === 'node:fs') return fs;
        if (name === 'path' || name === 'node:path') return path;
        if (name === 'chokidar') return chokidar;
        if (name === 'archiver') return archiver;
        if (name === 'fast-xml-parser') return FastXMLParserLib;
        if (name === 'events' || name === 'node:events') return EventEmitter;
        if (name === 'util' || name === 'node:util') return require('util');
        if (name === 'os' || name === 'node:os') return require('os');
        if (name === 'crypto' || name === 'node:crypto') return require('crypto');
        if (name === 'child_process' || name === 'node:child_process') return require('child_process');
        if (name === 'url' || name === 'node:url') return require('url');
        if (name === 'http' || name === 'node:http') return require('http');
        if (name === 'https' || name === 'node:https') return require('https');
        if (name === 'stream' || name === 'node:stream') return require('stream');
        if (name === 'buffer' || name === 'node:buffer') return require('buffer');

        // --- Fallback for other modules ---
        try {
            return require(name);
        } catch (e) {
            const err = `[Sandbox] Import Error: Module '${name}' could not be loaded. (Error: ${e.message})`;
            console.error(err);
            throw new Error(err);
        }
    };
    
    customRequire.resolve = (name) => {
        if (name === 'axios') return 'axios';
        try { return require.resolve(name); } catch(e) { return name; }
    }

    const sandbox = {
        console: console, 
        require: customRequire,
        customRequire: customRequire, // Explicitly exposed
        process: { ...process, env: { ...process.env, ...envVars } },
        Buffer: Buffer,
        setTimeout, clearTimeout, setInterval, clearInterval,
        state: GLOBAL_STATE,
        triggerData: triggerData || {}, 
        utils: {
            ...utils,
            setUI: (key, value) => {
                const payload = {};
                payload[key] = value;
                broadcastLog('UI_SYNC', JSON.stringify(payload));
            }
        },
        $: $,
        // Inject Globals
        fetch: global.fetch,
        Headers: global.Headers,
        Request: global.Request,
        Response: global.Response,
        FormData: global.FormData,
        Blob: global.Blob,
        URL: global.URL,
        URLSearchParams: global.URLSearchParams,
        axios: AXIOS_INSTANCE,
        fs: fs,
        path: path,
        exports: {},
        module: { exports: {} }
    };
    
    // Circular reference for 'global' access in scripts
    sandbox.global = sandbox;
    
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

let authState = { status: 'idle', data: null, error: null, timestamp: 0 };

app.get('/api/auth/poll', (req, res) => {
    if (Date.now() - authState.timestamp > 120000 && authState.status !== 'idle') {
         if (authState.status === 'pending') {
            authState = { status: 'idle', data: null, error: null, timestamp: 0 };
         }
    }
    res.json(authState);
});

app.get('/api/auth/callback', async (req, res) => {
    console.log("[Auth] Callback Received. Query Keys:", Object.keys(req.query));
    let { jwt, user, error, access_token, id_token, strapiUrl } = req.query;
    
    if (Array.isArray(jwt)) jwt = jwt[jwt.length - 1];
    if (Array.isArray(user)) user = user[user.length - 1];
    if (Array.isArray(error)) error = error[0];
    if (Array.isArray(access_token)) access_token = access_token[0];
    if (Array.isArray(id_token)) id_token = id_token[0];
    if (Array.isArray(strapiUrl)) strapiUrl = strapiUrl[0];

    if (error) {
        const errorMsg = typeof error === 'string' ? error : JSON.stringify(error);
        authState = { status: 'error', error: errorMsg, data: null, timestamp: Date.now() };
        return res.status(400).send(`<html><body><h1>Login Failed</h1><p>${errorMsg}</p></body></html>`);
    }

    const targetStrapi = strapiUrl || 'http://localhost:1337';
    const cleanStrapi = targetStrapi.replace(/\/$/, "");

    if (!jwt && access_token) jwt = access_token;

    if (!jwt && id_token) {
        try {
            const exchangeUrl = `${cleanStrapi}/api/auth/google/callback?access_token=${id_token}`;
            const response = await AXIOS_INSTANCE.get(exchangeUrl);
            if (response.data && response.data.jwt) {
                jwt = response.data.jwt;
                if(response.data.user) user = response.data.user;
            }
        } catch(e) {}
    }

    if (!jwt) {
        authState = { status: 'error', error: "Login Incomplete: No valid session token found.", data: null, timestamp: Date.now() };
        return res.status(400).send(`<html><body><h1>Login Incomplete</h1><p>No valid session token.</p></body></html>`);
    }

    let parsedUser = null;
    if (user) {
        if (typeof user === 'string' && !user.trim().startsWith('<')) {
            try { parsedUser = JSON.parse(user); } catch(e) {}
        } else if (typeof user === 'object') {
             parsedUser = user;
        }
    }

    if (!parsedUser && jwt) {
         try {
             const checkRes = await AXIOS_INSTANCE.get(`${cleanStrapi}/api/users/me`, {
                headers: { 'Authorization': `Bearer ${jwt}` }, timeout: 5000
            });
            if (checkRes.status === 200 && checkRes.data) parsedUser = checkRes.data;
         } catch(e) {}
    }

    if (!parsedUser) parsedUser = { username: 'Visitor', id: 0, email: 'loading@tripanel.app' };
    
    try {
        const payload = { jwt: jwt, user: parsedUser };
        writeToDisk('AUTH', `Login success for: ${parsedUser.username}`);
        authState = { status: 'success', data: payload, error: null, timestamp: Date.now() };
        broadcastLog('AUTH_SUCCESS', JSON.stringify(payload));
        res.send(`<html><body><h1 style="color:green">Login Successful</h1><p>You can close this window.</p><script>setTimeout(()=>window.close(),3000)</script></body></html>`);
    } catch (e) {
        authState = { status: 'error', error: "Internal Error", data: null, timestamp: Date.now() };
        res.status(500).send("Internal Error.");
    }
});

app.get('/api/host/apps', async (req, res) => {
    if (!bridgeReady) return res.json([
            { id: 'photoshop', name: 'Photoshop (Simulated)', specifier: 'photoshop' },
            { id: 'illustrator', name: 'Illustrator (Simulated)', specifier: 'illustrator' }
        ]);
    res.json(hostBridge.getInstalledApps());
});

app.post('/api/execute/node', async (req, res) => {
    try {
        const { code, triggerData, envVars, entryPoint, targetApp, timeout, appCode, adapterCode } = req.body;
        if (!hostBridge && adapterCode) await ensureBridge(adapterCode);
        const result = await runNodeCode({
            code, triggerData: triggerData || {}, envVars, entryPoint, targetApp, 
            timeout: timeout ? parseInt(timeout) * 1000 : 10000, 
            appCode: appCode || ''
        });
        res.json({ success: true, result, state: GLOBAL_STATE });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/watchers/sync', async (req, res) => {
    const { configs, envVars, adapterCode } = req.body; 
    if (!hostBridge && adapterCode) await ensureBridge(adapterCode);
    const incomingIds = configs.map(c => c.id);
    Object.keys(activeWatchers).forEach(id => {
        if (!incomingIds.includes(id)) {
            const w = activeWatchers[id];
            if (w.watcher && typeof w.watcher.close === 'function') w.watcher.close();
            if (w.timer) clearInterval(w.timer);
            delete activeWatchers[id];
        }
    });

    configs.forEach(config => {
        const executeFlow = (eventType, detail) => {
            const currentContext = activeWatchers[config.id]?.flowContext;
            if (!currentContext) return;
            runNodeCode({
                code: currentContext.code,
                triggerData: { eventType, detail, timestamp: Date.now() },
                envVars: envVars || {},
                entryPoint: 'run',
                targetApp: currentContext.targetApp,
                appCode: currentContext.appCode
            }).catch(err => console.error(`[Watcher] Execution Error: ${err.message}`));
        };

        const existing = activeWatchers[config.id];
        if (existing) {
            existing.flowContext = config.flowContext;
            if (existing.target === config.target && existing.interval === config.interval && existing.type === config.type) return;
            if (existing.watcher && typeof existing.watcher.close === 'function') existing.watcher.close();
            if (existing.timer) clearInterval(existing.timer);
            delete activeWatchers[config.id]; 
        }

        try {
            if (config.type === 'SCHEDULE') {
                const intervalMs = (config.interval && config.interval > 0 ? config.interval : 60) * 1000;
                const timer = setInterval(() => executeFlow('schedule', config.target || 'Scheduled Task'), intervalMs);
                activeWatchers[config.id] = { type: 'SCHEDULE', timer, interval: config.interval, target: config.target, flowContext: config.flowContext };
            } else {
                const watcher = chokidar.watch(config.target, { persistent: true, ignoreInitial: true, depth: 0 });
                watcher.on('add', (fp) => executeFlow('add', fp));
                watcher.on('change', (fp) => executeFlow('change', fp));
                activeWatchers[config.id] = { type: 'FOLDER', watcher, target: config.target, flowContext: config.flowContext };
            }
        } catch (e) {}
    });

    res.json({ success: true, activeCount: Object.keys(activeWatchers).length });
});

function startServer(retryPort) {
    const server = app.listen(retryPort, () => {
        console.log(`Sidecar running on port ${retryPort}`);
        PORT = retryPort; 
        try {
            fs.writeJsonSync(path.join(USER_DATA_DIR, 'server.json'), { port: retryPort, url: `http://localhost:${retryPort}`, updated: Date.now() });
        } catch (e) {}
    });
    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') startServer(retryPort + 1);
        else console.error("Server start error:", err);
    });
}

startServer(3001);