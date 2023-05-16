import { createReadStream } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuid } from 'uuid';
import type { Readable } from 'stream';
import type { BinaryMetadata } from 'n8n-workflow';
import { jsonParse } from 'n8n-workflow';

import type { BinaryData, IBinaryDataManager } from '../Interfaces';
import { FileNotFoundError } from '../errors';

const PREFIX_METAFILE = 'binarymeta';
const PREFIX_PERSISTED_METAFILE = 'persistedmeta';
const MINUTE = 60000;
const HOUR = 3600000;

export class FileSystemBinaryDataManager implements IBinaryDataManager {
	private storagePath: string;

	private ttl: { binaryData: number; persistedData: number };

	constructor(config: BinaryData.FileSystemConfig) {
		this.storagePath = config.localStoragePath;
		this.ttl = {
			binaryData: config.binaryDataTTL * MINUTE,
			persistedData: config.persistedBinaryDataTTL * MINUTE,
		};
	}

	async init(startPurger = false): Promise<void> {
		if (startPurger) {
			setInterval(async () => this.deleteMarkedFiles(), this.ttl.binaryData);
			setInterval(async () => this.deleteMarkedPersistedFiles(), this.ttl.persistedData);
		}

		// Ensure storage folders exists
		await fs.mkdir(this.getBinaryDataMetaPath(), { recursive: true });
		await fs.mkdir(this.getBinaryDataPersistMetaPath(), { recursive: true });

		await this.deleteMarkedFiles();
		await this.deleteMarkedPersistedFiles();
	}

	async getFileSize(identifier: string): Promise<number> {
		const stats = await fs.stat(this.getBinaryPath(identifier));
		return stats.size;
	}

	async copyBinaryFile(filePath: string, executionId: string): Promise<string> {
		const binaryDataId = this.generateFileName(executionId);
		await this.addBinaryIdToPersistMeta(executionId, binaryDataId);
		await this.copyFileToLocalStorage(filePath, binaryDataId);
		return binaryDataId;
	}

	async storeBinaryMetadata(identifier: string, metadata: BinaryMetadata) {
		await fs.writeFile(this.getMetadataPath(identifier), JSON.stringify(metadata), {
			encoding: 'utf-8',
		});
	}

	async getBinaryMetadata(identifier: string): Promise<BinaryMetadata> {
		return jsonParse(await fs.readFile(this.getMetadataPath(identifier), { encoding: 'utf-8' }));
	}

	async storeBinaryData(binaryData: Buffer | Readable, executionId: string): Promise<string> {
		const binaryDataId = this.generateFileName(executionId);
		await this.addBinaryIdToPersistMeta(executionId, binaryDataId);
		await this.saveToLocalStorage(binaryData, binaryDataId);
		return binaryDataId;
	}

	getBinaryStream(identifier: string, chunkSize?: number): Readable {
		return createReadStream(this.getBinaryPath(identifier), { highWaterMark: chunkSize });
	}

	async retrieveBinaryDataByIdentifier(identifier: string): Promise<Buffer> {
		return this.retrieveFromLocalStorage(identifier);
	}

	getBinaryPath(identifier: string): string {
		return this.resolveStoragePath(identifier);
	}

	getMetadataPath(identifier: string): string {
		return this.resolveStoragePath(`${identifier}.metadata`);
	}

	async markDataForDeletionByExecutionId(executionId: string): Promise<void> {
		const tt = new Date(Date.now() + this.ttl.binaryData);
		return fs.writeFile(
			this.resolveStoragePath('meta', `${PREFIX_METAFILE}_${executionId}_${tt.valueOf()}`),
			'',
		);
	}

	async deleteMarkedFiles(): Promise<void> {
		return this.deleteMarkedFilesByMeta(this.getBinaryDataMetaPath(), PREFIX_METAFILE);
	}

	async deleteMarkedPersistedFiles(): Promise<void> {
		return this.deleteMarkedFilesByMeta(
			this.getBinaryDataPersistMetaPath(),
			PREFIX_PERSISTED_METAFILE,
		);
	}

