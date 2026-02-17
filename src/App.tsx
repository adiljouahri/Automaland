
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Play, MessageSquare, Cpu, Image as ImageIcon, Settings, RefreshCw, Plus, Download, Trash2, List, Zap, Sun, Moon, LayoutGrid, Edit3, LogOut, User as UserIcon, Globe, Lock, Share2, Loader2, CloudUpload, Import, History, Clock, Undo, Eye, FileJson, AlertOctagon, Key, CheckSquare, Square, ShieldCheck, Flag, Bell, ExternalLink, X } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core'; // Import invoke from Tauri
import { save, ask } from '@tauri-apps/plugin-dialog';
import { open } from '@tauri-apps/plugin-shell';
import { CodeEditor } from './components/CodeEditor';
import { FormRenderer } from './components/FormRenderer';
import { LogConsole } from './components/LogConsole';
import { SettingsModal } from './components/SettingsModal';
import { ReportModal } from './components/ReportModal';
import { generateAutomationFlow, verifyAutomationFlow } from './services/ai';
import { StrapiService } from './services/strapi';
import { LocalStoreService } from './services/local';
import { AutomationFlow, LogEntry, ChatMessage, AppStatus, AppSettings, EnvVariable, WatcherConfig, NpmPackage, HostAppConfig, User, FlowVersion, Announcement } from './types';
import { INITIAL_UI_SCHEMA, INITIAL_NODE_CODE, INITIAL_APP_CODE } from './constants';
import { ADAPTER_CODE } from './adapter';

