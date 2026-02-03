import { NextRequest, NextResponse } from 'next/server';
import { processPaymentSchema } from '@/lib/validations';
import { createTransaction, settleTransaction } from '@/lib/ledger/transaction';
import { PaymentMethod } from '@prisma/client';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        // Validate input
        const result = processPaymentSchema.safeParse(body);
        if (!result.success) {
            return NextResponse.json(
                { error: 'Validation failed', issues: result.error.issues },
                { status: 400 }
            );
        }

        const { paymentRequestId, paymentMethod, idempotencyKey } = result.data;

        // Map payment method string to enum
        const methodMap: Record<string, PaymentMethod> = {
            'card': PaymentMethod.CARD,
            'apple-pay': PaymentMethod.APPLE_PAY,
            'crypto': PaymentMethod.CRYPTO,
        };

        // Step 1: Create transaction in ledger
        const transaction = await createTransaction({
            paymentRequestId,
            amount: 0, // Will be fetched from payment request in the function
            currency: 'USD', // Will be fetched from payment request
            toHandle: '', // Will be fetched from payment request
            paymentMethod: methodMap[paymentMethod],
            idempotencyKey,
            metadata: {
                userAgent: request.headers.get('user-agent') || 'unknown',
                ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
            },
        });

        // Step 2: Simulate payment processing (in production, call Stripe/Circle here)
        await new Promise((resolve) => setTimeout(resolve, 100)); // Simulate API call

        // Step 3: Settle the transaction
        const settled = await settleTransaction(transaction.id, `mock-provider-${Date.now()}`);

        return NextResponse.json(
            {
                success: true,
                data: {
                    transactionId: settled.id,
                    status: settled.status,
                    settlementTime: settled.settlementTime,
                    signature: settled.signature,
                },
            },
            { status: 200 }
        );
    } catch (error) {
        console.error('[API] Payment processing failed:', error);

        return NextResponse.json(
            {
                error: error instanceof Error ? error.message : 'Internal server error',
                details: process.env.NODE_ENV === 'development' ? error : undefined,
            },
            { status: 500 }
        );
    }
}