	private async addBinaryIdToPersistMeta(executionId: string, identifier: string): Promise<void> {
		const currentTime = Date.now();
		const timeAtNextHour = currentTime + HOUR - (currentTime % HOUR);
		const timeoutTime = timeAtNextHour + this.ttl.persistedData;

		const filePath = this.resolveStoragePath(
			'persistMeta',
			`${PREFIX_PERSISTED_METAFILE}_${executionId}_${timeoutTime}`,
		);

		return fs
			.readFile(filePath)
			.catch(async () => fs.writeFile(filePath, identifier))
			.then(() => {});
	}

	private async deleteMarkedFilesByMeta(metaPath: string, filePrefix: string): Promise<void> {
		const currentTimeValue = Date.now();
		const metaFileNames = await fs.readdir(metaPath);

		const execsAdded: { [key: string]: number } = {};

		const promises = metaFileNames.reduce<Array<Promise<void>>>((prev, curr) => {
			const [prefix, executionId, ts] = curr.split('_');

			if (prefix !== filePrefix) {
				return prev;
			}

			const execTimestamp = parseInt(ts, 10);

			if (execTimestamp < currentTimeValue) {
				if (execsAdded[executionId]) {
					// do not delete data, only meta file
					prev.push(this.deleteMetaFileByPath(path.join(metaPath, curr)));
					return prev;
				}

				execsAdded[executionId] = 1;
				prev.push(
					this.deleteBinaryDataByExecutionId(executionId).then(async () =>
						this.deleteMetaFileByPath(path.join(metaPath, curr)),
					),
				);
			}

			return prev;
		}, []);

		await Promise.all(promises);
	}

	async duplicateBinaryDataByIdentifier(binaryDataId: string, prefix: string): Promise<string> {
		const newBinaryDataId = this.generateFileName(prefix);

		await fs.copyFile(
			this.resolveStoragePath(binaryDataId),
			this.resolveStoragePath(newBinaryDataId),
		);
		return newBinaryDataId;
	}

	async deleteBinaryDataByExecutionId(executionId: string): Promise<void> {
		const regex = new RegExp(`${executionId}_*`);
		const filenames = await fs.readdir(this.storagePath);

		const promises = filenames.reduce<Array<Promise<void>>>((allProms, filename) => {
			if (regex.test(filename)) {
				allProms.push(fs.rm(this.resolveStoragePath(filename)));
			}
			return allProms;
		}, []);

		await Promise.all(promises);
	}

	async deleteBinaryDataByIdentifier(identifier: string): Promise<void> {
		return this.deleteFromLocalStorage(identifier);
	}

	async persistBinaryDataForExecutionId(executionId: string): Promise<void> {
		return fs.readdir(this.getBinaryDataPersistMetaPath()).then(async (metaFiles) => {
			const promises = metaFiles.reduce<Array<Promise<void>>>((prev, curr) => {
				if (curr.startsWith(`${PREFIX_PERSISTED_METAFILE}_${executionId}_`)) {
					prev.push(fs.rm(path.join(this.getBinaryDataPersistMetaPath(), curr)));
					return prev;
				}

				return prev;
			}, []);

			await Promise.all(promises);
		});
	}

	private generateFileName(prefix: string): string {
		return [prefix, uuid()].join('');
	}

	private getBinaryDataMetaPath() {
		return path.join(this.storagePath, 'meta');
	}

	private getBinaryDataPersistMetaPath() {
		return path.join(this.storagePath, 'persistMeta');
	}

	private async deleteMetaFileByPath(metaFilePath: string): Promise<void> {
		return fs.rm(metaFilePath);
	}

	private async deleteFromLocalStorage(identifier: string) {
		return fs.rm(this.getBinaryPath(identifier));
	}

	private async copyFileToLocalStorage(source: string, identifier: string): Promise<void> {
		await fs.cp(source, this.getBinaryPath(identifier));
	}

	private async saveToLocalStorage(binaryData: Buffer | Readable, identifier: string) {
		await fs.writeFile(this.getBinaryPath(identifier), binaryData);
	}

	private async retrieveFromLocalStorage(identifier: string): Promise<Buffer> {
		const filePath = this.getBinaryPath(identifier);
		try {
			return await fs.readFile(filePath);
		} catch (e) {
			throw new Error(`Error finding file: ${filePath}`);
		}
	}

	private resolveStoragePath(...args: string[]) {
		const returnPath = path.join(this.storagePath, ...args);
		if (path.relative(this.storagePath, returnPath).startsWith('..'))
			throw new FileNotFoundError('Invalid path detected');
		return returnPath;
	}
}