function App() {
  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem('app_settings');
    if (saved) return JSON.parse(saved);
     return {
      aiApiKey: '',
      aiProvider: 'gemini',
      aiModel: 'gemini-3-flash',
      serverUrl: 'http://localhost:3001',
      strapiUrl: 'https://tripanelserver-9a123e242287.herokuapp.com',
      theme: 'dark'
    };
  });

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const addLog = useCallback((msg: string, source: LogEntry['source'], type: LogEntry['type'] = 'info') => {
      setLogs(prev => [...prev, { id: Math.random().toString(36), timestamp: new Date().toLocaleTimeString(), source, message: msg, type }]);
  }, []);

  useEffect(() => {
    localStorage.setItem('app_settings', JSON.stringify(settings));
  }, [settings]);

  // --- SYNC SERVER PORT (POLLING) ---
  useEffect(() => {
      let attempts = 0;
      const maxAttempts = 15; // Try for 15 seconds
      let synced = false;

      const syncPort = async () => {
          try {
              // Only check for server config if in Tauri mode
              if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
                  const configStr = await invoke<string>('get_server_config');
                  if (configStr && configStr !== '{}') {
                      const config = JSON.parse(configStr);
                      if (config.url && config.port) {
                          setSettings(prev => {
                              if (prev.serverUrl !== config.url) {
                                  addLog(`Synced Server Port: ${config.url}`, "SYSTEM", "success");
                                  return { ...prev, serverUrl: config.url };
                              }
                              return prev;
                          });
                          return true;
                      }
                  }
              }
          } catch (e) {
              // Ignore in web mode
          }
          return false;
      };

      // Initial check
      syncPort();

      // Poll every 1s
      const interval = setInterval(async () => {
          attempts++;
          if (synced || attempts >= maxAttempts) {
              clearInterval(interval);
              return;
          }
          
          const success = await syncPort();
          if (success) {
              synced = true;
              clearInterval(interval);
          }
      }, 1000);

      return () => clearInterval(interval);
  }, []); 
  
  const strapi = useMemo(() => new StrapiService(settings.strapiUrl), [settings.strapiUrl]);
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isPollingAuth, setIsPollingAuth] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authData, setAuthData] = useState({ identifier: '', password: '', email: '', username: '' });
  const [manualToken, setManualToken] = useState('');
  const [showManualToken, setShowManualToken] = useState(false);
  
  const [envVars, setEnvVars] = useState<EnvVariable[]>([]);
  
  // Watchers: Load from localStorage on init
  const [watchers, setWatchers] = useState<WatcherConfig[]>(() => {
      const saved = localStorage.getItem('app_watchers');
      if (saved) {
          try { return JSON.parse(saved); } catch(e) { console.error("Failed to parse local watchers:", e); }
      }
      return [];
  });

  const [packages, setPackages] = useState<NpmPackage[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [reportModalReason, setReportModalReason] = useState<string | undefined>(undefined);
  const [availableApps, setAvailableApps] = useState<HostAppConfig[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [viewMode, setViewMode] = useState<'editor' | 'grid'>('editor');
  
  // Announcement State
  const [activeAnnouncement, setActiveAnnouncement] = useState<Announcement | null>(null);

  // Initial State: Try to load active flow ID from localStorage
  const [flows, setFlows] = useState<AutomationFlow[]>([]);
  const [activeFlowId, setActiveFlowId] = useState<string>(() => {
      return localStorage.getItem('active_flow_id') || 'default-flow-1';
  });

  // Persist Active Flow ID
  useEffect(() => {
      if (activeFlowId) {
          localStorage.setItem('active_flow_id', activeFlowId);
      }
  }, [activeFlowId]);

  const activeFlow = useMemo(() => {
    const found = flows.find(f => f.id === activeFlowId);
    if (found) return found;
    if (flows.length > 0) return flows[0];
    return null; 
  }, [flows, activeFlowId]);
  
  useEffect(() => {
      if (activeFlow && activeFlow.id !== activeFlowId) {
          setActiveFlowId(activeFlow.id);
      }
  }, [activeFlow, activeFlowId]);

  // --- SYNC FORM DATA ON FLOW SWITCH ---
  useEffect(() => {
      if (activeFlow) {
          setFormData(activeFlow.savedFormData || {});
      } else {
          setFormData({});
      }
  }, [activeFlow?.id]);
  
  // --- CHECK ANNOUNCEMENTS ---
  useEffect(() => {
      const checkAnnouncements = async () => {
          const items = await strapi.getAnnouncements();
          if (items.length > 0) {
              const latest = items[0];
              const lastSeen = localStorage.getItem('last_seen_announcement');
              
              // Only show if ID is greater/different than last seen
              if (!lastSeen || Number(latest.id) > Number(lastSeen)) {
                  setActiveAnnouncement(latest);
              }
          }
      };
      
      checkAnnouncements();
  }, [strapi]);

  const handleDismissAnnouncement = () => {
      if (activeAnnouncement) {
          localStorage.setItem('last_seen_announcement', activeAnnouncement.id.toString());
          setActiveAnnouncement(null);
      }
  };

  // Use loose equality for owner check to handle potential string/number mismatches from API
  const isOwner = activeFlow ? (activeFlow.ownerId == user?.id || !activeFlow.ownerId || !activeFlow.isPublic) : false;
  
  const [sidebarTab, setSidebarTab] = useState<'chat' | 'flows'>('chat');
  const [flowListFilter, setFlowListFilter] = useState<'all' | 'mine' | 'public'>('all');

  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [formData, setFormData] = useState<Record<string, any>>({});
  
  const [chatInput, setChatInput] = useState('');
  // Context inclusion state
  const [includeContext, setIncludeContext] = useState(true);
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [isSaving, setIsSaving] = useState(false);
  const isSavingRef = useRef(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const isDark = settings.theme === 'dark';

  // Helper for confirmations
  const confirmAction = async (msg: string, title: string = "Confirmation") => {
      if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
          return await ask(msg, { title, kind: 'warning' });
      }
      return window.confirm(msg);
  };

  const safeServerRequest = useCallback(async (endpoint: string, options?: RequestInit) => {
    try {
        const url = `${settings.serverUrl}${endpoint}`;
        const res = await fetch(url, options);
        if (!res.ok) {
            const errText = await res.text().catch(() => res.statusText);
            throw new Error(`HTTP ${res.status}: ${errText}`);
        }
        return res;
    } catch (e: any) {
        addLog(`Sidecar Error (${endpoint}): ${e.message}`, "SYSTEM", "error");
        throw e;
    }
  }, [settings.serverUrl, addLog]);

  useEffect(() => {
    if (!settings.serverUrl) return;
    const eventSource = new EventSource(`${settings.serverUrl}/api/logs`);
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // Handle OAuth Success from Sidecar via SSE (Faster than polling)
        if (data.source === 'AUTH_SUCCESS') {
            try {
                const authData = JSON.parse(data.message);
                if (authData.jwt) {
                    strapi.setToken(authData.jwt);
                    strapi.getMe().then(u => {
                        setUser(u);
                        setIsAuthLoading(false);
                        setIsPollingAuth(false);
                        setAuthError(null);
                        addLog(`Logged in as ${u.username}`, "SYSTEM", "success");
                    }).catch(e => {
                        console.error("Auth Success SSE received but validation failed:", e);
                        // Let the polling loop catch this error to show it in UI
                    });
                }
            } catch(e) {
                console.error("Failed to parse Auth message:", e);
            }
            return;
        }

        if (data.source === 'UI_SYNC') {
            try {
                const updates = JSON.parse(data.message);
                setFormData(prev => ({ ...prev, ...updates }));
            } catch(e) {
                console.error("Failed to parse UI_SYNC message:", e);
            }
            return;
        }

        setLogs(prev => [...prev, { 
            id: Math.random().toString(36), 
            timestamp: data.timestamp, 
            source: data.source || 'NODE', 
            message: data.message, 
            type: data.type || 'info' 
        }]);
      } catch (e) {
          console.error("Failed to parse SSE event:", e);
      }
    };
    eventSource.onerror = (e) => { eventSource.close(); };
    return () => { eventSource.close(); };
  }, [settings.serverUrl, strapi, addLog]);

  useEffect(() => {
    LocalStoreService.init().catch(e => console.error("DB Init error", e));
  }, []);

  // --- INITIAL AUTH CHECK ---
  useEffect(() => {
    const handleAuthCheck = async () => {
        // Only run on initial mount if not already polling (user manually triggered login)
        if (isPollingAuth) return;
        
        setIsAuthLoading(true);
        
        // 1. Check for Params (Web Mode Fallback)
        const params = new URLSearchParams(window.location.search);
        const jwt = params.get('jwt');
        if (jwt) {
             strapi.setToken(jwt);
             window.history.replaceState({}, document.title, window.location.pathname);
        }

        // 2. Validate current session
        if (strapi.isAuthenticated()) {
            try {
                const u = await strapi.getMe();
                setUser(u);
                addLog(`Welcome back, ${u.username}`, "SYSTEM", "success");
            } catch (e) {
                console.warn("Session invalid or expired:", e);
                strapi.logout(); // Critical: Clear bad token
                setUser(null);
            }
        } else {
            setUser(null);
        }
        setIsAuthLoading(false);
    };
    handleAuthCheck();
  }, [strapi, addLog]); // Intentionally minimal deps

  // --- POLLING FOR AUTH (ROBUST) ---
  useEffect(() => {
     if (!isPollingAuth) return;
     
     const interval = setInterval(async () => {
        try {
            const res = await fetch(`${settings.serverUrl}/api/auth/poll`);
            if (res.ok) {
                const authState = await res.json();
                
                // Status: success | error | idle | pending
                if (authState.status === 'success' && authState.data && authState.data.jwt) {
                    const receivedToken = authState.data.jwt;
                    strapi.setToken(receivedToken);
                    
                    try {
                        const u = await strapi.getMe();
                        setUser(u);
                        setIsPollingAuth(false);
                        setIsAuthLoading(false);
                        setAuthError(null);
                        addLog(`Logged in as ${u.username}`, "SYSTEM", "success");
                    } catch(validationErr: any) {
                         // Token was returned but Strapi rejected it. 
                         console.warn("Direct Validation Failed.", validationErr);
                         setAuthError(`Authentication Failed. The token was received but invalid.`);
                         strapi.logout();
                         setIsPollingAuth(false);
                         setIsAuthLoading(false);
                         setShowManualToken(true);
                    }
                } else if (authState.status === 'error') {
                    // Server reported an error from the callback (e.g. Strapi failed to create user)
                    setAuthError(`Login Failed: ${authState.error || "Unknown Error"}`);
                    setIsPollingAuth(false);
                    setIsAuthLoading(false);
                    // Automatically show manual token screen on error
                    setShowManualToken(true);
                }
            }
        } catch(e) {
            // Network error during poll - just retry
        }
     }, 1000); 
     return () => clearInterval(interval);
  }, [isPollingAuth, settings.serverUrl, settings.strapiUrl, strapi, addLog]);

  // Use callback to ensure loadAllFlows doesn't cause infinite re-renders if added to dependencies, 
  // but can still be called safely.
  const loadAllFlows = useCallback(async () => {
    // Pass user object to LocalStoreService
    const localFlows = await LocalStoreService.getFlows(user);
    let publicFlows: AutomationFlow[] = [];
    if (strapi.isAuthenticated() && user) {
        // Pass user object to StrapiService
        publicFlows = await strapi.getPublicFlows(user);
    }

    setFlows(prev => {
        const flowMap = new Map<string, AutomationFlow>();
        publicFlows.forEach(pf => flowMap.set(pf.flowId, pf));
        localFlows.forEach(lf => {
            if (!flowMap.has(lf.flowId)) {
                lf.id = `private-${lf.flowId}`; 
                flowMap.set(lf.flowId, lf);
            }
        });
        
        const merged = Array.from(flowMap.values()).sort((a, b) => b.createdAt - a.createdAt);
        if (merged.length === 0) {
            return [{
                id: 'default-flow-1',
                flowId: 'default-uuid-1',
                name: 'Default Automation',
                uiSchema: INITIAL_UI_SCHEMA,
                nodeCode: INITIAL_NODE_CODE,
                appCode: INITIAL_APP_CODE,
                targetApp: 'photoshop',
                simulatedLogs: [],
                isPublic: false,
                chatHistory: [{
                id: 'welcome',
                role: 'model',
                text: 'Hello! I am your AI Architect. Try: "Watch a folder for JPGs, watermark them in Photoshop, and upload to S3."',
                timestamp: new Date()
                }],
                createdAt: Date.now(),
                history: [],
                executionTimeout: 10,
                savedFormData: {}
            }];
        }
        return merged;
    });
  }, [user, strapi]);

  useEffect(() => {
    loadAllFlows();
  }, [loadAllFlows]); // Safe dependency as loadAllFlows is memoized

  useEffect(() => {
    if (isEditingName && nameInputRef.current) {
        nameInputRef.current.focus();
    }
  }, [isEditingName]);

  const handleSaveFlow = async (flowToSave?: AutomationFlow) => {
    if (isSavingRef.current) return;
    
    const targetId = flowToSave?.id || activeFlowId;
    const freshFlow = flows.find(f => f.id === targetId);

    if (!freshFlow) return;

    const target = { 
        ...freshFlow, 
        savedFormData: formData,
        ...(flowToSave || {}) 
    };

    if (!target.flowId) target.flowId = crypto.randomUUID();

    isSavingRef.current = true;
    setIsSaving(true);

    try {
        if (target.isPublic) {
            if (!strapi.isAuthenticated()) throw new Error("Must be logged in to save public flows.");
            // Pass user object to savePublicFlow
            await strapi.savePublicFlow(target, user);
            await LocalStoreService.deleteFlow(target.flowId);
            addLog(`Flow "${target.name}" published/updated to Cloud.`, "SYSTEM", "success");
        } else {
            if (!target.ownerId && user) target.ownerId = user.id;
            const newVersion: FlowVersion = {
                timestamp: Date.now(),
                name: target.name,
                nodeCode: target.nodeCode,
                appCode: target.appCode,
                uiSchema: target.uiSchema
            };
            // FIX: Keep the latest 15 versions. .slice(0, 15) keeps first 15 (newest).
            const updatedHistory = [newVersion, ...(target.history || [])].slice(0, 15);
            const flowWithHistory = { ...target, history: updatedHistory };
            
            // Pass user object to saveFlow
            await LocalStoreService.saveFlow(flowWithHistory, user);
            
            updateActiveFlow({ 
                history: updatedHistory,
                savedFormData: formData 
            });
            
            if (strapi.isAuthenticated()) await strapi.deletePublicFlow(target.flowId);
            addLog(`Flow "${target.name}" saved locally.`, "SYSTEM", "success");
        }
    } catch (e: any) {
      addLog(`Failed to save: ${e.message}`, "SYSTEM", "error");
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  };

  const handleExportJSON = async () => {
    if (!activeFlow) return;
    const exportData = {
        ...activeFlow,
        history: [], 
        id: undefined 
    };
    const content = JSON.stringify(exportData, null, 2);

    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      try {
        const filePath = await save({
          filters: [{
            name: 'JSON',
            extensions: ['json']
          }],
          defaultPath: `${activeFlow.name.replace(/\s+/g, '_')}_export.json`
        });

        if (filePath) {
          await invoke('save_text_file', { path: filePath, content });
          addLog(`Exported Flow to ${filePath}`, "SYSTEM", "success");
        }
      } catch (e: any) {
        addLog(`Export Failed: ${e.message}`, "SYSTEM", "error");
      }
    } else {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(content);
      const downloadAnchorNode = document.createElement('a');
      downloadAnchorNode.setAttribute("href", dataStr);
      downloadAnchorNode.setAttribute("download", `${activeFlow.name.replace(/\s+/g, '_')}_export.json`);
      document.body.appendChild(downloadAnchorNode);
      downloadAnchorNode.click();
      downloadAnchorNode.remove();
      addLog("Exported Flow to JSON (Browser Download).", "SYSTEM", "info");
    }
  };

  const handleImportJSON = (event: React.ChangeEvent<HTMLInputElement>) => {
    const fileReader = new FileReader();
    if (event.target.files && event.target.files.length > 0) {
        fileReader.readAsText(event.target.files[0], "UTF-8");
        fileReader.onload = async (e) => {
            try {
                if (e.target?.result) {
                    const parsed = JSON.parse(e.target.result as string);
                    if (!parsed.nodeCode || !parsed.uiSchema) throw new Error("Invalid Flow JSON");
                    
                    const newId = `imported-${Date.now()}`;
                    const importedFlow: AutomationFlow = {
                        ...parsed,
                        id: newId,
                        flowId: crypto.randomUUID(), 
                        name: `${parsed.name} (Imported)`,
                        ownerId: user?.id,
                        isPublic: false,
                        createdAt: Date.now(),
                        history: [],
                        chatHistory: parsed.chatHistory || [],
                        savedFormData: parsed.savedFormData || {}
                    };
                    
                    setFlows(prev => [importedFlow, ...prev]);
                    setActiveFlowId(newId);
                    await LocalStoreService.saveFlow(importedFlow, user);
                    addLog("Imported Flow successfully.", "SYSTEM", "success");
                }
            } catch (err) {
                addLog("Failed to import JSON.", "SYSTEM", "error");
            }
        };
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleRestoreVersion = async (v: FlowVersion) => {
      if(!(await confirmAction(`Restore version from ${new Date(v.timestamp).toLocaleString()}? Unsaved changes will be lost.`, "Restore Version"))) return;
      updateActiveFlow({
          name: v.name,
          nodeCode: v.nodeCode,
          appCode: v.appCode,
          uiSchema: v.uiSchema
      });
      setShowHistory(false);
      addLog(`Restored version from ${new Date(v.timestamp).toLocaleTimeString()}`, "SYSTEM", "info");
  };

  useEffect(() => {
      localStorage.setItem('app_watchers', JSON.stringify(watchers));
  }, [watchers]);

  useEffect(() => {
    const activeWatchersList = watchers.filter(w => w.active);
    
    if (true) {
      const configs = activeWatchersList.map(w => {
        const flow = flows.find(f => f.id === w.flowId);
        return {
          id: w.id,
          target: w.target,
          type: w.type || 'FOLDER',
          interval: w.interval,
          flowContext: flow ? { code: flow.nodeCode, targetApp: flow.targetApp, appCode: flow.appCode } : null
        };
      }).filter(c => c.flowContext !== null);

      safeServerRequest('/api/watchers/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          configs,
          envVars: envVars.reduce((acc, curr) => ({ ...acc, [curr.key]: curr.value }), {}),
          // IMPORTANT: Watchers need adapter code too if they trigger flows
          adapterCode: ADAPTER_CODE
        })
      }).catch(() => {});
    }
  }, [watchers, flows, envVars, safeServerRequest]);

  const handlePublish = async () => {
    if (!isOwner || !activeFlow) return;
    if (!strapi.isAuthenticated()) {
        alert("Please login to publish flows.");
        return;
    }
    
    if(!(await confirmAction("Publish to Public Cloud? This will make the flow visible to everyone. You can't undo this action (only delete).", "Publish Flow"))) return;
    
    const updatedFlow = { ...activeFlow, isPublic: true };
    updateActiveFlow({ isPublic: true });
    await handleSaveFlow(updatedFlow);
  };

  const handleImport = async () => {
    if (!activeFlow) return;
    const newId = `private-${crypto.randomUUID()}`;
    const newFlowId = crypto.randomUUID();
    const importedFlow: AutomationFlow = {
        ...activeFlow,
        id: newId,
        flowId: newFlowId,
        name: `${activeFlow.name} (Imported)`,
        isPublic: false,
        ownerId: user?.id,
        createdAt: Date.now(),
        strapiId: undefined,
        history: [],
        savedFormData: activeFlow.savedFormData || {}
    };
    setFlows(prev => [importedFlow, ...prev]);
    setActiveFlowId(newId);
    await LocalStoreService.saveFlow(importedFlow, user);
    addLog(`Imported "${activeFlow.name}" to local library.`, "SYSTEM", "success");
  };

  const handleDuplicateFlow = () => {
     if (!activeFlow) return;
     const newId = `flow-copy-${Date.now()}`;
     const copy: AutomationFlow = {
         ...activeFlow,
         id: newId,
         flowId: crypto.randomUUID(),
         strapiId: undefined, 
         ownerId: user?.id,
         name: `${activeFlow.name} (Copy)`,
         isPublic: false,
         createdAt: Date.now(),
         history: [],
         savedFormData: activeFlow.savedFormData || {}
     };
     setFlows(prev => [copy, ...prev]);
     setActiveFlowId(newId);
     addLog(`Created local copy.`, "SYSTEM", "success");
  };

  const handleManualTokenLogin = async () => {
      if (!manualToken.trim()) return;
      setIsAuthLoading(true);
      setAuthError(null);
      const token = manualToken.trim();
      try {
          strapi.setToken(token);
          const u = await strapi.getMe();
          setUser(u);
          addLog(`Logged in manually as ${u.username}`, "SYSTEM", "success");
      } catch (e: any) {
           console.error("Manual Token Validation Failed:", e);
           setAuthError(`Invalid Token: ${e.message}`);
           strapi.logout();
      } finally {
          setIsAuthLoading(false);
          setIsPollingAuth(false);
      }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAuthLoading(true);
    setAuthError(null);
    try {
      if (authMode === 'login') {
        const res = await strapi.login(authData.identifier, authData.password);
        setUser(res.user);
      } else {
        const res = await strapi.register(authData.username, authData.email, authData.password);
        setUser(res.user);
      }
    } catch (e: any) {
      setAuthError(e.message);
    } finally {
        setIsAuthLoading(false);
    }
  };

  const handleLogout = () => {
    strapi.logout();
    setUser(null);
    setFlows([{
        id: 'default-flow-1',
        flowId: 'default-uuid-1',
        name: 'Default Automation',
        uiSchema: INITIAL_UI_SCHEMA,
        nodeCode: INITIAL_NODE_CODE,
        appCode: INITIAL_APP_CODE,
        targetApp: 'photoshop',
        simulatedLogs: [],
        isPublic: false,
        chatHistory: [],
        createdAt: Date.now(),
        history: [],
        executionTimeout: 10,
        savedFormData: {}
    }]);
    setActiveFlowId('default-flow-1');
  };

  useEffect(() => {
      let mounted = true;
      // Added 5 second delay to allow for native core loading as requested.
      const timer = setTimeout(() => {
        safeServerRequest('/api/host/apps')
          .then(res => res.json())
          .then(data => { if (mounted) setAvailableApps(data); })
          .catch(() => {
              if (mounted) {
                  setAvailableApps([
                      { id: 'photoshop', name: 'Photoshop', specifier: 'photoshop' },
                      { id: 'illustrator', name: 'Illustrator', specifier: 'illustrator' },
                  ]);
              }
          });
      }, 5000);

      return () => { 
        mounted = false; 
        clearTimeout(timer);
      };
  }, [safeServerRequest]);

  const extractActions = (code: string) => {
     const actions: string[] = [];
     const exportsRegex = /exports\.([a-zA-Z0-9_]+)\s*=|exports\[['"]([a-zA-Z0-9_]+)['"]\]\s*=/g;
     let match;
     while ((match = exportsRegex.exec(code)) !== null) {
         actions.push(match[1] || match[2]);
     }
     return actions;
  };

  const updateActiveFlow = (updates: Partial<AutomationFlow>) => {
    if (!activeFlow) return;
    setFlows(prev => prev.map(f => f.id === activeFlowId ? { ...f, ...updates } : f));
  };

  const handleCreateNewFlow = () => {
    const newId = `flow-${Date.now()}`;
    const defaultApp = availableApps.length > 0 ? (availableApps[0].specifier || availableApps[0].id) : 'photoshop';
    const newFlow: AutomationFlow = {
      id: newId,
      flowId: crypto.randomUUID(), 
      name: 'New Untitled Flow',
      uiSchema: INITIAL_UI_SCHEMA,
      nodeCode: INITIAL_NODE_CODE,
      appCode: INITIAL_APP_CODE,
      targetApp: defaultApp,
      targetAppPath: defaultApp,
      isPublic: false,
      ownerId: user?.id,
      chatHistory: [{ id: 'init', role: 'model', text: 'New flow created. What should we build?', timestamp: new Date() }],
      createdAt: Date.now(),
      history: [],
      executionTimeout: 10,
      savedFormData: {}
    };
    setFlows(prev => [newFlow, ...prev]);
    setActiveFlowId(newId);
    setViewMode('editor');
    setSidebarTab('chat');
  };

  const handleDeleteFlow = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const flowToDelete = flows.find(f => f.id === id);
    if (!flowToDelete) return;
    
    if(!(await confirmAction(`Delete flow "${flowToDelete.name}"? This cannot be undone.`, "Delete Flow"))) return;
    
    try {
        if (flowToDelete.isPublic) {
             if(strapi.isAuthenticated()) await strapi.deletePublicFlow(flowToDelete.flowId);
        } else {
             await LocalStoreService.deleteFlow(flowToDelete.flowId);
        }
        addLog("Flow deleted.", "SYSTEM", "info");
    } catch(e: any) {
        addLog(`Failed to delete: ${e.message}`, "SYSTEM", "error");
    }
    const newFlows = flows.filter(f => f.id !== id);
    setFlows(newFlows);
    if (activeFlowId === id) {
        if (newFlows.length > 0) setActiveFlowId(newFlows[0].id);
        else setActiveFlowId(''); 
    }
  };

  const handleVerifyFlow = async () => {
      if (!activeFlow) return;
      setIsVerifying(true);
      
      const userMsg: ChatMessage = { 
          id: Date.now().toString(), 
          role: 'user', 
          text: 'Requesting Security Verification...', 
          timestamp: new Date() 
      };
      updateActiveFlow({ chatHistory: [...activeFlow.chatHistory, userMsg] });

      try {
          const result = await verifyAutomationFlow(activeFlow, settings);
          // ... (Rest of verify logic same)
          const reportText = `### Security Analysis Report
**Status:** ${result.status} (Score: ${result.score}/100)
${result.recommendation}

**Details:**
${result.analysis}
`;
          const aiMsg: ChatMessage = {
              id: (Date.now() + 1).toString(),
              role: 'model',
              text: reportText,
              timestamp: new Date()
          };
          updateActiveFlow({ chatHistory: [...activeFlow.chatHistory, userMsg, aiMsg] });
          addLog(`Verification Complete: ${result.status}`, "SYSTEM", result.status === 'DANGER' ? 'error' : 'info');
      } catch (e: any) {
          const errMsg: ChatMessage = {
              id: (Date.now() + 1).toString(),
              role: 'model',
              text: `Verification Failed: ${e.message}`,
              timestamp: new Date()
          };
          updateActiveFlow({ chatHistory: [...activeFlow.chatHistory, userMsg, errMsg] });
      } finally {
          setIsVerifying(false);
          setSidebarTab('chat');
          if(chatEndRef.current) chatEndRef.current.scrollIntoView({behavior: 'smooth'});
      }
  };

  const handleReportFlowClick = () => {
      if (!activeFlow) return;
      setReportModalReason(undefined);
      setIsReportModalOpen(true);
  };

  const handleSubmitReport = async (reason: string, description: string) => {
      if (!activeFlow && reason !== 'Upgrade Request') return;
      
      // For general reports, use the active flow ID. For upgrade requests, use a dummy or system ID if no flow is active.
      const targetFlowId = activeFlow?.flowId || 'system-request';
      const targetName = activeFlow?.name || 'System';

      try {
          await strapi.submitReport(targetFlowId, reason, description, user?.id);
          addLog(`Report submitted for ${targetName}`, "SYSTEM", "success");
          alert("Thank you. Your request has been received. We will contact you shortly.");
      } catch (e: any) {
          alert(`Failed to submit: ${e.message}`);
          addLog(`Report failed: ${e.message}`, "SYSTEM", "error");
      }
  };

  const handleSendMessage = async () => {
    if (!activeFlow) return;
    // ... rest of handleSendMessage
    if (!isOwner) {
       alert("Duplicate this flow to use AI chat.");
       return;
    }
    if (!chatInput.trim()) return;
    const newUserMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text: chatInput, timestamp: new Date() };
    const updatedHistory = [...activeFlow.chatHistory, newUserMsg];
    updateActiveFlow({ chatHistory: updatedHistory });
    setChatInput('');
    setStatus(AppStatus.GENERATING);
    try {
      const result = await generateAutomationFlow(
          newUserMsg.text, 
          settings, 
          includeContext ? activeFlow : undefined,
          undefined,
          includeContext ? logs : undefined
      ) as any;
      
      const explanation = result.explanation || "Architecture Updated.";
      const flowUpdates = { ...result };
      delete flowUpdates.explanation;
      
      updateActiveFlow({ ...flowUpdates, chatHistory: [...updatedHistory, { id: (Date.now() + 1).toString(), role: 'model', text: explanation, timestamp: new Date() }] });
    } catch (e: any) {
      updateActiveFlow({ chatHistory: [...updatedHistory, { id: (Date.now() + 1).toString(), role: 'model', text: `Error: ${e.message}`, timestamp: new Date() }] });
    } finally { setStatus(AppStatus.IDLE); }
  };

  // ... (Inject Snippet, Run, etc same)
  
  const handleInjectSnippet = (type: 'file_browser' | 'folder_browser') => {
    if (!activeFlow) return;
    const timestamp = Date.now().toString().slice(-4);
    const key = type === 'file_browser' ? `filePath_${timestamp}` : `folderPath_${timestamp}`;
    const actionName = type === 'file_browser' ? `browse_file_${timestamp}` : `browse_folder_${timestamp}`;
    try {
        const newSchema = JSON.parse(activeFlow.uiSchema);
        if (!newSchema.properties) newSchema.properties = {};
        newSchema.properties[key] = { 
            type: "string", 
            title: type === 'file_browser' ? "Select File" : "Select Folder", 
            default: "" 
        };
        const newSchemaStr = JSON.stringify(newSchema, null, 2);
        let newAppCode = activeFlow.appCode;
        if (!newAppCode.includes("function selectfolder")) {
            newAppCode += `\n\nfunction selectfolder() {\n  var fold = Folder.selectDialog("Select Folder");\n  if (fold) return fold.fsName.replace(/\\\\/g, "/");\n  return "Error";\n}`;
        }
        if (!newAppCode.includes("function selectfile")) {
            newAppCode += `\n\nfunction selectfile() {\n  var fold = File.openDialog("Select File");\n  if (fold) return fold.fsName.replace(/\\\\/g, "/");\n  return "Error";\n}`;
        }
        const jsFunction = type === 'file_browser' ? 'return selectfile()' : 'return selectfolder()';
        const newNodeCode = activeFlow.nodeCode + `\n\n// Action: Browse ${type === 'file_browser' ? 'File' : 'Folder'}\nexports.${actionName} = async () => {\n  const result = await $.run_jsx('${jsFunction}');\n  if (result && result !== "Error") {\n    utils.setUI('${key}', result);\n  }\n};`;
        updateActiveFlow({ uiSchema: newSchemaStr, appCode: newAppCode, nodeCode: newNodeCode });
        addLog(`Injected ${type === 'file_browser' ? 'File' : 'Folder'} Picker Snippet`, "SYSTEM", "success");
    } catch (e: any) {
        addLog(`Snippet injection failed: ${e.message}`, "SYSTEM", "error");
    }
  };

  const handleRun = async (entryPoint: string = 'run', specificFlow?: AutomationFlow) => {
    if (status !== AppStatus.IDLE) return;
    const targetFlow = specificFlow || activeFlow;
    if (!targetFlow) return;
    setStatus(AppStatus.RUNNING);
    addLog(`Starting '${entryPoint}'...`, "SYSTEM");
    try {
       const nodePayload = { 
           code: targetFlow.nodeCode, 
           triggerData: formData, 
           envVars: envVars.reduce((acc, curr) => ({...acc, [curr.key]: curr.value}), {}), 
           entryPoint, 
           targetApp: targetFlow.targetApp,
           timeout: targetFlow.executionTimeout || 10,
           appCode: targetFlow.appCode,
           adapterCode: ADAPTER_CODE
       };
       const res = await safeServerRequest('/api/execute/node', { 
           method: 'POST', 
           headers: {'Content-Type': 'application/json'}, 
           body: JSON.stringify(nodePayload) 
       });
       const nodeResponse = await res.json();
       if (!nodeResponse.success) throw new Error(nodeResponse.error || "Node.js Execution Failed");
       addLog(`Action completed.`, "NODE", "success");
    } catch(e: any) { 
    } finally { setStatus(AppStatus.IDLE); }
  };

  const detectedActions = useMemo(() => (!activeFlow) ? [] : extractActions(activeFlow.nodeCode), [activeFlow?.nodeCode]);

  useEffect(() => {
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  }, [activeFlow?.chatHistory]);

  const bgMain = isDark ? "bg-slate-950" : "bg-slate-50";
  const bgSidebar = isDark ? "bg-slate-900/50" : "bg-white border-r border-slate-200";
  const textPrimary = isDark ? "text-slate-200" : "text-slate-800";
  const textSecondary = isDark ? "text-slate-400" : "text-slate-500";
  const borderPrimary = isDark ? "border-slate-800" : "border-slate-200";
  const bgHeader = isDark ? "bg-slate-900" : "bg-white border-b border-slate-200";
  const filteredFlows = useMemo(() => flows.filter(f => {
    if (flowListFilter === 'mine') return f.ownerId === user?.id;
    if (flowListFilter === 'public') return f.isPublic === true;
    return true; 
  }), [flows, flowListFilter, user?.id]);

  // -- MAIN RENDER --
  
  // Announcement Modal
  if (activeAnnouncement) {
      return (
          <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
              <div className={`w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl border animate-in zoom-in-95 duration-200 ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'}`}>
                  <div className={`p-6 border-b flex items-center gap-4 ${isDark ? 'border-slate-800 bg-slate-950/50' : 'border-slate-100 bg-slate-50'}`}>
                       <div className={`p-3 rounded-full ${activeAnnouncement.announcementType === 'alert' ? 'bg-red-500/20 text-red-500' : (activeAnnouncement.announcementType === 'update' ? 'bg-blue-500/20 text-blue-500' : 'bg-slate-500/20 text-slate-500')}`}>
                           <Bell className="w-6 h-6" />
                       </div>
                       <div>
                           <h2 className={`text-lg font-bold ${textPrimary}`}>{activeAnnouncement.title}</h2>
                           <p className="text-xs text-slate-500">{new Date(activeAnnouncement.createdAt).toLocaleDateString()}</p>
                       </div>
                  </div>
                  <div className={`p-6 ${isDark ? 'text-slate-300' : 'text-slate-600'} whitespace-pre-wrap leading-relaxed`}>
                      {activeAnnouncement.message}
                  </div>
                  <div className={`p-4 border-t flex items-center justify-end gap-3 ${isDark ? 'border-slate-800 bg-slate-950/50' : 'border-slate-100 bg-slate-50'}`}>
                      {activeAnnouncement.link && (
                          <a 
                             href={activeAnnouncement.link} 
                             target="_blank" 
                             rel="noopener noreferrer" 
                             className="flex items-center gap-2 text-sm font-medium text-blue-500 hover:underline px-4"
                          >
                              Learn More <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                      )}
                      <button 
                        onClick={handleDismissAnnouncement}
                        className={`px-5 py-2.5 rounded-lg font-bold text-sm bg-blue-600 hover:bg-blue-500 text-white shadow-lg transition-all`}
                      >
                          Dismiss
                      </button>
                  </div>
              </div>
          </div>
      );
  }

  if (isAuthLoading) {
     return (
        <div className={`flex items-center justify-center min-h-screen ${bgMain}`}>
            <div className="flex flex-col items-center">
                <Loader2 className="w-10 h-10 animate-spin text-blue-500 mb-4" />
                <h2 className={`${textPrimary} text-lg font-bold`}>
                    {isPollingAuth ? "Waiting for Browser Login..." : "Verifying Session..."}
                </h2>
                <p className={`${textSecondary} text-sm mt-2 max-w-xs text-center`}>
                    {isPollingAuth 
                        ? "Please complete the login process in the browser window that just opened."
                        : "Connecting to server..."}
                </p>
            </div>
        </div>
     );
  }

  if (!user) {
    // ... Login UI ...
    return (
      <div className={`flex items-center justify-center min-h-screen ${bgMain} p-6`}>
        <div className={`max-w-md w-full rounded-2xl p-8 shadow-2xl border ${borderPrimary} ${isDark ? 'bg-slate-900' : 'bg-white'}`}>
           <div className="flex flex-col items-center mb-8">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-purple-600 rounded-2xl flex items-center justify-center mb-4 shadow-xl"><Cpu className="text-white w-8 h-8" /></div>
              <h2 className={`text-2xl font-bold ${textPrimary}`}>Automaland</h2>
              <p className={`text-sm ${textSecondary}`}>Sign in to sync your flows</p>
           </div>
           
           {authError && (
                <div className="mb-6 p-3 bg-red-900/20 border border-red-500/50 rounded flex items-center gap-2 text-red-400 text-xs">
                    <AlertOctagon className="w-4 h-4 shrink-0" />
                    <span>{authError}</span>
                </div>
            )}

            {!showManualToken ? (
                <>
                <form onSubmit={handleAuth} className="space-y-4">
                    {/* ... Login Form ... */}
                    {authMode === 'register' && (
                        <><input type="text" placeholder="Username" className={`w-full p-3 rounded-lg border ${isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-200'}`} value={authData.username} onChange={e => setAuthData({...authData, username: e.target.value})} />
                        <input type="email" placeholder="Email" className={`w-full p-3 rounded-lg border ${isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-200'}`} value={authData.email} onChange={e => setAuthData({...authData, email: e.target.value})} /></>
                    )}
                    <input type="text" placeholder="Identifier" className={`w-full p-3 rounded-lg border ${isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-200'}`} value={authData.identifier} onChange={e => setAuthData({...authData, identifier: e.target.value})} />
                    <input type="password" placeholder="Password" className={`w-full p-3 rounded-lg border ${isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-200'}`} value={authData.password} onChange={e => setAuthData({...authData, password: e.target.value})} />
                    <button className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-lg transition-all">{authMode === 'login' ? 'Login' : 'Register'}</button>
                </form>
                <div className="flex justify-between mt-4">
                    <button onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')} className="text-sm text-blue-500 hover:underline">{authMode === 'login' ? "New here? Register" : "Have an account? Login"}</button>
                    <button onClick={() => setShowManualToken(true)} className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1"><Key className="w-3 h-3"/> Paste Token</button>
                </div>
                </>
            ) : (
                <div className="space-y-4">
                    {/* ... Manual Token ... */}
                    <p className={`text-xs ${textSecondary} mb-2`}>
                        If the automatic login fails, copy the ID token (starts with ey...) from your browser URL and paste it here.
                    </p>
                    <textarea 
                        value={manualToken} 
                        onChange={e => setManualToken(e.target.value)} 
                        placeholder="Paste Token here..."
                        className={`w-full p-3 rounded-lg border h-32 text-xs font-mono resize-none focus:outline-none focus:border-blue-500 ${isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-200'}`}
                    />
                    <button 
                        onClick={handleManualTokenLogin} 
                        disabled={!manualToken.trim()}
                        className={`w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-lg transition-all ${!manualToken.trim() ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                        Login with Token
                    </button>
                    <button onClick={() => setShowManualToken(false)} className="w-full text-center text-sm text-slate-500 hover:text-slate-300">Back</button>
                </div>
            )}
           
           <button onClick={() => setShowSettings(true)} className="absolute top-4 right-4 p-2 text-slate-500 hover:bg-slate-200/20 rounded"><Settings className="w-5 h-5" /></button>
        </div>
        <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} settings={settings} onSaveSettings={setSettings} envVars={envVars} setEnvVars={setEnvVars} watchers={watchers} setWatchers={setWatchers} packages={packages} setPackages={setPackages} availableFlows={flows} strapi={strapi} user={user} />
      </div>
    );
  }
  
  return (
    <div className={`flex h-screen overflow-hidden ${bgMain} ${textPrimary} font-sans transition-colors duration-300`}>
      <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} settings={settings} onSaveSettings={setSettings} envVars={envVars} setEnvVars={setEnvVars} watchers={watchers} setWatchers={setWatchers} packages={packages} setPackages={setPackages} availableFlows={flows.filter(f => f.ownerId === user?.id || !f.ownerId)} strapi={strapi} user={user} />
      
      {/* NEW: Report Modal with optional reason prefill */}
      <ReportModal 
        isOpen={isReportModalOpen} 
        onClose={() => setIsReportModalOpen(false)} 
        onSubmit={handleSubmitReport}
        flowName={activeFlow?.name || 'Unknown Flow'}
        theme={settings.theme}
        initialReason={reportModalReason}
      />

      {/* HIDDEN FILE INPUT FOR IMPORT */}
      <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={handleImportJSON} />

      {/* HISTORY MODAL (unchanged) */}
      {showHistory && activeFlow && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center" onClick={() => setShowHistory(false)}>
              <div className={`w-[500px] h-[600px] rounded-xl flex flex-col overflow-hidden shadow-2xl border ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'}`} onClick={e => e.stopPropagation()}>
                  <div className={`p-4 border-b flex items-center justify-between ${isDark ? 'border-slate-800 bg-slate-950' : 'border-slate-100 bg-slate-50'}`}>
                      <h3 className="font-bold flex items-center gap-2"><Clock className="w-4 h-4"/> Version History</h3>
                      <button onClick={() => setShowHistory(false)} className="text-slate-400 hover:text-red-400 font-bold">&times;</button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-2 space-y-2">
                      {activeFlow.history && activeFlow.history.length > 0 ? (
                          activeFlow.history.map((ver, idx) => (
                              <div key={ver.timestamp} className={`p-3 rounded border flex justify-between items-center ${isDark ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-slate-200 shadow-sm'}`}>
                                  <div>
                                      <div className="text-sm font-bold">{new Date(ver.timestamp).toLocaleString()}</div>
                                      <div className="text-xs text-slate-500">{ver.nodeCode.length} chars • {ver.name}</div>
                                  </div>
                                  <button onClick={() => handleRestoreVersion(ver)} className="p-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs flex items-center gap-1">
                                      <Undo className="w-3 h-3" /> Restore
                                  </button>
                              </div>
                          ))
                      ) : (
                          <div className="p-8 text-center text-slate-500 text-sm">No history available for this flow yet. Save changes to create versions.</div>
                      )}
                  </div>
              </div>
          </div>
      )}

      {/* SIDEBAR */}
      <div className={`w-80 flex flex-col ${borderPrimary} ${bgSidebar}`}>
        <div className={`flex border-b ${borderPrimary}`}>
          <button onClick={() => setSidebarTab('chat')} className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 ${sidebarTab === 'chat' ? 'bg-slate-800/50 text-blue-400 border-b-2 border-blue-500' : textSecondary}`}><MessageSquare className="w-4 h-4" /> Chat</button>
          <button onClick={() => setSidebarTab('flows')} className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 ${sidebarTab === 'flows' ? 'bg-slate-800/50 text-blue-400 border-b-2 border-blue-500' : textSecondary}`}><List className="w-4 h-4" /> Library</button>
        </div>
        
        {/* Sidebar Content (Chat or Flow list) */}
        {sidebarTab === 'chat' ? (
           !activeFlow ? (
               <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-slate-500">
                   <MessageSquare className="w-12 h-12 mb-2 opacity-20" />
                   <p className="text-sm">Select a flow to chat with the AI Architect.</p>
               </div>
           ) : (
                <>
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {activeFlow.chatHistory.map(msg => (
                        <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                            <div className={`p-3 rounded-lg text-sm shadow-md max-w-[95%] whitespace-pre-wrap ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-br-none' : (isDark ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-white text-slate-700 border border-slate-200 shadow-sm') + ' rounded-bl-none border'}`}>
                                {msg.text}
                            </div>
                        </div>
                    ))} 
                    <div ref={chatEndRef} />
                </div>
                <div className={`p-4 border-t ${borderPrimary} ${isDark ? 'bg-slate-900' : 'bg-white'}`}>
                    <div className="flex items-center gap-2 mb-2 px-1">
                        <button 
                            onClick={() => setIncludeContext(!includeContext)} 
                            className={`flex items-center gap-1.5 text-xs font-medium transition-colors ${includeContext ? 'text-blue-500' : 'text-slate-500'}`}
                        >
                            {includeContext ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                            Include Flow & Logs Context
                        </button>
                    </div>

                    <div className="relative">
                        <textarea className={`w-full border rounded-lg pl-3 pr-10 py-3 text-sm focus:outline-none focus:border-blue-500 resize-none h-24 ${isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-800'}`} placeholder={isOwner ? "Describe automation..." : "Duplicate to use AI chat..."} value={chatInput} disabled={!isOwner} onChange={e => setChatInput(e.target.value)} />
                        <button onClick={handleSendMessage} className="absolute bottom-3 right-3 p-1.5 bg-blue-600 hover:bg-blue-500 rounded-md text-white"><Play className="w-4 h-4" /></button>
                    </div>
                </div>
                </>
           )
        ) : (
          // Flow List Panel
          <>
            <div className={`px-4 py-3 border-b ${borderPrimary} flex gap-1`}>
                {['all', 'mine', 'public'].map((f: any) => (<button key={f} onClick={() => setFlowListFilter(f)} className={`flex-1 text-[10px] uppercase font-bold py-1 px-2 rounded border transition-colors ${flowListFilter === f ? 'bg-blue-600 text-white border-blue-500' : (isDark ? 'text-slate-500 border-slate-800' : 'text-slate-500 border-slate-200')}`}>{f}</button>))}
                <button onClick={async () => { setIsRefreshing(true); await loadAllFlows(); setTimeout(() => setIsRefreshing(false), 500); }} className={`p-1.5 rounded border transition-colors ${isDark ? 'text-slate-400 hover:text-white border-slate-700 hover:bg-slate-800' : 'text-slate-500 hover:text-slate-900 border-slate-200 hover:bg-slate-100'}`}>
                    <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {filteredFlows.map(f => (
                    <div key={f.id} onClick={() => { setActiveFlowId(f.id); setViewMode('editor'); }} className={`group flex items-center justify-between p-3 rounded-lg cursor-pointer border ${activeFlowId === f.id ? (isDark ? 'bg-slate-800 border-blue-500/50' : 'bg-white border-blue-500 shadow-sm') : 'border-transparent'}`}>
                        <div className="flex gap-3 items-center">
                            {f.isPublic ? <Globe className="w-4 h-4 text-green-500" /> : <Lock className="w-4 h-4 text-slate-500" />}
                            <div>
                                <div className="font-medium text-sm truncate w-40">{f.name}</div>
                                <div className={`text-[10px] uppercase ${f.ownerId == user?.id ? 'text-blue-400' : 'text-slate-500'}`}>{f.ownerId == user?.id ? 'Owner' : 'Library'}</div>
                            </div>
                        </div>
                        {(f.ownerId == user?.id || !f.isPublic) && <button onClick={(e) => handleDeleteFlow(f.id, e)} className="p-1.5 opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>}
                    </div>
                ))}
                {filteredFlows.length === 0 && (
                    <div className="text-center p-4 text-xs text-slate-500">No flows found.</div>
                )}
            </div>
          </>
        )}
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <header className={`h-14 border-b ${borderPrimary} ${bgHeader} flex items-center justify-between px-6 z-10`}>
          <div className="flex items-center gap-4">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-purple-600 rounded flex items-center justify-center shadow-lg"><Cpu className="w-5 h-5 text-white" /></div>
              
              {!activeFlow ? (
                 <h1 className={`font-bold leading-tight ${textPrimary}`}>No Flow Selected</h1>
              ) : isEditingName ? (
                <input 
                  ref={nameInputRef}
                  className={`bg-transparent font-bold leading-tight border-b-2 border-blue-500 focus:outline-none ${textPrimary}`}
                  value={activeFlow.name}
                  onChange={(e) => updateActiveFlow({ name: e.target.value })}
                  onBlur={() => { setIsEditingName(false); if(isOwner && activeFlow.flowId) handleSaveFlow(); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { setIsEditingName(false); if(isOwner && activeFlow.flowId) handleSaveFlow(); } }}
                />
              ) : (
                <h1 
                  onDoubleClick={() => { if (isOwner) setIsEditingName(true); }} 
                  className={`font-bold leading-tight ${textPrimary} ${isOwner ? 'cursor-text hover:text-blue-400 transition-colors' : ''}`}
                  title={isOwner ? "Double-click to rename" : ""}
                >
                  {activeFlow.name}
                </h1>
              )}
          </div>
          
          <div className="flex items-center gap-3">
            {/* Watcher Indicator */}
            {watchers.length > 0 && watchers.some(w => w.active) && (
                 <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/30 text-green-500 text-xs font-bold animate-pulse" title="Watchers are active and scanning...">
                     <Eye className="w-3.5 h-3.5" /> Watching
                 </div>
            )}
            
            {/* IMPORT / EXPORT BUTTONS */}
            <div className="flex items-center border-r border-slate-700 pr-3 mr-1 gap-1">
                <button onClick={handleExportJSON} disabled={!activeFlow} title="Export Flow to JSON" className={`p-1.5 rounded transition-colors ${isDark ? 'text-slate-400 hover:text-blue-400 hover:bg-slate-800' : 'text-slate-500 hover:bg-slate-200'} disabled:opacity-30`}>
                    <FileJson className="w-4 h-4" />
                </button>
                <button onClick={() => fileInputRef.current?.click()} title="Import Flow from JSON" className={`p-1.5 rounded transition-colors ${isDark ? 'text-slate-400 hover:text-blue-400 hover:bg-slate-800' : 'text-slate-500 hover:bg-slate-200'}`}>
                    <Import className="w-4 h-4" />
                </button>
                {activeFlow && activeFlow.isPublic && !isOwner && (
                    <button onClick={handleReportFlowClick} title="Report Issue / Feedback" className={`p-1.5 rounded transition-colors text-red-400 hover:bg-red-500/20 hover:text-red-500`}>
                        <Flag className="w-4 h-4" />
                    </button>
                )}
            </div>

            {/* ... Rest of header (Verify, Publish, ViewMode, New, Save, User, Settings) ... */}
            {activeFlow && (
                <button 
                    onClick={handleVerifyFlow} 
                    disabled={isVerifying}
                    title="AI Security Verification" 
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border transition-colors ${isDark ? 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700' : 'bg-white text-slate-600 border-slate-300'} ${isVerifying ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                    {isVerifying ? <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" /> : <ShieldCheck className="w-3.5 h-3.5 text-blue-500" />} 
                    Verify
                </button>
            )}

            {activeFlow && !activeFlow.isPublic ? (
                 isOwner && (
                     <button onClick={handlePublish} disabled={isSaving} className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border transition-colors hover:bg-green-600 hover:text-white ${isDark ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-white text-slate-600 border-slate-300'} ${isSaving ? 'opacity-50 cursor-not-allowed' : ''}`}>
                         <CloudUpload className="w-3.5 h-3.5" /> Publish
                     </button>
                 )
            ) : activeFlow && (
                 <button onClick={handleImport} disabled={isSaving} className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border bg-purple-600 hover:bg-purple-500 text-white border-transparent shadow-lg ${isSaving ? 'opacity-50 cursor-not-allowed' : ''}`}>
                     <Import className="w-3.5 h-3.5" /> Import
                 </button>
            )}

            <button onClick={() => setViewMode(prev => prev === 'editor' ? 'grid' : 'editor')} disabled={!activeFlow} className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border ${isDark ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-white text-slate-600 border-slate-300'} disabled:opacity-50`}>{viewMode === 'editor' ? <><LayoutGrid className="w-3.5 h-3.5" /> Dashboard</> : <><Edit3 className="w-3.5 h-3.5" /> Editor</>}</button>
            
            <button 
                onClick={handleCreateNewFlow} 
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border transition-colors ${isDark ? 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700' : 'bg-white text-slate-600 border-slate-300'}`}
                title="Create New"
            >
                <Plus className="w-3.5 h-3.5" /> New
            </button>
            
            <div className="flex items-center rounded-lg shadow-sm border overflow-hidden border-blue-600">
                <button onClick={() => handleSaveFlow()} disabled={isSaving || !activeFlow || !isOwner} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white transition-all ${isSaving || !activeFlow || !isOwner ? 'opacity-70 cursor-not-allowed' : ''}`}>
                {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} 
                {isSaving ? 'Saving...' : 'Save'}
                </button>
                {isOwner && (
                    <button onClick={() => setShowHistory(true)} className="px-2 py-1.5 bg-blue-700 hover:bg-blue-600 text-white border-l border-blue-500 transition-colors" title="Version History">
                        <History className="w-3.5 h-3.5" />
                    </button>
                )}
            </div>

            <div className="flex items-center gap-2 px-2 py-1 bg-slate-800/50 rounded-lg border border-slate-700"><UserIcon className="w-4 h-4 text-blue-400" /><span className="text-xs font-medium">{user?.username}</span><button onClick={handleLogout} className="text-red-400 hover:text-red-500"><LogOut className="w-3.5 h-3.5" /></button></div>
            <button onClick={() => setShowSettings(true)} className="p-2 rounded-lg text-slate-400 hover:bg-slate-800"><Settings className="w-5 h-5" /></button>
            
            {activeFlow && (
                <div className="flex items-center gap-1">
                    <input 
                        type="number" 
                        title="Timeout in Seconds"
                        value={activeFlow.executionTimeout || 10}
                        onChange={(e) => updateActiveFlow({ executionTimeout: parseInt(e.target.value) || 10 })}
                        className={`w-12 py-2 text-center text-xs font-bold rounded-l-lg border-y border-l ${isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'} focus:outline-none`}
                    />
                    <button onClick={() => handleRun('run')} disabled={status !== AppStatus.IDLE} className="flex items-center gap-2 px-4 py-2 rounded-r-lg font-bold text-sm bg-green-600 hover:bg-green-500 text-white shadow-lg transition-all disabled:opacity-50"><Play className="w-4 h-4 fill-current" /> Run</button>
                </div>
            )}
          </div>
        </header>
        
        {/* MAIN CONTENT AREA */}
        {!activeFlow ? (
             <div className="flex-1 flex flex-col items-center justify-center p-8 opacity-50 select-none">
                 <div className="w-24 h-24 rounded-full bg-slate-800 mb-6 flex items-center justify-center">
                    <Cpu className="w-10 h-10 text-slate-500" />
                 </div>
                 <h2 className="text-xl font-bold mb-2">Ready to Automate</h2>
                 <p className="text-slate-500 max-w-sm text-center mb-8">Select a flow from the library or create a new one to get started.</p>
                 <button onClick={handleCreateNewFlow} className="flex items-center gap-2 px-6 py-3 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-500 transition-all shadow-lg hover:shadow-blue-500/20">
                     <Plus className="w-5 h-5" /> Create New Flow
                 </button>
             </div>
        ) : (
            viewMode === 'editor' ? (
            <div className="flex-1 p-3 grid grid-cols-3 grid-rows-[65%_35%] gap-3 overflow-hidden">
                <FormRenderer 
                schemaStr={activeFlow.uiSchema} 
                formData={formData} 
                onChange={setFormData} 
                onSchemaChange={(code) => { if (isOwner) updateActiveFlow({ uiSchema: code }); }} 
                theme={settings.theme} 
                actions={detectedActions}
                onRunAction={(action) => handleRun(action)}
                onInjectSnippet={handleInjectSnippet}
                isRunning={status === AppStatus.RUNNING}
                />
                <CodeEditor 
                    key={`node-${activeFlow.id}`}
                    title="Node.js Orchestrator" 
                    language="javascript" 
                    icon={<Cpu className="w-4 h-4" />} 
                    code={activeFlow.nodeCode} 
                    readonly={false} 
                    onChange={(code) => updateActiveFlow({ nodeCode: code })} 
                    theme={settings.theme} 
                />
                <CodeEditor 
                    key={`app-${activeFlow.id}`}
                    title="Host App Code (ExtendScript)" 
                    language="javascript" 
                    icon={<ImageIcon className="w-4 h-4" />} 
                    code={activeFlow.appCode} 
                    readonly={false} 
                    onChange={(code) => updateActiveFlow({ appCode: code })} 
                    theme={settings.theme} 
                    extraHeaderContent={
                    <div className="flex items-center gap-2">
                        <select 
                            value={activeFlow.targetApp || ''}
                            disabled={!isOwner} 
                            onPointerDown={(e) => e.stopPropagation()} 
                            onChange={(e) => {
                                const newVal = e.target.value;
                                if (newVal) updateActiveFlow({ targetApp: newVal });
                            }} 
                            className={`text-xs p-1.5 rounded border ${isDark ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-700'} w-full max-w-[200px] focus:outline-none focus:border-blue-500 transition-colors`}
                        >
                            {availableApps.length > 0 && activeFlow.targetApp && !availableApps.find(a => (a.specifier || a.id) === activeFlow.targetApp) && (
                                <option key="saved-val" value={activeFlow.targetApp}>{activeFlow.targetApp} (Saved)</option>
                            )}
                            {availableApps.map(app => (
                                <option key={app.specifier || app.id} value={app.specifier || app.id}>
                                    {app.name}
                                </option>
                            ))}
                            {availableApps.length === 0 && (
                                <>
                                    <option value="photoshop">Photoshop</option>
                                    <option value="illustrator">Illustrator</option>
                                    <option value="indesign">InDesign</option>
                                </>
                            )}
                        </select>
                    </div>
                    } 
                />
                <div className="col-span-3"><LogConsole logs={logs} isRunning={status === AppStatus.RUNNING} theme={settings.theme} /></div></div>
            ) : (
            <div className="flex-1 overflow-y-auto p-8"><div className="grid grid-cols-4 gap-6">{filteredFlows.map(flow => (<div key={flow.id} className={`flex flex-col border rounded-xl overflow-hidden ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'}`}><div className="p-4 border-b flex items-center justify-between"><div><h3 className="font-bold text-sm truncate w-32">{flow.name}</h3><span className="text-[10px] text-blue-500 uppercase font-bold">{flow.ownerId === user?.id ? 'Owner' : 'Library'}</span></div><button onClick={() => { setActiveFlowId(flow.id); setViewMode('editor'); }} className="p-2 rounded-full hover:bg-slate-200/20 text-slate-500"><Edit3 className="w-4 h-4" /></button></div><div className="p-3 flex flex-wrap gap-2">{extractActions(flow.nodeCode).map(a => (<button key={a} onClick={() => handleRun(a, flow)} className="flex-1 py-1.5 px-3 rounded text-xs font-semibold bg-blue-600 text-white">{a}</button>))}</div></div>))}</div></div>
            )
        )}
      </div>
    </div>
  );
}

export default App;
