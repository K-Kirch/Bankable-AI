/**
 * Plaid Adapter
 * 
 * Fetches and transforms Plaid data into platform format.
 */

import { PlaidApi, Configuration, PlaidEnvironments, Products, CountryCode } from 'plaid';
import type { PlaidSnapshot, BankAccount, TransactionSummary, CashFlowMetrics } from '../types/index.js';

export class PlaidAdapter {
    private client: PlaidApi;

    constructor() {
        const clientId = process.env.PLAID_CLIENT_ID;
        const secret = process.env.PLAID_SECRET;
        const env = process.env.PLAID_ENV || 'sandbox';

        if (!clientId || !secret) {
            throw new Error('PLAID_CLIENT_ID and PLAID_SECRET required');
        }

        const configuration = new Configuration({
            basePath: PlaidEnvironments[env as keyof typeof PlaidEnvironments],
            baseOptions: {
                headers: {
                    'PLAID-CLIENT-ID': clientId,
                    'PLAID-SECRET': secret,
                },
            },
        });

        this.client = new PlaidApi(configuration);
    }

    /**
     * Create a link token for Plaid Link
     */
    async createLinkToken(userId: string): Promise<string> {
        const response = await this.client.linkTokenCreate({
            user: { client_user_id: userId },
            client_name: 'Bankable.ai',
            products: [Products.Transactions, Products.Auth],
            country_codes: [CountryCode.Us],
            language: 'en',
        });

        return response.data.link_token;
    }

    /**
     * Exchange public token for access token
     */
    async exchangeToken(publicToken: string): Promise<string> {
        const response = await this.client.itemPublicTokenExchange({
            public_token: publicToken,
        });

        return response.data.access_token;
    }

    /**
     * Fetch a complete snapshot of Plaid data
     */
    async fetchSnapshot(accessToken: string): Promise<PlaidSnapshot> {
        const [accounts, transactions] = await Promise.all([
            this.getAccounts(accessToken),
            this.getTransactions(accessToken),
        ]);

        const cashFlow = this.calculateCashFlow(transactions, accounts);

        return {
            fetchedAt: new Date(),
            accounts,
            transactions,
            cashFlow,
        };
    }

    private async getAccounts(accessToken: string): Promise<BankAccount[]> {
        const response = await this.client.accountsGet({
            access_token: accessToken,
        });

        return response.data.accounts.map(account => ({
            accountId: account.account_id,
            type: this.mapAccountType(account.type),
            currentBalance: account.balances.current || 0,
            availableBalance: account.balances.available || 0,
        }));
    }

    private mapAccountType(type: string): 'checking' | 'savings' | 'credit' {
        switch (type) {
            case 'depository':
                return 'checking';
            case 'credit':
                return 'credit';
            default:
                return 'savings';
        }
    }

    private async getTransactions(accessToken: string): Promise<TransactionSummary> {
        const now = new Date();
        const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

        const response = await this.client.transactionsGet({
            access_token: accessToken,
            start_date: threeMonthsAgo.toISOString().split('T')[0]!,
            end_date: now.toISOString().split('T')[0]!,
        });

        const transactions = response.data.transactions;

        let totalInflow = 0;
        let totalOutflow = 0;
        const categoryBreakdown: Record<string, number> = {};

        for (const tx of transactions) {
            if (tx.amount < 0) {
                totalInflow += Math.abs(tx.amount);
            } else {
                totalOutflow += tx.amount;

                const category = tx.category?.[0] || 'Other';
                categoryBreakdown[category] = (categoryBreakdown[category] || 0) + tx.amount;
            }
        }

        return {
            period: { start: threeMonthsAgo, end: now },
            totalInflow,
            totalOutflow,
            categoryBreakdown,
        };
    }

    private calculateCashFlow(
        transactions: TransactionSummary,
        accounts: BankAccount[]
    ): CashFlowMetrics {
        const monthsInPeriod = 3;
        const avgMonthlyInflow = transactions.totalInflow / monthsInPeriod;
        const avgMonthlyOutflow = transactions.totalOutflow / monthsInPeriod;

        const burnRate = Math.max(0, avgMonthlyOutflow - avgMonthlyInflow);

        const totalCash = accounts
            .filter(a => a.type !== 'credit')
            .reduce((sum, a) => sum + a.currentBalance, 0);

        const runwayMonths = burnRate > 0 ? totalCash / burnRate : 99;

        return {
            averageMonthlyInflow: avgMonthlyInflow,
            averageMonthlyOutflow: avgMonthlyOutflow,
            burnRate,
            runwayMonths: Math.min(99, runwayMonths),
        };
    }
}
