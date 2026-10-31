import './styles.css';
import { Plugin } from 'obsidian';
import { FunctoriumApi } from './api';
import { JournalSync } from './sync';
import {
	DEFAULT_SETTINGS,
	FunctoriumSettings,
	FunctoriumSettingTab,
} from './settings';
import { ATLAS_VIEW_TYPE, AtlasView } from './atlas/AtlasView';

export default class FunctoriumPlugin extends Plugin {
	settings!: FunctoriumSettings;
	private journalSync!: JournalSync;

	async onload() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		this.settings.pins = [...(this.settings.pins ?? [])];

		this.addSettingTab(new FunctoriumSettingTab(this.app, this));
		this.journalSync = new JournalSync(this);
		this.journalSync.start();

		this.registerView(ATLAS_VIEW_TYPE, (leaf) => new AtlasView(leaf, this));

		this.addRibbonIcon('network', 'Open Atlas', () => {
			void this.activateAtlasView();
		});

		this.addCommand({
			id: 'open-atlas',
			name: 'Open Atlas',
			callback: () => void this.activateAtlasView(),
		});
	}

	get serverUrl(): string {
		const host = this.settings.host
			.trim()
			.replace(/^https?:\/\//, '')
			.replace(/\/+$/, '');

		return `http://${host}:${this.settings.port}`;
	}

	get api(): FunctoriumApi {
		return new FunctoriumApi(this.serverUrl);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async activateAtlasView(): Promise<void> {
		const existing = this.app.workspace.getLeavesOfType(ATLAS_VIEW_TYPE);

		if (existing.length > 0) {
			await this.app.workspace.revealLeaf(existing[0]);
			return;
		}

		const leaf = this.app.workspace.getLeaf('tab');
		await leaf.setViewState({ type: ATLAS_VIEW_TYPE, active: true });
		await this.app.workspace.revealLeaf(leaf);
	}
}
