import { useCallback, useEffect, useRef, useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const WS_BASE_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000';
const VAD_THRESHOLD = 150;

export function useVoiceAgent() {
  const [appState, setAppState] = useState('idle');
  const [messages, setMessages] = useState([]);
  const [interimText, setInterimText] = useState('');
  const [connectionStatus, setConnectionStatus] = useState(false);
  const [error, setError] = useState('');
  const [languages, setLanguages] = useState([]);
  const [selectedLanguage, setSelectedLanguage] = useState('');
  const appStateRef = useRef(appState);
  const mounted = useRef(true);
  const ws = useRef(null);
  const audioCtx = useRef(null);
  const micStream = useRef(null);
  const worklet = useRef(null);
  const analyser = useRef(null);
  const vadTimer = useRef(null);
  const pendingChunks = useRef([]);
  const currentAudio = useRef(null);
  const audioUrl = useRef(null);

  useEffect(() => { appStateRef.current = appState; }, [appState]);

  const addMessage = useCallback((role, text) => {
    setMessages((previous) => [...previous, { id: `${Date.now()}-${Math.random()}`, role, text }]);
  }, []);

  const stopAudio = useCallback(() => {
    if (currentAudio.current) {
      currentAudio.current.onerror = null;
      currentAudio.current.pause();
      currentAudio.current.src = '';
      currentAudio.current = null;
    }
    if (audioUrl.current) { URL.revokeObjectURL(audioUrl.current); audioUrl.current = null; }
  }, []);

  const stopMic = useCallback(() => {
    if (micStream.current) {
      micStream.current.getTracks().forEach((track) => track.stop());
      micStream.current = null;
    }
    if (worklet.current) { worklet.current.disconnect(); worklet.current = null; }
    if (audioCtx.current && audioCtx.current.state !== 'closed') {
      audioCtx.current.close().catch(() => { });
      audioCtx.current = null;
    }
    clearInterval(vadTimer.current);
  }, []);

  const closeConnection = useCallback(() => {
    const socket = ws.current;
    ws.current = null;
    if (socket && socket.readyState < WebSocket.CLOSING) {
      try { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'stop' })); } catch { /* socket is closing */ }
      socket.close();
    }
    stopMic(); stopAudio();
    if (mounted.current) { setConnectionStatus(false); setAppState('idle'); }
  }, [stopAudio, stopMic]);

  useEffect(() => {
    mounted.current = true;
    fetch(`${API_URL}/api/public-settings`).then((response) => {
      if (!response.ok) throw new Error('Language availability could not be loaded');
      return response.json();
    }).then((data) => { if (mounted.current) setLanguages(data.languages || []); })
      .catch(() => { if (mounted.current) setError('SmileCare availability is temporarily unavailable. Retry before starting a call.'); });
    return () => { mounted.current = false; closeConnection(); };
  }, [closeConnection]);

  const startMic = async () => {
    if (!navigator.mediaDevices?.getUserMedia || !window.AudioWorkletNode) {
      throw new Error('This browser cannot capture call audio. Try a modern browser with microphone access.');
    }
    micStream.current = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1, sampleRate: 16000, echoCancellation: true, noiseSuppression: true, autoGainControl: true,
      }
    });
    audioCtx.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
    await audioCtx.current.audioWorklet.addModule('/processor.js');
    const source = audioCtx.current.createMediaStreamSource(micStream.current);
    worklet.current = new AudioWorkletNode(audioCtx.current, 'pcm-processor');
    worklet.current.port.onmessage = (event) => {
      if (ws.current?.readyState === WebSocket.OPEN && appStateRef.current !== 'speaking') ws.current.send(event.data);
    };
    source.connect(worklet.current);
    worklet.current.connect(audioCtx.current.destination);
    analyser.current = audioCtx.current.createAnalyser();
    analyser.current.fftSize = 256;
    source.connect(analyser.current);
  };

  const playAudio = async () => {
    if (!pendingChunks.current.length) return;
    const arrays = pendingChunks.current.map((chunk) => {
      const binary = atob(chunk);
      return Uint8Array.from(binary, (char) => char.charCodeAt(0));
    });
    const bytes = new Uint8Array(arrays.reduce((sum, array) => sum + array.length, 0));
    let offset = 0;
    arrays.forEach((array) => { bytes.set(array, offset); offset += array.length; });
    pendingChunks.current = [];
    stopAudio();
    audioUrl.current = URL.createObjectURL(new Blob([bytes], { type: 'audio/mpeg' }));
    currentAudio.current = new Audio(audioUrl.current);
    currentAudio.current.onended = () => { stopAudio(); if (mounted.current) setAppState('listening'); };
    currentAudio.current.onerror = () => { stopAudio(); if (mounted.current) setError('Audio playback failed. Read the transcript and continue or end the call.'); };
    try {
      await currentAudio.current.play();
      if (analyser.current) {
        clearInterval(vadTimer.current);
        const values = new Uint8Array(analyser.current.frequencyBinCount);
        vadTimer.current = setInterval(() => {
          if (appStateRef.current !== 'speaking' || !analyser.current) return;
          analyser.current.getByteFrequencyData(values);
          const average = values.reduce((sum, value) => sum + value, 0) / values.length;
          if (average > VAD_THRESHOLD && ws.current?.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify({ type: 'barge_in' }));
            stopAudio(); setAppState('listening');
          }
        }, 100);
      }
    } catch { setError('Audio playback was blocked. Read the transcript or enable browser audio.'); }
  };

  const startConnection = async () => {
    if (connectionStatus) return;
    setError(''); setInterimText('');
    if (!languages.length) { setError('No spoken languages are currently enabled. Contact the clinic.'); return; }
    try {
      const socket = new WebSocket(`${WS_BASE_URL}/ws/audio`);
      ws.current = socket;
      socket.onopen = async () => {
        if (!mounted.current) return;
        setConnectionStatus(true); setAppState('language_select');
        try { await startMic(); }
        catch (micError) { setError(micError.message || 'Microphone permission was denied.'); closeConnection(); }
      };
      socket.onmessage = async (event) => {
        if (!mounted.current) return;
        let data;
        try { data = JSON.parse(event.data); } catch { return; }
        switch (data.type) {
          case 'transcript':
            if (data.isFinal === false) setInterimText(data.text);
            else { setInterimText(''); addMessage('user', data.text); }
            break;
          case 'reply': addMessage('assistant', data.text); break;
          case 'language': setSelectedLanguage(data.name); break;
          case 'tts_start': pendingChunks.current = []; break;
          case 'tts_chunk': pendingChunks.current.push(data.data); break;
          case 'tts_end': await playAudio(); break;
          case 'tts_cancelled': pendingChunks.current = []; stopAudio(); break;
          case 'state': setAppState(data.state); break;
          case 'error': setError(data.message); break;
          case 'error_clear': setError(''); break;
          default: break;
        }
      };
      socket.onerror = () => { if (mounted.current) setError('Call connection failed. Check your connection and retry.'); };
      socket.onclose = () => {
        stopMic(); stopAudio();
        if (mounted.current) { setConnectionStatus(false); setAppState('idle'); }
      };
    } catch (connectionError) {
      setError(connectionError.message || 'Could not start call.');
      closeConnection();
    }
  };

  const resetConversation = () => { setMessages([]); setInterimText(''); };
  return {
    appState, messages, interimText, connectionStatus, error, languages, selectedLanguage,
    startConnection, closeConnection, resetConversation, clearError: () => setError('')
  };
}
