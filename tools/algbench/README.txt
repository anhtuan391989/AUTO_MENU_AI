AI-ALG-02/03 benchmark offline (chạy mã engine THẬT bằng vm; đầu vào tổng hợp; đồng hồ ảo). KHÔNG phải đo runtime Windows / nhạc thật.
  node tools/algbench/bench.js <repoRoot> key   out.json   # 36 ca Key (12 root x major/minor/popLoop)
  node tools/algbench/bench.js <repoRoot> hard  out.json   # nhiễu / không bass / lệch tuning +40, -45
  node tools/algbench/bench.js <repoRoot> hard2 out.json   # lệch tuning -45..+45 cent (88 ca, ~5 phút)
  node tools/algbench/bench.js <repoRoot> bpm2  out.json [every,nohat,kick2,eighths,sparse,sync]   # 14 BPM x kiểu trống
  python3 tools/algbench/summarize_bpm.py out.json
  node tools/algbench/modtest.js <repoRoot>                # ModEngine với KeyEngine giả
Không sửa file nào trong ui/ app/ core/.
