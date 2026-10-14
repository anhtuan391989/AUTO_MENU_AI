import json,sys
rows=json.load(open(sys.argv[1]))
def cls(r):
    t=r['bpm']; c=r['confirmed']
    if c is None: return 'none'
    if abs(c-t)<=1: return 'ok'
    if abs(c-2*t)<=2: return 'x2'
    if abs(c-t/2)<=2: return '/2'
    return 'other'
pats=sorted({r['pattern'] for r in rows},key=lambda x:['every','nohat','kick2','eighths','sparse','sync'].index(x))
for p in pats:
    rs=[r for r in rows if r['pattern']==p]
    line=' '.join(f"{r['bpm']}->{r['confirmed']}" for r in rs)
    cnt={}
    for r in rs: cnt[cls(r)]=cnt.get(cls(r),0)+1
    errs=[abs(r['confirmed']-r['bpm']) for r in rs if r['confirmed'] is not None and cls(r)=='ok']
    print(f"[{p}] {cnt}  meanAbsErr(ok)={sum(errs)/len(errs):.2f}" if errs else f"[{p}] {cnt}")
    print('   ',line)
