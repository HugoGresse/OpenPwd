import { describe, expect, it } from 'vitest';
import {
	detectDelimiter,
	importableRows,
	MAX_IMPORT_ROWS,
	parseDelimited,
	parseImport
} from './import';

describe('parseDelimited', () => {
	it('keeps delimiters, quotes and line breaks inside quoted cells', () => {
		const text = 'Bank,"pa,ss ""quoted""","line one\nline two"\nMail,secret,';

		expect(parseDelimited(text, ',')).toEqual([
			['Bank', 'pa,ss "quoted"', 'line one\nline two'],
			['Mail', 'secret', '']
		]);
	});

	it('handles Windows line endings and skips blank lines', () => {
		expect(parseDelimited('a\tb\r\n\r\nc\td\r\n', '\t')).toEqual([
			['a', 'b'],
			['c', 'd']
		]);
	});
});

describe('detectDelimiter', () => {
	it.each([
		['Bank\thttps://bank.example\tjo', '\t'],
		['Bank;https://bank.example;jo', ';'],
		['Bank,https://bank.example,jo', ','],
		['single', ',']
	])('reads %j as %j separated', (text, expected) => {
		expect(detectDelimiter(text)).toBe(expected);
	});

	it('prefers tabs, so commas inside a pasted table stay in their cell', () => {
		expect(detectDelimiter('Bank, main branch\tsecret')).toBe('\t');
	});
});

describe('parseImport', () => {
	it('reads rows without a header in the documented column order', () => {
		const preview = parseImport('Bank\tbank.example\ttreasurer\t s3cret \tAsk first\tsurplus');

		expect(preview.hasHeader).toBe(false);
		expect(preview.rows).toEqual([
			{
				line: 1,
				title: 'Bank',
				url: 'https://bank.example',
				username: 'treasurer',
				password: ' s3cret ',
				note: 'Ask first\nsurplus',
				fields: []
			}
		]);
	});

	it('maps columns by header in any order, in English or French', () => {
		const preview = parseImport(
			'Mot de passe;Nom;Identifiant;PIN\ns3cret;Banque;tresorier;4321\nautre;Mail;;'
		);

		expect(preview.hasHeader).toBe(true);
		expect(preview.rows[0]).toMatchObject({
			line: 2,
			title: 'Banque',
			username: 'tresorier',
			password: 's3cret',
			fields: [{ label: 'PIN', value: '4321' }]
		});
		expect(preview.rows[1]).toMatchObject({ line: 3, title: 'Mail', fields: [] });
	});

	it('flags the rows that cannot be imported and keeps the others', () => {
		const preview = parseImport(
			['Bank,,jo,secret', ',,jo,secret', 'Mail,,jo,', 'Wiki,not a url,jo,secret'].join('\n')
		);

		expect(preview.rows.map((row) => row.problem)).toEqual([
			undefined,
			'Missing title',
			'Missing password',
			'The website is not a valid address'
		]);
		expect(importableRows(preview).map((row) => row.title)).toEqual(['Bank']);
	});

	it('keeps an explicit http address and rejects other schemes', () => {
		const [plain, script] = parseImport(
			'Router,http://192.168.1.1,admin,secret\nBad,javascript:alert(1),x,secret'
		).rows;

		expect(plain?.url).toBe('http://192.168.1.1');
		expect(script?.problem).toBe('The website is not a valid address');
	});

	it('refuses an oversized paste as a whole', () => {
		const text = Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => `Site ${i},,u,p`).join('\n');
		const preview = parseImport(text);

		expect(preview.problem).toContain(`${MAX_IMPORT_ROWS + 1}`);
		expect(importableRows(preview)).toEqual([]);
	});

	it('returns nothing for an empty paste', () => {
		expect(parseImport(' \n\n')).toEqual({ rows: [], hasHeader: false });
	});
});
