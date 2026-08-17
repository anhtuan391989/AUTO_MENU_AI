/**
 * ClapLaughAudio.verify.js — TASK A20
 * ---------------------------------------------------------------------------
 * Trích xuất VERBATIM đúng 3 khối code thật từ renderer.js:
 *   1. SoundEffectEngine (Internal Audio Backend, IIFE đầu file).
 *   2. Wiring clapPlayBtn/laughPlayBtn (PRESET_SOUND_BTN_TO_ACTION + onChange + click).
 *   3. dispatchKnobVolume() (để xác nhận clapKnob/laughKnob nối tới SoundEffectEngine).
 *
 * Chạy trong 1 vm sandbox với FakeAudio (mock HTMLAudioElement) — không cần Electron/
 * trình duyệt thật. Không phát âm thanh thật, chỉ xác nhận đúng hành vi/state machine.
 *
 * Chạy: node tests/unit/ClapLaughAudio.verify.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
function assert(cond, label) {
    if (cond) { pass++; console.log('  OK  ', label); }
    else { fail++; console.error('  FAIL ', label); }
}

const rendererPath = path.join(__dirname, '..', '..', 'ui', 'js', 'renderer.js');
const source = fs.readFileSync(rendererPath, 'utf8');

function extract(startMarker, endMarker, label) {
    const start = source.indexOf(startMarker);
    if (start === -1) throw new Error(`Không tìm thấy điểm bắt đầu cho ${label}: "${startMarker}"`);
    const endMarkerPos = source.indexOf(endMarker, start);
    if (endMarkerPos === -1) throw new Error(`Không tìm thấy điểm kết thúc cho ${label}: "${endMarker}"`);
    const end = endMarkerPos + endMarker.length;
    return source.slice(start, end);
}

const engineBlock = extract(
    'const SoundEffectEngine = (() => {',
    'return { toggle, setVolume, isPlaying, onChange, SOUND_SOURCES };\n\n})();',
    'SoundEffectEngine'
);

// Lấy trọn khối từ khai báo PRESET_SOUND_BTN_TO_ACTION tới hết thân forEach (tìm '});'
// đầu tiên SAU điểm bắt đầu forEach — an toàn vì thân hàm này không có '});' nào khác.
const buttonBlockStart = source.indexOf('const PRESET_SOUND_BTN_TO_ACTION = { clapPlayBtn: "CLAP", laughPlayBtn: "LAUGH" };');
if (buttonBlockStart === -1) throw new Error('Không tìm thấy PRESET_SOUND_BTN_TO_ACTION trong renderer.js');
const forEachStart = source.indexOf('["clapPlayBtn", "laughPlayBtn"].forEach(id => {', buttonBlockStart);
if (forEachStart === -1) throw new Error('Không tìm thấy forEach clapPlayBtn/laughPlayBtn trong renderer.js');
const forEachEnd = source.indexOf('});\n});', forEachStart) + '});\n});'.length;
const fullButtonBlock = source.slice(buttonBlockStart, forEachEnd);

const dispatchKnobVolumeBlock = extract(
    'function dispatchKnobVolume(knobId, value) {',
    'window.ActionRegistry.executeAction(window.ActionRegistry.ACTIONS[actionName], { reason: "knob", value })\n            .catch((err) => console.error(`[KnobControl] ${actionName} lỗi:`, err));\n    }',
    'dispatchKnobVolume'
);

// --- FakeAudio: mock tối thiểu cho HTMLAudioElement, đủ để test state machine ---
class FakeAudio {
    constructor(src) {
        this.src = src;
        this.loop = true; // mặc định KHÁC false trước, để test thực sự xác nhận code có set loop=false
        this.volume = 1;
        this.currentTime = 0;
        this._playing = false;
        this._handlers = {};
        this.playCallCount = 0;
        this.pauseCallCount = 0;
    }
    addEventListener(evt, fn) { (this._handlers[evt] = this._handlers[evt] || []).push(fn); }
    dispatch(evt) { (this._handlers[evt] || []).forEach((fn) => fn()); }
    play() { this._playing = true; this.playCallCount++; return Promise.resolve(); }
    pause() { this._playing = false; this.pauseCallCount++; }
}

function buildSandbox() {
    const audioInstances = {}; // src -> FakeAudio
    const btnElements = {};

    class FakeBtn {
        constructor(id) {
            this.id = id;
            this._handlers = {};
            this._active = false;
            this.classList = {
                toggle: (cls, force) => {
                    if (cls !== 'active') return;
                    this._active = force === undefined ? !this._active : !!force;
                }
            };
        }
        addEventListener(evt, fn) { (this._handlers[evt] = this._handlers[evt] || []).push(fn); }
        click() { (this._handlers.click || []).forEach((fn) => fn()); }
        get isActive() { return this._active; }
    }
    btnElements.clapPlayBtn = new FakeBtn('clapPlayBtn');
    btnElements.laughPlayBtn = new FakeBtn('laughPlayBtn');

    const actionCalls = [];
    const sandbox = {
        console,
        Audio: function (src) {
            const a = new FakeAudio(src);
            audioInstances[src] = a;
            return a;
        },
        document: {
            getElementById: (id) => btnElements[id] || null
        },
        window: {
            ActionRegistry: {
                ACTIONS: { CLAP: 'CLAP', LAUGH: 'LAUGH' },
                executeAction: (action, ctx) => { actionCalls.push({ action, ctx }); return Promise.resolve({ ok: true }); }
            }
        }
    };
    vm.createContext(sandbox);
    vm.runInContext(engineBlock, sandbox);
    // `const SoundEffectEngine = ...` ở script scope KHÔNG tự thành property của global
    // object (đúng spec ECMAScript) — gán tường minh để test bên ngoài vm context truy cập
    // được (chỉ phục vụ test, không thay đổi hành vi thật của renderer.js).
    vm.runInContext('globalThis.SoundEffectEngine = SoundEffectEngine;', sandbox);
    vm.runInContext(fullButtonBlock, sandbox);

    return { sandbox, audioInstances, btnElements, actionCalls };
}

console.log('== Clap: click lần 1 -> playback bắt đầu, đúng source, không loop ==');
{
    const { sandbox, audioInstances, btnElements } = buildSandbox();
    btnElements.clapPlayBtn.click();
    const clapAudio = audioInstances['assets/sounds/Vo-Tay.MP3'];
    assert(!!clapAudio, 'FakeAudio được tạo với đúng src assets/sounds/Vo-Tay.MP3');
    assert(clapAudio.playCallCount === 1, `play() được gọi đúng 1 lần (thực tế: ${clapAudio.playCallCount})`);
    assert(clapAudio.loop === false, `loop=false (thực tế: ${clapAudio.loop})`);
    assert(btnElements.clapPlayBtn.isActive === true, 'UI clapPlayBtn chuyển sang active (PLAYING)');
    assert(sandbox.SoundEffectEngine.isPlaying('CLAP') === true, 'SoundEffectEngine báo CLAP đang playing');
}

console.log('\n== Clap: click lần 2 (đang PLAYING) -> dừng, reset position về 0, UI về IDLE ==');
{
    const { sandbox, audioInstances, btnElements } = buildSandbox();
    btnElements.clapPlayBtn.click(); // IDLE -> PLAYING
    const clapAudio = audioInstances['assets/sounds/Vo-Tay.MP3'];
    clapAudio.currentTime = 12.5; // giả lập đang phát dở
    btnElements.clapPlayBtn.click(); // PLAYING -> STOP -> IDLE
    assert(clapAudio.pauseCallCount === 1, `pause() được gọi đúng 1 lần (thực tế: ${clapAudio.pauseCallCount})`);
    assert(clapAudio.currentTime === 0, `currentTime reset về 0 (thực tế: ${clapAudio.currentTime})`);
    assert(btnElements.clapPlayBtn.isActive === false, 'UI clapPlayBtn trở về IDLE sau STOP');
    assert(sandbox.SoundEffectEngine.isPlaying('CLAP') === false, 'SoundEffectEngine báo CLAP đã dừng');
}

console.log('\n== Clap: event "ended" (tự chạy hết) -> UI tự về IDLE, reset position, không cần click ==');
{
    const { sandbox, audioInstances, btnElements } = buildSandbox();
    btnElements.clapPlayBtn.click(); // IDLE -> PLAYING
    const clapAudio = audioInstances['assets/sounds/Vo-Tay.MP3'];
    clapAudio.currentTime = 30; // giả lập đã phát hết bài (30s)
    clapAudio.dispatch('ended');
    assert(clapAudio.currentTime === 0, `currentTime reset về 0 sau ended (thực tế: ${clapAudio.currentTime})`);
    assert(btnElements.clapPlayBtn.isActive === false, 'UI clapPlayBtn tự về IDLE sau ended (không cần click)');
    assert(sandbox.SoundEffectEngine.isPlaying('CLAP') === false, 'SoundEffectEngine báo CLAP đã idle sau ended');
}

console.log('\n== Clap: sau ended, bấm lại -> phát lại từ đầu ==');
{
    const { audioInstances, btnElements } = buildSandbox();
    btnElements.clapPlayBtn.click();
    const clapAudio = audioInstances['assets/sounds/Vo-Tay.MP3'];
    clapAudio.currentTime = 30;
    clapAudio.dispatch('ended');
    btnElements.clapPlayBtn.click(); // bấm lại
    assert(clapAudio.currentTime === 0, `currentTime = 0 khi phát lại từ đầu (thực tế: ${clapAudio.currentTime})`);
    assert(clapAudio.playCallCount === 2, `play() gọi đúng 2 lần tổng cộng (thực tế: ${clapAudio.playCallCount})`);
    assert(btnElements.clapPlayBtn.isActive === true, 'UI clapPlayBtn active lại sau khi phát lại');
}

console.log('\n== Clap: volume thay đổi được qua SoundEffectEngine.setVolume ==');
{
    const { sandbox, audioInstances } = buildSandbox();
    sandbox.SoundEffectEngine.setVolume('CLAP', 77);
    const clapAudio = audioInstances['assets/sounds/Vo-Tay.MP3'];
    assert(Math.abs(clapAudio.volume - 0.77) < 1e-9, `volume 77 -> 0.77 (thực tế: ${clapAudio.volume})`);
}

console.log('\n== Laugh: click lần 1 -> playback bắt đầu, đúng source, không loop ==');
{
    const { audioInstances, btnElements } = buildSandbox();
    btnElements.laughPlayBtn.click();
    const laughAudio = audioInstances['assets/sounds/Cuoi-Deu.mp3'];
    assert(!!laughAudio, 'FakeAudio được tạo với đúng src assets/sounds/Cuoi-Deu.mp3');
    assert(laughAudio.playCallCount === 1, `play() được gọi đúng 1 lần (thực tế: ${laughAudio.playCallCount})`);
    assert(laughAudio.loop === false, `loop=false (thực tế: ${laughAudio.loop})`);
    assert(btnElements.laughPlayBtn.isActive === true, 'UI laughPlayBtn chuyển sang active (PLAYING)');
}

console.log('\n== Laugh: click lần 2 -> dừng, reset position về 0 ==');
{
    const { audioInstances, btnElements } = buildSandbox();
    btnElements.laughPlayBtn.click();
    const laughAudio = audioInstances['assets/sounds/Cuoi-Deu.mp3'];
    laughAudio.currentTime = 5;
    btnElements.laughPlayBtn.click();
    assert(laughAudio.pauseCallCount === 1, `pause() gọi đúng 1 lần (thực tế: ${laughAudio.pauseCallCount})`);
    assert(laughAudio.currentTime === 0, `currentTime reset về 0 (thực tế: ${laughAudio.currentTime})`);
    assert(btnElements.laughPlayBtn.isActive === false, 'UI laughPlayBtn về IDLE sau STOP');
}

console.log('\n== Laugh: "ended" -> UI tự về IDLE ==');
{
    const { audioInstances, btnElements } = buildSandbox();
    btnElements.laughPlayBtn.click();
    const laughAudio = audioInstances['assets/sounds/Cuoi-Deu.mp3'];
    laughAudio.dispatch('ended');
    assert(btnElements.laughPlayBtn.isActive === false, 'UI laughPlayBtn tự về IDLE sau ended');
}

console.log('\n== Laugh: bấm lại sau ended -> phát từ đầu ==');
{
    const { audioInstances, btnElements } = buildSandbox();
    btnElements.laughPlayBtn.click();
    const laughAudio = audioInstances['assets/sounds/Cuoi-Deu.mp3'];
    laughAudio.dispatch('ended');
    btnElements.laughPlayBtn.click();
    assert(laughAudio.playCallCount === 2, `play() gọi đúng 2 lần tổng cộng (thực tế: ${laughAudio.playCallCount})`);
    assert(laughAudio.currentTime === 0, `currentTime = 0 khi phát lại (thực tế: ${laughAudio.currentTime})`);
}

console.log('\n== Laugh: volume thay đổi được qua SoundEffectEngine.setVolume ==');
{
    const { sandbox, audioInstances } = buildSandbox();
    sandbox.SoundEffectEngine.setVolume('LAUGH', 15);
    const laughAudio = audioInstances['assets/sounds/Cuoi-Deu.mp3'];
    assert(Math.abs(laughAudio.volume - 0.15) < 1e-9, `volume 15 -> 0.15 (thực tế: ${laughAudio.volume})`);
}

console.log('\n== Isolation: Clap không kích hoạt Laugh, Laugh không kích hoạt Clap ==');
{
    const { audioInstances, btnElements } = buildSandbox();
    btnElements.clapPlayBtn.click();
    const clapAudio = audioInstances['assets/sounds/Vo-Tay.MP3'];
    const laughAudio = audioInstances['assets/sounds/Cuoi-Deu.mp3'];
    assert(clapAudio.playCallCount === 1, 'Clap play() đã gọi');
    assert(!laughAudio || laughAudio.playCallCount === 0, 'Laugh KHÔNG bị phát kèm theo khi bấm Clap');
    assert(btnElements.laughPlayBtn.isActive === false, 'UI laughPlayBtn không bị ảnh hưởng bởi click Clap');
}
{
    const { audioInstances, btnElements } = buildSandbox();
    btnElements.laughPlayBtn.click();
    const clapAudio = audioInstances['assets/sounds/Vo-Tay.MP3'];
    const laughAudio = audioInstances['assets/sounds/Cuoi-Deu.mp3'];
    assert(laughAudio.playCallCount === 1, 'Laugh play() đã gọi');
    assert(!clapAudio || clapAudio.playCallCount === 0, 'Clap KHÔNG bị phát kèm theo khi bấm Laugh');
    assert(btnElements.clapPlayBtn.isActive === false, 'UI clapPlayBtn không bị ảnh hưởng bởi click Laugh');
}

console.log('\n== Isolation: đổi volume Clap KHÔNG ảnh hưởng volume Laugh và ngược lại ==');
{
    const { sandbox, audioInstances } = buildSandbox();
    // Bắt buộc tạo cả 2 Audio instance trước khi so sánh (engine tạo sẵn cả 2 lúc khởi tạo).
    sandbox.SoundEffectEngine.setVolume('CLAP', 90);
    sandbox.SoundEffectEngine.setVolume('LAUGH', 10);
    const clapAudio = audioInstances['assets/sounds/Vo-Tay.MP3'];
    const laughAudio = audioInstances['assets/sounds/Cuoi-Deu.mp3'];
    assert(Math.abs(clapAudio.volume - 0.9) < 1e-9, `Clap volume=0.9, không bị Laugh ghi đè (thực tế: ${clapAudio.volume})`);
    assert(Math.abs(laughAudio.volume - 0.1) < 1e-9, `Laugh volume=0.1, không bị Clap ghi đè (thực tế: ${laughAudio.volume})`);
}

console.log('\n== dispatchKnobVolume(): clapKnob/laughKnob nối đúng tới SoundEffectEngine, KHÔNG qua MIDI ==');
{
    const setVolumeCalls = [];
    const executeActionCalls = [];
    const sandbox = {
        console,
        SoundEffectEngine: {
            setVolume: (id, value) => setVolumeCalls.push({ id, value })
        },
        KNOB_ID_TO_SOUND_EFFECT: { clapKnob: 'CLAP', laughKnob: 'LAUGH' },
        // KNOB_ID_TO_ACTION thật trong renderer.js CỐ TÌNH không có clapKnob/laughKnob —
        // mô phỏng đúng thực tế đó ở đây (chỉ có musicKnob/masterKnob/retune).
        KNOB_ID_TO_ACTION: { musicKnob: 'BEAT_INPUT_VOLUME', masterKnob: 'MASTER_OUTPUT_VOLUME' },
        window: {
            ActionRegistry: {
                ACTIONS: { BEAT_INPUT_VOLUME: 'BEAT_INPUT_VOLUME', MASTER_OUTPUT_VOLUME: 'MASTER_OUTPUT_VOLUME' },
                executeAction: (action, ctx) => { executeActionCalls.push({ action, ctx }); return Promise.resolve({ ok: true }); }
            }
        }
    };
    vm.createContext(sandbox);
    vm.runInContext(dispatchKnobVolumeBlock, sandbox);

    sandbox.dispatchKnobVolume('clapKnob', 55);
    sandbox.dispatchKnobVolume('laughKnob', 22);
    sandbox.dispatchKnobVolume('musicKnob', 80); // control: knob MIDI vẫn phải hoạt động như cũ

    assert(setVolumeCalls.length === 2, `SoundEffectEngine.setVolume() gọi đúng 2 lần cho clap+laugh (thực tế: ${setVolumeCalls.length})`);
    assert(setVolumeCalls[0].id === 'CLAP' && setVolumeCalls[0].value === 55, 'clapKnob -> setVolume(CLAP, 55) đúng');
    assert(setVolumeCalls[1].id === 'LAUGH' && setVolumeCalls[1].value === 22, 'laughKnob -> setVolume(LAUGH, 22) đúng');
    assert(
        executeActionCalls.length === 1 && executeActionCalls[0].action === 'BEAT_INPUT_VOLUME',
        `clapKnob/laughKnob KHÔNG gửi qua ActionRegistry/MIDI — chỉ musicKnob mới gọi executeAction (thực tế: ${executeActionCalls.length} lần, action=${executeActionCalls[0]?.action})`
    );
}

console.log('\n== Asset: file built-in tồn tại đúng vị trí (ui/assets/sounds/) ==');
{
    const clapAssetPath = path.join(__dirname, '..', '..', 'ui', 'assets', 'sounds', 'Vo-Tay.MP3');
    const laughAssetPath = path.join(__dirname, '..', '..', 'ui', 'assets', 'sounds', 'Cuoi-Deu.mp3');
    assert(fs.existsSync(clapAssetPath), `Vo-Tay.MP3 tồn tại tại ${path.relative(path.join(__dirname, '..', '..'), clapAssetPath)}`);
    assert(fs.existsSync(laughAssetPath), `Cuoi-Deu.mp3 tồn tại tại ${path.relative(path.join(__dirname, '..', '..'), laughAssetPath)}`);
    if (fs.existsSync(clapAssetPath)) {
        assert(fs.statSync(clapAssetPath).size > 1000, 'Vo-Tay.MP3 có kích thước hợp lệ (không rỗng/hỏng)');
    }
    if (fs.existsSync(laughAssetPath)) {
        assert(fs.statSync(laughAssetPath).size > 1000, 'Cuoi-Deu.mp3 có kích thước hợp lệ (không rỗng/hỏng)');
    }
}

console.log('\n== Asset: đường dẫn khai báo trong SoundEffectEngine khớp đúng vị trí file thật ==');
{
    const { sandbox } = buildSandbox();
    const sources = sandbox.SoundEffectEngine.SOUND_SOURCES;
    assert(sources.CLAP === 'assets/sounds/Vo-Tay.MP3', `SOUND_SOURCES.CLAP = "assets/sounds/Vo-Tay.MP3" (thực tế: "${sources.CLAP}")`);
    assert(sources.LAUGH === 'assets/sounds/Cuoi-Deu.mp3', `SOUND_SOURCES.LAUGH = "assets/sounds/Cuoi-Deu.mp3" (thực tế: "${sources.LAUGH}")`);
    // Đường dẫn tương đối tới ui/index.html (nơi app/main.js loadFile) -> ui/<đường dẫn này>
    const resolvedClap = path.join(__dirname, '..', '..', 'ui', sources.CLAP);
    const resolvedLaugh = path.join(__dirname, '..', '..', 'ui', sources.LAUGH);
    assert(fs.existsSync(resolvedClap), `Đường dẫn khai báo resolve đúng file thật trên đĩa: ${sources.CLAP}`);
    assert(fs.existsSync(resolvedLaugh), `Đường dẫn khai báo resolve đúng file thật trên đĩa: ${sources.LAUGH}`);
}

console.log(`\n${pass} PASS, ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
