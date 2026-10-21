#!/usr/bin/env python3
"""Đọc (CHỈ ĐỌC) một session Studio One/Fender Studio Pro 8 đã giải nén: mixer, định tuyến, Send, insert, ẩn/hiện, thiết bị ngoài.
Dùng: python3 -I fsp8_session_dump.py <thư_mục_session_đã_giải_nén>
Không ghi, không sửa file nguồn. Không in tên tác giả/đường dẫn người dùng."""
import sys, os, re, math
import xml.etree.ElementTree as ET

def load(p):
    s = open(p, encoding='utf-8-sig').read()
    return ET.fromstring(re.sub(r'\bx:id=', 'xid=', s))

def db(v):
    v = float(v)
    return '-inf' if v <= 0 else f'{20*math.log10(v):+.1f}dB'

def norm(u):  # {AAAA-...} -> AAAA...
    return re.sub(r'[{}-]', '', u or '').upper()

root = sys.argv[1]
mx = load(os.path.join(root, 'Devices', 'audiomixer.xml'))
mc = load(os.path.join(root, 'Devices', 'mixerconsole.xml'))
sm = load(os.path.join(root, 'Devices', 'surfacemanager.xml'))
meta = load(os.path.join(root, 'metainfo.xml'))
song = load(os.path.join(root, 'Song', 'song.xml'))

print('== metainfo (chỉ trường kỹ thuật) ==')
for a in meta.iter('Attribute'):
    if a.get('id') in ('Document:Generator', 'Document:FormatVersion', 'Media:SampleRate', 'Media:TrackCount', 'Media:Tempo'):
        print(f"  {a.get('id')} = {a.get('value')}")

vis = {}
for sec in mc.iter('Section'):
    at = sec.find('Attributes')
    if sec.get('path') and at is not None and at.get('visible') is not None:
        vis[sec.get('path').upper()] = (at.get('visible'), at.get('order'))

names = {}
for ch in mx.iter():
    if ch.tag.endswith('Channel'):
        u = ch.find("UID[@xid='uniqueID']")
        if u is not None: names[norm(u.get('uid'))] = ch.get('label')

print('\n== kênh (lớp trong file = tên thẻ XML) ==')
for ch in mx.iter():
    if not ch.tag.endswith('Channel'): continue
    u = ch.find("UID[@xid='uniqueID']"); un = norm(u.get('uid')) if u is not None else ''
    dest = ch.find("Connection[@xid='destination']")
    d = dest.get('friendlyName') if dest is not None else '-'
    v = vis.get(un)
    print(f"[{ch.tag}] '{ch.get('label')}' mute={ch.get('mute')} gain={db(ch.get('gain'))} -> {d}"
          + (f"  (mixer visible={v[0]} order={v[1]})" if v else ''))
    ins = ch.find("Attributes[@xid='Inserts']")
    if ins is not None:
        for fx in ins:
            if fx.get('xid') == 'Presets': continue
            dd = fx.find("Attributes[@xid='deviceData']")
            nm = dd.get('name') if dd is not None else fx.get('name')
            if nm == 'Combinator': continue
            print(f"     insert {fx.get('name')} '{nm}' bypass={fx.get('bypass')}")
    sd = ch.find("Attributes[@xid='Sends']")
    if sd is not None:
        for sn in sd:
            if sn.get('level') is None: continue
            c = sn.find('Connection')
            print(f"     SEND {sn.get('name')} -> {c.get('friendlyName') if c is not None else '?'} level={db(sn.get('level'))} bypass={sn.get('bypass')} prefader={sn.get('prefader')}")

print('\n== tracks trong song.xml ==')
for t in song.iter('MediaTrack'):
    print(f"  {t.get('mediaType')} '{t.get('name')}' mute={t.get('mute')}")

print('\n== thiết bị ngoài trong surfacemanager.xml (chỉ tên + có/không gán trong session) ==')
for a in sm:
    ca = a.find(".//Attributes[@xid='controlAssignment']")
    real = [e for e in ca.iter() if e is not ca and e.tag not in ('List', 'SurfaceAssignmentPage')] if ca is not None else []
    pages = len(list(ca.iter('SurfaceAssignmentPage'))) if ca is not None else 0
    print(f"  '{a.get('deviceName')}': trang gán={pages}, lệnh/điều khiển được gán={len(real)}")
