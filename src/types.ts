export type Operation = 'and' | 'or' | 'and_not' | 'not_and';
export type MatchMode = 'unordered' | 'ordered' | 'fuzzy';
export type SearchDomain = 'names' | 'functions' | 'raw_content';

export type Expansion = 'bounded' | 'unbounded';
export type Layout = 'hierarchical' | 'topological' | 'network';

export type EdgeKind = 'tag_hierarchy' | 'membership';
export type NodeKind = 'tag' | 'function' | 'atom';

export interface MindmapQuery {
	names: string[];
	operation: Operation;
	mode: MatchMode;
	domain: SearchDomain;
}

export interface GraphOptions {
	expansion: Expansion;
	split_paths: boolean;
	include_atoms: boolean;
	include_functions: boolean;
	layout: Layout;
	edges: EdgeKind[];
}

export interface MindmapRequest {
	query: MindmapQuery;
	graph: GraphOptions;
}

export interface MindmapNode {
	id: string;
	label: string;
	kind: NodeKind;
	content?: string;
}

export interface MindmapEdge {
	source: string;
	target: string;
	kind: EdgeKind;
}

export interface Mindmap {
	layout: Layout;
	nodes: MindmapNode[];
	edges: MindmapEdge[];
}

export interface SearchRequest {
	names: string[];
	operation: Operation;
	mode: MatchMode;
	domain: SearchDomain;
}

/** A persisted query. The note is regenerated on open, never stored. */
export interface Pin {
	id: string;
	label: string;
	query: string;
	slot: number;
	atomCount: number;
	createdAt: number;
}
