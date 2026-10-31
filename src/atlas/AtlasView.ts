import { ItemView, Notice, WorkspaceLeaf, setIcon } from 'obsidian';
import FunctoriumPlugin from '../main';
import { MindmapNode, NodeKind, Pin } from '../types';
import { AtlasGraph, PinOverlay } from './AtlasGraph';
import { GraphIndex } from './graphIndex';
import { NotePanel, PanelState, SelectionInfo } from './NotePanel';
import { QueryInput } from './QueryInput';
import { ParsedQuery, parseQuery } from './query';
import { ChipResolver } from './resolver';
import { saveNoteToVault } from './vaultNote';

export const ATLAS_VIEW_TYPE = 'functorium-atlas';

interface PinState {
	hashes: Set<string>;
	markdown: string | null;
	changed: boolean;
}

export class AtlasView extends ItemView {
	private graph!: AtlasGraph;
	private input!: QueryInput;
	private panel!: NotePanel;
	private legendEl!: HTMLDivElement;
	private breadcrumbEl!: HTMLDivElement;
	private sideEl!: HTMLDivElement;

	private index: GraphIndex | null = null;
	private resolver: ChipResolver | null = null;

	private seq = 0;
	private debounce?: number;
	private typedHashes: Set<string> | null = null;
	private note: { query: string; hashes: Set<string> | null; markdown: string | null } = {
		query: '',
		hashes: null,
		markdown: null,
	};
	private readonly pinState = new Map<string, PinState>();
	private tab = 'live';
	private selection: string | null = null;
	private readonly visible: Record<NodeKind, boolean> = {
		tag: true,
		function: true,
		atom: true,
	};

	constructor(
		leaf: WorkspaceLeaf,
		private readonly plugin: FunctoriumPlugin,
	) {
		super(leaf);
	}

	getViewType(): string {
		return ATLAS_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'Atlas';
	}

	getIcon(): string {
		return 'network';
	}

	async onOpen(): Promise<void> {
		const root = this.contentEl;
		root.empty();
		root.addClass('functorium-atlas');

		const toolbar = root.createDiv({ cls: 'functorium-atlas-toolbar' });
		this.legendEl = toolbar.createDiv({ cls: 'functorium-atlas-legends' });
		this.breadcrumbEl = toolbar.createDiv({ cls: 'functorium-atlas-breadcrumb' });
		const tools = toolbar.createDiv({ cls: 'functorium-atlas-tools' });
		this.iconButton(tools, 'refresh-cw', 'Sync journal and reload', () => void this.syncAndReload());
		this.iconButton(tools, 'maximize', 'Reset view', () => this.graph.resetView());

		const main = root.createDiv({ cls: 'functorium-atlas-main' });
		const graphEl = main.createDiv({ cls: 'functorium-atlas-graph' });
		this.sideEl = main.createDiv({ cls: 'functorium-atlas-side' });
		const composer = root.createDiv({ cls: 'functorium-atlas-composer' });

		this.graph = new AtlasGraph(graphEl, {
			onNodeClick: (node, event) => this.nodeClicked(node, event),
			onFocusChange: (id) => this.renderBreadcrumb(id),
		});

		this.input = new QueryInput(composer, {
			onInput: () => this.scheduleQuery(),
			onSubmit: () => void this.submit(),
		});

		this.panel = new NotePanel(this.app, this, this.sideEl, {
			onTab: (id) => void this.selectTab(id),
			onPin: () => void this.pinLive(),
			onUnpin: (id) => void this.unpin(id),
			onRename: (id, label) => void this.rename(id, label),
			onSave: () => void this.saveCurrent(),
			onCopy: () => void this.copyCurrent(),
			onToken: (token, negated) => this.addToken(token, negated),
			onCloseSelection: () => this.select(null),
		});

		await this.load();
	}

	async onClose(): Promise<void> {
		window.clearTimeout(this.debounce);
		this.graph?.destroy();
	}

