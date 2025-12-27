import { GoogleGenAI, Type } from "@google/genai";
import { AutomationFlow, AIProvider, AppSettings, LogEntry } from "../types";

const SYSTEM_INSTRUCTION = `
You are the Senior Automation Architect for "TriPanel Automator".
Your job is to generate three strictly coupled panels of code based on a user request.

### THE ARCHITECTURE
1. **Panel 1: UI Schema (JSON Schema Draft 7)**
   - Defines the inputs the user sees.
   - **CRITICAL**: Must be a **FLAT** object (depth 1). Do NOT use nested objects.
   - Supported types: \`string\`, \`integer\`, \`number\`, \`boolean\`.
   - Use \`enum\` for dropdowns.
   - Keys defined here (e.g., "myFolder") are passed to Panel 2 as \`triggerData.myFolder\`.

2. **Panel 2: Node.js Orchestrator (Server-Side)**
   - Entry point: \`exports.run = async (triggerData) => { ... }\`.
   - \`triggerData\` contains the values from the UI Panel.
   - **Available Globals**:
     - \`fs\`, \`path\`, \`axios\`: Standard Node libs.
     - \`utils.download(url, dest)\`: Download helper.
     - \`utils.setUI(key, val)\`: Updates the UI form in real-time.
     - \`$.run_jsx(codeString)\`: Executes ExtendScript in the Host App (Panel 3).
     - \`$.state\`: Shared persistent state object.
   - **Action Buttons**: Any function exported (e.g., \`exports.processImages = ...\`) becomes a clickable button in the Dashboard.

3. **Panel 3: Host App Code (ExtendScript / ES3)**
   - Runs inside Photoshop, Illustrator, or InDesign.
   - **Syntax**: ES3 (No \`const\`, \`let\`, or arrow functions. Use \`var\` and \`function\`).
   - Define helper functions here (e.g., \`function openFile(path) { ... }\`).
   - These functions are called by Node.js via \`$.run_jsx("return openFile('" + path + "')")\`.

### STANDARD LIBRARY: FILE & FOLDER SELECTION
If the user needs to select a file or folder, **DO NOT** create custom function names. Use these EXACT functions in **Panel 3 (App Code)**:

1. For Folders:
   \`function selectFolder() { var f = Folder.selectDialog("Select Folder"); return f ? f.fsName : null; }\`

2. For Files:
   \`function selectFile() { var f = File.openDialog("Select File"); return f ? f.fsName : null; }\`

**CRITICAL - Calling from Node.js (Panel 2):**
When calling these functions, you **MUST** include \`return\` in the string passed to \`run_jsx\`, otherwise the result will be null.

**Correct:**
\`const path = await $.run_jsx('return selectFolder()');\`

**Incorrect:**
\`const path = await $.run_jsx('selectFolder()');\` // WRONG: Returns null/undefined

### CODE FORMATTING RULES
1. **Multi-line Strings**: Ensure \`nodeCode\` and \`appCode\` use actual newline characters (\\n) for readability.
2. **Do NOT Minify**: The code must be readable in the editor.
3. **Indentation**: Use 2 spaces for indentation.

### RESPONSE FORMAT
Return a JSON object with:
- \`name\`: Short, action-oriented title.
- \`explanation\`: A concise message to the user describing what was built. **CRITICAL**: Explicitly mention how they can automate this flow using a "Watcher" (File Watcher or Schedule) in the Settings panel.
- \`uiSchema\`: A valid JSON Schema **STRING**.
- \`nodeCode\`: The Node.js logic (Formatted with newlines).
- \`appCode\`: The ExtendScript logic (Formatted with newlines).
- \`targetApp\`: 'photoshop', 'illustrator', or 'indesign'.
- \`simulatedLogs\`: Array of 5 strings showing a successful run.
`;

