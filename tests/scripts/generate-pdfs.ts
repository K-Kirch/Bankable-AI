/**
 * Generate PDF Financial Statements from Fixture Data
 * 
 * Creates P&L and Balance Sheet PDFs for each test company
 */

import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface CompanyData {
    company: {
        name: string;
        cvr: string;
        industry: string;
        employees: number;
    };
    documents: {
        profit_and_loss: Record<string, {
            currency: string;
            revenue: number;
            costOfGoodsSold: number;
            grossProfit: number;
            operatingExpenses: number;
            ebit: number;
            interestExpense: number;
            taxExpense: number;
            netIncome: number;
        }>;
        balance_sheet: Record<string, {
            currency: string;
            assets: {
                cash: number;
                accountsReceivable: number;
                inventory: number;
                totalCurrentAssets: number;
                propertyPlantEquipment: number;
                intangibleAssets: number;
                totalAssets: number;
            };
            liabilities: {
                accountsPayable: number;
                shortTermDebt: number;
                totalCurrentLiabilities: number;
                longTermDebt: number;
                totalLiabilities: number;
            };
            equity: {
                commonStock: number;
                retainedEarnings: number;
                totalEquity: number;
            };
        }>;
    };
}

function formatCurrency(value: number, currency: string = 'DKK'): string {
    if (Math.abs(value) >= 1_000_000_000) {
        return `${(value / 1_000_000_000).toFixed(1)}B ${currency}`;
    } else if (Math.abs(value) >= 1_000_000) {
        return `${(value / 1_000_000).toFixed(1)}M ${currency}`;
    } else if (Math.abs(value) >= 1_000) {
        return `${(value / 1_000).toFixed(0)}K ${currency}`;
    }
    return `${value} ${currency}`;
}

function createProfitLossPDF(data: CompanyData, outputPath: string): void {
    const doc = new PDFDocument();
    const writeStream = fs.createWriteStream(outputPath);
    doc.pipe(writeStream);

    // Header
    doc.fontSize(20).text('PROFIT AND LOSS STATEMENT', { align: 'center' });
    doc.moveDown();
    doc.fontSize(16).text(data.company.name, { align: 'center' });
    doc.fontSize(12).text(`CVR: ${data.company.cvr}`, { align: 'center' });
    doc.moveDown(2);

    // Get years in descending order
    const years = Object.keys(data.documents.profit_and_loss).sort().reverse();

    for (const year of years) {
        const pl = data.documents.profit_and_loss[year]!;

        doc.fontSize(14).text(`Fiscal Year ${year}`, { underline: true });
        doc.moveDown(0.5);

        doc.fontSize(10);
        doc.text(`Revenue: ${formatCurrency(pl.revenue, pl.currency)}`);
        doc.text(`Cost of Goods Sold: ${formatCurrency(pl.costOfGoodsSold, pl.currency)}`);
        doc.text(`Gross Profit: ${formatCurrency(pl.grossProfit, pl.currency)}`);
        doc.text(`Operating Expenses: ${formatCurrency(pl.operatingExpenses, pl.currency)}`);
        doc.text(`EBIT: ${formatCurrency(pl.ebit, pl.currency)}`);
        doc.text(`Interest Expense: ${formatCurrency(pl.interestExpense, pl.currency)}`);
        doc.text(`Tax Expense: ${formatCurrency(pl.taxExpense, pl.currency)}`);
        doc.text(`Net Income: ${formatCurrency(pl.netIncome, pl.currency)}`, { bold: true });
        doc.moveDown(1.5);
    }

    doc.end();
    console.log(`Created: ${outputPath}`);
}

