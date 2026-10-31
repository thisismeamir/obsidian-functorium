import { ParsedQuery, describeChip } from './query';
import { MethodIndex } from './suggest';

const HINTS: [string, string][] = [
	['physics cosmology', 'tags, all must match'],
	['physics | cosmology', 'any tag matches'],
	['physics -draft', 'exclude a tag'],
	['f/fit', 'function'],
	['"dark matter"', 'raw text'],
	['~"dark mater"', 'fuzzy raw text'],
];

export interface QueryInputEvents {
	onInput(text: string): void;
	onSubmit(text: string): void;
}

export interface StatusInfo {
	count: number | null;
	loading: boolean;
	hint?: { label: string; apply: () => void };
}

export class QueryInput {
	private readonly status: HTMLDivElement;
	private readonly ghost: HTMLDivElement;
	private readonly input: HTMLInputElement;
	private readonly dropdown: HTMLDivElement;

	private methods = new MethodIndex([]);
	private items: string[] = [];
	private active = -1;

	constructor(
		parent: HTMLElement,
		private readonly events: QueryInputEvents,
	) {
		this.status = parent.createDiv({ cls: 'functorium-atlas-status' });

		const field = parent.createDiv({ cls: 'functorium-atlas-field' });
		this.ghost = field.createDiv({ cls: 'functorium-atlas-ghost' });
		this.input = field.createEl('input', {
			type: 'text',
			cls: 'functorium-atlas-input',
			attr: {
				placeholder: 'Query the Atlas…',
				spellcheck: 'false',
				autocomplete: 'off',
			},
		});
		this.dropdown = field.createDiv({ cls: 'functorium-atlas-suggest' });

		this.input.addEventListener('input', () => this.changed());
		this.input.addEventListener('keydown', (e) => this.keydown(e));
		this.input.addEventListener('focus', () => this.refresh());
		this.input.addEventListener('click', () => this.refresh());
		this.input.addEventListener('blur', () =>
			window.setTimeout(() => this.closeDropdown(), 120),
		);
	}

	get value(): string {
		return this.input.value;
	}

	focus(): void {
		this.input.focus();
	}

	setMethods(methods: string[]): void {
		this.methods = new MethodIndex(methods);
		this.refresh();
	}

	has(name: string): boolean {
		return this.methods.has(name);
	}

	nearest(word: string): string | null {
		return this.methods.nearest(word);
	}

	setValue(value: string, notify = false): void {
		this.input.value = value;
		this.refresh();
		if (notify) this.events.onInput(value);
	}

	append(token: string): void {
		const current = this.input.value.trimEnd();
		this.setValue(current ? `${current} ${token} ` : `${token} `, true);
	}

	replaceText(from: string, to: string): void {
		this.setValue(this.input.value.replace(from, to), true);
	}

	setStatus(parsed: ParsedQuery, info: StatusInfo): void {
		this.status.empty();
		if (parsed.chips.length === 0) return;

		parsed.chips.forEach((chip, i) => {
			if (i > 0) {
				this.status.createSpan({
					cls: 'functorium-atlas-op',
					text: parsed.combinator.toUpperCase(),
				});
			}

			const el = this.status.createSpan({
				cls: 'functorium-atlas-chip' + (chip.negated ? ' is-negated' : ''),
			});
			el.createSpan({
				cls: 'functorium-atlas-chip-kind',
				text: (chip.negated ? '¬ ' : '') + describeChip(chip),
			});
			el.createSpan({ text: chip.text });
		});

		const count = info.loading
			? '…'
			: info.count === null
				? ''
				: `${info.count} atom${info.count === 1 ? '' : 's'}`;
		this.status.createSpan({ cls: 'functorium-atlas-count', text: count });

		if (info.hint) {
			const hint = this.status.createEl('button', {
				cls: 'functorium-atlas-hint',
				text: info.hint.label,
			});
			hint.addEventListener('click', info.hint.apply);
		}
	}

	private tokenInfo(): { caret: number; start: number; token: string } {
		const caret = this.input.selectionStart ?? this.input.value.length;
		const before = this.input.value.slice(0, caret);
		const token = /\S*$/.exec(before)![0];
		return { caret, start: caret - token.length, token };
	}

	private changed(): void {
		this.refresh();
		this.events.onInput(this.input.value);
	}

	private refresh(): void {
		const { token } = this.tokenInfo();
		this.items = token ? this.methods.suggest(token) : [];
		this.active = -1;
		this.renderDropdown();
		this.renderGhost();
	}

	private renderGhost(): void {
		this.ghost.empty();
		const { token, caret } = this.tokenInfo();
		const top = this.items[0];
		const atEnd = caret === this.input.value.length;

		if (!atEnd || !top || !top.toLowerCase().startsWith(token.toLowerCase())) return;

		this.ghost.createSpan({ cls: 'is-hidden', text: this.input.value });
		this.ghost.createSpan({ text: top.slice(token.length) });
	}

	private renderDropdown(): void {
		this.dropdown.empty();

		if (this.items.length > 0) {
			this.dropdown.addClass('is-open');
			this.items.forEach((item, i) => {
				const row = this.dropdown.createDiv({
					cls: 'functorium-atlas-suggest-item' + (i === this.active ? ' is-active' : ''),
					text: item,
				});
				row.addEventListener('mousedown', (e) => {
					e.preventDefault();
					this.accept(item);
				});
			});
			return;
		}

		if (this.input.value.trim() === '' && document.activeElement === this.input) {
			this.dropdown.addClass('is-open');
			for (const [example, meaning] of HINTS) {
				const row = this.dropdown.createDiv({ cls: 'functorium-atlas-suggest-hint' });
				row.createSpan({ text: example });
				row.createSpan({ cls: 'is-muted', text: meaning });
			}
			return;
		}

		this.dropdown.removeClass('is-open');
	}

	private closeDropdown(): void {
		this.items = [];
		this.active = -1;
		this.renderDropdown();
		this.renderGhost();
	}

	private accept(suggestion: string): void {
		const { start, caret } = this.tokenInfo();
		const value = this.input.value;
		const suffix = suggestion.endsWith('/') ? '' : ' ';

		this.input.value = value.slice(0, start) + suggestion + suffix + value.slice(caret);
		const position = start + suggestion.length + suffix.length;
		this.input.setSelectionRange(position, position);
		this.changed();
	}

	private keydown(event: KeyboardEvent): void {
		const open = this.items.length > 0;

		if (event.key === 'ArrowDown' && open) {
			event.preventDefault();
			this.active = (this.active + 1) % this.items.length;
			this.renderDropdown();
		} else if (event.key === 'ArrowUp' && open) {
			event.preventDefault();
			this.active = (this.active - 1 + this.items.length) % this.items.length;
			this.renderDropdown();
		} else if (event.key === 'Tab' && open) {
			event.preventDefault();
			this.accept(this.items[this.active >= 0 ? this.active : 0]);
		} else if (event.key === 'Enter') {
			event.preventDefault();
			if (open && this.active >= 0) this.accept(this.items[this.active]);
			else this.events.onSubmit(this.input.value);
		} else if (event.key === 'Escape') {
			if (open) this.closeDropdown();
			else if (this.input.value) this.setValue('', true);
		}
	}
}