export const generateAutomationFlow = async (
  prompt: string, 
  settings: AppSettings,
  currentFlow?: AutomationFlow,
  contextLogs?: LogEntry[]
): Promise<Partial<AutomationFlow> & { explanation?: string }> => {
  
  const { aiApiKey, aiProvider, aiModel, aiBaseUrl } = settings;

  if (!aiApiKey) {
    throw new Error("Missing API Key in settings. Please go to Settings and enter your key.");
  }

  // Construct Context Block
  let contextBlock = "";
  if (currentFlow) {
      contextBlock = `
### CURRENT FLOW CONTEXT
**Target App:** ${currentFlow.targetApp}

**1. Node.js Code (Current):**
\`\`\`javascript
${currentFlow.nodeCode}
\`\`\`

**2. Host App Code (Current):**
\`\`\`javascript
${currentFlow.appCode}
\`\`\`

**3. UI Schema (Current):**
\`\`\`json
${currentFlow.uiSchema}
\`\`\`
`;
  }

  // Add Log Context if available
  if (contextLogs && contextLogs.length > 0) {
      // Filter for recent logs, prioritizing errors, max 20 entries
      const recentLogs = contextLogs.slice(-20);
      const logString = recentLogs.map(l => `[${l.timestamp}] [${l.source}] ${l.type.toUpperCase()}: ${l.message}`).join('\n');
      contextBlock += `
### RECENT EXECUTION LOGS
Use these logs to debug issues. If there are errors, fix the code accordingly.
\`\`\`
${logString}
\`\`\`
`;
  }

  const userPrompt = currentFlow 
    ? `Request: "${prompt}".\n\n${contextBlock}\n\nBased on the Request and the Context above, update the flow. Fix any errors seen in the logs. Ensure code is properly formatted with newlines. Remember to use 'return' in $.run_jsx calls.`
    : `Create a new automation flow for: "${prompt}". Ensure code is properly formatted with newlines. Remember to use 'return' in $.run_jsx calls.`;

  if (aiProvider === 'gemini') {
    const ai = new GoogleGenAI({ apiKey: aiApiKey });
    
    // Note: We use Type.STRING for uiSchema, but sometimes models return objects.
    // We handle this in the return block below.
    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING },
        explanation: { type: Type.STRING },
        uiSchema: { type: Type.STRING }, 
        nodeCode: { type: Type.STRING },
        appCode: { type: Type.STRING },
        targetApp: { type: Type.STRING },
        simulatedLogs: { type: Type.ARRAY, items: { type: Type.STRING } }
      },
      required: ["name", "uiSchema", "nodeCode", "appCode", "simulatedLogs", "explanation"]
    };

    const response = await ai.models.generateContent({
      model: aiModel || 'gemini-2.0-flash', // Default to a smart model
      contents: userPrompt,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: responseSchema,
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");
    
    const parsed = JSON.parse(text);

    // SANITIZATION: Ensure uiSchema is a string
    if (typeof parsed.uiSchema === 'object') {
        parsed.uiSchema = JSON.stringify(parsed.uiSchema, null, 2);
    }
    
    // Force newlines if they were escaped incorrectly by the model (rare but happens)
    if (parsed.nodeCode && !parsed.nodeCode.includes('\n')) {
        parsed.nodeCode = parsed.nodeCode.replace(/\\n/g, '\n').replace(/;/g, ';\n');
    }
    if (parsed.appCode && !parsed.appCode.includes('\n')) {
        parsed.appCode = parsed.appCode.replace(/\\n/g, '\n').replace(/;/g, ';\n');
    }

    return parsed;
  }

  // --- FALLBACK FOR OTHER PROVIDERS (OpenAI / Claude) ---
  let url = '';
  let headers: Record<string, string> = { 'Content-Type': 'application/json' };
  let body: any = {};

  if (aiProvider === 'openai' || aiProvider === 'custom') {
    url = aiBaseUrl || 'https://api.openai.com/v1/chat/completions';
    headers['Authorization'] = `Bearer ${aiApiKey}`;
    body = {
      model: aiModel,
      messages: [
        { role: 'system', content: SYSTEM_INSTRUCTION + "\nReturn ONLY valid JSON." },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' }
    };
  } else if (aiProvider === 'claude') {
    url = 'https://api.anthropic.com/v1/messages';
    headers['x-api-key'] = aiApiKey;
    headers['anthropic-version'] = '2023-06-01';
    body = {
      model: aiModel,
      system: SYSTEM_INSTRUCTION,
      messages: [{ role: 'user', content: userPrompt }],
      max_tokens: 4096
    };
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error?.message || "AI Request failed");
  }

  const json = await res.json();
  let content = '';

  if (aiProvider === 'openai' || aiProvider === 'custom') {
    content = json.choices[0].message.content;
  } else if (aiProvider === 'claude') {
    content = json.content[0].text;
  }

  const parsedContent = JSON.parse(content);
  // SANITIZATION
  if (typeof parsedContent.uiSchema === 'object') {
      parsedContent.uiSchema = JSON.stringify(parsedContent.uiSchema, null, 2);
  }

  return parsedContent;
};