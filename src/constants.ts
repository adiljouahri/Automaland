

export const INITIAL_UI_SCHEMA = JSON.stringify({
  title: "Asset Processor",
  description: "Define inputs for the automation flow.",
  type: "object",
  properties: {
    folderPath: {
      type: "string",
      title: "Input Folder",
      default: "./input"
    },
    clientName: {
      type: "string",
      title: "Client Name",
      default: "Acme Corp"
    }
  }
}, null, 2);

export const INITIAL_NODE_CODE = `// Panel 3: Node.js Orchestrator
// Available: fs, path, axios, state, utils, triggerData
// Special Bridge: $ (Use $.run_jsx(code) to control host apps)

const fs = require('fs');

// 1. Main Flow (Run via 'Run Main' button)
exports.run = async (triggerData) => {
  console.log("🚀 Starting Orchestration...");
  
  // Example: Update UI from Node (Real-time feedback)
  utils.setUI('clientName', 'Processing Started...');
  
  // A. Node Logic
  const msg = \`Processing for \${triggerData.clientName}\`;
  console.log(msg);

  // B. Call Host App (Waits for result!)
  // Note: We use the code from Panel 2, or write inline JSX here.
  // This example assumes Panel 2 has utility functions defined.
  
  const appResult = await $.run_jsx(\`
      var docName = "Untitled";
      if (app.documents.length > 0) {
          docName = app.activeDocument.name;
      } else {
          var doc = app.documents.add();
          docName = doc.name;
      }
      "Created/Found: " + docName;
  \`);

  console.log("✅ App Returned: " + appResult);
  
  // Reset UI
  utils.setUI('clientName', 'Done!');
  
  return { success: true, appData: appResult };
};

// 2. Individual Action (Run via 'resetApp' button in UI)
exports.resetApp = async () => {
    console.log("Closing all documents...");
    await $.run_jsx("while(app.documents.length > 0) { app.activeDocument.close(SaveOptions.DONOTSAVECHANGES); }");
    console.log("Reset Complete.");
};`;

export const INITIAL_APP_CODE = `// Panel 2: Host App Library (ExtendScript)
// This code is loaded into the app context.
// You can define helper functions here that Node.js can call via $.run_jsx()

function alertUser(msg) {
    alert("Node says: " + msg);
}

function getActiveLayerName() {
    if (app.documents.length === 0) return "No Doc";
    return app.activeDocument.activeLayer.name;
}`;
