import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
} from 'n8n-workflow';
import { microsoftApiRequest, microsoftApiRequestAllItems } from '../../transport';
import { updateDisplayOptions } from '@utils/utilities';
import { messageRLC, returnAllOrLimit } from '../../descriptions';

export const properties: INodeProperties[] = [
	messageRLC,
	...returnAllOrLimit,
	{
		displayName: 'Filter Query',
		name: 'filter',
		type: 'string',
		default: '',
		hint: 'Search query to filter attachments. <a href="https://learn.microsoft.com/en-us/graph/filter-query-parameter">More info</a>.',
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		options: [
			{
				displayName: 'Fields',
				name: 'fields',
				type: 'multiOptions',
				description: 'The fields to add to the output',
				default: [],
				options: [
					{
						name: 'contentType',
						value: 'contentType',
					},
					{
						name: 'isInline',
						value: 'isInline',
					},
					{
						name: 'lastModifiedDateTime',
						value: 'lastModifiedDateTime',
					},
					{
						// eslint-disable-next-line n8n-nodes-base/node-param-display-name-miscased
						name: 'name',
						value: 'name',
					},
					{
						// eslint-disable-next-line n8n-nodes-base/node-param-display-name-miscased
						name: 'size',
						value: 'size',
					},
				],
			},
		],
	},
];

const displayOptions = {
	show: {
		resource: ['messageAttachment'],
		operation: ['getAll'],
	},
};

export const description = updateDisplayOptions(displayOptions, properties);

export async function execute(
	this: IExecuteFunctions,
	index: number,
): Promise<INodeExecutionData[]> {
	let responseData;
	const qs = {} as IDataObject;

	const messageId = this.getNodeParameter('messageId', index, undefined, {
		extractValue: true,
	}) as string;

	const returnAll = this.getNodeParameter('returnAll', index);
	const options = this.getNodeParameter('options', index);
	const filter = this.getNodeParameter('filter', index) as string;

	// Have sane defaults so we don't fetch attachment data in this operation
	qs.$select = 'id,lastModifiedDateTime,name,contentType,size,isInline';

	if (options.fields && (options.fields as string[]).length) {
		qs.$select = (options.fields as string[]).map((field) => field.trim()).join(',');
	}

	if (filter) {
		qs.$filter = filter;
	}

	const endpoint = `/messages/${messageId}/attachments`;
	if (returnAll) {
		responseData = await microsoftApiRequestAllItems.call(
			this,
			'value',
			'GET',
			endpoint,
			undefined,
			qs,
		);
	} else {
		qs.$top = this.getNodeParameter('limit', index);
		responseData = await microsoftApiRequest.call(this, 'GET', endpoint, undefined, qs);
		responseData = responseData.value;
	}

	const executionData = this.helpers.constructExecutionMetaData(
		this.helpers.returnJsonArray(responseData as IDataObject),
		{ itemData: { item: index } },
	);

	return executionData;
}
