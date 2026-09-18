

/* ─────────────────────────────────────────────────────────────────────────────
   USE RECORDED VOICE
───────────────────────────────────────────────────────────────────────────── */
document.getElementById('useVoiceBtn').addEventListener('click', async () => {
  if (!window._recordedFile) return;
  const file = window._recordedFile;
  const btn = document.getElementById('useVoiceBtn');
  
  btn.disabled = true;
  btn.textContent = '⏳ Cloning voice...';
  setCloneStatus('loading', '⏳ Cloning voice…');

  const form = new FormData();
  form.append('file', file);
  form.append('voice_name', voiceNameInput.value.trim() || 'Admin Cloned Voice');

  try {
    const res  = await fetch(API_URL + '/api/clone-voice', { method: 'POST', body: form });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Clone failed');

    setCloneStatus('success', `✓ Voice cloned & activated — "${data.name}"`);
    toast('Voice successfully activated for the User Module!', 'success', 5000);
    btn.textContent = '✨ Voice Active!';
  } catch (err) {
    setCloneStatus('error', `✗ ${err.message}`);
    toast(err.message, 'error', 5000);
    btn.disabled = false;
    btn.textContent = '✨ Use this Voice Directly';
  }
});

/* ─────────────────────────────────────────────────────────────────────────────
   CONFIG
───────────────────────────────────────────────────────────────────────────── */
const WS_URL  = `ws://${location.host}/ws/audio`;
const API_URL = `http://${location.host}`;

// Volume threshold for barge-in detection (0–255)
const VAD_THRESHOLD = 150;
// Check VAD every N ms during speaking
const VAD_INTERVAL_MS = 80;

/* ─────────────────────────────────────────────────────────────────────────────
   STATE
───────────────────────────────────────────────────────────────────────────── */
let clonedVoiceId    = null;
let ws               = null;
let audioCtx         = null;
let workletNode      = null;
let micStream        = null;
let analyser         = null;
let vadTimer         = null;
let currentAudio     = null;   // currently playing Audio element
let pendingChunks    = [];     // MP3 chunks accumulating for current TTS response
let appState         = 'idle'; // idle | listening | thinking | speaking
let interimMsgEl     = null;   // DOM element for current interim transcript

/* ─────────────────────────────────────────────────────────────────────────────
   DOM REFS
───────────────────────────────────────────────────────────────────────────── */
const uploadZone      = document.getElementById('uploadZone');
const audioFileInput  = document.getElementById('audioFile');
const audioPreview    = document.getElementById('audioPreview');
const voiceNameInput  = document.getElementById('voiceNameInput');
const cloneBtn        = document.getElementById('cloneBtn');
const cloneStatus     = document.getElementById('cloneStatus');
const orbSection      = document.getElementById('orbSection');
const orbIcon         = document.getElementById('orbIcon');
const stateLabel      = document.getElementById('stateLabel');
const startBtn        = document.getElementById('startBtn');
const stopBtn         = document.getElementById('stopBtn');
const resetBtn        = document.getElementById('resetBtn');
const clearBtn        = document.getElementById('clearBtn');
const transcriptList  = document.getElementById('transcriptList');
const transcriptEmpty = document.getElementById('transcriptEmpty');
const typingDots      = document.getElementById('typingDots');
const connectionBadge = document.getElementById('connectionBadge');
const connectionLabel = document.getElementById('connectionLabel');
const toastEl         = document.getElementById('toast');

/* ─────────────────────────────────────────────────────────────────────────────
   TOAST
───────────────────────────────────────────────────────────────────────────── */
let _toastTimer = null;
function toast(msg, type = 'info', duration = 3500) {
  toastEl.textContent = msg;
  toastEl.className   = `show ${type}`;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { toastEl.className = ''; }, duration);
}

