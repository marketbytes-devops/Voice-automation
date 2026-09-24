import React from 'react';
import { Orb } from '../components/Orb';
import { Header } from '../components/Header';
import { useVoiceAgent } from '../hooks/useVoiceAgent';
import { PhoneCall, Square, Trash2, MessageCircle, RotateCcw, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';

const stateLabel = { idle: 'Ready', language_select: 'Choose a language by speaking', listening: 'Listening', thinking: 'Thinking', speaking: 'Speaking' };

export function UserPage() {
  const { appState, messages, interimText, connectionStatus, error, languages, selectedLanguage,
    startConnection, closeConnection, resetConversation, clearError } = useVoiceAgent();

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-slate-200 flex flex-col font-sans selection:bg-blue-500/30">
      <div className="max-w-6xl w-full mx-auto px-6 flex flex-col min-h-screen">
        <Header live={connectionStatus} isAdmin={false} />
        <main className="flex-1 grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-8 py-6 min-h-0">
          <section className="flex flex-col gap-6 min-h-[520px]">
            <div className="rounded-3xl p-6 bg-slate-900/60 border border-white/10">
              <div className="flex items-center gap-3 mb-3"><PhoneCall className="text-blue-400" size={19} /><h2 className="font-semibold">SmileCare Customer Care</h2></div>
              <p className="text-sm text-slate-400">Start a voice session, then say an enabled language name in English when prompted. Only clinic-enabled, provider-tested options are offered.</p>
              <p className="mt-3 text-xs text-slate-500">Available options: {languages.length ? languages.map((language) => language.name).join(', ') : 'Loading or none enabled'}</p>
              {selectedLanguage && <p className="mt-2 text-xs text-emerald-300">Conversation language: {selectedLanguage}</p>}
              <p className="mt-3 text-xs text-slate-500">Microphone audio is sent to configured speech and AI providers; a text transcript is retained for this prototype.</p>
            </div>
            <div className="flex-1 rounded-3xl p-8 bg-slate-900/50 border border-white/10 shadow-2xl flex flex-col items-center justify-center">
              <div className="my-8 scale-125"><Orb state={appState} /></div>
              <p role="status" className="mb-5 text-sm text-slate-400">{stateLabel[appState] || appState}</p>
              <div className="flex w-full gap-3">
                <button onClick={startConnection} disabled={connectionStatus || !languages.length} className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-500 to-emerald-400 text-white py-3.5 rounded-xl text-sm font-bold disabled:opacity-30">
                  <PhoneCall size={18} /> Call Customer Care
                </button>
                <button onClick={closeConnection} disabled={!connectionStatus} aria-label="End call" className="flex items-center justify-center px-5 bg-rose-500/10 text-rose-400 border border-rose-500/30 rounded-xl disabled:opacity-30">
                  <Square size={18} fill="currentColor" />
                </button>
              </div>
              {connectionStatus && <button onClick={() => { closeConnection(); toast.success('Call ended'); }} className="mt-3 text-xs text-slate-500 hover:text-white">End session and stop microphone</button>}
            </div>
          </section>

          <section className="bg-slate-900/50 border border-white/10 rounded-3xl flex flex-col overflow-hidden shadow-2xl min-h-[520px]">
            <div className="flex items-center justify-between px-6 py-5 border-b border-white/10 bg-black/20">
              <div className="flex items-center gap-3"><MessageCircle className="text-indigo-400" size={18} /><h2 className="text-sm font-semibold">Live Transcript</h2></div>
              <button onClick={() => { resetConversation(); toast.success('Transcript cleared from this view'); }} className="flex items-center gap-2 text-xs text-slate-400 hover:text-rose-400"><Trash2 size={14} /> Clear</button>
            </div>
            {error && <div role="alert" className="mx-5 mt-4 flex gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200"><AlertCircle className="shrink-0" size={17} /><span className="flex-1">{error}</span><button onClick={clearError} aria-label="Dismiss error">×</button></div>}
            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
              {messages.length === 0 && !interimText ? <div className="flex flex-col items-center justify-center h-full min-h-48 text-slate-500 gap-3"><MessageCircle size={32} /><p className="text-sm text-center">{connectionStatus ? 'The receptionist will greet you and ask which language you prefer.' : 'Start a call and wait for the spoken language prompt.'}</p></div> : <>
                {messages.map((message) => <div key={message.id} className={`flex flex-col gap-1 ${message.role === 'user' ? 'items-end' : 'items-start'}`}><span className="text-[10px] font-bold tracking-widest uppercase text-slate-500 px-2">{message.role === 'user' ? 'You' : 'SmileCare'}</span><div className={`max-w-[85%] px-5 py-3.5 rounded-2xl text-sm leading-relaxed ${message.role === 'user' ? 'bg-blue-600 text-white rounded-tr-sm' : 'bg-slate-800 border border-white/10 text-slate-200 rounded-tl-sm'}`}>{message.text}</div></div>)}
                {interimText && <div className="self-end max-w-[85%] px-5 py-3.5 rounded-2xl text-sm italic bg-blue-600/50 text-white/70">{interimText}…</div>}
                {appState === 'thinking' && <div className="text-sm text-slate-400 flex items-center gap-2"><RotateCcw size={14} className="animate-spin" /> Processing…</div>}
              </>}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
