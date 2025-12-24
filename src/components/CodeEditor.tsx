import React, { useState, useEffect, useRef } from 'react';
import { Maximize2, Minimize2, Copy, Check, Wand2 } from 'lucide-react';
import Editor, { OnMount } from "@monaco-editor/react";

interface CodeEditorProps {
  title: string;
  code: string;
  language: 'javascript' | 'json' | 'typescript';
  onChange?: (val: string) => void;
  icon?: React.ReactNode;
  readonly?: boolean;
  extraHeaderContent?: React.ReactNode;
  theme?: 'dark' | 'light';
}

export const CodeEditor: React.FC<CodeEditorProps> = ({ 
  title, 
  code, 
  language, 
  onChange, 
  icon,
  readonly = false,
  extraHeaderContent,
  theme = 'dark'
}) => {
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [copied, setCopied] = useState(false);
  const isDark = theme === 'dark';
  
  const editorRef = useRef<any>(null);

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFormat = () => {
    if (editorRef.current) {
      editorRef.current.getAction('editor.action.formatDocument')?.run();
    }
  };

  // Handle ESC key to exit full screen
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullScreen) {
        setIsFullScreen(false);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isFullScreen]);

  // Prevent scroll on body when full screen
  useEffect(() => {
    if (isFullScreen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [isFullScreen]);

  // Re-layout editor when fullscreen toggles
  useEffect(() => {
    if (editorRef.current) {
        setTimeout(() => {
            editorRef.current.layout();
        }, 100);
    }
  }, [isFullScreen]);

  const bgColor = isDark ? "bg-[#1e1e1e]" : "bg-white"; // Matches vs-dark default
  const borderColor = isDark ? "border-slate-700" : "border-slate-200";
  const headerBg = isDark ? "bg-slate-900" : "bg-slate-50";
  const headerBorder = isDark ? "border-slate-800" : "border-slate-200";

  const containerClasses = isFullScreen 
    ? `fixed inset-0 z-50 flex flex-col ${bgColor}` 
    : `flex flex-col h-full ${bgColor} border ${borderColor} rounded-lg overflow-hidden shadow-sm transition-all duration-300 hover:shadow-md`;

  return (
    <div className={containerClasses}>
      {/* Header */}
      <div className={`flex items-center justify-between px-4 py-3 ${headerBg} border-b ${headerBorder} shrink-0`}>
        <div className={`flex items-center gap-3 font-medium text-sm ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
          {icon && <span className="text-blue-500">{icon}</span>}
          <span className="tracking-wide opacity-90">{title}</span>
        </div>
        <div className="flex items-center gap-3">
            {extraHeaderContent}
            
            <div className={`h-4 w-px mx-1 ${isDark ? 'bg-slate-700' : 'bg-slate-300'}`}></div>

            <div className={`flex items-center rounded-md border p-0.5 ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-300'}`}>
               {!readonly && (
                   <button 
                    onClick={handleFormat}
                    className={`p-1.5 rounded transition-colors ${isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200'}`}
                    title="Format Code"
                   >
                     <Wand2 className="w-3.5 h-3.5" />
                   </button>
               )}
               <button 
                onClick={handleCopy}
                className={`p-1.5 rounded transition-colors group relative ${isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200'}`}
                title="Copy Code"
               >
                 {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
               </button>
               <button 
                onClick={() => setIsFullScreen(!isFullScreen)}
                className={`p-1.5 rounded transition-colors ${isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200'}`}
                title={isFullScreen ? "Exit Full Screen (Esc)" : "Full Screen"}
               >
                 {isFullScreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
               </button>
            </div>
            
            <div className={`hidden sm:block text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded border select-none ${isDark ? 'text-slate-500 bg-slate-950 border-slate-800' : 'text-slate-500 bg-slate-100 border-slate-300'}`}>
              {language}
            </div>
        </div>
      </div>
      
      {/* Editor Area */}
      <div className="relative flex-1 group overflow-hidden"> 
        <Editor
            height="100%"
            defaultLanguage={language}
            language={language}
            value={code}
            onChange={(value) => onChange && onChange(value || '')}
            theme={isDark ? "vs-dark" : "light"}
            options={{
                minimap: { enabled: isFullScreen }, // Only show minimap in fullscreen
                fontSize: isFullScreen ? 15 : 13,
                readOnly: readonly,
                fontFamily: "'Fira Code', 'Cascadia Code', 'Source Code Pro', Menlo, monospace",
                fontLigatures: true,
                scrollBeyondLastLine: false,
                automaticLayout: true,
                padding: { top: 16, bottom: 16 },
                tabSize: 2,
            }}
            onMount={handleEditorDidMount}
        />
        
        {/* Status / Hints Overlay */}
        {!readonly && (
            <div className="absolute bottom-3 right-6 pointer-events-none transition-opacity duration-200 opacity-0 group-hover:opacity-100 z-10">
                <span className={`text-[10px] border px-2 py-1 rounded shadow-lg backdrop-blur ${isDark ? 'text-slate-500 bg-slate-900/90 border-slate-800' : 'text-slate-500 bg-white/90 border-slate-200'}`}>
                    {isFullScreen ? 'ESC to Exit' : 'Editable'}
                </span>
            </div>
        )}
      </div>
    </div>
  );
};