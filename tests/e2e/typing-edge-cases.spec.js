import { test, expect } from '@playwright/test';
import { boot, seedEnemies } from './helpers.js';

test('buffer is dropped when the enemy being typed reaches the hero', async ({ page }) => {
  await boot(page);
  await seedEnemies(page, [{ id: 'dog', word: 'dog', x: 200, y: 200 }]);
  await page.locator('#type-input').focus();
  await page.keyboard.type('do');
  await page.evaluate(() => {
    const e = window.state.enemies[0];
    e.x = window.state.hero.x; e.y = window.state.hero.y;
  });
  await page.waitForFunction(() => window.state.enemies.length === 0);
  expect(await page.evaluate(() => window.state.typedBuffer)).toBe('');
  await expect(page.locator('#type-input')).toHaveValue('');

  const hpBefore = await page.evaluate(() => window.state.hero.hp);
  await seedEnemies(page, [{ id: 'cat', word: 'cat', x: 200, y: 200 }]);
  await page.keyboard.type('cat');
  const s = await page.evaluate(() => ({ hp: window.state.hero.hp, kills: window.state.kills }));
  expect(s.hp).toBe(hpBefore);   // no typo penalty for typing correctly
  expect(s.kills).toBe(1);
});

test('buffer survives when another live enemy still matches it', async ({ page }) => {
  await boot(page);
  await seedEnemies(page, [
    { id: 'cat', word: 'cat', x: 200, y: 200 },
    { id: 'carry', word: 'carry', x: 300, y: 200 },
  ]);
  await page.locator('#type-input').focus();
  await page.keyboard.type('ca');
  await page.evaluate(() => {
    const e = window.state.enemies.find(en => en.id === 'cat');
    e.x = window.state.hero.x; e.y = window.state.hero.y;
  });
  await page.waitForFunction(() => window.state.enemies.length === 1);
  expect(await page.evaluate(() => window.state.typedBuffer)).toBe('ca');
});

test('typing a word shared by two enemies slays the closest one', async ({ page }) => {
  await boot(page);
  // Hero sits at bottom-centre (480, 540): "near" is the closer copy.
  await seedEnemies(page, [
    { id: 'far',  word: 'cat', x: 100, y: 100 },
    { id: 'near', word: 'cat', x: 480, y: 400 },
  ]);
  await page.locator('#type-input').focus();
  await page.keyboard.type('cat');
  const s = await page.evaluate(() => ({
    kills: window.state.kills, buf: window.state.typedBuffer,
    far:  window.state.enemies.find(e => e.id === 'far'),
    near: window.state.enemies.find(e => e.id === 'near') || null,
  }));
  expect(s.kills).toBe(1);
  expect(s.buf).toBe('');
  expect(s.far.dying).toBeFalsy();
  expect(s.near === null || s.near.dying === true).toBe(true);
});

test('green typed letters follow the buffer, including backspace', async ({ page }) => {
  await boot(page);
  await seedEnemies(page, [
    { id: 'dog',  word: 'dog',  x: 200, y: 200 },
    { id: 'door', word: 'door', x: 400, y: 300 },
    { id: 'cat',  word: 'cat',  x: 600, y: 300 },
  ]);
  const lens = () => page.evaluate(() =>
    Object.fromEntries(window.state.enemies.map(e => [e.id, window.typedLenFor(e)])));
  await page.locator('#type-input').focus();
  await page.keyboard.type('do');
  expect(await lens()).toEqual({ dog: 2, door: 2, cat: 0 });
  await page.keyboard.press('Backspace');
  expect(await lens()).toEqual({ dog: 1, door: 1, cat: 0 });
  await page.keyboard.press('Backspace');
  expect(await lens()).toEqual({ dog: 0, door: 0, cat: 0 });
});

test('clearing the whole input at once removes the stalled style', async ({ page }) => {
  await boot(page);
  await seedEnemies(page, [{ id: 'dog', word: 'dog', x: 200, y: 200 }]);
  const input = page.locator('#type-input');
  await input.focus();
  await page.keyboard.type('dx');
  await expect(input).toHaveClass(/stalled/);
  await input.fill('');
  await expect(input).not.toHaveClass(/stalled/);
  expect(await page.evaluate(() => window.state.typedBuffer)).toBe('');
});

test('spawner avoids a word that is already on screen', async ({ page }) => {
  await boot(page);
  await seedEnemies(page, [{ id: 'cat', word: 'cat', x: 200, y: 200 }]);
  const picks = await page.evaluate(() => {
    window.state.wordPool = ['cat', 'dog'];
    const def = { difficultyClass: 'easy' };
    return Array.from({ length: 40 }, () => window.pickWordFor(def));
  });
  expect(new Set(picks)).toEqual(new Set(['dog']));
});

test('spawner reaches outside the difficulty bucket before repeating a word', async ({ page }) => {
  await boot(page);
  await seedEnemies(page, [
    { id: 'cat', word: 'cat', x: 200, y: 200 },
    { id: 'dog', word: 'dog', x: 300, y: 200 },
    { id: 'sun', word: 'sun', x: 400, y: 200 },
  ]);
  const picks = await page.evaluate(() => {
    window.state.wordPool = ['cat', 'dog', 'sun', 'elephant'];
    const def = { difficultyClass: 'easy' };
    return Array.from({ length: 40 }, () => window.pickWordFor(def));
  });
  expect(new Set(picks)).toEqual(new Set(['elephant']));
});

test('spawner still returns a word when every pool word is on screen', async ({ page }) => {
  await boot(page);
  await seedEnemies(page, [{ id: 'cat', word: 'cat', x: 200, y: 200 }]);
  const pick = await page.evaluate(() => {
    window.state.wordPool = ['cat'];
    return window.pickWordFor({ difficultyClass: 'easy' });
  });
  expect(pick).toBe('cat');
});
