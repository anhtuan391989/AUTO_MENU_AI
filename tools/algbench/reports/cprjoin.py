import os,sys,json,importlib.util,binascii
spec=importlib.util.spec_from_file_location('cprmr',os.path.join(os.path.dirname(os.path.abspath(__file__)),'cprmr.py')); m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
def join(f):
    j=m.get(f); O=j['objects']; allo={o['id']:o for o in O['internal']+O['external']}
    M=lambda i:allo[i]['members']
    rows=[]
    surf=[o for o in allo.values() if o['type']=='Surface' and 'SurfaceElements' in o['members']]
    # project JSON external Surface
    for s in surf:
        for k in s['members']['SurfaceElements']:
            kn=allo[k]; sv=kn['members']['SurfaceValue']; r=kn['members']['Rect']
            mb=M(sv).get('MidiBinding'); cc=None;ch=None
            if mb:
                cb=M(mb).get('MidiChannelBinding')
                if cb and cb in allo:
                    x=M(cb)
                    for kk,vv in x.items():
                        if isinstance(vv,int) and vv in allo and allo[vv]['type']=='MidiBindingToControlChange': cc=M(vv).get('ControlChangeNumber')
                    if cc is None and 'ControlChangeNumber' in x: cc=x['ControlChangeNumber']
                    ch=x.get('ChannelIndex') if 'ChannelIndex' in x else None
            tgt=None
            for o in allo.values():
                if o['type']=='ValueBinding' and o['members'].get('SurfaceValue')==sv:
                    hv=o['members']['HostValue']
                    for u in allo.values():
                        if u['type']=='UserFocusHostObject' and u['members'].get('Value')==hv: tgt=u['members']
            rows.append((r['Y'],r['X'],cc,tgt))
    return sorted(rows,key=lambda x:(x[0],x[1]))
def pretty(t):
    if not t: return '(không gán)'
    p=t['ObjectBasePath']; sp=t['ObjectSubPath']
    if sp:
        parts=sp.split('\\'); slot=parts[-1]; hx,_,idx=slot.partition('-')
        try: nm=binascii.unhexlify(hx).decode('latin1')
        except Exception: nm=hx
        sp=f'{parts[0]}\\{parts[1]}\\[{nm}]-{idx}'
    return f"{p} {sp} tag={t['ValueTag']} class={t['ObjectClassID'] or '-'}"
if __name__=='__main__':
    for r in join(sys.argv[1]): print(r[0],r[1],'CC',r[2],'->',pretty(r[3]))
