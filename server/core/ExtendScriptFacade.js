"use strict";

const fs = require("fs");
const path = require("path");
const process = require("process");
const events = require("events");
const FastXML = require("fast-xml-parser");

/**
 * Native library paths using the requested .node.js extension convention.
 * These are assumed to be located in the sidecar's lib directory.
 */
const CORE_LIB_PATH = {
    darwin: "../lib/esdebugger-core/mac/esdcorelibinterface.node",
    win64: "../lib/esdebugger-core/win/x64/esdcorelibinterface.node",
    win32: "../lib/esdebugger-core/win/win32/esdcorelibinterface.node"
};

const XML_OPTIONS = {
    attributeNamePrefix: "@",
    ignoreAttributes: false,
    parseAttributeValue: true,
    textNodeName: "#value",
};

/**
 * ExtendScriptFacade provides a high-level interface to the ExtendScript Debugger core.
 * It manages the lifecycle of the bridge and provides methods to evaluate code in creative apps.
 */
class ExtendScriptFacade extends events.EventEmitter {
    constructor(libRoot) {
        super();
        // Default to __dirname for dev mode if not provided, though passing explicit path is safer
        this.libRoot = libRoot || __dirname;
        this.core = null;
        this.isInitialized = false;
        this.pumpInterval = null;
        this.activeRequests = new Map();

        try {
            this.core = this._loadCore();
        } catch (e) {
            console.warn("Creative App Engine native library not found. Running in simulation mode.", e.message);
        }
    }

    _loadCore() {
        const platform = process.platform;
        const arch = process.arch;
        let relativePath = "";

        // Determine relative path to .node file inside the lib folder
        if (platform === "darwin") {
            relativePath = "esdebugger-core/mac/esdcorelibinterface.node";
        } else if (platform === "win32") {
            if (arch === "x64") {
                relativePath = "esdebugger-core/win/x64/esdcorelibinterface.node";
            } else {
                relativePath = "esdebugger-core/win/win32/esdcorelibinterface.node";
            }
        } else {
             throw new Error(`Platform ${platform} not supported.`);
        }

        // Construct full path using the libRoot provided in constructor.
        // This ensures we look in the 'lib' folder we copied manually in bundle.js.
        const fullPath = path.join(this.libRoot, relativePath);
        
        console.log(`[ExtendScriptFacade] Attempting to load native module from: ${fullPath}`);
        
        if (!fs.existsSync(fullPath)) {
            // Check if fallback exists in root (rare case but good safety)
            const flatPath = path.join(this.libRoot, "esdcorelibinterface.node");
            if (fs.existsSync(flatPath)) {
                console.log(`[ExtendScriptFacade] Found at fallback path: ${flatPath}`);
                return require(flatPath);
            }
            throw new Error(`Module file not found at: ${fullPath}`);
        }

        try {
            // Dynamic require to load the .node file.
            // Since we copied the full folder structure, sibling DLLs should be found by the OS loader.
            return require(fullPath);
        } catch (e) {
            console.error(`[ExtendScriptFacade] Load error: ${e.message}`);
            // On Windows, specific error 126 or 127 usually means missing DLL dependencies
            if (e.message.includes("specified module could not be found")) {
                console.error("This usually means a dependency DLL (like esdcorelib.dll) is missing from the same directory.");
            }
            throw e;
        }
    }

    /**
     * Initializes the bridge and starts the message pump
     */
    async initialize(specName = "tripanel-esd") {
        if (!this.core) return false;
        if (this.isInitialized) return true;

        const result = this.core.esdInitialize(specName, process.pid);
        if (result.status !== 0 && result.status !== 11) {
            throw new Error(`Failed to initialize core. Code: ${result.status}`);
        }

        this.isInitialized = true;

        // Start pumping messages (Required for async responses)
        this.pumpInterval = setInterval(() => {
            if (this.core) {
                this.core.esdPumpSession((reason, message) => {
                    this._handleMessage(reason, message);
                });
            }
        }, 50);

        return true;
    }

