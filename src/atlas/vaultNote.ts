import { App, TFile, normalizePath } from 'obsidian';

function sanitize(title: string): string {
	const cleaned = title
		.replace(/[\\/:*?"<>|#^[\]]/g, '-')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 80);

	return cleaned || 'note';
}

async function ensureFolder(app: App, folder: string): Promise<void> {
	let path = '';

	for (const segment of normalizePath(folder).split('/').filter(Boolean)) {
		path = path ? `${path}/${segment}` : segment;
		if (!app.vault.getAbstractFileByPath(path)) {
			await app.vault.createFolder(path);
		}
	}
}

export async function saveNoteToVault(
	app: App,
	folder: string,
	title: string,
	markdown: string,
	query: string,
): Promise<TFile> {
	await ensureFolder(app, folder);

	const base = `Atlas - ${sanitize(title)}`;
	const dir = normalizePath(folder).replace(/^\/+|\/+$/g, '');
	const pathFor = (n: number) =>
		normalizePath(`${dir ? dir + '/' : ''}${base}${n > 1 ? ` ${n}` : ''}.md`);

	let n = 1;
	while (app.vault.getAbstractFileByPath(pathFor(n))) n++;

	const frontmatter = [
		'---',
		`functorium-query: ${JSON.stringify(query)}`,
		`created: ${new Date().toISOString()}`,
		'---',
		'',
	].join('\n');

	return app.vault.create(pathFor(n), frontmatter + markdown);
}
