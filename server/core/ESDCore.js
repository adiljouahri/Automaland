
"use strict";
const process = require('process');
const FastXML = require("fast-xml-parser");

const EXTENSION_SPEC_NAME = "vscesd";

function GetCoreLib() {
    if (!GetCoreLib.CORE_LIB) {
        const platform = process.platform;
        let core;
        try {
            if (platform === "darwin") {
                core = require("../lib/esdebugger-core/mac/esdcorelibinterface.node");
            } else if (platform === "win32") {
                const arch = process.arch;
                if (arch === "x64" || arch === "arm64") {
                    core = require("../lib/esdebugger-core/win/x64/esdcorelibinterface.node");
                } else {
                    core = require("../lib/esdebugger-core/win/win32/esdcorelibinterface.node");
                }
            }
        } catch (e) {
            console.warn("Native ESD Core library not found. Falling back to simulation mode.");
        }
        GetCoreLib.CORE_LIB = core;
    }
    return GetCoreLib.CORE_LIB;
}

function InitializeCore() {
    const lib = GetCoreLib();
    if (!lib) return -1;
    const result = lib.esdInitialize(EXTENSION_SPEC_NAME, process.pid);
    return result.status;
}

function CleanupCore() {
    const lib = GetCoreLib();
    if (lib) lib.esdCleanup();
}

function RunCoreProcess(proc) {
    if (InitializeCore() === 0) {
        try { proc(); } finally { CleanupCore(); }
    }
}

exports.GetInstalledApplications = () => {
    const apps = [];
    RunCoreProcess(() => {
        const lib = GetCoreLib();
        const result = lib.esdGetInstalledApplicationSpecifiers();
        if (result.status === 0) {
            result.specifiers.forEach(spec => {
                const nameRes = lib.esdGetDisplayNameForApplication(spec);
                if (nameRes.status === 0) apps.push({ specifier: spec, name: nameRes.name });
            });
        }
    });
    return apps;
};

exports.SendDebugMessage = (appSpecifier, body, timeout = 0) => {
    const lib = GetCoreLib();
    if (!lib) return false;
    const result = lib.esdSendDebugMessage(appSpecifier, body, false, timeout);
    return result.status === 0 ? result.serialNumber : false;
};

exports.PumpSession = (handler) => {
    const lib = GetCoreLib();
    if (lib) lib.esdPumpSession(handler);
};

exports.ResolveApplicationSpecifier = (partialSpec) => {
    let resolved = partialSpec;
    RunCoreProcess(() => {
        const lib = GetCoreLib();
        const result = lib.esdResolveApplicationSpecifier(partialSpec);
        if (result.status === 0) resolved = result.specifier;
    });
    return resolved;
};
