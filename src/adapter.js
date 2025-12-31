export const ADAPTER_CODE = `
"use strict";

const fs = require("fs");
const path = require("path");
const process = require("process");
const events = require("events");
console.log('aaaaaaaaaaaaa')
const FastXML = require("fast-xml-parser");
console.log(FastXML)
const XML_OPTIONS = {
    attributeNamePrefix: "@",
    ignoreAttributes: false,
    parseAttributeValue: true,
    textNodeName: "#value",
};

/**
 * ExtendScriptFacade provides a high-level interface to the ExtendScript Debugger core.
 */
class ExtendScriptFacade extends events.EventEmitter {
    constructor(libRoot) {
        super();
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

        if (platform === "darwin") {
            relativePath = "esdebugger-core/mac/esdcorelibinterface.node";
        } else if (platform === "win32") {
            if (arch === "x64") {
                relativePath = "esdebugger-core/win/x64/esdcorelibinterface.node";
            } else {
                relativePath = "esdebugger-core/win/win32/esdcorelibinterface.node";
            }
        } else {
             throw new Error(\`Platform \${platform} not supported.\`);
        }

        const fullPath = path.join(this.libRoot, relativePath);
        
        console.log(\`[ExtendScriptFacade] Attempting to load native module from: \${fullPath}\`);
        
        if (!fs.existsSync(fullPath)) {
            const flatPath = path.join(this.libRoot, "esdcorelibinterface.node");
            if (fs.existsSync(flatPath)) {
                console.log(\`[ExtendScriptFacade] Found at fallback path: \${flatPath}\`);
                return require(flatPath);
            }
            throw new Error(\`Module file not found at: \${fullPath}\`);
        }

        try {
            return require(fullPath);
        } catch (e) {
            console.error(\`[ExtendScriptFacade] Load error: \${e.message}\`);
            if (e.message.includes("specified module could not be found")) {
                console.error("This usually means a dependency DLL (like esdcorelib.dll) is missing from the same directory.");
            }
            throw e;
        }
    }

    async initialize(specName = "tripanel-esd") {
        if (!this.core) return false;
        if (this.isInitialized) return true;

        const result = this.core.esdInitialize(specName, process.pid);
        if (result.status !== 0 && result.status !== 11) {
            throw new Error(\`Failed to initialize core. Code: \${result.status}\`);
        }

        this.isInitialized = true;

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
        if (this.activeRequests.has(message.serialNumber)) {
            const { resolve, reject } = this.activeRequests.get(message.serialNumber);
            if (reason === 3) {
                resolve(message);
            } else {
                reject(new Error(\`Message Error: \${message.body} (Reason: \${reason})\`));
            }
            
            if (reason >= 3) {
                this.activeRequests.delete(message.serialNumber);
            }
            return;
        }
        this.emit("message", { reason, message });
    }

    destroy() {
        if (this.pumpInterval) clearInterval(this.pumpInterval);
        if (this.core) {
            this.core.esdCleanup();
        }
        this.isInitialized = false;
    }

    getInstalledApps() {
        if (!this.core) return [];
        try {
            const result = this.core.esdGetInstalledApplicationSpecifiers();
            if (result.status !== 0) return [];

            return result.specifiers.map(spec => {
                const displayName = this.core.esdGetDisplayNameForApplication(spec).name || spec;
                const cleanName = displayName.replace(/Adobe\\s*/gi, '');
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

    compileToJSXBin(source, filePath = "", includePath = "") {
        if (!this.core) throw new Error("Native core unavailable");
        const result = this.core.esdCompileToJSXBin(source, filePath, includePath);
        if (result.status === 0) return result.output;
        throw new Error(\`Compilation failed: \${result.error || result.status}\`);
    }

    async evaluate(appSpecifier, source, engineName = "main", timeoutMs = 5000, waitForResponse = true) {
             if (!this.core) {
                return "Simulation Mode: Adobe Bridge not active.";
            }
            const resolveRes = this.core.esdResolveApplicationSpecifier(appSpecifier);
            if (resolveRes.status !== 0) {
                throw new Error(\`Could not resolve application specifier '\${appSpecifier}'. Code: \${resolveRes.status}\`);
            }
            const resolvedSpec = resolveRes.specifier;
            // Wrap source in CDATA as per ESTK protocol
            const escapedSource = source.replace(/]]>/g, \`]]]]><![CDATA[>\`);
            const xmlCommand = \`<eval engine="\${engineName}"><source><![CDATA[\${escapedSource}]]></source></eval>\`;
            return new Promise((resolve, reject) => {
                const serial = this.core.esdSendDebugMessage(resolvedSpec, xmlCommand, false, 0);
                if (serial === false) return reject(new Error("Failed to send message"));
    
                if (!waitForResponse) {
                    // Return immediately indicating the command was sent.
                    // The actual result should be handled via HTTP callback.
                    return resolve("Sent");
                }
    
                const timeoutId = setTimeout(() => {
                    if (this.activeRequests.has(serial)) {
                        this.activeRequests.delete(serial);
                        reject(new Error(\`Timeout: Bridge did not acknowledge command within \${timeoutMs}ms.\`));
                    }
                }, timeoutMs);
    
                this.activeRequests.set(serial.serialNumber, {
                    resolve: (msg) => {
                        clearTimeout(timeoutId);
                        try {
                            const parsed = FastXML.parse(msg.body, XML_OPTIONS);
                            console.log(parsed)
                            resolve(parsed.evalresult['value']['#value']);
                        } catch (e) {
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
`;