import { invoke } from '@tauri-apps/api/core';
import { AutomationFlow } from '../types';

export class LocalStoreService {
    static async init() {
        try {
            await invoke('init_db');
        } catch (e) {
            console.error("Failed to init local DB", e);
        }
    }

    static async getFlows(userId?: number): Promise<AutomationFlow[]> {
        try {
            const flowsJson = await invoke<string>('get_local_flows');
            const flows = JSON.parse(flowsJson) as AutomationFlow[];
            
            // Hydrate chat history and ensure types
            return flows.map(f => ({
                ...f,
                chatHistory: typeof f.chatHistory === 'string' ? JSON.parse(f.chatHistory) : f.chatHistory,
                strapiId: undefined // Local flows don't use strapiId
            })).filter(f => {
                // Filter by owner if userId is provided, assuming local store might store multiple users' data? 
                // Or usually local store is single user. We'll return all for now or filter by ownerId if present.
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
            chatHistory: JSON.stringify(flow.chatHistory),
            isPublic: false // Enforce private
        };
        await invoke('save_local_flow', { flow: JSON.stringify(payload) });
    }

    static async deleteFlow(flowId: string): Promise<void> {
        await invoke('delete_local_flow', { flowId });
    }
}