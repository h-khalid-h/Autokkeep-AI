"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { PaymentMethod, PaymentRequest } from "@/lib/types";

interface PaymentFormProps {
    paymentRequest: PaymentRequest;
}

export function PaymentForm({ paymentRequest }: PaymentFormProps) {
    const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>("card");
    const [isProcessing, setIsProcessing] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const [transactionId] = useState(() => `SDR-${Date.now()}`);

    const handlePay = async () => {
        setIsProcessing(true);

        // Simulate payment processing
        await new Promise((resolve) => setTimeout(resolve, 2000));

        setIsSuccess(true);
        setIsProcessing(false);
    };

    if (isSuccess) {
        return (
            <Card className="p-8 max-w-md mx-auto bg-card/50 backdrop-blur border-border/50">
                <div className="text-center space-y-6">
                    <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center mx-auto">
                        <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                    <div className="space-y-2">
                        <h2 className="text-3xl font-bold">Payment Sent!</h2>
                        <p className="text-muted-foreground">
                            {paymentRequest.currency} {paymentRequest.amount.toFixed(2)} has been sent to{" "}
                            <span className="text-foreground font-medium">@{paymentRequest.recipientHandle}</span>
                        </p>
                    </div>
                    <div className="pt-4 space-y-3 text-sm text-muted-foreground">
                        <p>Settlement time: <span className="text-foreground font-medium">Instant</span></p>
                        <p>Transaction ID: <span className="text-foreground font-mono text-xs">{transactionId}</span></p>
                    </div>
                </div>
            </Card>
        );
    }

    return (
        <Card className="p-8 max-w-md mx-auto bg-card/50 backdrop-blur border-border/50">
            <div className="space-y-6">
                {/* Payment Details */}
                <div className="space-y-4">
                    <div className="text-center space-y-2">
                        <p className="text-sm text-muted-foreground">You&apos;re paying</p>
                        <div className="text-5xl font-bold">
                            {paymentRequest.currency} {paymentRequest.amount.toFixed(2)}
                        </div>
                        <p className="text-sm text-muted-foreground">
                            to <span className="text-foreground font-medium">@{paymentRequest.recipientHandle}</span>
                        </p>
                    </div>

                    {paymentRequest.description && (
                        <div className="pt-4 pb-4 border-y border-border/50">
                            <p className="text-sm text-muted-foreground mb-1">For:</p>
                            <p className="font-medium">{paymentRequest.description}</p>
                        </div>
                    )}
                </div>

                {/* Payment Method Selection */}
                <div className="space-y-3">
                    <label className="text-sm font-medium">Choose payment method</label>
                    <div className="grid gap-3">
                        <button
                            onClick={() => setSelectedMethod("card")}
                            className={`p-4 rounded-lg border-2 transition-all text-left ${selectedMethod === "card"
                                ? "border-primary bg-primary/5"
                                : "border-border hover:border-border/80"
                                }`}
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                                    </svg>
                                </div>
                                <div>
                                    <p className="font-medium">Card</p>
                                    <p className="text-xs text-muted-foreground">Credit or Debit</p>
                                </div>
                            </div>
                        </button>

                        <button
                            onClick={() => setSelectedMethod("apple-pay")}
                            className={`p-4 rounded-lg border-2 transition-all text-left ${selectedMethod === "apple-pay"
                                ? "border-primary bg-primary/5"
                                : "border-border hover:border-border/80"
                                }`}
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
                                    </svg>
                                </div>
                                <div>
                                    <p className="font-medium">Apple Pay</p>
                                    <p className="text-xs text-muted-foreground">Instant</p>
                                </div>
                            </div>
                        </button>

                        <button
                            onClick={() => setSelectedMethod("crypto")}
                            className={`p-4 rounded-lg border-2 transition-all text-left ${selectedMethod === "crypto"
                                ? "border-primary bg-primary/5"
                                : "border-border hover:border-border/80"
                                }`}
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                </div>
                                <div>
                                    <p className="font-medium">USDC</p>
                                    <p className="text-xs text-muted-foreground">Stablecoin</p>
                                </div>
                            </div>
                        </button>
                    </div>
                </div>

                {/* Pay Button */}
                <Button
                    onClick={handlePay}
                    disabled={isProcessing}
                    className="w-full h-12 text-lg"
                >
                    {isProcessing ? "Processing..." : `Pay ${paymentRequest.currency} ${paymentRequest.amount.toFixed(2)}`}
                </Button>

                {/* Security Badge */}
                <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground pt-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    <span>Secured by Sendaal Ledger</span>
                </div>
            </div>
        </Card>
    );
}
