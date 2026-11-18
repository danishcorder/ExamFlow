import { describe, expect, it } from 'vitest';
import { serializeCsv } from '@/lib/csv';

describe('CSV report serialization', () => {
  it('quotes commas and quotes and prevents text formula execution', () => {
    expect(serializeCsv(['Name', 'Notes'], [['Amina, Tariq', 'says "ready"'], ['=HYPERLINK("https://bad")', '+1+1']]))
      .toBe('\uFEFF"Name","Notes"\r\n"Amina, Tariq","says ""ready"""\r\n"\'=HYPERLINK(""https://bad"")","\'+1+1"');
  });

  it('preserves numeric cells and empty values', () => {
    expect(serializeCsv(['Score', 'Feedback'], [[-2, null]])).toBe('\uFEFF"Score","Feedback"\r\n"-2",""');
  });
});
