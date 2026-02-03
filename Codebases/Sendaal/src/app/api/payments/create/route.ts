import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { createPaymentRequestSchema } from '@/lib/validations';
import { nanoid } from 'nanoid';
import { PaymentStatus } from '@prisma/client';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        // Validate input using Zod
        const result = createPaymentRequestSchema.safeParse(body);
        if (!result.success) {
            return NextResponse.json(
                { error: 'Validation failed', issues: result.error.issues },
                { status: 400 }
            );
        }

        const { amount, currency, description, recipientHandle, recipientName } = result.data;

        // For MVP, we'll create a temporary creator user (in production, this would be authenticated)
        const creatorId = 'temp-creator'; // TODO: Replace with authenticated user ID

        // Create payment request
        const paymentRequest = await prisma.paymentRequest.create({
            data: {
                id: nanoid(),
                amount,
                currency,
                description,
                recipientHandle,
                recipientName,
                status: PaymentStatus.PENDING,
                creatorId, // Will fail until we have real users
            },
        });

        const paymentUrl = `${process.env.NEXT_PUBLIC_APP_URL}/pay/${paymentRequest.id}`;

        return NextResponse.json(
            {
                success: true,
                data: {
                    id: paymentRequest.id,
                    url: paymentUrl,
                    amount: paymentRequest.amount.toString(),
                    currency: paymentRequest.currency,
                    status: paymentRequest.status,
                },
            },
            { status: 201 }
        );
    } catch (error) {
        console.error('[API] Payment request creation failed:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json(
                { error: 'Payment request ID is required' },
                { status: 400 }
            );
        }

        const paymentRequest = await prisma.paymentRequest.findUnique({
            where: { id },
            include: {
                transactions: {
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                },
            },
        });

        if (!paymentRequest) {
            return NextResponse.json(
                { error: 'Payment request not found' },
                { status: 404 }
            );
        }

        return NextResponse.json({
            success: true,
            data: {
                id: paymentRequest.id,
                amount: paymentRequest.amount.toString(),
                currency: paymentRequest.currency,
                description: paymentRequest.description,
                recipientHandle: paymentRequest.recipientHandle,
                recipientName: paymentRequest.recipientName,
                status: paymentRequest.status,
                latestTransaction: paymentRequest.transactions[0] || null,
            },
        });
    } catch (error) {
        console.error('[API] Payment request fetch failed:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
