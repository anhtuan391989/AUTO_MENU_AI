const { _electron } = require('/opt/npm-tools/node_modules/playwright');
const fs = require('fs'); const ROOT = process.env.ROOT || '/home/claude/anhtuan391989/auto_menu_ai'; const S = __dirname;
const UD = S + '/' + process.argv[2]; const phase = process.argv[3]; const want = process.argv[4] ? JSON.parse(process.argv[4]) : null; const audio = process.argv[5] === 'audio'; const quitMode = process.argv[6] || 'closeBtn';
const readOther = (win) => win.evaluate(() => ({ preset: (document.querySelector('.preset-btn.active')||{}).textContent, key: document.getElementById('currentKey').textContent }));
const read = (win) => win.evaluate(() => ({ music: !document.getElementById('musicBtn').classList.contains('disabled'), mic1: document.getElementById('mic1Btn').classList.contains('active'), mic2: document.getElementById('mic2Btn').classList.contains('active'), fx: document.getElementById('fxBtn').classList.contains('active') }));
(async () => {
  if (phase === 'fresh') { fs.rmSync(UD, { recursive: true, force: true }); fs.mkdirSync(UD, { recursive: true }); }
  const args = [ROOT, '--no-sandbox', '--disable-gpu', '--user-data-dir=' + UD];
  if (audio) args.push('--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--use-file-for-fake-audio-capture=' + S + '/test_sysaudio.wav', '--autoplay-policy=no-user-gesture-required');
  const app = await _electron.launch({ executablePath: ROOT + '/node_modules/electron/dist/electron', timeout: 60000, args });
  let win = null; for (let i = 0; i < 40 && !win; i++) { win = app.windows().find(w => /index\.html/.test(w.url())); if (!win) await new Promise(r => setTimeout(r, 500)); }
  await win.waitForLoadState('domcontentloaded'); await win.waitForTimeout(1500);
  if (audio) await win.evaluate(async () => { const d = (await navigator.mediaDevices.enumerateDevices()).find(x => x.kind === 'audioinput' && /Fake Audio Input 1/.test(x.label)); AudioSource.setSystemAudioDeviceId(d.deviceId); });
  console.log(phase, 'start', JSON.stringify(await read(win)), 'other', JSON.stringify(await readOther(win)));
  if (want && phase === 'fresh') { await win.click('.preset-btn:nth-of-type(3)'); await win.evaluate(() => { const el = document.getElementById('currentKey'); el.textContent = 'D Major'; }); }
  if (want) { const cur = await read(win); for (const [k, id] of [['music', 'musicBtn'], ['mic1', 'mic1Btn'], ['mic2', 'mic2Btn'], ['fx', 'fxBtn']]) if (cur[k] !== want[k]) await win.click('#' + id); await win.waitForTimeout(audio ? 6000 : 500); console.log(phase, 'after clicks', JSON.stringify(await read(win)), 'other', JSON.stringify(await readOther(win))); }
  const saved = JSON.parse(fs.readFileSync(UD + '/app-settings.json', 'utf8')).autoMenuData; console.log(phase, 'file keys', JSON.stringify(saved && Object.keys(saved)), 'button keys present:', JSON.stringify(['musicDisabled','mic1','mic2','fx','fxRequested'].filter(k => saved && k in saved)), 'preset/key in file:', JSON.stringify({ preset: saved && saved.preset, currentKey: saved && saved.currentKey })); console.log(phase, 'fx indicator', JSON.stringify(await win.evaluate(() => { const b = document.getElementById('fxBtn'); return { sync: b.dataset.fxSync, control: b.dataset.fxControl, title: b.title }; })));
  if (quitMode === 'closeBtn') { await win.evaluate(() => document.getElementById('closeBtn').click()); await new Promise(r => setTimeout(r, 1500)); } try { await app.close(); } catch (e) {}
})().catch(e => { console.error('ERR', e.message.slice(0, 400)); process.exit(1); });
