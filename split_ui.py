import re

def process_html():
    with open("frontend/user.html", "r", encoding="utf-8") as f:
        content = f.read()

    # ====== USER.HTML ======
    user = content

    # Remove the Voice Upload Panel completely
    user = re.sub(
        r'<!-- Voice Upload Panel -->.*?<!-- Orb \+ Controls Panel -->',
        '<!-- Orb + Controls Panel -->',
        user,
        flags=re.DOTALL
    )
    
    # Change grid layout to center everything
    user = user.replace('grid-template-columns: 340px 1fr;', 'grid-template-columns: 1fr 1fr;')

    # Remove all JS related to cloning
    user = re.sub(
        r'/\* ───+ AUDIO FILE UPLOAD.*?(/\* ───+ MIC \+ AUDIO CAPTURE)',
        r'\1',
        user,
        flags=re.DOTALL
    )

    init_logic = """
// Check for active voice on load
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const res = await fetch(API_URL + '/api/active-voice');
    const data = await res.json();
    if (data.voice_id) {
      clonedVoiceId = data.voice_id;
      startBtn.disabled = false;
      toast('Ready: Connected to Receptionist Voice', 'success');
    } else {
      toast('No active voice configured.', 'error', 99999);
      setTimeout(() => alert('System Offline: Please ask the administrator to clone a voice in the Admin portal.'), 500);
      startBtn.disabled = true;
    }
  } catch(e) {
    console.error(e);
  }
});
"""
    user = user.replace("const toastEl         = document.getElementById('toast');", "const toastEl         = document.getElementById('toast');\n" + init_logic)

    # Make StartBtn disabled by default in HTML
    user = user.replace('<button id="startBtn" class="primary-btn" disabled>', '<button id="startBtn" class="primary-btn" disabled>')

    with open("frontend/user.html", "w", encoding="utf-8") as f:
        f.write(user)

    # ====== ADMIN.HTML ======
    with open("frontend/admin.html", "r", encoding="utf-8") as f:
        admin = f.read()
    
    admin = admin.replace('SmileCare AI Receptionist</title>', 'SmileCare AI Admin</title>')
    admin = admin.replace('SmileCare AI Receptionist</h1>', 'SmileCare AI Admin</h1>')

    # Remove Orb and right column completely
    admin = re.sub(
        r'<!-- Orb \+ Controls Panel -->.*?</main>',
        '</div><!-- /left-col --></main>',
        admin,
        flags=re.DOTALL
    )

    # Change grid layout to just the sidebar
    admin = admin.replace('grid-template-columns: 340px 1fr;', 'grid-template-columns: 1fr;')
    admin = admin.replace('max-width: 960px;', 'max-width: 500px;')

    # Add "Use this voice" button to HTML
    use_voice_btn = """
      <div id="audioPreview" class="audio-preview"></div>
      <button id="useVoiceBtn" class="primary-btn" style="display:none; margin-top: 10px; background: var(--green);">✨ Use this Voice Directly</button>
"""
    admin = admin.replace('<audio id="audioPreview" class="audio-preview" controls></audio>', '<audio id="audioPreview" class="audio-preview" controls></audio>' + use_voice_btn)

    # Modify JS in Admin: Remove WebSocket / Orb stuff
    admin = re.sub(
        r'/\* ───+ MIC \+ AUDIO CAPTURE.*?</body>',
        '</body>',
        admin,
        flags=re.DOTALL
    )

    # Modify the record onstop logic
    new_record_logic = """
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
"""
    admin = re.sub(
        r'sampleRecorder\.onstop = \(\) => \{.*?\};',
        new_record_logic.strip(),
        admin,
        flags=re.DOTALL
    )

    use_btn_logic = """
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
"""
    admin = admin.replace('/* ───', use_btn_logic + '\n/* ───', 1) # Insert near the top

    with open("frontend/admin.html", "w", encoding="utf-8") as f:
        f.write(admin)

if __name__ == "__main__":
    process_html()
