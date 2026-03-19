import type { ValidationRegistry } from '../types/validation';

const userValidations = require('./user.validation.js');
const vmValidations = require('./vm.validation.js');
const billingValidations = require('./billing.validation.js');
const adminValidations = require('./admin.validation.js');
const solarValidations = require('./solar.validation.js');

const validations: ValidationRegistry = {
	user: userValidations,
	vm: vmValidations,
	billing: billingValidations,
	admin: adminValidations,
	solar: solarValidations,
	common: {
		idParam: require('zod').object({
			params: require('zod').object({
				id: require('zod')
					.string({
						required_error: 'ID is required',
					})
					.cuid('Invalid ID format'),
			}),
		}),
		paginationQuery: require('zod').object({
			query: require('zod').object({
				page: require('zod')
					.string()
					.regex(/^\d+$/, 'Page must be a positive integer')
					.transform(Number)
					.refine((value: number) => value > 0, 'Page must be greater than 0')
					.optional()
					.default('1'),
				limit: require('zod')
					.string()
					.regex(/^\d+$/, 'Limit must be a positive integer')
					.transform(Number)
					.refine((value: number) => value > 0 && value <= 100, 'Limit must be between 1 and 100')
					.optional()
					.default('10'),
				sortBy: require('zod')
					.string()
					.min(1, 'Sort field cannot be empty')
					.optional(),
				sortOrder: require('zod')
					.enum(['asc', 'desc'])
					.optional()
					.default('desc'),
			}),
		}),
		dateRangeQuery: require('zod').object({
			query: require('zod').object({
				startDate: require('zod')
					.string()
					.datetime('Invalid start date format')
					.optional(),
				endDate: require('zod')
					.string()
					.datetime('Invalid end date format')
					.optional(),
			}).refine((data: { startDate?: string; endDate?: string }) => {
				if (data.startDate && data.endDate) {
					return new Date(data.startDate) <= new Date(data.endDate);
				}

				return true;
			}, {
				message: 'Start date must be before or equal to end date',
				path: ['endDate'],
			}),
		}),
	},
};

export type { ValidationRegistry } from '../types/validation';
export default validations;
