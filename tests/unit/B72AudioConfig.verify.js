'use strict';
/**
 * B72AudioConfig.verify.js — TASK B72 (gộp B72 + B72.1)
 * Test HÀNH VI THẬT: nạp code thật từ ui/js/*.js, app/*.js vào sandbox `vm` với stub trình duyệt
 * (Audio/setSinkId, navigator.mediaDevices, DOM giả), rồi chạy và kiểm kết quả — không chỉ regex.
 * KHÔNG thay thế kiểm chứng phần cứng thật (xem B72-REPORT.md — HARDWARE VERIFICATION: PENDING).
 * Chạy: node tests/unit/B72AudioConfig.verify.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
function assert(cond, label) {
    if (cond) { pass++; console.log('  OK  ', label); }
    else { fail++; console.error('  FAIL ', label); }
}
const ROOT = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const rendererSrc = read('ui/js/renderer.js');
const setupSrc = read('ui/js/setup.js');
const audioSourceSrc = read('ui/js/audioSource.js');
const appSettingsSrc = read('ui/js/appSettings.js');

// Trích 1 khối theo vị trí đóng ngoặc thật (đếm {}), tránh regex non-greedy cắt sớm ở khối lồng nhau.
function extractBlock(src, startRegex) {
    const m = startRegex.exec(src);
    if (!m) return null;
    let i = src.indexOf('{', m.index + m[0].length - 1);
    let depth = 0;
    for (let j = i; j < src.length; j++) {
        if (src[j] === '{') depth++;
        else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(m.index, j + 1); }
    }
    return null;
}

(async () => {
    /* ---------------------------------------------------------------- */
    console.log('== 1. SoundEffectEngine.setOutputDevice — hành vi THẬT với Audio/setSinkId giả ==');
    {
        const engineSrc = (() => {
            const start = rendererSrc.indexOf('const SoundEffectEngine = (() => {');
            const end = rendererSrc.indexOf('})();', start) + 5;
            return rendererSrc.slice(start, end);
        })();
        const KNOWN = new Set(['spk-A', 'spk-B']);
        const created = [];
        class FakeAudio {
            constructor(src) { this.src = src; this.sinkId = ''; this.volume = 1; created.push(this); }
            addEventListener() {}
            async setSinkId(id) {
                if (id !== '' && !KNOWN.has(id)) { const e = new Error('Requested device not found'); e.name = 'NotFoundError'; throw e; }
                this.sinkId = id;
            }
        }
        const sb = { Audio: FakeAudio, console };
        vm.createContext(sb);
        vm.runInContext(engineSrc + '\nthis.SoundEffectEngine = SoundEffectEngine;', sb);
        const E = sb.SoundEffectEngine;

        assert(created.length === 2, 'Engine tạo đúng 2 audio element (CLAP, LAUGH)');
        let r = await E.setOutputDevice('spk-A');
        assert(r.ok === true && r.actual === 'spk-A' && created.every(a => a.sinkId === 'spk-A'), 'Chọn thiết bị hợp lệ -> cả 2 element nhận sinkId thật, ok:true');
        r = await E.setOutputDevice('spk-GONE');
        assert(r.ok === false && /not found/i.test(r.error), 'Thiết bị không tồn tại -> ok:false kèm lỗi thật (không giả thành công)');
        assert(created.every(a => a.sinkId === 'spk-A'), 'Khi setSinkId thất bại KHÔNG tự rơi về thiết bị khác/mặc định — sink cũ được giữ nguyên');
        r = await E.setOutputDevice('');
        assert(r.ok === true && r.requested === '' && created.every(a => a.sinkId === ''), 'None ("") -> trả về output mặc định OS, ok:true');
        assert(E.getOutputDeviceId() === '', 'getOutputDeviceId() trả sinkId THẬT của element');

        const sb2 = { Audio: class { constructor() { this.sinkId = ''; this.volume = 1; } addEventListener() {} }, console };
        vm.createContext(sb2);
        vm.runInContext(engineSrc + '\nthis.SoundEffectEngine = SoundEffectEngine;', sb2);
        r = await sb2.SoundEffectEngine.setOutputDevice('spk-A');
        assert(r.ok === false && /không được hỗ trợ/.test(r.error), 'Môi trường không có setSinkId -> ok:false + nói rõ lý do, không giả lập');
    }

    /* ---------------------------------------------------------------- */
    console.log('\n== 2. applyAudioOutputSetting — trạng thái báo về Setup phản ánh kết quả THẬT ==');
    {
        const fnSrc = extractBlock(rendererSrc, /async function applyAudioOutputSetting\(\) \{/);
        assert(!!fnSrc, 'Trích được applyAudioOutputSetting() từ renderer.js');
        async function run(savedId, engineResult) {
            const reports = [];
            const sb = {
                console: { warn() {}, log() {}, error() {} },
                getSetting: (k, f) => (k === 'selectedAudioOutputDeviceId' ? savedId : f),
                SoundEffectEngine: { setOutputDevice: async () => engineResult },
                window: { electronAPI: { reportOutputState: (p) => reports.push(p) } },
            };
            vm.createContext(sb);
            vm.runInContext('let __lastKnownOutputDeviceId = null;\n' + fnSrc + '\nthis.applyAudioOutputSetting = applyAudioOutputSetting; this.getLast = () => __lastKnownOutputDeviceId;', sb);
            const payload = await sb.applyAudioOutputSetting();
            return { payload, reports, last: sb.getLast() };
        }
        let o = await run('', { ok: true, requested: '', actual: '' });
        assert(o.payload.state === 'DEFAULT' && o.reports.length === 1, 'None + setSinkId ok -> DEFAULT, báo qua IPC đúng 1 lần');
        o = await run('spk-A', { ok: true, requested: 'spk-A', actual: 'spk-A' });
        assert(o.payload.state === 'APPLIED' && o.last === 'spk-A', 'Đã chọn + sinkId thật khớp -> APPLIED');
        o = await run('spk-A', { ok: true, requested: 'spk-A', actual: 'other' });
        assert(o.payload.state === 'ERROR', 'setSinkId resolve nhưng sinkId thật KHÔNG khớp -> ERROR (không tin setting đã lưu)');
        o = await run('spk-GONE', { ok: false, requested: 'spk-GONE', actual: '', error: 'Requested device not found' });
        assert(o.payload.state === 'ERROR' && /not found/.test(o.payload.error), 'Thiết bị mất -> ERROR kèm lý do thật');
    }

    /* ---------------------------------------------------------------- */
    console.log('\n== 3. Setup: MIC Input / SYSTEM_AUDIO Input / Audio Output ghi ĐÚNG key, độc lập nhau ==');
    {
        function makeEnv(initial) {
            const store = { ...initial };
            const writes = [];
            const handlers = {};
            const els = {};
            const el = (id) => (els[id] = els[id] || { id, value: '', textContent: '', className: '', innerHTML: '', options: [], addEventListener: (ev, fn) => { handlers[id + ':' + ev] = fn; }, appendChild() {} });
            const alerts = [];
            let notified = 0;
            const sb = {
                console: { warn() {}, log() {}, error() {} },
                document: { getElementById: (id) => el(id) },
                getSetting: (k) => store[k] ?? '',
                saveSetting: (k, v) => { store[k] = v; writes.push([k, v]); },
                notifySetupChanged: () => { notified++; },
                alert: (m) => alerts.push(m),
                populateSoundcardOptions: async () => ({ foundInRealList: true }),
                populateOutputOptions: async () => ({ foundInRealList: true }),
                window: { electronAPI: undefined },
            };
            vm.createContext(sb);
            const code = ['function updateMicStatusBadge', 'function initMicSection', 'function updateSystemAudioStatusBadge', 'function initSystemAudioSection', 'function updateOutputStatusBadge', 'function initOutputSection']
                .map((h) => extractBlock(setupSrc, new RegExp(h.replace(/ /g, '\\s+') + '\\('))).join('\n');
            vm.runInContext(code + '\nthis.initMicSection=initMicSection; this.initSystemAudioSection=initSystemAudioSection; this.initOutputSection=initOutputSection;', sb);
            return { sb, els, handlers, writes, store, alerts, notified: () => notified };
        }
        const env = makeEnv({ selectedSoundcardId: 'legacy-mix01', selectedSoundcard: 'Mix 01' });
        env.sb.initMicSection(); env.sb.initSystemAudioSection(); env.sb.initOutputSection();
        await new Promise((r) => setTimeout(r, 0));

        env.els.micSelect.value = 'mic-1';
        env.handlers['btnSelectMic:click']();
        assert(env.writes.length === 1 && env.writes[0][0] === 'selectedMicDeviceId' && env.writes[0][1] === 'mic-1', 'Chọn MIC -> chỉ ghi selectedMicDeviceId="mic-1"');
        assert(env.store.selectedSystemAudioDeviceId === '' || env.store.selectedSystemAudioDeviceId === undefined, 'Chọn MIC KHÔNG đụng selectedSystemAudioDeviceId (không dùng chung/fallback)');
        assert(env.store.selectedSoundcardId === 'legacy-mix01', 'selectedSoundcardId cũ giữ nguyên, không bị ghi đè/chuyển');

        env.els.systemAudioSelect.value = 'sys-9';
        env.handlers['btnSelectSystemAudio:click']();
        assert(env.store.selectedSystemAudioDeviceId === 'sys-9' && env.store.selectedMicDeviceId === 'mic-1', 'Chọn SYSTEM_AUDIO -> ghi key riêng, MIC giữ nguyên "mic-1" (độc lập 2 chiều)');

        env.els.outputSelect.value = 'spk-B';
        env.handlers['btnSelectOutput:click']();
        assert(env.store.selectedAudioOutputDeviceId === 'spk-B' && env.store.selectedMicDeviceId === 'mic-1' && env.store.selectedSystemAudioDeviceId === 'sys-9', 'Chọn Output -> chỉ ghi selectedAudioOutputDeviceId, không đụng MIC/SYSTEM_AUDIO');

        env.els.micSelect.value = '';
        env.handlers['btnSelectMic:click']();
        assert(env.store.selectedMicDeviceId === '' && env.store.selectedSystemAudioDeviceId === 'sys-9', 'MIC chọn None -> lưu "" hợp lệ (không bị chặn), SYSTEM_AUDIO không đổi');
        env.handlers['btnClearSystemAudio:click']();
        assert(env.store.selectedSystemAudioDeviceId === '' && env.store.selectedAudioOutputDeviceId === 'spk-B', 'SYSTEM_AUDIO đặt về None -> "" ; Output không đổi');
        assert(env.notified() >= 5, `Mỗi lần lưu đều gọi notifySetupChanged() để Menu áp dụng (thực tế ${env.notified()} lần)`);
        assert(!env.writes.some(([k]) => k === 'selectedSoundcardId'), 'Không có lần ghi nào vào selectedSoundcardId trong toàn bộ thao tác mới');
    }

    /* ---------------------------------------------------------------- */
    console.log('\n== 4. Reconnect: handler onSetupChanged của Menu — dừng nguồn cũ, không tạo trùng, độc lập ==');
    {
        const handlerSrc = extractBlock(rendererSrc, /window\.electronAPI\?\.onSetupChanged\?\.\(\(\) => \{/);
        assert(!!handlerSrc, 'Trích được handler onSetupChanged từ renderer.js');
        function makeMenu(state) {
            const calls = [];
            const mkSrc = (name) => ({
                stop: () => calls.push(name + '.stop'),
                start: () => { calls.push(name + '.start'); return Promise.resolve(); },
            });
            const sb = {
                console: { log() {}, warn() {}, error() {} },
                calls,
                loadSetup: () => calls.push('loadSetup'),
                updateMainStatus: () => calls.push('updateMainStatus'),
                applyAudioOutputSetting: () => calls.push('applyOutput'),
                getSetting: (k, f) => state.settings[k] ?? f,
                SoundEffectEngine: {},
                AudioSource: { getMicDeviceId: () => state.settings.selectedMicDeviceId || '', getSystemAudioDeviceId: () => state.settings.selectedSystemAudioDeviceId || '' },
                window: { __systemAudioSource: mkSrc('SYS'), electronAPI: { onSetupChanged: (cb) => { sb.__cb = cb; } } },
                __micSource: mkSrc('MIC'),
            };
            vm.createContext(sb);
            vm.runInContext('let __lastKnownMicDeviceId = "mic-old"; let __lastKnownSystemAudioDeviceId = "sys-old"; let __lastKnownOutputDeviceId = "spk-old";\n' + handlerSrc + ');', sb);
            return sb;
        }
        let st = { settings: { selectedMicDeviceId: 'mic-old', selectedSystemAudioDeviceId: 'sys-old', selectedAudioOutputDeviceId: 'spk-old' } };
        let m = makeMenu(st);
        m.__cb();
        assert(!m.calls.some((c) => /\.(stop|start)$/.test(c)) && !m.calls.includes('applyOutput'), 'Không đổi gì -> KHÔNG stop/start nguồn nào, không áp dụng lại output');

        st = { settings: { selectedMicDeviceId: 'mic-NEW', selectedSystemAudioDeviceId: 'sys-old', selectedAudioOutputDeviceId: 'spk-old' } };
        m = makeMenu(st); m.__cb();
        const seq = m.calls.filter((c) => /^(MIC|SYS)\./.test(c));
        assert(seq.join(',') === 'MIC.stop,MIC.start', `Đổi MIC -> MIC stop() RỒI start() đúng 1 lần, SYSTEM_AUDIO không bị đụng (thực tế: ${seq.join(',')})`);
        m.__cb();
        assert(m.calls.filter((c) => c === 'MIC.start').length === 1, 'Gọi lại handler khi id không đổi -> không start() trùng lần 2 (không tạo nguồn trùng)');

        st = { settings: { selectedMicDeviceId: 'mic-old', selectedSystemAudioDeviceId: '', selectedAudioOutputDeviceId: 'spk-old' } };
        m = makeMenu(st); m.__cb();
        assert(m.calls.filter((c) => /^(MIC|SYS)\./.test(c)).join(',') === 'SYS.stop,SYS.start', 'SYSTEM_AUDIO chọn None -> SYS stop() rồi start() (start() sẽ về NO_DEVICE), MIC không đụng');

        st = { settings: { selectedMicDeviceId: 'mic-old', selectedSystemAudioDeviceId: 'sys-old', selectedAudioOutputDeviceId: 'spk-NEW' } };
        m = makeMenu(st); m.__cb();
        assert(m.calls.includes('applyOutput') && !m.calls.some((c) => /^(MIC|SYS)\./.test(c)), 'Đổi Output -> chỉ áp dụng setSinkId, không đụng MIC/SYSTEM_AUDIO');
    }

    /* ---------------------------------------------------------------- */
    console.log('\n== 5. Menu status: updateAudioInterfaceDot đọc AudioSourceState THẬT, không đọc tên đã lưu ==');
    {
        const fnSrc = extractBlock(rendererSrc, /function updateAudioInterfaceDot\(\) \{/);
        assert(!!fnSrc, 'Trích được updateAudioInterfaceDot()');
        const AudioSourceState = { NO_DEVICE: 'NO_DEVICE', STARTING: 'STARTING', RUNNING: 'RUNNING', STOPPING: 'STOPPING', ERROR: 'ERROR' };
        function dot(micState, settings) {
            const out = { status: null, title: null };
            const dotEl = { set title(v) { out.title = v; }, get title() { return out.title; } };
            const sb = {
                AudioSourceState,
                __micSource: micState === undefined ? null : { getState: () => micState },
                getSetting: (k, f) => settings[k] ?? f,
                setStatus: (id, s) => { if (id === 'dot-audio') out.status = s; },
                document: { getElementById: () => dotEl },
            };
            vm.createContext(sb);
            vm.runInContext(fnSrc + '\nthis.f = updateAudioInterfaceDot;', sb);
            sb.f();
            return out;
        }
        assert(dot('RUNNING', {}).status === 'online', 'RUNNING -> online');
        assert(dot('STARTING', {}).status === 'pending', 'STARTING -> pending');
        assert(dot('ERROR', {}).status === 'offline', 'ERROR -> offline');
        const named = dot('NO_DEVICE', { selectedSoundcard: 'Mix 01', selectedSoundcardId: 'x' });
        assert(named.status === 'offline', 'Có selectedSoundcard "Mix 01" đã lưu nhưng mic NO_DEVICE -> vẫn offline (KHÔNG xanh chỉ vì đã lưu tên)');
        assert(dot(undefined, { selectedSoundcard: 'Mix 01' }).status === 'offline', 'Mic chưa khởi tạo (null) + đã lưu tên -> offline');
        assert(/không khả dụng/.test(dot('NO_DEVICE', { selectedMicDeviceId: 'm1' }).title), 'Đã lưu MIC Input nhưng NO_DEVICE -> tooltip "không khả dụng" (khác "chưa chọn")');
        assert(!/không khả dụng/.test(dot('NO_DEVICE', {}).title), 'Chưa từng chọn MIC -> KHÔNG báo "không khả dụng"');
        assert(/mặc định hệ thống/.test(dot('RUNNING', {}).title) && /đã chọn/.test(dot('RUNNING', { selectedMicDeviceId: 'm1' }).title), 'RUNNING phân biệt mic mặc định vs mic đã chọn trong tooltip');
        assert(!/^(?!\s*\/\/).*setStatus\(["']dot-audio["'],\s*soundcard/m.test(rendererSrc), 'Không còn dòng code cũ ghi dot-audio theo tên soundcard đã lưu');
    }

    /* ---------------------------------------------------------------- */
    console.log('\n== 6. AudioSource thật: SYSTEM_AUDIO không fallback MIC; MASTER không giả lập ==');
    {
        let gumCalls = [];
        const store = {};
        const sb = {
            console: { log() {}, warn() {}, error() {}, info() {} },
            performance: { now: () => 1000 },
            getSetting: (k, f) => (store[k] !== undefined && store[k] !== '' ? store[k] : (f ?? '')),
            setSetting: (k, v) => { store[k] = v; },
            navigator: { mediaDevices: { getUserMedia: async (c) => { gumCalls.push(c); throw new Error('no hardware in test'); }, enumerateDevices: async () => [] } },
            setTimeout, clearTimeout,
        };
        sb.window = sb;
        vm.createContext(sb);
        vm.runInContext(audioSourceSrc, sb);
        const AS = sb.AudioSource, ST = sb.AudioSourceState;
        assert(!!AS && !!ST, 'audioSource.js nạp được vào sandbox');

        store.selectedMicDeviceId = 'mic-1'; store.selectedSoundcardId = 'legacy';
        const sys = AS.createSystemAudioSource();
        await sys.start();
        assert(sys.getState() === ST.NO_DEVICE, 'SYSTEM_AUDIO chưa chọn (dù MIC + soundcard cũ đều đã lưu) -> NO_DEVICE');
        assert(gumCalls.length === 0, 'SYSTEM_AUDIO None -> KHÔNG gọi getUserMedia (không mở mic/thiết bị nào thay thế)');
        assert(AS.getSystemAudioDeviceId() === '' && AS.getMicDeviceId() === 'mic-1', 'getSystemAudioDeviceId()="" ; getMicDeviceId()="mic-1" — 2 key hoàn toàn độc lập');

        store.selectedSystemAudioDeviceId = 'sys-9';
        const sys2 = AS.createSystemAudioSource();
        await sys2.start();
        const c = gumCalls[0]?.audio || gumCalls[0];
        assert(gumCalls.length >= 1 && JSON.stringify(gumCalls[0]).includes('sys-9') && !JSON.stringify(gumCalls[0]).includes('mic-1'), 'SYSTEM_AUDIO đã chọn -> getUserMedia với ĐÚNG deviceId sys-9 (không phải mic-1)');
        assert(sys2.getState() === ST.ERROR || sys2.getState() === ST.NO_DEVICE, 'getUserMedia thất bại -> ERROR/NO_DEVICE thật, KHÔNG giả RUNNING');
        sys2.stop();

        const master = AS.createDawMasterSource();
        const levels = [];
        master.onLevel((l) => levels.push(l));
        master.start();
        assert(master.getState() === ST.NO_DEVICE, 'DAW_MASTER = NO_DEVICE (chưa có capture)');
        assert(levels.length === 1 && levels[0].vuPercent === 0 && levels[0].noDevice === true, 'DAW_MASTER chỉ phát level rỗng (vuPercent 0, noDevice:true) — không giả số liệu');
        const masterBlock = extractBlock(rendererSrc, /const masterMeter = document\.getElementById\("vu-master-fill"\)/) || '';
        assert(/vu-bar--nodata/.test(rendererSrc) && /masterMeter\.style\.width = "0%"/.test(rendererSrc), 'renderer.js: MASTER VU luôn 0% + vu-bar--nodata');
    }

    /* ---------------------------------------------------------------- */
    console.log('\n== 7. Persistence: mặc định, thiếu key, key cũ không tự chuyển ==');
    {
        const def = appSettingsSrc.match(/const DEFAULT_APP_SETTINGS = \{[\s\S]*?\n\};/)[0];
        const sb = {}; vm.createContext(sb);
        vm.runInContext(def + '\nthis.D = DEFAULT_APP_SETTINGS;', sb);
        ['selectedMicDeviceId', 'selectedSystemAudioDeviceId', 'selectedAudioOutputDeviceId'].forEach((k) =>
            assert(sb.D[k] === '', `DEFAULT_APP_SETTINGS.${k} === ""`));
        const merged = { ...sb.D, ...{ selectedSoundcardId: 'legacy', selectedSoundcard: 'Mix 01' } };
        assert(merged.selectedSoundcardId === 'legacy' && merged.selectedMicDeviceId === '' && merged.selectedSystemAudioDeviceId === '' && merged.selectedAudioOutputDeviceId === '',
            'File cũ chỉ có selectedSoundcardId -> giữ nguyên, 3 key mới KHÔNG bị tự gán từ nó');
    }

    /* ---------------------------------------------------------------- */
    console.log('\n== 8. IPC: 3 luồng (system-audio / mic / output) relay đúng chiều Menu -> Setup ==');
    {
        const preload = read('app/preload.js'), main = read('app/main.js');
        ['system-audio', 'mic', 'output'].forEach((n) => {
            assert(new RegExp(`ipcRenderer\\.send\\("${n}-state-changed"`).test(preload) && new RegExp(`ipcRenderer\\.invoke\\("get-${n}-state"\\)`).test(preload), `preload.js: kênh ${n}-state-changed + get-${n}-state`);
            assert(new RegExp(`ipcMain\\.on\\("${n}-state-changed"[\\s\\S]{0,200}setupWin\\?\\.webContents\\.send\\("${n}-state-changed"`).test(main) && new RegExp(`ipcMain\\.handle\\("get-${n}-state"`).test(main), `main.js: relay ${n} -> setupWin + handler cache`);
        });
        assert(/lastKnownOutputState = \{ state: "UNKNOWN" \}/.test(main), 'main.js: trạng thái Output khởi tạo "UNKNOWN" (không mặc định báo thành công)');
        assert((rendererSrc.match(/^\s*systemAudio\.onStateChange\(/gm) || []).length === 2, 'renderer.js: số listener systemAudio.onStateChange vẫn đúng 2 (giữ hợp đồng A71/A56)');
    }

    console.log(`\n== KẾT QUẢ: ${pass} PASS, ${fail} FAIL ==`);
    process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error('TEST CRASH', e); process.exit(2); });
