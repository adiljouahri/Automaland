import React, { useMemo, useState } from 'react';
import { JSONSchema } from '../types';
import { FileJson, Code, Eye, AlertTriangle, PlayCircle } from 'lucide-react';

interface FormRendererProps {
  schemaStr: string;
  formData: Record<string, any>;
  onChange: (data: Record<string, any>) => void;
  onSchemaChange: (newSchema: string) => void;
  theme?: 'dark' | 'light';
  actions?: string[];
  onRunAction?: (actionName: string) => void;
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
  isRunning = false
}) => {
  const [viewMode, setViewMode] = useState<'preview' | 'code'>('preview');
  const isDark = theme === 'dark';
  
  const { schema, error } = useMemo(() => {
    try {
      return { schema: JSON.parse(schemaStr) as JSONSchema, error: null };
    } catch (e: any) {
      return { schema: null, error: e.message };
    }
  }, [schemaStr]);

  const handleChange = (key: string, value: any) => {
    onChange({ ...formData, [key]: value });
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
  const codeText = isDark ? "text-slate-300" : "text-slate-700";

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
      
      <div className={`flex-1 overflow-hidden relative ${contentBg} flex flex-col`}>
        <div className="flex-1 overflow-hidden relative">
        {viewMode === 'code' ? (
             <textarea
                className={`w-full h-full p-4 ${contentBg} ${codeText} font-mono text-xs leading-relaxed resize-none focus:outline-none selection:bg-blue-500/30`}
                value={schemaStr}
                onChange={(e) => onSchemaChange(e.target.value)}
                spellCheck={false}
                style={{ 
                    fontFamily: "'Fira Code', 'Cascadia Code', 'Source Code Pro', Menlo, monospace",
                    tabSize: 2
                }}
            />
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
                {schema.properties && Object.entries(schema.properties).map(([key, prop]: [string, any]) => (
                    <div key={key} className="flex flex-col gap-1.5">
                    <label className={`text-xs font-medium uppercase tracking-wider ${labelColor}`}>
                        {prop.title || key}
                    </label>
                    
                    {prop.description && (
                        <span className="text-xs text-slate-500 mb-1">{prop.description}</span>
                    )}

                    {prop.enum ? (
                        <select
                        value={formData[key] || ''}
                        onChange={(e) => handleChange(key, e.target.value)}
                        className={`w-full ${inputBg} border ${inputBorder} rounded px-3 py-2 text-sm ${inputText} focus:border-blue-500 focus:outline-none transition-colors`}
                        >
                            <option value="" disabled>Select an option</option>
                        {prop.enum.map((opt: string) => (
                            <option key={opt} value={opt}>{opt}</option>
                        ))}
                        </select>
                    ) : prop.type === 'boolean' ? (
                        <div className="flex items-center gap-2 mt-1">
                            <input
                                type="checkbox"
                                checked={formData[key] || false}
                                onChange={(e) => handleChange(key, e.target.checked)}
                                className={`w-4 h-4 rounded ${inputBorder} ${inputBg} text-blue-500 focus:ring-blue-500`}
                            />
                            <span className={`text-sm ${labelColor}`}>{prop.title || key}</span>
                        </div>
                    ) : prop.type === 'integer' || prop.type === 'number' ? (
                        <input
                        type="number"
                        value={formData[key] || ''}
                        onChange={(e) => handleChange(key, Number(e.target.value))}
                        className={`w-full ${inputBg} border ${inputBorder} rounded px-3 py-2 text-sm ${inputText} focus:border-blue-500 focus:outline-none transition-colors`}
                        placeholder="0"
                        />
                    ) : (
                        <input
                        type="text"
                        value={formData[key] || ''}
                        onChange={(e) => handleChange(key, e.target.value)}
                        className={`w-full ${inputBg} border ${inputBorder} rounded px-3 py-2 text-sm ${inputText} focus:border-blue-500 focus:outline-none transition-colors`}
                        placeholder={key === 'file' ? '/path/to/file.png' : 'Enter text...'}
                        />
                    )}
                    </div>
                ))}

                    {(!schema.properties || Object.keys(schema.properties).length === 0) && (
                        <div className="text-sm text-slate-500 italic">No properties defined in schema.</div>
                    )}
                </form>
            </div>
        )}
        </div>

        {/* Action Buttons Footer */}
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