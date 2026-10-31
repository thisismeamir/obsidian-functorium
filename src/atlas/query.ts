import { MatchMode, SearchDomain } from '../types';

export type Combinator = 'and' | 'or';

export interface Chip {
	text: string;
	domain: SearchDomain;
	mode: MatchMode;
	negated: boolean;
}

export interface ParsedQuery {
	chips: Chip[];
	combinator: Combinator;
}

const TOKEN = /-?~?"[^"]*"|\S+/g;
const HAS_WORD = /[\p{L}\p{N}]/u;

function parseToken(raw: string): Chip[] {
	let t = raw;

	const negated = t.length > 1 && t.startsWith('-');
	if (negated) t = t.slice(1);

	let mode: MatchMode = 'unordered';
	if (t.startsWith('~')) {
		mode = 'fuzzy';
		t = t.slice(1);
	}

	const quoted = t.startsWith('"');
	t = t.replace(/^"|"$/g, '');

	if (!t || !HAS_WORD.test(t)) return [];

	if (quoted || mode === 'fuzzy') {
		return [{ text: t, domain: 'raw_content', mode, negated }];
	}

	t = t.replace(/^#/, '');

	if (t.startsWith('f/')) {
		const name = t.slice(2).split('/')[0];
		return name ? [{ text: name, domain: 'functions', mode, negated }] : [];
	}

	return t
		.split('/')
		.filter(Boolean)
		.map((text) => ({ text, domain: 'names' as const, mode, negated }));
}

export function parseQuery(input: string): ParsedQuery {
	const tokens = input.match(TOKEN) ?? [];
	const combinator: Combinator = tokens.includes('|') ? 'or' : 'and';

	const chips = tokens
		.filter((token) => token !== '|')
		.flatMap(parseToken);

	return { chips, combinator };
}

export function describeChip(chip: Chip): string {
	switch (chip.domain) {
		case 'names':
			return 'tag';
		case 'functions':
			return 'ƒ';
		case 'raw_content':
			return chip.mode === 'fuzzy' ? '~text' : 'text';
	}
}
