import { describe, expect, it } from 'vitest';
import { formatCitation, formatInTextCitation, type CitationFields, type InTextCitationFields } from './index';

function fields(overrides: Partial<CitationFields> = {}): CitationFields {
  return {
    authors: ['Jane Doe'],
    title: 'Climate Policy Rhetoric in the 21st Century',
    year: 2020,
    venue: 'Journal of Environmental Communication',
    ...overrides,
  };
}

function inTextFields(overrides: Partial<InTextCitationFields> = {}): InTextCitationFields {
  return { authors: ['Jane Doe'], year: 2020, ...overrides };
}

describe('formatCitation', () => {
  describe('mla', () => {
    it('formats a single author', () => {
      expect(formatCitation('mla', fields())).toBe(
        'Doe, Jane, "Climate Policy Rhetoric in the 21st Century.", Journal of Environmental Communication, 2020.',
      );
    });

    it('formats two authors with "and"', () => {
      expect(formatCitation('mla', fields({ authors: ['Jane Doe', 'John Smith'] }))).toContain('Doe, Jane, and John Smith');
    });

    it('uses "et al." for three or more authors', () => {
      expect(formatCitation('mla', fields({ authors: ['Jane Doe', 'John Smith', 'Amara Chen'] }))).toContain('Doe, Jane, et al.');
    });

    it('falls back to "n.d." when there is no year', () => {
      expect(formatCitation('mla', fields({ year: null }))).toContain('n.d.');
    });

    it('omits the venue segment when there is none', () => {
      const result = formatCitation('mla', fields({ venue: null }));
      expect(result).not.toContain('undefined');
      expect(result).not.toContain('null');
    });

    it('degrades gracefully with no authors', () => {
      expect(formatCitation('mla', fields({ authors: [] }))).toBe(
        '"Climate Policy Rhetoric in the 21st Century.", Journal of Environmental Communication, 2020.',
      );
    });
  });

  describe('apa', () => {
    it('formats a single author as Last, F.', () => {
      expect(formatCitation('apa', fields())).toBe(
        'Doe, J. (2020). Climate Policy Rhetoric in the 21st Century. Journal of Environmental Communication.',
      );
    });

    it('joins two authors with "&"', () => {
      expect(formatCitation('apa', fields({ authors: ['Jane Doe', 'John Smith'] }))).toContain('Doe, J. & Smith, J.');
    });

    it('joins three or more authors with a serial comma and "&"', () => {
      expect(formatCitation('apa', fields({ authors: ['Jane Doe', 'John Smith', 'Amara Chen'] }))).toContain(
        'Doe, J., Smith, J., & Chen, A.',
      );
    });

    it('falls back to "n.d." when there is no year', () => {
      expect(formatCitation('apa', fields({ year: null }))).toContain('(n.d.)');
    });
  });

  describe('chicago', () => {
    it('formats a single author with venue and year', () => {
      expect(formatCitation('chicago', fields())).toBe(
        'Doe, Jane "Climate Policy Rhetoric in the 21st Century." Journal of Environmental Communication (2020).',
      );
    });

    it('uses "et al." for three or more authors', () => {
      expect(formatCitation('chicago', fields({ authors: ['Jane Doe', 'John Smith', 'Amara Chen'] }))).toContain('Doe, Jane et al.');
    });
  });
});

describe('formatInTextCitation', () => {
  describe('mla', () => {
    it('formats a single author with no page number', () => {
      expect(formatInTextCitation('mla', inTextFields())).toBe('(Doe)');
    });

    it('joins two authors with "and"', () => {
      expect(formatInTextCitation('mla', inTextFields({ authors: ['Jane Doe', 'John Smith'] }))).toBe('(Doe and Smith)');
    });

    it('uses "et al." for three or more authors', () => {
      expect(formatInTextCitation('mla', inTextFields({ authors: ['Jane Doe', 'John Smith', 'Amara Chen'] }))).toBe('(Doe et al.)');
    });

    it('falls back to "n.d." when there are no authors', () => {
      expect(formatInTextCitation('mla', inTextFields({ authors: [] }))).toBe('(n.d.)');
    });
  });

  describe('apa', () => {
    it('formats a single author with the year', () => {
      expect(formatInTextCitation('apa', inTextFields())).toBe('(Doe, 2020)');
    });

    it('joins two authors with "&"', () => {
      expect(formatInTextCitation('apa', inTextFields({ authors: ['Jane Doe', 'John Smith'] }))).toBe('(Doe & Smith, 2020)');
    });

    it('uses "et al." for three or more authors', () => {
      expect(formatInTextCitation('apa', inTextFields({ authors: ['Jane Doe', 'John Smith', 'Amara Chen'] }))).toBe('(Doe et al., 2020)');
    });

    it('falls back to "n.d." when there is no year', () => {
      expect(formatInTextCitation('apa', inTextFields({ year: null }))).toBe('(Doe, n.d.)');
    });

    it('omits the author segment when there are no authors', () => {
      expect(formatInTextCitation('apa', inTextFields({ authors: [] }))).toBe('(2020)');
    });
  });

  describe('chicago', () => {
    it('formats a single author with the year, no comma', () => {
      expect(formatInTextCitation('chicago', inTextFields())).toBe('(Doe 2020)');
    });

    it('uses "et al." for three or more authors', () => {
      expect(formatInTextCitation('chicago', inTextFields({ authors: ['Jane Doe', 'John Smith', 'Amara Chen'] }))).toBe(
        '(Doe et al. 2020)',
      );
    });
  });

  it('is visually distinct per format for the same source', () => {
    const result = { mla: formatInTextCitation('mla', inTextFields()), apa: formatInTextCitation('apa', inTextFields()), chicago: formatInTextCitation('chicago', inTextFields()) };
    expect(new Set(Object.values(result)).size).toBe(3);
  });
});
