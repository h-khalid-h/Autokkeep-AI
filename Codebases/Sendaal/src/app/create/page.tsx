"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { createPaymentRequestSchema, type CreatePaymentRequestInput } from "@/lib/validations";
import Link from "next/link";

export default function CreatePage() {
    const [formData, setFormData] = useState<CreatePaymentRequestInput>({
        amount: 0,
        currency: "USD",
        description: "",
        recipientHandle: "",
        recipientName: "",
    });
    const [errors, setErrors] = useState<Partial<Record<keyof CreatePaymentRequestInput, string>>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [paymentLink, setPaymentLink] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrors({});
        setIsSubmitting(true);

        // Validate
        const result = createPaymentRequestSchema.safeParse(formData);
        if (!result.success) {
            const fieldErrors: Partial<Record<keyof CreatePaymentRequestInput, string>> = {};
            result.error.issues.forEach((err) => {
                if (err.path[0]) {
                    fieldErrors[err.path[0] as keyof CreatePaymentRequestInput] = err.message;
                }
            });
            setErrors(fieldErrors);
            setIsSubmitting(false);
            return;
        }

        try {
            // For MVP, we'll generate a mock link since database isn't set up yet
            // In production, this would call the real API
            const mockId = `demo-${Date.now()}`;
            const mockLink = `${window.location.origin}/pay/${mockId}`;

            // TODO: Uncomment when database is ready
            // const response = await fetch('/api/payments/create', {
            //   method: 'POST',
            //   headers: { 'Content-Type': 'application/json' },
            //   body: JSON.stringify(formData),
            // });
            // if (!response.ok) throw new Error('Failed to create payment link');
            // const data = await response.json();
            // setPaymentLink(data.data.url);

            setPaymentLink(mockLink);
        } catch (error) {
            setErrors({ description: error instanceof Error ? error.message : 'Failed to create link' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleCopy = async () => {
        if (paymentLink) {
            await navigator.clipboard.writeText(paymentLink);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const handleReset = () => {
        setPaymentLink(null);
        setFormData({
            amount: 0,
            currency: "USD",
            description: "",
            recipientHandle: "",
            recipientName: "",
        });
    };

    if (paymentLink) {
        return (
            <main className="flex min-h-screen flex-col items-center justify-center p-6 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 pointer-events-none" />

                <div className="relative z-10 w-full max-w-2xl mx-auto space-y-8">
                    {/* Branding */}
                    <div className="text-center">
                        <Link href="/">
                            <h1 className="text-4xl font-bold tracking-tight mb-2 cursor-pointer hover:opacity-80 transition-opacity">
                                Sendaal
                            </h1>
                        </Link>
                        <p className="text-sm text-muted-foreground">Instant Settlement</p>
                    </div>

                    {/* Success Card */}
                    <Card className="p-8 bg-card/50 backdrop-blur border-border/50">
                        <div className="text-center space-y-6">
                            <div className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center mx-auto">
                                <svg className="w-10 h-10 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                            </div>

                            <div className="space-y-2">
                                <h2 className="text-3xl font-bold">Payment Link Created!</h2>
                                <p className="text-muted-foreground">
                                    Share this link to receive ${formData.amount.toFixed(2)} {formData.currency}
                                </p>
                            </div>

                            {/* Link Display */}
                            <div className="space-y-3">
                                <div className="p-4 bg-background/50 rounded-lg border border-border/50 break-all font-mono text-sm">
                                    {paymentLink}
                                </div>

                                <div className="flex gap-3">
                                    <Button onClick={handleCopy} className="flex-1" variant={copied ? "outline" : "default"}>
                                        {copied ? (
                                            <>
                                                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                </svg>
                                                Copied!
                                            </>
                                        ) : (
                                            <>
                                                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                                </svg>
                                                Copy Link
                                            </>
                                        )}
                                    </Button>

                                    <Button onClick={handleReset} variant="outline">
                                        Create Another
                                    </Button>
                                </div>
                            </div>

                            {/* Payment Details Summary */}
                            <div className="pt-6 border-t border-border/50 space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Amount:</span>
                                    <span className="font-medium">${formData.amount.toFixed(2)} {formData.currency}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">For:</span>
                                    <span className="font-medium">{formData.description}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Recipient:</span>
                                    <span className="font-medium">@{formData.recipientHandle}</span>
                                </div>
                            </div>
                        </div>
                    </Card>
                </div>
            </main>
        );
    }

    return (
        <main className="flex min-h-screen flex-col items-center justify-center p-6 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 pointer-events-none" />

            <div className="relative z-10 w-full max-w-2xl mx-auto space-y-8">
                {/* Branding */}
                <div className="text-center">
                    <Link href="/">
                        <h1 className="text-4xl font-bold tracking-tight mb-2 cursor-pointer hover:opacity-80 transition-opacity">
                            Sendaal
                        </h1>
                    </Link>
                    <p className="text-sm text-muted-foreground">Create a Payment Link</p>
                </div>

                {/* Form Card */}
                <Card className="p-8 bg-card/50 backdrop-blur border-border/50">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        {/* Amount */}
                        <div className="space-y-2">
                            <label htmlFor="amount" className="text-sm font-medium">
                                Amount
                            </label>
                            <div className="flex gap-3">
                                <div className="flex-1 relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                                    <Input
                                        id="amount"
                                        type="number"
                                        step="0.01"
                                        placeholder="0.00"
                                        value={formData.amount || ""}
                                        onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
                                        className={`pl-7 ${errors.amount ? "border-destructive" : ""}`}
                                    />
                                </div>
                                <select
                                    value={formData.currency}
                                    onChange={(e) => setFormData({ ...formData, currency: e.target.value as "USD" | "EUR" | "GBP" | "USDC" })}
                                    className="px-4 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                                >
                                    <option value="USD">USD</option>
                                    <option value="EUR">EUR</option>
                                    <option value="GBP">GBP</option>
                                    <option value="USDC">USDC</option>
                                </select>
                            </div>
                            {errors.amount && (
                                <p className="text-sm text-destructive">{errors.amount}</p>
                            )}
                        </div>

                        {/* Description */}
                        <div className="space-y-2">
                            <label htmlFor="description" className="text-sm font-medium">
                                What&apos;s this payment for?
                            </label>
                            <Input
                                id="description"
                                type="text"
                                placeholder="e.g., Branding & Identity Design Project"
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                className={errors.description ? "border-destructive" : ""}
                                maxLength={500}
                            />
                            {errors.description && (
                                <p className="text-sm text-destructive">{errors.description}</p>
                            )}
                        </div>

                        {/* Recipient Handle */}
                        <div className="space-y-2">
                            <label htmlFor="recipientHandle" className="text-sm font-medium">
                                Your Sendaal Handle
                            </label>
                            <div className="flex items-center gap-2">
                                <span className="text-muted-foreground">@</span>
                                <Input
                                    id="recipientHandle"
                                    type="text"
                                    placeholder="yourname"
                                    value={formData.recipientHandle}
                                    onChange={(e) =>
                                        setFormData({ ...formData, recipientHandle: e.target.value.toLowerCase() })
                                    }
                                    className={errors.recipientHandle ? "border-destructive" : ""}
                                />
                            </div>
                            {errors.recipientHandle && (
                                <p className="text-sm text-destructive">{errors.recipientHandle}</p>
                            )}
                            <p className="text-xs text-muted-foreground">
                                This is where funds will be sent when the link is paid.
                            </p>
                        </div>

                        {/* Recipient Name (Optional) */}
                        <div className="space-y-2">
                            <label htmlFor="recipientName" className="text-sm font-medium">
                                Display Name <span className="text-muted-foreground font-normal">(Optional)</span>
                            </label>
                            <Input
                                id="recipientName"
                                type="text"
                                placeholder="Your Business Name"
                                value={formData.recipientName || ""}
                                onChange={(e) => setFormData({ ...formData, recipientName: e.target.value })}
                            />
                            <p className="text-xs text-muted-foreground">
                                This will be shown to the payer.
                            </p>
                        </div>

                        {/* Submit Button */}
                        <Button type="submit" className="w-full h-12" disabled={isSubmitting}>
                            {isSubmitting ? (
                                <>
                                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                    </svg>
                                    Creating Link...
                                </>
                            ) : (
                                "Create Payment Link"
                            )}
                        </Button>
                    </form>
                </Card>

                {/* Info Footer */}
                <div className="text-center space-y-2 text-xs text-muted-foreground max-w-md mx-auto">
                    <p>Payment links work instantly. No signup required for payers.</p>
                    <p>Funds settle in seconds, not days.</p>
                </div>
            </div>
        </main>
    );
}
