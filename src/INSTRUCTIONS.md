
import { GoogleGenAI, Type } from "@google/genai";
import { AutomationFlow, AIProvider, AppSettings, LogEntry } from "../types";
import { SYSTEM_INSTRUCTION as DEFAULT_SYSTEM_INSTRUCTION } from "../constants";

const SECURITY_INSTRUCTION = `
You are a Cyber Security Auditor specializing in Node.js and ExtendScript automation.
Your job is to analyze the provided code for security risks, malware indicators, and logic errors.

### RISKS TO LOOK FOR:
1. **Malicious Obfuscation**: Base64 encoded strings, eval() usage, packed code.
2. **File System Abuse**: Unrestricted deletion (rm -rf /), writing to system directories outside the intended workflow.
3. **Network Exfiltration**: Sending data to unknown/suspicious IP addresses or domains.
4. **Infinite Loops**: Logic that freezes the application.
5. **Logic Errors**: Missing returns, improper async/await usage.

### RESPONSE FORMAT
Return a JSON object with:
- \`status\`: 'SAFE', 'WARNING', or 'DANGER'.
- \`score\`: 0 to 100 (100 is perfectly safe).
- \`analysis\`: A detailed markdown explanation of findings.
- \`recommendation\`: Short advice on whether to run this code.
`;

