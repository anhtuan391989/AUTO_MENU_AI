# analyze_song.py - Phan tich file nhac: key, BPM, thoi luong, diem len tone
# Dung: python analyze_song.py <file_audio_hoac_video>
# Can: pip install librosa numpy ; can ffmpeg
import sys, json, subprocess, tempfile, os
import numpy as np, librosa

NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
SCALE = [0,2,4,5,7,9,11]
MAJ = np.array([6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88])
MIN = np.array([6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17])
WIN, HOP, MIN_HOLD = 3.0, 1.0, 14.0   # giay

def to_wav(path):
    out = tempfile.mktemp(suffix='.wav')
    subprocess.run(['ffmpeg','-v','error','-y','-i',path,'-vn','-ac','1','-ar','22050',out], check=True)
    return out

def best_key(chroma):
    best = (-9, None)
    for i in range(12):
        for mode, prof in (('maj', MAJ), ('min', MIN)):
            s = np.corrcoef(chroma, np.roll(prof, i))[0, 1]
            if s > best[0]: best = (s, (i, mode))
    return best  # (diem, (tonic, mode))

def fmt(sec): return f"{int(sec//60)}:{int(sec%60):02d}"
def label(k): return f"{NAMES[k[0]]} {'major' if k[1]=='maj' else 'minor'}"
def relmaj(k): return (k[0] + (3 if k[1]=='min' else 0)) % 12   # nhom tone (tranh nham relative)

def analyze(path):
    wav = to_wav(path)
    try:
        y, sr = librosa.load(wav, sr=22050)
    finally:
        os.remove(wav)
    dur = len(y) / sr
    # BPM (lay nhip cham neu may bao gap doi)
    tempo = float(np.atleast_1d(librosa.feature.tempo(y=y, sr=sr))[0])
    bpm = tempo / 2 if tempo > 140 else tempo
    # Tinh do khop 12 tone (dang major; bai minor se khop voi relative major) cho tung cua so
    corr, times = [], []
    for s in np.arange(0, dur - WIN, HOP):
        c = librosa.feature.chroma_cqt(y=y[int(s*sr):int((s+WIN)*sr)], sr=sr).mean(1)
        c = np.nan_to_num(c); c = c / (c.sum() + 1e-9)
        corr.append([sum(c[(i + n) % 12] for n in SCALE) for i in range(12)]); times.append(s)
    corr = np.array(corr)
    # Key chinh: xem bai la major hay minor bang chroma toan bai
    c_all = librosa.feature.chroma_cqt(y=y, sr=sr).mean(1)
    sc_all, main_key = best_key(c_all)
    main_group = relmaj(main_key)
    # Len tone: tone moi (lech 1-2 cung) vuot tone chinh va keo dai >= MIN_HOLD giay
    need = int(MIN_HOLD / HOP)
    runs = []   # (bat_dau, ket_thuc, d, diem)
    for d in (1, 2, -1, -2):
        g = (main_group + d) % 12
        fav = (corr[:, g] > corr[:, main_group] + 0.05).astype(float)
        sm = np.convolve(fav, np.ones(5)/5, mode='same') >= 0.6
        i, n = 0, len(sm)
        while i < n:
            if sm[i]:
                j = i
                while j < n and sm[j]: j += 1
                if (j - i) >= need:
                    k = i
                    while k < j and not fav[k]: k += 1
                    runs.append((k, j, d, float(corr[k:j, g].mean())))
                i = j
            else:
                i += 1
    # Gop cac doan chong len nhau / cach nhau < 10s: giu tone moi co diem cao nhat
    runs.sort(key=lambda r: r[0])
    merged = []
    for r in runs:
        if merged and r[0] <= merged[-1][1] + int(10 / HOP):
            m = merged[-1]
            best = r if r[3] > m[3] else m
            merged[-1] = (min(m[0], r[0]), max(m[1], r[1]), best[2], best[3])
        else:
            merged.append(r)
    mods = []
    for k, j, d, sc in merged:
        t = times[k] + WIN / 2
        mods.append({'time': fmt(t), 'seconds': round(float(t), 1),
                     'to_key_group': NAMES[(main_group + d) % 12]})
    scores = corr.max(1); main_idx = range(len(scores))
    conf = float(sc_all)
    return {
        'duration': fmt(dur), 'duration_sec': round(dur, 1),
        'bpm': round(bpm), 'key': label(main_key),
        'confidence': round(conf, 2), 'needs_check': conf < 0.75,
        'modulations': mods,
    }

if __name__ == '__main__':
    print(json.dumps(analyze(sys.argv[1]), ensure_ascii=False, indent=2))
