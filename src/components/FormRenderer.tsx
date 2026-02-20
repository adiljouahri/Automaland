import React, { useMemo, useState } from 'react';
import { JSONSchema } from '../types';
import { FileJson, Code, Eye, AlertTriangle, PlayCircle, Type, Hash, CheckSquare, List, Key, Copy, FolderOpen, FileSearch, Trash2 } from 'lucide-react';
import { CodeEditor } from './CodeEditor';

interface FormRendererProps {
  schemaStr: string;
  formData: Record<string, any>;
  onChange: (data: Record<string, any>) => void;
  onSchemaChange: (newSchema: string) => void;
  theme?: 'dark' | 'light';
  actions?: string[];
  onRunAction?: (actionName: string) => void;
  onInjectSnippet?: (type: 'file_browser' | 'folder_browser') => void;
  onBrowse?: (key: string, type: 'file' | 'folder') => void;
  onRemoveField?: (key: string) => void;
  isRunning?: boolean;
}

export const FormRenderer: React.FC<FormRendererProps> = ({ 
  schemaStr, 
  formData, 
  onChange, 
  onSchemaChange, 
  theme = 'dark',
  actions = [],
  onRunAction,
  onInjectSnippet,
  onBrowse,
  onRemoveField,
  isRunning = false
}) => {
  const [viewMode, setViewMode] = useState<'preview' | 'code'>('preview');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const isDark = theme === 'dark';
  
  const { schema, error } = useMemo(() => {
    try {
      if (!schemaStr || schemaStr.trim() === '') return { schema: { type: 'object', properties: {} }, error: null };
      const parsed = JSON.parse(schemaStr);
      return { schema: parsed as JSONSchema, error: null };
    } catch (e: any) {
      return { schema: null, error: e.message };
    }
  }, [schemaStr]);

  const handleChange = (key: string, value: any) => {
    onChange({ ...formData, [key]: value });
  };

  const handleCopyKey = (key: string, prop: any) => {
      let valSnippet = "'New Value'";
      if (formData[key] !== undefined) {
          if (typeof formData[key] === 'string') {
              valSnippet = `'${formData[key]}'`;
          } else {
              valSnippet = JSON.stringify(formData[key]);
          }
      } else if (prop.type === 'boolean') {
          valSnippet = 'true';
      } else if (prop.type === 'number' || prop.type === 'integer') {
          valSnippet = '0';
      } else if (prop.type === 'array') {
          valSnippet = '[]';
      }

      const codeSnippet = `utils.setUI('${key}', ${valSnippet});`;
      navigator.clipboard.writeText(codeSnippet);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
  };

  const injectField = (type: 'string' | 'number' | 'boolean' | 'enum' | 'file' | 'folder') => {
    try {
        let current: any;
        try {
            current = JSON.parse(schemaStr);
        } catch(e) {
            current = { type: "object", properties: {} };
        }

        if (!current.properties) current.properties = {};
        
        const timestamp = Date.now().toString().slice(-4);
        let newField: any = {};
        let keyName = "";

        switch(type) {
            case 'string':
                keyName = `text_${timestamp}`;
                newField = { type: "string", title: "New Text Input", default: "" };
                break;
            case 'number':
                keyName = `num_${timestamp}`;
                newField = { type: "number", title: "New Number", default: 0 };
                break;
            case 'boolean':
                keyName = `check_${timestamp}`;
                newField = { type: "boolean", title: "New Checkbox", default: false };
                break;
            case 'enum':
                keyName = `select_${timestamp}`;
                newField = { type: "string", title: "New Dropdown", enum: ["Option A", "Option B"], default: "Option A" };
                break;
            case 'file':
                keyName = `file_${timestamp}`;
                newField = { type: "string", title: "File Path", description: "Path to a file", default: "./", format: "file" };
                break;
            case 'folder':
                keyName = `folder_${timestamp}`;
                newField = { type: "string", title: "Folder Path", description: "Path to a folder", default: "./", format: "folder" };
                break;
        }

        current.properties[keyName] = newField;
        onSchemaChange(JSON.stringify(current, null, 2));
    } catch (e) {
        alert("Cannot inject field: Invalid JSON currently in editor.");
    }
  };

  const handleRemoveField = (keyToRemove: string) => {
      if (onRemoveField) {
          onRemoveField(keyToRemove);
          return;
      }
      try {
          const current = JSON.parse(schemaStr);
          if (current.properties && current.properties[keyToRemove]) {
              delete current.properties[keyToRemove];
              onSchemaChange(JSON.stringify(current, null, 2));
          }
      } catch (e) {
          console.error("Failed to remove field", e);
      }
  };

  const containerBorder = isDark ? "border-slate-700" : "border-slate-200";
  const containerShadow = isDark ? "shadow-lg" : "shadow-sm";
  const headerBg = isDark ? "bg-slate-900" : "bg-slate-50";
  const headerBorder = isDark ? "border-slate-800" : "border-slate-200";
  const contentBg = isDark ? "bg-[#0d1117]" : "bg-white";
  const labelColor = isDark ? "text-slate-300" : "text-slate-600";
  const inputBg = isDark ? "bg-slate-800" : "bg-white";
  const inputBorder = isDark ? "border-slate-600" : "border-slate-300";
  const inputText = isDark ? "text-white" : "text-slate-800";

  return (
    <div className={`flex flex-col h-full ${headerBg} border ${containerBorder} rounded-lg overflow-hidden ${containerShadow} hover:shadow-xl transition-all`}>
      <div className={`px-4 py-3 ${headerBg} border-b ${headerBorder} flex justify-between items-center shrink-0`}>
        <div className="flex items-center gap-2">
            <span className={`font-medium text-sm tracking-wide ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>UI Panel</span>
            {error && (
              <div title="Invalid JSON Schema">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
              </div>
            )}
        </div>
        
        <div className={`flex items-center rounded-md p-0.5 border ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-300'}`}>
             <button 
                onClick={() => setViewMode('preview')}
                className={`p-1.5 rounded-md transition-all ${viewMode === 'preview' ? (isDark ? 'bg-slate-800 text-blue-400' : 'bg-white text-blue-600 shadow-sm') : 'text-slate-500 hover:text-slate-400'}`}
                title="Preview Form"
             >
                <Eye className="w-3.5 h-3.5" />
             </button>
             <button 
                onClick={() => setViewMode('code')}
                className={`p-1.5 rounded-md transition-all ${viewMode === 'code' ? (isDark ? 'bg-slate-800 text-blue-400' : 'bg-white text-blue-600 shadow-sm') : 'text-slate-500 hover:text-slate-400'}`}
                title="Edit Schema JSON"
             >
                <Code className="w-3.5 h-3.5" />
             </button>
        </div>
      </div>
      
      {/* TOOLBAR */}
      <div className={`flex flex-col gap-2 px-3 py-2 border-b ${headerBorder} ${isDark ? 'bg-slate-900/50' : 'bg-slate-50'}`}>
            <div className="flex items-center gap-1">
                <span className="text-[10px] uppercase font-bold text-slate-500 mr-2 w-10 shrink-0">Basic:</span>
                <button onClick={() => injectField('string')} title="Add Text Input" className={`flex items-center gap-1 p-1.5 rounded transition-colors ${isDark ? 'hover:bg-slate-800 text-slate-400 hover:text-blue-400' : 'hover:bg-slate-200 text-slate-600'}`}>
                    <Type className="w-3.5 h-3.5" />
                    <span className="text-[10px] font-medium">Text</span>
                </button>
                <button onClick={() => injectField('number')} title="Add Number Input" className={`flex items-center gap-1 p-1.5 rounded transition-colors ${isDark ? 'hover:bg-slate-800 text-slate-400 hover:text-blue-400' : 'hover:bg-slate-200 text-slate-600'}`}>
                    <Hash className="w-3.5 h-3.5" />
                    <span className="text-[10px] font-medium">Number</span>
                </button>
                <button onClick={() => injectField('boolean')} title="Add Checkbox" className={`flex items-center gap-1 p-1.5 rounded transition-colors ${isDark ? 'hover:bg-slate-800 text-slate-400 hover:text-blue-400' : 'hover:bg-slate-200 text-slate-600'}`}>
                    <CheckSquare className="w-3.5 h-3.5" />
                    <span className="text-[10px] font-medium">Check</span>
                </button>
                <button onClick={() => injectField('enum')} title="Add Dropdown" className={`flex items-center gap-1 p-1.5 rounded transition-colors ${isDark ? 'hover:bg-slate-800 text-slate-400 hover:text-blue-400' : 'hover:bg-slate-200 text-slate-600'}`}>
                    <List className="w-3.5 h-3.5" />
                    <span className="text-[10px] font-medium">Select</span>
                </button>
            </div>
            
            <div className="flex items-center gap-1">
                <span className="text-[10px] uppercase font-bold text-slate-500 mr-2 w-10 shrink-0">Files:</span>
                <button onClick={() => onInjectSnippet && onInjectSnippet('file_browser')} title="Add File Picker" className={`flex items-center gap-1 p-1.5 rounded transition-colors ${isDark ? 'hover:bg-purple-900/30 text-purple-400' : 'hover:bg-purple-50 text-purple-600'}`}>
                    <FileSearch className="w-3.5 h-3.5" />
                    <span className="text-[10px] font-medium">File</span>
                </button>
                <button onClick={() => onInjectSnippet && onInjectSnippet('folder_browser')} title="Add Folder Picker" className={`flex items-center gap-1 p-1.5 rounded transition-colors ${isDark ? 'hover:bg-purple-900/30 text-purple-400' : 'hover:bg-purple-50 text-purple-600'}`}>
                    <FolderOpen className="w-3.5 h-3.5" />
                    <span className="text-[10px] font-medium">Folder</span>
                </button>
            </div>
      </div>

      <div className={`flex-1 overflow-hidden relative ${contentBg} flex flex-col`}>
        <div className="flex-1 overflow-hidden relative">
        {viewMode === 'code' ? (
             <div className="h-full">
               <CodeEditor 
                  title="" 
                  code={schemaStr} 
                  onChange={onSchemaChange} 
                  language="json" 
                  theme={theme}
                  readonly={isRunning}
               />
             </div>
        ) : !schema ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-500 p-6 text-center">
            <FileJson className="w-12 h-12 mb-2 opacity-50" />
            <p>Invalid JSON Schema</p>
            <p className="text-xs text-red-400 mt-2 font-mono">{error}</p>
          </div>
        ) : (
            <div className={`p-6 overflow-y-auto h-full ${isDark ? 'bg-[#161b22]' : 'bg-slate-50/50'}`}>
                <h3 className={`text-lg font-semibold mb-2 ${isDark ? 'text-white' : 'text-slate-800'}`}>{schema.title || "Untitled Form"}</h3>
                <p className="text-sm text-slate-500 mb-6">{schema.description}</p>

                <form className="space-y-5" onSubmit={(e) => e.preventDefault()}>
                {schema.properties && Object.keys(schema.properties).length > 0 ? (
                    Object.entries(schema.properties).map(([key, prop]: [string, any]) => {
                        // Fallback handling
                        const fieldType = prop.type || 'string';
                        const isEnum = Array.isArray(prop.enum);
                        const isBool = fieldType === 'boolean';
                        const isNum = fieldType === 'integer' || fieldType === 'number';
                        const isFile = prop.format === 'file';
                        const isFolder = prop.format === 'folder';

                        return (
                        <div key={key} className="flex flex-col gap-1.5 group relative">
                            <div className="flex justify-between items-center">
                                <label className={`text-xs font-medium uppercase tracking-wider flex items-center gap-2 ${labelColor}`}>
                                    {prop.title || key}
                                </label>
                                
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button 
                                        onClick={() => handleCopyKey(key, prop)}
                                        className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border transition-all
                                        ${copiedKey === key 
                                            ? 'bg-green-500/10 border-green-500 text-green-500' 
                                            : (isDark ? 'bg-slate-800 border-slate-700 text-slate-500 hover:text-blue-400' : 'bg-slate-100 border-slate-300 text-slate-500 hover:text-blue-600')}`}
                                        title={`Key: "${key}" - Click to copy Node.js setUI code`}
                                    >
                                        {copiedKey === key ? <Copy className="w-3 h-3" /> : <Key className="w-3 h-3" />}
                                        <span className="font-mono">{key}</span>
                                    </button>
                                    <button
                                        onClick={() => handleRemoveField(key)}
                                        className={`p-1 rounded border transition-colors ${isDark ? 'bg-slate-800 border-slate-700 text-slate-500 hover:text-red-400 hover:border-red-500/50' : 'bg-slate-100 border-slate-300 text-slate-500 hover:text-red-500 hover:border-red-300'}`}
                                        title="Remove Field"
                                    >
                                        <Trash2 className="w-3 h-3" />
                                    </button>
                                </div>
                            </div>
                            
                            {prop.description && (
                                <span className="text-xs text-slate-500 mb-1">{prop.description}</span>
                            )}

                            {isEnum ? (
                                <select
                                value={formData[key] !== undefined ? formData[key] : (prop.default || '')}
                                onChange={(e) => handleChange(key, e.target.value)}
                                className={`w-full ${inputBg} border ${inputBorder} rounded px-3 py-2 text-sm ${inputText} focus:border-blue-500 focus:outline-none transition-colors`}
                                >
                                    <option value="" disabled>Select an option</option>
                                {prop.enum.map((opt: string) => (
                                    <option key={opt} value={opt}>{opt}</option>
                                ))}
                                </select>
                            ) : isBool ? (
                                <div className="flex items-center gap-2 mt-1">
                                    <input
                                        type="checkbox"
                                        checked={formData[key] !== undefined ? formData[key] : (prop.default || false)}
                                        onChange={(e) => handleChange(key, e.target.checked)}
                                        className={`w-4 h-4 rounded ${inputBorder} ${inputBg} text-blue-500 focus:ring-blue-500`}
                                    />
                                    <span className={`text-sm ${labelColor}`}>{prop.title || key}</span>
                                </div>
                            ) : isNum ? (
                                <input
                                type="number"
                                value={formData[key] !== undefined ? formData[key] : (prop.default || '')}
                                onChange={(e) => handleChange(key, Number(e.target.value))}
                                className={`w-full ${inputBg} border ${inputBorder} rounded px-3 py-2 text-sm ${inputText} focus:border-blue-500 focus:outline-none transition-colors`}
                                placeholder="0"
                                />
                            ) : (
                                <div className="flex gap-2">
                                    <input
                                    type="text"
                                    value={formData[key] !== undefined ? formData[key] : (prop.default || '')}
                                    onChange={(e) => handleChange(key, e.target.value)}
                                    className={`w-full ${inputBg} border ${inputBorder} rounded px-3 py-2 text-sm ${inputText} focus:border-blue-500 focus:outline-none transition-colors`}
                                    placeholder={key.toLowerCase().includes('path') ? '/path/to/...' : 'Enter text...'}
                                    />
                                    {(isFile || isFolder) && (
                                        <button 
                                            onClick={() => onBrowse && onBrowse(key, isFile ? 'file' : 'folder')}
                                            className={`px-3 py-2 rounded border ${isDark ? 'bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-300' : 'bg-white border-slate-300 hover:bg-slate-50 text-slate-700'} transition-colors`}
                                            title={isFile ? "Browse File" : "Browse Folder"}
                                        >
                                            {isFile ? <FileSearch className="w-4 h-4" /> : <FolderOpen className="w-4 h-4" />}
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    )})
                ) : (
                    <div className="text-sm text-slate-500 italic p-4 text-center border border-dashed rounded opacity-50 border-slate-500">
                        No form fields defined. <br/>
                        Use the toolbar or edit the JSON Schema to add inputs.
                    </div>
                )}
                </form>
            </div>
        )}
        </div>

        {viewMode === 'preview' && actions.length > 0 && (
          <div className={`p-3 border-t ${headerBorder} ${isDark ? 'bg-slate-900' : 'bg-slate-50'} grid grid-cols-2 gap-2`}>
            {actions.map(action => (
              <button 
                key={action}
                onClick={() => onRunAction && onRunAction(action)}
                disabled={isRunning}
                className={`flex items-center justify-center gap-2 px-3 py-2 rounded text-xs font-bold transition-all
                  ${isDark 
                    ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700' 
                    : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 shadow-sm'}
                  ${isRunning ? 'opacity-50 cursor-not-allowed' : ''}
                `}
              >
                <PlayCircle className="w-3.5 h-3.5" />
                {action}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};