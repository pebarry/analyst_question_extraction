import axios from 'axios';
import { googleDriveService } from './google-drive.js';

export interface EarningsDate {
  symbol: string;
  reportDate: string;
  estimate?: string;
  quarter: string;
  year: number;
}

export interface StockData {
  symbol: string;
  currentPrice: number;
  peRatio: number;
  marketCap: number;
  dividendYield: number;
  eps: number;
  beta: number;
  high52Week: number;
  low52Week: number;
  lastUpdated: string;
}

export interface IncomeStatement {
  fiscalDateEnding: string;
  reportedCurrency: string;
  totalRevenue: number;
  grossProfit: number;
  operatingIncome: number;
  netIncome: number;
  eps: number;
}

export interface CompanyFinancials {
  symbol: string;
  companyName: string;
  stockData: StockData;
  annualRevenue: IncomeStatement[];
  quarterlyRevenue: IncomeStatement[];
  lastUpdated: string;
}

export class EarningsTracker {
  private alphaVantageApiKey: string;

  constructor() {
    this.alphaVantageApiKey = process.env.ALPHA_VANTAGE_API_KEY || '';
  }

  /**
   * Get earnings calendar from Alpha Vantage API
   */
  async getEarningsCalendar(symbol?: string): Promise<EarningsDate[]> {
    if (!this.alphaVantageApiKey) {
      throw new Error('Alpha Vantage API key not configured');
    }

    try {
      let url = `https://www.alphavantage.co/query?function=EARNINGS_CALENDAR&horizon=3month&apikey=${this.alphaVantageApiKey}`;
      
      // Add symbol filter if provided
      if (symbol) {
        url += `&symbol=${symbol}`;
      }
      
      console.log(`Fetching earnings calendar from Alpha Vantage for ${symbol || 'all symbols'}...`);
      const response = await axios.get(url);
      
      if (response.data.Note) {
        throw new Error('Alpha Vantage API call frequency limit reached');
      }

      if (response.data['Error Message']) {
        throw new Error(`Alpha Vantage API error: ${response.data['Error Message']}`);
      }

      // Parse CSV response
      const csvData = response.data;
      const lines = csvData.split('\n');
      const headers = lines[0].split(',');
      
      const earnings: EarningsDate[] = [];
      
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',');
        if (values.length >= 3) {
          const earningSymbol = values[0]?.trim();
          const reportDate = values[2]?.trim();
          
          // Filter by symbol if provided
          if (symbol && earningSymbol !== symbol) {
            continue;
          }
          
          if (earningSymbol && reportDate) {
            // Parse quarter and year from date
            const date = new Date(reportDate);
            const month = date.getMonth() + 1;
            const year = date.getFullYear();
            
            let quarter = 'Q1';
            if (month >= 4 && month <= 6) quarter = 'Q2';
            else if (month >= 7 && month <= 9) quarter = 'Q3';
            else if (month >= 10 && month <= 12) quarter = 'Q4';
            
            earnings.push({
              symbol: earningSymbol,
              reportDate,
              quarter,
              year,
              estimate: values[3]?.trim() || undefined
            });
          }
        }
      }
      
