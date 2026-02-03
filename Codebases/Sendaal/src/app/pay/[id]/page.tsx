import { PaymentForm } from "@/components/PaymentForm";
import type { PaymentRequest } from "@/lib/types";

// Mock data generator - in real app, this would fetch from DB
function getPaymentRequest(id: string): PaymentRequest {
    return {
        id,
        amount: 2000.00,
        currency: "USD",
        description: "Branding & Identity Design Project",
        recipientHandle: "designpro",
        recipientName: "Design Pro Studio",
    };
}

interface PaymentPageProps {
    params: Promise<{ id: string }>;
}

export default async function PaymentPage({ params }: PaymentPageProps) {
    const { id } = await params;
    const paymentRequest = getPaymentRequest(id);

    return (
        <main className="flex min-h-screen flex-col items-center justify-center p-6 relative overflow-hidden">
            {/* Background gradient effect */}
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 pointer-events-none" />

            <div className="relative z-10 w-full max-w-4xl mx-auto space-y-8">
                {/* Branding */}
                <div className="text-center">
                    <h1 className="text-4xl font-bold tracking-tight mb-2">Sendaal</h1>
                    <p className="text-sm text-muted-foreground">Instant Settlement</p>
                </div>

                {/* Payment Form */}
                <PaymentForm paymentRequest={paymentRequest} />

                {/* Footer Info */}
                <div className="text-center space-y-2 text-xs text-muted-foreground max-w-md mx-auto">
                    <p>No account needed. Your payment settles in seconds, not days.</p>
                    <p>Powered by the Global Settlement Layer.</p>
                </div>
            </div>
        </main>
    );
}
