import { GoogleGenAI, Type } from "@google/genai";
import { AutomationFlow, AppSettings } from "../types";

const SYSTEM_INSTRUCTION = `
You are an expert Senior Automation Architect for the "TriPanel Automator" app.
This app orchestrates workflows using three distinct panels:
1. UI Panel: JSON Schema (Draft 7) for user input forms.
2. Node.js Panel: Server-side logic using standard Node modules + a 'utils' helper.
3. Creative App Panel: ExtendScript (ES3) for Photoshop/Illustrator automation.

Your goal is to generate working code for all three panels based on the user's request.
Also provide a list of 5-8 realistic execution logs that would appear when this script runs successfully.

Context:
- Node.js environment has 'fs', 'path', 'axios' and a global 'utils' object.
- Creative environment is ExtendScript (ES3). usage: 'app.activeDocument', 'alert()', etc.
- UI Schema should match the inputs needed by the Node script.
- Important: Never use the word "Adobe" in descriptions or UI titles. Use names like "Photoshop", "Illustrator", "InDesign", or "Creative App".

Node.js Panel Best Practices:
- The Node.js script acts as the orchestrator.
- **Critical**: Export functions using 'exports.functionName = async (triggerData) => { ... }'.
- The 'run' function ('exports.run') is the main entry point.
- Use 'await $.run_jsx(code)' to execute code from the Creative App Panel.
`;

export const generateAutomationFlow = async (
  prompt: string, 
  settings: AppSettings,
  currentFlow?: AutomationFlow
): Promise<Partial<AutomationFlow>> => {
  
  const { aiApiKey, aiProvider, aiModel, aiBaseUrl } = settings;

  if (!aiApiKey) {
    throw new Error("Missing API Key in settings. Please go to Settings and enter your key.");
  }

  const userPrompt = currentFlow 
    ? `Update the current flow based on this request: "${prompt}". 
       Current Node Code: ${currentFlow.nodeCode.substring(0, 500)}...
       Current ExtendScript Code: ${currentFlow.adobeCode.substring(0, 500)}...`
    : `Create a new automation flow for: "${prompt}"`;

  if (aiProvider === 'gemini') {
    // Initialize with the key provided in GUI settings
    const ai = new GoogleGenAI({ apiKey: aiApiKey });
    
    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING },
        uiSchema: { type: Type.STRING },
        nodeCode: { type: Type.STRING },
        adobeCode: { type: Type.STRING },
        simulatedLogs: { type: Type.ARRAY, items: { type: Type.STRING } }
      },
      required: ["name", "uiSchema", "nodeCode", "adobeCode", "simulatedLogs"]
    };

    const response = await ai.models.generateContent({
      model: aiModel || 'gemini-3-pro-preview',
      contents: userPrompt,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: responseSchema,
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");
    return JSON.parse(text) as Partial<AutomationFlow>;
  }

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

  return JSON.parse(content) as Partial<AutomationFlow>;
};