/**
 * 동시 입찰 테스트: N명이 같은 물품에 동시에 입찰해 정확히 1명만 낙찰되는지 확인.
 * API 서버가 떠 있고, 오늘의 경매가 진행 중이어야 한다.
 *   npm run test:race -- 50
 */
export {};

const BASE = process.env.API_BASE ?? 'http://localhost:4000/api';
const N = Number(process.argv[2] ?? 50);

async function login(loginId: string, password: string): Promise<string> {
  await fetch(`${BASE}/auth/signup`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ loginId, password }),
  });
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ loginId, password }),
  });
  const cookie = res.headers.get('set-cookie') ?? '';
  return cookie.split(';')[0];
}

const today = await (await fetch(`${BASE}/auctions/today`)).json();
const target = today.items.find((i: any) => i.status === 'listed');
if (!target) throw new Error('입찰 가능한 물품이 없습니다. seed를 다시 실행하세요.');

const stamp = Date.now().toString(36);
const cookies = await Promise.all(Array.from({ length: N }, (_, i) => login(`race${stamp}${i}`, 'password123')));

const wait = new Date(target.startsAt).getTime() - Date.now();
if (wait > 0) {
  console.log(`경매 시작까지 ${Math.ceil(wait / 1000)}초 대기…`);
  await new Promise((r) => setTimeout(r, wait + 300));
}

const results = await Promise.all(
  cookies.map((cookie) =>
    fetch(`${BASE}/items/${target.id}/bid`, { method: 'POST', headers: { cookie } })
      .then(async (r) => ({ status: r.status, body: await r.json() }))),
);
const ok = results.filter((r) => r.status === 200);
const conflict = results.filter((r) => r.status === 409);
console.log(`물품: ${target.name}`);
console.log(`동시 요청 ${N}건 → 낙찰 ${ok.length}건, 거절(409) ${conflict.length}건, 기타 ${N - ok.length - conflict.length}건`);
console.log('낙찰 응답:', ok[0]?.body);
if (ok.length !== 1) {
  console.error('FAIL: 낙찰은 정확히 1건이어야 합니다.');
  process.exit(1);
}
console.log('PASS');
