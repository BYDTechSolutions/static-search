import { describe, expect, it } from 'vitest';
import { fold, stem, words } from '../src/index.js';

describe('text analysis', () => {
  it('folds case and accents', () => {
    expect(fold('Café')).toBe('cafe');
    expect(fold('NAÏVE')).toBe('naive');
  });

  it('finds words with their positions', () => {
    expect(words('Hello, world-wide web!')).toEqual([
      { text: 'Hello', start: 0, end: 5 },
      { text: 'world', start: 7, end: 12 },
      { text: 'wide', start: 13, end: 17 },
      { text: 'web', start: 18, end: 21 },
    ]);
  });

  it('brings common English forms together', () => {
    const same = (...forms: string[]) => expect(new Set(forms.map(stem)).size).toBe(1);
    same('reset', 'resets', 'resetting');
    same('page', 'pages');
    same('make', 'making');
    same('install', 'installed', 'installing', 'installs');
    same('company', 'companies');
    same('class', 'classes');
    same('stop', 'stopped');
  });

  it('leaves short words, digits and -ss/-us/-is endings alone', () => {
    expect(stem('bus')).toBe('bus');
    expect(stem('status')).toBe('status');
    expect(stem('analysis')).toBe('analysis');
    expect(stem('access')).toBe('access');
    expect(stem('es2022')).toBe('es2022');
  });
});
