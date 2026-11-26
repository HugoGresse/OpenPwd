export const MAX_IMPORT_ROWS = 200;

const DELIMITERS = ['\t', ';', ','] as const;
type Delimiter = (typeof DELIMITERS)[number];

const CORE_COLUMNS = ['title', 'url', 'username', 'password', 'note'] as const;
type CoreColumn = (typeof CORE_COLUMNS)[number];

const HEADER_ALIASES: Record<CoreColumn, readonly string[]> = {
	title: ['title', 'name', 'service', 'titre', 'nom'],
	url: ['url', 'website', 'site', 'link', 'address', 'site web', 'lien', 'adresse'],
	username: ['username', 'user', 'login', 'email', 'e-mail', 'identifiant', 'utilisateur'],
	password: ['password', 'pass', 'pwd', 'mot de passe', 'mdp'],
	note: ['note', 'notes', 'comment', 'comments', 'remarque', 'commentaire']
};

export interface ImportRow {
	line: number;
	title: string;
	url: string;
	username: string;
	password: string;
	note: string;
	fields: { label: string; value: string }[];
	problem?: string;
}

export interface ImportPreview {
	rows: ImportRow[];
	hasHeader: boolean;
	problem?: string;
}

const isLineBreak = (char: string | undefined): boolean => char === '\n' || char === '\r';

/**
 * Index of the quote closing the cell opened at `open`, or -1 when that quote is just a
 * character. Documents and spreadsheets copy a cell as it is, without CSV escaping, unless it
 * holds a line break: a password starting with `"` must not swallow the cells after it.
 */
function closingQuote(text: string, open: number, delimiter: string): number {
	const pasted = delimiter === '\t';
	let spansLines = false;

	for (let index = open + 1; index < text.length; index += 1) {
		const char = text[index];
		if (pasted && char === '\t') return -1;
		if (isLineBreak(char)) spansLines = true;
		if (char !== '"') continue;
		if (text[index + 1] === '"') {
			index += 1;
			continue;
		}
		const next = text[index + 1];
		const endsCell = next === undefined || next === delimiter || isLineBreak(next);
		return endsCell && (spansLines || !pasted) ? index : -1;
	}
	return -1;
}

/** RFC 4180 quoting: a quoted cell may contain the delimiter, line breaks and doubled quotes. */
export function parseDelimited(text: string, delimiter: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let cell = '';

	for (let index = 0; index < text.length; index += 1) {
		const char = text[index] ?? '';
		const closing = char === '"' && cell === '' ? closingQuote(text, index, delimiter) : -1;
		if (closing !== -1) {
			cell = text.slice(index + 1, closing).replaceAll('""', '"');
			index = closing;
		} else if (char === delimiter) {
			row.push(cell);
			cell = '';
		} else if (isLineBreak(char)) {
			if (char === '\r' && text[index + 1] === '\n') index += 1;
			rows.push([...row, cell]);
			row = [];
			cell = '';
		} else {
			cell += char;
		}
	}
	rows.push([...row, cell]);

	return rows.filter((cells) => cells.some((value) => value.trim() !== ''));
}

/** A table copied from Google Docs or Sheets is tab-separated; exported files use , or ; */
export function detectDelimiter(text: string): Delimiter {
	const firstLine = text.split(/\r?\n/).find((line) => line.trim() !== '') ?? '';
	return DELIMITERS.find((delimiter) => firstLine.includes(delimiter)) ?? ',';
}

const normalise = (header: string): string => header.trim().toLowerCase();

const coreColumnOf = (header: string): CoreColumn | undefined =>
	CORE_COLUMNS.find((column) => HEADER_ALIASES[column].includes(normalise(header)));

function normaliseUrl(raw: string): { url: string; problem?: string } {
	const value = raw.trim();
	if (value === '') return { url: '' };
	const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
	const looksLikeHost = !/\s/.test(value) && value.includes('.');
	if (!looksLikeHost || !URL.canParse(candidate)) {
		return { url: value, problem: 'The website is not a valid address' };
	}
	return { url: candidate };
}

/**
 * The first header naming a column gets it. A later one ("Email" after "Login") is kept as a
 * secret field under its own name instead of overwriting the first.
 */
function assignColumns(headers: readonly string[]): (CoreColumn | undefined)[] {
	const taken = new Set<CoreColumn>();
	return headers.map((header) => {
		const column = coreColumnOf(header);
		if (!column || taken.has(column)) return undefined;
		taken.add(column);
		return column;
	});
}

interface Header {
	names: readonly string[];
	columns: readonly (CoreColumn | undefined)[];
}

const spansCells = (value: string): boolean => /[\t\n\r]/.test(value);

function toRow(cells: string[], header: Header | undefined, line: number): ImportRow {
	const row: ImportRow = {
		line,
		title: '',
		url: '',
		username: '',
		password: '',
		note: '',
		fields: []
	};
	const extraNotes: string[] = [];

	cells.forEach((cell, index) => {
		const name = header?.names[index]?.trim();
		const column = header ? header.columns[index] : CORE_COLUMNS[index];
		// Passwords are kept byte for byte: a leading or trailing space may be part of one.
		if (column === 'password') row.password = cell;
		else if (column) row[column] = cell.trim();
		else if (cell.trim() === '') return;
		else if (name) row.fields.push({ label: name, value: cell });
		else extraNotes.push(cell.trim());
	});

	row.note = [row.note, ...extraNotes].filter(Boolean).join('\n');
	const { url, problem: urlProblem } = normaliseUrl(row.url);
	row.url = url;

	if (row.title === '') row.problem = 'Missing title';
	else if (row.password === '') row.problem = 'Missing password';
	else if ([row.title, row.username, row.password].some(spansCells)) {
		row.problem = 'Several cells or lines ended up in one: check the quotes in this row';
	} else if (urlProblem) row.problem = urlProblem;
	return row;
}

export function parseImport(text: string): ImportPreview {
	const table = parseDelimited(text, detectDelimiter(text));
	if (table.length === 0) return { rows: [], hasHeader: false };

	const firstRow = table[0] ?? [];
	const hasHeader = firstRow.some((cell) => coreColumnOf(cell) === 'password');
	const header = hasHeader ? { names: firstRow, columns: assignColumns(firstRow) } : undefined;
	const dataRows = hasHeader ? table.slice(1) : table;
	const rows = dataRows.map((cells, index) => toRow(cells, header, index + (hasHeader ? 2 : 1)));

	if (rows.length > MAX_IMPORT_ROWS) {
		return {
			rows: rows.slice(0, MAX_IMPORT_ROWS),
			hasHeader,
			problem: `Import at most ${MAX_IMPORT_ROWS} rows at a time (found ${rows.length}).`
		};
	}
	return { rows, hasHeader };
}

export const importableRows = (preview: ImportPreview): ImportRow[] =>
	preview.problem ? [] : preview.rows.filter((row) => !row.problem);
