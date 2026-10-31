import { FunctoriumApi } from '../api';
import { Chip, ParsedQuery } from './query';

function intersect(sets: Set<string>[]): Set<string> {
	const [first, ...rest] = [...sets].sort((a, b) => a.size - b.size);
	const out = new Set<string>();
	for (const h of first) if (rest.every((s) => s.has(h))) out.add(h);
	return out;
}

function union(sets: Set<string>[]): Set<string> {
	const out = new Set<string>();
	for (const s of sets) for (const h of s) out.add(h);
	return out;
}

/**
 * Resolves each chip to a hash set with one /atlas/search call (cached),
 * then combines them client-side. Negation is set difference.
 */
export class ChipResolver {
	private readonly cache = new Map<string, Promise<Set<string>>>();

	constructor(
		private readonly api: FunctoriumApi,
		private readonly universe: ReadonlySet<string>,
	) {}

	private resolveChip(chip: Chip): Promise<Set<string>> {
		const key = `${chip.domain}|${chip.mode}|${chip.text}`;
		let hit = this.cache.get(key);

		if (!hit) {
			hit = this.api
				.search({
					names: [chip.text],
					operation: 'and',
					mode: chip.mode,
					domain: chip.domain,
				})
				.then((hashes) => new Set(hashes));

			hit.catch(() => this.cache.delete(key));
			this.cache.set(key, hit);
		}

		return hit;
	}

	async resolve(query: ParsedQuery): Promise<Set<string> | null> {
		if (query.chips.length === 0) return null;

		const sets = await Promise.all(query.chips.map((c) => this.resolveChip(c)));

		const positive: Set<string>[] = [];
		const negative: Set<string>[] = [];
		query.chips.forEach((chip, i) =>
			(chip.negated ? negative : positive).push(sets[i]),
		);

		let result: Set<string>;
		if (positive.length === 0) result = new Set(this.universe);
		else result = query.combinator === 'and' ? intersect(positive) : union(positive);

		for (const set of negative) for (const h of set) result.delete(h);

		return result;
	}
}
