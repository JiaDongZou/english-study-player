/* Offline local video player. No uploads, network calls, or external libraries. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const video = $('video');
  const storageKey = 'jujian-player-settings-v1';
  let videoUrl = null;
  let cues = [];
  let seekTarget = null;
  let lastNotice = 0;
  let subtitleLoadId = 0;
  const defaults = { backSeconds: 10, forwardSeconds: 10, subtitleOffset: 0, subtitleSize: '26', speed: '1', volume: 1 };
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(storageKey) || '{}') || {}; } catch {}
  for (const [id, value] of Object.entries(defaults)) {
    if (saved[id] != null && Number.isFinite(Number(saved[id]))) $(id).value = saved[id];
    else $(id).value = value;
  }
  function seconds(id) {
    const n = Number($(id).value);
    return Number.isFinite(n) && n >= 0.1 ? Math.min(n, 3600) : 10;
  }
  function offset() { return Math.max(-3600, Math.min(3600, Number($('subtitleOffset').value) || 0)); }
  function persist() {
    const values = Object.fromEntries(Object.keys(defaults).map(id => [id, $(id).value]));
    try { localStorage.setItem(storageKey, JSON.stringify(values)); } catch {}
  }
  function updateSettings() {
    $('backLabel').textContent = seconds('backSeconds');
    $('forwardLabel').textContent = seconds('forwardSeconds');
    video.volume = Math.max(0, Math.min(1, Number($('volume').value) || 0));
    video.playbackRate = Number($('speed').value) || 1;
    $('subtitleText').style.fontSize = `${Number($('subtitleSize').value) || 26}px`;
    updateSubtitles();
    persist();
  }
  Object.keys(defaults).forEach(id => {
    $(id).addEventListener('input', updateSettings);
    $(id).addEventListener('change', () => {
      if (id === 'backSeconds' || id === 'forwardSeconds') $(id).value = seconds(id);
      if (id === 'subtitleOffset') $(id).value = offset();
      updateSettings();
    });
  });
  function formatTime(t) {
    t = Number.isFinite(t) ? Math.max(0, Math.floor(t)) : 0;
    const h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = t % 60;
    return (h ? `${h}:` : '') + `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  function notice(message) { $('status').textContent = message; lastNotice = Date.now(); }
  function ready() { return video.readyState >= 1 && Number.isFinite(video.duration) && video.duration > 0; }
  function updateSubtitles() {
    const t = video.currentTime - offset();
    const text = cues.filter(c => t >= c.start && t < c.end).map(c => c.text).join('\n');
    if ($('subtitleText').textContent !== text) $('subtitleText').textContent = text;
  }
  function updateProgress() {
    $('currentTime').textContent = formatTime(video.currentTime);
    $('duration').textContent = formatTime(video.duration);
    $('progress').value = ready() ? video.currentTime / video.duration * 1000 : 0;
    updateSubtitles();
    if (Date.now() - lastNotice > 2200 && ready()) $('status').textContent = video.paused ? '已暂停' : '正在播放';
  }
  function setPosition(t) {
    if (!ready()) return;
    seekTarget = Math.max(0, Math.min(video.duration, t));
    video.currentTime = seekTarget;
    updateProgress();
  }
  function seek(direction) {
    if (!ready()) return;
    const amount = seconds(direction < 0 ? 'backSeconds' : 'forwardSeconds');
    // Keep repeated key presses cumulative while the previous seek is still pending.
    setPosition((seekTarget ?? video.currentTime) + direction * amount);
    notice(`${direction < 0 ? '快退' : '快进'} ${amount} 秒`);
  }
  video.addEventListener('seeked', () => { seekTarget = null; updateProgress(); });
  video.addEventListener('timeupdate', updateProgress);
  video.addEventListener('loadedmetadata', () => {
    $('progress').disabled = false;
    ['play', 'back', 'forward'].forEach(id => $(id).disabled = false);
    updateSettings(); updateProgress(); notice('视频已就绪');
  });
  function updatePlayButton() {
    $('play').textContent = video.paused ? '播放' : '暂停';
    $('play').setAttribute('aria-label', video.paused ? '播放' : '暂停');
  }
  ['play', 'pause', 'ended'].forEach(event => video.addEventListener(event, () => { updatePlayButton(); updateProgress(); }));
  video.addEventListener('error', () => {
    ['play', 'back', 'forward', 'progress'].forEach(id => $(id).disabled = true);
    notice('无法播放此编码，请尝试 H.264 / AAC 的 MP4');
  });
  async function togglePlay() {
    if (!ready()) return;
    if (video.paused) { try { await video.play(); } catch { notice('播放失败，请检查视频编码'); } }
    else video.pause();
  }
  $('play').addEventListener('click', togglePlay);
  video.addEventListener('click', togglePlay);
  $('back').addEventListener('click', () => seek(-1));
  $('forward').addEventListener('click', () => seek(1));
  $('progress').addEventListener('input', () => setPosition(Number($('progress').value) / 1000 * video.duration));
  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await $('player').requestFullscreen();
    } catch { notice('当前浏览器不支持全屏，请在 Edge / Chrome 打开'); }
  }
  $('fullscreen').addEventListener('click', fullscreen);
  document.addEventListener('fullscreenchange', () => $('fullscreen').textContent = document.fullscreenElement ? '退出全屏' : '全屏');
  document.addEventListener('keydown', event => {
    if (event.ctrlKey || event.altKey || event.metaKey || event.isComposing) return;
    const target = event.target;
    const editing = target instanceof HTMLElement && (target.matches('input:not([type=range]), select, textarea') || target.isContentEditable);
    if (editing) { if (event.key === 'Enter') { target.blur(); video.focus(); } return; }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); seek(event.key === 'ArrowLeft' ? -1 : 1); }
    else if (event.code === 'Space') { event.preventDefault(); if (!event.repeat) togglePlay(); }
    else if (event.key.toLowerCase() === 'f' && !event.repeat) { event.preventDefault(); fullscreen(); }
  });
  function openVideo(file) {
    if (!file) return;
    video.pause();
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    seekTarget = null;
    cues = []; subtitleLoadId++;
    $('subtitleArea').hidden = true; $('subtitleText').textContent = '';
    ['play', 'back', 'forward', 'progress'].forEach(id => $(id).disabled = true);
    $('empty').hidden = true;
    $('filename').textContent = file.name;
    videoUrl = URL.createObjectURL(file);
    video.src = videoUrl; video.load();
    notice('正在读取视频…'); updateProgress();
    video.focus();
  }
  $('openVideo').addEventListener('click', () => $('videoFile').click());
  $('videoFile').addEventListener('change', event => { openVideo(event.target.files[0]); event.target.value = ''; });
  $('openSubtitle').addEventListener('click', () => $('subtitleFile').click());
  function timestamp(raw) {
    const parts = raw.trim().replace(',', '.').split(':').map(Number);
    if ((parts.length !== 2 && parts.length !== 3) || parts.some(n => !Number.isFinite(n) || n < 0)) return NaN;
    return parts.reduce((total, part) => total * 60 + part, 0);
  }
  function parseSubtitles(raw) {
    const blocks = raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim().split(/\n[ \t]*\n/);
    return blocks.flatMap(block => {
      const lines = block.split('\n');
      if (/^(NOTE|STYLE|REGION)(?:\s|$)/.test(lines[0])) return [];
      const index = lines.findIndex(line => line.includes('-->'));
      if (index < 0) return [];
      const match = lines[index].match(/^\s*([\d:.,]+)\s*-->\s*([\d:.,]+)/);
      if (!match) return [];
      const start = timestamp(match[1]), end = timestamp(match[2]);
      const text = lines.slice(index + 1).join('\n').replace(/<[^>]*>/g, '').replace(/\{\\[^}]*\}/g, '')
        .replace(/&(amp|lt|gt|nbsp|quot|apos);/g, (_, entity) => ({amp:'&',lt:'<',gt:'>',nbsp:' ',quot:'"',apos:"'"})[entity]);
      return Number.isFinite(start) && end > start && text ? [{ start, end, text }] : [];
    }).sort((a, b) => a.start - b.start);
  }
  async function openSubtitle(file) {
    if (!file) return;
    const loadId = ++subtitleLoadId;
    try {
      const parsed = parseSubtitles(await file.text());
      if (loadId !== subtitleLoadId) return;
      if (!parsed.length) { notice('未找到有效字幕，请使用 UTF-8 的 SRT / VTT'); return; }
      cues = parsed; $('subtitleArea').hidden = false;
      updateSubtitles(); notice(`已加载 ${parsed.length} 条字幕`);
    } catch { notice('字幕读取失败，请重新选择文件'); }
  }
  $('subtitleFile').addEventListener('change', event => { openSubtitle(event.target.files[0]); event.target.value = ''; });
  document.addEventListener('dragover', event => { event.preventDefault(); $('stage').classList.add('dragging'); });
  document.addEventListener('dragleave', event => { if (!event.relatedTarget) $('stage').classList.remove('dragging'); });
  document.addEventListener('drop', async event => {
    event.preventDefault(); $('stage').classList.remove('dragging');
    const files = [...event.dataTransfer.files];
    const movie = files.find(file => /\.(mp4|m4v|mov|webm|ogv)$/i.test(file.name) || file.type.startsWith('video/'));
    const subtitle = files.find(file => /\.(srt|vtt)$/i.test(file.name));
    if (movie) openVideo(movie);
    if (subtitle) await openSubtitle(subtitle);
    if (!movie && !subtitle) notice('请拖入视频或 SRT / VTT 字幕文件');
  });
  window.addEventListener('beforeunload', () => { if (videoUrl) URL.revokeObjectURL(videoUrl); });
  updateSettings();
})();