      console.log(`Found ${earnings.length} earnings dates`);
      return earnings;
      
    } catch (error: any) {
      console.error('Error fetching earnings calendar:', error.message);
      throw error;
    }
  }

  /**
   * Check if today is 2 days after an earnings call
   */
  async checkForAutoUpdate(): Promise<{ shouldUpdate: boolean; earningsToUpdate: EarningsDate[] }> {
    try {
      const today = new Date();
      const twoDaysAgo = new Date(today);
      twoDaysAgo.setDate(today.getDate() - 2);
      
      const recentEarnings = await this.getEarningsCalendar();
      
      const earningsToUpdate = recentEarnings.filter(earning => {
        const earningDate = new Date(earning.reportDate);
        // Check if earnings were exactly 2 days ago
        return earningDate.toDateString() === twoDaysAgo.toDateString();
      });
      
      console.log(`Checking auto-update: Found ${earningsToUpdate.length} earnings calls from 2 days ago`);
      
      return {
        shouldUpdate: earningsToUpdate.length > 0,
        earningsToUpdate
      };
      
    } catch (error: any) {
      console.error('Error checking for auto-update:', error.message);
      return { shouldUpdate: false, earningsToUpdate: [] };
    }
  }

  /**
   * Get upcoming earnings for a specific symbol
   */
  async getUpcomingEarnings(symbol: string): Promise<EarningsDate[]> {
    const allEarnings = await this.getEarningsCalendar(symbol);
    const today = new Date();
    
    return allEarnings.filter(earning => {
      const earningDate = new Date(earning.reportDate);
      return earningDate >= today;
    }).sort((a, b) => new Date(a.reportDate).getTime() - new Date(b.reportDate).getTime());
  }

  /**
   * Get comprehensive stock data for a company
   */
  async getCompanyFinancials(symbol: string): Promise<CompanyFinancials> {
    const baseUrl = 'https://www.alphavantage.co/query';
    
    try {
      // Get overview data (includes P/E ratio, market cap, etc.)
      const overviewResponse = await fetch(`${baseUrl}?function=OVERVIEW&symbol=${symbol}&apikey=${this.alphaVantageApiKey}`);
      const overviewData = await overviewResponse.json();
      
      if (overviewData.Note) {
        throw new Error('API call frequency limit reached');
      }
      
      // Get quote data (current price)
      const quoteResponse = await fetch(`${baseUrl}?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${this.alphaVantageApiKey}`);
      const quoteData = await quoteResponse.json();
      
      // Get annual income statement
      const incomeResponse = await fetch(`${baseUrl}?function=INCOME_STATEMENT&symbol=${symbol}&apikey=${this.alphaVantageApiKey}`);
      const incomeData = await incomeResponse.json();
      
      // Parse the data
      const quote = quoteData['Global Quote'] || {};
      const overview = overviewData;
      const annualReports = incomeData.annualReports || [];
      const quarterlyReports = incomeData.quarterlyReports || [];
      
      const stockData: StockData = {
        symbol: symbol,
        currentPrice: parseFloat(quote['05. price']) || 0,
        peRatio: parseFloat(overview.PERatio) || 0,
        marketCap: parseFloat(overview.MarketCapitalization) || 0,
        dividendYield: parseFloat(overview.DividendYield) || 0,
        eps: parseFloat(overview.EPS) || 0,
        beta: parseFloat(overview.Beta) || 0,
        high52Week: parseFloat(overview['52WeekHigh']) || 0,
        low52Week: parseFloat(overview['52WeekLow']) || 0,
        lastUpdated: new Date().toISOString()
      };
      
      const parseIncomeStatement = (report: any): IncomeStatement => ({
        fiscalDateEnding: report.fiscalDateEnding,
        reportedCurrency: report.reportedCurrency,
        totalRevenue: parseFloat(report.totalRevenue) || 0,
        grossProfit: parseFloat(report.grossProfit) || 0,
        operatingIncome: parseFloat(report.operatingIncome) || 0,
        netIncome: parseFloat(report.netIncome) || 0,
        eps: parseFloat(report.reportedEPS) || 0
      });
      
      return {
        symbol: symbol,
        companyName: overview.Name || symbol,
        stockData: stockData,
        annualRevenue: annualReports.slice(0, 3).map(parseIncomeStatement),
        quarterlyRevenue: quarterlyReports.slice(0, 4).map(parseIncomeStatement),
        lastUpdated: new Date().toISOString()
      };
      
    } catch (error) {
      console.error(`Error fetching financial data for ${symbol}:`, error);
      throw error;
    }
  }

  /**
   * Generate financial context document for GPT analysis
   */
  generateFinancialContext(financials: CompanyFinancials): string {
    const { symbol, companyName, stockData, annualRevenue, quarterlyRevenue } = financials;
    
    let context = `# ${companyName} (${symbol}) - Financial Context\n\n`;
    
    // Current stock metrics
    context += `## Current Stock Metrics\n`;
    context += `- **Current Price**: $${stockData.currentPrice.toFixed(2)}\n`;
    context += `- **P/E Ratio**: ${stockData.peRatio.toFixed(2)}\n`;
    context += `- **Market Cap**: $${(stockData.marketCap / 1000000000).toFixed(2)}B\n`;
    context += `- **EPS**: $${stockData.eps.toFixed(2)}\n`;
    context += `- **Beta**: ${stockData.beta.toFixed(2)}\n`;
    context += `- **52-Week Range**: $${stockData.low52Week.toFixed(2)} - $${stockData.high52Week.toFixed(2)}\n`;
    if (stockData.dividendYield > 0) {
      context += `- **Dividend Yield**: ${(stockData.dividendYield * 100).toFixed(2)}%\n`;
    }
    context += `\n`;
    
    // Annual revenue trends
    if (annualRevenue.length > 0) {
      context += `## Annual Revenue Trends\n`;
      annualRevenue.forEach((year, index) => {
        const revenue = year.totalRevenue / 1000000000;
        const netIncome = year.netIncome / 1000000000;
        const margin = year.totalRevenue > 0 ? (year.netIncome / year.totalRevenue * 100) : 0;
        
        context += `- **${year.fiscalDateEnding}**: Revenue $${revenue.toFixed(2)}B, Net Income $${netIncome.toFixed(2)}B (${margin.toFixed(1)}% margin)\n`;
        
        if (index > 0) {
          const prevRevenue = annualRevenue[index - 1].totalRevenue;
          const growth = prevRevenue > 0 ? ((year.totalRevenue - prevRevenue) / prevRevenue * 100) : 0;
          context += `  - Revenue growth: ${growth > 0 ? '+' : ''}${growth.toFixed(1)}% YoY\n`;
        }
      });
      context += `\n`;
    }
    
    // Quarterly performance
    if (quarterlyRevenue.length > 0) {
      context += `## Recent Quarterly Performance\n`;
      quarterlyRevenue.forEach((quarter, index) => {
        const revenue = quarter.totalRevenue / 1000000000;
        const netIncome = quarter.netIncome / 1000000000;
        
        context += `- **${quarter.fiscalDateEnding}**: Revenue $${revenue.toFixed(2)}B, Net Income $${netIncome.toFixed(2)}B\n`;
        
        if (index > 0) {
          const prevQuarter = quarterlyRevenue[index - 1];
          const qoqGrowth = prevQuarter.totalRevenue > 0 ? ((quarter.totalRevenue - prevQuarter.totalRevenue) / prevQuarter.totalRevenue * 100) : 0;
          context += `  - QoQ growth: ${qoqGrowth > 0 ? '+' : ''}${qoqGrowth.toFixed(1)}%\n`;
        }
      });
      context += `\n`;
    }
    
    // Performance analysis
    context += `## Financial Performance Analysis\n`;
    if (annualRevenue.length >= 2) {
      const latestYear = annualRevenue[0];
      const prevYear = annualRevenue[1];
      const revenueGrowth = ((latestYear.totalRevenue - prevYear.totalRevenue) / prevYear.totalRevenue * 100);
      const profitabilityTrend = latestYear.netIncome > prevYear.netIncome ? 'improving' : 'declining';
      
      context += `- **Revenue Growth**: ${revenueGrowth > 0 ? '+' : ''}${revenueGrowth.toFixed(1)}% year-over-year\n`;
      context += `- **Profitability Trend**: ${profitabilityTrend}\n`;
    }
    
    // Valuation context
    if (stockData.peRatio > 0) {
      let valuationNote = '';
      if (stockData.peRatio < 15) valuationNote = '(potentially undervalued)';
      else if (stockData.peRatio > 25) valuationNote = '(potentially overvalued)';
      else valuationNote = '(reasonably valued)';
      
      context += `- **Valuation**: P/E ratio of ${stockData.peRatio.toFixed(2)} ${valuationNote}\n`;
    }
    
    context += `\n---\n`;
    context += `*Data as of ${new Date(stockData.lastUpdated).toLocaleDateString()}*\n`;
    
    return context;
  }

  /**
   * Perform auto-update for earnings that happened 2 days ago
   */
  async performAutoUpdate(): Promise<{ updated: string[]; errors: string[] }> {
    const { shouldUpdate, earningsToUpdate } = await this.checkForAutoUpdate();
    
    if (!shouldUpdate) {
      console.log('No auto-updates needed today');
      return { updated: [], errors: [] };
    }

    console.log(`Starting auto-update for ${earningsToUpdate.length} companies`);
    
    const updated: string[] = [];
    const errors: string[] = [];

    for (const earning of earningsToUpdate) {
      try {
        console.log(`Auto-updating ${earning.symbol} (earnings from ${earning.reportDate})`);
        
        // Get all analyst folders to find those related to this symbol
        const folders = await googleDriveService.listAnalystFolders();
        
        // For each analyst folder, check if they have questions for this symbol
        // and update their Excel files and profiles
        for (const folder of folders) {
          try {
            const analystName = folder.name;
            
            // Check if this analyst has questions for this symbol by attempting to upload
            // The upload function will handle checking existing data and updating accordingly
            const result = await googleDriveService.uploadAnalystExcel(analystName, [], 
              `${analystName}_${earning.symbol}_Questions.xlsx`);
            
            if (result.isUpdate) {
              console.log(`Updated Excel for ${analystName} (${earning.symbol})`);
              
              // Generate updated profile
              await googleDriveService.uploadAnalystProfile(analystName);
              console.log(`Generated updated profile for ${analystName}`);
              
              updated.push(`${analystName} (${earning.symbol})`);
            }
            
          } catch (analystError: any) {
            console.error(`Error updating ${folder.name} for ${earning.symbol}:`, analystError.message);
            // Continue with other analysts
          }
        }
        
      } catch (error: any) {
        console.error(`Error auto-updating ${earning.symbol}:`, error.message);
        errors.push(`${earning.symbol}: ${error.message}`);
      }
    }

    console.log(`Auto-update complete: ${updated.length} updated, ${errors.length} errors`);
    return { updated, errors };
  }
}

export const earningsTracker = new EarningsTracker();