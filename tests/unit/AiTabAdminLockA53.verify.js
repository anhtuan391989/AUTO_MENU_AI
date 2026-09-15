/**
 * AiTabAdminLockA53.verify.js — TASK A53
 * ---------------------------------------------------------------------------
 * Chạy toàn bộ ui/js/setupNav.js thật trong sandbox `vm` (đúng pattern đã dùng ở
 * tests/unit/MenuMinimizeRuntime.verify.js) với DOM giả tối thiểu, để xác nhận:
 *
 *   1. Click tab AI lần đầu (chưa xác thực) -> gọi AdminAuthUI.requestLogin() NGAY,
 *      KHÔNG activatePanel("panel-ai") (panel-ai không được thêm class "active").
 *   2. requestLogin không gọi onSuccess (mô phỏng sai password / Cancel) ->
 *      panel-ai vẫn KHÔNG active sau khi popup "đóng".
 *   3. requestLogin gọi onSuccess (mô phỏng đúng "Kh0i_AI!") -> panel-ai được
 *      activatePanel() active, các panel khác bị deactivate (đúng hành vi tab).
 *   4. Sau khi đã unlock trong phiên -> click lại tab AI KHÔNG gọi requestLogin lần
 *      2 (không hỏi lại password trong cùng phiên — đúng A53 mục 10), mà
 *      activatePanel() thẳng.
 *   5. Các tab KHÁC (không phải panel-ai) không bao giờ đi qua nhánh AdminAuthUI —
 *      hoạt động y hệt trước A53 (regression-safe).
 *   6. setupNav.js không có bất kỳ tham chiếu localStorage/sessionStorage nào
 *      (không có persistent bypass).
 *   7. setupNav.js không chứa chuỗi password nào (không hard-code password mới).
 *   8. Trạng thái unlock CHỈ tồn tại trong biến closure của IIFE — mô phỏng "restart"
 *      bằng cách nạp lại module (require cache xoá + vm mới) -> phải hỏi lại password.
 *
 * Chạy: node tests/unit/AiTabAdminLockA53.verify.js
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

const setupNavPath = path.join(__dirname, '..', '..', 'ui', 'js', 'setupNav.js');
const setupNavSrc = fs.readFileSync(setupNavPath, 'utf8');

// ---- DOM giả tối thiểu, đủ cho setupNav.js chạy được từ đầu tới cuối ----
class FakeClassList {
    constructor() { this._set = new Set(); }
    toggle(name, force) {
        const has = this._set.has(name);
        const want = force === undefined ? !has : !!force;
        if (want) this._set.add(name); else this._set.delete(name);
    }
    contains(name) { return this._set.has(name); }
}

class FakeElement {
    constructor(tag) {
        this.tagName = tag || 'DIV';
        this.id = '';
        this.dataset = {};
        this.classList = new FakeClassList();
        this._handlers = {};
        this.textContent = '';
        this._isNavItem = false;
    }
    addEventListener(evt, fn) { (this._handlers[evt] = this._handlers[evt] || []).push(fn); }
    dispatch(evt, payload) { (this._handlers[evt] || []).forEach((fn) => fn(payload)); }
    closest(sel) {
        if (sel === '.nav-item' && this._isNavItem) return this;
        return null;
    }
}

function buildSandboxDom() {
    const panels = {
        'panel-dashboard': new FakeElement('SECTION'),
        'panel-ai': new FakeElement('SECTION'),
        'panel-audio': new FakeElement('SECTION'),
    };
    Object.entries(panels).forEach(([id, el]) => { el.id = id; });

    const navButtons = {
        'panel-dashboard': new FakeElement('BUTTON'),
        'panel-ai': new FakeElement('BUTTON'),
        'panel-audio': new FakeElement('BUTTON'),
    };
    Object.entries(navButtons).forEach(([panelId, btn]) => {
        btn._isNavItem = true;
        btn.dataset.panel = panelId;
    });

    const sidebarNav = new FakeElement('NAV');
    sidebarNav.id = 'sidebarNav';

    const byId = { sidebarNav };

    const document = {
        getElementById: (id) => byId[id] || null,
        querySelectorAll: (sel) => {
            if (sel === '.setup-panel') return Object.values(panels);
            if (sel === '.nav-item') return Object.values(navButtons);
            return [];
        },
    };

    return { document, panels, navButtons, sidebarNav };
}

function clickNav(sidebarNav, btn) {
    sidebarNav.dispatch('click', { target: btn });
}

function makeSandbox(dom, adminAuthUIStub) {
    const sandbox = {
        console,
        document: dom.document,
        window: { addEventListener: () => {}, AdminAuthUI: adminAuthUIStub },
        setTimeout: () => {}, // refreshDashboard/load handler không cần chạy thật trong test này
    };
    vm.createContext(sandbox);
    return sandbox;
}

console.log('== Mục 1-2: Click AI lần đầu -> gọi requestLogin ngay, KHÔNG activatePanel trước khi có onSuccess ==');
{
    const dom = buildSandboxDom();
    let requestLoginCalls = 0;
    let capturedOnSuccess = null;
    const adminAuthUIStub = {
        requestLogin: (onSuccess) => {
            requestLoginCalls++;
            capturedOnSuccess = onSuccess; // KHÔNG gọi ngay -> mô phỏng popup đang mở, chưa nhập gì
        },
    };
    const sandbox = makeSandbox(dom, adminAuthUIStub);
    vm.runInContext(setupNavSrc, sandbox);

    clickNav(dom.sidebarNav, dom.navButtons['panel-ai']);

    assert(requestLoginCalls === 1, 'Click tab AI lần đầu -> AdminAuthUI.requestLogin() được gọi đúng 1 lần');
    assert(dom.panels['panel-ai'].classList.contains('active') === false,
        'panel-ai KHÔNG có class "active" ngay sau click (chưa xác thực xong) -> vẫn display:none theo CSS');
    assert(typeof capturedOnSuccess === 'function', 'requestLogin nhận được callback onSuccess hợp lệ');
}

console.log('\n== Mục 2 (tiếp): requestLogin không gọi onSuccess (sai password / Cancel) -> panel-ai vẫn khoá ==');
{
    const dom = buildSandboxDom();
    const adminAuthUIStub = {
        requestLogin: (onSuccess) => {
            // Mô phỏng user nhập sai password nhiều lần rồi bấm Cancel -> onSuccess KHÔNG BAO GIỜ được gọi.
        },
    };
    const sandbox = makeSandbox(dom, adminAuthUIStub);
    vm.runInContext(setupNavSrc, sandbox);

    clickNav(dom.sidebarNav, dom.navButtons['panel-ai']);

    assert(dom.panels['panel-ai'].classList.contains('active') === false,
        'Sai password / Cancel -> panel-ai KHÔNG active (đúng yêu cầu "popup vẫn mở/đóng, AI Setup vẫn LOCKED")');
    assert(dom.navButtons['panel-ai'].classList.contains('active') === false,
        'Nav item AI cũng KHÔNG được đánh dấu active khi auth chưa thành công');
}

console.log('\n== Mục 3: requestLogin gọi onSuccess (đúng password) -> unlock, activatePanel("panel-ai") thật ==');
{
    const dom = buildSandboxDom();
    const adminAuthUIStub = {
        requestLogin: (onSuccess) => onSuccess(), // mô phỏng nhập đúng "Kh0i_AI!" -> AdminAuth.verify() ok=true
    };
    const sandbox = makeSandbox(dom, adminAuthUIStub);
    vm.runInContext(setupNavSrc, sandbox);

    // Trước tiên đứng ở tab khác để kiểm tra hành vi chuyển tab thật
    clickNav(dom.sidebarNav, dom.navButtons['panel-dashboard']);
    assert(dom.panels['panel-dashboard'].classList.contains('active') === true, 'Tab Dashboard hoạt động bình thường (không liên quan AI lock)');

    clickNav(dom.sidebarNav, dom.navButtons['panel-ai']);

    assert(dom.panels['panel-ai'].classList.contains('active') === true,
        'Đúng password -> onSuccess() -> activatePanel("panel-ai") -> panel-ai có class "active"');
    assert(dom.panels['panel-dashboard'].classList.contains('active') === false,
        'Panel Dashboard bị deactivate khi chuyển sang AI (đúng hành vi tab, không mở nhiều panel cùng lúc)');
    assert(dom.navButtons['panel-ai'].classList.contains('active') === true,
        'Nav item AI được đánh dấu active sau khi unlock thành công');
}

console.log('\n== Mục 4: Đã unlock trong phiên -> click lại tab AI KHÔNG hỏi lại password ==');
{
    const dom = buildSandboxDom();
    let requestLoginCalls = 0;
    const adminAuthUIStub = {
        requestLogin: (onSuccess) => { requestLoginCalls++; onSuccess(); },
    };
    const sandbox = makeSandbox(dom, adminAuthUIStub);
    vm.runInContext(setupNavSrc, sandbox);

    clickNav(dom.sidebarNav, dom.navButtons['panel-ai']); // lần 1: unlock
    clickNav(dom.sidebarNav, dom.navButtons['panel-dashboard']); // rời tab AI
    clickNav(dom.sidebarNav, dom.navButtons['panel-ai']); // lần 2: quay lại AI trong CÙNG phiên

    assert(requestLoginCalls === 1, `requestLogin() chỉ được gọi 1 lần trong cả phiên dù click AI 2 lần (thực tế: ${requestLoginCalls})`);
    assert(dom.panels['panel-ai'].classList.contains('active') === true, 'Lần click AI thứ 2 trong cùng phiên vẫn mở được panel-ai (không bắt login lại)');
}

console.log('\n== Mục 5: Tab khác (Audio) không đi qua AdminAuthUI, không bị ảnh hưởng bởi A53 ==');
{
    const dom = buildSandboxDom();
    let requestLoginCalls = 0;
    const adminAuthUIStub = { requestLogin: (onSuccess) => { requestLoginCalls++; onSuccess(); } };
    const sandbox = makeSandbox(dom, adminAuthUIStub);
    vm.runInContext(setupNavSrc, sandbox);

    clickNav(dom.sidebarNav, dom.navButtons['panel-audio']);

    assert(requestLoginCalls === 0, 'Click tab Audio KHÔNG gọi AdminAuthUI.requestLogin (chỉ tab AI bị khoá)');
    assert(dom.panels['panel-audio'].classList.contains('active') === true, 'Tab Audio active bình thường ngay lập tức, không cần xác thực');
}

console.log('\n== Mục 6-7: Không có localStorage/sessionStorage USAGE THẬT, không hard-code password mới trong setupNav.js ==');
{
    // Lưu ý: comment giải thích thiết kế trong file CÓ nhắc tới các từ này (để nói rõ
    // KHÔNG dùng) — nên test phải kiểm tra pattern GỌI HÀM thật (.setItem/.getItem/...),
    // không phải chỉ tìm chuỗi ký tự bất kỳ (nếu không sẽ tự fail vì chính comment của mình).
    assert(!/localStorage\s*[.\[]\s*(setItem|getItem|removeItem)/.test(setupNavSrc),
        'setupNav.js không có lệnh gọi localStorage.setItem/getItem/removeItem nào (không persistent bypass)');
    assert(!/sessionStorage\s*[.\[]\s*(setItem|getItem|removeItem)/.test(setupNavSrc),
        'setupNav.js không có lệnh gọi sessionStorage.setItem/getItem/removeItem nào (không persistent bypass)');
    assert(!/["'`]Kh0i_AI/.test(setupNavSrc), 'setupNav.js không hard-code chuỗi password "Kh0i_AI!" dạng literal — chỉ gọi AdminAuthUI.requestLogin()');
    assert(!/electronAPI\s*\.\s*adminAuth(Verify|ChangePassword)\s*\(/.test(setupNavSrc),
        'setupNav.js KHÔNG tự gọi thẳng electronAPI.adminAuthVerify()/adminAuthChangePassword() — chỉ đi qua AdminAuthUI.requestLogin() (không viết lại authentication system thứ 2)');
}

console.log('\n== Mục 8: Mô phỏng "restart app" (nạp lại module trong context vm mới) -> phải hỏi lại password ==');
{
    // Biến aiTabUnlockedThisSession nằm trong closure IIFE của setupNavSrc — mỗi lần
    // vm.runInContext chạy lại source trong 1 sandbox MỚI là một "phiên" hoàn toàn mới,
    // mô phỏng đúng việc app restart / reload trang Setup (không có gì được persist).
    const dom = buildSandboxDom();
    let requestLoginCalls = 0;
    const adminAuthUIStub = { requestLogin: (onSuccess) => { requestLoginCalls++; onSuccess(); } };
    const sandbox = makeSandbox(dom, adminAuthUIStub);
    vm.runInContext(setupNavSrc, sandbox); // "lần chạy app" #1
    clickNav(dom.sidebarNav, dom.navButtons['panel-ai']);
    assert(requestLoginCalls === 1, '"Phiên" đầu tiên: unlock được sau đúng 1 lần login');

    // "restart" thật: dom mới + sandbox mới + chạy lại source từ đầu
    const dom2 = buildSandboxDom();
    let requestLoginCalls2 = 0;
    const adminAuthUIStub2 = { requestLogin: (onSuccess) => { requestLoginCalls2++; onSuccess(); } };
    const sandbox2 = makeSandbox(dom2, adminAuthUIStub2);
    vm.runInContext(setupNavSrc, sandbox2); // "lần chạy app" #2 — mô phỏng restart
    clickNav(dom2.sidebarNav, dom2.navButtons['panel-ai']);
    assert(requestLoginCalls2 === 1, '"Phiên" mới (mô phỏng restart) phải hỏi lại password -> requestLogin() được gọi lại (không có gì persist qua phiên)');
}

console.log(`\n${pass} PASS, ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
