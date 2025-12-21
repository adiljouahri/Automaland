
import { GoogleGenAI, Type } from "@google/genai";
import { AutomationFlow } from "../types";

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
- **Critical**: Export functions using \`exports.functionName = async (triggerData) => { ... }\`.
- The 'run' function (\`exports.run\`) is the main entry point.
- You can create additional exports (e.g., \`exports.reset\`, \`exports.processBatch\`, \`exports.uploadResults\`). These will automatically appear as "Quick Action" buttons in the Flow Dashboard grid view, allowing users to trigger specific parts of the workflow independently.
- Use \`await $.run_jsx(code)\` to execute code from the Creative App Panel.
`;

export const generateAutomationFlow = async (
  prompt: string, 
  modelName: string,
  apiKey: string,
  currentFlow?: AutomationFlow
): Promise<Partial<AutomationFlow>> => {
  
  if (!apiKey) {
    throw new Error("Missing API Key");
  }

  // Initialize with passed key
  const ai = new GoogleGenAI({ apiKey });

  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      name: { type: Type.STRING, description: "A short, catchy name for this flow" },
      uiSchema: { type: Type.STRING, description: "Valid JSON Schema object serialized as a string" },
      nodeCode: { type: Type.STRING, description: "The Node.js javascript code" },
      adobeCode: { type: Type.STRING, description: "The ExtendScript (JSX) code for the creative app" },
      simulatedLogs: { 
        type: Type.ARRAY, 
        items: { type: Type.STRING },
        description: "A list of strings representing the console output during a successful run."
      }
    },
    required: ["name", "uiSchema", "nodeCode", "adobeCode", "simulatedLogs"]
  };

  const userPrompt = currentFlow 
    ? `Update the current flow based on this request: "${prompt}". 
       Current Node Code: ${currentFlow.nodeCode.substring(0, 500)}...
       Current ExtendScript Code: ${currentFlow.adobeCode.substring(0, 500)}...`
    : `Create a new automation flow for: "${prompt}"`;

  try {
    const response = await ai.models.generateContent({
      model: modelName || 'gemini-3-pro-preview', 
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
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};