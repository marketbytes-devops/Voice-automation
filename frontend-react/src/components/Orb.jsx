import React from 'react';
import { Mic, MessageCircle, Volume2, Headphones } from 'lucide-react';

export function Orb({ state }) {
  const stateConfig = {
    idle: { label: 'Ready', icon: <Headphones size={32} />, colors: 'from-slate-800 to-slate-700', shadow: 'shadow-none', ring1: 'border-white/5', ring2: 'border-white/5' },
    listening: { label: 'Listening', icon: <Mic size={32} />, colors: 'from-green-700 to-green-500', shadow: 'shadow-[0_0_30px_rgba(34,197,94,0.35),0_0_60px_rgba(34,197,94,0.15)]', ring1: 'border-green-500 animate-[ping_2s_ease-out_infinite]', ring2: 'border-green-500/50 animate-[ping_2s_0.4s_ease-out_infinite]' },
    thinking: { label: 'Thinking', icon: <MessageCircle size={32} />, colors: 'from-amber-700 to-amber-500', shadow: 'shadow-[0_0_30px_rgba(245,158,11,0.35)]', ring1: 'border-amber-500 animate-[spin_2s_linear_infinite]', ring2: 'border-amber-500/40 animate-[spin_1.5s_linear_infinite_reverse]' },
    speaking: { label: 'Speaking', icon: <Volume2 size={32} />, colors: 'from-blue-700 to-blue-500', shadow: 'shadow-[0_0_30px_rgba(59,130,246,0.35),0_0_60px_rgba(59,130,246,0.15)]', ring1: 'border-blue-500 animate-[ping_0.8s_ease-out_infinite]', ring2: 'border-blue-500/50 animate-[ping_0.8s_0.2s_ease-out_infinite]' },
  };

  const current = stateConfig[state] || stateConfig.idle;

  return (
    <div className="flex flex-col items-center gap-4 py-8">
      <div className="relative flex items-center justify-center w-32 h-32">
        {/* Rings */}
        <div className={`absolute w-32 h-32 rounded-full border-2 border-dashed ${current.ring1} transition-colors duration-300`} />
        <div className={`absolute w-28 h-28 rounded-full border-2 border-dashed ${current.ring2} transition-colors duration-300`} />
        
        {/* Core Orb */}
        <div className={`z-10 flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br ${current.colors} ${current.shadow} transition-all duration-300 text-white`}>
          {current.icon}
        </div>
      </div>
      
      <div className="flex flex-col items-center gap-2">
        <span className={`text-sm font-semibold tracking-wider uppercase transition-colors duration-300 ${
          state === 'listening' ? 'text-green-500' :
          state === 'thinking' ? 'text-amber-500' :
          state === 'speaking' ? 'text-blue-500' :
          'text-slate-400'
        }`}>
          {current.label}
        </span>
        
        {/* Waveform when speaking */}
        {state === 'speaking' && (
          <div className="flex items-center gap-1 h-8">
            {[...Array(9)].map((_, i) => (
              <div 
                key={i} 
                className="w-1 bg-gradient-to-t from-blue-500 to-cyan-400 rounded-full animate-pulse"
                style={{ height: `${Math.max(4, Math.random() * 28)}px`, animationDelay: `${i * 0.1}s` }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
