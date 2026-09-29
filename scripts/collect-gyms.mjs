import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const env = Object.fromEntries(readFileSync('.env', 'utf8').split('\n').filter(Boolean).map((l) => l.split('=')));
const KEY = env.KAKAO_REST_KEY;
const QUERIES = ['클라이밍', '볼더링', '암벽'];
const KOREA = { x1: 124.5, y1: 33.0, x2: 131.9, y2: 38.7 };
const found = new Map();
let calls = 0;

async function search(query, rect, page) {
  const url = new URL('https://dapi.kakao.com/v2/local/search/keyword.json');
  url.searchParams.set('query', query);
  url.searchParams.set('rect', `${rect.x1},${rect.y1},${rect.x2},${rect.y2}`);
  url.searchParams.set('size', '15');
  url.searchParams.set('page', String(page));
  const res = await fetch(url, { headers: { Authorization: `KakaoAK ${KEY}` } });
  calls += 1;
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

async function collect(query, rect, depth = 0) {
  const first = await search(query, rect, 1);
  const total = first.meta.total_count;
  if (total === 0) return;
  if (total > 45 && depth < 12) {
    const mx = (rect.x1 + rect.x2) / 2;
    const my = (rect.y1 + rect.y2) / 2;
    for (const r of [
      { x1: rect.x1, y1: rect.y1, x2: mx, y2: my },
      { x1: mx, y1: rect.y1, x2: rect.x2, y2: my },
      { x1: rect.x1, y1: my, x2: mx, y2: rect.y2 },
      { x1: mx, y1: my, x2: rect.x2, y2: rect.y2 },
    ]) await collect(query, r, depth + 1);
    return;
  }
  let docs = first.documents;
  for (let page = 2; page <= Math.min(3, Math.ceil(total / 15)); page += 1) {
    docs = docs.concat((await search(query, rect, page)).documents);
  }
  for (const d of docs) found.set(d.id, d);
}

const REGION_SHORT = {
  강원특별자치도: '강원', 세종특별자치시: '세종', 전북특별자치도: '전북', 제주특별자치도: '제주',
  전남광주통합특별시: '광주·전남', 서울특별시: '서울', 부산광역시: '부산', 대구광역시: '대구',
  인천광역시: '인천', 광주광역시: '광주', 대전광역시: '대전', 울산광역시: '울산', 경기도: '경기',
  충청북도: '충북', 충청남도: '충남', 전라남도: '전남', 경상북도: '경북', 경상남도: '경남',
};

function isGym(d) {
  const name = d.place_name;
  const category = d.category_name;
  if (/클라이밍짐|암벽장|클라이밍장|볼더링/.test(name) && !/키즈카페|트리클라이밍/.test(name)) return true;
  if (!/클라이밍|볼더|암벽|climb/i.test(`${name} ${category}`)) return false;
  if (/트리클라이밍|용품|의류|장비|시공|건설|무역|충전소|축구|캠핑|스크린/.test(`${name} ${category}`)) return false;
  return true;
}

const RAW = 'data/gyms-raw.json';
if (process.argv.includes('--offline')) {
  for (const d of JSON.parse(readFileSync(RAW, 'utf8'))) found.set(d.id, d);
} else {
  for (const q of QUERIES) {
    const before = found.size;
    await collect(q, KOREA);
    console.log(`${q}: +${found.size - before} (총 ${found.size}, 호출 ${calls})`);
  }
  mkdirSync('data', { recursive: true });
  writeFileSync(RAW, JSON.stringify([...found.values()], null, 2) + '\n');
}

const gyms = [...found.values()].filter(isGym).map((d) => {
  const parts = d.address_name.split(' ');
  return {
    id: d.id,
    name: d.place_name,
    lat: Number(d.y),
    lng: Number(d.x),
    address: d.road_address_name || d.address_name,
    region1: REGION_SHORT[parts[0]] ?? parts[0],
    region2: parts[1],
    category: d.category_name,
    phone: d.phone || null,
    placeUrl: d.place_url,
    kind: '실내',
    image: null,
  };
}).sort((a, b) => a.region1.localeCompare(b.region1, 'ko') || a.region2.localeCompare(b.region2, 'ko') || a.name.localeCompare(b.name, 'ko'));

mkdirSync('data', { recursive: true });
writeFileSync('data/gyms.json', JSON.stringify(gyms, null, 2) + '\n');
const byRegion = {};
for (const g of gyms) byRegion[g.region1] = (byRegion[g.region1] ?? 0) + 1;
console.log(`암장 ${gyms.length}곳 (걸러낸 ${found.size - gyms.length})`);
for (const d of found.values()) if (!isGym(d)) console.log('  걸러냄:', d.place_name, '|', d.category_name);
console.log(byRegion);
