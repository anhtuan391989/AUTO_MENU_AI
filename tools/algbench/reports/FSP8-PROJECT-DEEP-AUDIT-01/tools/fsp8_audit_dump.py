#!/usr/bin/env python3
"""FSP8-PROJECT-DEEP-AUDIT-01 — trích xuất CHỈ ĐỌC từ session Studio One / Fender Studio Pro đã giải nén.
Dùng:  python3 -I fsp8_audit_dump.py <thư_mục_session_đã_giải_nén> <thư_mục_ra>
Không sửa file nguồn. Che: machineID, tên tác giả, đường dẫn người dùng. Mỗi bảng ghi tên trường XML làm bằng chứng."""
import sys, os, re, math, json, struct
import xml.etree.ElementTree as ET

root, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)

def load(rel):
    s = open(os.path.join(root, rel), encoding='utf-8-sig').read()
    return ET.fromstring(re.sub(r'\bx:id=', 'xid=', s))

def db(v):
    try: v = float(v)
    except (TypeError, ValueError): return ''
    return '-inf' if v <= 0 else f'{20*math.log10(v):+.2f} dB'

def uid(e):
    u = e.find("UID[@xid='uniqueID']") if e is not None else None
    return u.get('uid') if u is not None else ''

def nrm(u): return re.sub(r'[{}-]', '', u or '').upper()

def mask(p):
    return re.sub(r'(?i)(/Users/)[^/]+/', r'\1<USER>/', p or '')

mx = load('Devices/audiomixer.xml'); mc = load('Devices/mixerconsole.xml')
sm = load('Devices/surfacemanager.xml'); song = load('Song/song.xml'); aio = load('Devices/audioiomanager.xml')

vis = {}
for sec in mc.iter('Section'):
    at = sec.find('Attributes')
    if sec.get('path') and at is not None and at.get('visible') is not None:
        vis[sec.get('path').upper()] = (at.get('visible'), at.get('order'))

label_by_uid = {}
for ch in mx.iter():
    if ch.tag.endswith('Channel'): label_by_uid[nrm(uid(ch))] = ch.get('label')

def dest_label(c):
    if c is None: return ('', '', '')
    oid = c.get('objectID') or ''
    base, _, port = oid.partition('/')
    return (c.get('friendlyName') or label_by_uid.get(nrm(base), ''), base, port)

L = []  # markdown pieces
def w(name, lines):
    open(os.path.join(out, name), 'w', encoding='utf-8').write('\n'.join(lines) + '\n')

# 1. channels
rows = ['| Lớp XML | Nhãn | Tên nội bộ | UID | mute | solo | gain (raw) | gain dB | pan | → đích (nhãn / port) | trong mixer (visible/order) |', '|---|---|---|---|---|---|---|---|---|---|---|']
for ch in mx.iter():
    if not ch.tag.endswith('Channel'): continue
    d = dest_label(ch.find("Connection[@xid='destination']"))
    v = vis.get(nrm(uid(ch)))
    rows.append(f"| {ch.tag} | {ch.get('label')} | {ch.get('name')} | {uid(ch)} | {ch.get('mute','-')} | {ch.get('solo','-')} | {ch.get('gain')} | {db(ch.get('gain'))} | {ch.get('pan','-')} | {d[0] or '-'} / {d[2] or '-'} | {(v[0]+'/'+v[1]) if v else '-'} |")
w('channels.md', rows)

# 2. record inputs + audio IO
rows = ['| Track | recordPort (đầu vào) | recordArmed | monitorActive |', '|---|---|---|---|']
for ch in mx.iter('AudioTrackChannel'):
    ru = ch.find("Attributes[@xid='RecordUnit']")
    c = ru.find("Connection[@xid='recordPort']") if ru is not None else None
    dat = c.find("Attributes[@xid='data']") if c is not None else None
    rows.append(f"| {ch.get('label')} | {c.get('friendlyName') if c is not None else '-'} | {dat.get('recordArmed') if dat is not None else '-'} | {dat.get('monitorActive') if dat is not None else '-'} |")
