import { App, Notice, PluginSettingTab, requestUrl, Setting } from 'obsidian';
import Functorium from './main';
import { Pin } from './types';

export interface FunctoriumSettings {
	host: string;
	port: number;
	journalFolder: string;
	delimeter: string;
	atlasNoteFolder: string;
	pins: Pin[];
}

export const DEFAULT_SETTINGS: FunctoriumSettings = {
	host: '127.0.0.1',
	port: 7878,
	journalFolder: 'journal',
	delimeter: '---',
	atlasNoteFolder: 'atlas',
	pins: [],
};

export class FunctoriumSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private readonly plugin: Functorium,
	) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl('h2', { text: 'Functorium' });
		containerEl.createEl('p', {
			text: 'Configure the connection to your functorium server.',
		});
		containerEl.createEl('h2', { text: 'General Settings:' });

		new Setting(containerEl)
			.setName('Server Address')
			.setDesc('Hostname or IP address; do not include the port')
			.addText((text) =>
				text
					.setPlaceholder('127.0.0.1')
					.setValue(this.plugin.settings.host)
					.onChange(async (value) => {
						this.plugin.settings.host = value.trim();
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Port Number')
			.setDesc('TCP port exposed by the server.')
			.addText((text) =>
				text
					.setPlaceholder('7878')
					.setValue(String(this.plugin.settings.port))
					.onChange(async (value) => {
						const port = Number(value);

						if (
							value.trim() !== '' &&
							Number.isInteger(port) &&
							port >= 1 &&
							port <= 65535
						) {
							this.plugin.settings.port = port;
							await this.plugin.saveSettings();
						}
					}),
			);

		new Setting(containerEl)
			.setName('Connection')
			.setDesc('Check connection to the server.')
			.addButton((button) =>
				button
					.setButtonText('Test connection')
					.setCta()
					.onClick(async () => {
						button.setButtonText('Connecting…');
						button.setDisabled(true);

						try {
							const response = await requestUrl({
								url: new URL('/health', `${this.plugin.serverUrl}/`).toString(),
								method: 'GET',
								throw: false,
							});

							if (response.status < 200 || response.status >= 300) {
								throw new Error(`HTTP ${response.status}`);
							}

							const health = response.json as {
								service?: string;
								status?: string;
							};

							if (health.status !== 'ok') {
								throw new Error('Unexpected health response');
							}

							new Notice(`Connected to ${health.service ?? 'server'}.`);
						} catch (error) {
							console.error('Functorium connection check failed:', error);
							new Notice('Connection failed. Check the server address and port.');
							new Notice(`Given URL: ${this.plugin.serverUrl}`);
							new Notice(
								`Connection Failed: ${
									error instanceof Error ? error.message : String(error)
								}`,
							);
						} finally {
							button.setButtonText('Test connection');
							button.setDisabled(false);
						}
					}),
			);

		containerEl.createEl('h2', { text: 'Journal Settings:' });

		new Setting(containerEl)
			.setName('Journal folder')
			.setDesc('Vault-relative folder to watch for Markdown changes.')
			.addText((text) =>
				text
					.setPlaceholder('journal')
					.setValue(this.plugin.settings.journalFolder)
					.onChange(async (value) => {
						this.plugin.settings.journalFolder = value.trim();
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Delimeter')
			.setDesc('The deciding syntax to separate atoms.')
			.addText((text) => {
				text
					.setPlaceholder('---')
					.setValue(this.plugin.settings.delimeter)
					.onChange(async (value) => {
						this.plugin.settings.delimeter = value.trim();
						await this.plugin.saveSettings();
					});
			});

		containerEl.createEl('h2', { text: 'Atlas Settings:' });

		new Setting(containerEl)
			.setName('Note folder')
			.setDesc('Vault-relative folder where Atlas notes are saved.')
			.addText((text) =>
				text
					.setPlaceholder('atlas')
					.setValue(this.plugin.settings.atlasNoteFolder)
					.onChange(async (value) => {
						this.plugin.settings.atlasNoteFolder = value.trim();
						await this.plugin.saveSettings();
					}),
			);
	}
}
