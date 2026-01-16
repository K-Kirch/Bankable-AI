/**
 * PDF Parser
 * 
 * Extracts structured data from PDFs using Gemini Vision.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { v4 as uuid } from 'uuid';
import type { ParsedDocument, DocumentType } from '../types/index.js';

export class PDFParser {
    private genAI: GoogleGenerativeAI;
    private model: ReturnType<GoogleGenerativeAI['getGenerativeModel']>;

    constructor() {
        const apiKey = process.env.GOOGLE_API_KEY;
        if (!apiKey) {
            throw new Error('GOOGLE_API_KEY required for PDF parsing');
        }

        this.genAI = new GoogleGenerativeAI(apiKey);
        this.model = this.genAI.getGenerativeModel({
            model: 'gemini-2.0-flash-exp',
        });
    }

    /**
     * Parse a PDF buffer and extract structured data
     */
    async parse(pdfBuffer: Buffer, filename: string): Promise<ParsedDocument> {
        const base64Data = pdfBuffer.toString('base64');

        // Detect document type
        const docType = await this.detectDocumentType(base64Data, filename);

        // Extract structured data based on type
        const extractedData = await this.extractData(base64Data, docType);

        return {
            id: uuid(),
            type: docType,
            filename,
            parsedAt: new Date(),
            confidence: extractedData.confidence,
            data: extractedData.data,
            rawText: extractedData.rawText,
            trustScore: 0.7, // PDFs have moderate trust
        };
    }

    private async detectDocumentType(base64Data: string, filename: string): Promise<DocumentType> {
        const prompt = `Analyze this document and determine its type.
    
Filename: ${filename}

Respond with ONLY one of these exact values:
- profit_and_loss
- balance_sheet
- contract
- bank_statement
- tax_filing
- insurance_certificate
- other`;

        const result = await this.model.generateContent([
            { text: prompt },
            { inlineData: { mimeType: 'application/pdf', data: base64Data } },
        ]);

        const type = result.response.text().trim().toLowerCase();

        const validTypes: DocumentType[] = [
            'profit_and_loss', 'balance_sheet', 'contract',
            'bank_statement', 'tax_filing', 'insurance_certificate', 'other'
        ];

        return validTypes.includes(type as DocumentType) ? type as DocumentType : 'other';
    }

    private async extractData(
        base64Data: string,
        docType: DocumentType
    ): Promise<{ data: Record<string, unknown>; rawText: string; confidence: number }> {
        const extractionPrompts: Record<DocumentType, string> = {
            profit_and_loss: `Extract the following financial data from this P&L statement:
        - Revenue/Sales (total and breakdown if available)
        - Cost of Goods Sold
        - Gross Profit
        - Operating Expenses (categories)
        - Operating Income
        - Net Income
        - Period covered`,

            balance_sheet: `Extract the following from this balance sheet:
        - Assets (current, fixed, total)
        - Liabilities (current, long-term, total)
        - Equity
        - Cash position
        - Date`,

            contract: `Extract the following contract terms:
        - Parties involved
        - Contract value
        - Start date and end date
        - Notice period
        - Auto-renewal clause (yes/no)
        - Termination conditions
        - Key obligations
        - Jurisdiction`,

            bank_statement: `Extract the following from this bank statement:
        - Account holder
        - Account type
        - Period
        - Opening balance
        - Closing balance
        - Total deposits
        - Total withdrawals`,

            tax_filing: `Extract the following from this tax document:
        - Tax year
        - Entity name
        - Filing type
        - Total income/revenue
        - Tax owed/paid
        - Filing status`,

            insurance_certificate: `Extract the following from this insurance certificate:
        - Insured party
        - Insurance type
        - Coverage amount
        - Policy period
        - Premium
        - Key exclusions`,

            other: `Extract all relevant structured data from this document.
        Identify the document purpose and key information.`,
        };

        const prompt = `${extractionPrompts[docType]}

Respond in JSON format with the extracted data. Include a "confidence" field (0-1) indicating extraction reliability.
Also include a "raw_text_excerpt" field with the first 2000 characters of text content.`;

        const result = await this.model.generateContent([
            { text: prompt },
            { inlineData: { mimeType: 'application/pdf', data: base64Data } },
        ]);

        let text = result.response.text().trim();

        // Clean up markdown formatting
        text = text.replace(/^```json\s*/i, '').replace(/\s*```$/i, '');

        try {
            const parsed = JSON.parse(text);
            return {
                data: parsed,
                rawText: parsed.raw_text_excerpt || '',
                confidence: parsed.confidence || 0.7,
            };
        } catch {
            return {
                data: { raw: text },
                rawText: text,
                confidence: 0.5,
            };
        }
    }
}
