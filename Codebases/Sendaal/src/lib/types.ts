import { z } from "zod";

export const paymentMethodSchema = z.enum(["card", "apple-pay", "crypto"]);

export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

export interface PaymentRequest {
    id: string;
    amount: number;
    currency: string;
    description: string;
    recipientHandle: string;
    recipientName?: string;
}
