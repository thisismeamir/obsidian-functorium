import { App, Component, MarkdownRenderer, Modal, Setting } from 'obsidian';
import { NodeKind } from '../types';

export interface PanelPin {
	id: string;
	label: string;
	slot: number;
	changed: boolean;
}

export interface SelectionInfo {
	label: string;
	kind: NodeKind;
	content?: string;
	tokens: string[];
}

export interface PanelState {
	tab: string;
	liveQuery: string;
	liveMarkdown: string | null;
	pins: PanelPin[];
	pinMarkdown: string | null;
	selection: SelectionInfo | null;
}

export interface PanelEvents {
	onTab(id: string): void;
	onPin(): void;
	onUnpin(id: string): void;
	onRename(id: string, label: string): void;
	onSave(): void;
	onCopy(): void;
	onToken(token: string, negated: boolean): void;
	onCloseSelection(): void;
}

class RenameModal extends Modal {
	constructor(
		app: App,
		private readonly current: string,
		private readonly onSubmit: (value: string) => void,
	) {
		super(app);
	}

	onOpen(): void {
		let value = this.current;
		const submit = () => {
			this.onSubmit(value.trim() || this.current);
			this.close();
		};

		this.contentEl.createEl('h3', { text: 'Rename pin' });
		new Setting(this.contentEl)
			.addText((text) => {
				text.setValue(value).onChange((v) => (value = v));
				text.inputEl.addEventListener('keydown', (e) => {
					if (e.key === 'Enter') submit();
				});
			})
			.addButton((button) => button.setButtonText('Save').setCta().onClick(submit));
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

export class NotePanel {
	private ticket = 0;

	constructor(
		private readonly app: App,
		private readonly component: Component,
		private readonly el: HTMLElement,
		private readonly events: PanelEvents,
	) {}

	async render(state: PanelState): Promise<void> {
		const ticket = ++this.ticket;
		this.el.empty();

		this.renderSelection(state.selection);
		this.renderTabs(state);

		const live = state.tab === 'live';
		const markdown = live ? state.liveMarkdown : state.pinMarkdown;
		const pin = state.pins.find((p) => p.id === state.tab);

		const actions = this.el.createDiv({ cls: 'functorium-atlas-actions' });
		const hasNote = !!markdown && markdown.trim().length > 0;

		if (live && hasNote) this.button(actions, 'Pin', () => this.events.onPin());
		if (pin) {
			this.button(actions, 'Unpin', () => this.events.onUnpin(pin.id));
			this.button(actions, 'Rename', () =>
				new RenameModal(this.app, pin.label, (v) => this.events.onRename(pin.id, v)).open(),
			);
		}
		if (hasNote) {
			this.button(actions, 'Add to vault', () => this.events.onSave());
			this.button(actions, 'Copy', () => this.events.onCopy());
		}

		const body = this.el.createDiv({ cls: 'functorium-atlas-note markdown-rendered' });

		if (markdown === null) {
			body.createDiv({
				cls: 'functorium-atlas-empty',
				text: live ? 'Press Enter to generate a note.' : 'Loading…',
			});
			return;
		}
		if (!hasNote) {
			body.createDiv({ cls: 'functorium-atlas-empty', text: 'No atoms match.' });
			return;
		}

		const target = createDiv();
		await MarkdownRenderer.render(this.app, markdown, target, '', this.component);
		if (ticket === this.ticket) body.appendChild(target);
	}

	private renderTabs(state: PanelState): void {
		const tabs = this.el.createDiv({ cls: 'functorium-atlas-tabs' });

		const live = tabs.createEl('button', {
			cls: 'functorium-atlas-tab' + (state.tab === 'live' ? ' is-active' : ''),
			text: state.liveQuery ? `Live · ${state.liveQuery}` : 'Live',
		});
		live.addEventListener('click', () => this.events.onTab('live'));

		for (const pin of state.pins) {
			const tab = tabs.createEl('button', {
				cls:
					`functorium-atlas-tab is-slot-${pin.slot % 6}` +
					(state.tab === pin.id ? ' is-active' : ''),
			});
			tab.createSpan({ cls: 'functorium-atlas-tab-dot' });
			tab.createSpan({ text: pin.label });
			if (pin.changed) {
				tab.createSpan({
					cls: 'functorium-atlas-tab-changed',
					text: '•',
					attr: { title: 'Atom set changed since pinned' },
				});
			}
			tab.addEventListener('click', () => this.events.onTab(pin.id));
		}
	}

	private renderSelection(selection: SelectionInfo | null): void {
		if (!selection) return;

		const card = this.el.createDiv({ cls: 'functorium-atlas-card' });
		const head = card.createDiv({ cls: 'functorium-atlas-card-head' });
		head.createDiv({ cls: 'functorium-atlas-card-kind', text: selection.kind });
		const close = head.createEl('button', { cls: 'functorium-atlas-link-button', text: '×' });
		close.addEventListener('click', () => this.events.onCloseSelection());

		card.createDiv({ cls: 'functorium-atlas-card-title', text: selection.label });

		if (selection.content) {
			card.createDiv({ cls: 'functorium-atlas-card-content', text: selection.content });
		}

		if (selection.tokens.length) {
			const row = card.createDiv({ cls: 'functorium-atlas-card-tokens' });
			for (const token of selection.tokens) {
				const chip = row.createEl('button', { cls: 'functorium-atlas-chip', text: token });
				chip.addEventListener('click', (e) =>
					this.events.onToken(token, e.shiftKey),
				);
			}
		}
	}

	private button(parent: HTMLElement, text: string, onClick: () => void): void {
		parent.createEl('button', { text }).addEventListener('click', onClick);
	}
}