rows += ['', '| Thiết bị ASIO (tên) | in/out | Kênh vào Console | → cổng thiết bị |', '|---|---|---|---|']
for a in aio.iter('AudioIOAssignment'):
    for pa in a.find("Attributes[@xid='inputs']"):
        for assoc in pa:
            rows.append(f"| {a.get('deviceName')} | {a.get('inputCount')}/{a.get('outputCount')} | {label_by_uid.get(nrm(pa.get('name')), pa.get('name'))} ({assoc.get('key')}) | {assoc.get('value').split('/')[-1]} |")
    for pa in a.find("Attributes[@xid='outputs']"):
        for assoc in pa:
            rows.append(f"| {a.get('deviceName')} | {a.get('inputCount')}/{a.get('outputCount')} | OUT {label_by_uid.get(nrm(pa.get('name')), pa.get('name'))} ({assoc.get('key')}) | {assoc.get('value').split('/')[-1]} |")
w('record-inputs-and-audio-io.md', rows)

# 3. sends
rows = ['| Kênh nguồn | Send (name) | UID Send | → đích (nhãn) | objectID đích / port | level (raw) | level dB | prefader | bypass | pan | lockPan |', '|---|---|---|---|---|---|---|---|---|---|---|']
for ch in mx.iter():
    if not ch.tag.endswith('Channel'): continue
    sd = ch.find("Attributes[@xid='Sends']")
    if sd is None: continue
    for sn in sd:
        if sn.get('level') is None: continue
        d = dest_label(sn.find("Connection[@xid='destination']"))
        rows.append(f"| {ch.get('label')} | {sn.get('name')} | {uid(sn)} | {d[0]} | {d[1]} / {d[2]} | {sn.get('level')} | {db(sn.get('level'))} | {sn.get('prefader')} | {sn.get('bypass')} | {sn.get('pan')} | {sn.get('lockPan')} |")
w('sends.md', rows)

# 4. inserts
pdir = os.path.join(root, 'Presets', 'Channels')
def preset_info(path):
    if not path: return ('', '')
    p = os.path.join(root, path)
    if not os.path.exists(p):
        # tên thư mục có thể khác dạng chuẩn hoá Unicode
        d, f = os.path.split(path)
        for dd in os.listdir(os.path.join(root, os.path.dirname(d))):
            if dd.replace('̀','') == os.path.basename(d) or os.path.basename(d) in dd or dd in os.path.basename(d):
                cand = os.path.join(root, os.path.dirname(d), dd, f)
                if os.path.exists(cand): p = cand; break
    if not os.path.exists(p): return ('không thấy file', '')
    b = open(p, 'rb').read(); ext = os.path.splitext(p)[1].lower()
    if ext in ('.fxpreset',): return (f'XML đọc được ({len(b)} B)', 'ĐỌC ĐƯỢC tham số')
    if ext == '.dsppreset': return (f'JSON đọc được ({len(b)} B)', 'ĐỌC ĐƯỢC tham số')
    if ext == '.vstpreset': return (f'VST3 state nhị phân ({len(b)} B)', 'KHÔNG đọc được (state riêng của plugin)')
    if ext == '.fxb': return (f'VST2 bank {b[8:12].decode("ascii","replace")} ({len(b)} B)', 'KHÔNG đọc được (chunk mờ của plugin)')
    return (f'{ext} ({len(b)} B)', '')
