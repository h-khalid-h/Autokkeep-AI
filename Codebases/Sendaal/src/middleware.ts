import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Rate limiting store (in-memory for MVP, use Redis in production)
const rateLimit = new Map<string, { count: number; resetTime: number }>();

const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 100; // 100 requests per minute

export function middleware(request: NextRequest) {
    // Get client identifier (IP address)
    const clientId =
        request.headers.get('x-forwarded-for') ||
        request.headers.get('x-real-ip') ||
        'unknown';

    // Rate limiting for API routes
    if (request.nextUrl.pathname.startsWith('/api/')) {
        const now = Date.now();
        const rateLimitData = rateLimit.get(clientId);

        if (rateLimitData) {
            // Check if window has expired
            if (now > rateLimitData.resetTime) {
                // Reset the counter
                rateLimit.set(clientId, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
            } else {
                // Increment counter
                rateLimitData.count++;

                if (rateLimitData.count > RATE_LIMIT_MAX) {
                    return NextResponse.json(
                        {
                            error: 'Rate limit exceeded',
                            retryAfter: Math.ceil((rateLimitData.resetTime - now) / 1000),
                        },
                        {
                            status: 429,
                            headers: {
                                'Retry-After': String(Math.ceil((rateLimitData.resetTime - now) / 1000)),
                                'X-RateLimit-Limit': String(RATE_LIMIT_MAX),
                                'X-RateLimit-Remaining': String(Math.max(0, RATE_LIMIT_MAX - rateLimitData.count)),
                                'X-RateLimit-Reset': String(rateLimitData.resetTime),
                            },
                        }
                    );
                }
            }
        } else {
            // First request from this client
            rateLimit.set(clientId, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
        }

        // Add rate limit headers to response
        const response = NextResponse.next();
        const currentLimit = rateLimit.get(clientId)!;
        response.headers.set('X-RateLimit-Limit', String(RATE_LIMIT_MAX));
        response.headers.set('X-RateLimit-Remaining', String(Math.max(0, RATE_LIMIT_MAX - currentLimit.count)));
        response.headers.set('X-RateLimit-Reset', String(currentLimit.resetTime));

        return response;
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        '/api/:path*',
        // Don't run middleware on static files
        '/((?!_next/static|_next/image|favicon.ico).*)',
    ],
};
