
import { invoke } from '@tauri-apps/api/core';
import { AutomationFlow } from '../types';

// Helper to check if running in Tauri environment
const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export class LocalStoreService {
    static async init() {
        if (!isTauri()) {
            console.log("Web Mode detected: using localStorage instead of SQLite.");
            return;
        }
        try {
            await invoke('init_db');
        } catch (e) {
            console.error("Failed to init local DB", e);
        }
    }

    static async getFlows(userId?: number): Promise<AutomationFlow[]> {
        // Fallback for Web Mode
        if (!isTauri()) {
            try {
                const stored = localStorage.getItem('local_flows_db');
                if (!stored) return [];
                const flows = JSON.parse(stored) as AutomationFlow[];
                 // Hydrate dates and history
                return flows.map(f => ({
                    ...f,
                    chatHistory: (f.chatHistory || []).map((c: any) => ({...c, timestamp: new Date(c.timestamp)})),
                    strapiId: undefined
                }));
            } catch(e) { return []; }
        }

        try {
            const flowsJson = await invoke<string>('get_local_flows');
            const flows = JSON.parse(flowsJson);
            
            // Hydrate chat history, ensure types, and map legacy adobeCode to appCode
            return flows.map((f: any) => ({
                ...f,
                appCode: f.appCode || f.adobeCode || '', // Map adobeCode from Rust to appCode for Frontend
                chatHistory: typeof f.chatHistory === 'string' ? JSON.parse(f.chatHistory) : f.chatHistory,
                savedFormData: f.savedFormData ? JSON.parse(f.savedFormData) : {},
                history: f.history ? JSON.parse(f.history) : [], // Parse history from string
                strapiId: undefined // Local flows don't use strapiId
            })).filter((f: AutomationFlow) => {
                if (userId && f.ownerId && f.ownerId !== userId) return false;
                return true;
            });
        } catch (e) {
            console.error("Failed to load local flows", e);
            return [];
        }
    }

    static async saveFlow(flow: AutomationFlow): Promise<void> {
        const payload = {
            ...flow,
            chatHistory: flow.chatHistory, // Tauri backend expects string, but we handle stringify there or here depending on logic. Rust expects string.
            isPublic: false
        };

        // Fallback for Web Mode
        if (!isTauri()) {
            const current = await this.getFlows();
            const index = current.findIndex(f => f.flowId === flow.flowId);
            if (index >= 0) current[index] = flow;
            else current.push(flow);
            localStorage.setItem('local_flows_db', JSON.stringify(current));
            return;
        }

        // Rust expects chatHistory as a JSON string and uses 'adobeCode' column
        const rustPayload = {
            ...payload,
            adobeCode: flow.appCode, // Map appCode to adobeCode for Rust persistence
            chatHistory: JSON.stringify(flow.chatHistory),
            savedFormData: JSON.stringify(flow.savedFormData || {}),
            history: JSON.stringify(flow.history || []) // Serialize history to string
        };

        await invoke('save_local_flow', { flow: JSON.stringify(rustPayload) });
    }

    static async deleteFlow(flowId: string): Promise<void> {
        if (!isTauri()) {
            const current = await this.getFlows();
            const filtered = current.filter(f => f.flowId !== flowId);
            localStorage.setItem('local_flows_db', JSON.stringify(filtered));
            return;
        }
        await invoke('delete_local_flow', { flowId });
    }
}