    _handleMessage(reason, message) {
        // Reason 3 = Response, 4 = Error, 5 = Timeout
        if (this.activeRequests.has(message.serialNumber)) {
            const { resolve, reject } = this.activeRequests.get(message.serialNumber);
            if (reason === 3) {
                // Parse XML body if necessary, or just return the raw message object
                resolve(message);
            } else {
                reject(new Error(`Message Error: ${message.body} (Reason: ${reason})`));
            }
            
            if (reason >= 3) {
                this.activeRequests.delete(message.serialNumber);
            }
            return;
        }

        // Emit for general events like prints (reason 1) or breaks
        this.emit("message", { reason, message });
    }

    /**
     * Shuts down the library and stops the pump
     */
    destroy() {
        if (this.pumpInterval) clearInterval(this.pumpInterval);
        if (this.core) {
            this.core.esdCleanup();
        }
        this.isInitialized = false;
    }

    /**
     * Returns a list of installed creative applications
     */
    getInstalledApps() {
        if (!this.core) return [];
        try {
            const result = this.core.esdGetInstalledApplicationSpecifiers();
            if (result.status !== 0) return [];

            return result.specifiers.map(spec => {
                const displayName = this.core.esdGetDisplayNameForApplication(spec).name || spec;
                // Strip the word "Adobe" from the name for UI consistency as per guidelines
                const cleanName = displayName.replace(/Adobe\s*/gi, '');
                return {
                    specifier: spec,
                    id: spec.split('-')[0],
                    name: cleanName
                };
            });
        } catch (e) {
            console.error("Error getting installed apps:", e);
            return [];
        }
    }

    /**
     * Compiles ExtendScript source to JSXBin
     */
    compileToJSXBin(source, filePath = "", includePath = "") {
        if (!this.core) throw new Error("Native core unavailable");
        const result = this.core.esdCompileToJSXBin(source, filePath, includePath);
        if (result.status === 0) return result.output;
        throw new Error(`Compilation failed: ${result.error || result.status}`);
    }

    /**
     * High-level: Evaluate script in a specific app/engine
     * Uses the ESTK 3 Debugging Protocol XML format
     */
    async evaluate(appSpecifier, source, engineName = "main") {
         if (!this.core) {
            return "Simulation Mode: Adobe Bridge not active.";
        }
        const resolveRes = this.core.esdResolveApplicationSpecifier(appSpecifier);
        if (resolveRes.status !== 0) {
            throw new Error(`Could not resolve application specifier '${appSpecifier}'. Code: ${resolveRes.status}`);
        }
        const resolvedSpec = resolveRes.specifier;
        // Wrap source in CDATA as per ESTK protocol
        const escapedSource = source.replace(/]]>/g, `]]]]><![CDATA[>`);
        const xmlCommand = `<eval engine="${engineName}"><source><![CDATA[${escapedSource}]]></source></eval>`;
        return new Promise((resolve, reject) => {
            const serial = this.core.esdSendDebugMessage(resolvedSpec, xmlCommand, false, 0);
            if (serial === false) return reject(new Error("Failed to send message"));

            // 10-second timeout to prevent indefinite hanging
            const timeoutId = setTimeout(() => {
                if (this.activeRequests.has(serial)) {
                    this.activeRequests.delete(serial);
                    reject(new Error("Timeout: Script execution took longer than 10 seconds."));
                }
            }, 100);

            this.activeRequests.set(serial, {
                resolve: (msg) => {
                    clearTimeout(timeoutId);
                    // console.log(msg)
                    try {
                        const parsed = FastXML.parse(msg.body, XML_OPTIONS);
                        resolve(parsed.evalresult);
                    } catch (e) {
                        // Return raw body if XML parsing fails
                        resolve(msg.body);
                    }
                },
                reject: (err) => {
                    clearTimeout(timeoutId);
                    reject(err);
                }
            });
        });
    }

}

module.exports = ExtendScriptFacade;