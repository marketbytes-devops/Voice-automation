import { useState, useRef, useEffect, useCallback } from 'react';

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
const WS_BASE_URL = import.meta.env.VITE_WS_URL || "ws://localhost:8000";
const VAD_THRESHOLD = 150;
const VAD_INTERVAL_MS = 80;

export function useVoiceAgent(language = 'en-US') {
  const [appState, setAppState] = useState('idle'); // idle | listening | thinking | speaking
  const [messages, setMessages] = useState([]);
  const [interimText, setInterimText] = useState('');
  
  // Track state in a ref so closures (like audio worklet) have the latest value
  const appStateRef = useRef(appState);
  useEffect(() => {
    appStateRef.current = appState;
  }, [appState]);

  const [connectionStatus, setConnectionStatus] = useState(false);
  const [error, setError] = useState(null);

  const ws = useRef(null);
  const audioCtx = useRef(null);
  const micStream = useRef(null);
  const workletNode = useRef(null);
  const analyser = useRef(null);
  const vadTimer = useRef(null);
  const isComponentMounted = useRef(true);

  // Buffer state
  const pendingChunks = useRef([]);
  const currentAudio = useRef(null);

  useEffect(() => {
    isComponentMounted.current = true;
    return () => {
      isComponentMounted.current = false;
      closeConnection();
    };
  }, []);

  const addMessage = useCallback((role, text) => {
    setMessages(prev => [...prev, { id: Date.now().toString(), role, text }]);
  }, []);

  const startConnection = async () => {
    if (connectionStatus) return;
    setError(null);
    setAppState('idle');
    try {
      // Create WS connection
      const WS_URL = `${WS_BASE_URL}/ws/audio?lang=${language}`;
      ws.current = new WebSocket(WS_URL);

      ws.current.onopen = async () => {
        setConnectionStatus(true);
        setAppState('listening');
        try {
          const res = await fetch(`${API_URL}/api/active-voice`);
          const data = await res.json();
          if (data && data.voice_id) {
            ws.current.send(JSON.stringify({ type: 'config', voiceId: data.voice_id }));
          } else {
            setError('Please clone and select a voice from the Admin Panel first.');
            closeConnection();
          }
        } catch (e) {
          console.error('Failed to get active voice', e);
          setError('Failed to connect to backend voice service.');
          closeConnection();
        }
        await startMic();
      };

      ws.current.onmessage = async (e) => {
        if (!isComponentMounted.current) return;
        const data = JSON.parse(e.data);

        switch (data.type) {
          case 'interim':
            setInterimText(data.text);
            break;
          case 'transcript':
            if (data.isFinal === false) {
              setInterimText(data.text);
            } else {
              setInterimText('');
              if (data.role === 'user') {
                setAppState('thinking');
              }
              addMessage(data.role, data.text);
            }
            break;
          case 'reply':
            addMessage('assistant', data.text);
            break;
          case 'tts_start':
            pendingChunks.current = [];
            break;
          case 'tts_chunk':
            pendingChunks.current.push(data.data);
            break;
          case 'tts_end':
            playConcatenatedAudio();
            break;
          case 'tts_cancelled':
            pendingChunks.current = [];
            stopAudio();
            break;
          case 'whatsapp':
            // Add a mock whatsapp message to UI if needed
            addMessage('assistant', '📱 (WhatsApp Sent) ' + data.message);
            break;
          case 'state':
            setAppState(data.state);
            break;
          case 'error':
            setError(data.message);
            break;
        }
      };

      ws.current.onclose = () => {
        setConnectionStatus(false);
        setAppState('idle');
        stopMic();
      };
      
    } catch (err) {
      setError(err.message);
    }
  };

  const closeConnection = () => {
    if (ws.current) {
      ws.current.close();
      ws.current = null;
    }
    stopMic();
    stopAudio();
    setAppState('idle');
    setConnectionStatus(false);
  };

  const startMic = async () => {
    try {
      micStream.current = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });

      audioCtx.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
      await audioCtx.current.audioWorklet.addModule('/processor.js');

      const source = audioCtx.current.createMediaStreamSource(micStream.current);
      workletNode.current = new AudioWorkletNode(audioCtx.current, 'pcm-processor');

      workletNode.current.port.onmessage = (e) => {
        if (ws.current && ws.current.readyState === WebSocket.OPEN && appStateRef.current !== 'speaking') {
          ws.current.send(e.data); // e.data is Int16Array
        }
      };

      source.connect(workletNode.current);
      workletNode.current.connect(audioCtx.current.destination);

      // VAD Analyzer
      analyser.current = audioCtx.current.createAnalyser();
      analyser.current.fftSize = 256;
      source.connect(analyser.current);

    } catch (err) {
      setError('Failed to access microphone.');
    }
  };

  const stopMic = () => {
    if (micStream.current) {
      micStream.current.getTracks().forEach(t => t.stop());
      micStream.current = null;
    }
    if (workletNode.current) {
      workletNode.current.disconnect();
      workletNode.current = null;
    }
    if (audioCtx.current && audioCtx.current.state !== 'closed') {
      audioCtx.current.close();
      audioCtx.current = null;
    }
    clearInterval(vadTimer.current);
  };

  const playConcatenatedAudio = async () => {
    if (pendingChunks.current.length === 0) {
      setAppState('listening');
      return;
    }

    setAppState('speaking');
    
    // Calculate total byte length
    const buffers = pendingChunks.current.map(b64 => {
      const binary = atob(b64);
      const arr = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        arr[i] = binary.charCodeAt(i);
      }
      return arr;
    });

    const totalLength = buffers.reduce((acc, curr) => acc + curr.length, 0);
    const finalBuffer = new Uint8Array(totalLength);
    let offset = 0;
    for (const buf of buffers) {
      finalBuffer.set(buf, offset);
      offset += buf.length;
    }

    pendingChunks.current = [];

    const blob = new Blob([finalBuffer], { type: 'audio/mpeg' });
    const url = URL.createObjectURL(blob);
    
    if (currentAudio.current) {
      currentAudio.current.pause();
      currentAudio.current.currentTime = 0;
    }
    
    currentAudio.current = new Audio(url);
    
    currentAudio.current.onended = () => {
      URL.revokeObjectURL(url);
      if (isComponentMounted.current && appState === 'speaking') {
        setAppState('listening');
      }
    };

    currentAudio.current.onerror = () => {
      URL.revokeObjectURL(url);
      setAppState('listening');
    };

    try {
      await currentAudio.current.play();
      startVAD();
    } catch (e) {
      console.error('Audio playback failed:', e);
      setAppState('listening');
    }
  };

  const stopAudio = () => {
    if (currentAudio.current) {
      currentAudio.current.pause();
      currentAudio.current = null;
    }
  };

  const startVAD = () => {
    clearInterval(vadTimer.current);
    const dataArray = new Uint8Array(analyser.current.frequencyBinCount);
    vadTimer.current = setInterval(() => {
      if (appStateRef.current !== 'speaking') return;
      analyser.current.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
      const avg = sum / dataArray.length;
      if (avg > VAD_THRESHOLD) {
        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
          ws.current.send(JSON.stringify({ type: 'barge_in' }));
        }
      }
    }, VAD_INTERVAL_MS);
  };

  const resetConversation = () => {
    setMessages([]);
    setInterimText('');
  };

  return {
    appState,
    messages,
    interimText,
    connectionStatus,
    error,
    startConnection,
    closeConnection,
    resetConversation
  };
}
