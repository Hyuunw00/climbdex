import json,glob,math,re,collections,os
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
R=f'{ROOT}/data'
gyms=json.load(open(f'{R}/gyms.json')); byid={g['id']:g for g in gyms}
meta=json.load(open(f'{R}/spiri7/gyms-meta.json')); meta_by={m['sid']:m for m in meta}
skills={int(f.split('/')[-1][:-5]):json.load(open(f)) for f in glob.glob(f'{R}/spiri7/skill/*.json')}

def hav(a,b,c,d):
    p=math.pi/180; x=(math.sin((c-a)*p/2)**2+math.cos(a*p)*math.cos(c*p)*math.sin((d-b)*p/2)**2); return 2*6371000*math.asin(math.sqrt(x))
def norm(s): return re.sub(r"[\s()\[\]·\-_']|클라이밍|짐|센터|볼더링|점$",'',s.lower())
def sim(a,b):
    a,b=norm(a),norm(b)
    if not a or not b: return 0
    if a in b or b in a: return 1
    A={a[i:i+2] for i in range(len(a)-1)}; B={b[i:i+2] for i in range(len(b)-1)}
    return len(A&B)/max(1,min(len(A),len(B)))
def usage(sid): return sum(r['total_count'] for r in skills[sid]['records']) if sid in skills else -1

MANUAL={322:'문경국제클라이밍센터',765:'빛고을클라이밍 첨단점',402:'써미트클라이밍센터',381:"한'S 클라이밍센터",478:'알레클라임'}
REJECT={173,329,194}
res={}; namediff=[]
for m in meta:
    sid=m['sid']; gid=None
    if sid in MANUAL: gid=next(g['id'] for g in gyms if g['name']==MANUAL[sid])
    elif sid in REJECT: pass
    elif m.get('lat') is not None:
        c=sorted([(sim(m['name'],g['name']),-hav(m['lat'],m['lng'],g['lat'],g['lng']),g) for g in gyms if hav(m['lat'],m['lng'],g['lat'],g['lng'])<=300],key=lambda x:(-x[0],-x[1]))
        if c:
            s,d,g=c[0]; d=-d
            if s>=0.5 and (len(c)==1 or c[1][0]<s): gid=g['id']
            elif len(c)==1 and d<=15 and s>=0.15: gid=g['id']
            elif len(c)==1: namediff.append((m['name'],g['name'],round(d),sid))
    else:
        c=[(sim(m['name'],g['name']),g) for g in gyms]; c=[x for x in c if x[0]>=0.8]
        if len(c)==1: gid=c[0][1]['id']
        elif len(c)>1:
            ex=[x for x in c if norm(x[1]['name'])==norm(m['name'])]
            if len(ex)==1: gid=ex[0][1]['id']
    res[sid]=gid
rev=collections.defaultdict(list)
for sid,gid in res.items():
    if gid: rev[gid].append(sid)
for gid,sids in rev.items():
    if len(sids)>1:
        best=max(sids,key=usage)
        for s in sids:
            if s!=best: res[s]=None
matched={sid:gid for sid,gid in res.items() if gid}

COLOR={'흰색':'#f5f5f5','노랑':'#f4d03f','주황':'#f39c12','초록':'#27ae60','연두':'#8bc34a','파랑':'#2e86de','하늘':'#5dade2','남색':'#1f3a93','빨강':'#e74c3c','핑크':'#ff6fb5','보라':'#8e44ad','갈색':'#8d6e63','회색':'#95a5a6','검정':'#111111','자주':'#8e244d'}
OURS={-3:-1,-2:-0.5,-1:0,0:0.5}
ours=lambda L: OURS.get(L, L if L>0 else max(-2, L+2))
DEFAULT20=['Vb','V0-','V0','V0+']+[f'V{i}' for i in range(1,17)]
def is_template(gr): return [x['name'] for x in gr]==DEFAULT20
def entry(sid,gid):
    gr=skills[sid]['grades']
    if is_template(gr): return None
    u=usage(sid); hasV=all(x['match_level'] is not None for x in gr)
    if hasV: gr=sorted(gr,key=lambda x:x['match_level'])
    tapes=[]
    for x in gr:
        label={'하양':'흰색','주항':'주황'}.get(x['name'],x['name'])
        t={'label':label,'color':COLOR.get(label),'v':None,'vMin':None,'vMax':None}
        vl=re.fullmatch(r'[vV]([bB]|0-|0\+|[0-9]+)',label)
        if vl:
            v={'b':-1,'B':-1,'0-':-0.5,'0+':0.5}.get(vl.group(1)); v=int(vl.group(1)) if v is None else v
            t['v']=v; t['vMin']=int(math.floor(v)); t['vMax']=int(math.ceil(v))
        elif hasV:
            L=x['match_level']; lad=[ours(L+i) for i in range(x['match_scale'] or 1)]
            t['v']=round(sum(lad)/len(lad),2); t['vMin']=int(math.floor(lad[0])); t['vMax']=int(math.ceil(lad[-1]))
        tapes.append(t)
    note=f"spiri7 실력 분포 표, 기록 {u}건." if hasV else f"spiri7 띠 목록만 있음(V·순서 미확인), 기록 {u}건."
    return {'gymId':gid,'name':byid[gid]['name'],'tapes':tapes,'sourceType':'spiri7','sourceUrl':f"https://spiri7.com/gym/{meta_by[sid]['name']}",'confidence':'medium' if (hasV and u>10) else 'low','recordCount':u,'note':note}
