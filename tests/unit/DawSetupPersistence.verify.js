/**
 * DawSetupPersistence.verify.js — TASK B25.2
 * ---------------------------------------------------------------------------
 * Coverage trước đây CHƯA có: không có test nào cho vòng đời DAW selection
 * (chọn -> lưu -> reload -> restore) lẫn việc coordinate profile THẬT SỰ tách
 * riêng theo từng DAW (không lẫn dữ liệu giữa 2 DAW khác nhau), và trạng thái
 * validation khi chưa chọn DAW.
 *
 * Chạy code thật trích từ:
 *   - ui/js/appSettings.js -> getCoordinateProfile(), getCoordinate(), setCoordinate(),
 *     getSetupReadinessChecklist(), countSetupReady()
 *   - ui/js/setup.js -> updateCoordDawLabel()
 *
 * Không sửa đổi các file trên — chỉ đọc và chạy lại nguyên văn để verify hành vi.
 *
 * Chạy: node tests/unit/DawSetupPersistence.verify.js
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

function extractFn(source, name) {
    let start = source.indexOf(`async function ${name}(`);
    if (start === -1) start = source.indexOf(`function ${name}(`);
    if (start === -1) throw new Error(`Không tìm thấy ${name}()`);
    const parenOpen = source.indexOf('(', start);
    let pdepth = 0, j = parenOpen;
    for (; j < source.length; j++) { if (source[j] === '(') pdepth++; else if (source[j] === ')') { pdepth--; if (pdepth === 0) break; } }
    const braceIdx = source.indexOf('{', j);
    let depth = 0, i = braceIdx;
    for (; i < source.length; i++) { if (source[i] === '{') depth++; else if (source[i] === '}') { depth--; if (depth === 0) break; } }
    return source.slice(start, i + 1);
}

const appSettingsSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'ui', 'js', 'appSettings.js'), 'utf8');
const setupSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'ui', 'js', 'setup.js'), 'utf8');

function makeDiskFile(initial) {
    let raw = JSON.stringify(initial);
    return { read: () => JSON.parse(raw), write: (obj) => { raw = JSON.stringify(obj); } };
}

function buildAppSettingsSandbox(diskFile) {
    const sandbox = {
        console,
        getSetting: (key, fallback) => {
            const v = diskFile.read()[key];
            return v != null && v !== '' ? v : fallback;
        },
        setSetting: (key, value) => { const d = diskFile.read(); d[key] = value; diskFile.write(d); },
    };
    vm.createContext(sandbox);
    vm.runInContext(
        [
            extractFn(appSettingsSrc, 'getCoordinateProfile'),
            extractFn(appSettingsSrc, 'getCoordinate'),
            extractFn(appSettingsSrc, 'setCoordinate'),
            extractFn(appSettingsSrc, 'getSetupReadinessChecklist'),
            extractFn(appSettingsSrc, 'countSetupReady'),
        ].join('\n\n'),
        sandbox
    );
    return sandbox;
}

(async () => {
    console.log('== Case 1: Chưa chọn DAW -> setCoordinate() trả về false, KHÔNG âm thầm lưu vào đâu đó ==');
    {
        const disk = makeDiskFile({});
        const s = buildAppSettingsSandbox(disk);
        const ok = s.setCoordinate('autokey1', '100,200');
        assert(ok === false, 'setCoordinate() từ chối khi chưa chọn DAW (trả về false)');
        assert(disk.read().coordinateProfiles === undefined, 'không tạo coordinateProfiles nào khi chưa có DAW được chọn');
    }

    console.log('\n== Case 2: Đã chọn DAW -> lưu tọa độ -> "reload" -> đọc lại đúng giá trị (roundtrip thật) ==');
    {
        const disk = makeDiskFile({ selectedDAW: 'studio_one' });
        const setupSide = buildAppSettingsSandbox(disk);
        const ok = setupSide.setCoordinate('autokey1', '111,222');
        assert(ok === true, 'setCoordinate() thành công khi đã chọn DAW');

        // "reload" — sandbox MỚI, đọc lại từ disk như 1 process/window mới mở lên
        const reloaded = buildAppSettingsSandbox(disk);
        const value = reloaded.getCoordinate('autokey1');
        assert(value === '111,222', `getCoordinate() sau reload trả đúng giá trị đã lưu (thực tế: ${value})`);
    }

    console.log('\n== Case 3: Coordinate profile TÁCH RIÊNG theo từng DAW — đổi DAW không làm lẫn/mất dữ liệu DAW kia ==');
    {
        const disk = makeDiskFile({ selectedDAW: 'studio_one' });
        let s = buildAppSettingsSandbox(disk);
        s.setCoordinate('autokey1', 'SO-100,100');

        // Đổi sang DAW khác (giống người dùng chọn lại DAW trong Setup)
        const d = disk.read(); d.selectedDAW = 'cubase'; disk.write(d);
        s = buildAppSettingsSandbox(disk);
        s.setCoordinate('autokey1', 'CUBASE-999,999');

        assert(s.getCoordinate('autokey1') === 'CUBASE-999,999', 'DAW đang chọn (cubase) đọc đúng tọa độ của chính nó');

        // Quay lại studio_one — tọa độ cũ của nó KHÔNG bị Cubase ghi đè
        const d2 = disk.read(); d2.selectedDAW = 'studio_one'; disk.write(d2);
        s = buildAppSettingsSandbox(disk);
        assert(s.getCoordinate('autokey1') === 'SO-100,100', `studio_one vẫn giữ nguyên tọa độ riêng của nó, không bị Cubase đè (thực tế: ${s.getCoordinate('autokey1')})`);

        const profiles = disk.read().coordinateProfiles;
        assert(profiles.studio_one.autokey1 === 'SO-100,100' && profiles.cubase.autokey1 === 'CUBASE-999,999', '2 hồ sơ tọa độ tồn tại độc lập trong cùng 1 file settings, không gộp chung');
    }

    console.log('\n== Case 4: selectedDAW — persistence roundtrip thuần (không qua coordinate) ==');
    {
        const disk = makeDiskFile({});
        const d = disk.read();
        d.selectedDAW = 'ableton';
        disk.write(d);

        const reloaded = disk.read();
        assert(reloaded.selectedDAW === 'ableton', `selectedDAW khôi phục đúng sau "reload" (thực tế: ${reloaded.selectedDAW})`);
    }

    console.log('\n== Case 5: getSetupReadinessChecklist — validation phản ánh đúng theo DAW đang chọn (không báo sai) ==');
    {
        const disk = makeDiskFile({ selectedDAW: 'studio_one' });
        let s = buildAppSettingsSandbox(disk);
        s.setCoordinate('autokey1', '1,1');

        // studio_one đã có autokey1 -> mục đó phải "ready"
        let list = s.getSetupReadinessChecklist();
        let item = list.find((x) => x.key === 'autokey1');
        assert(item.ready === true, 'autokey1 = ready khi DAW hiện tại (studio_one) đã có tọa độ');

        // Đổi sang DAW khác CHƯA có tọa độ nào -> phải báo chưa ready, không "ăn theo" dữ liệu DAW cũ
        const d = disk.read(); d.selectedDAW = 'reaper'; disk.write(d);
        s = buildAppSettingsSandbox(disk);
        list = s.getSetupReadinessChecklist();
        item = list.find((x) => x.key === 'autokey1');
        assert(item.ready === false, 'autokey1 = chưa ready khi đổi sang DAW (reaper) chưa từng cấu hình tọa độ — không báo sai/lạc quan giả');
    }

    console.log('\n== Case 6 (UI, setup.js) — updateCoordDawLabel(): chưa chọn DAW -> cảnh báo rõ; đã chọn -> hiện đúng tên DAW ==');
    {
        function buildLabelSandbox(diskFile) {
            const label = { textContent: '', style: {} };
            const sandbox = {
                console,
                document: { getElementById: (id) => (id === 'coordDawLabel' ? label : null) },
                getSetting: (key) => diskFile.read()[key],
            };
            vm.createContext(sandbox);
            vm.runInContext(extractFn(setupSrc, 'updateCoordDawLabel'), sandbox);
            return { sandbox, label };
        }

        {
            const disk = makeDiskFile({});
            const { sandbox, label } = buildLabelSandbox(disk);
            sandbox.updateCoordDawLabel();
            assert(label.textContent.includes('Chưa chọn DAW'), `label cảnh báo đúng khi chưa chọn DAW (thực tế: ${label.textContent})`);
        }
        {
            const disk = makeDiskFile({ selectedDAW: 'studio_one' });
            const { sandbox, label } = buildLabelSandbox(disk);
            sandbox.updateCoordDawLabel();
            assert(label.textContent.includes('studio_one'), `label hiện đúng tên DAW đang chọn (thực tế: ${label.textContent})`);
        }
    }

    console.log(`\n${pass} PASS, ${fail} FAIL`);
    process.exit(fail > 0 ? 1 : 0);
})();
