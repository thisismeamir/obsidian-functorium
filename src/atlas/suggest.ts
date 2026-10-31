function distance(a: string, b: string): number {
	let prev = Array.from({ length: b.length + 1 }, (_, i) => i);

	for (let i = 0; i < a.length; i++) {
		const cur = [i + 1];
		for (let j = 0; j < b.length; j++) {
			cur.push(
				Math.min(
					prev[j] + (a[i] === b[j] ? 0 : 1),
					prev[j + 1] + 1,
					cur[j] + 1,
				),
			);
		}
		prev = cur;
	}

	return prev[b.length];
}

export class MethodIndex {
	private readonly names = new Set<string>();
	private readonly functions = new Set<string>();

	constructor(methods: string[]) {
		for (const method of methods) {
			const parts = method.replace(/--/g, '/').split('/').filter(Boolean);

			if (parts[0] === 'f') {
				if (parts[1]) this.functions.add(parts[1]);
				for (const p of parts.slice(1)) this.names.add(p);
			} else {
				for (const p of parts) this.names.add(p);
			}
		}
	}

	has(name: string): boolean {
		return this.names.has(name);
	}

	nearest(word: string): string | null {
		const w = word.toLowerCase();
		const limit = Math.max(1, Math.floor(w.length / 4));
		let best: string | null = null;
		let bestDistance = limit + 1;

		for (const candidate of this.names) {
			const d = distance(w, candidate.toLowerCase());
			if (d < bestDistance) {
				best = candidate;
				bestDistance = d;
			}
		}

		return best;
	}

	/** Full replacement tokens for the token being typed (prefixes preserved). */
	suggest(token: string, limit = 8): string[] {
		const match = /^(-?)(#?)(.*)$/.exec(token)!;
		const [, negation, hash, body] = match;

		if (body.startsWith('"') || body.startsWith('~')) return [];

		const isFunction = body.startsWith('f/');
		const pool = isFunction ? this.functions : this.names;
		let lead = negation + hash;
		let needle = body;

		if (isFunction) {
			lead += 'f/';
			needle = body.slice(2);
		} else {
			const slash = body.lastIndexOf('/');
			lead += body.slice(0, slash + 1);
			needle = body.slice(slash + 1);
		}

		const lower = needle.toLowerCase();
		if (!lower && !isFunction) return [];

		const prefix: string[] = [];
		const inner: string[] = [];

		for (const candidate of pool) {
			const c = candidate.toLowerCase();
			if (c === lower) continue;
			if (c.startsWith(lower)) prefix.push(candidate);
			else if (c.includes(lower)) inner.push(candidate);
		}

		const ranked = [...prefix.sort(), ...inner.sort()]
			.slice(0, limit)
			.map((candidate) => lead + candidate);

		if (!isFunction && body === 'f') ranked.unshift(`${lead}f/`);

		return ranked;
	}
}