new={}
for sid,gid in matched.items():
    if sid in skills:
        e=entry(sid,gid)
        if e: new[gid]=e

g=json.load(open(f'{R}/grades.json')); old={x['gymId']:x for x in g['gyms']}
final={}
for gid,o in old.items():
    n=new.get(gid)
    if not n: final[gid]=o; continue
    if o['sourceType']=='spiri7':
        n=dict(n)
        if ' 커뮤니티 시트와' in o['note']: n['note']+=' 커뮤니티 시트와'+o['note'].split(' 커뮤니티 시트와')[1]
        final[gid]=n; continue
    ol=[t['label'] for t in o['tapes']]; nl=[t['label'] for t in n['tapes']]
    diffs=[f"{t['label']} 시트{ot['v']}/spiri7 {t['v']}" for t in n['tapes'] for ot in o['tapes'] if ot['label']==t['label'] and ot.get('v') is not None and t['v'] is not None and abs(ot['v']-t['v'])>=1.5]
    agree='일치' if ol==nl and not diffs else ('차이: '+str(diffs) if diffs else '순서 차이')
    if n['recordCount']>10 and n['tapes'][0]['v'] is not None:
        n=dict(n); n['note']+=f" 커뮤니티 시트와 {agree}."; final[gid]=n
    else:
        o=dict(o); o['note']=o['note'].split(' spiri7(')[0]+f" spiri7(기록 {n['recordCount']}건)과 {agree}."; final[gid]=o
for gid,n in new.items(): final.setdefault(gid,n)
SMALL_CHAINS={'챌린져','손세동','킹콩','레드포인트','타기'}
def brand(name): return re.split(r'\s|클라이밍|클라임',name)[0]
sig=lambda e: json.dumps([[t['label'],t['vMin'],t['vMax']] for t in e['tapes']],ensure_ascii=False)
chains=collections.defaultdict(collections.Counter)
for e in final.values():
    if e['sourceType']=='spiri7' and e['tapes'][0]['v'] is not None: chains[brand(e['name'])][sig(e)]+=1
for x in gyms:
    b=brand(x['name'])
    if x['id'] in final or b not in chains or len(b)<2: continue
    top,n=chains[b].most_common(1)[0]
    if (n<3 and b not in SMALL_CHAINS) or n<sum(chains[b].values())*0.8: continue
    src=next(e for e in final.values() if brand(e['name'])==b and sig(e)==top)
    final[x['id']]={'gymId':x['id'],'name':x['name'],'tapes':[dict(t) for t in src['tapes']],'sourceType':'inferred-from-brand','sourceUrl':src['sourceUrl'],'confidence':'low','recordCount':0,'note':f"같은 브랜드 {n}곳이 같은 표를 써서 복사({src['name']} 기준)."}
out={'generatedAt':g['generatedAt'],'gyms':sorted(final.values(),key=lambda r:r['name']),'unmatchedCommunityRows':g['unmatchedCommunityRows']}
json.dump(out,open(f'{R}/grades.json','w'),ensure_ascii=False,indent=1)

EX={'bouldering':'볼더링','lead_climbing':'리드','endurance_climbing':'지구력'}
gid2sid={gid:sid for sid,gid in matched.items()}
for x in gyms:
    sid=gid2sid.get(x['id'])
    if sid and meta_by[sid].get('exercises') is not None: x['types']=[t for t in EX.values() if t in {EX[e] for e in meta_by[sid]['exercises'] if e in EX}]
    elif re.search('인공암벽|암벽공원',x['name']): x['types']=['리드']
    elif '볼더' in x['name']: x['types']=['볼더링']
    else: x['types']=[]
json.dump(gyms,open(f'{R}/gyms.json','w'),ensure_ascii=False,indent=2); open(f'{R}/gyms.json','a').write('\n')

miss=[]
for m in meta:
    sid=m['sid']
    if res.get(sid) or sid not in skills or m.get('category2')!='indoor' or is_template(skills[sid]['grades']): continue
    miss.append({'sid':sid,'name':m['name'],'address':m.get('address'),'lat':m.get('lat'),'lng':m.get('lng'),'hits':m.get('hits'),'recordCount':usage(sid),'hasV':all(x['match_level'] is not None for x in skills[sid]['grades'])})
miss.sort(key=lambda x:-x['recordCount'])
json.dump({'note':'spiri7에는 있는데 data/gyms.json(카카오 529곳)에 없는 실내 암장. 같은 자리 다른 이름은 sameLocationDifferentName','gyms':miss,'sameLocationDifferentName':[{'spiri7':a,'ours':b,'dist':d,'sid':s} for a,b,d,s in namediff]},open(f'{ROOT}/docs/research/spiri7-unmatched.json','w'),ensure_ascii=False,indent=1)
print('types:',collections.Counter(' · '.join(x['types']) or '(없음)' for x in gyms).most_common())
print(f"matched {len(matched)} sids ({sum(1 for s in matched if s in skills)} with skill) -> spiri7 entries {len(new)}; grades.json {len(final)} gyms, with V {sum(1 for x in final.values() if x['tapes'][0]['v'] is not None)}; unmatched indoor {len(miss)} (records>10: {sum(1 for x in miss if x['recordCount']>10)})")
