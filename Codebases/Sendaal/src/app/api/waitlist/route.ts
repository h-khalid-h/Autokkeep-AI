import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { waitlistSchema } from '@/lib/validations';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        // Validate input
        const result = waitlistSchema.safeParse(body);
        if (!result.success) {
            return NextResponse.json(
                { error: 'Validation failed', issues: result.error.issues },
                { status: 400 }
            );
        }

        const { email, handle } = result.data;

        // Check for duplicates
        const existing = await prisma.waitlistEntry.findFirst({
            where: {
                OR: [{ email }, { handle }],
            },
        });

        if (existing) {
            return NextResponse.json(
                { error: 'Email or handle already registered' },
                { status: 409 }
            );
        }

        // Create waitlist entry
        const entry = await prisma.waitlistEntry.create({
            data: {
                email,
                handle,
            },
        });

        return NextResponse.json(
            {
                success: true,
                data: {
                    id: entry.id,
                    handle: entry.handle,
                    position: await getWaitlistPosition(entry.id),
                },
            },
            { status: 201 }
        );
    } catch (error) {
        console.error('[API] Waitlist creation failed:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

async function getWaitlistPosition(entryId: string): Promise<number> {
    const count = await prisma.waitlistEntry.count({
        where: {
            createdAt: {
                lte: (
                    await prisma.waitlistEntry.findUnique({
                        where: { id: entryId },
                        select: { createdAt: true },
                    })
                )?.createdAt,
            },
        },
    });
    return count;
}