/* ─────────────────────────────────────────────────────────────────────────────
   STATE MACHINE
───────────────────────────────────────────────────────────────────────────── */
const STATE_CONFIG = {
  idle:      { label: 'Ready',     icon: '🎧', cls: 'state-idle'      },
  listening: { label: 'Listening', icon: '🎤', cls: 'state-listening' },
  thinking:  { label: 'Thinking',  icon: '💭', cls: 'state-thinking'  },
  speaking:  { label: 'Speaking',  icon: '🔊', cls: 'state-speaking'  },
};

function setAppState(newState) {
  appState = newState;
  const cfg = STATE_CONFIG[newState] || STATE_CONFIG.idle;

  orbSection.className = `orb-section ${cfg.cls}`;
  orbIcon.textContent  = cfg.icon;
  stateLabel.textContent = cfg.label;

  // Typing indicator — show only during thinking
  typingDots.classList.toggle('visible', newState === 'thinking');
}

/* ─────────────────────────────────────────────────────────────────────────────
   CONNECTION BADGE
───────────────────────────────────────────────────────────────────────────── */
function setConnection(live) {
  connectionBadge.className = live ? 'status-badge live' : 'status-badge';
  connectionLabel.textContent = live ? 'Live' : 'Disconnected';
}

/* ─────────────────────────────────────────────────────────────────────────────
   AUDIO FILE UPLOAD & PREVIEW
───────────────────────────────────────────────────────────────────────────── */
uploadZone.addEventListener('dragover',  e => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
uploadZone.addEventListener('drop', e => {
  e.preventDefault();
  uploadZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) handleFileSelected(file);
});

audioFileInput.addEventListener('change', () => {
  if (audioFileInput.files[0]) handleFileSelected(audioFileInput.files[0]);
});

/* ─────────────────────────────────────────────────────────────────────────────
   RECORD AUDIO SAMPLE
───────────────────────────────────────────────────────────────────────────── */
const recordSampleBtn = document.getElementById('recordSampleBtn');
let sampleRecorder = null;
let sampleChunks = [];

recordSampleBtn.addEventListener('click', async () => {
  if (sampleRecorder && sampleRecorder.state === 'recording') {
    sampleRecorder.stop();
    return;
  }
  
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    sampleRecorder = new MediaRecorder(stream);
    sampleChunks = [];
    
    sampleRecorder.ondataavailable = e => {
      if (e.data.size > 0) sampleChunks.push(e.data);
    };
    
    sampleRecorder.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      recordSampleBtn.innerHTML = '🔴 Record with Mic';
      recordSampleBtn.style.color = '';
      
      const blob = new Blob(sampleChunks, { type: 'audio/webm' });
      const file = new File([blob], "recorded_sample.webm", { type: 'audio/webm' });
      
      // Don't auto handle, let them preview it
      const url = URL.createObjectURL(blob);
      const audioEl = document.getElementById('audioPreview');
      audioEl.src = url;
      audioEl.classList.add('visible');
      
      // Store the file globally for the "Use" button
      window._recordedFile = file;
      document.getElementById('useVoiceBtn').style.display = 'block';
      
      toast('Recording finished. Listen to preview, then click Use this Voice.', 'info', 5000);
    };
    
    sampleRecorder.start();
    recordSampleBtn.innerHTML = '⏹ Stop Recording';
    recordSampleBtn.style.color = 'var(--red)';
    toast('Recording... speak clearly for 10-30 seconds.', 'info', 4000);
    
  } catch (err) {
    toast('Microphone access denied or failed.', 'error');
  }
});

function handleFileSelected(file) {
  if (!file.type.startsWith('audio/')) {
    toast('Please select an audio file (MP3, WAV, M4A).', 'error');
    return;
  }
  const url = URL.createObjectURL(file);
  audioPreview.src = url;
  audioPreview.classList.add('visible');
  cloneBtn.disabled = false;
  setCloneStatus('', '');
  toast(`File selected: ${file.name}`, 'info');
}

/* ─────────────────────────────────────────────────────────────────────────────
   VOICE CLONING
───────────────────────────────────────────────────────────────────────────── */
function setCloneStatus(type, msg) {
  cloneStatus.className = `clone-status ${type}`;
  cloneStatus.textContent = msg;
}

