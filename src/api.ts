import { requestUrl } from 'obsidian';
import { Mindmap, MindmapRequest, SearchRequest } from './types';

export interface ServerHealth {
	status: string;
	service: string;
}

export interface Atom {
	id: string;
	raw_content: string;
	methods: string[];
}

export class FunctoriumApi {
	constructor(private readonly baseUrl: string) {}

	async get<T>(path: string): Promise<T> {
		const response = await requestUrl({
			url: `${this.baseUrl}${path}`,
			method: 'GET',
		});

		return response.json as T;
	}

	async post<T>(path: string, body?: unknown): Promise<T> {
		const response = await requestUrl({
			url: `${this.baseUrl}${path}`,
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: body === undefined ? undefined : JSON.stringify(body),
		});

		return response.json as T;
	}

	async postText(path: string, body?: unknown): Promise<string> {
		const response = await requestUrl({
			url: `${this.baseUrl}${path}`,
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: body === undefined ? undefined : JSON.stringify(body),
		});

		return response.text;
	}

	health(): Promise<ServerHealth> {
		return this.get('/health');
	}

	methods(): Promise<string[]> {
		return this.get('/methods');
	}

	journalFiles(): Promise<string[]> {
		return this.get('/journal/files');
	}

	atoms(limit = 100): Promise<Atom[]> {
		return this.get(`/atoms?limit=${limit}`);
	}

	atlas(): Promise<Mindmap> {
		return this.get('/atlas');
	}

	mindmap(request: MindmapRequest): Promise<Mindmap> {
		return this.post('/mindmap/json', request);
	}

	search(request: SearchRequest): Promise<string[]> {
		return this.post('/atlas/search', request);
	}

	noteFromAtoms(ids: string[]): Promise<string> {
		return this.postText('/note/atoms', { ids });
	}

	sync(): Promise<unknown> {
		return this.post('/journal/sync');
	}
}
