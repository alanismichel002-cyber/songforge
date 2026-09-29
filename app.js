/* SongForge Studio — a single-page client for the Suno API (docs.sunoapi.org). */
(() => {
  'use strict';

  // ---------------------------------------------------------------- config
  const API = 'https://api.sunoapi.org/api/v1';
  const UPLOAD_API = 'https://sunoapiorg.redpandaai.co/api/file-stream-upload';
  // The API requires a callBackUrl; we poll for results, so the callback just needs to accept POSTs.
  const CALLBACK = location.protocol === 'https:' && !/^(localhost|127\.)/.test(location.hostname)
    ? `${location.origin}/.netlify/functions/suno-callback`
    : 'https://example.com/callback';
  const POLL_MS = 5000;
  const TASK_TIMEOUT_MS = 25 * 60 * 1000;

  const MODELS = [
    { id: 'V6', name: 'V6', blurb: 'Most natural vocals, richest detail', tag: 'Recommended' },
    { id: 'V6_WILD', name: 'V6 Wild', blurb: 'Bolder, more experimental' },
    { id: 'V6_MINI', name: 'V6 Mini', blurb: 'Lightweight and fast' },
  ];
  const LEGACY_MODELS = ['V5_5', 'V5', 'V4_5PLUS', 'V4_5ALL', 'V4_5', 'V4'];

  const GENRES = ['pop', 'hip-hop', 'lo-fi', 'EDM', 'rock', 'R&B', 'country', 'jazz', 'synthwave', 'cinematic', 'afrobeats', 'reggaeton', 'K-pop', 'acoustic', 'metal', 'gospel', 'drum & bass', 'bossa nova'];
  const MOODS = ['uplifting', 'melancholic', 'dreamy', 'energetic', 'dark', 'romantic', 'chill', 'epic'];
  const IDEAS = [
    'A sunny road-trip anthem about leaving your hometown with your best friends',
    'A cozy lo-fi song about rainy Sunday mornings and fresh coffee',
    'An epic orchestral battle theme for a dragon who is secretly afraid of the dark',
    'A 90s-style R&B slow jam about texting your crush at 2am',
    'A country ballad sung by a robot who learned to love the farm',
    'A synthwave track about driving through a neon city in the year 2089',
    'A funny pop-punk song about a cat that refuses to get off the keyboard',
    'An afrobeats summer party track about dancing on the rooftop until sunrise',
    'A heartfelt acoustic lullaby for a newborn baby sister',
    'A gospel-inspired anthem about getting back up after a hard year',
    'A jazzy bossa nova tune about a tiny café in Lisbon',
    'A hype hip-hop track for the first day of a marathon training plan',
  ];
  const LYRIC_IDEAS = ['First love at a summer festival', 'Missing someone who moved across the world', 'Winning against all odds', 'A haunted lighthouse', 'Late-night drives and big dreams'];
  const SOUND_IDEAS = ['Gentle rain on a tin roof', 'Arcade coin-in jingle', '8-bit victory fanfare', 'Crackling campfire with crickets', 'Deep house drum loop', 'Spaceship engine hum'];
  const KEYS = ['Any', 'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B', 'Cm', 'C#m', 'Dm', 'D#m', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'A#m', 'Bm'];
  const STEM_NAMES = ['Lead Vocal', 'Backing Vocals', 'Drum Kit', 'Bass', 'Guitar', 'Piano', 'Keyboard', 'Synth', 'Strings', 'Brass', 'Woodwinds', 'Percussion'];
  const ERR = {
    400: 'Some parameters were invalid.', 401: 'That API key was rejected. Double-check it and try again.',
    404: 'Endpoint not found.', 405: 'Rate limit hit — give it a moment.', 409: 'That already exists for this track.',
    413: 'Prompt or style text is too long.', 429: 'Out of credits. Top up at sunoapi.org to keep creating.',
    430: 'Too many requests too fast. Try again in a few seconds.', 455: 'Suno API is in maintenance. Try again shortly.',
    500: 'Suno API had a server error. Try again.',
  };

  // ---------------------------------------------------------------- helpers
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtTime = (s) => { s = Math.max(0, Math.floor(+s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : '');
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
    del(k) { try { localStorage.removeItem(k); sessionStorage.removeItem(k); } catch {} },
  };

  function toast(msg, kind = '') {
    const t = document.createElement('div');
    t.className = `toast ${kind}`;
    t.textContent = msg;
    $('#toasts').appendChild(t);
    setTimeout(() => t.remove(), kind === 'bad' ? 7000 : 4500);
  }

  function confetti() {
    const colors = ['#6d4aff', '#ff4f86', '#ffa53d', '#17a673', '#3db8ff'];
    for (let i = 0; i < 70; i++) {
      const c = document.createElement('i');
      c.className = 'confetti';
      c.style.left = Math.random() * 100 + 'vw';
      c.style.background = pick(colors);
      c.style.animationDuration = 1.8 + Math.random() * 1.8 + 's';
      c.style.animationDelay = Math.random() * 0.4 + 's';
      document.body.appendChild(c);
      setTimeout(() => c.remove(), 4200);
    }
  }

  // ---------------------------------------------------------------- state
  const state = {
    key: '',
    tasks: store.get('sf.tasks', []),
    tracks: store.get('sf.tracks', []),
    personas: store.get('sf.personas', []),
    models: store.get('sf.models', { create: 'V6', remix: 'V6', sound: 'V6' }),
    mode: 'simple',
    remix: 'cover',
    playing: null,
  };
  const save = () => {
    store.set('sf.tasks', state.tasks.slice(0, 60));
    store.set('sf.tracks', state.tracks);
    store.set('sf.personas', state.personas);
    store.set('sf.models', state.models);
  };

  // ---------------------------------------------------------------- API
  class ApiError extends Error { constructor(code, msg, data) { super(msg); this.code = code; this.data = data; } }

  async function api(path, { method = 'GET', body, query, key = state.key, raw = false } = {}) {
    const url = new URL(API + path);
    if (query) Object.entries(query).forEach(([k, v]) => url.searchParams.set(k, v));
    let res;
    try {
      res = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${key}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new ApiError(0, 'Network error — check your connection.');
    }
    let json;
    try { json = await res.json(); } catch { throw new ApiError(res.status, `Unexpected response (${res.status}).`); }
    if (raw) return json;
    if (json.code !== 200) {
      if (json.code === 401 && key === state.key && state.key) setTimeout(keyRejected, 0);
      throw new ApiError(json.code, json.msg ? `${ERR[json.code] || ''} ${json.msg}`.trim() : (ERR[json.code] || 'Request failed.'), json.data);
    }
    return json.data;
  }

  async function uploadFile(file) {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('uploadPath', 'songforge/uploads');
    fd.append('fileName', `${Date.now()}-${file.name.replace(/[^\w.\-]+/g, '_')}`);
    const res = await fetch(UPLOAD_API, { method: 'POST', headers: { Authorization: `Bearer ${state.key}` }, body: fd });
    const json = await res.json().catch(() => ({}));
    if (!json.data?.downloadUrl) throw new ApiError(json.code || res.status, json.msg || 'Upload failed.');
    return json.data.downloadUrl;
  }

  async function refreshCredits() {
    try {
      const c = await api('/generate/credit');
      $('#credits-val').textContent = typeof c === 'number' ? c.toLocaleString() : c;
    } catch (e) {
      $('#credits-val').textContent = '—';
    }
  }

  // ---------------------------------------------------------------- theme
  function setTheme(t) {
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem('sf.theme', t); } catch {}
    $$('[data-theme-set]').forEach((b) => b.classList.toggle('on', b.dataset.themeSet === t));
  }

  // ---------------------------------------------------------------- key gate
  function loadKey() {
    try { return localStorage.getItem('sf.key') || sessionStorage.getItem('sf.key') || ''; } catch { return ''; }
  }
  function keyRejected() {
    if (!state.key) return;
    store.del('sf.key');
    state.key = '';
    stopPolling();
    showGate();
    $('#gate-error').textContent = 'Your saved API key no longer works. Paste a valid key to continue — your library is still here.';
    $('#gate-error').hidden = false;
  }
  function showGate() { $('#app').hidden = true; $('#gate').hidden = false; $('#gate-key').focus(); }
  function showApp() { $('#gate').hidden = true; $('#app').hidden = false; refreshCredits(); renderAll(); startPolling(); }

  function initGate() {
    $('#gate-toggle').onclick = () => {
      const i = $('#gate-key');
      i.type = i.type === 'password' ? 'text' : 'password';
    };
    $('#gate-form').onsubmit = async (e) => {
      e.preventDefault();
      const key = $('#gate-key').value.trim();
      const btn = $('#gate-submit');
      const err = $('#gate-error');
      err.hidden = true;
      btn.disabled = true;
      btn.textContent = 'Checking key…';
      try {
        const credits = await api('/generate/credit', { key });
        state.key = key;
        try {
          if ($('#gate-remember').checked) localStorage.setItem('sf.key', key);
          else sessionStorage.setItem('sf.key', key);
        } catch {}
        $('#gate-key').value = '';
        showApp();
        toast(`Welcome in! You have ${credits} credits. Let's make something. 🎶`, 'ok');
      } catch (ex) {
        err.textContent = ex.code === 401 ? ERR[401] : ex.message;
        err.hidden = false;
      } finally {
        btn.disabled = false;
        btn.textContent = 'Unlock the studio';
      }
    };
    $('#signout').onclick = () => {
      if (!confirm('Forget your API key on this device? Your library stays saved.')) return;
      store.del('sf.key');
      state.key = '';
      stopPolling();
      showGate();
    };
  }

  // ---------------------------------------------------------------- navigation
  function go(view) {
    $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === view));
    $$('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${view}`));
    if (view === 'library') renderLibrary();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ---------------------------------------------------------------- reusable UI pieces
  function chips(el, list, onClick) {
    el.innerHTML = list.map((g) => `<button type="button" class="chip">${esc(g)}</button>`).join('');
    $$('.chip', el).forEach((c, i) => (c.onclick = () => onClick(list[i], c)));
  }
  function toggleTag(input, tag) {
    const parts = input.value.split(',').map((s) => s.trim()).filter(Boolean);
    const i = parts.findIndex((p) => p.toLowerCase() === tag.toLowerCase());
    if (i >= 0) parts.splice(i, 1); else parts.push(tag);
    input.value = parts.join(', ');
    input.dispatchEvent(new Event('input'));
  }
  function charCounter(root = document) {
    $$('.cc[data-for]', root).forEach((cc) => {
      const input = document.getElementById(cc.dataset.for) || $(`[data-k="${cc.dataset.for}"]`, root);
      if (!input) return;
      const max = +input.maxLength > 0 ? +input.maxLength : +cc.dataset.max;
      const upd = () => { cc.textContent = `${input.value.length}/${max}`; cc.classList.toggle('over', input.value.length > max); };
      input.addEventListener('input', upd);
      upd();
    });
  }

  function modelPicker(el, slot, { allowLegacy = true } = {}) {
    const cur = state.models[slot] || 'V6';
    el.innerHTML = MODELS.map((m) => `
      <button type="button" class="model-card ${cur === m.id ? 'on' : ''}" data-model="${m.id}">
        <b>${m.name}${m.tag ? ` <small class="badge soft">${m.tag}</small>` : ''}</b><span>${m.blurb}</span>
      </button>`).join('') + (allowLegacy ? `
      <div class="legacy-row">Legacy models:
        <select aria-label="Legacy model"><option value="">—</option>${LEGACY_MODELS.map((m) => `<option ${cur === m ? 'selected' : ''}>${m}</option>`).join('')}</select>
        <span>deprecated, kept for compatibility</span>
      </div>` : '');
    $$('.model-card', el).forEach((b) => (b.onclick = () => {
      state.models[slot] = b.dataset.model; save(); modelPicker(el, slot, { allowLegacy });
    }));
    const sel = $('select', el);
    if (sel) sel.onchange = () => { if (sel.value) { state.models[slot] = sel.value; save(); modelPicker(el, slot, { allowLegacy }); } };
  }

  // Uploader: file drop → Suno file upload, or paste a URL, or pick a library track.
  function uploader(el, { accept = 'audio/*', library = true, label = 'Drop an audio file or click to upload' } = {}) {
    el.dataset.url = '';
    const tracks = state.tracks.filter((t) => t.audio);
    el.innerHTML = `
      <div class="drop" tabindex="0">${esc(label)}<br><small>MP3 / WAV / M4A · files are kept for 3 days</small></div>
      <input type="file" accept="${accept}" hidden />
      <div class="or">or paste a public URL</div>
      <input type="url" placeholder="https://…/song.mp3" />
      ${library && tracks.length ? `<div class="pick-track"><select><option value="">…or use a track from your library</option>${tracks.map((t) => `<option value="${esc(t.audio)}">${esc(t.title || 'Untitled')} · ${fmtTime(t.duration)}</option>`).join('')}</select></div>` : ''}`;
    const drop = $('.drop', el), file = $('input[type=file]', el), url = $('input[type=url]', el), sel = $('select', el);
    const set = (u, text) => { el.dataset.url = u; drop.classList.toggle('done', !!u); if (text) drop.innerHTML = text; };
    const handle = async (f) => {
      if (!f) return;
      drop.innerHTML = `<span class="spinner" style="display:inline-block;vertical-align:middle"></span> Uploading ${esc(f.name)}…`;
      try {
        const u = await uploadFile(f);
        url.value = u;
        set(u, `✅ ${esc(f.name)} uploaded`);
      } catch (e) {
        set('', `⚠️ ${esc(e.message)} — click to retry`);
      }
    };
    drop.onclick = () => file.click();
    drop.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); file.click(); } };
    file.onchange = () => handle(file.files[0]);
    drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('drag'); };
    drop.ondragleave = () => drop.classList.remove('drag');
    drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('drag'); handle(e.dataTransfer.files[0]); };
    url.oninput = () => set(url.value.trim(), url.value.trim() ? '🔗 Using the URL below' : esc(label));
    if (sel) sel.onchange = () => { url.value = sel.value; set(sel.value, sel.value ? '🎵 Using a library track' : esc(label)); };
  }

  // ---- declarative form fields
  const FIELD = {
    title: (o) => `<label class="field" data-f="title"><span class="label">Title ${o.required ? '' : '<small>(optional)</small>'} <span class="cc" data-for="title">0</span></span><input type="text" data-k="title" maxlength="${o.max || 80}" placeholder="Name your track" /></label>`,
    style: (o) => `<div class="field" data-f="style"><span class="label">${o.label || 'Style'} ${o.required ? '' : '<small>(genres, instruments, mood, tempo)</small>'} <span class="cc" data-for="${o.k || 'style'}">0</span></span>
      <textarea data-k="${o.k || 'style'}" rows="2" maxlength="1000" placeholder="e.g. dreamy indie pop, shimmering guitars, female vocals, 110 bpm"></textarea>
      <div class="row tight"><div class="chips" data-genres></div></div>
      <div class="row tight"><div class="chips" data-moods></div><button type="button" class="btn btn-sm btn-ghost" data-boost title="Expand your style into a richer description">🚀 Boost style</button></div></div>`,
    lyrics: (o) => `<div class="field" data-f="lyrics" data-vocal><span class="label">${o.label || 'Lyrics'} ${o.required ? '' : '<small>(leave empty for auto-lyrics)</small>'} <span class="cc" data-for="${o.k || 'lyrics'}">0</span></span>
      <textarea data-k="${o.k || 'lyrics'}" rows="${o.rows || 7}" maxlength="5000" placeholder="[Verse]\nCity lights are calling out my name\n\n[Chorus]\n…"></textarea>
      ${o.noHelper ? '' : '<div class="row tight"><button type="button" class="btn btn-sm btn-ghost" data-write-lyrics>✍️ Write with AI</button><div class="chips" data-sections></div></div>'}</div>`,
    negativeTags: (o) => `<label class="field" data-f="negativeTags"><span class="label">Avoid ${o.required ? '' : '<small>(styles to exclude)</small>'}</span><input type="text" data-k="negativeTags" maxlength="1000" placeholder="e.g. heavy metal, autotune" /></label>`,
    tags: () => `<div class="field" data-f="tags"><span class="label">Style tags</span><input type="text" data-k="tags" maxlength="1000" placeholder="e.g. funk, slap bass, brass section" /><div class="chips" data-genres></div></div>`,
    vocalGender: () => `<div class="field" data-f="vocalGender" data-vocal><span class="label">Voice</span><div class="seg" data-k="vocalGender" data-type="seg" data-value=""><button type="button" class="on" data-v="">Auto</button><button type="button" data-v="f">Female</button><button type="button" data-v="m">Male</button></div></div>`,
    instrumental: () => `<label class="switch" data-f="instrumental"><input type="checkbox" data-k="instrumental" data-type="bool" /><span></span> Instrumental (no vocals)</label>`,
    continueAt: (o) => `<label class="field" data-f="continueAt"><span class="label">Continue from (seconds) ${o.required ? '' : '<small>(optional)</small>'}</span><input type="number" data-k="continueAt" min="1" step="0.1" placeholder="${o.placeholder || 'e.g. 60'}" /></label>`,
    upload: (o) => `<div class="field" data-f="${o.k}"><span class="label">${o.label || 'Source audio'}</span><div class="uploader" data-k="${o.k}" data-type="upload"></div></div>`,
    slider: (o) => `<div class="field" data-f="${o.k}"><div class="slider off" data-k="${o.k}" data-type="slider">
        <label class="check" title="Enable"><input type="checkbox" /> ${o.label}</label>
        <input type="range" min="${o.min}" max="${o.max}" step="${o.step}" value="${o.value}" />
        <span class="val">auto</span></div><div class="slider-help">${o.help || ''}</div></div>`,
    variety: () => `<label class="field" data-f="variety"><span class="label">Variety between the 2 takes</span><select data-k="variety" data-type="int">
        <option value="0">Off — same style both takes</option><option value="1" selected>Normal (default)</option><option value="2">High — distinct styles</option><option value="3">Extra — bold exploration</option><option value="4">Max — anything goes</option></select></label>`,
    persona: () => {
      const opts = state.personas.map((p) => `<option value="${esc(p.id)}|${esc(p.model || 'style_persona')}">${esc(p.name)}</option>`).join('');
      return `<div class="field" data-f="persona"><span class="label">Persona / voice <small>(keep a consistent singer)</small></span>
        <div class="row tight"><select data-persona-pick><option value="">None</option>${opts}</select>
        <input type="text" data-k="personaId" placeholder="…or paste a persona / voice ID" />
        <select data-k="personaModel" aria-label="Persona type"><option value="">style_persona</option><option value="voice_persona">voice_persona</option></select></div></div>`;
    },
  };
  const FINE_TUNE = (withDuration, withPersona = true) => [
    ...(withDuration ? [{ t: 'slider', k: 'duration', label: 'Length', min: 10, max: 360, step: 1, value: 120, help: 'Target duration in seconds (V6 series).', unit: 's' }] : []),
    { t: 'slider', k: 'styleWeight', label: 'Style adherence', min: 0, max: 1, step: 0.01, value: 0.65, help: 'How strictly to follow your style prompt.' },
    { t: 'slider', k: 'weirdnessConstraint', label: 'Weirdness', min: 0, max: 1, step: 0.01, value: 0.5, help: 'Higher = more creative and unexpected.' },
    { t: 'slider', k: 'audioWeight', label: 'Audio weight', min: 0, max: 1, step: 0.01, value: 0.65, help: 'Relative weight of audio features (vocal tracks only).', vocal: true },
    { t: 'variety' },
    ...(withPersona ? [{ t: 'persona' }] : []),
  ];

  function buildForm(el, spec, fine) {
    const one = (f) => {
      const html = FIELD[f.t]({ ...f, k: f.k });
      return f.vocal ? html.replace('data-f=', 'data-vocal data-f=') : html;
    };
    el.innerHTML = spec.map(one).join('') +
      (fine ? `<details class="disclosure"><summary>Fine-tune <small>(length, weirdness, variety, persona)</small></summary><div class="stack">${fine.map(one).join('')}</div></details>` : '');
    wireForm(el);
  }

  function wireForm(el) {
    charCounter(el);
    $$('[data-genres]', el).forEach((c) => chips(c, GENRES, (g) => toggleTag(c.closest('.field').querySelector('[data-k]'), g)));
    $$('[data-moods]', el).forEach((c) => chips(c, MOODS, (g) => toggleTag(c.closest('.field').querySelector('[data-k]'), g)));
    $$('[data-sections]', el).forEach((c) => chips(c, ['[Intro]', '[Verse]', '[Pre-Chorus]', '[Chorus]', '[Bridge]', '[Outro]'], (s) => {
      const ta = c.closest('.field').querySelector('textarea');
      const pos = ta.selectionStart ?? ta.value.length;
      const ins = (pos && ta.value[pos - 1] !== '\n' ? '\n\n' : '') + s + '\n';
      ta.value = ta.value.slice(0, pos) + ins + ta.value.slice(pos);
      ta.focus(); ta.selectionStart = ta.selectionEnd = pos + ins.length;
      ta.dispatchEvent(new Event('input'));
    }));
    $$('[data-boost]', el).forEach((b) => (b.onclick = () => boostStyle(b.closest('.field').querySelector('textarea'), b)));
    $$('[data-write-lyrics]', el).forEach((b) => (b.onclick = () => { go('lyrics'); $('#l-prompt').focus(); }));
    $$('[data-type=seg]', el).forEach((seg) => $$('button', seg).forEach((b) => (b.onclick = () => {
      $$('button', seg).forEach((x) => x.classList.toggle('on', x === b));
      seg.dataset.value = b.dataset.v;
    })));
    $$('[data-type=slider]', el).forEach((s) => {
      const cb = $('input[type=checkbox]', s), r = $('input[type=range]', s), v = $('.val', s);
      const unit = s.dataset.k === 'duration' ? 's' : '';
      const upd = () => { s.classList.toggle('off', !cb.checked); v.textContent = cb.checked ? r.value + unit : 'auto'; };
      cb.onchange = upd;
      r.oninput = () => { cb.checked = true; upd(); };
      upd();
    });
    $$('[data-type=upload]', el).forEach((u) => uploader(u));
    $$('[data-persona-pick]', el).forEach((p) => (p.onchange = () => {
      const [id, model] = p.value.split('|');
      $('[data-k=personaId]', el).value = id || '';
      $('[data-k=personaModel]', el).value = model === 'voice_persona' ? 'voice_persona' : '';
    }));
    const inst = $('[data-k=instrumental]', el);
    if (inst) inst.onchange = () => $$('[data-vocal]', el).forEach((f) => (f.hidden = inst.checked));
  }

  function readForm(el) {
    const out = {};
    $$('[data-k]', el).forEach((f) => {
      if (f.closest('[hidden]')) return;
      const k = f.dataset.k, type = f.dataset.type;
      if (type === 'bool') { out[k] = f.checked; return; }
      if (type === 'seg') { if (f.dataset.value) out[k] = f.dataset.value; return; }
      if (type === 'upload') { if (f.dataset.url) out[k] = f.dataset.url; return; }
      if (type === 'slider') { if ($('input[type=checkbox]', f).checked) out[k] = +$('input[type=range]', f).value; return; }
      if (type === 'int') { out[k] = parseInt(f.value, 10); return; }
      const v = (f.value || '').trim();
      if (!v) return;
      out[k] = f.type === 'number' ? +v : v;
    });
    if (!out.personaId) delete out.personaModel;
    if (out.instrumental) { delete out.audioWeight; delete out.vocalGender; delete out.lyrics; delete out.prompt; }
    return out;
  }
  const setField = (el, k, v) => { const f = $(`[data-k="${k}"]`, el); if (f) { f.value = v; f.dispatchEvent(new Event('input')); } };

  async function boostStyle(textarea, btn) {
    const content = textarea.value.trim();
    if (!content) { toast('Type a few style words first, then boost them.'); textarea.focus(); return; }
    const old = btn.textContent;
    btn.disabled = true; btn.textContent = 'Boosting…';
    try {
      let d = await api('/style/generate', { method: 'POST', body: { content } });
      // Usually synchronous; if a task comes back pending, poll briefly for the result.
      for (let i = 0; !d?.result && d?.taskId && i < 10; i++) {
        await new Promise((r) => setTimeout(r, 2500));
        d = await api('/style/generate/record-info', { query: { taskId: d.taskId } }).catch(() => d);
      }
      if (d?.result) {
        textarea.value = d.result.slice(0, 1000);
        textarea.dispatchEvent(new Event('input'));
        toast('Style boosted 🚀 — tweak it however you like.', 'ok');
        refreshCredits();
      } else toast('Boost did not return a result this time.', 'bad');
    } catch (e) { toast(e.message, 'bad'); }
    finally { btn.disabled = false; btn.textContent = old; }
  }

  // ---------------------------------------------------------------- tasks & polling
  const MUSIC_STAGE = { PENDING: 1, TEXT_SUCCESS: 2, FIRST_SUCCESS: 3, SUCCESS: 4 };
  const STAGE_TEXT = ['Queued', 'Composing…', 'Writing lyrics & arrangement…', 'First take ready — finishing the second…', 'Done'];
  const KIND_LABEL = { music: 'Song', lyrics: 'Lyrics', wav: 'WAV export', stems: 'Stems', video: 'Music video', cover: 'Cover art', sound: 'Sound' };

  function addTask(kind, taskId, label, meta = {}) {
    const t = { id: taskId, kind, label, meta, status: 'pending', stage: 0, created: Date.now() };
    state.tasks.unshift(t);
    save(); renderTasks();
    setTimeout(pollOnce, 1500);
    return t;
  }

  function upsertTracks(sunoData, task) {
    let added = 0;
    for (const s of sunoData || []) {
      if (!s?.id) continue;
      let t = state.tracks.find((x) => x.id === s.id);
      if (!t) { t = { id: s.id, taskId: task.id, created: Date.now(), extras: {} }; state.tracks.unshift(t); added++; }
      Object.assign(t, {
        title: s.title || t.title || task.label,
        tags: s.tags || t.tags || '',
        prompt: s.prompt || t.prompt || '',
        image: safeUrl(s.image_url || s.source_image_url) || t.image || '',
        audio: safeUrl(s.audio_url || s.source_audio_url) || t.audio || '',
        stream: safeUrl(s.stream_audio_url || s.source_stream_audio_url) || t.stream || '',
        duration: s.duration || t.duration || 0,
        modelName: s.model_name || t.modelName || '',
        model: task.meta?.model || t.model || '',
        kind: task.kind,
        partial: !s.audio_url,
      });
    }
    return added;
  }

  async function checkTask(t) {
    const q = { query: { taskId: t.id } };
    const fail = (msg) => { t.status = 'failed'; t.msg = msg || 'Generation failed.'; };
    if (t.kind === 'music' || t.kind === 'sound') {
      const d = await api('/generate/record-info', q);
      const st = d?.status || 'PENDING';
      t.stage = MUSIC_STAGE[st] ?? t.stage;
      const data = d?.response?.sunoData;
      if (data?.length) {
        const added = upsertTracks(data, t);
        if (added && st !== 'SUCCESS') toast(`🎧 "${data[0].title || t.label}" is streaming — press play while it finishes.`);
      }
      if (st === 'SUCCESS') {
        t.status = 'done';
        const first = !store.get('sf.celebrated', false);
        toast(`✅ ${data?.length || 2} new track${data?.length === 1 ? '' : 's'} ready: ${data?.[0]?.title || t.label}`, 'ok');
        if (first) { confetti(); store.set('sf.celebrated', true); }
        refreshCredits();
      } else if (/FAIL|ERROR|EXCEPTION/.test(st)) fail(d.errorMessage || st.replace(/_/g, ' ').toLowerCase());
    } else if (t.kind === 'lyrics') {
      const d = await api('/lyrics/record-info', q);
      const st = d?.status || 'PENDING';
      if (st === 'SUCCESS') { t.status = 'done'; t.result = (d.response?.data || []).filter((x) => x.text); renderLyrics(t); refreshCredits(); }
      else if (/FAIL|ERROR|EXCEPTION/.test(st)) fail(d.errorMessage || st);
      else t.stage = 2;
    } else {
      const path = { wav: '/wav/record-info', stems: '/vocal-removal/record-info', video: '/mp4/record-info', cover: '/suno/cover/record-info' }[t.kind];
      const d = await api(path, q);
      const flag = d?.successFlag;
      const ok = flag === 'SUCCESS' || flag === 1 || flag === '1';
      const bad = /FAIL|EXCEPTION/.test(String(flag)) || flag === 3 || flag === '3';
      t.stage = 2;
      if (ok) {
        t.status = 'done';
        const track = state.tracks.find((x) => x.id === t.meta.trackId);
        const r = d.response || {};
        if (track) {
          track.extras ||= {};
          if (t.kind === 'wav') track.extras.wav = safeUrl(r.audioWavUrl);
          if (t.kind === 'video') track.extras.video = safeUrl(r.videoUrl);
          if (t.kind === 'cover') track.extras.covers = (r.images || []).map(safeUrl).filter(Boolean);
          if (t.kind === 'stems') track.extras.stems = collectStems(r);
        }
        toast(`✅ ${KIND_LABEL[t.kind]} ready for "${track?.title || t.label}"`, 'ok');
        refreshCredits();
        if (openTrackId === t.meta.trackId && $('#modal-body .detail-head')) openTrack(openTrackId);
      } else if (bad) fail(d.errorMessage || String(flag));
    }
    if (t.status === 'pending' && Date.now() - t.created > TASK_TIMEOUT_MS) fail('Timed out — try re-importing the task ID from the Library later.');
    if (t.status === 'failed') toast(`⚠️ ${KIND_LABEL[t.kind]} failed: ${t.msg}`, 'bad');
  }

  function collectStems(r) {
    const out = [];
    const seen = new Set();
    for (const o of r.originData || []) {
      if (safeUrl(o.audio_url) && !seen.has(o.audio_url)) { seen.add(o.audio_url); out.push({ name: o.stem_type_group_name || 'Stem', url: o.audio_url }); }
    }
    for (const [k, v] of Object.entries(r)) {
      if (/Url$/.test(k) && k !== 'originUrl' && safeUrl(v) && !seen.has(v)) {
        seen.add(v);
        out.push({ name: k.replace(/Url$/, '').replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()), url: v });
      }
    }
    return out;
  }

  let pollTimer = null, polling = false;
  async function pollOnce() {
    if (polling || !state.key) return;
    polling = true;
    try {
      for (const t of state.tasks.filter((x) => x.status === 'pending')) {
        try { await checkTask(t); } catch (e) { if (e.code === 401) break; t.msg = e.message; }
      }
      save(); renderTasks(); renderRecent(); updateCount();
      if ($('#view-library').classList.contains('active')) renderLibrary();
    } finally { polling = false; }
  }
  function startPolling() { stopPolling(); pollTimer = setInterval(pollOnce, POLL_MS); pollOnce(); }
  function stopPolling() { clearInterval(pollTimer); pollTimer = null; }

  async function submit(btn, fn) {
    const old = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner" style="display:inline-block;vertical-align:middle;width:16px;height:16px"></span> Sending…';
    try { return await fn(); } catch (e) { toast(e.message, 'bad'); } finally { btn.disabled = false; btn.innerHTML = old; }
  }

  // ---------------------------------------------------------------- create
  function customSpec() {
    buildForm($('#custom-form'), [
      { t: 'title', max: 80 }, { t: 'style' }, { t: 'lyrics' }, { t: 'negativeTags' }, { t: 'vocalGender' }, { t: 'instrumental' },
    ], FINE_TUNE(true));
  }

  function setMode(m) {
    state.mode = m;
    $$('#mode-seg button').forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
    $('#simple-form').hidden = m !== 'simple';
    $('#custom-form').hidden = m !== 'custom';
  }

  function initCreate() {
    modelPicker($('#model-picker'), 'create');
    $$('#mode-seg button').forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));
    customSpec();
    chips($('[data-chip-target=s-style]'), [...GENRES.slice(0, 10), ...MOODS.slice(0, 4)], (g) => toggleTag($('#s-style'), g));
    chips($('#s-idea-chips'), ['Birthday song', 'Workout hype', 'Breakup ballad', 'Kids song', 'Podcast intro'], (g) => {
      const map = {
        'Birthday song': 'A joyful, catchy birthday song for my friend Sam who loves skateboarding and pizza',
        'Workout hype': 'A high-energy hype track to push through the last mile of a run',
        'Breakup ballad': 'A heartfelt piano ballad about letting go and finding yourself again',
        'Kids song': 'A silly, bouncy song for kids about brushing your teeth like a dinosaur',
        'Podcast intro': 'A punchy 15-second intro jingle for a tech podcast called "Byte Size"',
      };
      $('#s-prompt').value = map[g]; $('#s-prompt').dispatchEvent(new Event('input'));
    });
    $('#surprise').onclick = () => {
      $('#s-prompt').value = pick(IDEAS);
      $('#s-prompt').dispatchEvent(new Event('input'));
      $('#s-style').value = `${pick(GENRES)}, ${pick(MOODS)}`;
    };
    uploader($('[data-upload=s-audio]'));
    charCounter($('#view-create'));
    $('#generate').onclick = () => generate();
  }

  function generate() {
    const model = state.models.create;
    let body;
    if (state.mode === 'simple') {
      const images = $('#s-images').value.split(/\s+/).map((s) => s.trim()).filter(safeUrl).slice(0, 5);
      const video = safeUrl($('#s-video').value.trim());
      const audio = $('[data-upload=s-audio]').dataset.url;
      body = {
        customMode: false, instrumental: $('#s-instrumental').checked, model,
        prompt: $('#s-prompt').value.trim() || undefined,
        style: $('#s-style').value.trim() || undefined,
        lyrics: $('#s-lyrics').value.trim() || undefined,
        imageUrls: images.length ? images : undefined,
        videoUrls: video ? [video] : undefined,
        audioUrls: audio ? [audio] : undefined,
      };
      if (!body.prompt && !body.style && !body.lyrics && !images.length && !video && !audio) {
        toast('Describe your song (or tap 🎲 Surprise me) to get started.'); $('#s-prompt').focus(); return;
      }
    } else {
      const f = readForm($('#custom-form'));
      body = { customMode: true, instrumental: !!f.instrumental, model, ...f };
      if (!f.style && !f.lyrics && !f.negativeTags) { toast('Custom mode needs at least a style, lyrics, or tags to avoid.'); return; }
      if (f.duration && !/^V6|V5_5/.test(model)) delete body.duration;
    }
    body.callBackUrl = CALLBACK;
    const label = body.title || (body.prompt || body.style || 'New song').slice(0, 60);
    submit($('#generate'), async () => {
      const d = await api('/generate', { method: 'POST', body });
      addTask('music', d.taskId, label, { model });
      toast('🎛 Your song is cooking! It usually takes 1–3 minutes.', 'ok');
      refreshCredits();
    });
  }

  // ---------------------------------------------------------------- lyrics
  function initLyrics() {
    chips($('#l-chips'), LYRIC_IDEAS, (g) => { $('#l-prompt').value = g; $('#l-prompt').dispatchEvent(new Event('input')); });
    $('#l-generate').onclick = () => {
      const prompt = $('#l-prompt').value.trim();
      if (!prompt) { toast('Give the lyricist a theme first.'); $('#l-prompt').focus(); return; }
      submit($('#l-generate'), async () => {
        const d = await api('/lyrics', { method: 'POST', body: { prompt, callBackUrl: CALLBACK } });
        addTask('lyrics', d.taskId, prompt.slice(0, 60));
        $('#lyrics-results').innerHTML = `<div class="empty"><span class="spinner" style="margin:0 auto 8px"></span><b>Writing drafts…</b>Usually 10–30 seconds.</div>`;
      });
    };
    const last = state.tasks.find((t) => t.kind === 'lyrics' && t.status === 'done');
    if (last) renderLyrics(last);
  }

  function renderLyrics(task) {
    const el = $('#lyrics-results');
    const items = task.result || [];
    if (!items.length) { el.innerHTML = '<div class="empty">No lyrics came back — try a different theme.</div>'; return; }
    el.innerHTML = items.map((x, i) => `
      <div class="lyric-card">
        <h4>${esc(x.title || `Draft ${i + 1}`)}</h4>
        <pre>${esc(x.text)}</pre>
        <div class="row"><button class="btn btn-sm btn-ghost" data-copy="${i}">Copy</button><button class="btn btn-sm btn-primary" data-use="${i}">Use in song →</button></div>
      </div>`).join('');
    $$('[data-copy]', el).forEach((b) => (b.onclick = () => { navigator.clipboard?.writeText(items[+b.dataset.copy].text); toast('Lyrics copied.'); }));
    $$('[data-use]', el).forEach((b) => (b.onclick = () => {
      const x = items[+b.dataset.use];
      setMode('custom');
      const cf = $('#custom-form');
      setField(cf, 'lyrics', x.text);
      if (x.title) setField(cf, 'title', x.title.slice(0, 80));
      const inst = $('[data-k=instrumental]', cf);
      if (inst.checked) { inst.checked = false; inst.onchange(); }
      go('create');
      toast('Lyrics loaded into Custom mode — add a style and hit Generate.', 'ok');
    }));
  }

  // ---------------------------------------------------------------- remix
  const REMIX = {
    cover: {
      desc: 'Upload a song and re-imagine it in a new style while keeping the melody.',
      path: '/generate/upload-cover', btn: '🎭 Create cover',
      spec: [{ t: 'upload', k: 'uploadUrl', label: 'Song to cover (≤ 8 min)' }, { t: 'title', max: 80 }, { t: 'style', label: 'New style' }, { t: 'lyrics', label: 'Lyrics', rows: 5 }, { t: 'vocalGender' }, { t: 'instrumental' }],
      fine: FINE_TUNE(false), required: ['uploadUrl'],
    },
    extend: {
      desc: 'Upload audio and keep it going — Suno continues in the same style from any point.',
      path: '/generate/upload-extend', btn: '⏩ Extend audio',
      spec: [{ t: 'upload', k: 'uploadUrl', label: 'Audio to extend (≤ 8 min)' }, { t: 'continueAt' }, { t: 'title', max: 100 }, { t: 'style' }, { t: 'lyrics', label: 'Lyrics for the new part', rows: 5 }, { t: 'vocalGender' }, { t: 'instrumental' }],
      fine: FINE_TUNE(false), required: ['uploadUrl'],
    },
    vocals: {
      desc: 'Got a beat? Upload an instrumental and Suno writes and sings a topline over it.',
      path: '/generate/add-vocals', btn: '🎤 Add vocals',
      spec: [{ t: 'upload', k: 'uploadUrl', label: 'Instrumental track' }, { t: 'title', required: true }, { t: 'style', required: true, label: 'Vocal style' }, { t: 'negativeTags', required: true }, { t: 'lyrics', rows: 5 }, { t: 'vocalGender' }],
      fine: FINE_TUNE(false, false), required: ['uploadUrl', 'title', 'style', 'negativeTags'],
    },
    instrumental: {
      desc: 'Hum or sing an idea, upload it, and get a full backing track built around your voice.',
      path: '/generate/add-instrumental', btn: '🎸 Add instrumental',
      spec: [{ t: 'upload', k: 'uploadUrl', label: 'Vocal / melody recording' }, { t: 'title', required: true }, { t: 'tags' }, { t: 'negativeTags', required: true }, { t: 'vocalGender' }],
      fine: FINE_TUNE(false, false), required: ['uploadUrl', 'title', 'tags', 'negativeTags'],
    },
    mashup: {
      desc: 'Blend two tracks into one brand-new composition.',
      path: '/generate/mashup', btn: '🔀 Make mashup',
      spec: [{ t: 'upload', k: 'uploadA', label: 'Track A' }, { t: 'upload', k: 'uploadB', label: 'Track B' }, { t: 'title', max: 80 }, { t: 'style' }, { t: 'lyrics', rows: 5 }, { t: 'vocalGender' }],
      fine: FINE_TUNE(true), required: ['uploadA', 'uploadB'],
    },
  };
  const NICE = { uploadUrl: 'source audio', uploadA: 'Track A', uploadB: 'Track B', title: 'a title', style: 'a style', tags: 'style tags', negativeTags: 'styles to avoid' };

  function setRemix(k) {
    state.remix = k;
    const r = REMIX[k];
    $$('#remix-seg button').forEach((b) => b.classList.toggle('on', b.dataset.remix === k));
    $('#remix-desc').textContent = r.desc;
    $('#remix-go').textContent = r.btn;
    buildForm($('#remix-form'), r.spec, r.fine);
  }

  function initRemix() {
    modelPicker($('#remix-model-picker'), 'remix');
    $$('#remix-seg button').forEach((b) => (b.onclick = () => setRemix(b.dataset.remix)));
    setRemix('cover');
    $('#remix-go').onclick = () => {
      const r = REMIX[state.remix];
      const f = readForm($('#remix-form'));
      const missing = r.required.filter((k) => !f[k]);
      if (missing.length) { toast(`Please add ${missing.map((k) => NICE[k] || k).join(', ')}.`); return; }
      const model = state.models.remix;
      const body = { ...f, model, callBackUrl: CALLBACK };
      if (state.remix === 'mashup') { body.uploadUrlList = [f.uploadA, f.uploadB]; delete body.uploadA; delete body.uploadB; }
      submit($('#remix-go'), async () => {
        const d = await api(r.path, { method: 'POST', body });
        addTask('music', d.taskId, f.title || `${r.btn.replace(/^\S+\s/, '')}`, { model });
        toast('🎛 Remix started — watch it in the Create tab or your Library.', 'ok');
        refreshCredits();
      });
    };
  }

  // ---------------------------------------------------------------- sounds
  function initSounds() {
    modelPicker($('#sound-model-picker'), 'sound', { allowLegacy: false });
    $('#snd-key').innerHTML = KEYS.map((k) => `<option>${k}</option>`).join('');
    chips($('#snd-chips'), SOUND_IDEAS, (g) => ($('#snd-prompt').value = g));
    $('#snd-go').onclick = () => {
      const prompt = $('#snd-prompt').value.trim();
      if (!prompt) { toast('Describe the sound you want.'); $('#snd-prompt').focus(); return; }
      const bpm = parseInt($('#snd-bpm').value, 10);
      const body = {
        prompt, model: state.models.sound, soundLoop: $('#snd-loop').checked, soundKey: $('#snd-key').value,
        grabLyrics: $('#snd-grab').checked, callBackUrl: CALLBACK,
      };
      if (bpm >= 1 && bpm <= 300) body.soundTempo = bpm;
      submit($('#snd-go'), async () => {
        const d = await api('/generate/sounds', { method: 'POST', body });
        addTask('sound', d.taskId, prompt.slice(0, 60), { model: body.model });
        toast('🔊 Sound is generating — it will land in your Library.', 'ok');
      });
    };
  }

  // ---------------------------------------------------------------- rendering
  function renderTasks() {
    const el = $('#task-list');
    const list = state.tasks.filter((t) => t.status === 'pending' || (t.status === 'failed' && Date.now() - t.created < 3600e3)).slice(0, 8);
    if (!list.length) {
      el.innerHTML = `<div class="empty"><b>Nothing cooking yet</b>Describe a song and hit Generate — you'll see progress here.</div>`;
      return;
    }
    el.innerHTML = list.map((t) => {
      const steps = t.kind === 'music' || t.kind === 'sound' ? 4 : 2;
      const stage = t.status === 'failed' ? 0 : t.stage || 1;
      const bars = Array.from({ length: steps }, (_, i) => `<i class="${i + 1 < stage ? 'done' : i + 1 === stage ? 'now' : ''}"></i>`).join('');
      const text = t.status === 'failed' ? t.msg : steps === 4 ? STAGE_TEXT[stage] : 'Working on it…';
      const mins = Math.floor((Date.now() - t.created) / 60000);
      return `<div class="task ${t.status === 'failed' ? 'fail' : ''}">
        <div class="task-top">${t.status === 'pending' ? '<span class="spinner"></span>' : '⚠️'}<div class="task-title">${esc(t.label)}</div><span class="task-kind">${KIND_LABEL[t.kind]}</span></div>
        <div class="steps">${bars}</div>
        <div class="task-status"><span>${esc(text)}</span><span>${mins ? mins + 'm' : 'just now'}</span></div></div>`;
    }).join('');
  }

  const coverImg = (t, cls = '') => (t.image ? `<img class="${cls}" src="${esc(t.image)}" alt="" loading="lazy" />` : `<div class="cover-ph ${cls}"></div>`);

  function renderRecent() {
    const el = $('#recent-tracks');
    const list = state.tracks.slice(0, 6);
    if (!list.length) { el.innerHTML = `<div class="empty"><b>Your tracks land here</b>Each generation gives you two takes to choose from.</div>`; return; }
    el.innerHTML = list.map((t) => `
      <div class="track-row" data-id="${esc(t.id)}">${coverImg(t)}
        <div class="meta"><div class="t">${esc(t.title || 'Untitled')}</div><div class="s">${t.partial ? '⏳ streaming · ' : ''}${esc(t.tags || '')}</div></div>
        <button class="play-btn" data-play="${esc(t.id)}" aria-label="Play">▶</button></div>`).join('');
    wireTrackEls(el);
  }

  function renderLibrary() {
    const q = $('#lib-search').value.trim().toLowerCase();
    const list = state.tracks.filter((t) => !q || `${t.title} ${t.tags} ${t.prompt}`.toLowerCase().includes(q));
    const el = $('#library');
    if (!state.tracks.length) {
      el.innerHTML = `<div class="empty" style="grid-column:1/-1"><b>No tracks yet</b>Head to <a href="#" data-go="create">Create</a> and make your first song — it takes about a minute.</div>`;
    } else if (!list.length) {
      el.innerHTML = `<div class="empty" style="grid-column:1/-1">No tracks match "${esc(q)}".</div>`;
    } else {
      el.innerHTML = list.map((t) => `
        <div class="card" data-id="${esc(t.id)}">
          <div class="card-art">${coverImg(t)}${t.partial ? '<span class="badge">STREAMING</span>' : t.kind === 'sound' ? '<span class="badge">SOUND</span>' : ''}
            <button class="play-btn" data-play="${esc(t.id)}" aria-label="Play">▶</button></div>
          <div class="card-body"><div class="t">${esc(t.title || 'Untitled')}</div><div class="s">${esc(t.tags || t.prompt || '')}</div>
            <div class="card-foot"><span>${fmtTime(t.duration)} · ${esc(t.model || t.modelName || '')}</span><button class="btn btn-sm btn-ghost" data-open="${esc(t.id)}">Actions ⋯</button></div></div>
        </div>`).join('');
    }
    $$('[data-go]', el).forEach((a) => (a.onclick = (e) => { e.preventDefault(); go(a.dataset.go); }));
    wireTrackEls(el);
    renderPersonas();
  }

  function renderPersonas() {
    const el = $('#personas');
    el.innerHTML = state.personas.length
      ? state.personas.map((p, i) => `<div class="persona"><b>🎙 ${esc(p.name)}</b>${esc(p.description || '')}<br><code>${esc(p.id)}</code>
          <div class="row tight" style="margin-top:6px"><button class="btn btn-sm" data-use-persona="${i}">Use in Custom</button><button class="btn btn-sm btn-ghost" data-del-persona="${i}">Remove</button></div></div>`).join('')
      : `<div class="empty">No personas yet. Open any finished track's actions and choose <b style="display:inline">Create persona</b>.</div>`;
    $$('[data-use-persona]', el).forEach((b) => (b.onclick = () => {
      const p = state.personas[+b.dataset.usePersona];
      customSpec(); setMode('custom'); go('create');
      const cf = $('#custom-form');
      $('details', cf).open = true;
      setField(cf, 'personaId', p.id);
      $('[data-k=personaModel]', cf).value = p.model === 'voice_persona' ? 'voice_persona' : '';
      toast(`Persona "${p.name}" loaded. Add a style and lyrics, then generate.`, 'ok');
    }));
    $$('[data-del-persona]', el).forEach((b) => (b.onclick = () => { state.personas.splice(+b.dataset.delPersona, 1); save(); renderPersonas(); customSpec(); }));
  }

  function wireTrackEls(el) {
    $$('[data-play]', el).forEach((b) => (b.onclick = (e) => { e.stopPropagation(); play(b.dataset.play); }));
    $$('[data-open]', el).forEach((b) => (b.onclick = (e) => { e.stopPropagation(); openTrack(b.dataset.open); }));
    $$('.track-row, .card', el).forEach((r) => (r.onclick = () => openTrack(r.dataset.id)));
  }

  function updateCount() { $('#lib-count').textContent = state.tracks.length; }
  function renderAll() { renderTasks(); renderRecent(); updateCount(); renderLibrary(); }

  // ---------------------------------------------------------------- player & karaoke
  const audio = $('#audio');
  function play(id) {
    const t = state.tracks.find((x) => x.id === id);
    if (!t) return;
    const src = t.audio || t.stream;
    if (!src) { toast('This track has no playable audio yet.'); return; }
    if (state.playing?.id === id && audio.src) { audio.paused ? audio.play() : audio.pause(); return; }
    state.playing = t;
    audio.src = src;
    audio.play().catch(() => toast('Playback was blocked — press play again.', 'bad'));
    $('#player').hidden = false;
    $('#pl-img').src = t.image || '';
    $('#pl-title').textContent = t.title || 'Untitled';
    $('#pl-tags').textContent = t.tags || '';
    if (!$('#karaoke').hidden) openKaraoke();
  }
  function initPlayer() {
    const seek = $('#pl-seek');
    $('#pl-play').onclick = () => (audio.paused ? audio.play() : audio.pause());
    audio.onplay = () => { $('#pl-play').textContent = '❚❚'; $('#player').classList.add('playing'); };
    audio.onpause = () => { $('#pl-play').textContent = '▶'; $('#player').classList.remove('playing'); };
    audio.onloadedmetadata = () => { $('#pl-dur').textContent = fmtTime(audio.duration); };
    audio.ontimeupdate = () => {
      if (audio.duration) seek.value = (audio.currentTime / audio.duration) * 100;
      $('#pl-cur').textContent = fmtTime(audio.currentTime);
      syncKaraoke();
    };
    audio.onerror = () => {
      const t = state.playing;
      if (t && audio.src !== t.stream && t.stream) { audio.src = t.stream; audio.play().catch(() => {}); }
      else toast('Could not load this audio. Suno files expire after ~14 days.', 'bad');
    };
    seek.oninput = () => { if (audio.duration) audio.currentTime = (seek.value / 100) * audio.duration; };
    $('#pl-actions').onclick = () => state.playing && openTrack(state.playing.id);
    $('#pl-karaoke').onclick = () => openKaraoke();
    $('#karaoke-close').onclick = () => ($('#karaoke').hidden = true);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { $('#karaoke').hidden = true; closeModal(); }
      if (e.code === 'Space' && !/INPUT|TEXTAREA|SELECT|BUTTON/.test(document.activeElement.tagName) && state.playing) {
        e.preventDefault(); audio.paused ? audio.play() : audio.pause();
      }
    });
  }

  let kWords = [], kIdx = -1;
  async function openKaraoke() {
    const t = state.playing;
    if (!t) return;
    const body = $('#karaoke-body');
    $('#karaoke').hidden = false;
    kWords = []; kIdx = -1;
    if (!t.extras?.aligned) {
      body.innerHTML = '<span class="spinner" style="margin:auto"></span>';
      try {
        const d = await api('/generate/get-timestamped-lyrics', { method: 'POST', body: { taskId: t.taskId, audioId: t.id } });
        t.extras ||= {};
        t.extras.aligned = (d?.alignedWords || []).map((w) => ({ w: w.word, s: w.startS, e: w.endS }));
        save();
      } catch (e) {
        body.innerHTML = `<p class="muted" style="font-size:1rem">${esc(e.message)}<br>Sing-along needs a finished vocal track.</p>`;
        return;
      }
    }
    kWords = t.extras.aligned;
    if (!kWords.length) { body.innerHTML = `<p class="muted" style="font-size:1rem">No timed lyrics for this track (instrumentals don't have any).</p>`; return; }
    body.innerHTML = kWords.map((w, i) => {
      const txt = esc(w.w).replace(/\[[^\]]*\]\s*/g, '').replace(/\n/g, '<br>');
      return `<span class="w" data-i="${i}">${txt}</span>`;
    }).join('');
    syncKaraoke();
  }
  function syncKaraoke() {
    if ($('#karaoke').hidden || !kWords.length) return;
    const tm = audio.currentTime;
    let idx = -1;
    for (let i = 0; i < kWords.length; i++) { if (kWords[i].s <= tm) idx = i; else break; }
    if (idx === kIdx) return;
    kIdx = idx;
    $$('#karaoke-body .w').forEach((s, i) => { s.classList.toggle('past', i < idx); s.classList.toggle('now', i === idx); });
    $(`#karaoke-body .w[data-i="${idx}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  // ---------------------------------------------------------------- track modal & actions
  let openTrackId = null;
  function modal(html) {
    $('#modal-body').innerHTML = html;
    $('#modal').hidden = false;
  }
  function closeModal() { $('#modal').hidden = true; openTrackId = null; }

  function openTrack(id) {
    const t = state.tracks.find((x) => x.id === id);
    if (!t) return;
    openTrackId = id;
    const x = t.extras || {};
    const res = [];
    if (t.audio) res.push(`<div class="result-row">🎵<span class="grow">MP3</span><a class="btn btn-sm" href="${esc(t.audio)}" target="_blank" rel="noopener" download>Download</a></div>`);
    if (x.wav) res.push(`<div class="result-row">🎚<span class="grow">WAV (lossless)</span><a class="btn btn-sm" href="${esc(x.wav)}" target="_blank" rel="noopener" download>Download</a></div>`);
    if (x.video) res.push(`<div class="result-row" style="flex-direction:column;align-items:stretch"><video src="${esc(x.video)}" controls playsinline></video><a class="btn btn-sm" href="${esc(x.video)}" target="_blank" rel="noopener" download>Download MP4</a></div>`);
    (x.stems || []).forEach((s) => res.push(`<div class="result-row">🎛<span class="grow">${esc(s.name)}</span><audio src="${esc(s.url)}" controls preload="none"></audio><a class="btn btn-sm" href="${esc(s.url)}" target="_blank" rel="noopener" download>⬇</a></div>`));
    if (x.covers?.length) res.push(`<div><p class="small muted" style="margin:6px 0">Tap a cover to use it as artwork:</p><div class="cover-choices">${x.covers.map((c) => `<img src="${esc(c)}" data-cover="${esc(c)}" alt="Generated cover option" />`).join('')}</div></div>`);
    if (x.persona) res.push(`<div class="result-row">🎙<span class="grow">Persona: ${esc(x.persona.name)}</span><code class="small">${esc(x.persona.id)}</code></div>`);
    const pend = state.tasks.filter((k) => k.status === 'pending' && k.meta?.trackId === id);
    pend.forEach((k) => res.push(`<div class="result-row"><span class="spinner"></span><span class="grow">${KIND_LABEL[k.kind]} in progress…</span></div>`));

    const ready = !t.partial;
    const act = (k, icon, title, sub, needReady = true) =>
      `<button class="action" data-act="${k}" ${needReady && !ready ? 'disabled title="Wait until the track finishes"' : ''}><b>${icon} ${title}</b><span>${sub}</span></button>`;
    modal(`
      <div class="detail-head">${coverImg(t)}<div style="min-width:0"><h2>${esc(t.title || 'Untitled')}</h2>
        <div class="muted small">${esc(t.tags || '')}</div><div class="muted small">${fmtTime(t.duration)} · ${esc(t.model || t.modelName || '')}</div></div></div>
      <div class="cta-row" style="margin-top:12px"><button class="btn btn-primary" data-act="play">▶ Play</button><button class="btn" data-act="karaoke">🎤 Sing-along</button></div>
      ${t.prompt ? `<pre class="lyrics-view">${esc(t.prompt)}</pre>` : ''}
      <div class="results">${res.join('')}</div>
      <h3 class="mt">Take it further</h3>
      <div class="action-grid">
        ${act('extend', '⏩', 'Extend', 'Continue the song from any point')}
        ${act('replace', '✂️', 'Replace a section', 'Rewrite 10s+ of the song')}
        ${act('stems', '🎛', 'Split stems', 'Vocals, drums, bass & more')}
        ${act('wav', '🎚', 'Export WAV', 'Lossless for editing')}
        ${act('video', '🎬', 'Music video', 'MP4 visualizer for socials')}
        ${act('cover', '🖼', 'New cover art', 'AI artwork options')}
        ${act('persona', '🎙', 'Create persona', 'Reuse this voice later')}
        ${act('remix', '🎭', 'Cover in new style', 'Send to the Remix lab')}
        ${act('remove', '🗑', 'Remove', 'From this library only', false)}
      </div>`);
    $$('[data-act]', $('#modal-body')).forEach((b) => (b.onclick = () => trackAction(t, b.dataset.act)));
    $$('[data-cover]', $('#modal-body')).forEach((img) => (img.onclick = () => { t.image = img.dataset.cover; save(); renderAll(); openTrack(t.id); toast('Artwork updated.', 'ok'); }));
  }

  function subForm(t, title, intro, specHtml, onSubmit, btnText = 'Start') {
    modal(`<h2>${title}</h2><p class="muted">${intro}</p><div class="stack" id="sub-form" style="margin-top:14px">${specHtml}</div>
      <div class="cta-row" style="margin-top:16px"><button class="btn btn-ghost" id="sub-back">← Back</button><button class="btn btn-primary" id="sub-go">${btnText}</button></div>`);
    const f = $('#sub-form');
    wireForm(f);
    $('#sub-back').onclick = () => openTrack(t.id);
    $('#sub-go').onclick = () => submit($('#sub-go'), () => onSubmit(readForm(f), f));
  }

  async function simpleTask(t, kind, path, body) {
    try {
      const d = await api(path, { method: 'POST', body: { taskId: t.taskId, audioId: t.id, callBackUrl: CALLBACK, ...body } });
      addTask(kind, d.taskId, t.title, { trackId: t.id });
      toast(`${KIND_LABEL[kind]} started for "${t.title}".`, 'ok');
    } catch (e) {
      if (e.data?.taskId) { addTask(kind, e.data.taskId, t.title, { trackId: t.id }); toast(`Fetching the existing ${KIND_LABEL[kind].toLowerCase()}…`); }
      else toast(e.message, 'bad');
    }
    openTrack(t.id);
  }

  function trackAction(t, a) {
    const modelOf = t.model || 'V6';
    switch (a) {
      case 'play': play(t.id); closeModal(); break;
      case 'karaoke': play(t.id); closeModal(); openKaraoke(); break;
      case 'wav': simpleTask(t, 'wav', '/wav/generate', {}); break;
      case 'cover': simpleTask(t, 'cover', '/suno/cover/generate', { audioId: undefined }); break;
      case 'video':
        subForm(t, '🎬 Music video', 'Creates an MP4 with visuals synced to the track — perfect for socials.',
          `<label class="field"><span class="label">Artist name <small>(shown in the video)</small></span><input type="text" data-k="author" maxlength="50" placeholder="Your artist name" /></label>
           <label class="field"><span class="label">Watermark <small>(optional, e.g. your site)</small></span><input type="text" data-k="domainName" maxlength="50" placeholder="music.example.com" /></label>`,
          (f) => simpleTask(t, 'video', '/mp4/generate', f), '🎬 Make video');
        break;
      case 'stems':
        subForm(t, '🎛 Split stems', 'Separate this track for remixing, karaoke or production. Each run is billed.',
          `<div class="field"><span class="label">Mode</span><select data-k="type" id="stem-type">
             <option value="separate_vocal">Vocals + Instrumental (2 stems)</option>
             <option value="split_stem">Full split (up to 12 stems)</option>
             <option value="split_stem_advanced">Single instrument</option></select></div>
           <label class="field" id="stem-name-f" hidden><span class="label">Instrument</span><select data-k="stemName">${STEM_NAMES.map((s) => `<option>${s}</option>`).join('')}</select></label>`,
          (f) => simpleTask(t, 'stems', '/vocal-removal/generate', f), '🎛 Split');
        $('#stem-type').onchange = (e) => ($('#stem-name-f').hidden = e.target.value !== 'split_stem_advanced');
        break;
      case 'persona':
        subForm(t, '🎙 Create persona', 'Capture this voice & vibe as a reusable persona. Pick a 10–30 second window where the vocals shine.',
          `<label class="field"><span class="label">Persona name</span><input type="text" data-k="name" placeholder="e.g. Midnight Soul Singer" /></label>
           <label class="field"><span class="label">Description</span><textarea data-k="description" rows="2" placeholder="Warm, breathy female vocal with soulful runs"></textarea></label>
           <label class="field"><span class="label">Style label <small>(optional)</small></span><input type="text" data-k="style" value="${esc((t.tags || '').slice(0, 80))}" /></label>
           <div class="row"><label class="field"><span class="label">Vocal start (s)</span><input type="number" data-k="vocalStart" min="0" step="0.5" value="0" /></label>
           <label class="field"><span class="label">Vocal end (s)</span><input type="number" data-k="vocalEnd" min="10" step="0.5" value="30" /></label></div>`,
          async (f) => {
            if (!f.name) { toast('Give your persona a name.'); return; }
            f.description ||= f.name;
            const len = (f.vocalEnd ?? 30) - (f.vocalStart ?? 0);
            if (len < 10 || len > 30) { toast('The vocal window must be 10–30 seconds long.'); return; }
            const d = await api('/generate/generate-persona', { method: 'POST', body: { taskId: t.taskId, audioId: t.id, ...f } });
            const p = { id: d.personaId, name: d.name || f.name, description: d.description || f.description, model: 'style_persona' };
            state.personas.unshift(p);
            t.extras ||= {}; t.extras.persona = p;
            save(); customSpec(); renderPersonas();
            toast(`🎙 Persona "${p.name}" saved — find it under Custom → Fine-tune.`, 'ok');
            openTrack(t.id);
          }, '🎙 Create');
        break;
      case 'extend':
        subForm(t, '⏩ Extend this song', `Continue "${esc(t.title)}" from any point. Uses the same model as the original (${esc(modelOf)}).`,
          FIELD.continueAt({ placeholder: t.duration ? `e.g. ${Math.floor(t.duration - 5)} (track is ${Math.floor(t.duration)}s)` : 'e.g. 60' }) +
          FIELD.title({ max: 100 }) + FIELD.style({}) + FIELD.lyrics({ label: 'Lyrics for the new part', rows: 5, noHelper: true }) + FIELD.vocalGender() + FIELD.instrumental(),
          async (f, el) => {
            if (f.continueAt && t.duration && (f.continueAt <= 0 || f.continueAt >= t.duration)) { toast(`Continue point must be between 0 and ${Math.floor(t.duration)}s.`); return; }
            const body = { audioId: t.id, taskId: t.taskId, model: modelOf, instrumental: !!f.instrumental, callBackUrl: CALLBACK, ...f };
            const d = await api('/generate/extend', { method: 'POST', body });
            addTask('music', d.taskId, f.title || `${t.title} (Extended)`, { model: modelOf });
            toast('⏩ Extension started!', 'ok'); closeModal(); go('create');
          }, '⏩ Extend');
        setField($('#sub-form'), 'title', `${(t.title || 'Untitled').slice(0, 88)} (Extended)`);
        setField($('#sub-form'), 'style', (t.tags || '').slice(0, 1000));
        break;
      case 'replace':
        subForm(t, '✂️ Replace a section', 'Pick a 10+ second window (max half the song) and rewrite it. The new part blends into the rest.',
          `<div class="row"><label class="field"><span class="label">Start (s)</span><input type="number" data-k="infillStartS" min="0" step="0.01" placeholder="30" /></label>
           <label class="field"><span class="label">End (s)</span><input type="number" data-k="infillEndS" min="0" step="0.01" placeholder="45" /></label></div>` +
          FIELD.title({ required: true }) + FIELD.style({ k: 'tags', label: 'Style tags', required: true }) +
          FIELD.lyrics({ k: 'prompt', label: 'New lyrics for this section', rows: 4, required: true, noHelper: true }) +
          FIELD.lyrics({ k: 'fullLyrics', label: 'Full song lyrics after the change', rows: 7, required: true, noHelper: true }) + FIELD.negativeTags({}),
          async (f) => {
            const miss = ['infillStartS', 'infillEndS', 'title', 'tags', 'prompt', 'fullLyrics'].filter((k) => f[k] == null);
            if (miss.length) { toast('Fill in the time window, title, style, section lyrics and full lyrics.'); return; }
            const len = f.infillEndS - f.infillStartS;
            if (len < 10) { toast('The section must be at least 10 seconds.'); return; }
            if (t.duration && len > t.duration / 2) { toast('The section can be at most half the song.'); return; }
            const d = await api('/generate/replace-section', { method: 'POST', body: { taskId: t.taskId, audioId: t.id, callBackUrl: CALLBACK, ...f } });
            addTask('music', d.taskId, `${f.title} (Edit)`, { model: modelOf });
            toast('✂️ Section rewrite started!', 'ok'); closeModal(); go('create');
          }, '✂️ Replace');
        setField($('#sub-form'), 'title', (t.title || '').slice(0, 80));
        setField($('#sub-form'), 'tags', (t.tags || '').slice(0, 1000));
        setField($('#sub-form'), 'fullLyrics', t.prompt || '');
        break;
      case 'remix':
        closeModal(); go('remix'); setRemix('cover');
        { const u = $('[data-k=uploadUrl]'); const url = $('input[type=url]', u); url.value = t.audio; url.oninput(); }
        toast('Track loaded — choose a new style and create the cover.');
        break;
      case 'remove':
        if (!confirm(`Remove "${t.title}" from your library? (This only affects this browser.)`)) return;
        state.tracks = state.tracks.filter((x) => x.id !== t.id);
        if (state.playing?.id === t.id) { audio.pause(); $('#player').hidden = true; state.playing = null; }
        save(); closeModal(); renderAll();
        break;
    }
  }

  // ---------------------------------------------------------------- library extras
  function initLibrary() {
    $('#lib-search').oninput = renderLibrary;
    $('#lib-lookup').onclick = () => {
      modal(`<h2>Import a task</h2><p class="muted">Paste a task ID from a previous generation (e.g. from another device) to add its tracks here.</p>
        <div class="stack" style="margin-top:14px"><input type="text" id="imp-id" placeholder="Task ID" /><button class="btn btn-primary" id="imp-go">Import</button></div>`);
      $('#imp-id').focus();
      $('#imp-go').onclick = () => submit($('#imp-go'), async () => {
        const id = $('#imp-id').value.trim();
        if (!id) return;
        const d = await api('/generate/record-info', { query: { taskId: id } });
        let model = '';
        try { model = JSON.parse(d.param || '{}').model || ''; } catch {}
        const task = { id, kind: 'music', label: 'Imported', meta: { model } };
        const n = upsertTracks(d?.response?.sunoData, task);
        if (!n && d?.status !== 'SUCCESS') { addTask('music', id, 'Imported task', { model }); toast('Task is still running — tracking it now.'); }
        else toast(n ? `Imported ${n} track${n > 1 ? 's' : ''}.` : 'Those tracks are already in your library.', 'ok');
        save(); closeModal(); renderAll();
      });
    };
  }

  // ---------------------------------------------------------------- boot
  function init() {
    let theme = 'system';
    try { theme = localStorage.getItem('sf.theme') || 'system'; } catch {}
    setTheme(['light', 'dark', 'system'].includes(theme) ? theme : 'system');
    $$('[data-theme-set]').forEach((b) => (b.onclick = () => setTheme(b.dataset.themeSet)));
    $$('.tab').forEach((t) => (t.onclick = () => go(t.dataset.view)));
    $('#credits').onclick = () => { $('#credits-val').textContent = '…'; refreshCredits(); };
    $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal' || e.target.closest('[data-close]')) closeModal(); });
    initGate(); initCreate(); initLyrics(); initRemix(); initSounds(); initLibrary(); initPlayer();

    state.key = loadKey();
    if (state.key) showApp(); else showGate();
    setInterval(renderTasks, 30000); // keep "Xm ago" fresh
  }
  init();
})();
