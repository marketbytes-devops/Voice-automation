import React, { useState } from 'react';
import { Orb } from '../components/Orb';
import { Header } from '../components/Header';
import { useVoiceAgent } from '../hooks/useVoiceAgent';
import { Play, Square, RotateCcw, Trash2, MessageCircle, Settings2 } from 'lucide-react';
import toast from 'react-hot-toast';

export function UserPage() {
  const [language, setLanguage] = useState('en');
  const {
    appState,
    messages,
    interimText,
    connectionStatus,
    startConnection,
    closeConnection,
    resetConversation
  } = useVoiceAgent(language);

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-slate-200 flex flex-col font-sans selection:bg-blue-500/30">
      <div className="max-w-6xl w-full mx-auto px-6 flex flex-col h-screen">
        <Header live={connectionStatus} isAdmin={false} />
        
        <main className="flex-1 grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-8 py-6 min-h-0">
          
          {/* LEFT COL: Orb & Controls */}
          <div className="flex flex-col gap-6 h-full justify-between">
            {/* Settings Card */}
            <div className="bg-slate-900/50 border border-white/10 rounded-3xl p-6 shadow-2xl backdrop-blur-xl relative overflow-hidden group hover:border-white/20 transition-all duration-500">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              
              <div className="flex items-center gap-3 mb-5 relative z-10">
                <div className="p-2 bg-blue-500/20 rounded-lg text-blue-400">
                  <Settings2 size={18} />
                </div>
                <h3 className="text-sm font-semibold tracking-wide text-slate-300">Preferences</h3>
              </div>

              <div className="relative z-10">
                <label className="text-xs font-medium text-slate-400 block mb-2 uppercase tracking-wider">Spoken Language</label>
                <div className="relative">
                  <select 
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    disabled={connectionStatus}
                    className="w-full bg-black/40 border border-white/10 rounded-xl py-3 pl-4 pr-10 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/50 disabled:opacity-50 appearance-none transition-all cursor-pointer hover:bg-black/60 text-slate-200"
                  >
                    <option value="en" className="bg-slate-900 text-slate-200 py-2">🇺🇸 English</option>
                    <option value="ta" className="bg-slate-900 text-slate-200 py-2">🇮🇳 Tamil</option>
                    <option value="ml" className="bg-slate-900 text-slate-200 py-2">🇮🇳 Malayalam</option>
                    <option value="zh" className="bg-slate-900 text-slate-200 py-2">🇨🇳 Mandarin</option>
                    <option value="ms" className="bg-slate-900 text-slate-200 py-2">🇲🇾 Malay</option>
                  </select>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                  </div>
                </div>
              </div>
            </div>

            {/* Orb Card */}
            <div className="flex-1 bg-slate-900/50 border border-white/10 rounded-3xl p-8 shadow-2xl backdrop-blur-xl flex flex-col items-center justify-center relative overflow-hidden group hover:border-white/20 transition-all duration-500">
              <div className="absolute inset-0 bg-gradient-to-t from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              
              <div className="relative z-10 scale-125 my-8">
                <Orb state={appState} />
              </div>

              <div className="flex w-full gap-3 mt-auto relative z-10">
                <button 
                  onClick={startConnection}
                  disabled={connectionStatus}
                  className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-500 to-emerald-400 text-white py-3.5 rounded-xl text-sm font-bold disabled:opacity-30 disabled:grayscale hover:shadow-[0_0_20px_rgba(16,185,129,0.4)] hover:-translate-y-0.5 transition-all duration-300"
                >
                  <Play size={18} fill="currentColor" /> Start Session
                </button>
                <button 
                  onClick={closeConnection}
                  disabled={!connectionStatus}
                  className="flex-[0.3] flex items-center justify-center gap-2 bg-rose-500/10 text-rose-500 border border-rose-500/30 py-3.5 rounded-xl text-sm font-bold disabled:opacity-30 hover:bg-rose-500 hover:text-white hover:shadow-[0_0_20px_rgba(244,63,94,0.4)] transition-all duration-300"
                >
                  <Square size={18} fill="currentColor" />
                </button>
              </div>
            </div>
          </div>

          {/* RIGHT COL: Transcript */}
          <div className="bg-slate-900/50 border border-white/10 rounded-3xl flex flex-col overflow-hidden shadow-2xl backdrop-blur-xl group hover:border-white/20 transition-all duration-500">
            <div className="flex items-center justify-between px-6 py-5 border-b border-white/10 bg-black/20">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-500/20 rounded-lg text-indigo-400">
                  <MessageCircle size={18} />
                </div>
                <h3 className="text-sm font-semibold tracking-wide text-slate-200">Live Transcript</h3>
              </div>
              <button 
                onClick={() => { resetConversation(); toast.success('Transcript cleared'); }}
                className="flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-rose-400 bg-white/5 hover:bg-rose-500/10 px-3 py-1.5 rounded-lg transition-all"
              >
                <Trash2 size={14} /> Clear
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6 scroll-smooth">
              {messages.length === 0 && !interimText ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-4 opacity-60">
                  <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10">
                    <MessageCircle size={32} />
                  </div>
                  <p className="text-sm text-center font-medium">Ready when you are.<br/>Click Start and say "I need an appointment."</p>
                </div>
              ) : (
                <>
                  {messages.map((m) => (
                    <div key={m.id} className={`flex flex-col gap-1.5 ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                      <span className="text-[10px] font-bold tracking-widest uppercase text-slate-500 px-2">
                        {m.role === 'user' ? 'You' : 'SmileCare AI'}
                      </span>
                      <div className={`max-w-[80%] px-5 py-3.5 rounded-2xl text-sm leading-relaxed shadow-lg ${
                        m.role === 'user' 
                          ? 'bg-blue-600 text-white rounded-tr-sm' 
                          : 'bg-slate-800 border border-white/10 text-slate-200 rounded-tl-sm'
                      }`}>
                        {m.text}
                      </div>
                    </div>
                  ))}
                  
                  {interimText && (
                    <div className="flex flex-col gap-1.5 items-end animate-pulse">
                      <span className="text-[10px] font-bold tracking-widest uppercase text-slate-500 px-2">You</span>
                      <div className="max-w-[80%] px-5 py-3.5 rounded-2xl text-sm leading-relaxed bg-blue-600/50 text-white/70 rounded-tr-sm italic shadow-lg">
                        {interimText}...
                      </div>
                    </div>
                  )}
                  
                  {appState === 'thinking' && (
                    <div className="flex flex-col gap-1.5 items-start">
                      <span className="text-[10px] font-bold tracking-widest uppercase text-slate-500 px-2">SmileCare AI</span>
                      <div className="px-5 py-4 rounded-2xl bg-slate-800 border border-white/10 rounded-tl-sm shadow-lg flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '0s' }} />
                        <div className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '0.15s' }} />
                        <div className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '0.3s' }} />
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
