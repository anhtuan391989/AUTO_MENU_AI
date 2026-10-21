import re,zlib,json,sys
def get(f):
    b=open(f,'rb').read()
    i=b.find(b'MidiRemoteSavedDeviceInstancesInProject'); j=b.find(b'Data',i); seg=b[j:j+400000]
    for off in range(0,200):
        try:
            d=zlib.decompressobj(15).decompress(seg[off:])
            if len(d)>50: break
        except Exception: continue
    k=d.find(b'{"api"'); txt=d[k:].decode('utf8','replace')
    j,end=json.JSONDecoder().raw_decode(txt); return j
if __name__=='__main__':
    j=get(sys.argv[1]); I=j['objects']['internal']; by={o['id']:o for o in I}
    for o in I:
        if o['type'] in ('ValueBinding','UserFocusHostObject','UserFocusHostValue'):
            print(o['id'],o['type'],json.dumps({k:v for k,v in o.items() if k not in('id','type')})[:400]); 
