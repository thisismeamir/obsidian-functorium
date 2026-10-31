import * as d3 from 'd3';
import { MindmapNode, NodeKind, EdgeKind } from '../types';
import { GraphIndex } from './graphIndex';

interface SimNode extends d3.SimulationNodeDatum {
	id: string;
	label: string;
	kind: NodeKind;
	content?: string;
}

interface SimLink extends d3.SimulationLinkDatum<SimNode> {
	kind: EdgeKind;
}

export interface PinOverlay {
	slot: number;
	nodeIds: Set<string>;
	active: boolean;
}

export interface AtlasGraphEvents {
	onNodeClick(node: MindmapNode | null, event: MouseEvent): void;
	onFocusChange(id: string | null): void;
}

const radius = (kind: NodeKind): number => (kind === 'atom' ? 5 : 8);

export class AtlasGraph {
	private index?: GraphIndex;
	private simulation?: d3.Simulation<SimNode, SimLink>;
	private svg?: d3.Selection<SVGSVGElement, unknown, null, undefined>;
	private zoom?: d3.ZoomBehavior<SVGSVGElement, unknown>;
	private nodeSel?: d3.Selection<SVGGElement, SimNode, SVGGElement, unknown>;
	private linkSel?: d3.Selection<SVGLineElement, SimLink, SVGGElement, unknown>;
	private nodeById = new Map<string, SimNode>();
	private observer?: ResizeObserver;

	private highlight: Set<string> | null = null;
	private pins: PinOverlay[] = [];
	private visible: Record<NodeKind, boolean> = {
		tag: true,
		function: true,
		atom: true,
	};
	private selected: string | null = null;
	private hovered: string | null = null;
	private focusId: string | null = null;
	private focusSet: Set<string> | null = null;

	constructor(
		private readonly container: HTMLElement,
		private readonly events: AtlasGraphEvents,
	) {}

	render(index: GraphIndex): void {
		this.destroy();
		this.index = index;
		this.focusId = null;
		this.focusSet = null;
		this.hovered = null;
		this.events.onFocusChange(null);

		const { width, height } = this.size();

		const nodes: SimNode[] = index.graph.nodes.map((n) => ({ ...n }));
		const links: SimLink[] = index.graph.edges.map((e) => ({
			source: e.source,
			target: e.target,
			kind: e.kind,
		}));
		this.nodeById = new Map(nodes.map((n) => [n.id, n]));

		const svg = d3
			.select(this.container)
			.append('svg')
			.attr('class', 'functorium-atlas-svg')
			.attr('width', '100%')
			.attr('height', '100%');
		this.svg = svg;

		const root = svg.append('g');

		this.zoom = d3
			.zoom<SVGSVGElement, unknown>()
			.scaleExtent([0.1, 4])
			.on('zoom', (event) => root.attr('transform', event.transform.toString()));
		svg.call(this.zoom);
		svg.on('dblclick.zoom', null);
		svg.on('click', (event: MouseEvent) => this.events.onNodeClick(null, event));

		this.linkSel = root
			.append('g')
			.selectAll<SVGLineElement, SimLink>('line')
			.data(links)
			.join('line')
			.attr('class', (d) => `functorium-atlas-link is-${d.kind}`);

		const nodeSel = root
			.append('g')
			.selectAll<SVGGElement, SimNode>('g')
			.data(nodes, (d) => d.id)
			.join('g')
			.attr('class', (d) => `functorium-atlas-node is-${d.kind}`);
		this.nodeSel = nodeSel;

		nodeSel
			.append('circle')
			.attr('class', 'functorium-atlas-dot')
			.attr('r', (d) => radius(d.kind));

		nodeSel
			.append('text')
			.attr('x', (d) => radius(d.kind) + 5)
			.attr('y', 4)
			.text((d) => d.label);

		nodeSel
			.append('title')
			.text((d) => (d.content ?? d.label).slice(0, 300));

		nodeSel
			.on('click', (event: MouseEvent, d) => {
				event.stopPropagation();
				this.events.onNodeClick(index.nodes.get(d.id) ?? null, event);
			})
			.on('dblclick', (event: MouseEvent, d) => {
				event.stopPropagation();
				if (d.kind !== 'atom') this.setFocus(d.id);
			})
			.on('mouseenter', (_event, d) => {
				this.hovered = d.id;
				this.applyStyles();
			})
			.on('mouseleave', () => {
				this.hovered = null;
				this.applyStyles();
			})
			.call(
				d3
					.drag<SVGGElement, SimNode>()
					.on('start', (event, d) => {
						if (!event.active) this.simulation?.alphaTarget(0.3).restart();
						d.fx = d.x;
						d.fy = d.y;
					})
					.on('drag', (event, d) => {
						d.fx = event.x;
						d.fy = event.y;
					})
					.on('end', (event, d) => {
						if (!event.active) this.simulation?.alphaTarget(0);
						d.fx = null;
						d.fy = null;
					}),
			);

		const endpoint = (x: string | number | SimNode): SimNode =>
			typeof x === 'object' ? x : this.nodeById.get(String(x))!;

		this.simulation = d3
			.forceSimulation<SimNode>(nodes)
			.force(
				'link',
				d3
					.forceLink<SimNode, SimLink>(links)
					.id((d) => d.id)
					.distance((d) => (d.kind === 'membership' ? 36 : 64)),
			)
			.force('charge', d3.forceManyBody<SimNode>().strength(-160))
			.force('collide', d3.forceCollide<SimNode>((d) => radius(d.kind) + 4))
			.force('center', d3.forceCenter(width / 2, height / 2))
			.on('tick', () => {
				this.linkSel
					?.attr('x1', (d) => endpoint(d.source).x ?? 0)
					.attr('y1', (d) => endpoint(d.source).y ?? 0)
					.attr('x2', (d) => endpoint(d.target).x ?? 0)
					.attr('y2', (d) => endpoint(d.target).y ?? 0);

				this.nodeSel?.attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
			});

		this.observer = new ResizeObserver(() => {
			const size = this.size();
			if (!this.simulation || size.width === 0) return;
			this.simulation
				.force('center', d3.forceCenter(size.width / 2, size.height / 2))
				.alpha(0.05)
				.restart();
		});
		this.observer.observe(this.container);

		this.drawPins();
		this.applyStyles();
	}

