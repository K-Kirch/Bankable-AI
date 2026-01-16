/**
 * Stripe Adapter
 * 
 * Fetches and transforms Stripe data into platform format.
 */

import Stripe from 'stripe';
import type { StripeSnapshot, CustomerRevenue, PaymentSummary } from '../types/index.js';

export class StripeAdapter {
    private stripe: Stripe;

    constructor() {
        const secretKey = process.env.STRIPE_SECRET_KEY;
        if (!secretKey) {
            throw new Error('STRIPE_SECRET_KEY required');
        }

        this.stripe = new Stripe(secretKey);
    }

    /**
     * Fetch a complete snapshot of Stripe data
     */
    async fetchSnapshot(): Promise<StripeSnapshot> {
        const [mrr, customers, paymentHistory] = await Promise.all([
            this.calculateMRR(),
            this.getTopCustomers(),
            this.getPaymentHistory(),
        ]);

        const arrGrowthRate = await this.calculateGrowthRate();
        const churnRate = await this.calculateChurnRate();

        return {
            fetchedAt: new Date(),
            mrr,
            arrGrowthRate,
            customerCount: customers.length,
            churnRate,
            topCustomers: customers,
            paymentHistory,
        };
    }

    private async calculateMRR(): Promise<number> {
        // Fetch all active subscriptions
        const subscriptions = await this.stripe.subscriptions.list({
            status: 'active',
            limit: 100,
        });

        let mrr = 0;
        for (const sub of subscriptions.data) {
            for (const item of sub.items.data) {
                const price = item.price;
                if (price.recurring) {
                    const amount = price.unit_amount || 0;
                    const interval = price.recurring.interval;

                    // Normalize to monthly
                    if (interval === 'year') {
                        mrr += amount / 12;
                    } else if (interval === 'month') {
                        mrr += amount;
                    } else if (interval === 'week') {
                        mrr += amount * 4.33;
                    }
                }
            }
        }

        return mrr / 100; // Convert from cents
    }

    private async getTopCustomers(): Promise<CustomerRevenue[]> {
        // Fetch recent invoices to calculate customer revenue
        const invoices = await this.stripe.invoices.list({
            limit: 100,
            status: 'paid',
        });

        // Aggregate by customer
        const customerRevenue = new Map<string, { name?: string; total: number }>();

        for (const invoice of invoices.data) {
            const customerId = invoice.customer as string;
            const existing = customerRevenue.get(customerId) || { total: 0 };
            existing.total += invoice.amount_paid;
            existing.name = invoice.customer_name || undefined;
            customerRevenue.set(customerId, existing);
        }

        // Calculate totals and percentages
        const totalRevenue = Array.from(customerRevenue.values())
            .reduce((sum, c) => sum + c.total, 0);

        const customers: CustomerRevenue[] = Array.from(customerRevenue.entries())
            .map(([id, data]) => ({
                customerId: id,
                name: data.name,
                monthlyRevenue: data.total / 100 / 3, // Last 3 months average
                percentOfTotal: totalRevenue > 0 ? data.total / totalRevenue : 0,
            }))
            .sort((a, b) => b.percentOfTotal - a.percentOfTotal)
            .slice(0, 10); // Top 10

        return customers;
    }

    private async getPaymentHistory(): Promise<PaymentSummary> {
        const charges = await this.stripe.charges.list({
            limit: 100,
        });

        const successful = charges.data.filter((c: Stripe.Charge) => c.status === 'succeeded');
        const failed = charges.data.filter((c: Stripe.Charge) => c.status === 'failed');
        const disputed = charges.data.filter((c: Stripe.Charge) => c.disputed);

        return {
            successRate: charges.data.length > 0
                ? successful.length / charges.data.length
                : 1,
            averagePaymentDelay: 0, // Would need invoice data to calculate
            disputeRate: charges.data.length > 0
                ? disputed.length / charges.data.length
                : 0,
        };
    }

    private async calculateGrowthRate(): Promise<number> {
        // Compare current MRR to 3 months ago
        // Simplified: would need historical data in production
        return 0.15; // Placeholder 15% growth
    }

    private async calculateChurnRate(): Promise<number> {
        // Fetch canceled subscriptions in last 30 days
        const now = Math.floor(Date.now() / 1000);
        const thirtyDaysAgo = now - (30 * 24 * 60 * 60);

        const [canceled, active] = await Promise.all([
            this.stripe.subscriptions.list({
                status: 'canceled',
                created: { gte: thirtyDaysAgo },
                limit: 100,
            }),
            this.stripe.subscriptions.list({
                status: 'active',
                limit: 100,
            }),
        ]);

        const totalCustomers = active.data.length + canceled.data.length;
        return totalCustomers > 0 ? canceled.data.length / totalCustomers : 0;
    }
}
