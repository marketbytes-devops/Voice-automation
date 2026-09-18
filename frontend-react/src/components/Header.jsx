import React from 'react';
import { Link } from 'react-router-dom';
import { Activity, Shield } from 'lucide-react';

export function Header({ live = false, isAdmin = false }) {
  return (
    <header className="flex items-center gap-5 py-6 mb-2 border-b border-white/5 relative z-20">
      <div className="flex items-center justify-center w-12 h-12 bg-gradient-to-br from-blue-500 to-cyan-400 rounded-2xl shadow-[0_0_30px_rgba(59,130,246,0.3)] text-white shrink-0">
        <Activity size={24} />
      </div>
      <div>
        <h1 className="text-xl font-extrabold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent tracking-tight">
          SmileCare AI <span className="text-blue-400 font-medium ml-1">{isAdmin ? 'Admin' : ''}</span>
        </h1>
        <p className="text-[11px] font-medium tracking-widest uppercase text-slate-500 mt-1">
          Powered by OpenAI · ElevenLabs · Deepgram
        </p>
      </div>

      <div className="flex items-center gap-4 ml-auto">
        <Link 
          to={isAdmin ? "/" : "/admin"}
          className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-slate-300 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 hover:border-white/20 transition-all shadow-lg backdrop-blur-sm"
        >
          {isAdmin ? 'User App' : <><Shield size={14} /> Admin Tools</>}
        </Link>
        
        {!isAdmin && (
          <div className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-bold transition-all shadow-lg backdrop-blur-sm ${
            live ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.15)]' : 'bg-slate-900/50 border-white/10 text-slate-400'
          }`}>
            <div className={`w-2 h-2 rounded-full bg-current ${live ? 'animate-pulse shadow-[0_0_8px_currentColor]' : ''}`} />
            {live ? 'Live' : 'Disconnected'}
          </div>
        )}
      </div>
    </header>
  );
}
