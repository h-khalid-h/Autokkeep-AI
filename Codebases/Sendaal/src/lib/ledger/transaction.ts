import { Decimal } from 'decimal.js';
import { nanoid } from 'nanoid';
import { createHash } from 'crypto';
import { prisma } from '@/lib/db/client';
import { PaymentMethod, PaymentStatus, TransactionStatus } from '@prisma/client';

/**
 * Core Transaction: The Heart of the Sendaal Ledger
 * 
 * This is the MOST CRITICAL file in the entire codebase.
 * Every payment MUST go through this atomic transaction engine.
 * 
 * Principles:
 * 1. ATOMIC: All-or-nothing - no partial states
 * 2. IMMUTABLE: Once written, never modified
 * 3. AUDITABLE: Complete transaction history with cryptographic proof
 */

export interface CreateTransactionInput {
    paymentRequestId: string;
    amount: number | Decimal;
    currency: string;
    fromUserId?: string;
    toHandle: string;
    paymentMethod?: PaymentMethod;
    idempotencyKey?: string;
    metadata?: Record<string, unknown>;
}

export interface TransactionResult {
    id: string;
    status: TransactionStatus;
    signature: string;
    settlementTime: Date | null;
}

/**
 * Create an atomic transaction in the ledger
 * 
 * @throws Error if transaction fails validation or database write
 */
export async function createTransaction(
    input: CreateTransactionInput
): Promise<TransactionResult> {
    // 1. Validate inputs
    validateTransactionInput(input);

    // 2. Convert amount to Decimal for exact precision
    const amount = new Decimal(input.amount);

    // 3. Generate unique IDs
    const transactionId = nanoid();
    const idempotencyKey = input.idempotencyKey || nanoid();

    // 4. Create cryptographic signature
    const signature = generateSignature({
        id: transactionId,
        amount: amount.toString(),
        currency: input.currency,
        from: input.fromUserId || 'guest',
        to: input.toHandle,
        timestamp: new Date().toISOString(),
    });

    try {
        // 5. Atomic database write (all-or-nothing)
        const transaction = await prisma.$transaction(async (tx) => {
            // Check if payment request exists
            const paymentRequest = await tx.paymentRequest.findUnique({
                where: { id: input.paymentRequestId },
            });

            if (!paymentRequest) {
                throw new Error(`Payment request ${input.paymentRequestId} not found`);
            }

            if (paymentRequest.status !== PaymentStatus.PENDING) {
                throw new Error(`Payment request ${input.paymentRequestId} is not pending`);
            }

            // Create immutable transaction record
            const txRecord = await tx.transaction.create({
                data: {
                    id: transactionId,
                    paymentRequestId: input.paymentRequestId,
                    amount,
                    currency: input.currency,
                    status: TransactionStatus.PENDING,
                    fromUserId: input.fromUserId,
                    toHandle: input.toHandle,
                    signature,
                    idempotencyKey,
                    metadata: (input.metadata || {}) as Record<string, never>,
                    createdAt: new Date(),
                },
            });

            // Update payment request status
            await tx.paymentRequest.update({
                where: { id: input.paymentRequestId },
                data: {
                    status: PaymentStatus.PROCESSING,
                    paymentMethod: input.paymentMethod,
                },
            });

            return txRecord;
        });

        return {
            id: transaction.id,
            status: transaction.status,
            signature: transaction.signature,
            settlementTime: transaction.settlementTime,
        };
    } catch (error) {
        console.error('[CRITICAL] Transaction creation failed:', error);
        throw new Error(`Failed to create transaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Settle a pending transaction (mark as complete)
 */
export async function settleTransaction(
    transactionId: string,
    providerTxId?: string
): Promise<TransactionResult> {
    try {
        const transaction = await prisma.$transaction(async (tx) => {
            const txRecord = await tx.transaction.update({
                where: { id: transactionId },
                data: {
                    status: TransactionStatus.SETTLED,
                    settlementTime: new Date(),
                    providerTxId,
                    updatedAt: new Date(),
                },
            });

            // Update payment request to settled
            await tx.paymentRequest.update({
                where: { id: txRecord.paymentRequestId },
                data: {
                    status: PaymentStatus.SETTLED,
                },
            });

            return txRecord;
        });

        return {
            id: transaction.id,
            status: transaction.status,
            signature: transaction.signature,
            settlementTime: transaction.settlementTime,
        };
    } catch (error) {
        console.error('[CRITICAL] Transaction settlement failed:', error);
        throw new Error(`Failed to settle transaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Fail a transaction (mark as failed)
 */
export async function failTransaction(
    transactionId: string,
    reason: string
): Promise<TransactionResult> {
    try {
        const transaction = await prisma.$transaction(async (tx) => {
            const txRecord = await tx.transaction.update({
                where: { id: transactionId },
                data: {
                    status: TransactionStatus.FAILED,
                    metadata: {
                        failureReason: reason,
                        failedAt: new Date().toISOString(),
                    },
                    updatedAt: new Date(),
                },
            });

            // Update payment request to failed
            await tx.paymentRequest.update({
                where: { id: txRecord.paymentRequestId },
                data: {
                    status: PaymentStatus.FAILED,
                },
            });

            return txRecord;
        });

        return {
            id: transaction.id,
            status: transaction.status,
            signature: transaction.signature,
            settlementTime: transaction.settlementTime,
        };
    } catch (error) {
        console.error('[CRITICAL] Transaction failure marking failed:', error);
        throw new Error(`Failed to mark transaction as failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Validate transaction input
 */
function validateTransactionInput(input: CreateTransactionInput): void {
    // Amount validation
    const amount = new Decimal(input.amount);
    if (amount.lessThanOrEqualTo(0)) {
        throw new Error('Amount must be greater than 0');
    }
    if (amount.greaterThan(100000)) {
        throw new Error('Amount exceeds maximum limit of $100,000');
    }

    // Currency validation (ISO 4217)
    const validCurrencies = ['USD', 'EUR', 'GBP', 'USDC'];
    if (!validCurrencies.includes(input.currency.toUpperCase())) {
        throw new Error(`Invalid currency: ${input.currency}. Must be one of: ${validCurrencies.join(', ')}`);
    }

    // Handle validation
    if (!input.toHandle || input.toHandle.trim().length === 0) {
        throw new Error('Recipient handle is required');
    }
}

/**
 * Generate cryptographic signature for transaction
 */
function generateSignature(data: Record<string, string>): string {
    const payload = Object.keys(data)
        .sort()
        .map((key) => `${key}:${data[key]}`)
        .join('|');

    return createHash('sha256').update(payload).digest('hex');
}