	// ── loading ────────────────────────────────────────────────────────────

	private async load(): Promise<void> {
		const api = this.plugin.api;

		try {
			const [mindmap, methods] = await Promise.all([api.atlas(), api.methods()]);

			this.index = new GraphIndex(mindmap);
			this.resolver = new ChipResolver(api, this.index.universe);
			if (this.selection && !this.index.nodes.has(this.selection)) this.selection = null;

			this.input.setMethods(methods);
			this.graph.render(this.index);
			this.graph.setSelected(this.selection);
			this.renderLegend();

			await this.restorePins();
			this.updateOverlays();
			this.refreshPanel();
			this.scheduleQuery();
		} catch (error) {
			console.error('Atlas load failed:', error);
			new Notice('Atlas: failed to load. Is the server running?');
		}
	}

	private async syncAndReload(): Promise<void> {
		try {
			await this.plugin.api.sync();
			await this.load();
		} catch (error) {
			console.error('Atlas sync failed:', error);
			new Notice('Atlas: sync failed.');
		}
	}

	// ── query ──────────────────────────────────────────────────────────────

	private scheduleQuery(): void {
		window.clearTimeout(this.debounce);
		this.debounce = window.setTimeout(() => void this.runQuery(), 200);
	}

	private async runQuery(): Promise<boolean> {
		const token = ++this.seq;
		const parsed = parseQuery(this.input.value);

		if (!this.resolver || !this.index || parsed.chips.length === 0) {
			this.typedHashes = null;
			this.graph.setHighlight(null);
			this.input.setStatus(parsed, { count: null, loading: false });
			return false;
		}

		this.input.setStatus(parsed, { count: null, loading: true });

		try {
			const hashes = await this.resolver.resolve(parsed);
			if (token !== this.seq || !hashes) return false;

			this.typedHashes = hashes;
			this.graph.setHighlight(this.index.highlight(hashes));
			this.input.setStatus(parsed, {
				count: hashes.size,
				loading: false,
				hint: hashes.size === 0 ? this.hintFor(parsed) : undefined,
			});
			return true;
		} catch (error) {
			if (token === this.seq) {
				console.error('Atlas search failed:', error);
				this.input.setStatus(parsed, { count: null, loading: false });
				new Notice('Atlas: search failed.');
			}
			return false;
		}
	}

	private hintFor(parsed: ParsedQuery): { label: string; apply: () => void } | undefined {
		for (const chip of parsed.chips) {
			if (chip.negated || chip.domain !== 'names' || this.input.has(chip.text)) continue;
			const near = this.input.nearest(chip.text);
			if (near) {
				return {
					label: `did you mean ${near}?`,
					apply: () => this.input.replaceText(chip.text, near),
				};
			}
		}

		if (parsed.chips.every((c) => c.domain === 'names' && !c.negated)) {
			const raw = this.input.value.trim();
			return {
				label: 'search as text',
				apply: () => this.input.setValue(`~"${raw}"`, true),
			};
		}

		return undefined;
	}

	private async submit(): Promise<void> {
		const text = this.input.value.trim();
		if (!text) return;

		window.clearTimeout(this.debounce);
		if (!(await this.runQuery()) || !this.typedHashes) return;

		const hashes = this.typedHashes;
		this.tab = 'live';

		try {
			const markdown = hashes.size
				? await this.plugin.api.noteFromAtoms([...hashes])
				: '';
			this.note = { query: text, hashes, markdown };
		} catch (error) {
			console.error('Atlas note failed:', error);
			new Notice('Atlas: failed to generate note.');
			return;
		}

		this.updateOverlays();
		this.refreshPanel();
	}

	// ── graph interaction ──────────────────────────────────────────────────

	private nodeClicked(node: MindmapNode | null, event: MouseEvent): void {
		if (!node) {
			this.select(null);
			return;
		}

		if ((event.ctrlKey || event.metaKey) && this.index) {
			const token = this.index.tokenFor(node);
			if (token) {
				this.addToken(token, event.shiftKey);
				return;
			}
		}

		this.select(node.id);
	}