	setHighlight(ids: Set<string> | null): void {
		this.highlight = ids;
		this.applyStyles();
	}

	setPins(pins: PinOverlay[]): void {
		this.pins = pins;
		this.drawPins();
	}

	setKindVisible(kind: NodeKind, visible: boolean): void {
		this.visible[kind] = visible;
		this.applyStyles();
	}

	setSelected(id: string | null): void {
		this.selected = id;
		this.applyStyles();
	}

	setFocus(id: string | null): void {
		if (id && !this.index?.nodes.has(id)) return;
		this.focusId = id;
		this.focusSet = id && this.index ? this.index.focusSet(id) : null;
		this.applyStyles();
		this.events.onFocusChange(id);
	}

	resetView(): void {
		if (!this.svg || !this.zoom) return;
		this.svg.transition().duration(250).call(this.zoom.transform, d3.zoomIdentity);
	}

	destroy(): void {
		this.simulation?.stop();
		this.simulation = undefined;
		this.observer?.disconnect();
		this.observer = undefined;
		this.nodeSel = undefined;
		this.linkSel = undefined;
		this.container.empty();
	}

	private size(): { width: number; height: number } {
		return {
			width: this.container.clientWidth || 800,
			height: this.container.clientHeight || 600,
		};
	}

	private drawPins(): void {
		if (!this.nodeSel) return;
		const pins = this.pins;

		this.nodeSel.each(function (d) {
			const g = d3.select(this);
			g.selectAll('.functorium-atlas-pin').remove();

			pins
				.filter((p) => p.nodeIds.has(d.id))
				.forEach((p, k) => {
					g.insert('circle', 'text')
						.attr('class', `functorium-atlas-pin is-slot-${p.slot % 6}${p.active ? ' is-active' : ''}`)
						.attr('r', radius(d.kind) + 3 + k * 3);
				});
		});
	}

	private applyStyles(): void {
		if (!this.nodeSel || !this.linkSel || !this.index) return;

		const hover = this.hovered ? this.index.neighborhood(this.hovered) : null;

		const shown = (d: SimNode): boolean =>
			this.visible[d.kind] && (!this.focusSet || this.focusSet.has(d.id));

		const opacity = (id: string): number => {
			let o = 1;
			if (this.highlight && !this.highlight.has(id)) o = 0.12;
			if (hover && !hover.has(id)) o = Math.min(o, 0.2);
			return o;
		};

		const nodeOf = (x: string | number | SimNode): SimNode =>
			typeof x === 'object' ? x : this.nodeById.get(String(x))!;

		this.nodeSel
			.style('display', (d) => (shown(d) ? null : 'none'))
			.style('opacity', (d) => opacity(d.id))
			.classed('is-selected', (d) => d.id === this.selected)
			.classed('is-match', (d) => !!this.highlight && this.highlight.has(d.id));

		this.linkSel
			.style('display', (d) =>
				shown(nodeOf(d.source)) && shown(nodeOf(d.target)) ? null : 'none',
			)
			.style('opacity', (d) =>
				Math.min(opacity(nodeOf(d.source).id), opacity(nodeOf(d.target).id)),
			);
	}
}
