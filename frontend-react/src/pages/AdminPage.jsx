import React, { useState, useEffect, useRef } from 'react';
import { Header } from '../components/Header';
import { Mic, Upload, Trash2, RefreshCw, PhoneCall, Settings, ShieldCheck, Activity, Play, Square, Download } from 'lucide-react';
import toast from 'react-hot-toast';

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export function AdminPage() {
  const [voices, setVoices] = useState([]);
  const [isLoadingVoices, setIsLoadingVoices] = useState(false);
  
  const [voiceName, setVoiceName] = useState('Receptionist Voice');
  const [selectedFile, setSelectedFile] = useState(null);
  const [isCloning, setIsCloning] = useState(false);

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [audioURL, setAudioURL] = useState(null);
  const mediaRecorder = useRef(null);
  const audioChunks = useRef([]);

  const [clonedVoiceId, setClonedVoiceId] = useState(null);

  const fetchVoices = async () => {
    setIsLoadingVoices(true);
    try {
      const res = await fetch(`${API_URL}/api/voices`);
      const data = await res.json();
      setVoices(data);
    } catch (e) {
      toast.error('Failed to load voices');
    } finally {
      setIsLoadingVoices(false);
    }
  };

  useEffect(() => {
    fetchVoices();
  }, []);

  useEffect(() => {
    if (selectedFile) {
      const url = URL.createObjectURL(selectedFile);
      setAudioURL(url);
      return () => URL.revokeObjectURL(url); // cleanup
    } else {
      setAudioURL(null);
    }
  }, [selectedFile]);

  const handleDeleteVoice = async (id, name) => {
    if (!window.confirm(`Delete voice '${name}'?`)) return;
    const toastId = toast.loading(`Deleting '${name}'...`);
    try {
      const res = await fetch(`${API_URL}/api/voices/${id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success(`Voice '${name}' deleted!`, { id: toastId });
        fetchVoices();
      } else {
        toast.error(`Failed to delete '${name}'`, { id: toastId });
      }
    } catch (e) {
      toast.error(`Error: ${e.message}`, { id: toastId });
    }
  };

  const handleCloneVoice = async () => {
    if (!selectedFile) return;
    setIsCloning(true);
    const toastId = toast.loading('Cloning voice...');
    
    const form = new FormData();
    form.append('file', selectedFile);
    form.append('voice_name', voiceName.trim() || 'Admin Cloned Voice');

    try {
      const res = await fetch(`${API_URL}/api/clone-voice`, { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Clone failed');

      toast.success('Voice cloned and activated!', { id: toastId });
      setVoiceName('');
      setClonedVoiceId(data.id);
      fetchVoices();
    } catch (err) {
      toast.error(err.message, { id: toastId });
    } finally {
      setIsCloning(false);
    }
  };

  const playPreview = (id, name) => {
    const toastId = toast.loading(`Generating preview for ${name}...`);
    const audio = new Audio(`${API_URL}/api/voices/${id}/preview`);
    
    audio.oncanplaythrough = () => {
      toast.dismiss(toastId);
      audio.play().catch(e => toast.error('Failed to play audio'));
    };
    audio.onerror = () => {
      toast.error('Failed to load audio preview', { id: toastId });
    };
  };

  const toggleRecording = async () => {
    if (isRecording) {
      if (mediaRecorder.current && mediaRecorder.current.state === 'recording') {
        mediaRecorder.current.stop();
      }
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder.current = new MediaRecorder(stream);
      audioChunks.current = [];

      mediaRecorder.current.ondataavailable = e => {
        if (e.data.size > 0) audioChunks.current.push(e.data);
      };

      mediaRecorder.current.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        setIsRecording(false);
        
        const blob = new Blob(audioChunks.current, { type: 'audio/webm' });
        const file = new File([blob], "recorded_sample.webm", { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        
        setAudioURL(url);
        setSelectedFile(file);
        toast.success('Recording finished! You can now clone it.');
      };

      mediaRecorder.current.start();
      setIsRecording(true);
      toast('Recording... speak clearly for 10-30 seconds.', { icon: '🎤' });
    } catch (err) {
      toast.error('Microphone access denied or failed.');
    }
  };

  const triggerMockReminder = () => {
    toast('Scanning database for upcoming appointments...', { icon: '🔍' });
    setTimeout(() => {
      toast('Found 1 appointment: John Doe (Tomorrow 10:00 AM)', { icon: '📅' });
      setTimeout(() => {
        toast.success('Initiating outbound Twilio call to +91 98765 43210...', { duration: 5000 });
      }, 2000);
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-slate-200 flex flex-col font-sans selection:bg-blue-500/30">
      <div className="max-w-5xl w-full mx-auto px-6 flex flex-col min-h-screen">
        <Header isAdmin={true} live={false} />
        
        <main className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-8 py-6">
          
          {/* LEFT COL */}
          <div className="flex flex-col gap-8">
            
            {/* Clone Voice Panel */}
            <div className="bg-slate-900/50 border border-white/10 rounded-3xl p-6 shadow-2xl backdrop-blur-xl relative overflow-hidden group hover:border-white/20 transition-all duration-500">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              
              <div className="flex items-center gap-3 mb-6 relative z-10">
                <div className="p-2 bg-blue-500/20 rounded-lg text-blue-400">
                  <Mic size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold tracking-wide text-slate-200">Voice Cloning</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Create a custom AI voice model</p>
                </div>
              </div>
              
              <label className={`
                relative z-10 block border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-300
                ${selectedFile ? 'border-blue-500 bg-blue-500/10 shadow-[0_0_20px_rgba(59,130,246,0.15)]' : 'border-white/10 hover:border-blue-500/50 hover:bg-white/5'}
              `}>
                <input 
                  type="file" 
                  accept="audio/*" 
                  className="hidden" 
                  onChange={(e) => setSelectedFile(e.target.files[0])}
                />
                <div className={`w-14 h-14 mx-auto rounded-full flex items-center justify-center mb-4 transition-colors ${selectedFile ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30' : 'bg-white/5 text-slate-400'}`}>
                  <Upload size={24} />
                </div>
                <p className="text-sm font-semibold text-slate-200">{selectedFile ? selectedFile.name : 'Click to upload audio sample'}</p>
                <p className="text-xs text-slate-500 mt-2 mb-4">MP3, WAV, M4A · 10–60 seconds</p>
                
                <button 
                  onClick={(e) => { e.preventDefault(); toggleRecording(); }}
                  className={`w-full max-w-[200px] mx-auto flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 ${
                    isRecording 
                      ? 'bg-rose-500 text-white shadow-[0_0_20px_rgba(244,63,94,0.4)] animate-pulse' 
                      : 'bg-white/10 text-slate-300 border border-white/10 hover:bg-white/20'
                  }`}
                >
                  {isRecording ? <Square size={16} fill="currentColor" /> : <Mic size={16} />}
                  {isRecording ? 'Stop Recording' : 'Record with Mic'}
                </button>
              </label>

              {audioURL && (
                <div className="mt-6 p-4 rounded-xl bg-black/20 border border-white/5 relative z-10 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Preview Recording</p>
                    <a 
                      href={audioURL} 
                      download="recorded_sample.webm"
                      className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                    >
                      <Download size={14} /> Download
                    </a>
                  </div>
                  <audio src={audioURL} controls className="w-full h-10 rounded-lg outline-none" />
                </div>
              )}

              <div className="mt-6 relative z-10">
                <label className="text-xs font-medium text-slate-400 block mb-2 uppercase tracking-wider">Voice Label</label>
                <input 
                  type="text" 
                  value={voiceName}
                  onChange={(e) => setVoiceName(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl py-3 px-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all text-slate-200"
                />
              </div>

              <button 
                onClick={handleCloneVoice}
                disabled={!selectedFile || isCloning}
                className="w-full mt-6 relative z-10 flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-cyan-500 text-white py-3.5 rounded-xl text-sm font-bold disabled:opacity-30 disabled:grayscale hover:shadow-[0_0_20px_rgba(59,130,246,0.4)] hover:-translate-y-0.5 transition-all duration-300"
              >
                {isCloning ? <RefreshCw className="animate-spin" size={18} /> : <Mic size={18} />}
                {isCloning ? 'Processing Audio...' : (selectedFile?.name === 'recorded_sample.webm' ? 'Upload & Use this Voice' : 'Train AI Voice')}
              </button>
            </div>

          </div>

          {/* RIGHT COL */}
          <div className="flex flex-col gap-8">
            
            {/* MVP Demo Tools */}
            <div className="bg-gradient-to-br from-indigo-500/10 to-purple-500/5 border border-indigo-500/20 rounded-3xl p-6 shadow-2xl backdrop-blur-xl relative overflow-hidden group hover:border-indigo-500/40 transition-all duration-500">
              <div className="flex items-center gap-3 mb-6 relative z-10">
                <div className="p-2 bg-indigo-500/20 rounded-lg text-indigo-400">
                  <Activity size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold tracking-wide text-indigo-300">MVP Demo Actions</h3>
                  <p className="text-xs text-indigo-400/60 mt-0.5">Test background cron jobs instantly</p>
                </div>
              </div>
              
              <button 
                onClick={triggerMockReminder}
                className="w-full flex items-center justify-center gap-2 bg-indigo-500/10 text-indigo-300 border border-indigo-500/30 py-4 rounded-xl text-sm font-bold hover:bg-indigo-500 hover:text-white hover:shadow-[0_0_20px_rgba(99,102,241,0.4)] hover:-translate-y-0.5 transition-all duration-300"
              >
                <PhoneCall size={18} fill="currentColor" /> Trigger Outbound Reminder Call
              </button>
            </div>

            {/* Manage Voices */}
            <div className="bg-slate-900/50 border border-white/10 rounded-3xl p-6 shadow-2xl backdrop-blur-xl flex flex-col flex-1 max-h-[500px]">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-slate-800 rounded-lg text-slate-400 border border-white/5">
                    <Settings size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold tracking-wide text-slate-200">Voice Library</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Manage ElevenLabs quota (30 max)</p>
                  </div>
                </div>
                <button onClick={fetchVoices} className="p-2 text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-all border border-white/5">
                  <RefreshCw size={16} className={isLoadingVoices ? 'animate-spin' : ''} />
                </button>
              </div>

              <div className="flex flex-col gap-3 overflow-y-auto pr-2 custom-scrollbar">
                {voices.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 opacity-50">
                    <ShieldCheck size={32} className="mb-3 text-slate-500" />
                    <p className="text-sm font-medium text-slate-400">Library is empty</p>
                  </div>
                ) : (
                  voices.map((v) => (
                    <div key={v.id} className="flex items-center justify-between bg-black/20 hover:bg-black/40 border border-white/5 p-4 rounded-xl transition-colors group">
                      <div className="min-w-0 flex flex-col gap-1">
                        <p className="text-sm font-semibold text-slate-200 truncate">{v.name}</p>
                        <p className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">{new Date(v.createdAt).toLocaleDateString()}</p>
                      </div>
                      <div className="flex items-center">
                        <button 
                          onClick={() => playPreview(v.id, v.name)}
                          className="ml-2 p-2 text-blue-400 hover:text-blue-300 hover:bg-blue-400/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                          title="Preview voice"
                        >
                          <Play size={16} />
                        </button>
                        <button 
                          onClick={() => handleDeleteVoice(v.id, v.name)}
                          className="ml-2 p-2 text-slate-500 hover:text-rose-400 hover:bg-rose-400/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                          title="Delete voice"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>
        </main>
      </div>
    </div>
  );
}
