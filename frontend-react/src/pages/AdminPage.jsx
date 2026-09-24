import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Header } from '../components/Header';
import { Mic, Upload, Trash2, Play, Square, FileText, Languages, KeyRound, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const KEY_STORAGE = 'smilecare-admin-key';

export function AdminPage() {
  const [adminKey, setAdminKey] = useState(() => sessionStorage.getItem(KEY_STORAGE) || '');
  const [keyInput, setKeyInput] = useState('');
  const [authorized, setAuthorized] = useState(false);
  const [voices, setVoices] = useState([]);
  const [languages, setLanguages] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [voiceName, setVoiceName] = useState('SmileCare Receptionist');
  const [selectedFile, setSelectedFile] = useState(null);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [previewing, setPreviewing] = useState(null);
  const [documentFile, setDocumentFile] = useState(null);
  const mediaRecorder = useRef(null);
  const audioChunks = useRef([]);
  const previewUrl = useRef(null);

  const adminFetch = useCallback(async (path, options = {}) => {
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...(options.headers || {}), 'X-Admin-Key': adminKey
      },
    });
    if (response.status === 401 || response.status === 503) {
      setAuthorized(false);
      throw new Error(response.status === 401 ? 'Admin key rejected' : 'Admin API key is not configured on server');
    }
    const body = response.headers.get('content-type')?.includes('application/json') ? await response.json() : null;
    if (!response.ok) throw new Error(body?.detail || `Request failed (${response.status})`);
    return body;
  }, [adminKey]);

  const refreshAll = useCallback(async () => {
    const [voiceRows, languageRows, documentRows] = await Promise.all([
      adminFetch('/api/voices'), adminFetch('/api/admin/languages'), adminFetch('/api/admin/knowledge'),
    ]);
    setVoices(voiceRows);
    setLanguages(languageRows.languages || []);
    setDocuments(documentRows);
    setAuthorized(true);
    sessionStorage.setItem(KEY_STORAGE, adminKey);
  }, [adminFetch, adminKey]);

  useEffect(() => {
    if (!adminKey) return undefined;
    const timer = window.setTimeout(() => {
      refreshAll().catch((error) => {
        if (error.message !== 'Admin key rejected') toast.error(error.message);
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [adminKey, refreshAll]);

  useEffect(() => () => { if (previewUrl.current) URL.revokeObjectURL(previewUrl.current); }, []);

  const signIn = async (event) => {
    event.preventDefault();
    if (!keyInput.trim()) return;
    setAdminKey(keyInput.trim());
    setKeyInput('');
  };

  const signOut = () => {
    sessionStorage.removeItem(KEY_STORAGE);
    setAdminKey('');
    setAuthorized(false);
    setVoices([]); setLanguages([]); setDocuments([]);
  };

  const toggleLanguage = async (language) => {
    try {
      await adminFetch(`/api/admin/languages/${language.code}`, {
        method: 'PUT', body: JSON.stringify({ enabled: !language.enabled }),
      });
      await refreshAll();
      toast.success(`${language.name} setting saved`);
    } catch (error) { toast.error(error.message); }
  };

  const cloneVoice = async () => {
    if (!selectedFile) return;
    setBusy(true);
    const form = new FormData();
    form.append('file', selectedFile);
    form.append('voice_name', voiceName.trim());
    try {
      await adminFetch('/api/clone-voice', { method: 'POST', body: form });
      setSelectedFile(null);
      setVoiceName('');
      await refreshAll();
      toast.success('Voice saved and activated');
    } catch (error) { toast.error(error.message); }
    finally { setBusy(false); }
  };

  const activateVoice = async (id) => {
    try { await adminFetch(`/api/voices/${id}/activate`, { method: 'PUT' }); await refreshAll(); toast.success('Active voice updated'); }
    catch (error) { toast.error(error.message); }
  };

  const deleteVoice = async (voice) => {
    if (!window.confirm(`Delete voice “${voice.name}”?`)) return;
    try { await adminFetch(`/api/voices/${voice.id}`, { method: 'DELETE' }); await refreshAll(); toast.success('Voice deleted'); }
    catch (error) { toast.error(error.message); }
  };

  const previewVoice = async (voice) => {
    if (previewing) return;
    setPreviewing(voice.id);
    try {
      const response = await fetch(`${API_URL}/api/voices/${voice.id}/preview`, { headers: { 'X-Admin-Key': adminKey } });
      if (!response.ok) throw new Error('Voice preview failed');
      const blob = await response.blob();
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
      previewUrl.current = URL.createObjectURL(blob);
      const audio = new Audio(previewUrl.current);
      audio.onended = () => setPreviewing(null);
      audio.onerror = () => setPreviewing(null);
      await audio.play();
    } catch (error) { 
      toast.error(error.message || 'Preview playback failed');
      setPreviewing(null);
    }
  };

  const toggleRecording = async () => {
    if (recording) { mediaRecorder.current?.stop(); return; }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      toast.error('Audio recording is not supported in this browser. Use file upload instead.'); return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorder.current = recorder;
      audioChunks.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size) audioChunks.current.push(event.data); };
      recorder.onerror = () => { stream.getTracks().forEach((track) => track.stop()); setRecording(false); toast.error('Recording failed'); };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(audioChunks.current, { type: recorder.mimeType || 'audio/webm' });
        setSelectedFile(new File([blob], 'recorded_voice.webm', { type: blob.type }));
        setRecording(false);
        toast.success('Recording ready to upload');
      };
      recorder.start(); setRecording(true);
      window.setTimeout(() => { if (recorder.state === 'recording') recorder.stop(); }, 30000);
    } catch { toast.error('Microphone unavailable or permission denied'); }
  };

  const uploadDocument = async () => {
    if (!documentFile) return;
    const form = new FormData(); form.append('file', documentFile);
    try {
      await adminFetch('/api/admin/knowledge', { method: 'POST', body: form });
      setDocumentFile(null); await refreshAll(); toast.success('Document extracted and added to assistant references');
    } catch (error) { toast.error(error.message); }
  };

  const removeDocument = async (document) => {
    try { await adminFetch(`/api/admin/knowledge/${document.id}`, { method: 'DELETE' }); await refreshAll(); toast.success('Document removed'); }
    catch (error) { toast.error(error.message); }
  };

  if (!authorized) return (
    <div className="min-h-screen bg-[#0a0f1e] text-slate-200 flex flex-col font-sans">
      <div className="max-w-5xl w-full mx-auto px-6"><Header isAdmin live={false} />
        <form onSubmit={signIn} className="max-w-md mx-auto mt-20 p-8 rounded-3xl bg-slate-900/70 border border-white/10">
          <KeyRound className="text-blue-400 mb-4" />
          <h1 className="text-lg font-semibold">Admin access</h1>
          <p className="text-sm text-slate-400 mt-2">Enter the configured admin API key. This prototype key is kept only for this browser session.</p>
          <input aria-label="Admin API key" type="password" autoComplete="current-password" value={keyInput} onChange={(e) => setKeyInput(e.target.value)} className="w-full mt-5 bg-black/40 border border-white/10 rounded-xl py-3 px-4 text-sm" />
          <button className="w-full mt-4 bg-blue-600 rounded-xl py-3 text-sm font-bold">Continue</button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-slate-200 flex flex-col font-sans">
      <div className="max-w-6xl w-full mx-auto px-6"><Header isAdmin live={false} />
        <div className="flex justify-end -mt-2 mb-4"><button onClick={signOut} className="text-xs text-slate-400 hover:text-white">Sign out of admin</button></div>
        <main className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-10">
          <section className="rounded-3xl p-6 bg-slate-900/60 border border-white/10">
            <div className="flex items-center gap-3 mb-5"><Mic className="text-blue-400" /><div><h2 className="font-semibold">Voice library</h2><p className="text-xs text-slate-400">Upload or record an approved sample; max 20 MiB / 30 seconds.</p></div></div>
            <label className="block border border-dashed border-white/20 rounded-xl p-4 text-sm cursor-pointer"><Upload className="inline mr-2" size={16} />{selectedFile?.name || 'Choose audio sample'}<input type="file" accept="audio/*" className="hidden" onChange={(e) => setSelectedFile(e.target.files?.[0] || null)} /></label>
            <button onClick={toggleRecording} className="mt-3 px-4 py-2 rounded-lg bg-white/10 text-sm">{recording ? <><Square size={14} className="inline mr-2" />Stop recording</> : <><Mic size={14} className="inline mr-2" />Record (30 sec max)</>}</button>
            <input aria-label="Voice label" maxLength={100} value={voiceName} onChange={(e) => setVoiceName(e.target.value)} placeholder="Voice label" className="w-full mt-4 bg-black/40 border border-white/10 rounded-xl p-3 text-sm" />
            <button onClick={cloneVoice} disabled={!selectedFile || !voiceName.trim() || busy} className="mt-3 w-full rounded-xl py-3 bg-blue-600 disabled:opacity-40 text-sm font-semibold">{busy ? 'Processing sample…' : 'Upload and activate voice'}</button>
            <div className="mt-5 space-y-2 max-h-64 overflow-y-auto">{voices.map((voice) => <div key={voice.id} className="flex items-center gap-2 p-3 rounded-xl bg-black/20 border border-white/5">
              <div className="flex-1 min-w-0"><p className="truncate text-sm">{voice.name} {voice.isActive && <span className="text-emerald-400">· Active</span>}</p><p className="text-xs text-slate-500">{voice.createdAt ? new Date(voice.createdAt).toLocaleDateString() : ''}</p></div>
              <button title="Preview voice" onClick={() => previewVoice(voice)} disabled={!!previewing} className={`p-2 ${previewing === voice.id ? 'text-blue-500 animate-pulse' : 'text-blue-300 disabled:opacity-50'}`}><Play size={15} /></button>
              {!voice.isActive && <button onClick={() => activateVoice(voice.id)} className="p-2 text-emerald-300" title="Activate voice"><CheckCircle2 size={16} /></button>}
              <button onClick={() => deleteVoice(voice)} className="p-2 text-rose-300" title="Delete voice"><Trash2 size={15} /></button>
            </div>)}</div>
          </section>

          <section className="rounded-3xl p-6 bg-slate-900/60 border border-white/10">
            <div className="flex items-center gap-3 mb-4"><Languages className="text-cyan-400" /><div><h2 className="font-semibold">Spoken language availability</h2><p className="text-xs text-slate-400">Only enable languages verified for both configured STT and TTS.</p></div></div>
            <div className="space-y-2">{languages.map((language) => <label key={language.code} className="flex items-center justify-between p-3 rounded-xl bg-black/20 border border-white/5">
              <span><span className="text-sm">{language.name}</span><span className="block text-xs text-slate-500">{language.supported ? 'STT and TTS marked tested' : 'Not verified by provider configuration'}</span></span>
              <input aria-label={`Enable ${language.name}`} type="checkbox" checked={language.enabled} disabled={!language.supported || language.code === 'en'} onChange={() => toggleLanguage(language)} className="accent-cyan-500 w-4 h-4" />
            </label>)}</div>
            <p className="mt-3 text-xs text-amber-300/80">Setting provider capability requires operator testing and configuration; turning on a checkbox alone cannot assert support.</p>
          </section>

          <section className="rounded-3xl p-6 bg-slate-900/60 border border-white/10 lg:col-span-2">
            <div className="flex items-center gap-3 mb-4"><FileText className="text-indigo-300" /><div><h2 className="font-semibold">Clinic knowledge documents</h2><p className="text-xs text-slate-400">UTF-8 TXT/Markdown, text-based PDF, or DOCX · max 2 MiB each. Scanned PDFs are unsupported.</p></div></div>
            <div className="flex flex-col sm:flex-row gap-3"><input type="file" accept=".txt,.md,.pdf,.docx" onChange={(e) => setDocumentFile(e.target.files?.[0] || null)} className="flex-1 text-sm" /><button disabled={!documentFile} onClick={uploadDocument} className="px-4 py-2 rounded-xl bg-indigo-600 disabled:opacity-40 text-sm">Upload and extract</button></div>
            <div className="mt-4 space-y-2">{documents.length === 0 && <p className="text-sm text-slate-500">No knowledge documents added.</p>}{documents.map((document) => <div key={document.id} className="flex items-center gap-3 p-3 bg-black/20 rounded-xl"><div className="flex-1"><p className="text-sm">{document.filename}</p><p className="text-xs text-slate-500">{Math.ceil(document.sizeBytes / 1024)} KB · {document.status}{document.error ? ` · ${document.error}` : ''}</p></div><button aria-label={`Delete ${document.filename}`} onClick={() => removeDocument(document)} className="p-2 text-rose-300"><Trash2 size={16} /></button></div>)}</div>
          </section>
        </main>
      </div>
    </div>
  );
}
