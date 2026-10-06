import json,os
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
g=json.load(open(f'{ROOT}/data/grades.json'))
q=lambda s: "'"+str(s).replace("'","''")+"'"
rows=[]
for x in g['gyms']:
    tapes=json.dumps([{'label':t['label'],'color':t['color'],'v':t['v'],'vMin':t['vMin'],'vMax':t['vMax']} for t in x['tapes']],ensure_ascii=False)
    rows.append(f"({q(x['gymId'])}, {q(tapes)}::jsonb, 'seed', {q(x['confidence'])}, {x.get('recordCount') if x.get('recordCount') is not None else 'null'}, {q(x.get('note',''))})")
sql="-- data/grades.json에서 생성 (scripts/seed-tapes.py). 사용자가 만든 행(source='user')은 덮어쓰지 않음\n"
sql+="insert into public.gym_tapes (gym_id, tapes, source, confidence, record_count, note) values\n"+",\n".join(rows)
sql+="\non conflict (gym_id) do update set tapes = excluded.tapes, confidence = excluded.confidence, record_count = excluded.record_count, note = excluded.note, updated_at = now()\nwhere public.gym_tapes.source = 'seed';\n"
open(f'{ROOT}/supabase/seed-tapes.sql','w').write(sql)
print(len(rows),'rows')
