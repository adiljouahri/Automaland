import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Play, MessageSquare, Cpu, Image as ImageIcon, Settings, RefreshCw, Plus, Download, Trash2, List, Zap, Sun, Moon, LayoutGrid, Edit3, LogOut, User as UserIcon, Globe, Lock, Share2, Loader2, CloudUpload, Import, History, Clock, Undo, Eye, FileJson } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core'; // Import invoke from Tauri
import { save } from '@tauri-apps/plugin-dialog';
import { CodeEditor } from './components/CodeEditor';
import { FormRenderer } from './components/FormRenderer';
import { LogConsole } from './components/LogConsole';
import { SettingsModal } from './components/SettingsModal';
import { generateAutomationFlow } from './services/ai';
import { StrapiService } from './services/strapi';
import { LocalStoreService } from './services/local';
import { AutomationFlow, LogEntry, ChatMessage, AppStatus, AppSettings, EnvVariable, WatcherConfig, NpmPackage, HostAppConfig, User, FlowVersion } from './types';
import { INITIAL_UI_SCHEMA, INITIAL_NODE_CODE, INITIAL_APP_CODE } from './constants';

function App() {
  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem('app_settings');
    if (saved) return JSON.parse(saved);
    return {
      aiApiKey: '',
      aiProvider: 'gemini',
      aiModel: 'gemini-3-pro-preview',
      serverUrl: 'http://localhost:3001',
      strapiUrl: 'http://localhost:1337',
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
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authData, setAuthData] = useState({ identifier: '', password: '', email: '', username: '' });
  
  const [envVars, setEnvVars] = useState<EnvVariable[]>([]);
  
  // Watchers: Load from localStorage on init
  const [watchers, setWatchers] = useState<WatcherConfig[]>(() => {
      const saved = localStorage.getItem('app_watchers');
      if (saved) {
          try { return JSON.parse(saved); } catch(e) {}
      }
      return [];
  });

  const [packages, setPackages] = useState<NpmPackage[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [availableApps, setAvailableApps] = useState<HostAppConfig[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [viewMode, setViewMode] = useState<'editor' | 'grid'>('editor');
  
  const [flows, setFlows] = useState<AutomationFlow[]>([{
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
    executionTimeout: 10
  }]);

  const [activeFlowId, setActiveFlowId] = useState<string>('default-flow-1');
  
  const activeFlow = useMemo(() => {
    const found = flows.find(f => f.id === activeFlowId);
    if (found) return found;
    if (flows.length > 0) return flows[0];
    
    return {
        id: 'fallback-flow',
        flowId: 'fallback',
        name: 'No Flow Selected',
        uiSchema: INITIAL_UI_SCHEMA,
        nodeCode: INITIAL_NODE_CODE,
        appCode: INITIAL_APP_CODE,
        targetApp: 'photoshop',
        simulatedLogs: [],
        isPublic: false,
        chatHistory: [],
        createdAt: Date.now(),
        history: [],
        executionTimeout: 10
    } as AutomationFlow;
  }, [flows, activeFlowId]);

  const isFallback = activeFlow.id === 'fallback-flow';
  const isOwner = isFallback ? false : (activeFlow?.ownerId === user?.id || !activeFlow?.ownerId || !activeFlow.isPublic);
  
  const [sidebarTab, setSidebarTab] = useState<'chat' | 'flows'>('chat');
  const [flowListFilter, setFlowListFilter] = useState<'all' | 'mine' | 'public'>('all');

  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [formData, setFormData] = useState<Record<string, any>>({});
  
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [isSaving, setIsSaving] = useState(false);
  const isSavingRef = useRef(false);
  const isDark = settings.theme === 'dark';

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
      console.log('event',event)
      try {
        const data = JSON.parse(event.data);
        
        // Handle UI Updates from Node.js (utils.setUI)
        if (data.source === 'UI_SYNC') {
            try {
                const updates = JSON.parse(data.message);
                setFormData(prev => ({ ...prev, ...updates }));
            } catch(e) {}
            return; // Don't add to log console
        }

        setLogs(prev => [...prev, { 
            id: Math.random().toString(36), 
            timestamp: data.timestamp, 
            source: data.source || 'NODE', 
            message: data.message, 
            type: data.type || 'info' 
        }]);
      } catch (e) {}
    };
    eventSource.onerror = (e) => { eventSource.close(); };
    return () => { eventSource.close(); };
  }, [settings.serverUrl]);

  useEffect(() => {
    LocalStoreService.init().catch(e => console.error("DB Init error", e));
  }, []);

  useEffect(() => {
    if (strapi.isAuthenticated()) {
      strapi.getMe()
        .then(u => {
           setUser(u);
           addLog(`Welcome back, ${u.username}`, "SYSTEM", "success");
        })
        .catch(() => {
           strapi.logout();
           setUser(null);
        });
    }
  }, [strapi, addLog]);

  const loadAllFlows = async () => {
    const localFlows = await LocalStoreService.getFlows(user?.id);
    let publicFlows: AutomationFlow[] = [];
    if (strapi.isAuthenticated() && user) {
        publicFlows = await strapi.getPublicFlows();
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
        prev.forEach(f => {
             if (f.flowId && !flowMap.has(f.flowId) && !f.id.startsWith('private') && !f.id.startsWith('public')) {
                 flowMap.set(f.flowId, f);
             }
        });
        return Array.from(flowMap.values()).sort((a, b) => b.createdAt - a.createdAt);
    });
  };

  useEffect(() => {
    loadAllFlows();
  }, [user]);

  useEffect(() => {
    if (isEditingName && nameInputRef.current) {
        nameInputRef.current.focus();
    }
  }, [isEditingName]);

  const handleSaveFlow = async (flowToSave?: AutomationFlow) => {
    if (isSavingRef.current) return;
    const target = flowToSave || activeFlow;
    if (target.id === 'fallback-flow') return;
    if (!target.flowId) target.flowId = crypto.randomUUID();

    isSavingRef.current = true;
    setIsSaving(true);

    try {
        if (target.isPublic) {
            if (!strapi.isAuthenticated()) throw new Error("Must be logged in to save public flows.");
            await strapi.savePublicFlow(target);
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
            const updatedHistory = [newVersion, ...(target.history || [])].slice(0, 15);
            const flowWithHistory = { ...target, history: updatedHistory };
            await LocalStoreService.saveFlow(flowWithHistory);
            updateActiveFlow({ history: updatedHistory });
            if (strapi.isAuthenticated()) await strapi.deletePublicFlow(target.flowId);
            addLog(`Flow "${target.name}" saved locally (Version captured).`, "SYSTEM", "success");
        }
    } catch (e: any) {
      addLog(`Failed to save: ${e.message}`, "SYSTEM", "error");
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  };

  const handleExportJSON = async () => {
    const exportData = {
        ...activeFlow,
        history: [], // Keep export light
        id: undefined // Don't export React ID
    };
    const content = JSON.stringify(exportData, null, 2);

    // Native Tauri File Save
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
          // Use custom Rust command to write file
          await invoke('save_text_file', { path: filePath, content });
          addLog(`Exported Flow to ${filePath}`, "SYSTEM", "success");
        }
      } catch (e: any) {
        addLog(`Export Failed: ${e.message}`, "SYSTEM", "error");
      }
    } else {
      // Browser Fallback
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
                        flowId: crypto.randomUUID(), // New UUID for import
                        name: `${parsed.name} (Imported)`,
                        ownerId: user?.id,
                        isPublic: false,
                        createdAt: Date.now(),
                        history: [],
                        chatHistory: parsed.chatHistory || []
                    };
                    
                    setFlows(prev => [importedFlow, ...prev]);
                    setActiveFlowId(newId);
                    await LocalStoreService.saveFlow(importedFlow);
                    addLog("Imported Flow successfully.", "SYSTEM", "success");
                }
            } catch (err) {
                addLog("Failed to import JSON.", "SYSTEM", "error");
            }
        };
    }
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleRestoreVersion = (v: FlowVersion) => {
      if(!confirm(`Restore version from ${new Date(v.timestamp).toLocaleString()}? Unsaved changes will be lost.`)) return;
      updateActiveFlow({
          name: v.name,
          nodeCode: v.nodeCode,
          appCode: v.appCode,
          uiSchema: v.uiSchema
      });
      setShowHistory(false);
      addLog(`Restored version from ${new Date(v.timestamp).toLocaleTimeString()}`, "SYSTEM", "info");
  };

  // --- PERSIST WATCHERS ---
  useEffect(() => {
      localStorage.setItem('app_watchers', JSON.stringify(watchers));
  }, [watchers]);

  // --- SYNC WATCHERS WITH SERVER ---
  useEffect(() => {
    // Filter only active watchers
    const activeWatchersList = watchers.filter(w => w.active);
    
    // Even if list is empty, we send it so server stops removed/inactive watchers
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
          envVars: envVars.reduce((acc, curr) => ({ ...acc, [curr.key]: curr.value }), {})
        })
      }).catch(() => {});
    }
  }, [watchers, flows, envVars, safeServerRequest]);

  const handlePublish = async () => {
    if (!isOwner || isFallback) return;
    if (!strapi.isAuthenticated()) {
        alert("Please login to publish flows.");
        return;
    }
    if(!confirm("Publish to Public Cloud? This will make the flow visible to everyone. You can't undo this action (only delete).")) return;
    const updatedFlow = { ...activeFlow, isPublic: true };
    updateActiveFlow({ isPublic: true });
    await handleSaveFlow(updatedFlow);
  };

  const handleImport = async () => {
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
        history: [] 
    };
    setFlows(prev => [importedFlow, ...prev]);
    setActiveFlowId(newId);
    await LocalStoreService.saveFlow(importedFlow);
    addLog(`Imported "${activeFlow.name}" to local library.`, "SYSTEM", "success");
  };

  const handleDuplicateFlow = () => {
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
         history: []
     };
     setFlows(prev => [copy, ...prev]);
     setActiveFlowId(newId);
     addLog(`Created local copy.`, "SYSTEM", "success");
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (authMode === 'login') {
        const res = await strapi.login(authData.identifier, authData.password);
        setUser(res.user);
      } else {
        const res = await strapi.register(authData.username, authData.email, authData.password);
        setUser(res.user);
      }
    } catch (e: any) {
      alert("Auth Failed: " + e.message);
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
        executionTimeout: 10
    }]);
    setActiveFlowId('default-flow-1');
  };

  useEffect(() => {
      let mounted = true;
      safeServerRequest('/api/adobe/apps')
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
      return () => { mounted = false; };
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
    if (isFallback) return;
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
      executionTimeout: 10
    };
    setFlows(prev => [newFlow, ...prev]);
    setActiveFlowId(newId);
    setViewMode('editor');
    setSidebarTab('chat');
  };

  const handleDeleteFlow = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (flows.length <= 1) return;
    const flowToDelete = flows.find(f => f.id === id);
    if (!flowToDelete) return;
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
    if (activeFlowId === id) setActiveFlowId(newFlows[0].id);
  };

  const handleSendMessage = async () => {
    if (isFallback) return;
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
      const result = await generateAutomationFlow(newUserMsg.text, settings, activeFlow);
      updateActiveFlow({ ...result, chatHistory: [...updatedHistory, { id: (Date.now() + 1).toString(), role: 'model', text: `Architecture Updated.`, timestamp: new Date() }] });
    } catch (e: any) {
      updateActiveFlow({ chatHistory: [...updatedHistory, { id: (Date.now() + 1).toString(), role: 'model', text: `Error: ${e.message}`, timestamp: new Date() }] });
    } finally { setStatus(AppStatus.IDLE); }
  };

  const handleRun = async (entryPoint: string = 'run', specificFlow?: AutomationFlow) => {
    if (status !== AppStatus.IDLE) return;
    if (isFallback) return;
    const targetFlow = specificFlow || activeFlow;
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
           appCode: targetFlow.appCode // Pass the ExtendScript code to the backend
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

  const detectedActions = useMemo(() => isFallback ? [] : extractActions(activeFlow.nodeCode), [activeFlow.nodeCode, isFallback]);

  useEffect(() => {
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  }, [activeFlow.chatHistory]);

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

  if (!user && !strapi.isAuthenticated()) {
    return (
      <div className={`flex items-center justify-center min-h-screen ${bgMain} p-6`}>
        <div className={`max-w-md w-full rounded-2xl p-8 shadow-2xl border ${borderPrimary} ${isDark ? 'bg-slate-900' : 'bg-white'}`}>
           <div className="flex flex-col items-center mb-8">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-purple-600 rounded-2xl flex items-center justify-center mb-4 shadow-xl"><Cpu className="text-white w-8 h-8" /></div>
              <h2 className={`text-2xl font-bold ${textPrimary}`}>TriPanel Automator</h2>
              <p className={`text-sm ${textSecondary}`}>Sign in to sync your flows</p>
           </div>
           <form onSubmit={handleAuth} className="space-y-4">
              {authMode === 'register' && (
                <><input type="text" placeholder="Username" className={`w-full p-3 rounded-lg border ${isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-200'}`} value={authData.username} onChange={e => setAuthData({...authData, username: e.target.value})} />
                <input type="email" placeholder="Email" className={`w-full p-3 rounded-lg border ${isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-200'}`} value={authData.email} onChange={e => setAuthData({...authData, email: e.target.value})} /></>
              )}
              <input type="text" placeholder="Identifier" className={`w-full p-3 rounded-lg border ${isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-200'}`} value={authData.identifier} onChange={e => setAuthData({...authData, identifier: e.target.value})} />
              <input type="password" placeholder="Password" className={`w-full p-3 rounded-lg border ${isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-200'}`} value={authData.password} onChange={e => setAuthData({...authData, password: e.target.value})} />
              <button className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-lg transition-all">{authMode === 'login' ? 'Login' : 'Register'}</button>
           </form>
           <button onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')} className="mt-6 w-full text-center text-sm text-blue-500 hover:underline">{authMode === 'login' ? "New here? Register" : "Have an account? Login"}</button>
        </div>
      </div>
    );
  }
  
  return (
    <div className={`flex h-screen overflow-hidden ${bgMain} ${textPrimary} font-sans transition-colors duration-300`}>
      <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} settings={settings} onSaveSettings={setSettings} envVars={envVars} setEnvVars={setEnvVars} watchers={watchers} setWatchers={setWatchers} packages={packages} setPackages={setPackages} availableFlows={flows.filter(f => f.ownerId === user?.id || !f.ownerId)} />
      
      {/* HIDDEN FILE INPUT FOR IMPORT */}
      <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={handleImportJSON} />

      {showHistory && (
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

      <div className={`w-80 flex flex-col ${borderPrimary} ${bgSidebar}`}>
        <div className={`flex border-b ${borderPrimary}`}>
          <button onClick={() => setSidebarTab('chat')} className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 ${sidebarTab === 'chat' ? 'bg-slate-800/50 text-blue-400 border-b-2 border-blue-500' : textSecondary}`}><MessageSquare className="w-4 h-4" /> Chat</button>
          <button onClick={() => setSidebarTab('flows')} className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 ${sidebarTab === 'flows' ? 'bg-slate-800/50 text-blue-400 border-b-2 border-blue-500' : textSecondary}`}><List className="w-4 h-4" /> Library</button>
        </div>
        {sidebarTab === 'chat' ? (
          <><div className="flex-1 overflow-y-auto p-4 space-y-4">{activeFlow.chatHistory.map(msg => (<div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}><div className={`p-3 rounded-lg text-sm shadow-md max-w-[95%] ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-br-none' : (isDark ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-white text-slate-700 border border-slate-200 shadow-sm') + ' rounded-bl-none border'}`}>{msg.text}</div></div>))} <div ref={chatEndRef} /></div>
            <div className={`p-4 border-t ${borderPrimary} ${isDark ? 'bg-slate-900' : 'bg-white'}`}><div className="relative"><textarea className={`w-full border rounded-lg pl-3 pr-10 py-3 text-sm focus:outline-none focus:border-blue-500 resize-none h-24 ${isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-800'}`} placeholder={isOwner ? "Describe automation..." : "Duplicate to use AI chat..."} value={chatInput} disabled={!isOwner} onChange={e => setChatInput(e.target.value)} /><button onClick={handleSendMessage} className="absolute bottom-3 right-3 p-1.5 bg-blue-600 hover:bg-blue-500 rounded-md text-white"><Play className="w-4 h-4" /></button></div></div></>
        ) : (
          <><div className={`px-4 py-3 border-b ${borderPrimary} flex gap-1`}>{['all', 'mine', 'public'].map((f: any) => (<button key={f} onClick={() => setFlowListFilter(f)} className={`flex-1 text-[10px] uppercase font-bold py-1 px-2 rounded border transition-colors ${flowListFilter === f ? 'bg-blue-600 text-white border-blue-500' : (isDark ? 'text-slate-500 border-slate-800' : 'text-slate-500 border-slate-200')}`}>{f}</button>))}</div>
            <div className="flex-1 overflow-y-auto p-2 space-y-2">{filteredFlows.map(f => (<div key={f.id} onClick={() => { setActiveFlowId(f.id); setViewMode('editor'); }} className={`group flex items-center justify-between p-3 rounded-lg cursor-pointer border ${activeFlowId === f.id ? (isDark ? 'bg-slate-800 border-blue-500/50' : 'bg-white border-blue-500 shadow-sm') : 'border-transparent'}`}><div className="flex gap-3 items-center">{f.isPublic ? <Globe className="w-4 h-4 text-green-500" /> : <Lock className="w-4 h-4 text-slate-500" />}<div><div className="font-medium text-sm truncate w-40">{f.name}</div><div className={`text-[10px] uppercase ${f.ownerId === user?.id ? 'text-blue-400' : 'text-slate-500'}`}>{f.ownerId === user?.id ? 'Owner' : 'Library'}</div></div></div>{f.ownerId === user?.id && <button onClick={(e) => handleDeleteFlow(f.id, e)} className="p-1.5 opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>}</div>))}</div></>
        )}
      </div>
      <div className="flex-1 flex flex-col min-w-0">
        <header className={`h-14 border-b ${borderPrimary} ${bgHeader} flex items-center justify-between px-6 z-10`}><div className="flex items-center gap-4"><div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-purple-600 rounded flex items-center justify-center shadow-lg"><Cpu className="w-5 h-5 text-white" /></div>
          {isEditingName && !isFallback ? (
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
              onDoubleClick={() => { if (isOwner && !isFallback) setIsEditingName(true); }} 
              className={`font-bold leading-tight ${textPrimary} ${isOwner && !isFallback ? 'cursor-text hover:text-blue-400 transition-colors' : ''} ${isFallback ? 'text-slate-500 italic' : ''}`}
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
                <button onClick={handleExportJSON} title="Export Flow to JSON" className={`p-1.5 rounded transition-colors ${isDark ? 'text-slate-400 hover:text-blue-400 hover:bg-slate-800' : 'text-slate-500 hover:bg-slate-200'}`}>
                    <FileJson className="w-4 h-4" />
                </button>
                <button onClick={() => fileInputRef.current?.click()} title="Import Flow from JSON" className={`p-1.5 rounded transition-colors ${isDark ? 'text-slate-400 hover:text-blue-400 hover:bg-slate-800' : 'text-slate-500 hover:bg-slate-200'}`}>
                    <Import className="w-4 h-4" />
                </button>
            </div>

            {!activeFlow.isPublic ? (
                 isOwner && (
                     <button onClick={handlePublish} disabled={isSaving || isFallback} className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border transition-colors hover:bg-green-600 hover:text-white ${isDark ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-white text-slate-600 border-slate-300'} ${isSaving || isFallback ? 'opacity-50 cursor-not-allowed' : ''}`}>
                         <CloudUpload className="w-3.5 h-3.5" /> Publish
                     </button>
                 )
            ) : (
                 <button onClick={handleImport} disabled={isSaving || isFallback} className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border bg-purple-600 hover:bg-purple-500 text-white border-transparent shadow-lg ${isSaving || isFallback ? 'opacity-50 cursor-not-allowed' : ''}`}>
                     <Import className="w-3.5 h-3.5" /> Import
                 </button>
            )}

            <button onClick={() => setViewMode(prev => prev === 'editor' ? 'grid' : 'editor')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border ${isDark ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-white text-slate-600 border-slate-300'}`}>{viewMode === 'editor' ? <><LayoutGrid className="w-3.5 h-3.5" /> Dashboard</> : <><Edit3 className="w-3.5 h-3.5" /> Editor</>}</button>
            <button onClick={handleCreateNewFlow} className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border ${isDark ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-white text-slate-600 border-slate-300'}`}><Plus className="w-3.5 h-3.5" /> New</button>
            
            <div className="flex items-center rounded-lg shadow-sm border overflow-hidden border-blue-600">
                <button onClick={() => handleSaveFlow()} disabled={isSaving || isFallback || !isOwner} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white transition-all ${isSaving || isFallback || !isOwner ? 'opacity-70 cursor-not-allowed' : ''}`}>
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
            
            <div className="flex items-center gap-1">
                <input 
                    type="number" 
                    title="Timeout in Seconds"
                    value={activeFlow.executionTimeout || 10}
                    onChange={(e) => updateActiveFlow({ executionTimeout: parseInt(e.target.value) || 10 })}
                    className={`w-12 py-2 text-center text-xs font-bold rounded-l-lg border-y border-l ${isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'} focus:outline-none`}
                />
                <button onClick={() => handleRun('run')} disabled={status !== AppStatus.IDLE || isFallback} className="flex items-center gap-2 px-4 py-2 rounded-r-lg font-bold text-sm bg-green-600 hover:bg-green-500 text-white shadow-lg transition-all disabled:opacity-50"><Play className="w-4 h-4 fill-current" /> Run</button>
            </div>
          </div>
        </header>
        {viewMode === 'editor' ? (
          <div className="flex-1 p-3 grid grid-cols-3 grid-rows-[65%_35%] gap-3 overflow-hidden">
            <FormRenderer 
              schemaStr={activeFlow.uiSchema} 
              formData={formData} 
              onChange={setFormData} 
              onSchemaChange={(code) => { if (isOwner) updateActiveFlow({ uiSchema: code }); }} 
              theme={settings.theme} 
              actions={detectedActions}
              onRunAction={(action) => handleRun(action)}
              isRunning={status === AppStatus.RUNNING}
            />
            <CodeEditor title="Node.js Orchestrator" language="javascript" icon={<Cpu className="w-4 h-4" />} code={activeFlow.nodeCode} readonly={false} onChange={(code) => updateActiveFlow({ nodeCode: code })} theme={settings.theme} />
            <CodeEditor 
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
        )}
      </div>
    </div>
  );
}

export default App;