function createBalanceSheetPDF(data: CompanyData, outputPath: string): void {
    const doc = new PDFDocument();
    const writeStream = fs.createWriteStream(outputPath);
    doc.pipe(writeStream);

    // Header
    doc.fontSize(20).text('BALANCE SHEET', { align: 'center' });
    doc.moveDown();
    doc.fontSize(16).text(data.company.name, { align: 'center' });
    doc.fontSize(12).text(`CVR: ${data.company.cvr}`, { align: 'center' });
    doc.moveDown(2);

    // Get latest year
    const years = Object.keys(data.documents.balance_sheet).sort().reverse();
    const latestYear = years[0]!;
    const bs = data.documents.balance_sheet[latestYear]!;

    doc.fontSize(14).text(`As of ${latestYear}`, { underline: true });
    doc.moveDown();

    // Assets
    doc.fontSize(12).text('ASSETS', { bold: true });
    doc.fontSize(10);
    doc.text(`  Cash: ${formatCurrency(bs.assets.cash, bs.currency)}`);
    doc.text(`  Accounts Receivable: ${formatCurrency(bs.assets.accountsReceivable, bs.currency)}`);
    doc.text(`  Inventory: ${formatCurrency(bs.assets.inventory, bs.currency)}`);
    doc.text(`  Total Current Assets: ${formatCurrency(bs.assets.totalCurrentAssets, bs.currency)}`);
    doc.text(`  Property, Plant & Equipment: ${formatCurrency(bs.assets.propertyPlantEquipment, bs.currency)}`);
    doc.text(`  Intangible Assets: ${formatCurrency(bs.assets.intangibleAssets, bs.currency)}`);
    doc.text(`  TOTAL ASSETS: ${formatCurrency(bs.assets.totalAssets, bs.currency)}`, { bold: true });
    doc.moveDown();

    // Liabilities
    doc.fontSize(12).text('LIABILITIES', { bold: true });
    doc.fontSize(10);
    doc.text(`  Accounts Payable: ${formatCurrency(bs.liabilities.accountsPayable, bs.currency)}`);
    doc.text(`  Short-term Debt: ${formatCurrency(bs.liabilities.shortTermDebt, bs.currency)}`);
    doc.text(`  Total Current Liabilities: ${formatCurrency(bs.liabilities.totalCurrentLiabilities, bs.currency)}`);
    doc.text(`  Long-term Debt: ${formatCurrency(bs.liabilities.longTermDebt, bs.currency)}`);
    doc.text(`  TOTAL LIABILITIES: ${formatCurrency(bs.liabilities.totalLiabilities, bs.currency)}`, { bold: true });
    doc.moveDown();

    // Equity
    doc.fontSize(12).text('EQUITY', { bold: true });
    doc.fontSize(10);
    doc.text(`  Common Stock: ${formatCurrency(bs.equity.commonStock, bs.currency)}`);
    doc.text(`  Retained Earnings: ${formatCurrency(bs.equity.retainedEarnings, bs.currency)}`);
    doc.text(`  TOTAL EQUITY: ${formatCurrency(bs.equity.totalEquity, bs.currency)}`, { bold: true });

    doc.end();
    console.log(`Created: ${outputPath}`);
}

async function main() {
    const fixturesDir = path.join(__dirname, '..', 'fixtures', 'companies');
    const companies = fs.readdirSync(fixturesDir).filter(f =>
        fs.statSync(path.join(fixturesDir, f)).isDirectory()
    );

    console.log(`Generating PDFs for ${companies.length} companies...`);

    for (const company of companies) {
        const inputPath = path.join(fixturesDir, company, 'input.json');
        if (!fs.existsSync(inputPath)) continue;

        const data = JSON.parse(fs.readFileSync(inputPath, 'utf-8')) as CompanyData;

        // Create P&L PDF
        const plPath = path.join(fixturesDir, company, 'profit_and_loss.pdf');
        createProfitLossPDF(data, plPath);

        // Create Balance Sheet PDF
        const bsPath = path.join(fixturesDir, company, 'balance_sheet.pdf');
        createBalanceSheetPDF(data, bsPath);
    }

    console.log('\nDone! PDFs created in each company folder.');
}

main().catch(console.error);
