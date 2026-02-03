"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { waitlistSchema, type WaitlistFormData } from "@/lib/validations";

export function WaitlistForm() {
    const [formData, setFormData] = useState<WaitlistFormData>({
        email: "",
        handle: "",
    });
    const [errors, setErrors] = useState<Partial<Record<keyof WaitlistFormData, string>>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrors({});
        setIsSubmitting(true);

        // Validate
        const result = waitlistSchema.safeParse(formData);
        if (!result.success) {
            const fieldErrors: Partial<Record<keyof WaitlistFormData, string>> = {};
            result.error.issues.forEach((err) => {
                if (err.path[0]) {
                    fieldErrors[err.path[0] as keyof WaitlistFormData] = err.message;
                }
            });
            setErrors(fieldErrors);
            setIsSubmitting(false);
            return;
        }

        try {
            // Call real API
            const response = await fetch('/api/waitlist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to join waitlist');
            }

            setIsSuccess(true);
        } catch (error) {
            setErrors({ email: error instanceof Error ? error.message : 'An error occurred' });
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isSuccess) {
        return (
            <Card className="p-8 max-w-md mx-auto bg-card/50 backdrop-blur border-border/50">
                <div className="text-center space-y-4">
                    <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mx-auto">
                        <svg className="w-8 h-8 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                    <h3 className="text-2xl font-bold">You&apos;re on the list!</h3>
                    <p className="text-muted-foreground">
                        Welcome to Sendaal, <span className="text-foreground font-medium">@{formData.handle}</span>.
                        We&apos;ll send your invite code to <span className="text-foreground font-medium">{formData.email}</span> soon.
                    </p>
                    <div className="pt-4">
                        <p className="text-sm text-muted-foreground">
                            Want to skip the line? Share Sendaal with your network.
                        </p>
                    </div>
                </div>
            </Card>
        );
    }

    return (
        <Card className="p-8 max-w-md mx-auto bg-card/50 backdrop-blur border-border/50">
            <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                    <label htmlFor="email" className="text-sm font-medium">
                        Email Address
                    </label>
                    <Input
                        id="email"
                        type="email"
                        placeholder="you@example.com"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className={errors.email ? "border-destructive" : ""}
                    />
                    {errors.email && (
                        <p className="text-sm text-destructive">{errors.email}</p>
                    )}
                </div>

                <div className="space-y-2">
                    <label htmlFor="handle" className="text-sm font-medium">
                        Claim Your Handle
                    </label>
                    <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">@</span>
                        <Input
                            id="handle"
                            type="text"
                            placeholder="yourname"
                            value={formData.handle}
                            onChange={(e) =>
                                setFormData({ ...formData, handle: e.target.value.toLowerCase() })
                            }
                            className={errors.handle ? "border-destructive" : ""}
                        />
                    </div>
                    {errors.handle && (
                        <p className="text-sm text-destructive">{errors.handle}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                        Your unique Sendaal handle. Lowercase letters, numbers, hyphens, and underscores only.
                    </p>
                </div>

                <Button
                    type="submit"
                    className="w-full"
                    disabled={isSubmitting}
                >
                    {isSubmitting ? "Joining..." : "Claim My Handle"}
                </Button>
            </form>
        </Card>
    );
}
