import { Mindmap, MindmapNode } from '../types';

export const ATOM_PREFIX = 'atom:';

function add(map: Map<string, Set<string>>, key: string, value: string): void {
	let set = map.get(key);
	if (!set) map.set(key, (set = new Set()));
	set.add(value);
}

/** Lookup structures over the full atlas graph. Built once per load. */
export class GraphIndex {
	readonly nodes = new Map<string, MindmapNode>();
	readonly parentOf = new Map<string, string>();
	readonly childrenOf = new Map<string, Set<string>>();
	readonly membersOf = new Map<string, Set<string>>();
	readonly tagsOf = new Map<string, Set<string>>();
	readonly universe = new Set<string>();

	constructor(readonly graph: Mindmap) {
		for (const node of graph.nodes) {
			this.nodes.set(node.id, node);
			if (node.kind === 'atom' && node.id.startsWith(ATOM_PREFIX)) {
				this.universe.add(node.id.slice(ATOM_PREFIX.length));
			}
		}

		for (const edge of graph.edges) {
			if (edge.kind === 'tag_hierarchy') {
				this.parentOf.set(edge.target, edge.source);
				add(this.childrenOf, edge.source, edge.target);
			} else {
				add(this.membersOf, edge.source, edge.target);
				add(this.tagsOf, edge.target, edge.source);
			}
		}
	}

	/** Matched atoms, their tags, and those tags' ancestors. */
	highlight(hashes: ReadonlySet<string>): Set<string> {
		const out = new Set<string>();

		for (const hash of hashes) {
			const atomId = ATOM_PREFIX + hash;
			if (!this.nodes.has(atomId)) continue;
			out.add(atomId);

			for (const tag of this.tagsOf.get(atomId) ?? []) {
				let current: string | undefined = tag;
				while (current && !out.has(current)) {
					out.add(current);
					current = this.parentOf.get(current);
				}
			}
		}

		return out;
	}

	/** A tag, all descendant tags, and every member atom. */
	focusSet(tagId: string): Set<string> {
		const out = new Set<string>();
		const stack = [tagId];

		while (stack.length) {
			const id = stack.pop()!;
			if (out.has(id)) continue;
			out.add(id);
			for (const child of this.childrenOf.get(id) ?? []) stack.push(child);
			for (const atom of this.membersOf.get(id) ?? []) out.add(atom);
		}

		return out;
	}

	neighborhood(id: string): Set<string> {
		const out = new Set<string>([id]);
		const parent = this.parentOf.get(id);
		if (parent) out.add(parent);
		for (const x of this.childrenOf.get(id) ?? []) out.add(x);
		for (const x of this.membersOf.get(id) ?? []) out.add(x);
		for (const x of this.tagsOf.get(id) ?? []) out.add(x);
		return out;
	}

	/** Query token that selects this node, or null for atoms. */
	tokenFor(node: MindmapNode): string | null {
		if (node.kind === 'tag') return node.id.slice('tag:'.length);
		if (node.kind === 'function') {
			return 'f/' + node.id.slice('function:'.length).split('/')[0];
		}
		return null;
	}
}
