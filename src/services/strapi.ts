
import { AuthResponse, AutomationFlow, User, Report } from "../types";

export class StrapiService {
  private baseUrl: string;
  private token: string | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    this.token = localStorage.getItem('strapi_jwt');
  }

  setToken(token: string) {
    this.token = token;
    localStorage.setItem('strapi_jwt', token);
  }

  logout() {
    this.token = null;
    localStorage.removeItem('strapi_jwt');
  }

  isAuthenticated(): boolean {
    return !!this.token;
  }

  getProviderAuthUrl(provider: 'google'): string {
    return `${this.baseUrl}/api/connect/${provider}`;
  }

  async login(identifier: string, password: string): Promise<AuthResponse> {
    const res = await fetch(`${this.baseUrl}/api/auth/local`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || 'Login failed');
    }
    const data = await res.json();
    this.setToken(data.jwt);
    return data;
  }

  async register(username: string, email: string, password: string): Promise<AuthResponse> {
    const res = await fetch(`${this.baseUrl}/api/auth/local/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || 'Registration failed');
    }
    const data = await res.json();
    this.setToken(data.jwt);
    return data;
  }

  async getMe(): Promise<User> {
    if (!this.token) throw new Error("No token");
    const res = await fetch(`${this.baseUrl}/api/users/me`, {
       headers: { 'Authorization': `Bearer ${this.token}` }
    });
    if (!res.ok) throw new Error("Invalid token");
    return await res.json();
  }

  /**
   * Helper to look up a Public Flow by UUID
   * Returns object containing id, documentId, and attributes
   */
  private async lookupPublicByFlowId(flowId: string): Promise<{ id: number, documentId?: string, attributes?: any, [key: string]: any } | null> {
      try {
          const res = await fetch(`${this.baseUrl}/api/flow-publics?filters[flowId][$eq]=${flowId}&status=published`, {
              headers: { 'Authorization': `Bearer ${this.token}` }
          });
          if (!res.ok) return null;
          const json = await res.json();
          if (json.data && json.data.length > 0) {
              return json.data[0];
          }
          return null;
      } catch (e) {
          return null;
      }
  }

  /**
   * FETCH PUBLIC FLOWS ONLY
   */
  async getPublicFlows(user?: User | null): Promise<AutomationFlow[]> {
    if (!this.token) return [];
    try {
      const res = await fetch(`${this.baseUrl}/api/flow-publics?populate=*&sort=createdAt:desc&pagination[pageSize]=100&status=published`, {
        headers: { 'Authorization': `Bearer ${this.token}` },
      });
      if (!res.ok) return [];
      const json = await res.json();

      return (json.data || []).map((item: any) => {
        let id = item.id;
        let documentId = item.documentId; // Strapi 5 Public ID
        
        // Safely check for env variable to disable ID fix
        let disableIdFix = false;
        try {
            // @ts-ignore
            if (typeof process !== 'undefined' && process.env && process.env.DISABLE_STRAPI_ID_FIX === 'true') {
                disableIdFix = true;
            }
        } catch(e) {}

        if (!disableIdFix && typeof id === 'number') id = id - 1;

        const attrs = item.attributes || item; 
        
        // Owner Resolution
        let ownerId = undefined;
        const uPermUser = attrs.users_permissions_user?.data || attrs.users_permissions_user;
        const simpleUser = attrs.user?.data || attrs.user;
        const userObj = uPermUser || simpleUser;
        if (userObj) {
            const rawId = typeof userObj === 'object' ? userObj.id : userObj;
            ownerId = !isNaN(Number(rawId)) ? Number(rawId) : rawId;
        }

        return {
          id: `public-${id}`, 
          strapiId: id,
          documentId: documentId,
          flowId: attrs.flowId || `legacy-${id}`,
          name: attrs.name || 'Untitled Flow',
          uiSchema: attrs.uiSchema || '{}',
          nodeCode: attrs.nodeCode || '',
          appCode: attrs.adobeCode || attrs.appCode || '', // Map adobeCode or appCode
          targetApp: attrs.targetApp || 'photoshop',
          isPublic: true,
          ownerId: ownerId,
          chatHistory: typeof attrs.chatHistory === 'string' 
            ? JSON.parse(attrs.chatHistory) 
            : (attrs.chatHistory || []).map((c: any) => ({...c, timestamp: new Date(c.timestamp)})),
          createdAt: attrs.createdAt ? new Date(attrs.createdAt).getTime() : Date.now()
        };
      }).sort((a: AutomationFlow, b: AutomationFlow) => b.createdAt - a.createdAt);

    } catch (e) {
      console.error("Error fetching public flows:", e);
      return [];
    }
  }

  /**
   * Save a Public Flow (Updates if exists, Creates if new)
   */
  async savePublicFlow(flow: AutomationFlow, user?: User | null): Promise<{ id: number, formattedId: string }> {
    if (!this.token) throw new Error('Not authenticated');
    if (!flow.flowId) throw new Error("Flow is missing UUID flowId");

    // 1. Check if it exists publicly
    const existing = await this.lookupPublicByFlowId(flow.flowId);

    // 2. Payload
    const payload = {
      data: {
        name: flow.name,
        uiSchema: flow.uiSchema,
        nodeCode: flow.nodeCode,
        adobeCode: flow.appCode, // Send appCode as adobeCode for backward compatibility if backend expects it
        targetApp: flow.targetApp,
        chatHistory: JSON.stringify(flow.chatHistory),
        flowId: flow.flowId,
        isPublic: true,
        user: user?.id
      }
    };

    // 3. Action
    let url, method;
    if (existing) {
        // Strapi 5 uses documentId, Strapi 4 uses id
        const identifier = existing.documentId || existing.id;
        url = `${this.baseUrl}/api/flow-publics/${identifier}?status=published`;
        method = 'PUT';
    } else {
        url = `${this.baseUrl}/api/flow-publics?status=published`;
        method = 'POST';
    }

    const res = await fetch(url, {
        method,
        headers: { 
            'Authorization': `Bearer ${this.token}`,
            'Content-Type': 'application/json' 
        },
        body: JSON.stringify(payload),
    });
    
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || `Failed to save public flow`);
    }
    
    const json = await res.json();
    const newDbId = json.data?.id || json.id;

    return { 
        id: newDbId, 
        formattedId: `public-${newDbId}` 
    };
  }

  async deletePublicFlow(flowId: string) {
    if (!this.token) return;
    const record = await this.lookupPublicByFlowId(flowId);
    if (record) {
        // Strapi 5 uses documentId, Strapi 4 uses id
        const identifier = record.documentId || record.id;
        await fetch(`${this.baseUrl}/api/flow-publics/${identifier}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${this.token}` },
        });
    }
  }

  async submitReport(flowId: string, reason: string, description: string, userId?: number) {
      if (!this.token) throw new Error("You must be logged in to submit a report.");
      
      const payload = {
          data: {
              flowId: flowId,
              reason: reason,
              description: description,
              reportStatus: 'pending',
              resolvedBy: userId // Field renamed from 'user' per requirements
          }
      };

      const res = await fetch(`${this.baseUrl}/api/reports`, {
          method: 'POST',
          headers: { 
              'Authorization': `Bearer ${this.token}`,
              'Content-Type': 'application/json' 
          },
          body: JSON.stringify(payload)
      });
      
      if (!res.ok) {
          const err = await res.json();
          // If 404, likely means Reports collection doesn't exist yet, but we shouldn't crash the client
          if (res.status === 404) {
              console.warn("Server does not support reports yet.");
              return;
          }
          throw new Error(err.error?.message || "Failed to submit report");
      }
      return await res.json();
  }

  async getUserReports(userId: number): Promise<Report[]> {
      if (!this.token) return [];
      try {
          // Filter by 'resolvedBy' (formerly user) relation. 
          const res = await fetch(`${this.baseUrl}/api/reports?filters[resolvedBy][id][$eq]=${userId}&sort=createdAt:desc`, {
              headers: { 'Authorization': `Bearer ${this.token}` }
          });
          
          if (!res.ok) {
              // Graceful degradation if reports endpoint doesn't exist or forbidden
              return [];
          }

          const json = await res.json();
          return (json.data || []).map((item: any) => {
              const attrs = item.attributes || item;
              return {
                  id: item.id,
                  flowId: attrs.flowId,
                  reason: attrs.reason,
                  description: attrs.description,
                  reportStatus: attrs.reportStatus || 'pending',
                  adminFeedback: attrs.adminFeedback,
                  createdAt: attrs.createdAt
              };
          });
      } catch (e) {
          console.error("Failed to fetch reports", e);
          return [];
      }
  }
}
