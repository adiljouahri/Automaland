import React, { useState, useEffect } from 'react';
import { X, MessageSquareWarning, Send, CreditCard } from 'lucide-react';

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (reason: string, description: string) => Promise<void>;
  flowName: string;
  theme: 'dark' | 'light';
  initialReason?: string; // Allow pre-selecting Upgrade Request
}

export const ReportModal: React.FC<ReportModalProps> = ({ isOpen, onClose, onSubmit, flowName, theme, initialReason }) => {
  const [reason, setReason] = useState('Bug');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
      if (isOpen && initialReason) {
          setReason(initialReason);
          if (initialReason === 'Upgrade Request') {
              setDescription("I would like to upgrade to the Pro plan to unlock unlimited flows and features.");
          }
      } else if (isOpen) {
          setReason('Bug');
          setDescription('');
      }
  }, [isOpen, initialReason]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) return;
    
    setIsSubmitting(true);
    try {
      await onSubmit(reason, description);
      onClose(); // Close on success
      setDescription(''); // Reset
      setReason('Bug');
    } catch (error) {
      console.error(error); 
    } finally {
      setIsSubmitting(false);
    }
  };

  const isDark = theme === 'dark';
  const overlayBg = 'bg-black/60 backdrop-blur-sm';
  const modalBg = isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200';
  const textPrimary = isDark ? 'text-slate-200' : 'text-slate-900';
  const textSecondary = isDark ? 'text-slate-400' : 'text-slate-500';
  const inputBg = isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900';

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center ${overlayBg} p-4 animate-in fade-in duration-200`}>
      <div className={`w-full max-w-lg rounded-2xl border shadow-2xl overflow-hidden flex flex-col ${modalBg}`} role="dialog" aria-modal="true">
        
        {/* Header */}
        <div className={`px-6 py-4 border-b flex items-center justify-between ${isDark ? 'border-slate-800 bg-slate-950' : 'border-slate-100 bg-slate-50'}`}>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${reason === 'Upgrade Request' ? (isDark ? 'bg-purple-900/30 text-purple-500' : 'bg-purple-100 text-purple-600') : (isDark ? 'bg-amber-900/30 text-amber-500' : 'bg-amber-100 text-amber-600')}`}>
                {reason === 'Upgrade Request' ? <CreditCard className="w-5 h-5" /> : <MessageSquareWarning className="w-5 h-5" />}
            </div>
            <div>
                <h3 className={`font-bold text-sm ${textPrimary}`}>{reason === 'Upgrade Request' ? 'Upgrade Subscription' : 'Report Issue / Feedback'}</h3>
                <p className={`text-xs ${textSecondary}`}>{reason === 'Upgrade Request' ? 'Request Pro Access' : `Flow: ${flowName}`}</p>
            </div>
          </div>
          <button onClick={onClose} className={`p-2 rounded-full transition-colors ${isDark ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-slate-200 text-slate-500'}`}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
            
            <div>
                <label className={`block text-xs font-bold uppercase tracking-wider mb-2 ${textSecondary}`}>Category</label>
                <select 
                    value={reason} 
                    onChange={e => setReason(e.target.value)}
                    className={`w-full px-4 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all appearance-none ${inputBg}`}
                >
                    <option value="Bug">🐛 Bug / Error</option>
                    <option value="Upgrade Request">🚀 Upgrade Request</option>
                    <option value="Malware">⚠️ Malware / Harmful</option>
                    <option value="Spam">🚫 Spam / Low Quality</option>
                    <option value="Feedback">💡 Feedback / Suggestion</option>
                    <option value="Other">📝 Other</option>
                </select>
            </div>

            <div>
                <label className={`block text-xs font-bold uppercase tracking-wider mb-2 ${textSecondary}`}>Message</label>
                <textarea 
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder={reason === 'Upgrade Request' ? "I'm interested in upgrading..." : "Describe the issue, error, or feedback in detail..."}
                    className={`w-full px-4 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all min-h-[150px] resize-none ${inputBg}`}
                    required
                ></textarea>
                <p className={`text-[10px] mt-2 text-right ${textSecondary}`}>
                    {description.length} characters
                </p>
            </div>

            {/* Footer Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
                <button 
                    type="button" 
                    onClick={onClose}
                    disabled={isSubmitting}
                    className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-colors ${isDark ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100'}`}
                >
                    Cancel
                </button>
                <button 
                    type="submit" 
                    disabled={isSubmitting || !description.trim()}
                    className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white shadow-lg transition-all 
                        ${isSubmitting || !description.trim() 
                            ? 'bg-slate-600 opacity-50 cursor-not-allowed' 
                            : 'bg-blue-600 hover:bg-blue-500 hover:shadow-blue-500/25 active:scale-95'}`}
                >
                    {isSubmitting ? 'Sending...' : <><Send className="w-4 h-4" /> {reason === 'Upgrade Request' ? 'Send Request' : 'Send Report'}</>}
                </button>
            </div>
        </form>
      </div>
    </div>
  );
};
