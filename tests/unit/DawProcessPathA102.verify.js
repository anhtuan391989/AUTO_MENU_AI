// A102 — DAW-PROCESS-PATH-RECOVERY-01.
// LƯU Ý TRUNG THỰC: sandbox Linux không chạy được PowerShell/Win32. Test này gồm (a) kiểm văn bản script PowerShell và (b) MÔ HÌNH thuật toán nhận diện
// (viết lại bằng JS, cùng quy tắc) đưa vào WindowHider thật qua runner giả. KHÔNG chứng minh PowerShell thật trên máy Windows có PID 19308 đọc được đường dẫn.
const WH = require('../../core/integration/WindowHider.js');
const { pidScript, parseInfo, PS_IMG_TYPE } = WH._scriptsForTest;
let pass = 0, fail = 0; const ok = (c, m, x) => { if (c) { pass++; console.log('  OK  ', m); } else { fail++; console.log('  FAIL', m, x === undefined ? '' : JSON.stringify(x)); } };
const EXE = 'C:\\Program Files\\Fender\\Studio Pro 8\\Studio Pro.exe';
const norm = (p) => String(p).replace(/[\\/]+$/, '');
const call = (fn) => new Promise((r) => fn(r));

// ---- Mô hình thuật toán pidScript ----
// world: { cim: 'ok'|'throw', procs: [{id, cimPath, psPath, psExited, apiPath, apiErr}], psAll: true/false (Get-Process liệt kê được?) }
function model(world) {
    let src = 'CIM', qerr = '', list;
    if (world.cim === 'throw') { src = 'PS'; if (world.psAll === false) { src = 'NONE'; qerr = 'ps list failed'; list = []; } else list = world.procs.map((p) => ({ id: p.id, path: p.psPath || '' })); }
    else list = world.procs.map((p) => ({ id: p.id, path: p.cimPath || '' }));
    const match = [], unread = [], other = [], dead = [], tried = [];
    for (const x of list) {
        const pr = world.procs.find((p) => p.id === x.id); let p = x.path ? norm(x.path) : null, how = src, notes = '';
        if (!x.path) notes = src + '=empty';
        if (!p && src !== 'PS') { if (pr.psErr) notes += ',PS=err:' + pr.psErr; else if (pr.psPath) { p = norm(pr.psPath); how = 'PS'; } else notes += ',PS=empty'; if (pr.psExited) { notes += ',EXITED'; dead.push(x.id); } }
        if (!p && !dead.includes(x.id)) { if (pr.apiPath) { p = norm(pr.apiPath); how = 'API'; } else notes += ',API=err' + (pr.apiErr || 5); }
        if (p) { if (p.toLowerCase() === norm(EXE).toLowerCase()) { match.push(x.id); tried.push(x.id + ':OK via ' + how); } else { other.push(p); tried.push(x.id + ':OTHER via ' + how); } }
        else if (dead.includes(x.id)) tried.push(x.id + ':' + notes); else { unread.push(x.id); tried.push(x.id + ':' + notes); }
    }
    const st = src === 'NONE' ? 'ERR' : match.length ? 'OK' : unread.length ? 'UNREADABLE' : other.length ? 'MISMATCH' : 'NOPROC';
    return 'INFO|ST=' + st + '|R=' + match.join(',') + '|U=' + unread.join(',') + '|O=' + [...new Set(other)].join(';;') + '|SRC=' + src + '|T=' + tried.join(';;') + '|ERR=' + qerr;
}
function runnerFor(world, log) {
    return (script, cb) => {
        const info = model(world); log.push(/HW\]::/.test(script) ? 'HW' : 'PROBE');
        if (/\[HW\]::Hide/.test(script)) { if (!/ST=OK/.test(info)) { cb(null, info); return; } cb(null, 'H:' + '1001;F:;A:1001;D:1001/' + (info.match(/R=(\d+)/) || [])[1] + '/H/Studio Pro'); return; }
        cb(null, info);
    };
}
const W = (procs, o = {}) => ({ cim: 'ok', procs, ...o });
const P = (id, o = {}) => ({ id, cimPath: EXE, ...o });