cloneBtn.addEventListener('click', async () => {
  const file = audioFileInput.files[0];
  if (!file) { toast('Please select an audio file first.', 'error'); return; }

  cloneBtn.disabled = true;
  setCloneStatus('loading', '⏳ Cloning voice…');

  const form = new FormData();
  form.append('file', file);
  form.append('voice_name', voiceNameInput.value.trim() || 'Receptionist Voice');

  try {
    const res  = await fetch(`${API_URL}/api/clone-voice`, { method: 'POST', body: form });
    const data = await res.json();

    if (!res.ok) throw new Error(data.detail || 'Clone failed');

    clonedVoiceId = data.voiceId;
    setCloneStatus('success', `✓ Voice cloned — "${data.name}"`);
    
    toast('Voice successfully activated for the User Module!', 'success');

  } catch (err) {
    setCloneStatus('error', `✗ ${err.message}`);
    toast(err.message, 'error', 5000);
    cloneBtn.disabled = false;
  }
});

/* ─────────────────────────────────────────────────────────────────────────────
   MIC + AUDIO CAPTURE (AudioWorklet → PCM → WebSocket)
───────────────────────────────────────────────────────────────────────────── */
async function startMic() {
  micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });

  // Create AudioContext at 16 kHz (Deepgram linear16 input)
  audioCtx = new AudioContext({ sampleRate: 16000 });

  // Add AudioWorklet module (served by FastAPI)
  await audioCtx.audioWorklet.addModule('/processor.js');

  const source = audioCtx.createMediaStreamSource(micStream);
  workletNode  = new AudioWorkletNode(audioCtx, 'pcm-processor');

  // For VAD: connect to analyser as well
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 512;
  source.connect(analyser);
  source.connect(workletNode);

  // Forward PCM chunks to WebSocket
  workletNode.port.onmessage = ({ data: pcmBuffer }) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(pcmBuffer);
    }
  };
}

function stopMic() {
  clearVAD();
  workletNode?.port?.close();
  workletNode?.disconnect();
  analyser?.disconnect();
  micStream?.getTracks().forEach(t => t.stop());
  audioCtx?.close();
  workletNode = analyser = micStream = audioCtx = null;
}

/* ─────────────────────────────────────────────────────────────────────────────
   VOICE ACTIVITY DETECTION (barge-in during AI speech)
───────────────────────────────────────────────────────────────────────────── */
function startVAD() {
  clearVAD();
  const buf = new Uint8Array(analyser.frequencyBinCount);

  vadTimer = setInterval(() => {
    if (appState !== 'speaking' || !analyser) return;

    analyser.getByteFrequencyData(buf);
    // Average energy across mic buffer
    const avg = buf.reduce((s, v) => s + v, 0) / buf.length;

    if (avg > VAD_THRESHOLD) {
      console.log(`[VAD] Barge-in detected (avg=${avg.toFixed(1)})`);
      triggerBargeIn();
    }
  }, VAD_INTERVAL_MS);
}

function clearVAD() {
  clearInterval(vadTimer);
  vadTimer = null;
}

function triggerBargeIn() {
  cancelCurrentAudio();
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'barge_in' }));
  }
  setAppState('listening');
}

/* ─────────────────────────────────────────────────────────────────────────────
   TTS AUDIO PLAYBACK
───────────────────────────────────────────────────────────────────────────── */
function onTTSChunk(base64Data) {
  // Decode base64 → ArrayBuffer and accumulate
  const bin = atob(base64Data);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  pendingChunks.push(buf.buffer);
}

