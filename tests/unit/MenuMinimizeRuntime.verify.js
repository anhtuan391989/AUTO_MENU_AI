/**
 * MenuMinimizeRuntime.verify.js — TASK B (MENU RUNTIME)
 * ---------------------------------------------------------------------------
 * Xác nhận minBtn KHÔNG còn là console.log("MINIMIZE") (UI-only) mà gọi
 * window.electronAPI.minimizeWindow() thật; xác nhận preload.js expose đúng
 * kênh "minimize-window"; xác nhận main.js có ipcMain.on("minimize-window")
 * gọi mainWin.minimize() thật (không phải fake/no-op).
 *
 * Chạy: node tests/unit/MenuMinimizeRuntime.verify.js
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

const rendererSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'ui', 'js', 'renderer.js'), 'utf8');
const preloadSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'preload.js'), 'utf8');
const mainSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'main.js'), 'utf8');

console.log('== renderer.js: minBtn không còn console.log("MINIMIZE") UI-only ==');
{
    assert(!/getElementById\("minBtn"\)\?\.addEventListener\("click", \(\) => console\.log\("MINIMIZE"\)\);/.test(rendererSrc),
        'handler console.log("MINIMIZE") cũ đã bị thay thế');

    const marker = 'document.getElementById("minBtn")?.addEventListener("click"';
    const start = rendererSrc.indexOf(marker);
    assert(start !== -1, 'tìm thấy handler #minBtn mới trong renderer.js');
    const end = rendererSrc.indexOf('});', start) + 3;
    const block = rendererSrc.slice(start, end);

    class FakeElement {
        constructor() { this._handlers = {}; }
        addEventListener(evt, fn) { (this._handlers[evt] = this._handlers[evt] || []).push(fn); }
        dispatch(evt) { (this._handlers[evt] || []).forEach((fn) => fn({ target: this })); }
    }
    const minBtn = new FakeElement();
    let calledMinimize = 0;
    const sandbox = {
        console,
        document: { getElementById: (id) => (id === 'minBtn' ? minBtn : null) },
        window: { electronAPI: { minimizeWindow: () => { calledMinimize++; } } },
    };
    vm.createContext(sandbox);
    vm.runInContext(block, sandbox);
    minBtn.dispatch('click');
    assert(calledMinimize === 1, `click gọi electronAPI.minimizeWindow() đúng 1 lần (thực tế: ${calledMinimize})`);
}

console.log('\n== preload.js: expose kênh minimize-window ==');
{
    assert(/minimizeWindow:\s*\(\)\s*=>\s*ipcRenderer\.send\("minimize-window"\)/.test(preloadSrc),
        'preload.js expose minimizeWindow() -> ipcRenderer.send("minimize-window")');
}

console.log('\n== main.js: ipcMain.on("minimize-window") gọi mainWin.minimize() thật ==');
{
    const marker = 'ipcMain.on("minimize-window"';
    const start = mainSrc.indexOf(marker);
    assert(start !== -1, 'tìm thấy handler ipcMain.on("minimize-window") trong main.js');
    const end = mainSrc.indexOf('});', start) + 3;
    const block = mainSrc.slice(start, end);
    assert(/mainWin\.minimize\(\)/.test(block), 'handler gọi mainWin.minimize() thật (không phải no-op/log)');
    assert(/isDestroyed\(\)/.test(block), 'handler tự bảo vệ khi mainWin đã bị destroy (không crash)');
}

console.log(`\n${pass} PASS, ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