export const verifyAutomationFlow = async (
  flow: AutomationFlow,
  settings: AppSettings
): Promise<{ status: 'SAFE' | 'WARNING' | 'DANGER', score: number, analysis: string, recommendation: string }> => {
  const { aiApiKey, aiProvider, aiModel, aiBaseUrl } = settings;

  if (!aiApiKey) {
    throw new Error("Missing API Key. Please configure it in Settings.");
  }

  const userPrompt = `
  Please analyze this automation flow for security risks.

  **Node.js Code:**
  \`\`\`javascript
  ${flow.nodeCode}
  \`\`\`

  **Host App Code (ExtendScript):**
  \`\`\`javascript
  ${flow.appCode}
  \`\`\`
  `;

  if (aiProvider === 'gemini') {
    const ai = new GoogleGenAI({ apiKey: aiApiKey });
    const responseSchema = {
        type: Type.OBJECT,
        properties: {
          status: { type: Type.STRING, enum: ["SAFE", "WARNING", "DANGER"] },
          score: { type: Type.NUMBER },
          analysis: { type: Type.STRING },
          recommendation: { type: Type.STRING }
        },
        required: ["status", "score", "analysis", "recommendation"]
    };

    const response = await ai.models.generateContent({
        model: aiModel || 'gemini-1.5-pro',
        contents: userPrompt,
        config: {
            systemInstruction: SECURITY_INSTRUCTION,
            responseMimeType: "application/json",
            responseSchema: responseSchema,
        }
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI Auditor");
    return JSON.parse(text);
  }

  // Fallback for OpenAI/Claude
  let url = '';
  let headers: Record<string, string> = { 'Content-Type': 'application/json' };
  let body: any = {};

  if (aiProvider === 'openai' || aiProvider === 'custom') {
    url = aiBaseUrl || 'https://api.openai.com/v1/chat/completions';
    headers['Authorization'] = `Bearer ${aiApiKey}`;
    body = {
      model: aiModel,
      messages: [
        { role: 'system', content: SECURITY_INSTRUCTION + "\nReturn ONLY valid JSON." },
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
      system: SECURITY_INSTRUCTION,
      messages: [{ role: 'user', content: userPrompt }],
      max_tokens: 2048
    };
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    throw new Error("AI Verification Failed");
  }

  const json = await res.json();
  let content = '';

  if (aiProvider === 'openai' || aiProvider === 'custom') {
    content = json.choices[0].message.content;
  } else if (aiProvider === 'claude') {
    content = json.content[0].text;
  }

  return JSON.parse(content);
};

export const generateAutomationFlow = async (
  prompt: string, 
  modelNameOrSettings: string | AppSettings,
  apiKeyOrFlow?: string | AutomationFlow,
  currentFlowOrLogs?: AutomationFlow | LogEntry[] | undefined,
  settingsOrLogs?: AppSettings | LogEntry[] | undefined,
  contextLogs?: LogEntry[]
): Promise<Partial<AutomationFlow> & { explanation?: string }> => {
  
  // Handle polymorphic arguments
  let aiSettings: AppSettings;
  let flowContext: AutomationFlow | undefined;
  let logsContext: LogEntry[] | undefined = undefined;
  
  if (typeof modelNameOrSettings === 'object') {
      aiSettings = modelNameOrSettings as AppSettings;
      flowContext = apiKeyOrFlow as AutomationFlow | undefined;
      
      // Determine where logs are passed (App.tsx sends them as 5th argument, undefined as 4th)
      if (Array.isArray(settingsOrLogs)) {
          logsContext = settingsOrLogs as LogEntry[];
      } else if (Array.isArray(currentFlowOrLogs)) {
          logsContext = currentFlowOrLogs as LogEntry[];
      }
  } else {
      // Legacy call support
      aiSettings = {
          aiApiKey: apiKeyOrFlow as string,
          aiModel: modelNameOrSettings as string,
          aiProvider: 'gemini',
          serverUrl: '', strapiUrl: '', theme: 'dark'
      };
      flowContext = currentFlowOrLogs as AutomationFlow | undefined;
      logsContext = contextLogs;
  }

  const { aiApiKey, aiProvider, aiModel, aiBaseUrl } = aiSettings;

  if (!aiApiKey) {
    throw new Error("Missing API Key");
  }

  // Construct Context Block
  let contextBlock = "";
  if (flowContext) {
      contextBlock = `
### CURRENT FLOW CONTEXT
**Target App:** ${flowContext.targetApp}

**1. Node.js Code (Current):**
\`\`\`javascript
${flowContext.nodeCode}
\`\`\`

**2. Host App Code (Current):**
\`\`\`javascript
${flowContext.appCode}
\`\`\`

**3. UI Schema (Current):**
\`\`\`json
${flowContext.uiSchema}
\`\`\`
`;
  }

  // Add Log Context if available
  if (logsContext && logsContext.length > 0) {
      const recentLogs = logsContext.slice(-20);
      const logString = recentLogs.map(l => `[${l.timestamp}] [${l.source}] ${l.type.toUpperCase()}: ${l.message}`).join('\n');
      contextBlock += `
### RECENT EXECUTION LOGS
Use these logs to debug issues. If there are errors, fix the code accordingly.
\`\`\`
${logString}
\`\`\`
`;
  }

  const userPrompt = flowContext 
    ? `Request: "${prompt}".\n\n${contextBlock}\n\nBased on the Request and the Context above, update the flow. Fix any errors seen in the logs. Ensure code is properly formatted with newlines. Remember to use 'return' in $.run_jsx calls.`
    : `Create a new automation flow for: "${prompt}". Ensure code is properly formatted with newlines. Remember to use 'return' in $.run_jsx calls.`;

  if (aiProvider === 'gemini') {
    const ai = new GoogleGenAI({ apiKey: aiApiKey });
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
      model: aiModel || 'gemini-1.5-pro', 
      contents: userPrompt,
      config: {
        systemInstruction: aiSettings.systemInstruction || DEFAULT_SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: responseSchema,
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");
    
    const parsed = JSON.parse(text);
    if (typeof parsed.uiSchema === 'object') {
        parsed.uiSchema = JSON.stringify(parsed.uiSchema, null, 2);
    }
    return parsed;
  }

  // Fallback for OpenAI/Claude
  let url = '';
  let headers: Record<string, string> = { 'Content-Type': 'application/json' };
  let body: any = {};

  if (aiProvider === 'openai' || aiProvider === 'custom') {
    url = aiBaseUrl || 'https://api.openai.com/v1/chat/completions';
    headers['Authorization'] = `Bearer ${aiApiKey}`;
    body = {
      model: aiModel,
      messages: [
        { role: 'system', content: (aiSettings.systemInstruction || DEFAULT_SYSTEM_INSTRUCTION) + "\nReturn ONLY valid JSON." },
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
      system: aiSettings.systemInstruction || DEFAULT_SYSTEM_INSTRUCTION,
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
  if (typeof parsedContent.uiSchema === 'object') {
      parsedContent.uiSchema = JSON.stringify(parsedContent.uiSchema, null, 2);
  }

  return parsedContent;
};