rows = ['| Kênh | Vị trí trong XML | Slot (name) | Tên hiển thị (deviceData@name) | Plugin thật (classInfo@name) | subCategory | bypass | UID slot | UID deviceData | Preset đang nạp | File preset | Tham số |', '|---|---|---|---|---|---|---|---|---|---|---|---|']
for ch in mx.iter():
    if not ch.tag.endswith('Channel'): continue
    ins = ch.find("Attributes[@xid='Inserts']")
    if ins is None: continue
    k = 0
    for fx in ins:
        if fx.get('xid') in ('Presets', 'Combinator'): continue
        k += 1
        dd = fx.find("Attributes[@xid='deviceData']"); gd = fx.find("Attributes[@xid='ghostData']")
        ci = gd.find("Attributes[@xid='classInfo']") if gd is not None else None
        pn = fx.find("Attributes[@xid='Presets']"); pp = fx.find("String[@xid='presetPath']")
        pi = preset_info(pp.get('text') if pp is not None else '')
        rows.append(f"| {ch.get('label')} | {k} | {fx.get('name')} | {dd.get('name') if dd is not None else '-'} | {ci.get('name') if ci is not None else '-'} | {ci.get('subCategory') if ci is not None else '-'} | {fx.get('bypass','(không có = 0)')} | {uid(fx)} | {uid(dd)} | {pn.get('pname') if pn is not None else '-'} | {pi[0]} | {pi[1]} |")
w('inserts.md', rows)

# 5. automation lanes (MediaTrack và AutomationTrack)
import unicodedata
def find_file(rel):
    d, f = os.path.split(os.path.join(root, rel))
    if os.path.exists(os.path.join(d, f)): return os.path.join(d, f)
    nf = unicodedata.normalize('NFC', rel)
    for dp, dn, fn in os.walk(os.path.join(root, 'Envelopes')):
        for x in fn:
            full = os.path.join(dp, x)
            if unicodedata.normalize('NFC', os.path.relpath(full, root)) == nf: return full
    return None
rows = ['| Track | Loại track | Lane (title) | identity (địa chỉ tham số) | lane mute | file envelope | kích thước |', '|---|---|---|---|---|---|---|']
for t in song.iter():
    if t.tag not in ('MediaTrack', 'AutomationTrack'): continue
    for r in t.iter('AutomationRegion'):
        u = r.find("Url[@xid='points']"); url = u.get('url') if u is not None else ''
        rel = url.replace('media:///', '')
        p = find_file(rel); sz = os.path.getsize(p) if p else 'không thấy'
        rows.append(f"| {t.get('name')} | {t.tag} | {r.get('title')} | `{r.get('identity')}` | {r.get('mute')} | {rel} | {sz} B |")
w('automation.md', rows)

# 6. control surface / macro
rows = ['| Thiết bị khai báo (deviceName) | Trang gán | Lệnh/điều khiển được gán |', '|---|---|---|']
for a in sm:
    ca = a.find(".//Attributes[@xid='controlAssignment']")
    real = [e for e in ca.iter() if e is not ca and e.tag not in ('List', 'SurfaceAssignmentPage')] if ca is not None else []
    rows.append(f"| {a.get('deviceName')} | {len(list(ca.iter('SurfaceAssignmentPage'))) if ca is not None else 0} | {len(real)} |")
w('control-surfaces.md', rows)

# 7. quét chuỗi liên quan điều khiển ngoài trong mọi file XML
hits = []
for dp, dn, fn in os.walk(root):
    for f in fn:
        if not f.lower().endswith(('.xml', '.txt')): continue
        p = os.path.join(dp, f); rel = os.path.relpath(p, root)
        try: s = open(p, encoding='utf-8-sig', errors='replace').read()
        except Exception: continue
        for kw in ('MacroControls', 'DetachedMacroPanel', 'KeyCommand', 'Shortcut', 'MidiMonitor', 'ControlChange', 'MidiBinding', 'ProgramChange', 'MidiInput', 'MidiOutput'):
            n = s.count(kw)
            if n: hits.append(f'{rel}: "{kw}" x{n}')
w('external-control-scan.txt', ['Quét chuỗi khoá liên quan điều khiển ngoài trong mọi file .xml/.txt của session (chỉ đếm):'] + sorted(hits))
print('OK ->', out)
