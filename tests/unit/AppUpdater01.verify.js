// APP-UPDATE-01 — chạy git THẬT trên repo tạm (remote bare + 2 clone). Không chạm mạng/GitHub.
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const { createAppUpdater, realExec } = require('../../app/AppUpdater.js');
let pass = 0, fail = 0; const ok = (c, m, x) => { if (c) { pass++; console.log('  OK  ', m); } else { fail++; console.log('  FAIL', m, x === undefined ? '' : JSON.stringify(x)); } };
const rd = (p) => fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8');
const sh = (cwd, c) => cp.execSync(c, { cwd, stdio: 'pipe', env: Object.assign({}, process.env, { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' }) }).toString();

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'upd-'));
  const remote = path.join(tmp, 'remote.git'), a = path.join(tmp, 'A'), b = path.join(tmp, 'B');
  sh(tmp, 'git init --bare -b main remote.git');
  sh(tmp, 'git clone remote.git A'); sh(a, 'git checkout -b main');
  fs.writeFileSync(path.join(a, 'package.json'), '{"version":"1.2.3"}'); fs.writeFileSync(path.join(a, 'x.txt'), '1');
  sh(a, 'git add . && git commit -m c1 && git push -u origin main');
  sh(tmp, 'git clone remote.git B');
  const U = createAppUpdater({ rootDir: a, exec: realExec });

  let v = await U.getVersion(); ok(v.ok && v.version === '1.2.3' && v.isGit && /^[0-9a-f]{7,}$/.test(v.commit), 'getVersion: đọc version + commit thật', v);
  let c = await U.check(); ok(c.ok && c.available === false && c.behind === 0, 'check: chưa có bản mới', c);
  let ap = await U.apply(); ok(ap.ok && ap.updated === false, 'apply: khi đã mới nhất -> updated=false', ap);

  fs.writeFileSync(path.join(b, 'x.txt'), '2'); sh(b, 'git add . && git commit -m c2 && git push');
  c = await U.check(); ok(c.ok && c.available && c.behind === 1 && !c.diverged, 'check: phát hiện 1 bản mới', c);
  ap = await U.apply(); ok(ap.ok && ap.updated && !ap.needInstall && fs.readFileSync(path.join(a, 'x.txt'), 'utf8') === '2', 'apply: kéo bản mới, file được cập nhật, không cần npm install', ap);

  fs.writeFileSync(path.join(b, 'package.json'), '{"version":"1.2.4"}'); sh(b, 'git add . && git commit -m c3 && git push');
  ap = await U.apply(); ok(ap.ok && ap.updated && ap.needInstall === false, 'apply: chỉ đổi số version -> KHÔNG cần npm install', ap);
  fs.writeFileSync(path.join(b, 'package.json'), '{"version":"1.2.5","dependencies":{"easymidi":"^3.2.0"}}'); sh(b, 'git add . && git commit -m c3b && git push');
  ap = await U.apply(); ok(ap.ok && ap.updated && ap.needInstall === true, 'apply: dependencies đổi -> needInstall=true', ap);

  // xung đột: sửa x.txt cục bộ (chưa commit) và remote cũng sửa x.txt -> git phải từ chối, file local còn nguyên
  fs.writeFileSync(path.join(b, 'x.txt'), '3'); sh(b, 'git add . && git commit -m c4 && git push');
  fs.writeFileSync(path.join(a, 'x.txt'), 'LOCAL-EDIT');
  ap = await U.apply(); ok(!ap.ok && ap.reason === 'PULL_FAILED' && fs.readFileSync(path.join(a, 'x.txt'), 'utf8') === 'LOCAL-EDIT', 'apply: xung đột -> từ chối, KHÔNG ghi đè file local', ap);
  sh(a, 'git checkout -- x.txt');

  // phân kỳ: A có commit chưa đẩy, remote có commit mới -> check báo diverged, apply (ff-only) từ chối
  fs.writeFileSync(path.join(a, 'y.txt'), 'y'); sh(a, 'git add . && git commit -m local');
  c = await U.check(); ok(c.ok && c.available && c.diverged, 'check: báo diverged khi có commit cục bộ chưa đẩy', c);
  ap = await U.apply(); ok(!ap.ok && ap.reason === 'PULL_FAILED' && fs.existsSync(path.join(a, 'y.txt')), 'apply: diverged -> từ chối, commit cục bộ còn nguyên', ap);

  // không phải git repo / thiếu mạng / git lỗi
  const plain = fs.mkdtempSync(path.join(os.tmpdir(), 'nogit-'));
  const U2 = createAppUpdater({ rootDir: plain, exec: realExec });
  ok((await U2.check()).reason === 'NOT_GIT' && (await U2.apply()).reason === 'NOT_GIT', 'không phải git repo -> NOT_GIT, không chạy git');
  const U3 = createAppUpdater({ rootDir: a, exec: async () => ({ code: 128, stdout: '', stderr: 'fatal: unable to access' }) });
  ok((await U3.check()).reason === 'FETCH_FAILED', 'mất mạng -> FETCH_FAILED, không throw');
  const U4 = createAppUpdater({ rootDir: a, exec: async () => ({ code: 127, stdout: '', stderr: '', error: 'git không có trong PATH' }) });
  ok((await U4.apply()).reason === 'GIT_MISSING', 'thiếu git -> GIT_MISSING');
  let calls = 0; const U5 = createAppUpdater({ rootDir: a, exec: (cmd, args) => { calls++; return new Promise((r) => setTimeout(() => r({ code: 0, stdout: '0', stderr: '' }), 30)); } });
  const [r1, r2] = await Promise.all([U5.check(), U5.check()]); ok((r1.reason === 'BUSY') !== (r2.reason === 'BUSY'), 'chống chạy chồng: lần gọi thứ 2 đồng thời -> BUSY');

  // luôn chỉ gọi git với args hằng số, không qua shell
  const seen = []; const U6 = createAppUpdater({ rootDir: a, exec: async (cmd, args) => { seen.push([cmd, ...args].join(' ')); return { code: 0, stdout: '0', stderr: '' }; } });
  await U6.check(); ok(seen.every((s) => s.startsWith('git ')) && seen.some((s) => s === 'git fetch origin main'), 'check: chỉ gọi git với tham số cố định', seen);

  // nối dây
  const main = rd('app/main.js'), pre = rd('app/preload.js'), html = rd('ui/setup.html'), ui = rd('ui/js/setupVersion.js');
  for (const ch of ['app-version', 'app-update-check', 'app-update-apply', 'app-relaunch']) ok(main.includes('ipcMain.handle("' + ch + '"') && pre.includes('ipcRenderer.invoke("' + ch + '")'), 'IPC ' + ch + ' có ở main + preload');
  for (const id of ['appVersionText', 'btnCheckUpdate', 'btnApplyUpdate', 'btnRelaunchApp', 'appUpdateMessage']) ok(html.includes('id="' + id + '"') && ui.includes(id), 'UI có ' + id);
  // LICENSE-01: ô License đã có hệ thống thật (trước đây ghi "Sắp ra mắt") — chỉ còn kiểm tra setup.html vẫn nạp setupVersion.js và ô License vẫn nằm đúng chỗ.
  ok(html.includes('js/setupVersion.js') && html.includes('id="licenseBox"') && /License \/ kích hoạt<\/b><span id="licenseSummary"/.test(html) && html.includes('js/setupLicense.js'), 'setup.html nạp setupVersion.js; ô License vẫn ở dưới Cập nhật và nạp setupLicense.js');

  console.log('\nAppUpdater01: ' + pass + ' đạt, ' + fail + ' lỗi'); process.exit(fail ? 1 : 0);
})();
