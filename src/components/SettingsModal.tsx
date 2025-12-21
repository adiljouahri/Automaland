import React, { useState } from 'react';
import { AppSettings, WatcherConfig, EnvVariable, NpmPackage, AIProvider, AutomationFlow } from '../types';
import { X, Plus, Trash2, Folder, Lock, Eye, Server, Cpu } from 'lucide-react';

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
}

const PROVIDER_MODELS: Record<AIProvider, string[]> = {
  gemini: ['gemini-2.0-flash', 'gemini-2.0-pro-exp-02-05', 'gemini-3-pro-preview', 'gemini-1.5-pro'],
  openai: ['gpt-4o', 'gpt-4o-mini', 'o1-preview'],
  claude: ['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229'],
  custom: []
};

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen, onClose, settings, onSaveSettings,
  envVars, setEnvVars,
  watchers, setWatchers,
  availableFlows
}) => {
  const [activeTab, setActiveTab] = useState<'general' | 'ai' | 'env' | 'watchers'>('general');
  const [newEnvKey, setNewEnvKey] = useState('');
  const [newEnvVal, setNewEnvVal] = useState('');
  
  const currentPresets = PROVIDER_MODELS[settings.aiProvider] || [];
  const isUsingCustomModel = !currentPresets.includes(settings.aiModel) && settings.aiModel !== '';
  const [showCustomModelInput, setShowCustomModelInput] = useState(isUsingCustomModel || settings.aiProvider === 'custom');

  if (!isOpen) return null;
  const isDark = settings.theme === 'dark';

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
                                placeholder="Enter model name..." 
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
                
                {settings.aiProvider === 'gemini' ? (
                     <div className={`p-3 rounded border text-xs ${isDark ? 'bg-blue-900/20 border-blue-800 text-blue-300' : 'bg-blue-50 border-blue-200 text-blue-700'}`}>
                        Gemini API Key is configured via process.env.API_KEY.
                     </div>
                ) : (
                <div>
                    <label className={`block text-xs font-bold uppercase tracking-wider mb-2 ${labelText}`}>API Key</label>
                    <input type="password" value={settings.aiApiKey} onChange={e => onSaveSettings({...settings, aiApiKey: e.target.value})} className={`w-full ${inputBg} border ${inputBorder} rounded p-3 ${inputText} text-sm`} placeholder="Paste your API key here..." />
                    <p className="mt-2 text-[10px] text-slate-500">Your key is stored locally in your browser's local storage.</p>
                </div>
                )}

                {(settings.aiProvider === 'custom' || settings.aiProvider === 'openai') && (
                  <div>
                    <label className={`block text-xs font-bold uppercase tracking-wider mb-2 ${labelText}`}>API Base URL</label>
                    <input type="text" value={settings.aiBaseUrl} placeholder="https://api.openai.com/v1/chat/completions" onChange={e => onSaveSettings({...settings, aiBaseUrl: e.target.value})} className={`w-full ${inputBg} border ${inputBorder} rounded p-3 ${inputText} text-sm`} />
                  </div>
                )}
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
                  <button onClick={() => setWatchers([...watchers, {id: Date.now().toString(), type:'FOLDER', target: '/path/to/watch', active:true, flowId: availableFlows[0]?.id || ''}])} className={`flex-1 p-3 border border-dashed rounded text-sm transition-colors ${isDark ? 'border-slate-700 hover:border-blue-500 text-slate-400' : 'border-slate-300 hover:border-blue-400 text-slate-600'}`}>
                    + New Folder Watcher
                  </button>
                </div>
                <div className="space-y-3">
                  {watchers.map(w => (
                    <div key={w.id} className={`p-4 border rounded shadow-sm ${isDark ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-slate-200'}`}>
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center gap-2">
                           <Folder className="w-4 h-4 text-blue-500" />
                           <input 
                            value={w.target} 
                            onChange={e => setWatchers(watchers.map(x => x.id === w.id ? {...x, target: e.target.value} : x))}
                            className={`bg-transparent border-none p-0 text-sm font-medium focus:ring-0 ${inputText}`} 
                           />
                        </div>
                        <button onClick={() => setWatchers(watchers.filter(x => x.id !== w.id))} className="text-red-400 hover:text-red-500 p-1"><Trash2 size={16} /></button>
                      </div>
                      <div>
                        <label className={`block text-[10px] uppercase font-bold tracking-wider mb-1.5 ${labelText}`}>Trigger Automation</label>
                        <select 
                          value={w.flowId}
                          onChange={e => setWatchers(watchers.map(x => x.id === w.id ? {...x, flowId: e.target.value} : x))}
                          className={`w-full ${inputBg} border ${inputBorder} rounded px-2 py-1.5 text-xs ${inputText}`}
                        >
                          {availableFlows.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                          {availableFlows.length === 0 && <option value="" disabled>No flows available</option>}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};