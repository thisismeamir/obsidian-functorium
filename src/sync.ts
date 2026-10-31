import { normalizePath, Notice, TFolder, TAbstractFile } from 'obsidian';
import FunctoriumPlugin from './main';

export class JournalSync {
	private timer: ReturnType<typeof setTimeout> | undefined;
	private running = false;
	private pending = false;

	constructor(private readonly plugin: FunctoriumPlugin) {}

	start() {
		this.plugin.registerEvent(
			this.plugin.app.vault.on('modify', (file) => this.changed(file)),
		);

		this.plugin.registerEvent(
			this.plugin.app.vault.on('create', (file) => this.changed(file)),
		);

		this.plugin.registerEvent(
			this.plugin.app.vault.on('delete', (file) => this.schedule()),
		);

		this.plugin.registerEvent(
			this.plugin.app.vault.on('rename', (file) => this.changed(file)),
		);

		this.checkJournalStructure();
	}

	private changed(file: TAbstractFile) {
		if (file.name.endsWith('md') && this.inJournal(file.path)) {
			this.schedule();
		}
	}

	private async checkJournalStructure(): Promise<void> {
		const folder = normalizePath(
			`${this.plugin.settings.journalFolder}/.functorium`,
		);

		const exists = await this.plugin.app.vault.adapter.exists(folder);

		if (!exists) {
			new Notice(
				`Functorium: Missing ${folder}/ directory. ` +
					'Some journal operations may not work correctly.',
				0,
			);
		}
	}

	private inJournal(path: string): boolean {
		const folder = normalizePath(
			this.plugin.settings.journalFolder,
		).replace(/^\/+|\/+$/g, '');

		return (
			folder.length > 0 &&
			(path === folder || path.startsWith(`${folder}/`))
		);
	}

	private schedule() {
		this.pending = true;

		if (this.timer) clearTimeout(this.timer);

		this.timer = setTimeout(() => {
			void this.sync();
		}, 1000);
	}

	private async sync() {
		if (this.running) return;

		this.running = true;
		this.pending = false;

		try {
			await this.plugin.api.post('/journal/sync');
		} catch (error) {
			console.error('Functorium journal sync failed:', error);
		} finally {
			this.running = false;

			if (this.pending) this.schedule();
		}
	}
}
