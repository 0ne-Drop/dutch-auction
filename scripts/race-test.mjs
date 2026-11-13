// 동시 입찰 테스트: N명이 같은 물품에 동시에 입찰해 정확히 1명만 낙찰되는지 확인.
// 백엔드가 떠 있고 오늘의 경매가 있어야 한다(시작 전이면 시작까지 기다림). Node 18 이상.
//   node scripts/race-test.mjs 50
const BASE = process.env.API_BASE ?? 'http://localhost:8080/api'
const N = Number(process.argv[2] ?? 50)

async function login(loginId, password) {
  await fetch(`${BASE}/auth/signup`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ loginId, password }) })
  const res = await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ loginId, password }) })
  if (!res.ok) throw new Error(`login failed: ${res.status}`)
  return (res.headers.get('set-cookie') ?? '').split(';')[0]
}

const today = await (await fetch(`${BASE}/auctions/today`)).json()
if (!today.auction) throw new Error('오늘의 경매가 없습니다. 데모 데이터(SEED_ENABLED=true)로 다시 시작하세요.')
const target = today.items.find((i) => i.status === 'listed')
if (!target) throw new Error('입찰 가능한 물품이 없습니다. 데모 데이터로 다시 시작하세요.')

const stamp = Date.now().toString(36)
const cookies = await Promise.all(Array.from({ length: N }, (_, i) => login(`race${stamp}${i}`.slice(0, 20), 'password123')))

// 공개 API에 가격이 없는지 함께 확인
const leaked = JSON.stringify(today).match(/Price|price/)
console.log(`공개 API 가격 노출: ${leaked ? '있음 (FAIL)' : '없음'}`)

const wait = Date.parse(today.auction.startsAt) - Date.now()
if (wait > 0) {
  console.log(`경매 시작까지 ${Math.ceil(wait / 1000)}초 대기…`)
  await new Promise((r) => setTimeout(r, wait + 300))
}

const results = await Promise.all(
  cookies.map((cookie) =>
    fetch(`${BASE}/items/${target.id}/bid`, { method: 'POST', headers: { cookie } }).then(async (r) => ({ status: r.status, body: await r.json() }))),
)
const ok = results.filter((r) => r.status === 200)
const conflict = results.filter((r) => r.status === 409)
console.log(`물품: ${target.name}`)
console.log(`동시 요청 ${N}건 → 낙찰 ${ok.length}건, 거절(409) ${conflict.length}건, 기타 ${N - ok.length - conflict.length}건`)
console.log('낙찰 응답:', ok[0]?.body)

// 접속자 수: 3명이 하트비트를 보내면 3명으로 세는지
const counts = []
for (const cookie of cookies.slice(0, 3)) {
  const r = await fetch(`${BASE}/items/${target.id}/presence`, { method: 'POST', headers: { cookie } })
  counts.push((await r.json()).viewers)
}
console.log(`접속자 수(하트비트 1~3명): ${counts.join(' → ')}`)

const pass = ok.length === 1 && !leaked && counts[2] >= 3
console.log(pass ? 'PASS' : 'FAIL')
process.exit(pass ? 0 : 1)
