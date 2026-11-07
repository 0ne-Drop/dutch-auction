import assert from 'node:assert/strict';
import { test } from 'node:test';
import { priceAt as serverPrice } from '../price.js';
import { priceAt as screenPrice, durationLabel } from '../../../web/lib/price.js';

const start = new Date('2026-11-07T11:00:00.000Z');
const at = (ms: number) => new Date(start.getTime() + ms);

test('DB interval controls full price-drop steps on both server and screen', () => {
  for (const [elapsed, expected] of [
    [-1, 100000], [0, 100000], [1000, 100000], [4999, 100000],
    [5000, 99500], [9999, 99500], [10000, 99000],
  ]) {
    assert.equal(serverPrice(100000, 1000, start, at(elapsed), 5), expected);
    assert.equal(screenPrice(100000, 1000, +start, +at(elapsed), 5), expected);
  }
  assert.equal(serverPrice(100000, 1000, start, at(1000), 1), 99500);
});

test('server and screen agree for varied DB intervals and elapsed times', () => {
  for (const interval of [1, 5, 7, 60, 601]) {
    for (const elapsed of [-1000, 0, 999, 1000, 4999, 5000, 300000, 599999, 600000, 3600000]) {
      const price = serverPrice(289000, 89000, start, at(elapsed), interval);
      assert.equal(screenPrice(289000, 89000, +start, +at(elapsed), interval), price);
      assert.ok(price >= 89000 && price <= 289000);
    }
  }
});

test('minimum price and ten-won rounding are preserved', () => {
  assert.equal(serverPrice(100001, 1000, start, at(5000), 5), 99500);
  assert.equal(serverPrice(100000, 89001, start, at(3600000), 5), 89001);
});

test('missing or invalid intervals cannot silently fall back to one second', () => {
  for (const interval of [0, -1, 1.5, NaN, Infinity, undefined as unknown as number]) {
    assert.throws(() => serverPrice(100000, 1000, start, at(1000), interval), RangeError);
    assert.throws(() => screenPrice(100000, 1000, +start, +at(1000), interval), RangeError);
  }
});

test('duration text follows DB timestamps, including a ten-minute auction', () => {
  for (const [seconds, label] of [[300, '5분'], [600, '10분'], [90, '1분 30초'], [3661, '1시간 1분 1초'], [0.5, '0.5초']] as const) {
    assert.equal(durationLabel(start.toISOString(), at(seconds * 1000).toISOString()), label);
  }
});
