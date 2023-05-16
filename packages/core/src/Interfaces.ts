import type { Readable } from 'stream';
import type {
	IPollResponse,
	ITriggerResponse,
	IWorkflowSettings as IWorkflowSettingsWorkflow,
	IExecuteFunctions as IExecuteFunctionsBase,
	IExecuteSingleFunctions as IExecuteSingleFunctionsBase,
	IHookFunctions as IHookFunctionsBase,
	ILoadOptionsFunctions as ILoadOptionsFunctionsBase,
	IPollFunctions as IPollFunctionsBase,
	ITriggerFunctions as ITriggerFunctionsBase,
	IWebhookFunctions as IWebhookFunctionsBase,
	BinaryMetadata,
} from 'n8n-workflow';

// TODO: remove these after removing `n8n-core` dependency from `nodes-bases`
export type IExecuteFunctions = IExecuteFunctionsBase;
export type IExecuteSingleFunctions = IExecuteSingleFunctionsBase;
export type IHookFunctions = IHookFunctionsBase;
export type ILoadOptionsFunctions = ILoadOptionsFunctionsBase;
export type IPollFunctions = IPollFunctionsBase;
export type ITriggerFunctions = ITriggerFunctionsBase;
export type IWebhookFunctions = IWebhookFunctionsBase;

export interface IProcessMessage {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	data?: any;
	type: string;
}

export interface IResponseError extends Error {
	statusCode?: number;
}

export interface IUserSettings {
	encryptionKey?: string;
	tunnelSubdomain?: string;
	instanceId?: string;
}

export interface IWorkflowSettings extends IWorkflowSettingsWorkflow {
	errorWorkflow?: string;
	timezone?: string;
	saveManualRuns?: boolean;
}

export interface IWorkflowData {
	pollResponses?: IPollResponse[];
	triggerResponses?: ITriggerResponse[];
}

export namespace BinaryData {
	export type Mode = 'default' | 'filesystem';

	interface BaseConfig {
		mode: Mode;
		availableModes: Array<Exclude<Mode, 'default'>>;
	}

	interface DefaultConfig extends BaseConfig {
		mode: 'default';
	}

	export interface FileSystemConfig extends BaseConfig {
		mode: 'filesystem';
		localStoragePath: string;
		binaryDataTTL: number;
		persistedBinaryDataTTL: number;
	}

	export type Config = DefaultConfig | FileSystemConfig;
}

export interface IBinaryDataManager {
	init(startPurger: boolean): Promise<void>;
	getFileSize(filePath: string): Promise<number>;
	copyBinaryFile(filePath: string, executionId: string): Promise<string>;
	storeBinaryMetadata(identifier: string, metadata: BinaryMetadata): Promise<void>;
	getBinaryMetadata(identifier: string): Promise<BinaryMetadata>;
	storeBinaryData(binaryData: Buffer | Readable, executionId: string): Promise<string>;
	retrieveBinaryDataByIdentifier(identifier: string): Promise<Buffer>;
	getBinaryPath(identifier: string): string;
	getBinaryStream(identifier: string, chunkSize?: number): Readable;
	markDataForDeletionByExecutionId(executionId: string): Promise<void>;
	deleteMarkedFiles(): Promise<unknown>;
	deleteBinaryDataByIdentifier(identifier: string): Promise<void>;
	duplicateBinaryDataByIdentifier(binaryDataId: string, prefix: string): Promise<string>;
	deleteBinaryDataByExecutionId(executionId: string): Promise<void>;
	persistBinaryDataForExecutionId(executionId: string): Promise<void>;
}

export namespace n8n {
	export interface PackageJson {
		name: string;
		version: string;
		n8n?: {
			credentials?: string[];
			nodes?: string[];
		};
		author?: {
			name?: string;
			email?: string;
		};
	}
}