(async () => {
    console.log('== A. Văn bản script PowerShell ==');
    const S = pidScript(EXE);
    ok(/Get-CimInstance -ClassName Win32_Process/.test(S) && /Get-Process -Id \$x\.Id/.test(S) && /QueryFullProcessImageName/.test(PS_IMG_TYPE) && /ImagePath\(\[uint32\]\$x\.Id, \[ref\]\$ec\)/.test(S), 'có đủ 3 nguồn: CIM → Get-Process -Id → QueryFullProcessImageName');
    ok(/0x1000/.test(PS_IMG_TYPE), 'API dùng PROCESS_QUERY_LIMITED_INFORMATION (0x1000)');
    ok(/if \(-not \$p -and \$src -ne "PS"\)/.test(S) && /if \(-not \$p -and \$dead -notcontains/.test(S), 'fallback chạy KHI ĐƯỜNG DẪN RỖNG (không chỉ khi CIM ném exception)');
    ok(/\$p -ieq \$target/.test(S) && !/Name -ieq \$leaf \}\s*\)\s*\$pids/.test(S), 'chỉ nhận khi đường dẫn đầy đủ -ieq đường dẫn đã chọn');
    ok(/\$pids = \[uint32\[\]\]\$match/.test(S) && !/\$pids = \[uint32\[\]\]\$list/.test(S), 'danh sách PID thao tác = chỉ PID đã khớp đường dẫn');
    ok(/HasExited/.test(S) && /\$dead/.test(S), 'tiến trình đã thoát (HasExited) không bị coi là đang chạy');
    ok(/\|T=" \+ \(\$tried -join ";;"\)/.test(S), 'INFO có trường T= (PID + nguồn đã thử)');
    ok(!/\$_\.Name -ieq \$leaf \}\s*\|\s*ForEach-Object \{ \$_\.ProcessId \}/.test(S), 'không có đường nhận theo tên trơn');
    const info = parseInfo('INFO|ST=UNREADABLE|R=|U=19308|O=|SRC=CIM|T=19308:CIM=empty,PS=empty,API=err5|ERR=');
    ok(info.st === 'UNREADABLE' && info.unreadable[0] === 19308 && info.tried[0] === '19308:CIM=empty,PS=empty,API=err5', 'parseInfo đọc được T=', info);
    ok(parseInfo('INFO|ST=UNREADABLE|R=|U=19308|O=|SRC=CIM|ERR=').st === 'UNREADABLE', 'tương thích dòng log cũ (không có T=) — chính là dòng log thật 06/11');

    console.log('== B. 7 tình huống bắt buộc (mô hình + WindowHider thật) ==');
    let log = [], r;
    // 1. CIM đúng
    r = await call((cb) => WH.hide(EXE, cb, runnerFor(W([P(100)]), log = [])));
    ok(r.ok && r.state === 'hidden', '1) CIM trả đường dẫn hợp lệ -> ẩn chạy', r);
    // 2. CIM thành công nhưng ExecutablePath rỗng, và Get-Process/API đều không đọc
    r = await call((cb) => WH.hide(EXE, cb, runnerFor(W([{ id: 19308, cimPath: '', psPath: '', apiPath: '' }]), log = [])));
    ok(!r.ok && r.reason === 'PROCESS_PATH_UNREADABLE' && r.unreadable[0] === 19308 && /19308:CIM=empty,PS=empty,API=err5/.test(r.tried.join()), '2) CIM rỗng + không nguồn nào đọc được -> PROCESS_PATH_UNREADABLE kèm PID + nguồn đã thử', r);
    ok(/const guarded = \(body\) => 'if \(\$st -ne "OK"\) \{ \$info \} else \{ ' \+ body/.test(require('fs').readFileSync(require('path').join(__dirname, '../../core/integration/WindowHider.js'), 'utf8')) && r.handles.length === 0, '   …không có HWND nào bị đụng: thân Hide/Show chỉ chạy khi ST=OK (quy tắc `guarded` trong mã nguồn)');
    // 2b. CIM rỗng nhưng Get-Process đọc được
    r = await call((cb) => WH.hide(EXE, cb, runnerFor(W([{ id: 19308, cimPath: '', psPath: EXE }]), log = [])));
    ok(r.ok, '2b) CIM rỗng nhưng Get-Process đọc được đường dẫn đúng -> nhận diện OK', r);
    // 2c. CIM rỗng, Get-Process bị từ chối, API đọc được (trường hợp nghi ngờ quyền Administrator)
    r = await call((cb) => WH.hide(EXE, cb, runnerFor(W([{ id: 19308, cimPath: '', psErr: 'Access denied', apiPath: EXE }]), log = [])));
    ok(r.ok, '2c) CIM rỗng + Get-Process bị từ chối + QueryFullProcessImageName đọc được -> OK', r);
    // 3. CIM lỗi, Get-Process đọc được
    r = await call((cb) => WH.hide(EXE, cb, runnerFor(W([{ id: 100, psPath: EXE }], { cim: 'throw' }), log = [])));
    ok(r.ok, '3) CIM lỗi nhưng Get-Process đọc được đường dẫn -> OK', r);
    // 4. Cả hai không đọc được
    r = await call((cb) => WH.hide(EXE, cb, runnerFor(W([{ id: 100, psPath: '' }], { cim: 'throw' }), log = [])));
    ok(!r.ok && r.reason === 'PROCESS_PATH_UNREADABLE' && r.src === 'PS' && r.tried.length === 1, '4) CIM lỗi + Get-Process không đọc được -> PROCESS_PATH_UNREADABLE (SRC=PS, có nguồn đã thử)', r);
    // 5. Nhiều PID, chỉ 1 khớp
    r = await call((cb) => WH.probe(EXE, cb, runnerFor(W([P(1, { cimPath: 'D:\\Other\\Studio Pro.exe' }), P(2), { id: 3, cimPath: '' }]), log = [])));
    ok(r.state === 'running' && r.pids.join() === '2' && r.unreadable.join() === '3', '5) nhiều PID cùng tên -> chỉ PID khớp đường dẫn (2) được dùng; PID 3 (không đọc được) KHÔNG bị lẫn vào', r);
    // 6. Cùng tên khác đường dẫn
    r = await call((cb) => WH.hide(EXE, cb, runnerFor(W([P(1, { cimPath: 'D:\\Other\\Studio Pro.exe' })]), log = [])));
    ok(!r.ok && r.reason === 'DAW_AT_DIFFERENT_PATH' && r.others[0] === 'D:\\Other\\Studio Pro.exe', '6) cùng tên khác đường dẫn -> DAW_AT_DIFFERENT_PATH (không ẩn bừa)', r);
    // 7. Không có tiến trình
    r = await call((cb) => WH.hide(EXE, cb, runnerFor(W([]), log = [])));
    ok(!r.ok && r.state === 'not_found' && r.reason === 'PROCESS_NOT_RUNNING', '7) không có tiến trình -> PROCESS_NOT_RUNNING', r);
    // Thêm: lỗi truy vấn, tiến trình đã thoát
    r = await call((cb) => WH.hide(EXE, cb, runnerFor(W([], { cim: 'throw', psAll: false }), log = [])));
    ok(!r.ok && r.reason === 'PROCESS_QUERY_FAILED', '8) cả hai cách liệt kê tiến trình đều lỗi -> PROCESS_QUERY_FAILED', r);
    r = await call((cb) => WH.probe(EXE, cb, runnerFor(W([{ id: 19308, cimPath: '', psExited: true }]), log = [])));
    ok(r.state === 'not_running', '9) tiến trình đã thoát (zombie, HasExited) không bị coi là đang chạy', r);
    r = await call((cb) => WH.probe(EXE, cb, runnerFor(W([{ id: 19308, cimPath: '' }]), log = [])));
    ok(r.state === 'unknown' && r.reason === 'PROCESS_PATH_UNREADABLE' && r.running === null, '10) probe: không đọc được -> unknown (KHÔNG not_running)', r);
    r = await call((cb) => WH.showAny(EXE, cb, runnerFor(W([{ id: 19308, cimPath: '' }]), log = [])));
    ok(!r.ok && r.reason === 'PROCESS_PATH_UNREADABLE', '11) showAny cùng luật nhận diện', r);

    console.log('== C. Lý do chi tiết hiện cho người dùng (PID + nguồn đã thử) ==');
    {
        const { createDawTrayManager } = require('../../app/DawTray.js'); const st = {};
        const fakeFs = { existsSync: () => false, readFileSync: () => '', writeFileSync: () => {}, appendFileSync: () => {}, statSync: () => ({ size: 0 }) };
        const m = createDawTrayManager({ Tray: class { setToolTip() {} setContextMenu() {} on() {} destroy() {} }, Menu: { buildFromTemplate: () => ({}) }, nativeImage: { createFromBuffer: () => ({ isEmpty: () => false }) }, readSettings: () => ({ selectedDAWPath: EXE }), stateFile: 'S.json', fs: fakeFs, windowHider: { ...WH, hide: (e, cb) => WH.hide(e, cb, runnerFor(W([{ id: 19308, cimPath: '' }]), [])), probe: (e, cb) => WH.probe(e, cb, runnerFor(W([{ id: 19308, cimPath: '' }]), [])) }, log: () => {} });
        const h = await call((cb) => m.hide(cb));
        ok(!h.ok && /PID 19308/.test(h.message) && /CIM=empty,PS=empty,API=err5/.test(h.message) && /KHÔNG ẩn theo tên/.test(h.message), 'thông báo Ẩn nêu PID 19308 + nguồn đã thử', h.message);
        const s = await call((cb) => m.statusAsync(cb));
        ok(s.state === 'unknown' && /PID 19308/.test(s.detail), 'trạng thái "CHƯA XÁC MINH" kèm PID + nguồn đã thử', s.detail);
    }
    console.log('\n' + pass + ' PASS / ' + fail + ' FAIL (MÔ HÌNH + kiểm văn bản — chưa phải PowerShell/Windows thật)');
    process.exit(fail ? 1 : 0);
})();
