import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Square, Pause, Play, Trash2, Check } from 'lucide-react';
import toast from 'react-hot-toast';

export function VoiceRecorder({ onSave, maxDuration = 30 }) {
  const [state, setState] = useState('idle'); // idle, recording, paused, completed
  const [elapsed, setElapsed] = useState(0);
  const [audioUrl, setAudioUrl] = useState(null);
  
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animationRef = useRef(null);
  const canvasRef = useRef(null);
  
  const cleanup = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      cleanup();
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [cleanup, audioUrl]);

  const drawVisualizer = () => {
    if (!canvasRef.current || !analyserRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    // Smooth rendering on high DPI displays
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== canvas.clientWidth * dpr) {
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
      ctx.scale(dpr, dpr);
    }
    
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    
    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    const draw = () => {
      if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') return;
      animationRef.current = requestAnimationFrame(draw);
      
      analyserRef.current.getByteTimeDomainData(dataArray);
      
      ctx.clearRect(0, 0, cw, ch);
      
      ctx.lineWidth = 2;
      ctx.strokeStyle = mediaRecorderRef.current.state === 'paused' ? '#94a3b8' : '#ef4444'; // slate-400 or red-500
      ctx.beginPath();
      
      const sliceWidth = cw * 1.0 / bufferLength;
      let x = 0;
      
      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = v * ch / 2;
        
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
        x += sliceWidth;
      }
      
      ctx.lineTo(cw, ch / 2);
      ctx.stroke();
    };
    
    draw();
  };

  const startRecording = async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
        toast.error('Audio recording is not supported in this browser. Use file upload instead.');
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      source.connect(analyserRef.current);
      
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      
      recorder.onstop = () => {
        cleanup();
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        setState('completed');
      };
      
      recorder.start();
      setState('recording');
      setElapsed(0);
      
      timerRef.current = setInterval(() => {
        setElapsed(prev => {
          if (prev >= maxDuration - 1) {
            stopRecording();
            return maxDuration;
          }
          return prev + 1;
        });
      }, 1000);
      
      // Give a tiny delay for canvas to mount
      setTimeout(drawVisualizer, 50);
      
    } catch (err) {
      toast.error('Microphone unavailable or permission denied');
    }
  };
  
  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause();
      setState('paused');
      if (timerRef.current) clearInterval(timerRef.current);
      if (audioContextRef.current) audioContextRef.current.suspend();
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
      mediaRecorderRef.current.resume();
      setState('recording');
      if (audioContextRef.current) audioContextRef.current.resume();
      timerRef.current = setInterval(() => {
        setElapsed(prev => {
          if (prev >= maxDuration - 1) {
            stopRecording();
            return maxDuration;
          }
          return prev + 1;
        });
      }, 1000);
    }
  };

  const discardRecording = () => {
    cleanup();
    setState('idle');
    setElapsed(0);
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
  };

  const handleSave = () => {
    const blob = new Blob(audioChunksRef.current, { type: mediaRecorderRef.current?.mimeType || 'audio/webm' });
    const file = new File([blob], 'recorded_voice.webm', { type: blob.type });
    onSave(file);
    discardRecording();
  };

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (state === 'idle') {
    return (
      <button onClick={startRecording} className="mt-3 px-4 py-3 w-full rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-colors flex items-center justify-center gap-3 text-sm font-medium">
        <div className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]"></div>
        Start live recording
      </button>
    );
  }

  if (state === 'completed') {
    return (
      <div className="mt-3 p-4 rounded-xl bg-black/40 border border-white/10 flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center gap-2 text-emerald-400">
          <Check size={18} />
          <span className="text-sm font-medium">Recording captured ({formatTime(elapsed)})</span>
        </div>
        
        <audio controls src={audioUrl} className="w-full h-10 outline-none rounded-lg" />
        
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/5">
          <button onClick={discardRecording} className="px-3 py-2 rounded-lg hover:bg-white/10 text-rose-400 hover:text-rose-300 text-sm transition-colors flex items-center gap-2 font-medium">
            <Trash2 size={16} /> Discard
          </button>
          <button onClick={handleSave} className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors flex items-center gap-2">
            Use this recording
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 p-4 rounded-xl bg-slate-950 border border-white/10 flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-200 shadow-xl relative overflow-hidden">
      {/* Background glow when recording */}
      <div className={`absolute -inset-4 bg-red-500/10 blur-xl rounded-full transition-opacity duration-1000 ${state === 'recording' ? 'opacity-100' : 'opacity-0'}`} />
      
      <div className="relative flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${state === 'recording' ? 'bg-red-500 animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.7)]' : 'bg-slate-500'}`}></div>
          <span className="text-sm font-medium tabular-nums font-mono">{formatTime(elapsed)} / {formatTime(maxDuration)}</span>
        </div>
        <div className={`text-xs font-semibold px-2 py-1 rounded uppercase tracking-wider ${state === 'paused' ? 'bg-slate-800 text-slate-300' : 'bg-red-500/20 text-red-400'}`}>
          {state}
        </div>
      </div>
      
      <div className="relative h-20 w-full bg-black/50 rounded-lg overflow-hidden flex items-center justify-center z-10 border border-white/5">
        <canvas ref={canvasRef} className="w-full h-full object-cover opacity-80 mix-blend-screen"></canvas>
      </div>
      
      <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden z-10">
        <div className="h-full bg-red-500 transition-all duration-1000 ease-linear" style={{ width: `${(elapsed / maxDuration) * 100}%` }}></div>
      </div>
      
      <div className="flex items-center justify-center gap-4 mt-2 z-10">
        {state === 'recording' ? (
          <button onClick={pauseRecording} aria-label="Pause recording" className="p-3.5 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            <Pause size={20} fill="currentColor" />
          </button>
        ) : (
          <button onClick={resumeRecording} aria-label="Resume recording" className="p-3.5 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            <Play size={20} fill="currentColor" />
          </button>
        )}
        <button onClick={stopRecording} aria-label="Stop recording" className="p-4 rounded-full bg-red-500/20 hover:bg-red-500/30 text-red-500 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500">
          <Square size={20} fill="currentColor" />
        </button>
      </div>
    </div>
  );
}
