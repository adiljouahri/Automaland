import React, { useEffect, useRef } from 'react';
import { LogEntry } from '../types';
import { Terminal } from 'lucide-react';

interface LogConsoleProps {
  logs: LogEntry[];
  isRunning: boolean;
  theme?: 'dark' | 'light';
}

export const LogConsole: React.FC<LogConsoleProps> = ({ logs, isRunning, theme = 'dark' }) => {
  const bottomRef = useRef<HTMLDivElement>(null);
  const isDark = theme === 'dark';

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // We intentionally keep the inner console area dark (Matrix style) even in light mode for code readability,
  // but we change the container borders and headers to match the theme.
  
  const containerBg = isDark ? "bg-slate-950" : "bg-white";
  const containerBorder = isDark ? "border-slate-700" : "border-slate-200";
  const headerBg = isDark ? "bg-slate-900" : "bg-slate-50";
  const headerBorder = isDark ? "border-slate-800" : "border-slate-200";
  const headerText = isDark ? "text-slate-300" : "text-slate-700";

  return (
    <div className={`flex flex-col ${containerBg} border-t ${containerBorder} h-64 shadow-2xl transition-colors`}>
      <div className={`flex items-center justify-between px-4 py-2 ${headerBg} border-b ${headerBorder}`}>
        <div className={`flex items-center gap-2 font-mono text-sm ${headerText}`}>
          <Terminal className="w-4 h-4 text-purple-500" />
          <span>Execution Console</span>
          {isRunning && (
            <span className="flex h-2 w-2 relative ml-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
            </span>
          )}
        </div>
        <div className="text-xs text-slate-500">
          {logs.length} events
        </div>
      </div>
      
      {/* Console Area - Always Dark for aesthetics */}
      <div className="flex-1 overflow-y-auto p-4 font-mono text-sm bg-[#0a0a0a] text-slate-300">
        {logs.length === 0 ? (
            <div className="text-slate-600 italic">Ready to execute. Waiting for trigger...</div>
        ) : (
            <div className="space-y-1">
            {logs.map((log) => (
                <div key={log.id} className="flex items-start gap-3 hover:bg-white/5 p-1 rounded transition-colors">
                <span className="text-slate-500 text-xs mt-0.5 shrink-0 select-none">
                    {log.timestamp}
                </span>
                <span className={`text-xs font-bold uppercase w-12 shrink-0 ${
                    log.source === 'NODE' ? 'text-green-500' :
                    log.source === 'ADOBE' ? 'text-blue-500' :
                    log.source === 'UI' ? 'text-yellow-500' : 'text-slate-400'
                }`}>
                    [{log.source}]
                </span>
                <span className={`break-all ${
                    log.type === 'error' ? 'text-red-400' :
                    log.type === 'success' ? 'text-green-300' : 'text-slate-300'
                }`}>
                    {log.message}
                </span>
                </div>
            ))}
            <div ref={bottomRef} />
            </div>
        )}
      </div>
    </div>
  );
};