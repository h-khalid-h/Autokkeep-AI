import { z } from 'zod';

export const waitlistSchema = z.object({
    email: z.string().email('Please enter a valid email address'),
    handle: z
        .string()
        .min(3, 'Handle must be at least 3 characters')
        .max(20, 'Handle must be less than 20 characters')
        .regex(
            /^[a-z0-9_-]+$/,
            'Handle can only contain lowercase letters, numbers, hyphens, and underscores'
        ),
});

export type WaitlistFormData = z.infer<typeof waitlistSchema>;

// Payment Request Validation
export const createPaymentRequestSchema = z.object({
    amount: z.number().positive('Amount must be greater than 0').max(100000, 'Amount cannot exceed $100,000'),
    currency: z.enum(['USD', 'EUR', 'GBP', 'USDC']),
    description: z.string().min(1, 'Description is required').max(500, 'Description too long'),
    recipientHandle: z
        .string()
        .min(3, 'Handle must be at least 3 characters')
        .max(20, 'Handle must be less than 20 characters')
        .regex(/^[a-z0-9_-]+$/, 'Invalid handle format'),
    recipientName: z.string().optional(),
});

export type CreatePaymentRequestInput = z.infer<typeof createPaymentRequestSchema>;

// Process Payment Validation
export const processPaymentSchema = z.object({
    paymentRequestId: z.string().min(1, 'Payment request ID is required'),
    paymentMethod: z.enum(['card', 'apple-pay', 'crypto']),
    idempotencyKey: z.string().optional(),
});

export type ProcessPaymentInput = z.infer<typeof processPaymentSchema>;
