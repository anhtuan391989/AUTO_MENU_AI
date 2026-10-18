# Tạo file WAV thử cho thiết bị audio GIẢ của Chromium (--use-file-for-fake-audio-capture): nền nhiễu -75 dBFS / nhạc ~-20 dBFS / số 0 tuyệt đối.
import numpy as np, wave, sys
sr = 48000; rng = np.random.default_rng(1)
def noise(sec, db): return rng.standard_normal(int(sec * sr)) * 10 ** (db / 20)
def music(sec):
    n = int(sec * sr); t = np.arange(n) / sr
    s = sum(np.sin(2 * np.pi * f * t) * a for f, a in [(220, .5), (277.2, .4), (329.6, .4), (440, .3)]) * (0.6 + 0.4 * np.sin(2 * np.pi * 2 * t) ** 2)
    k = np.zeros(n)
    for b in np.arange(0, sec, 0.5):
        i = int(b * sr); L = int(0.12 * sr); k[i:i + L] += np.sin(2 * np.pi * 60 * np.arange(L) / sr) * np.exp(-np.arange(L) / (0.03 * sr)) * 0.8
    s = s + k; return s / np.sqrt(np.mean(s ** 2)) * 10 ** (-20 / 20)
x = np.clip(np.concatenate([noise(5, -75), music(10), noise(15, -75), music(8), np.zeros(int(12 * sr))]), -1, 1)
w = wave.open(sys.argv[1] if len(sys.argv) > 1 else 'test_sysaudio.wav', 'wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes((x * 32767).astype('<i2').tobytes()); w.close()