function onTTSEnd() {
  if (pendingChunks.length === 0) {
    setAppState('listening');
    return;
  }

  // Concatenate all MP3 chunks into a single Blob and play
  const blob = new Blob(pendingChunks, { type: 'audio/mpeg' });
  const url  = URL.createObjectURL(blob);
  pendingChunks = [];

  const audio = new Audio(url);
  currentAudio = audio;

  audio.onended = () => {
    URL.revokeObjectURL(url);
    currentAudio = null;
    if (appState === 'speaking') {
      setAppState('listening');
    }
  };

  audio.onerror = () => {
    URL.revokeObjectURL(url);
    currentAudio = null;
    setAppState('listening');
  };

  audio.play().catch(err => {
    console.error('[audio] Play failed:', err);
    setAppState('listening');
  });
}

function cancelCurrentAudio() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
  }
  pendingChunks = [];
}

/* ─────────────────────────────────────────────────────────────────────────────
   WEBSOCKET
───────────────────────────────────────────────────────────────────────────── */
function openWebSocket() {
  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    setConnection(true);
    toast('Connected to AI receptionist.', 'success');

    // Send voice config
    if (clonedVoiceId) {
      ws.send(JSON.stringify({ type: 'config', voiceId: clonedVoiceId }));
    }

    setAppState('listening');
    startBtn.disabled = true;
    stopBtn.disabled  = false;
    startVAD();
  };

  ws.onmessage = ({ data }) => {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }

    switch (msg.type) {

      case 'state':
        setAppState(msg.state);
        break;

      case 'transcript':
        handleTranscript(msg.text, msg.isFinal);
        break;

      case 'reply':
        addMessage('assistant', msg.text, false);
        break;

      case 'tts_start':
        pendingChunks = [];
        break;

      case 'tts_chunk':
        onTTSChunk(msg.data);
        break;

      case 'tts_end':
        onTTSEnd();
        break;

      case 'tts_cancelled':
        cancelCurrentAudio();
        pendingChunks = [];
        break;

      case 'error':
        toast(msg.message, 'error');
        setAppState('listening');
        break;
    }
  };

  ws.onerror = (e) => {
    console.error('[ws] Error', e);
    toast('WebSocket error. Check that the server is running.', 'error');
  };

  ws.onclose = () => {
    setConnection(false);
    setAppState('idle');
    
    stopBtn.disabled  = true;
    clearVAD();
  };
}

function closeWebSocket() {
  if (ws) {
    ws.send(JSON.stringify({ type: 'stop' }));
    ws.close();
    ws = null;
  }
  setAppState('idle');
  cancelCurrentAudio();
  clearVAD();
  setConnection(false);
  
  stopBtn.disabled  = true;
}

/* ─────────────────────────────────────────────────────────────────────────────
   TRANSCRIPT UI
───────────────────────────────────────────────────────────────────────────── */
function handleTranscript(text, isFinal) {
  if (!text.trim()) return;

  hideEmpty();

  if (!isFinal) {
    // Update or create interim bubble
    if (!interimMsgEl) {
      interimMsgEl = createMsgEl('user', text, true);
      transcriptList.appendChild(interimMsgEl);
    } else {
      interimMsgEl.querySelector('.msg-bubble').textContent = text;
    }
  } else {
    // Replace interim with final
    if (interimMsgEl) {
      interimMsgEl.querySelector('.msg-bubble').classList.remove('interim');
      interimMsgEl.querySelector('.msg-bubble').textContent = text;
      interimMsgEl = null;
    } else {
      addMessage('user', text, false);
    }
  }
  scrollToBottom();
}

function addMessage(role, text, isInterim = false) {
  hideEmpty();
  const el = createMsgEl(role, text, isInterim);
  transcriptList.appendChild(el);
  scrollToBottom();
  return el;
}

function createMsgEl(role, text, isInterim) {
  const wrap = document.createElement('div');
  wrap.className = `msg ${role}`;

  const roleEl = document.createElement('div');
  roleEl.className = 'msg-role';
  roleEl.textContent = role === 'user' ? '🎤 You' : '🤖 Receptionist';

  const bubble = document.createElement('div');
  bubble.className = `msg-bubble${isInterim ? ' interim' : ''}`;
  bubble.textContent = text;

  wrap.append(roleEl, bubble);
  return wrap;
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    transcriptList.scrollTop = transcriptList.scrollHeight;
  });
}

