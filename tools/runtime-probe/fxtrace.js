const { _electron } = require('/opt/npm-tools/node_modules/playwright');
const fs = require('fs'); const ROOT = process.env.ROOT || '/home/claude/anhtuan391989/auto_menu_ai'; const S = __dirname;
const TAG = process.argv[2]; const DUR = +(process.argv[3] || 56);
(async () => {
  const UD = S + '/udfx_' + TAG; fs.rmSync(UD, { recursive: true, force: true }); fs.mkdirSync(UD, { recursive: true });
  fs.writeFileSync(UD + '/app-settings.json', JSON.stringify({ selectedSystemAudioDeviceId: 'db1ee112b362623467f47179879626750c8bdca7ae1920758eb5547eee4a6dbb' }));
  const app = await _electron.launch({ executablePath: '/home/claude/anhtuan391989/auto_menu_ai/node_modules/electron/dist/electron', timeout: 60000,
    args: [ROOT, '--no-sandbox', '--disable-gpu', '--user-data-dir=' + UD, '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--use-file-for-fake-audio-capture=' + S + '/' + (process.env.WAV || 'test_sysaudio.wav') + '%noloop', '--autoplay-policy=no-user-gesture-required'] });
  let win = null; for (let i = 0; i < 40 && !win; i++) { win = app.windows().find(w => /index\.html/.test(w.url())); if (!win) await new Promise(r => setTimeout(r, 500)); }
  win.on('console', m => { const t = m.text(); if (/OverconstrainedError|NotAllowed|FX/.test(t)) console.log('[console]', t.slice(0, 220)); }); await win.waitForLoadState('domcontentloaded');
  await win.evaluate(async () => { const d = (await navigator.mediaDevices.enumerateDevices()).find(x => x.kind === 'audioinput' && /Fake Audio Input 1/.test(x.label)); AudioSource.setSystemAudioDeviceId(d.deviceId); });
  await win.click('#currentKey'); await new Promise(r => setTimeout(r, 2500));
  await win.evaluate(() => { window.__trace = []; const t0 = performance.now(); setInterval(() => { const i = window.__fxAutoDebug ? window.__fxAutoDebug() : {}; window.__trace.push({ t: +((performance.now() - t0) / 1000).toFixed(2), fx: document.getElementById('fxBtn').classList.contains('active'), ms: i.musicState, act: i.actionState, db: i.lastDbfs, frames: i.framesSeen, src: i.sourceRunning, lv: window.__aiLastLevel ? +(window.__aiLastLevel.dbfs).toFixed(1) : null, lvf: window.__aiLastLevel && window.__aiLastLevel.dbfsFloat !== undefined ? +(window.__aiLastLevel.dbfsFloat).toFixed(1) : undefined, stats: i.levelStats }); }, 250); });
  if (process.env.CLICK_FX_AT) { await new Promise(r => setTimeout(r, +process.env.CLICK_FX_AT * 1000)); await win.evaluate(() => { window.__clickT = performance.now(); document.getElementById('fxBtn').click(); }); await new Promise(r => setTimeout(r, (DUR - +process.env.CLICK_FX_AT) * 1000)); } else await new Promise(r => setTimeout(r, DUR * 1000));
  const tr = await win.evaluate(() => window.__trace); const clickT = await win.evaluate(() => window.__clickT ? +((window.__clickT) / 1000).toFixed(2) : null); console.log('clickT(ms since page load /1000)', clickT); fs.writeFileSync(S + '/trace_' + TAG + '.json', JSON.stringify(tr));
  await app.close();
  // summary: transitions
  let last = null; for (const r of tr) { const k = r.fx + '|' + r.ms; if (k !== last) { console.log(`t=${r.t}s fx=${r.fx} musicState=${r.ms} level(byte)=${r.lv} level(float)=${r.lvf} frames=${r.frames} src=${r.src}`); last = k; } }
  console.log('samples', tr.length, 'final', JSON.stringify(tr[tr.length - 1]));
})().catch(e => { console.error('ERR', e.message.slice(0, 500)); process.exit(1); });
