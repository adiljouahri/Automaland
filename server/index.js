
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs-extra');
const path = require('path');
const vm = require('vm'); // Use native Node.js VM instead of vm2
const chokidar = require('chokidar');
const axios = require('axios');
const archiver = require('archiver');
const ExtendScriptFacade = require('./core/ExtendScriptFacade');

const app = express();
const PORT = 3031;

// --- Log Streaming Setup (SSE) ---
const logClients = [];

function broadcastLog(type, message) {
    const payload = JSON.stringify({
        timestamp: new Date().toLocaleTimeString(),
        source: 'NODE',
        type: type, // 'info' or 'error'
        message: message
    });
    
    logClients.forEach(client => {
        client.write(`data: ${payload}\n\n`);
    });
}

// Monkey-patch console.log and console.error to stream to frontend
const originalLog = console.log;
const originalError = console.error;

console.log = (...args) => {
    // Convert args to string
    const msg = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
    ).join(' ');
    
    originalLog.apply(console, args); // Print to actual terminal
    broadcastLog('info', msg);        // Stream to UI
};

console.error = (...args) => {
    const msg = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
    ).join(' ');
    
    originalError.apply(console, args);
    broadcastLog('error', msg);
};

// --- Initialization ---
const GLOBAL_STATE = {};
// Point to the 'lib' folder which is a sibling of this script (in both dev and prod/dist structure)
const libPath = path.join(__dirname, 'lib');
const adobeBridge = new ExtendScriptFacade(libPath);

let bridgeReady = false;
let installedApps = [];

(async () => {
    try {
        console.log("[Sidecar] Initializing Adobe Bridge...");
        // Log the detected lib path for debugging
        console.log(`[Sidecar] Lib Path: ${libPath}`);
        
        const success = await adobeBridge.initialize("tripanel-sidecar");
        if (success === true) {
            bridgeReady = true;
            installedApps = adobeBridge.getInstalledApps();
            console.log("[Sidecar] Adobe Bridge Ready.");
        } else {
            console.warn("[Sidecar] Adobe Bridge did not initialize (Simulation Mode).");
            bridgeReady = false;
        }
    } catch (e) {
        console.warn("[Sidecar] Adobe Bridge failed to initialize (Simulation Mode).", e.message);
        bridgeReady = false;
    }
})();

app.use(cors());
app.use(bodyParser.json());

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
async function runNodeCode({ code, triggerData, envVars, entryPoint, targetApp }) {
    const $ = {
        run_jsx: async (jsxCode, specificApp) => {
            let appToUse = specificApp || targetApp;
            if (bridgeReady && installedApps.length > 0) {
                const match = installedApps.find(a => a.specifier === appToUse || a.id === appToUse || a.name.toLowerCase().includes(appToUse.toLowerCase()));
                if (match) appToUse = match.specifier;
            }
            
            // Critical check: if bridge is not ready, return simulation result immediately
            if (!bridgeReady) {
                console.log(`[Sidecar] Running JSX in Simulation Mode for ${appToUse}.`);
                return `Simulation Result from ${appToUse}: Success`;
            }

            try {
                return await adobeBridge.evaluate(appToUse, jsxCode);
            } catch (e) {
                throw new Error(`Adobe Execution Failed: ${e.message}`);
            }
        },
        sleep: (ms) => new Promise(r => setTimeout(r, ms)),
        state: GLOBAL_STATE
    };

    // Prepare the sandbox environment
    const sandbox = {
        // Standard Node.js globals we want to expose
        console: console, // This now uses our patched version
        require: require,
        process: {
            ...process,
            env: { ...process.env, ...envVars }
        },
        Buffer: Buffer,
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        
        // App specific injections
        state: GLOBAL_STATE,
        triggerData,
        utils,
        $: $,
        
        // CommonJS Module emulation
        exports: {},
        module: { exports: {} }
    };
    
    // Link module.exports to exports
    sandbox.module.exports = sandbox.exports;

    try {
        // Create context
        const context = vm.createContext(sandbox);
        
        // Run the code
        vm.runInContext(code, context);
        
        // Retrieve the exports
        const exportedModule = sandbox.module.exports;

        // Execute the requested entry point
        if (exportedModule && typeof exportedModule[entryPoint] === 'function') {
            return await exportedModule[entryPoint](triggerData);
        } else if (typeof exportedModule === 'function' && entryPoint === 'run') {
            // Handle case where user might do: module.exports = async () => { ... }
            return await exportedModule(triggerData);
        } else {
            // Check if they put it on exports directly (exports.run = ...) which is covered by module.exports alias above, 
            // but let's be safe if they broke the link.
            if (sandbox.exports && typeof sandbox.exports[entryPoint] === 'function') {
                return await sandbox.exports[entryPoint](triggerData);
            }
            throw new Error(`Entry point '${entryPoint}' not found. Ensure you are exporting it: exports.${entryPoint} = ...`);
        }
    } catch (e) {
        throw new Error(`Script Execution Error: ${e.message}`);
    }
}

// --- Routes ---

// SSE Endpoint for Logs
app.get('/api/logs', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    logClients.push(res);

    // Initial connection message
    res.write(`data: ${JSON.stringify({
        timestamp: new Date().toLocaleTimeString(),
        source: 'SYSTEM',
        type: 'info',
        message: 'Connected to Log Stream'
    })}\n\n`);

    req.on('close', () => {
        const index = logClients.indexOf(res);
        if (index !== -1) {
            logClients.splice(index, 1);
        }
    });
});

app.get('/api/adobe/apps', async (req, res) => {
    if (!bridgeReady) {
        // Return a list of simulated apps so the UI dropdown is functional during development/simulation
        return res.json([
            { id: 'photoshop', name: 'Photoshop (Simulated)', specifier: 'photoshop' },
            { id: 'illustrator', name: 'Illustrator (Simulated)', specifier: 'illustrator' },
            { id: 'indesign', name: 'InDesign (Simulated)', specifier: 'indesign' }
        ]);
    }
    res.json(adobeBridge.getInstalledApps());
});

app.post('/api/execute/node', async (req, res) => {
    try {
        const result = await runNodeCode(req.body);
        res.json({ success: true, result, state: GLOBAL_STATE });
    } catch (error) {
        console.error(error.message); // This will now stream to UI
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- Watchers ---
const activeWatchers = {};

app.post('/api/watchers/sync', (req, res) => {
    const { configs, envVars } = req.body; 
    
    // Clear old watchers not in the list
    Object.keys(activeWatchers).forEach(id => {
        if (!configs.some(c => c.id === id)) {
            activeWatchers[id].close();
            delete activeWatchers[id];
        }
    });

    // Add/Update watchers
    configs.forEach(config => {
        if (activeWatchers[config.id]) activeWatchers[config.id].close();
        
        const watcher = chokidar.watch(config.target, { ignoreInitial: true });
        watcher.on('add', async (filePath) => {
            console.log(`[Watcher Trigger] ${config.id} -> File: ${filePath}`);
            try {
                await runNodeCode({
                    ...config.flowContext,
                    triggerData: { filePath, event: 'ADD' },
                    envVars,
                    entryPoint: 'run'
                });
            } catch (e) {
                console.error(`[Watcher Error] ${config.id}:`, e.message);
            }
        });
        activeWatchers[config.id] = watcher;
    });

    res.json({ success: true, activeCount: Object.keys(activeWatchers).length });
});

app.listen(PORT, () => {
    console.log(`Sidecar running on port ${PORT}`);
});