function hideEmpty() {
  transcriptEmpty.style.display = 'none';
}

function clearTranscript() {
  transcriptList.innerHTML = '';
  transcriptList.appendChild(transcriptEmpty);
  transcriptEmpty.style.display = '';
  interimMsgEl = null;
}

/* ─────────────────────────────────────────────────────────────────────────────
   CONTROLS
───────────────────────────────────────────────────────────────────────────── */
startBtn.addEventListener('click', async () => {
  if (!clonedVoiceId) {
    toast('Please clone a voice first.', 'error');
    return;
  }
  try {
    await startMic();
    openWebSocket();
  } catch (err) {
    toast(`Microphone error: ${err.message}`, 'error');
  }
});

stopBtn.addEventListener('click', () => {
  closeWebSocket();
  stopMic();
});

resetBtn.addEventListener('click', () => {
  closeWebSocket();
  stopMic();
  clearTranscript();
  setAppState('idle');
  toast('Conversation reset.', 'info');
});

clearBtn.addEventListener('click', clearTranscript);


/* ─────────────────────────────────────────────────────────────────────────────
   MANAGE VOICES LOGIC
───────────────────────────────────────────────────────────────────────────── */
const loadVoicesBtn = document.getElementById('loadVoicesBtn');
const voiceList = document.getElementById('voiceList');

async function fetchVoices() {
  if (!voiceList) return;
  voiceList.innerHTML = '<p style="font-size:0.75rem; color:var(--text-muted);">Loading voices...</p>';
  try {
    const res = await fetch('/api/voices');
    const voices = await res.json();
    voiceList.innerHTML = '';
    if (voices.length === 0) {
      voiceList.innerHTML = '<p style="font-size:0.75rem; color:var(--text-muted);">No cloned voices found.</p>';
      return;
    }
    voices.forEach(v => {
      const div = document.createElement('div');
      div.style = 'display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.03); padding: 8px 12px; border-radius: 6px; border: 1px solid var(--border);';
      div.innerHTML = `
        <div style="font-size:0.8rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
          <strong>${v.name}</strong>
          <div style="font-size:0.65rem; color:var(--text-muted);">${new Date(v.createdAt).toLocaleDateString()}</div>
        </div>
        <button class="btn btn-danger" style="padding: 4px 8px; font-size: 0.7rem;" onclick="deleteVoice(${v.id}, '${v.name}')">Delete</button>
      `;
      voiceList.appendChild(div);
    });
  } catch (e) {
    voiceList.innerHTML = '<p style="font-size:0.75rem; color:var(--red);">Failed to load voices.</p>';
  }
}

window.deleteVoice = async function(id, name) {
  if (!confirm(`Delete voice '${name}'?`)) return;
  toast(`Deleting '${name}'...`, 'info');
  try {
    const res = await fetch(`/api/voices/${id}`, { method: 'DELETE' });
    if (res.ok) {
      toast(`Voice '${name}' deleted!`, 'success');
      fetchVoices();
    } else {
      toast(`Failed to delete '${name}'`, 'error');
    }
  } catch (e) {
    toast(`Error: ${e}`, 'error');
  }
};

if (loadVoicesBtn) {
  loadVoicesBtn.addEventListener('click', fetchVoices);
  fetchVoices();
}

/* ─────────────────────────────────────────────────────────────────────────────
   MVP DEMO TOOLS LOGIC
───────────────────────────────────────────────────────────────────────────── */
const mockReminderBtn = document.getElementById('mockReminderBtn');
if (mockReminderBtn) {
  mockReminderBtn.addEventListener('click', () => {
    alert('Button was clicked!');
    toast('Scanning database for upcoming appointments...', 'info');
    setTimeout(() => {
      toast('Found 1 appointment: John Doe (Tomorrow 10:00 AM)', 'info');
      setTimeout(() => {
        toast('Initiating outbound Twilio call to +91 98765 43210...', 'success', 5000);
      }, 2000);
    }, 1500);
  });
}