	private select(id: string | null): void {
		this.selection = id;
		this.graph.setSelected(id);
		this.refreshPanel();
	}

	private addToken(token: string, negated: boolean): void {
		this.input.append(negated ? `-${token}` : token);
		this.input.focus();
	}

	private renderLegend(): void {
		this.legendEl.empty();

		for (const kind of ['tag', 'function', 'atom'] as NodeKind[]) {
			const count = this.index
				? [...this.index.nodes.values()].filter((n) => n.kind === kind).length
				: 0;

			const button = this.legendEl.createEl('button', {
				cls: `functorium-atlas-legend is-${kind}` + (this.visible[kind] ? '' : ' is-off'),
			});
			button.createSpan({ cls: 'functorium-atlas-swatch' });
			button.createSpan({ text: `${kind} ${count}` });
			button.addEventListener('click', () => {
				this.visible[kind] = !this.visible[kind];
				this.graph.setKindVisible(kind, this.visible[kind]);
				this.renderLegend();
			});
		}
	}

	private renderBreadcrumb(id: string | null): void {
		this.breadcrumbEl.empty();
		if (!id) return;

		const sep = id.indexOf(':');
		const prefix = id.slice(0, sep + 1);
		const parts = id.slice(sep + 1).split('/');

		this.breadcrumbEl
			.createEl('button', { text: 'All' })
			.addEventListener('click', () => this.graph.setFocus(null));

		parts.forEach((part, i) => {
			this.breadcrumbEl.createSpan({ text: '›' });
			const target = prefix + parts.slice(0, i + 1).join('/');
			this.breadcrumbEl
				.createEl('button', { text: part })
				.addEventListener('click', () => this.graph.setFocus(target));
		});
	}

	// ── pins ───────────────────────────────────────────────────────────────

	private get pins(): Pin[] {
		return this.plugin.settings.pins;
	}

	private async restorePins(): Promise<void> {
		this.pinState.clear();
		const resolver = this.resolver;
		if (!resolver) return;

		await Promise.all(
			this.pins.map(async (pin) => {
				try {
					const hashes = await resolver.resolve(parseQuery(pin.query));
					if (!hashes) return;
					this.pinState.set(pin.id, {
						hashes,
						markdown: null,
						changed: hashes.size !== pin.atomCount,
					});
				} catch (error) {
					console.error('Atlas pin restore failed:', pin.query, error);
				}
			}),
		);
	}

	private async pinLive(): Promise<void> {
		const { query, hashes, markdown } = this.note;
		if (!query || !hashes || markdown === null) return;

		const used = new Set(this.pins.map((p) => p.slot));
		let slot = 0;
		while (used.has(slot) && slot < 5) slot++;

		const pin: Pin = {
			id: crypto.randomUUID(),
			label: query.length > 32 ? `${query.slice(0, 31)}…` : query,
			query,
			slot,
			atomCount: hashes.size,
			createdAt: Date.now(),
		};

		this.pins.push(pin);
		await this.plugin.saveSettings();
		this.pinState.set(pin.id, { hashes, markdown, changed: false });

		this.note = { query: '', hashes: null, markdown: null };
		this.typedHashes = null;
		this.input.setValue('');
		this.input.setStatus({ chips: [], combinator: 'and' }, { count: null, loading: false });
		this.graph.setHighlight(null);

		this.updateOverlays();
		this.refreshPanel();
		this.input.focus();
	}

	private async unpin(id: string): Promise<void> {
		const i = this.pins.findIndex((p) => p.id === id);
		if (i < 0) return;

		this.pins.splice(i, 1);
		this.pinState.delete(id);
		await this.plugin.saveSettings();

		if (this.tab === id) this.tab = 'live';
		this.updateOverlays();
		this.refreshPanel();
	}

