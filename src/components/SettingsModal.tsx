
import React, { useState, useEffect } from 'react';
import { AppSettings, WatcherConfig, EnvVariable, NpmPackage, AIProvider, AutomationFlow, User, Report } from '../types';
import { StrapiService } from '../services/strapi';
import { SYSTEM_INSTRUCTION as DEFAULT_SYSTEM_INSTRUCTION } from '../constants';
import { X, Plus, Trash2, Folder, Server, Cpu, Lock, Eye, Clock, Calendar, FileText, RefreshCw, MessageSquareWarning, CheckCircle, AlertCircle, Clock as ClockIcon, Ban } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSaveSettings: (s: AppSettings) => void;
  envVars: EnvVariable[];
  setEnvVars: React.Dispatch<React.SetStateAction<EnvVariable[]>>;
  watchers: WatcherConfig[];
  setWatchers: React.Dispatch<React.SetStateAction<WatcherConfig[]>>;
  packages: NpmPackage[];
  setPackages: React.Dispatch<React.SetStateAction<NpmPackage[]>>;
  availableFlows: AutomationFlow[];
  strapi: StrapiService;
  user: User | null;
}

const PROVIDER_MODELS: Record<AIProvider, string[]> = {
    gemini: [
        'gemini-3-flash-preview',        // High-speed generation
        'gemini-3-pro-preview',          // New Flagship (multimodal & vibe-coding)
        'gemini-3-deep-think',   // February 2026 release for reasoning
        'gemini-2.5-pro',        // Stable enterprise workhorse
        'gemini-2.5-flash',      // Agentic-optimized low latency
        'gemini-2.0-flash',      // General Availability stable
        'gemini-2.0-flash-lite'  // Cost-optimized stable
    ],
    openai: [
        'gpt-5.2',               // Current Flagship (Instant/Thinking modes)
        'gpt-5.3-codex',         // Advanced agentic coding model
        'gpt-5-mini',            // New efficient standard
        'o3',                    // High-reasoning "Strawberry" successor
        'o1',                    // Stable reasoning model
        'o4-mini',               // Reasoning-capable small model
        'gpt-4.5',               // "Creative Empath" high-EQ model
        'gpt-4o'                 // Legacy support (scheduled for retirement)
    ],
    claude: [
        'claude-4-6-opus-latest', // Feb 2026 State-of-the-Art
        'claude-4-5-sonnet-latest', // High-performance agentic model
        'claude-4-5-haiku-latest',  // Fastest generation
        'claude-3-7-sonnet-20250224', // Stable version from early 2025
        'claude-3-5-sonnet-latest'   // Legacy LTS
    ],
    custom: []
};

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen, onClose, settings, onSaveSettings,
  envVars, setEnvVars,
  watchers, setWatchers,
  availableFlows,
  strapi,
  user
}) => {
  const [activeTab, setActiveTab] = useState<'general' | 'ai' | 'env' | 'watchers' | 'logs' | 'reports'>('general');
  const [newEnvKey, setNewEnvKey] = useState('');
  const [newEnvVal, setNewEnvVal] = useState('');
  const [logPaths, setLogPaths] = useState<{serverLog: string, adobeLog: string, tauriLog: string} | null>(null);
  const [restarting, setRestarting] = useState(false);
  const [myReports, setMyReports] = useState<Report[]>([]);
  const [loadingReports, setLoadingReports] = useState(false);
  const [showSystemInstruction, setShowSystemInstruction] = useState(false);

  const currentPresets = PROVIDER_MODELS[settings.aiProvider] || [];
  // Check if current model is in presets. If not, we assume custom input mode, UNLESS provider is 'custom' which always shows input.
  const isPreset = currentPresets.includes(settings.aiModel);
  const [showCustomModelInput, setShowCustomModelInput] = useState(!isPreset || settings.aiProvider === 'custom');

  const isDark = settings.theme === 'dark';

  useEffect(() => {
    if (isOpen) {
        if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
            invoke('get_log_paths').then((paths: any) => setLogPaths(paths)).catch(console.error);
        }
    }
  }, [isOpen]);

  useEffect(() => {
      if (isOpen && activeTab === 'reports' && user) {
          setLoadingReports(true);
          strapi.getUserReports(user.id)
            .then(setMyReports)
            .catch(err => console.error("Failed to load reports", err))
            .finally(() => setLoadingReports(false));
      }
  }, [isOpen, activeTab, user, strapi]);

  const handleRestartServer = async () => {
      setRestarting(true);
      try {
          if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
            await invoke('restart_sidecar');
            setTimeout(() => {
                setRestarting(false);
                alert("Server Restart command sent.");
            }, 2000);
          } else {
              setRestarting(false);
          }
      } catch (e) {
          console.error(e);
          setRestarting(false);
      }
  };

  const getStatusBadge = (status: string) => {
      switch(status) {
          case 'resolved': return <span className="flex items-center gap-1 text-xs font-bold text-green-500 bg-green-500/10 px-2 py-1 rounded"><CheckCircle className="w-3 h-3"/> Resolved</span>;
          case 'investigating': return <span className="flex items-center gap-1 text-xs font-bold text-blue-500 bg-blue-500/10 px-2 py-1 rounded"><AlertCircle className="w-3 h-3"/> Investigating</span>;
          case 'dismissed': return <span className="flex items-center gap-1 text-xs font-bold text-slate-500 bg-slate-500/10 px-2 py-1 rounded"><Ban className="w-3 h-3"/> Dismissed</span>;
          default: return <span className="flex items-center gap-1 text-xs font-bold text-amber-500 bg-amber-500/10 px-2 py-1 rounded"><ClockIcon className="w-3 h-3"/> Pending</span>;
      }
  };

  if (!isOpen) return null;

  const modalBg = isDark ? "bg-slate-900" : "bg-white";
  const modalBorder = isDark ? "border-slate-700" : "border-slate-200";
  const headerBg = isDark ? "bg-slate-950" : "bg-slate-50";
  const sidebarBg = isDark ? "bg-slate-900" : "bg-slate-50";
  const sidebarBorder = isDark ? "border-slate-800" : "border-slate-200";
  const contentBg = isDark ? "bg-slate-950" : "bg-white";
  const inputBg = isDark ? "bg-slate-800" : "bg-white";
  const inputBorder = isDark ? "border-slate-700" : "border-slate-300";
  const inputText = isDark ? "text-white" : "text-slate-900";
  const labelText = isDark ? "text-slate-400" : "text-slate-600";
  const cardBg = isDark ? "bg-slate-900 border-slate-700" : "bg-white border-slate-200";

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className={`${modalBg} border ${modalBorder} w-[800px] h-[600px] rounded-xl shadow-2xl flex flex-col overflow-hidden`}>
        <div className={`flex items-center justify-between px-6 py-4 border-b ${sidebarBorder} ${headerBg}`}>
          <h2 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>System Preferences</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200"><X /></button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          <div className={`w-48 ${sidebarBg} border-r ${sidebarBorder} p-4 space-y-2`}>
            {[
              { id: 'general', label: 'Connections', icon: <Server className="w-4 h-4" /> },
              { id: 'ai', label: 'AI Provider', icon: <Cpu className="w-4 h-4" /> },
              { id: 'env', label: 'Environment', icon: <Lock className="w-4 h-4" /> },
              { id: 'watchers', label: 'Watchers', icon: <Eye className="w-4 h-4" /> },
              { id: 'reports', label: 'My Reports', icon: <MessageSquareWarning className="w-4 h-4" /> },
              { id: 'logs', label: 'Logs', icon: <FileText className="w-4 h-4" /> },
            ].map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`w-full flex items-center gap-2 px-3 py-2 rounded text-sm font-medium transition-colors ${activeTab === tab.id ? 'bg-blue-600 text-white' : `${isDark ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-200'}`}`}>
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>

          <div className={`flex-1 p-8 overflow-y-auto ${contentBg}`}>
            {activeTab === 'general' && (
              <div className="space-y-6">
                <div>
                  <label className={`block text-xs font-bold uppercase tracking-wider mb-2 ${labelText}`}>Sidecar Server URL</label>
                  <input type="text" value={settings.serverUrl} onChange={e => onSaveSettings({...settings, serverUrl: e.target.value})} className={`w-full ${inputBg} border ${inputBorder} rounded p-3 ${inputText} text-sm focus:border-blue-500 outline-none`} />
                </div>
                <div>
                  <label className={`block text-xs font-bold uppercase tracking-wider mb-2 ${labelText}`}>Strapi Backend URL</label>
                  <input type="text" value={settings.strapiUrl} onChange={e => onSaveSettings({...settings, strapiUrl: e.target.value})} className={`w-full ${inputBg} border ${inputBorder} rounded p-3 ${inputText} text-sm focus:border-blue-500 outline-none`} />
                </div>
                <div>
                   <label className={`block text-xs font-bold uppercase tracking-wider mb-2 ${labelText}`}>Interface Theme</label>
                   <select value={settings.theme} onChange={e => onSaveSettings({...settings, theme: e.target.value as 'dark' | 'light'})} className={`w-full ${inputBg} border ${inputBorder} rounded p-3 ${inputText} text-sm`}>
                      <option value="dark">Dark Mode</option>
                      <option value="light">Light Mode</option>
                   </select>
                </div>
                
                <div className={`p-4 rounded border ${isDark ? 'border-yellow-900/50 bg-yellow-900/20' : 'border-yellow-200 bg-yellow-50'}`}>
                    <div className="flex items-center justify-between">
                        <div>
                            <h4 className={`text-sm font-bold ${isDark ? 'text-yellow-500' : 'text-yellow-700'}`}>Sidecar Control</h4>
                            <p className="text-xs text-slate-500 mt-1">If the automation server stops responding.</p>
                        </div>
                        <button 
                            onClick={handleRestartServer} 
                            disabled={restarting}
                            className={`flex items-center gap-2 px-4 py-2 rounded text-xs font-bold transition-all ${restarting ? 'bg-slate-700 cursor-not-allowed text-slate-400' : 'bg-yellow-600 hover:bg-yellow-500 text-white shadow-lg'}`}
                        >
                            <RefreshCw className={`w-3.5 h-3.5 ${restarting ? 'animate-spin' : ''}`} />
                            {restarting ? 'Restarting...' : 'Restart Server'}
                        </button>
                    </div>
                </div>
              </div>
            )}

            {activeTab === 'logs' && (
                <div className="space-y-6">
                    <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                        Persistent logs are stored locally for debugging.
                    </p>
                    
                    <div className="space-y-4">
                        <div className={`p-4 rounded border ${cardBg}`}>
                            <div className="flex items-center gap-2 mb-2">
                                <Server className="w-4 h-4 text-green-500" />
                                <span className={`text-sm font-bold ${inputText}`}>Server & Telemetry Log</span>
                            </div>
                            <div className={`text-xs font-mono p-2 rounded break-all select-all cursor-text ${isDark ? 'bg-black/50 text-slate-300' : 'bg-slate-100 text-slate-600'}`}>
                                {logPaths?.serverLog || "Unavailable"}
                            </div>
                             <p className="text-[10px] text-slate-500 mt-2">Contains Node.js execution logs, API errors, and telemetry.</p>
                        </div>

                        <div className={`p-4 rounded border ${cardBg}`}>
                            <div className="flex items-center gap-2 mb-2">
                                <Cpu className="w-4 h-4 text-blue-500" />
                                <span className={`text-sm font-bold ${inputText}`}>ExtendScript (Adobe) Log</span>
                            </div>
                            <div className={`text-xs font-mono p-2 rounded break-all select-all cursor-text ${isDark ? 'bg-black/50 text-slate-300' : 'bg-slate-100 text-slate-600'}`}>
                                {logPaths?.adobeLog || "Unavailable"}
                            </div>
                             <p className="text-[10px] text-slate-500 mt-2">Contains logs generated specifically by Photoshop/Illustrator scripts.</p>
                        </div>

                        <div className={`p-4 rounded border ${cardBg}`}>
                            <div className="flex items-center gap-2 mb-2">
                                <FileText className="w-4 h-4 text-purple-500" />
                                <span className={`text-sm font-bold ${inputText}`}>Application (Tauri) Log</span>
                            </div>
                            <div className={`text-xs font-mono p-2 rounded break-all select-all cursor-text ${isDark ? 'bg-black/50 text-slate-300' : 'bg-slate-100 text-slate-600'}`}>
                                {logPaths?.tauriLog || "Unavailable"}
                            </div>
                             <p className="text-[10px] text-slate-500 mt-2">Contains system level events and sidecar lifecycle logs.</p>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'ai' && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={`block text-xs font-bold uppercase tracking-wider mb-2 ${labelText}`}>AI Provider</label>
                    <select value={settings.aiProvider} onChange={e => {
                        const newProvider = e.target.value as AIProvider;
                        onSaveSettings({...settings, aiProvider: newProvider, aiModel: PROVIDER_MODELS[newProvider][0] || ''});
                        setShowCustomModelInput(newProvider === 'custom');
                    }} className={`w-full ${inputBg} border ${inputBorder} rounded p-3 ${inputText} text-sm`}>
                      <option value="gemini">Google Gemini</option>
                      <option value="openai">OpenAI</option>
                      <option value="claude">Anthropic Claude</option>
                      <option value="custom">Custom OAI Endpoint</option>
                    </select>
                  </div>
                  <div>
                    <label className={`block text-xs font-bold uppercase tracking-wider mb-2 ${labelText}`}>Model Name</label>
                    {!showCustomModelInput ? (
                        <select 
                            value={settings.aiModel} 
                            onChange={e => {
                                if (e.target.value === '__custom__') {
                                    setShowCustomModelInput(true);
                                    onSaveSettings({...settings, aiModel: ''});
                                } else {
                                    onSaveSettings({...settings, aiModel: e.target.value});
                                }
                            }} 
                            className={`w-full ${inputBg} border ${inputBorder} rounded p-3 ${inputText} text-sm`}
                        >
                            {currentPresets.map(m => <option key={m} value={m}>{m}</option>)}
                            <option value="__custom__">Custom Model...</option>
                        </select>
                    ) : (
                        <div className="relative">
                            <input 
                                type="text" 
                                value={settings.aiModel} 
                                placeholder="e.g. gpt-4-turbo" 
                                onChange={e => onSaveSettings({...settings, aiModel: e.target.value})} 
                                className={`w-full ${inputBg} border ${inputBorder} rounded p-3 ${inputText} text-sm`} 
                            />
                            {settings.aiProvider !== 'custom' && (
                                <button onClick={() => setShowCustomModelInput(false)} className="absolute right-3 top-3 text-[10px] text-blue-500 font-bold uppercase hover:underline">Presets</button>
                            )}
                        </div>
                    )}
                  </div>
                </div>
                
                <div>
                    <label className={`block text-xs font-bold uppercase tracking-wider mb-2 ${labelText}`}>API Key</label>
                    <input type="password" value={settings.aiApiKey} onChange={e => onSaveSettings({...settings, aiApiKey: e.target.value})} className={`w-full ${inputBg} border ${inputBorder} rounded p-3 ${inputText} text-sm`} placeholder={`Paste your ${settings.aiProvider} API key here...`} />
                    <p className="mt-2 text-[10px] text-slate-500">Your key is stored locally in your browser's local storage.</p>
                </div>

                <div className={`border-t ${isDark ? 'border-slate-800' : 'border-slate-200'} pt-4`}>
                    <button 
                        onClick={() => setShowSystemInstruction(!showSystemInstruction)}
                        className={`flex items-center gap-2 text-xs font-bold uppercase mb-2 ${labelText} hover:text-blue-500 transition-colors`}
                    >
                        {showSystemInstruction ? 'Hide' : 'Show'} System Instructions (Advanced)
                    </button>
                    
                    {showSystemInstruction && (
                        <div className="space-y-2 animate-in slide-in-from-top-2 duration-200">
                            <p className="text-[10px] text-slate-500">
                                Customize the prompt sent to the AI. This defines the architecture, available libraries, and coding style.
                            </p>
                            <textarea 
                                value={settings.systemInstruction !== undefined ? settings.systemInstruction : DEFAULT_SYSTEM_INSTRUCTION}
                                onChange={e => onSaveSettings({...settings, systemInstruction: e.target.value})}
                                className={`w-full h-64 ${inputBg} border ${inputBorder} rounded p-3 ${inputText} text-xs font-mono focus:border-blue-500 outline-none resize-y`}
                                placeholder={DEFAULT_SYSTEM_INSTRUCTION}
                            />
                            <div className="flex justify-end">
                                <button 
                                    onClick={() => onSaveSettings({...settings, systemInstruction: undefined})}
                                    className="text-xs text-red-400 hover:text-red-500 hover:underline"
                                >
                                    Reset to Default
                                </button>
                            </div>
                        </div>
                    )}
                </div>
              </div>
            )}

            {activeTab === 'env' && (
              <div className="space-y-4">
                <div className="flex gap-2"><input placeholder="Key" value={newEnvKey} onChange={e=>setNewEnvKey(e.target.value)} className={`flex-1 ${inputBg} border ${inputBorder} rounded p-2 text-sm ${inputText}`} /><input placeholder="Value" type="password" value={newEnvVal} onChange={e=>setNewEnvVal(e.target.value)} className={`flex-1 ${inputBg} border ${inputBorder} rounded p-2 text-sm ${inputText}`} /><button onClick={() => {if(newEnvKey){setEnvVars([...envVars, {key:newEnvKey, value:newEnvVal, encrypted:true}]);setNewEnvKey('');setNewEnvVal('');}}} className="bg-blue-600 px-3 rounded text-white"><Plus size={18} /></button></div>
                <div className="space-y-2">{envVars.map((v, i) => (<div key={i} className={`flex items-center justify-between p-3 rounded border ${inputBorder} bg-slate-800/20`}><span className="font-mono text-xs">{v.key}</span><button onClick={() => setEnvVars(envVars.filter((_, idx) => idx !== i))} className="text-red-400"><Trash2 size={16} /></button></div>))}</div>
              </div>
            )}

            {activeTab === 'watchers' && (
              <div className="space-y-4">
                <div className="flex gap-2">
                  <button onClick={() => setWatchers([...watchers, {id: Date.now().toString(), type:'FOLDER', target: '/path/to/watch', active:true, flowId: availableFlows[0]?.id || ''}])} className={`flex-1 p-3 border border-dashed rounded text-sm transition-colors flex items-center justify-center gap-2 ${isDark ? 'border-slate-700 hover:border-blue-500 text-slate-400' : 'border-slate-300 hover:border-blue-400 text-slate-600'}`}>
                    <Plus className="w-4 h-4"/> New Trigger
                  </button>
                </div>
                <div className="space-y-3">
                  {watchers.map(w => (
                    <div key={w.id} className={`p-4 border rounded shadow-sm flex flex-col gap-3 ${isDark ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-slate-200'}`}>
                      <div className="flex items-center gap-4">
                         {/* TYPE SELECTOR */}
                         <div className="w-32 shrink-0">
                            <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 block">Type</label>
                            <select 
                                value={w.type} 
                                onChange={e => setWatchers(watchers.map(x => x.id === w.id ? {...x, type: e.target.value as any, target: e.target.value === 'FOLDER' ? '/path/to/watch' : 'Scheduled Task'} : x))} 
                                className={`w-full ${inputBg} border ${inputBorder} rounded px-2 py-1 text-xs ${inputText}`}
                            >
                                <option value="FOLDER">Folder</option>
                                <option value="SCHEDULE">Schedule</option>
                            </select>
                         </div>

                         {/* CONTENT BASED ON TYPE */}
                         <div className="flex-1">
                             {w.type === 'FOLDER' ? (
                                <>
                                    <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 block">Folder Path</label>
                                    <div className="flex items-center gap-2">
                                        <Folder className="w-4 h-4 text-blue-500" />
                                        <input 
                                        value={w.target} 
                                        onChange={e => setWatchers(watchers.map(x => x.id === w.id ? {...x, target: e.target.value} : x))}
                                        className={`bg-transparent border-b border-transparent hover:border-slate-500 focus:border-blue-500 text-sm font-medium focus:outline-none w-full ${inputText}`} 
                                        placeholder="/path/to/watch"
                                        />
                                    </div>
                                </>
                             ) : (
                                <div className="flex gap-4">
                                    <div className="flex-1">
                                        <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 block">Description</label>
                                        <div className="flex items-center gap-2">
                                            <Calendar className="w-4 h-4 text-purple-500" />
                                            <input 
                                            value={w.target} 
                                            onChange={e => setWatchers(watchers.map(x => x.id === w.id ? {...x, target: e.target.value} : x))}
                                            className={`bg-transparent border-b border-transparent hover:border-slate-500 focus:border-blue-500 text-sm font-medium focus:outline-none w-full ${inputText}`} 
                                            placeholder="Task Name"
                                            />
                                        </div>
                                    </div>
                                    <div className="w-32">
                                        <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 block">Interval (Sec)</label>
                                        <div className="flex items-center gap-2">
                                            <Clock className="w-4 h-4 text-orange-500" />
                                            <input 
                                            type="number"
                                            min="10"
                                            value={w.interval || 60} 
                                            onChange={e => setWatchers(watchers.map(x => x.id === w.id ? {...x, interval: parseInt(e.target.value) || 60} : x))}
                                            className={`bg-transparent border-b border-transparent hover:border-slate-500 focus:border-blue-500 text-sm font-medium focus:outline-none w-full ${inputText}`} 
                                            />
                                        </div>
                                    </div>
                                </div>
                             )}
                         </div>
                      </div>

                      <div className="flex items-center gap-4 border-t pt-3 border-slate-800/50">
                          <div className="flex-1">
                             <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 block">Action Flow</label>
                             <select 
                              value={w.flowId}
                              onChange={e => setWatchers(watchers.map(x => x.id === w.id ? {...x, flowId: e.target.value} : x))}
                              className={`w-full ${inputBg} border ${inputBorder} rounded px-2 py-1.5 text-xs ${inputText}`}
                            >
                              {availableFlows.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                              {availableFlows.length === 0 && <option value="" disabled>No flows available</option>}
                            </select>
                          </div>

                          <div className="flex items-center gap-4">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <span className={`text-[10px] font-bold uppercase ${w.active ? 'text-green-500' : 'text-slate-500'}`}>{w.active ? 'Active' : 'Paused'}</span>
                                <input 
                                    type="checkbox" 
                                    checked={w.active} 
                                    onChange={e => setWatchers(watchers.map(x => x.id === w.id ? {...x, active: e.target.checked} : x))}
                                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 bg-slate-800 border-slate-600"
                                />
                            </label>
                            <button onClick={() => setWatchers(watchers.filter(x => x.id !== w.id))} className="text-slate-500 hover:text-red-400 p-2 rounded hover:bg-slate-800"><Trash2 size={16} /></button>
                          </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'reports' && (
                <div className="space-y-6">
                    {!user ? (
                        <div className="text-center p-8 text-slate-500 border border-dashed rounded border-slate-700">
                            Please login to view your reports.
                        </div>
                    ) : loadingReports ? (
                        <div className="text-center p-8 text-slate-500">Loading reports...</div>
                    ) : myReports.length === 0 ? (
                        <div className="text-center p-8 text-slate-500 border border-dashed rounded border-slate-700">
                            You have not submitted any reports.
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {myReports.map(report => (
                                <div key={report.id} className={`p-4 rounded border ${cardBg}`}>
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-3">
                                            {getStatusBadge(report.reportStatus)}
                                            <span className={`text-xs font-mono opacity-50 ${inputText}`}>Flow ID: {report.flowId.substring(0, 8)}...</span>
                                        </div>
                                        <span className="text-[10px] text-slate-500">{new Date(report.createdAt).toLocaleString()}</span>
                                    </div>
                                    
                                    <div className="mb-3">
                                        <div className="text-xs font-bold uppercase text-slate-500 mb-1">Reason: {report.reason}</div>
                                        <p className={`text-sm ${inputText}`}>{report.description}</p>
                                    </div>

                                    {report.adminFeedback && (
                                        <div className={`mt-3 p-3 rounded text-sm ${isDark ? 'bg-blue-900/20 border border-blue-500/30 text-blue-200' : 'bg-blue-50 border border-blue-200 text-blue-800'}`}>
                                            <div className="flex items-center gap-2 mb-1 font-bold text-xs uppercase opacity-70">
                                                <MessageSquareWarning className="w-3 h-3" /> Admin Response
                                            </div>
                                            {report.adminFeedback}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
