// Run: node verify.cjs (Playwright must already be installed).
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');

(async () => {
  const out = path.join(__dirname, 'verification');
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 920 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(pathToFileURL(path.join(__dirname, 'index.html')).href);
    await page.screenshot({ path: path.join(out, 'empty.png') });
    // Produce a real local MP4 through Chrome's built-in encoder; no download.
    const sample = await page.evaluate(async () => {
      const mime = ['video/mp4;codecs=avc1.42001E', 'video/mp4'].find(type => MediaRecorder.isTypeSupported(type));
      if (!mime) throw new Error('This Chrome cannot encode the MP4 test fixture');
      const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 360;
      const ctx = canvas.getContext('2d');
      const stream = canvas.captureStream(10);
      const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 150000 });
      const chunks = [];
      recorder.ondataavailable = event => chunks.push(event.data);
      const done = new Promise(resolve => recorder.onstop = resolve);
      let count = 0;
      const paint = () => {
        ctx.fillStyle = '#16352b'; ctx.fillRect(0, 0, 640, 360);
        ctx.fillStyle = '#c3e891'; ctx.font = '28px sans-serif'; ctx.fillText('LOCAL MP4 TEST', 190, 130);
        ctx.fillStyle = 'white'; ctx.font = '20px sans-serif';
        ctx.fillText('Keep this subtitle visible.', 180, 315);
        ctx.fillText('Frame ' + count++, 20, 35);
      };
      paint(); const timer = setInterval(paint, 100);
      recorder.start(); await new Promise(resolve => setTimeout(resolve, 24000));
      recorder.stop(); await done; clearInterval(timer); stream.getTracks().forEach(track => track.stop());
      const blob = new Blob(chunks, { type: 'video/mp4' });
      return await new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.readAsDataURL(blob); });
    });
    const mp4 = path.join(out, 'sample.mp4'); fs.writeFileSync(mp4, Buffer.from(sample, 'base64'));
    await page.locator('#videoFile').setInputFiles(mp4);
    await page.waitForFunction(() => document.querySelector('#video').readyState >= 2);
    const mediaDuration = await page.locator('#video').evaluate(video => video.duration);
    assert(mediaDuration >= 23, 'real MP4 has expected duration');
    const time = () => page.locator('#video').evaluate(video => video.currentTime);
    const settled = () => page.waitForFunction(() => !document.querySelector('#video').seeking);
    async function near(expected) { await settled(); assert(Math.abs(await time() - expected) < .25, `seek expected ${expected}, actual ${await time()}`); }
    await page.keyboard.press('ArrowRight'); await near(10);
    await page.keyboard.press('ArrowLeft'); await near(0);
    await page.locator('#backSeconds').fill('2.5'); await page.locator('#backSeconds').press('Enter');
    await page.locator('#forwardSeconds').fill('3'); await page.locator('#forwardSeconds').press('Enter');
    await page.keyboard.press('ArrowRight'); await near(3);
    await page.keyboard.press('ArrowLeft'); await near(.5);
    assert(await page.locator('#video').evaluate(video => video.paused), 'seeking preserves pause');
    await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await near(9.5);
    for (let n = 0; n < 12; n++) await page.keyboard.press('ArrowLeft'); await near(0);
    for (let n = 0; n < 12; n++) await page.keyboard.press('ArrowRight'); await near(mediaDuration);
    await page.keyboard.press('ArrowLeft'); await near(mediaDuration - 2.5);
    await page.keyboard.press('Space'); await page.waitForTimeout(350);
    assert.equal(await page.locator('#video').evaluate(video => video.paused), false);
    await page.keyboard.press('ArrowLeft'); await settled();
    assert.equal(await page.locator('#video').evaluate(video => video.paused), false, 'seeking preserves playing');
    await page.keyboard.press('Space');
    const subtitle = path.join(out, 'sample.srt');
    fs.writeFileSync(subtitle, '1\n00:00:00,000 --> 00:00:12,000\nKeep this subtitle visible.\n这行字幕也始终可见。\n\n2\n00:00:12,000 --> 00:00:24,000\n<i>Second sentence.</i>\n');
    await page.locator('#subtitleFile').setInputFiles(subtitle);
    await page.waitForFunction(() => !document.querySelector('#subtitleArea').hidden);
    await page.locator('#progress').fill('250'); await settled();
    assert.match(await page.locator('#subtitleText').innerText(), /Keep this subtitle visible/);
    await page.locator('#subtitleOffset').fill('10');
    assert.equal(await page.locator('#subtitleText').innerText(), '');
    await page.locator('#subtitleOffset').fill('0'); await page.locator('#subtitleOffset').press('Enter');
    async function noOverlap() {
      const boxes = await page.evaluate(() => ['stage', 'subtitleArea', 'controls'].map(id => {
        const r = document.getElementById(id).getBoundingClientRect(); return { top: r.top, bottom: r.bottom };
      }));
      assert(boxes[1].top >= boxes[0].bottom - 1 && boxes[2].top >= boxes[1].bottom - 1, 'subtitles and controls are below video');
    }
    await noOverlap(); await page.screenshot({ path: path.join(out, 'playing.png') });
    await page.locator('#fullscreen').click();
    await page.waitForFunction(() => document.fullscreenElement !== null);
    await noOverlap(); await page.screenshot({ path: path.join(out, 'fullscreen.png') });
    await page.locator('#fullscreen').click();
    const vtt = path.join(out, 'sample.vtt');
    fs.writeFileSync(vtt, 'WEBVTT\n\n00:00.000 --> 00:12.000\nVTT &amp; plain text\n');
    await page.locator('#subtitleFile').setInputFiles(vtt);
    await page.waitForFunction(() => document.querySelector('#subtitleText').textContent === 'VTT & plain text');
    await page.reload();
    assert.equal(await page.locator('#backSeconds').inputValue(), '2.5');
    assert.equal(await page.locator('#forwardSeconds').inputValue(), '3');
    // Restore delivery defaults after verifying persistence.
    await page.evaluate(() => localStorage.clear()); await page.reload();
    await page.setViewportSize({ width: 720, height: 760 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal overflow');
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify({ passed: true, duration: mediaDuration, checks: ['real local MP4 decode', 'default 10s seeks', 'live independent decimal steps', 'rapid cumulative seek', 'seek bounds', 'pause/play preserved', 'SRT and VTT', 'subtitle offset', 'controls outside video in normal and fullscreen', 'settings persist', '720px layout', 'no JavaScript errors'] }, null, 2));
    console.log('PASS: all player checks; evidence in ' + out);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