	private async rename(id: string, label: string): Promise<void> {
		const pin = this.pins.find((p) => p.id === id);
		if (!pin) return;

		pin.label = label;
		await this.plugin.saveSettings();
		this.refreshPanel();
	}

	private async selectTab(id: string): Promise<void> {
		this.tab = id;

		const state = this.pinState.get(id);
		if (state && state.markdown === null) {
			try {
				state.markdown = state.hashes.size
					? await this.plugin.api.noteFromAtoms([...state.hashes])
					: '';
			} catch (error) {
				console.error('Atlas pin note failed:', error);
				new Notice('Atlas: failed to generate note.');
			}
		}

		this.updateOverlays();
		this.refreshPanel();
	}

	private updateOverlays(): void {
		if (!this.index) return;
		const index = this.index;

		const overlays: PinOverlay[] = this.pins.map((pin) => ({
			slot: pin.slot,
			nodeIds: index.highlight(this.pinState.get(pin.id)?.hashes ?? new Set()),
			active: this.tab === pin.id,
		}));

		this.graph.setPins(overlays);
	}

	// ── side panel ─────────────────────────────────────────────────────────

	private selectionInfo(): SelectionInfo | null {
		if (!this.index || !this.selection) return null;
		const index = this.index;

		const node = index.nodes.get(this.selection);
		if (!node) return null;

		const ids = node.kind === 'atom' ? [...(index.tagsOf.get(node.id) ?? [])] : [node.id];
		const tokens = ids
			.map((id) => index.nodes.get(id))
			.filter((n): n is MindmapNode => !!n)
			.map((n) => index.tokenFor(n))
			.filter((t): t is string => t !== null);

		return { label: node.label, kind: node.kind, content: node.content, tokens };
	}

	private panelState(): PanelState {
		const active = this.pins.find((p) => p.id === this.tab);
		if (!active) this.tab = 'live';

		return {
			tab: this.tab,
			liveQuery: this.note.query,
			liveMarkdown: this.note.markdown,
			pins: this.pins.map((p) => ({
				id: p.id,
				label: p.label,
				slot: p.slot,
				changed: this.pinState.get(p.id)?.changed ?? false,
			})),
			pinMarkdown: active ? (this.pinState.get(active.id)?.markdown ?? null) : null,
			selection: this.selectionInfo(),
		};
	}

	private refreshPanel(): void {
		const state = this.panelState();
		const open = state.liveMarkdown !== null || state.pins.length > 0 || !!state.selection;

		this.sideEl.toggleClass('is-open', open);
		void this.panel.render(state);
	}

	private current(): { title: string; query: string; markdown: string } | null {
		if (this.tab === 'live') {
			const { query, markdown } = this.note;
			return markdown && query ? { title: query, query, markdown } : null;
		}

		const pin = this.pins.find((p) => p.id === this.tab);
		const markdown = pin ? this.pinState.get(pin.id)?.markdown : null;
		return pin && markdown ? { title: pin.label, query: pin.query, markdown } : null;
	}

	private async saveCurrent(): Promise<void> {
		const note = this.current();
		if (!note) return;

		try {
			const file = await saveNoteToVault(
				this.app,
				this.plugin.settings.atlasNoteFolder,
				note.title,
				note.markdown,
				note.query,
			);
			new Notice(`Atlas: saved ${file.path}`);
		} catch (error) {
			console.error('Atlas save failed:', error);
			new Notice('Atlas: failed to save note.');
		}
	}

	private async copyCurrent(): Promise<void> {
		const note = this.current();
		if (!note) return;

		await navigator.clipboard.writeText(note.markdown);
		new Notice('Atlas: note copied.');
	}

	private iconButton(parent: HTMLElement, icon: string, label: string, onClick: () => void): void {
		const button = parent.createEl('button', {
			cls: 'clickable-icon',
			attr: { 'aria-label': label },
		});
		setIcon(button, icon);
		button.addEventListener('click', onClick);
	}
}
