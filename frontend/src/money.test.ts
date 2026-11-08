import { expect, it } from 'vitest';
import { formatMoneyInput, toBaht, toSatang } from './money';
it('converts money without accepting fractional satang or invalid input', () => {
  expect(toSatang('20.5')).toBe(2050);
  expect(toSatang('-0.50')).toBe(-50);
  expect(toSatang('1.999')).toBeNull();
  expect(toSatang('')).toBeNull();
  expect(toBaht(2050)).toBe('20.50');
  expect(toSatang('6,802,057.99')).toBe(680205799);
  expect(toSatang('-97,865.84')).toBe(-9786584);
  expect(toSatang('1,23.45')).toBeNull();
  expect(toBaht(680205799)).toBe('6,802,057.99');
  expect(formatMoneyInput('1234567.8')).toBe('1,234,567.80');
  expect(formatMoneyInput('1.999')).toBe('1.999');
});
