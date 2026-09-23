import { normalizeName } from '../../src/catalog/normalize';

describe('normalizeName', () => {
  it('should trim leading and trailing whitespace', () => {
    expect(normalizeName('  hello  ')).toBe('hello');
  });

  it('should convert to lowercase', () => {
    expect(normalizeName('Fazenda Santa Maria')).toBe('fazenda santa maria');
  });

  it('should strip diacritics (accents)', () => {
    expect(normalizeName('São Paulo')).toBe('sao paulo');
    expect(normalizeName('Talhão')).toBe('talhao');
    expect(normalizeName('Ação')).toBe('acao');
    expect(normalizeName('José')).toBe('jose');
    expect(normalizeName('Mamão')).toBe('mamao');
  });

  it('should collapse internal whitespace to a single space', () => {
    expect(normalizeName('Fazenda   Santa   Maria')).toBe('fazenda santa maria');
  });

  it('should handle combined diacritics and whitespace', () => {
    expect(normalizeName('  São   Paulo  ')).toBe('sao paulo');
    expect(normalizeName('  Talhão  Norte  ')).toBe('talhao norte');
  });

  it('should handle empty string after trim', () => {
    expect(normalizeName('   ')).toBe('');
  });

  it('should handle tab and newline whitespace', () => {
    expect(normalizeName('\tFazenda\nSanta\t')).toBe('fazenda santa');
  });

  it('should produce identical output for visually similar names', () => {
    const a = normalizeName('São Paulo');
    const b = normalizeName('sao paulo');
    const c = normalizeName('  SAO PAULO  ');
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it('should not alter numbers or hyphens', () => {
    expect(normalizeName('Talhao-123')).toBe('talhao-123');
  });
});
