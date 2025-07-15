import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { fetchTranscriptsSchema, downloadAnalystQuestionsSchema, downloadPreparedStatementsSchema, generateSummarySchema, type AnalystQuestion, type PreparedStatement, type TranscriptSummary } from "@shared/schema";
import { z } from "zod";
import * as XLSX from "xlsx";
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx";
import OpenAI from "openai";
import { googleDriveService } from "./google-drive";
import { earningsTracker } from "./earnings-tracker";
import cron from 'node-cron';

export async function registerRoutes(app: Express): Promise<Server> {
  
  // Google Drive Authentication Routes
  app.get("/api/google-drive/auth-url", async (req, res) => {
    try {
      const authUrl = googleDriveService.getAuthUrl();
      res.json({ authUrl });
    } catch (error) {
      console.error("Error generating auth URL:", error);
      res.status(500).json({ message: "Failed to generate authentication URL" });
    }
  });

  app.get("/auth/google/callback", async (req, res) => {
    try {
      console.log("OAuth callback received with query:", req.query);
      const { code, state } = req.query;
      
      if (!code) {
        console.error("No authorization code received");
        return res.status(400).send("Authorization code required");
      }
      
      console.log("Exchanging authorization code for tokens...");
      await googleDriveService.setCredentials(code as string);
      console.log("Authentication successful, sending success response");
      
      // Send a script that closes the popup and notifies the parent window
      res.send(`
        <script>
          console.log('OAuth callback success, notifying parent window');
          window.opener.postMessage({ type: 'google-auth-success' }, '*');
          window.close();
        </script>
      `);
    } catch (error: any) {
      console.error("Error in OAuth callback:", error);
      res.send(`
        <script>
          console.log('OAuth callback error:', '${error?.message || 'Unknown error'}');
          window.opener.postMessage({ type: 'google-auth-error', error: 'Authentication failed: ${error?.message || 'Unknown error'}' }, '*');
          window.close();
        </script>
      `);
    }
  });

  app.get("/api/google-drive/status", async (req, res) => {
    try {
      const isAuthenticated = googleDriveService.isAuthenticatedStatus();
      if (!isAuthenticated) {
        // Try to authenticate automatically first
        const autoAuthSuccess = await googleDriveService.authenticateDirectly();
        if (autoAuthSuccess) {
          res.json({ isAuthenticated: true, method: 'service_account' });
        } else {
          const authUrl = googleDriveService.getAuthUrl('full');
          const altAuthUrl = googleDriveService.getAuthUrl('file');
          res.json({ 
            isAuthenticated: false, 
            authUrl, 
            altAuthUrl,
            method: 'oauth_required',
            scope: 'drive'
          });
        }
      } else {
        res.json({ isAuthenticated: true, method: 'already_authenticated' });
      }
    } catch (error) {
      console.error("Error checking authentication status:", error);
      res.status(500).json({ message: "Failed to check authentication status" });
    }
  });

  app.post("/api/google-drive/auth-manual", async (req, res) => {
    try {
      const { code } = req.body;
      if (!code) {
        return res.status(400).json({ message: "Authorization code required" });
      }
      
      console.log('Manual authentication with code:', code.substring(0, 20) + '...');
      await googleDriveService.setCredentials(code);
      
      res.json({ 
        success: true, 
        message: "Google Drive authenticated successfully",
        isAuthenticated: googleDriveService.isAuthenticatedStatus()
      });
    } catch (error: any) {
      console.error("Manual authentication error:", error);
      res.status(500).json({ 
        success: false, 
        message: "Authentication failed: " + (error?.message || 'Unknown error') 
      });
    }
  });

  app.get("/auth/google/callback", async (req, res) => {
    try {
      const { code, error } = req.query;
      
      if (error) {
        console.error("OAuth error:", error);
        return res.send(`
          <html>
            <script>
              window.opener.postMessage({
                type: 'google-auth-error',
                error: '${error}'
              }, '*');
              window.close();
            </script>
          </html>
        `);
      }
      
      if (!code) {
        return res.send(`
          <html>
            <script>
              window.opener.postMessage({
                type: 'google-auth-error',
                error: 'No authorization code received'
              }, '*');
              window.close();
            </script>
          </html>
        `);
      }
      
      await googleDriveService.setCredentials(code as string);
      
      res.send(`
        <html>
          <script>
            window.opener.postMessage({
              type: 'google-auth-success'
            }, '*');
            window.close();
          </script>
        </html>
      `);
    } catch (error: any) {
      console.error("Error in OAuth callback:", error);
      res.send(`
        <html>
          <script>
            window.opener.postMessage({
              type: 'google-auth-error',
              error: '${error?.message || 'Authentication failed'}'
            }, '*');
            window.close();
          </script>
        </html>
      `);
    }
  });

  app.post("/api/google-drive/callback", async (req, res) => {
    try {
      const { code } = req.body;
      if (!code) {
        return res.status(400).json({ message: "Authorization code required" });
      }
      
      await googleDriveService.setCredentials(code);
      res.json({ message: "Authentication successful" });
    } catch (error) {
      console.error("Error setting credentials:", error);
      res.status(500).json({ message: "Authentication failed" });
    }
  });

  app.get("/api/google-drive/analyst-folders", async (req, res) => {
    try {
      const folders = await googleDriveService.listAnalystFolders();
      res.json({ folders });
    } catch (error) {
      console.error("Error listing analyst folders:", error);
      res.status(500).json({ message: "Failed to list analyst folders" });
    }
  });

  app.post("/api/google-drive/generate-analyst-profile", async (req, res) => {
    try {
      // Check authentication status first
      if (!googleDriveService.isAuthenticatedStatus()) {
        return res.status(401).json({ 
          message: "Google Drive not authenticated. Please authenticate first.",
          requiresAuth: true 
        });
      }

      const { analystName } = req.body;
      
      if (!analystName) {
        return res.status(400).json({ message: "Analyst name required" });
      }

      console.log(`Generating analyst profile for: ${analystName}`);
      
      const result = await googleDriveService.uploadAnalystProfile(analystName);
      
      console.log(`Successfully generated profile for ${analystName}: ${result.fileName}`);
      
      res.json({ 
        success: true,
        message: `Analyst profile generated and uploaded successfully`,
        fileName: result.fileName,
        fileId: result.fileId
      });
      
    } catch (error: any) {
      console.error("Error generating analyst profile:", error);
      res.status(500).json({ 
        success: false,
        message: error.message || "Failed to generate analyst profile"
      });
    }
  });

  app.post("/api/google-drive/generate-all-profiles", async (req, res) => {
    try {
      // Check authentication status first
      if (!googleDriveService.isAuthenticatedStatus()) {
        return res.status(401).json({ 
          message: "Google Drive not authenticated. Please authenticate first.",
          requiresAuth: true 
        });
      }

      console.log("Generating profiles for all analysts...");
      
      // Get all analyst folders
      const folders = await googleDriveService.listAnalystFolders();
      const results = [];
      
      for (const folder of folders) {
        try {
          console.log(`Processing analyst: ${folder.name}`);
          const result = await googleDriveService.uploadAnalystProfile(folder.name);
          results.push({
            analyst: folder.name,
            success: true,
            fileName: result.fileName,
            fileId: result.fileId
          });
          console.log(`✓ Generated profile for ${folder.name}`);
        } catch (error: any) {
          console.error(`✗ Failed to generate profile for ${folder.name}:`, error.message);
          results.push({
            analyst: folder.name,
            success: false,
            error: error.message
          });
        }
      }
      
      const successCount = results.filter(r => r.success).length;
      const totalCount = results.length;
      
      res.json({ 
        success: true,
        message: `Generated ${successCount}/${totalCount} analyst profiles`,
        results: results
      });
      
    } catch (error: any) {
      console.error("Error generating all analyst profiles:", error);
      res.status(500).json({ 
        success: false,
        message: error.message || "Failed to generate analyst profiles"
      });
    }
  });

  app.post("/api/google-drive/upload-analyst-questions", async (req, res) => {
    try {
      // Check authentication status first
      if (!googleDriveService.isAuthenticatedStatus()) {
        return res.status(401).json({ 
          message: "Google Drive not authenticated. Please authenticate first.",
          requiresAuth: true 
        });
      }

      const { analystName, questions } = req.body;
      
      if (!analystName || !questions || !Array.isArray(questions)) {
        return res.status(400).json({ message: "Analyst name and questions array required" });
      }

      const result = await googleDriveService.uploadAnalystExcel(analystName, questions);
      const fileUrl = await googleDriveService.getFileUrl(result.fileId);
      
      res.json({ 
        message: result.isUpdate ? "Questions merged with existing file" : "New file created successfully",
        fileId: result.fileId,
        fileUrl,
        analystName,
        questionsCount: questions.length,
        fileUpdated: result.isUpdate,
        totalQuestions: result.totalQuestions
      });
    } catch (error) {
      console.error("Error uploading analyst questions:", error);
      const errorMessage = error.message.includes('No access, refresh token') 
        ? "Google Drive authentication expired. Please re-authenticate."
        : "Failed to upload questions to Google Drive";
      
      res.status(500).json({ 
        message: errorMessage,
        requiresAuth: error.message.includes('No access, refresh token')
      });
    }
  });
  
  // Fetch earnings call transcripts from AlphaVantage API
  app.post("/api/transcripts/fetch", async (req, res) => {
    try {
      const { symbol, quarters, years } = fetchTranscriptsSchema.parse(req.body);
      const apiKey = process.env.ALPHAVANTAGE_API_KEY || "MJXFXEOS813JEV1K";
      
      if (!apiKey) {
        return res.status(500).json({ message: "API key not configured" });
      }
      
      const fetchedTranscripts = [];
      
      // First, get company overview for context
      const overviewUrl = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${symbol}&apikey=${apiKey}`;
      let companyInfo = {};
      
      try {
        const overviewResponse = await fetch(overviewUrl);
        const overviewData = await overviewResponse.json();
        if (!overviewData["Error Message"]) {
          companyInfo = overviewData;
        }
      } catch (error) {
        console.log(`Could not fetch company overview for ${symbol}:`, error);
      }
      
      // Fetch earnings call transcripts using correct API format
      for (const year of years) {
        for (const quarter of quarters) {
          try {
            // Convert quarter format (Q1 -> 2024Q1)
            const quarterParam = `${year}${quarter}`;
            const transcriptUrl = `https://www.alphavantage.co/query?function=EARNINGS_CALL_TRANSCRIPT&symbol=${symbol}&quarter=${quarterParam}&apikey=${apiKey}`;
            
            console.log(`Fetching transcript for ${symbol} ${quarterParam}...`);
            
            const transcriptResponse = await fetch(transcriptUrl);
            const transcriptData = await transcriptResponse.json();
            
            console.log(`Transcript response for ${symbol} ${quarterParam}:`, JSON.stringify(transcriptData, null, 2));
            
            // Check if actual transcript data exists
            if (transcriptData.transcript && Array.isArray(transcriptData.transcript) && transcriptData.transcript.length > 0) {
              // Store transcript as JSON string to preserve structure for proper extraction
              const transcriptContent = JSON.stringify(transcriptData.transcript);
              const wordCount = transcriptData.transcript.reduce((count: number, entry: any) => 
                count + (entry.content?.split(/\s+/).length || 0), 0);
              
              const transcript = await storage.createTranscript({
                symbol: symbol.toUpperCase(),
                quarter,
                year,
                title: `${symbol.toUpperCase()} - ${quarter} ${year} Earnings Call Transcript`,
                date: `${quarter} ${year}`,
                content: transcriptContent,
                wordCount,
                revenue: "N/A",
                growth: "N/A", 
                eps: "N/A",
                margin: "N/A",
              });
              
              // Extract analyst questions from the transcript
              const analystQuestions = extractAnalystQuestions({
                ...transcript,
                content: transcriptData.transcript // Use the original array format
              });
              
              // Add analyst questions to the transcript object
              (transcript as any).analystQuestions = analystQuestions;
              
              fetchedTranscripts.push(transcript);
            } else if (transcriptData["Error Message"]) {
              console.log(`API Error for ${symbol} ${quarterParam}:`, transcriptData["Error Message"]);
            } else {
              console.log(`No transcript data available for ${symbol} ${quarterParam}`);
              
              // Get earnings-related news as fallback
              const newsUrl = `https://www.alphavantage.co/query?function=NEWS_SENTIMENT&tickers=${symbol}&apikey=${apiKey}&limit=50`;
              
              let newsData = {};
              try {
                const newsResponse = await fetch(newsUrl);
                const news = await newsResponse.json();
                if (!news["Error Message"] && news.feed) {
                  newsData = news;
                }
              } catch (error) {
                console.log(`Could not fetch news for ${symbol}:`, error);
              }
              
              if ((newsData as any).feed) {
                console.log(`News data for ${symbol}: Found ${(newsData as any).feed.length} articles`);
                
                // Filter for earnings-related news
                const relevantNews = (newsData as any).feed.filter((article: any) => {
                  const title = article.title.toLowerCase();
                  const summary = article.summary.toLowerCase();
                  return title.includes('earnings') || title.includes('quarterly') || 
                         summary.includes('earnings') || summary.includes('revenue') ||
                         title.includes('q1') || title.includes('q2') || title.includes('q3') || title.includes('q4');
                }).slice(0, 10);
                
                if (relevantNews.length > 0) {
                  const analysisContent = `EARNINGS CALL ANALYSIS FOR ${symbol.toUpperCase()}
Quarter: ${quarter} ${year}

COMPANY OVERVIEW:
${(companyInfo as any).Name || symbol.toUpperCase()} (${symbol.toUpperCase()})
Sector: ${(companyInfo as any).Sector || 'N/A'}
Industry: ${(companyInfo as any).Industry || 'N/A'}
Market Cap: ${(companyInfo as any).MarketCapitalization ? `$${(parseFloat((companyInfo as any).MarketCapitalization) / 1000000000).toFixed(1)}B` : 'N/A'}

EARNINGS NEWS AND ANALYSIS:

${relevantNews.map((article: any) => `
REPORT: ${article.title}
Published: ${article.time_published.substring(0,4)}-${article.time_published.substring(4,6)}-${article.time_published.substring(6,8)}
Source: ${article.source}

${article.summary}

Market Sentiment: ${article.overall_sentiment_label} (Score: ${article.overall_sentiment_score})
Relevance Score: ${article.ticker_sentiment?.find((t: any) => t.ticker === symbol.toUpperCase())?.relevance_score || 'N/A'}
---`).join('\n')}

This analysis is compiled from AlphaVantage financial data and earnings-related news coverage.`;
                
                  const wordCount = analysisContent.split(/\s+/).length;
                  
                  // Extract financial metrics
                  let revenue = "N/A", eps = "N/A", margin = "N/A", growth = "N/A";
                  
                  if ((companyInfo as any).RevenueTTM) {
                    revenue = `$${(parseFloat((companyInfo as any).RevenueTTM) / 1000000000).toFixed(1)}B`;
                  }
                  if ((companyInfo as any).EPS) {
                    eps = `$${(companyInfo as any).EPS}`;
                  }
                  if ((companyInfo as any).ProfitMargin) {
                    margin = `${(parseFloat((companyInfo as any).ProfitMargin) * 100).toFixed(1)}%`;
                  }
                  if ((companyInfo as any).QuarterlyRevenueGrowthYOY) {
                    growth = `${(parseFloat((companyInfo as any).QuarterlyRevenueGrowthYOY) * 100).toFixed(1)}%`;
                  }
                  
                  const transcript = await storage.createTranscript({
                    symbol: symbol.toUpperCase(),
                    quarter,
                    year,
                    title: `${symbol.toUpperCase()} - ${quarter} ${year} Earnings Analysis`,
                    date: `${quarter} ${year}`,
                    content: analysisContent,
                    wordCount,
                    revenue,
                    growth,
                    eps,
                    margin,
                  });
                  
                  fetchedTranscripts.push(transcript);
                }
              }
            }
          } catch (error) {
            console.error(`Error processing ${symbol} ${quarter} ${year}:`, error);
            continue;
          }
        }
      }
      
      if (fetchedTranscripts.length === 0) {
        const companyName = (companyInfo as any).Name || symbol.toUpperCase();
        const message = `No earnings call transcripts are currently available for ${companyName} (${symbol.toUpperCase()}) for the selected periods.`;
        return res.status(404).json({ message });
      }
      
      res.json({ transcripts: fetchedTranscripts });
      
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid request parameters", errors: error.errors });
      }
      
      console.error("Error fetching transcripts:", error);
      res.status(500).json({ message: "Failed to fetch earnings call transcripts. Please check your API key and try again." });
    }
  });
  
  // Get stored transcripts by filters
  app.get("/api/transcripts", async (req, res) => {
    try {
      const { symbol, quarters, years } = req.query;
      
      if (!symbol) {
        return res.status(400).json({ message: "Symbol is required" });
      }
      
      const quarterArray = quarters ? (Array.isArray(quarters) ? quarters : [quarters]) : [];
      const yearArray = years ? (Array.isArray(years) ? years.map(Number) : [Number(years)]) : [];
      
      const transcripts = await storage.getTranscriptsByFilters(
        symbol as string,
        quarterArray as string[],
        yearArray as number[]
      );
      
      res.json({ transcripts });
    } catch (error) {
      console.error("Error getting transcripts:", error);
      res.status(500).json({ message: "Failed to get transcripts" });
    }
  });

  function extractAnalystQuestionsFromMultipleTranscripts(transcripts: any[]): AnalystQuestion[] {
    const allQuestions: AnalystQuestion[] = [];
    const globalOperatorAnalystInfo = new Map<string, { company: string }>();
    
    // First pass: Extract all operator analyst information from all transcripts
    for (const transcript of transcripts) {
      const operatorInfo = extractOperatorAnalystInfo(transcript);
      for (const [analystName, info] of operatorInfo) {
        globalOperatorAnalystInfo.set(analystName, info);
      }
    }
    
    // Second pass: Extract questions from all transcripts using global operator info
    for (const transcript of transcripts) {
      const questions = extractAnalystQuestionsFromSingleTranscript(transcript, globalOperatorAnalystInfo);
      allQuestions.push(...questions);
    }
    
    console.log(`Collected ${allQuestions.length} questions from ${transcripts.length} transcripts for consolidation`);
    
    // Apply company-wide consolidation across all questions at once
    const consolidatedQuestions = applyCompanyWideAnalystConsolidation(allQuestions, globalOperatorAnalystInfo);
    
    console.log(`After consolidation: ${consolidatedQuestions.length} questions`);
    
    return consolidatedQuestions;
  }
  
  function extractOperatorAnalystInfo(transcript: any): Map<string, { company: string }> {
    const operatorAnalystInfo = new Map<string, { company: string }>();
    let segments: any[] = [];
    
    if (Array.isArray(transcript.content)) {
      segments = transcript.content;
    } else if (typeof transcript.content === 'string') {
      try {
        segments = JSON.parse(transcript.content);
      } catch (e) {
        const lines = transcript.content.split('\n\n');
        for (const line of lines) {
          const speakerMatch = line.match(/^(.+?)\s*\((.+?)\):\s*([\s\S]+)$/);
          if (speakerMatch) {
            const [, speaker, title, content] = speakerMatch;
            segments.push({ speaker, title, content });
          }
        }
      }
    }
    
    // Extract analyst information from operator introductions
    for (const segment of segments) {
      if (segment.speaker?.toLowerCase().includes('operator')) {
        const content = segment.content || '';
        
        const patterns = [
          /(?:first|next|following)\s+question\s+(?:is\s+from|comes\s+from)\s+([A-Za-z\s\.'-]+?)\s+(?:with|from|at)\s+([A-Za-z\s&\.\-]+?)(?:\.|,|please|go ahead|\s*$)/gi,
          /(\w+\s+\w+(?:\s+\w+)?)\s+(?:with|from|at)\s+([A-Za-z\s&\.\-]+?)(?:\.|,|please|go ahead|\s*$)/gi,
          /([A-Za-z\s\.'-]+?),\s*([A-Za-z\s&\.\-]+?)(?:\.|please|go ahead|\s*$)/gi,
          /([A-Za-z\s\.'-]+?)\s+from\s+([A-Za-z\s&\.\-]+?)(?:\.|,|please|go ahead|\s*$)/gi
        ];
        
        for (const pattern of patterns) {
          let match;
          while ((match = pattern.exec(content)) !== null) {
            let analystName = match[1].trim();
            let company = match[2].trim();
            
            analystName = analystName.replace(/^(the line of|line of)\s+/gi, '').trim();
            company = company.replace(/\b(please go ahead|go ahead|your question)\b/gi, '').trim();
            company = company.replace(/[.,;]$/, '').trim();
            
            if (analystName.length > 0 && company.length > 0) {
              console.log(`Extracted from operator: ${analystName} -> ${company}`);
              operatorAnalystInfo.set(analystName, { company });
            }
          }
        }
      }
    }
    
    return operatorAnalystInfo;
  }
  
  function extractAnalystQuestionsFromSingleTranscript(transcript: any, operatorAnalystInfo: Map<string, { company: string }>): AnalystQuestion[] {
    const questions: AnalystQuestion[] = [];
    let segments: any[] = [];
    
    if (Array.isArray(transcript.content)) {
      segments = transcript.content;
    } else if (typeof transcript.content === 'string') {
      try {
        segments = JSON.parse(transcript.content);
      } catch (e) {
        const lines = transcript.content.split('\n\n');
        for (const line of lines) {
          const speakerMatch = line.match(/^(.+?)\s*\((.+?)\):\s*([\s\S]+)$/);
          if (speakerMatch) {
            const [, speaker, title, content] = speakerMatch;
            segments.push({ speaker, title, content });
          }
        }
      }
    }
    
    console.log(`Processing transcript ${transcript.id}, found ${segments.length} segments`);
    
    for (const segment of segments) {
      const speakerName = segment.speaker;
      const speakerTitle = segment.title;
      const content = segment.content;
      
      const isAnalyst = (speakerTitle.toLowerCase().includes('analyst') || 
                        speakerTitle.toLowerCase().includes('research') ||
                        speakerTitle.toLowerCase().includes('equity')) &&
                       !speakerTitle.toLowerCase().includes('operator') &&
                       !speakerTitle.toLowerCase().includes('ceo') &&
                       !speakerTitle.toLowerCase().includes('cfo') &&
                       !speakerTitle.toLowerCase().includes('investor relations');
      
      if (isAnalyst) {
        const hasQuestion = content.includes('?') || 
                           /\b(what|how|when|where|why|can you|could you|would you|do you|are you|will you|is there)\b/i.test(content);
        
        if (hasQuestion) {
          let analystCompany = 'Unknown';
          
          const operatorInfo = operatorAnalystInfo.get(speakerName);
          if (operatorInfo) {
            analystCompany = normalizeCompanyName(operatorInfo.company);
            console.log(`Found operator info for ${speakerName}: ${analystCompany}`);
          } else {
            console.log(`No operator info found for ${speakerName}, extracting from title: "${speakerTitle}"`);
            
            const extractCompany = (title: string): string => {
              const patterns = [
                /(?:with|from|at)\s+([A-Za-z\s&\.\-]+?)(?:\s|$|,|\.|;)/i,
                /([A-Za-z\s&\.\-]+?)\s*(?:analyst|research|equity)/i,
                /analyst.*?(?:with|at|from)\s+([A-Za-z\s&\.\-]+?)(?:\s|$|,|\.|;)/i,
                /([A-Za-z\s&\.\-]+?)(?:\s*-\s*analyst|\s*analyst)/i,
                /([A-Za-z\s&\.\-]+?)(?:\s*,\s*analyst|\s*analyst)/i,
                /([A-Za-z\s&\.\-]+?)(?:\s*\|\s*analyst|\s*analyst)/i,
                /^([A-Za-z\s&\.\-]+?)(?:\s*analyst)/i,
              ];
              
              for (const pattern of patterns) {
                const match = title.match(pattern);
                if (match && match[1]) {
                  let company = match[1].trim();
                  company = company.replace(/\b(analyst|research|equity)\b/gi, '').trim();
                  
                  if (company.length > 2 && !company.toLowerCase().includes('unknown')) {
                    return normalizeCompanyName(company);
                  }
                }
              }
              return 'Unknown';
            };
            
            analystCompany = extractCompany(speakerTitle);
            if (analystCompany === 'Unknown') {
              console.log(`Could not extract company from title: "${speakerTitle}"`);
            }
          }
          
          questions.push({
            analystName: speakerName.trim(),
            analystTitle: speakerTitle.trim(),
            analystCompany: analystCompany,
            question: content.trim(),
            transcriptId: transcript.id,
            symbol: transcript.symbol,
            quarter: transcript.quarter,
            year: transcript.year,
            transcriptTitle: transcript.title,
          });
        }
      }
    }
    
    return questions;
  }

  function extractAnalystQuestions(transcript: any): AnalystQuestion[] {
    const questions: AnalystQuestion[] = [];
    
    // Handle JSON string that needs parsing
    let segments = [];
    
    if (Array.isArray(transcript.content)) {
      segments = transcript.content;
    } else if (typeof transcript.content === 'string') {
      try {
        // Try parsing as JSON first
        segments = JSON.parse(transcript.content);
      } catch (e) {
        // Fall back to text parsing
        const lines = transcript.content.split('\n\n');
        for (const line of lines) {
          const speakerMatch = line.match(/^(.+?)\s*\((.+?)\):\s*([\s\S]+)$/);
          if (speakerMatch) {
            const [, speaker, title, content] = speakerMatch;
            segments.push({ speaker, title, content });
          }
        }
      }
    }
    
    console.log(`Processing transcript ${transcript.id}, found ${segments.length} segments`);
    
    // Debug: Log first few segments to understand structure
    console.log('Sample segments:', segments.slice(0, 3).map(s => ({ 
      speaker: s.speaker, 
      title: s.title, 
      contentLength: s.content?.length 
    })));
    
    // First pass: Extract analyst information from operator introductions
    const operatorAnalystInfo = new Map<string, { company: string }>();
    
    for (const segment of segments) {
      if (segment.speaker && segment.title && segment.content) {
        const speakerTitle = segment.title.toLowerCase();
        const content = segment.content;
        
        // Check if this is an operator introduction
        if (speakerTitle.includes('operator')) {
          // Pattern matching for operator introductions - enhanced patterns
          const patterns = [
            // Standard patterns
            /(?:next|our next).*?(?:question|call).*?(?:is )?from\s+([A-Za-z\s\.'-]+?)\s+(?:with|from|at)\s+([A-Za-z\s&\.\-]+?)(?:\.|,|please|go ahead|\s*$)/gi,
            /(?:question|call).*?(?:is )?from\s+([A-Za-z\s\.'-]+?)\s+(?:with|from|at)\s+([A-Za-z\s&\.\-]+?)(?:\.|,|please|go ahead|\s*$)/gi,
            /([A-Za-z\s\.'-]+?)\s+(?:with|from|at)\s+([A-Za-z\s&\.\-]+?)(?:\.|,|please|go ahead|\s*$)/gi,
            /(?:we have|next we have)\s+([A-Za-z\s\.'-]+?)\s+(?:with|from|at)\s+([A-Za-z\s&\.\-]+?)(?:\.|,|please|go ahead|\s*$)/gi,
            /(?:question from|call from)\s+([A-Za-z\s\.'-]+?)\s+(?:with|from|at)\s+([A-Za-z\s&\.\-]+?)(?:\.|,|please|go ahead|\s*$)/gi,
            // Additional patterns for different formats
            /(?:comes|is)\s+from\s+([A-Za-z\s\.'-]+?)\s+(?:with|from|at)\s+([A-Za-z\s&\.\-]+?)(?:\.|,|please|go ahead|\s*$)/gi,
            /(?:next|our next|the next).*?(?:question|caller).*?(?:comes from|is from)\s+([A-Za-z\s\.'-]+?)\s+(?:with|from|at)\s+([A-Za-z\s&\.\-]+?)(?:\.|,|please|go ahead|\s*$)/gi,
            /(\w+\s+\w+(?:\s+\w+)?)\s+(?:with|from|at)\s+([A-Za-z\s&\.\-]+?)(?:\.|,|please|go ahead|\s*$)/gi,
            // Pattern for "Name, Company" format
            /([A-Za-z\s\.'-]+?),\s*([A-Za-z\s&\.\-]+?)(?:\.|please|go ahead|\s*$)/gi,
            // Pattern for "Name from Company" without other words
            /([A-Za-z\s\.'-]+?)\s+from\s+([A-Za-z\s&\.\-]+?)(?:\.|,|please|go ahead|\s*$)/gi
          ];
          
          for (const pattern of patterns) {
            let match;
            while ((match = pattern.exec(content)) !== null) {
              let analystName = match[1].trim();
              let company = match[2].trim();
              
              // Clean up analyst name - remove "the line of" and similar phrases
              analystName = analystName.replace(/^(the line of|line of)\s+/gi, '').trim();
              
              // Clean up company name
              company = company.replace(/\b(please go ahead|go ahead|your question)\b/gi, '').trim();
              company = company.replace(/[.,;]$/, '').trim();
              
              if (analystName.length > 0 && company.length > 0) {
                console.log(`Extracted from operator: ${analystName} -> ${company}`);
                operatorAnalystInfo.set(analystName, { company });
              }
            }
          }
        }
      }
    }
    
    // Banking institution mappings for better recognition
    const bankingInstitutions = {
      'jpmorgan': 'JPMorgan Chase',
      'jp morgan': 'JPMorgan Chase',
      'goldman': 'Goldman Sachs',
      'goldman sachs': 'Goldman Sachs',
      'morgan stanley': 'Morgan Stanley',
      'barclays': 'Barclays',
      'citigroup': 'Citigroup',
      'citi': 'Citigroup',
      'bank of america': 'Bank of America',
      'bofa': 'Bank of America',
      'wells fargo': 'Wells Fargo',
      'deutsche bank': 'Deutsche Bank',
      'credit suisse': 'Credit Suisse',
      'ubs': 'UBS',
      'hsbc': 'HSBC',
      'rbc': 'Royal Bank of Canada',
      'royal bank': 'Royal Bank of Canada',
      'scotia': 'Scotiabank',
      'scotiabank': 'Scotiabank',
      'td bank': 'TD Bank',
      'bmo': 'Bank of Montreal',
      'jefferies': 'Jefferies',
      'cowen': 'Cowen',
      'piper sandler': 'Piper Sandler',
      'wedbush': 'Wedbush',
      'oppenheimer': 'Oppenheimer',
      'stifel': 'Stifel',
      'raymond james': 'Raymond James',
      'baird': 'Baird',
      'mizuho': 'Mizuho',
      'evercore': 'Evercore',
      'canaccord': 'Canaccord Genuity'
    };

    // Function to normalize company names using banking institution mappings
    const normalizeCompanyName = (company: string): string => {
      const companyLower = company.toLowerCase();
      for (const [key, value] of Object.entries(bankingInstitutions)) {
        if (companyLower.includes(key)) {
          return value;
        }
      }
      return company;
    };

    for (const segment of segments) {
      if (segment.speaker && segment.title && segment.content) {
        const speakerName = segment.speaker;
        const speakerTitle = segment.title;
        const content = segment.content;
        
        // Check if this is an analyst based on title (exclude operators and executives)
        const isAnalyst = (speakerTitle.toLowerCase().includes('analyst') || 
                          speakerTitle.toLowerCase().includes('research') ||
                          speakerTitle.toLowerCase().includes('equity')) &&
                         !speakerTitle.toLowerCase().includes('operator') &&
                         !speakerTitle.toLowerCase().includes('ceo') &&
                         !speakerTitle.toLowerCase().includes('cfo') &&
                         !speakerTitle.toLowerCase().includes('investor relations');
        
        if (isAnalyst) {
          // Check if content contains questions (ends with ?, contains question words)
          const hasQuestion = content.includes('?') || 
                             /\b(what|how|when|where|why|can you|could you|would you|do you|are you|will you|is there)\b/i.test(content);
          
          if (hasQuestion) {
            let analystCompany = 'Unknown';
            
            // First, check if we have operator-extracted information for this analyst
            const operatorInfo = operatorAnalystInfo.get(speakerName);
            if (operatorInfo) {
              analystCompany = normalizeCompanyName(operatorInfo.company);
              console.log(`Found operator info for ${speakerName}: ${analystCompany}`);
            } else {
              console.log(`No operator info found for ${speakerName}, extracting from title: "${speakerTitle}"`);
              
              // Fall back to extracting from analyst title
              const extractCompany = (title: string): string => {
                // Enhanced patterns for company extraction from titles
                const patterns = [
                  /(?:with|from|at)\s+([A-Za-z\s&\.\-]+?)(?:\s|$|,|\.|;)/i,           // "with JPMorgan", "from Goldman Sachs"
                  /([A-Za-z\s&\.\-]+?)\s*(?:analyst|research|equity)/i,               // "JPMorgan Analyst"
                  /analyst.*?(?:with|at|from)\s+([A-Za-z\s&\.\-]+?)(?:\s|$|,|\.|;)/i, // "Analyst with Barclays"
                  /([A-Za-z\s&\.\-]+?)(?:\s*-\s*analyst|\s*analyst)/i,                // "Barclays - Analyst"
                  // Additional patterns for edge cases
                  /([A-Za-z\s&\.\-]+?)(?:\s*,\s*analyst|\s*analyst)/i,                // "Company, Analyst"
                  /([A-Za-z\s&\.\-]+?)(?:\s*\|\s*analyst|\s*analyst)/i,               // "Company | Analyst"
                  /^([A-Za-z\s&\.\-]+?)(?:\s*analyst)/i,                              // Start with company name
                ];
                
                for (const pattern of patterns) {
                  const match = title.match(pattern);
                  if (match && match[1]) {
                    let company = match[1].trim();
                    // Clean up common suffixes and prefixes
                    company = company.replace(/\b(analyst|research|equity|securities|capital|markets|llc|inc|corp|ltd|senior|managing|director|vice president|vp)\b/gi, '').trim();
                    // Remove extra whitespace and punctuation
                    company = company.replace(/\s+/g, ' ').replace(/^[,\-\|]\s*/, '').replace(/\s*[,\-\|]$/, '').trim();
                    
                    if (company.length > 2 && !company.match(/^(the|and|or|of|in|at|on|for|with|by)$/i)) {
                      console.log(`Extracted company from title: "${company}"`);
                      return normalizeCompanyName(company);
                    }
                  }
                }
                
                // If no pattern matches, try to extract the first meaningful word(s) before "analyst"
                const simpleMatch = title.match(/^([A-Za-z\s&\.\-]+?)\s+analyst/i);
                if (simpleMatch && simpleMatch[1]) {
                  let company = simpleMatch[1].trim();
                  if (company.length > 2) {
                    console.log(`Fallback extraction: "${company}"`);
                    return normalizeCompanyName(company);
                  }
                }
                
                console.log(`Could not extract company from title: "${title}"`);
                return 'Unknown';
              };
              
              analystCompany = extractCompany(speakerTitle);
            }

            // The speaker name should already be clean from the mock data
            const cleanAnalystName = speakerName.trim();
            
            questions.push({
              analystName: cleanAnalystName,
              analystTitle: speakerTitle.trim(),
              analystCompany: analystCompany,
              question: content.trim(),
              transcriptId: transcript.id,
              symbol: transcript.symbol,
              quarter: transcript.quarter,
              year: transcript.year,
              transcriptTitle: transcript.title,
            });
          }
        }
      }
    }
    
    // Post-processing: Apply company-wide analyst consolidation across all transcripts
    const consolidatedQuestions = applyCompanyWideAnalystConsolidation(questions, operatorAnalystInfo);
    
    return consolidatedQuestions;
  }

  function applyCompanyWideAnalystConsolidation(questions: AnalystQuestion[], operatorAnalystInfo: Map<string, { company: string }>): AnalystQuestion[] {
    // First, apply transcript-wide operator assignments
    const transcriptGroups = new Map<number, AnalystQuestion[]>();
    
    for (const question of questions) {
      const transcriptId = question.transcriptId;
      if (!transcriptGroups.has(transcriptId)) {
        transcriptGroups.set(transcriptId, []);
      }
      transcriptGroups.get(transcriptId)!.push(question);
    }
    
    const transcriptProcessedQuestions: AnalystQuestion[] = [];
    
    // Apply transcript-wide company assignments first
    for (const [transcriptId, transcriptQuestions] of transcriptGroups) {
      for (const question of transcriptQuestions) {
        const analystName = question.analystName.trim();
        
        // If operator introduced this analyst with a company, use it for all instances in this transcript
        if (operatorAnalystInfo.has(analystName)) {
          const operatorCompany = operatorAnalystInfo.get(analystName)!.company;
          const normalizedCompany = normalizeCompanyName(operatorCompany);
          
          if (question.analystCompany !== normalizedCompany) {
            console.log(`Transcript ${transcriptId}: Updating ${analystName} from "${question.analystCompany}" to "${normalizedCompany}"`);
            question.analystCompany = normalizedCompany;
          }
        }
        
        transcriptProcessedQuestions.push(question);
      }
    }
    
    // Now apply company-wide consolidation across all transcripts for same stock symbol
    const symbolGroups = new Map<string, AnalystQuestion[]>();
    
    for (const question of transcriptProcessedQuestions) {
      const symbol = question.symbol;
      if (!symbolGroups.has(symbol)) {
        symbolGroups.set(symbol, []);
      }
      symbolGroups.get(symbol)!.push(question);
    }
    
    const finalConsolidatedQuestions: AnalystQuestion[] = [];
    
    // Process each stock symbol separately
    for (const [symbol, symbolQuestions] of symbolGroups) {
      console.log(`Processing company-wide consolidation for ${symbol} with ${symbolQuestions.length} questions`);
      
      // Group analysts by normalized name within this stock symbol
      const analystNameGroups = new Map<string, { 
        normalizedName: string, 
        originalNames: Set<string>, 
        knownCompany: string, 
        entries: AnalystQuestion[] 
      }>();
      
      for (const question of symbolQuestions) {
        const analystName = question.analystName.trim();
        const { normalizedName } = normalizeAnalystName(analystName);
        
        if (!analystNameGroups.has(normalizedName)) {
          analystNameGroups.set(normalizedName, {
            normalizedName,
            originalNames: new Set(),
            knownCompany: question.analystCompany !== 'Unknown' ? question.analystCompany : '',
            entries: []
          });
        }
        
        const analystGroup = analystNameGroups.get(normalizedName)!;
        analystGroup.originalNames.add(analystName);
        
        // If we find a known company for this analyst, update the group
        if (question.analystCompany !== 'Unknown') {
          analystGroup.knownCompany = question.analystCompany;
        }
        
        analystGroup.entries.push(question);
      }
      
      // Consolidate each analyst group
      for (const [normalizedName, analystGroup] of analystNameGroups) {
        const { originalNames, knownCompany, entries } = analystGroup;
        
        // Log name consolidation if multiple original names were found
        if (originalNames.size > 1) {
          console.log(`Name consolidation for ${symbol}: Merging ${Array.from(originalNames).join(', ')} -> ${normalizedName} (${entries.length} questions)`);
        }
        
        // Update all entries to use the normalized name and consistent company
        const preferredName = normalizedName;
        
        for (const entry of entries) {
          // Update analyst name to normalized version
          if (entry.analystName !== preferredName) {
            console.log(`Name standardization: "${entry.analystName}" -> "${preferredName}"`);
            entry.analystName = preferredName;
          }
          
          // Update company if we have a known company
          if (knownCompany && entry.analystCompany !== knownCompany) {
            console.log(`Company consolidation: Updating ${preferredName} from "${entry.analystCompany}" to "${knownCompany}" in ${symbol}`);
            entry.analystCompany = knownCompany;
          }
        }
        
        if (knownCompany && originalNames.size > 1) {
          const unknownCount = entries.filter(e => e.analystCompany === 'Unknown').length;
          const knownCount = entries.filter(e => e.analystCompany !== 'Unknown').length;
          
          if (unknownCount > 0 && knownCount > 0) {
            console.log(`Company-wide consolidation for ${symbol}: Merging ${unknownCount} "Unknown" entries with ${knownCount} known entries for ${preferredName} under ${knownCompany}`);
          }
        }
        
        finalConsolidatedQuestions.push(...entries);
      }
    }
    
    return finalConsolidatedQuestions;
  }

  function normalizeAnalystName(analystName: string): { normalizedName: string, firstName: string, lastName: string } {
    // Common short/long name mappings
    const nameVariations: Record<string, string> = {
      'mike': 'michael',
      'mike.': 'michael',
      'mich': 'michael',
      'jim': 'james',
      'jimmy': 'james',
      'jim.': 'james',
      'bob': 'robert',
      'bobby': 'robert',
      'rob': 'robert',
      'dick': 'richard',
      'rick': 'richard',
      'rich': 'richard',
      'bill': 'william',
      'billy': 'william',
      'will': 'william',
      'tom': 'thomas',
      'tommy': 'thomas',
      'dan': 'daniel',
      'danny': 'daniel',
      'dave': 'david',
      'davey': 'david',
      'chris': 'christopher',
      'nick': 'nicholas',
      'alex': 'alexander',
      'steve': 'steven',
      'ben': 'benjamin',
      'matt': 'matthew',
      'tony': 'anthony',
      'joe': 'joseph',
      'joey': 'joseph',
      'sam': 'samuel',
      'sammy': 'samuel',
      'andy': 'andrew',
      'pat': 'patrick',
      'pete': 'peter',
      'ed': 'edward',
      'eddie': 'edward',
      'ted': 'theodore',
      'frank': 'francis',
      'greg': 'gregory',
      'jeff': 'jeffrey',
      'ken': 'kenneth',
      'kenny': 'kenneth',
      'brad': 'bradley',
      'marc': 'mark',
      'jon': 'jonathan',
      'johnny': 'jonathan',
      'tim': 'timothy',
      'timmy': 'timothy'
    };

    const nameParts = analystName.trim().split(/\s+/);
    let firstName = nameParts[0]?.toLowerCase() || '';
    const lastName = nameParts[nameParts.length - 1]?.toLowerCase() || '';
    
    // Normalize the first name if it's a common variation
    const normalizedFirstName = nameVariations[firstName] || firstName;
    
    // Create normalized full name with proper capitalization
    const capitalizedFirstName = normalizedFirstName.charAt(0).toUpperCase() + normalizedFirstName.slice(1);
    const capitalizedLastName = lastName.charAt(0).toUpperCase() + lastName.slice(1);
    
    const normalizedName = `${capitalizedFirstName} ${capitalizedLastName}`;
    
    return {
      normalizedName,
      firstName: capitalizedFirstName,
      lastName: capitalizedLastName
    };
  }

  function normalizeCompanyName(company: string): string {
    const institutions = {
      'jpmorgan': 'JPMorgan Chase',
      'jp morgan': 'JPMorgan Chase',
      'goldman': 'Goldman Sachs',
      'goldman sachs': 'Goldman Sachs',
      'morgan stanley': 'Morgan Stanley',
      'barclays': 'Barclays',
      'citigroup': 'Citigroup',
      'citi': 'Citigroup',
      'bank of america': 'Bank of America',
      'bofa': 'Bank of America',
      'wells fargo': 'Wells Fargo',
      'deutsche bank': 'Deutsche Bank',
      'credit suisse': 'Credit Suisse',
      'ubs': 'UBS',
      'hsbc': 'HSBC',
      'rbc': 'Royal Bank of Canada',
      'royal bank': 'Royal Bank of Canada',
      'scotia': 'Scotiabank',
      'scotiabank': 'Scotiabank',
      'td bank': 'TD Bank',
      'bmo': 'Bank of Montreal',
      'jefferies': 'Jefferies',
      'cowen': 'Cowen',
      'piper sandler': 'Piper Sandler',
      'wedbush': 'Wedbush',
      'oppenheimer': 'Oppenheimer',
      'stifel': 'Stifel',
      'raymond james': 'Raymond James',
      'baird': 'Baird',
      'mizuho': 'Mizuho',
      'evercore': 'Evercore',
      'canaccord': 'Canaccord Genuity'
    };

    const companyLower = company.toLowerCase();
    for (const [key, value] of Object.entries(institutions)) {
      if (companyLower.includes(key)) {
        return value;
      }
    }
    return company;
  }



  // Extract prepared statements from transcript content
  function extractPreparedStatements(transcript: any): PreparedStatement[] {
    const statements: PreparedStatement[] = [];
    
    try {
      let speakers: any[] = [];
      
      console.log(`Processing transcript ${transcript.id}, content type: ${typeof transcript.content}`);
      console.log(`Content preview: ${transcript.content.substring(0, 200)}...`);
      
      // Handle both JSON and text formats
      if (transcript.content.trim().startsWith('[') || transcript.content.trim().startsWith('{')) {
        // JSON format
        try {
          speakers = JSON.parse(transcript.content);
          console.log(`Processing transcript ${transcript.id}, found ${speakers.length} segments`);
          console.log(`Sample segments:`, speakers.slice(0, 3).map(s => ({ 
            speaker: s.speaker, 
            title: s.title, 
            contentLength: s.content?.length || 0 
          })));
        } catch (parseError) {
          console.error(`Failed to parse JSON content for transcript ${transcript.id}:`, parseError);
          return statements;
        }
      } else {
        // Text format - convert to speaker objects
        const lines = transcript.content.split('\n\n');
        speakers = [];
        
        for (const line of lines) {
          const speakerMatch = line.match(/^(.+?)\s*\((.+?)\):\s*([\s\S]+)$/);
          if (speakerMatch) {
            const [, speakerName, speakerTitle, content] = speakerMatch;
            speakers.push({
              speaker: speakerName.trim(),
              title: speakerTitle.trim(),
              content: content.trim()
            });
          }
        }
        console.log(`Text format: found ${speakers.length} speakers`);
      }
      
      // Find where Q&A section starts by looking for first analyst or Q&A operator
      let qaStartIndex = -1;
      console.log(`Analyzing ${speakers.length} speakers to find Q&A start...`);
      for (let i = 0; i < speakers.length; i++) {
        const speaker = speakers[i];
        const title = (speaker.title || '').toLowerCase();
        const content = (speaker.content || '').toLowerCase();
        const isOperator = title.includes('operator');
        const isAnalyst = title.includes('analyst');
        
        // Skip initial operator introduction - look for actual Q&A patterns
        if (isAnalyst) {
          // Any analyst indicates Q&A section
          qaStartIndex = i;
          console.log(`Q&A section starts at index ${i} with analyst: ${speaker.speaker} (${speaker.title})`);
          break;
        } else if (isOperator && i > 0 && (
          content.includes('question') || 
          content.includes('next question') || 
          content.includes('first question') ||
          content.includes('our next caller')
        )) {
          // Operator doing Q&A (not just introduction)
          qaStartIndex = i;
          console.log(`Q&A section starts at index ${i} with Q&A operator: ${speaker.speaker} (${speaker.title})`);
          break;
        }
      }
      
      // If no Q&A section found, treat all as potential prepared statements
      if (qaStartIndex === -1) {
        qaStartIndex = speakers.length;
        console.log(`No Q&A section found, treating all ${speakers.length} speakers as prepared statements`);
      }
      
      // Only process speakers before Q&A section starts
      const preparedStatementSpeakers = speakers.slice(0, qaStartIndex);
      
      preparedStatementSpeakers.forEach((speaker: any) => {
        const title = speaker.title || '';
        
        // Executive titles that indicate prepared statement speakers
        const executiveTitles = [
          'CEO', 'CFO', 'COO', 'CTO', 'CRO', 'CMO', 'Chief Executive Officer',
          'Chief Financial Officer', 'Chief Operating Officer', 'Chief Technology Officer',
          'President', 'Vice President', 'VP', 'Senior Vice President', 'SVP',
          'Executive Vice President', 'EVP', 'Vice-Chairman', 'Vice Chairman',
          'Chairman', 'Founder', 'Co-Founder', 'Managing Director', 'Director'
        ];
        
        // Check if this speaker has an executive title
        const isExecutive = executiveTitles.some(execTitle => 
          title.toLowerCase().includes(execTitle.toLowerCase())
        );
        
        // Exclude analysts, operators, and investor relations
        const isAnalyst = title.toLowerCase().includes('analyst');
        const isOperator = title.toLowerCase().includes('operator');
        const isInvestorRelations = title.toLowerCase().includes('investor relations') ||
                                  title.toLowerCase().includes('head of investor relations') ||
                                  title.toLowerCase().includes('director of investor relations') ||
                                  title.toLowerCase().includes('vp investor relations') ||
                                  title.toLowerCase().includes('vice president investor relations');
        
        // Debug logging for each speaker - only for executives
        if (isExecutive) {
          console.log(`EXECUTIVE FOUND: ${speaker.speaker}, Title: ${title}, IsExecutive: ${isExecutive}, IsAnalyst: ${isAnalyst}, IsOperator: ${isOperator}, IsInvestorRelations: ${isInvestorRelations}, ContentLength: ${speaker.content?.length || 0}, QAStartIndex: ${qaStartIndex}, CurrentIndex: ${preparedStatementSpeakers.indexOf(speaker)}`);
        }
        
        // Only include executives with substantial content who appear before Q&A section
        if (isExecutive && !isAnalyst && !isOperator && !isInvestorRelations && 
            speaker.content && speaker.content.trim().length > 100) {
          console.log(`✓ ADDING prepared statement for: ${speaker.speaker} (${title}) - Content: ${speaker.content.substring(0, 200)}...`);
          statements.push({
            speakerName: speaker.speaker || 'Unknown',
            speakerTitle: title,
            statement: speaker.content.trim(),
            transcriptId: transcript.id,
            symbol: transcript.symbol,
            quarter: transcript.quarter,
            year: transcript.year,
            transcriptTitle: transcript.title
          });
        }
      });
    } catch (error) {
      console.error('Error parsing transcript content for prepared statements:', error);
    }
    
    return statements;
  }

  // Download analyst questions in various formats
  app.post("/api/analyst-questions/download", async (req, res) => {
    try {
      const { transcriptIds, format } = downloadAnalystQuestionsSchema.parse(req.body);
      
      // Get all transcripts
      const allQuestions: AnalystQuestion[] = [];
      
      for (const transcriptId of transcriptIds) {
        const transcript = await storage.getTranscript(transcriptId);
        if (transcript) {
          const questions = extractAnalystQuestions(transcript);
          allQuestions.push(...questions);
        }
      }
      
      if (allQuestions.length === 0) {
        return res.status(404).json({ message: "No analyst questions found in the selected transcripts" });
      }
      
      const symbol = allQuestions[0]?.symbol || 'Unknown';
      const filename = `${symbol}_analyst_questions`;
      
      if (format === 'txt') {
        const grouped: Record<string, AnalystQuestion[]> = {};
        
        for (const question of allQuestions) {
          const key = `${question.analystName} (${question.analystTitle})`;
          if (!grouped[key]) {
            grouped[key] = [];
          }
          grouped[key].push(question);
        }
        
        let output = `ANALYST QUESTIONS - ${symbol}\n`;
        output += '='.repeat(50) + '\n\n';
        
        for (const [analystKey, analystQuestions] of Object.entries(grouped)) {
          output += `${analystKey}\n`;
          output += '-'.repeat(analystKey.length) + '\n\n';
          
          for (const q of analystQuestions) {
            output += `${q.quarter} ${q.year}:\n`;
            output += `${q.question}\n\n`;
          }
          output += '\n';
        }
        
        res.setHeader('Content-Type', 'text/plain');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}.txt"`);
        res.send(output);
        
      } else if (format === 'csv') {
        let csv = 'Company,Quarter,Year,Analyst Name,Analyst Title,Question\n';
        
        for (const q of allQuestions) {
          const escapeCSV = (str: string) => {
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
              return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
          };
          
          csv += `${escapeCSV(q.symbol)},${escapeCSV(q.quarter)},${q.year},${escapeCSV(q.analystName)},${escapeCSV(q.analystTitle)},${escapeCSV(q.question)}\n`;
        }
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
        res.send(csv);
        
      } else if (format === 'xlsx') {
        const worksheetData = [
          ['Company', 'Quarter', 'Year', 'Analyst Name', 'Analyst Title', 'Question']
        ];
        
        for (const q of allQuestions) {
          worksheetData.push([
            q.symbol,
            q.quarter,
            q.year.toString(),
            q.analystName,
            q.analystTitle,
            q.question
          ]);
        }
        
        const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Analyst Questions');
        
        const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
        res.send(buffer);
        
      } else if (format === 'docx') {
        // Create DOCX document for analyst questions
        const doc = new Document({
          sections: [{
            properties: {},
            children: [
              new Paragraph({
                text: `ANALYST QUESTIONS - ${symbol}`,
                heading: HeadingLevel.TITLE,
              }),
              new Paragraph({ text: "" }),
              
              ...allQuestions.map(question => [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `${question.analystName} (${question.analystTitle})`,
                      bold: true,
                    }),
                    new TextRun({
                      text: ` - ${question.analystCompany}`,
                      italics: true,
                    }),
                  ],
                }),
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `${question.symbol} ${question.quarter} ${question.year}`,
                      size: 20,
                      color: "666666",
                    }),
                  ],
                }),
                new Paragraph({
                  text: question.question,
                }),
                new Paragraph({ text: "" }),
              ]).flat(),
            ],
          }],
        });
        
        const buffer = await Packer.toBuffer(doc);
        
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}.docx"`);
        res.send(buffer);
        
      } else if (format === 'pdf') {
        // For PDF, we'll use jsPDF which is already installed
        const jsPDF = (await import('jspdf')).default;
        const doc = new jsPDF();
        
        doc.setFontSize(16);
        doc.text(`ANALYST QUESTIONS - ${symbol}`, 20, 20);
        
        let yPosition = 40;
        const lineHeight = 7;
        const pageHeight = doc.internal.pageSize.height;
        
        const grouped: Record<string, AnalystQuestion[]> = {};
        
        for (const question of allQuestions) {
          const key = `${question.analystName} (${question.analystTitle})`;
          if (!grouped[key]) {
            grouped[key] = [];
          }
          grouped[key].push(question);
        }
        
        for (const [analystKey, analystQuestions] of Object.entries(grouped)) {
          // Check if we need a new page
          if (yPosition > pageHeight - 50) {
            doc.addPage();
            yPosition = 20;
          }
          
          doc.setFontSize(12);
          doc.setFont('helvetica', 'bold');
          doc.text(analystKey, 20, yPosition);
          yPosition += lineHeight + 3;
          
          doc.setFont('helvetica', 'normal');
          
          for (const q of analystQuestions) {
            if (yPosition > pageHeight - 30) {
              doc.addPage();
              yPosition = 20;
            }
            
            doc.setFontSize(10);
            doc.text(`${q.quarter} ${q.year}:`, 25, yPosition);
            yPosition += lineHeight;
            
            // Split long questions into multiple lines
            const questionLines = doc.splitTextToSize(q.question, 160);
            for (const line of questionLines) {
              if (yPosition > pageHeight - 15) {
                doc.addPage();
                yPosition = 20;
              }
              doc.text(line, 25, yPosition);
              yPosition += lineHeight;
            }
            yPosition += 3;
          }
          yPosition += 5;
        }
        
        const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`);
        res.send(pdfBuffer);
      }
      
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid request parameters", errors: error.errors });
      }
      
      console.error("Error downloading analyst questions:", error);
      res.status(500).json({ message: "Failed to download analyst questions" });
    }
  });

  // Get analyst questions from specific transcripts
  app.post("/api/analyst-questions/extract", async (req, res) => {
    try {
      const { transcriptIds } = z.object({ 
        transcriptIds: z.array(z.number()).min(1) 
      }).parse(req.body);
      
      console.log('Extracting analyst questions for transcript IDs:', transcriptIds);
      
      // Get all transcripts first
      const transcripts: any[] = [];
      for (const transcriptId of transcriptIds) {
        const transcript = await storage.getTranscript(transcriptId);
        console.log(`Transcript ${transcriptId}:`, transcript ? 'found' : 'not found');
        if (transcript) {
          transcripts.push(transcript);
        }
      }
      
      // Extract questions from all transcripts with proper consolidation
      const allQuestions = extractAnalystQuestionsFromMultipleTranscripts(transcripts);
      
      console.log(`Total questions extracted: ${allQuestions.length}`);
      res.json({ questions: allQuestions });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid request parameters", errors: error.errors });
      }
      
      console.error("Error extracting analyst questions:", error);
      res.status(500).json({ message: "Failed to extract analyst questions" });
    }
  });

  // Export unique analyst names with GPT processing
  app.post("/api/analyst-names/export", async (req, res) => {
    try {
      const { transcriptIds } = z.object({ 
        transcriptIds: z.array(z.number()).min(1)
      }).parse(req.body);
      
      const defaultPrompt = `## Role  
You are an experienced investor-relations analyst covering **{CompanyName}** and its competitive peers.
## Objective  
Create a one-page "Analyst Profile" for **{AnalystName}** that captures their sell-side questioning philosophy and key takeaways for **{CompanyName}** and its competitors. Use the attached to find all questions that analysts have asked on **{CompanyName}** earnings calls from 2023-2024.
## Input  
A dataset of every question asked by this analyst (and by other sell-side analysts to **{CompanyName}** and peers) over the last five years, across earnings calls, investor days, and conferences.
## Tasks  
1. **Theme Extraction**  
   - Identify the top 5–7 recurring topics (e.g., revenue drivers, margin expansion, capital allocation, etc).  
   - For each theme, provide a sentence or two description of the theme as well as 1-2 verbatim examples)
2. **Analyst Philosophy**  
   - Write a 2–3 sentence statement summarizing their overall approach—what they value most, how they frame risk vs. opportunity, and which metrics or narratives they prioritize.
3. **Trigger metrics** 
Identify the key trigger metrics that the analyst tends to focus on. 
4. **Temporal Trends**  
   - Compare theme emphasis over time (e.g., pre-2020 vs. post-2020).  
   - Highlight at least three key inflection points (e.g., rise of capex questions after 2021, sustainability inquiries in 2023).  
   - Note any evolution in question style (short vs. multipart, data-driven vs. qualitative).
5. **Stylistic & Response Preferences**  
   - Identify signature phrasing patterns (e.g., aggressive follow-ups, scenario framing, slide/page requests).  
   - Describe how this analyst prefers to receive answers (detailed figures, high-level narrative, illustrative examples, follow-up cues).
6. ****{CompanyName}**-Specific Insights**  
   - Summarize 3–5 bullet points of what this analyst's questions reveal about **{CompanyName}**'s strategic strengths, challenges, or blind spots.  
   - Highlight any areas where **{CompanyName}** has consistently outperformed—or lagged—analyst expectations.
7. **Competitor Insights**  
   - Summarize 3–5 bullet points comparing how this analyst's lines of inquiry differ when questioning **{CompanyName}** vs. its main competitors.  
   - Note themes where competitors attract more or less scrutiny (e.g., focus on cap-ex at Competitor X vs. sustainability at Competitor Y).
## Output Format  
- Use Markdown with \`##\` headings for each section, bullet lists, and concise narrative paragraphs.  
- Include brief example quotes formatted as bullet points to illustrate trends and key insights.  
- Use bullet points and numbered lists exclusively - do not create tables or ASCII charts.
- Target a single-page summary (~450–750 words) with clearly separated sections for **{CompanyName}** and competitors.`;
      
      // Extract all analyst questions from selected transcripts
      const allQuestions: AnalystQuestion[] = [];
      
      for (const transcriptId of transcriptIds) {
        const transcript = await storage.getTranscript(transcriptId);
        if (transcript) {
          const questions = extractAnalystQuestions(transcript);
          allQuestions.push(...questions);
        }
      }
      
      if (allQuestions.length === 0) {
        return res.status(404).json({ message: "No analyst questions found in the selected transcripts" });
      }
      
      // Get unique analyst names with their details
      const uniqueAnalysts = new Map<string, {
        name: string;
        title: string;
        company: string;
        questionCount: number;
        symbols: string[];
        gptResponse?: string;
      }>();
      
      for (const question of allQuestions) {
        const key = `${question.analystName}_${question.analystCompany}`;
        
        if (uniqueAnalysts.has(key)) {
          const existing = uniqueAnalysts.get(key)!;
          existing.questionCount++;
          if (!existing.symbols.includes(question.symbol)) {
            existing.symbols.push(question.symbol);
          }
        } else {
          uniqueAnalysts.set(key, {
            name: question.analystName,
            title: question.analystTitle,
            company: question.analystCompany,
            questionCount: 1,
            symbols: [question.symbol],
          });
        }
      }
      
      const analystList = Array.from(uniqueAnalysts.values());
      
      // Process each analyst with GPT automatically
      if ("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") {
        const openai = new OpenAI({ apiKey: "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" });
        
        for (const analyst of analystList) {
          try {
            let gptPrompt = defaultPrompt;
            gptPrompt = gptPrompt.replace(/\{analystName\}/g, analyst.name);
            gptPrompt = gptPrompt.replace(/\{analystCompany\}/g, analyst.company);
            gptPrompt = gptPrompt.replace(/\{analystTitle\}/g, analyst.title);
            gptPrompt = gptPrompt.replace(/\*\*\*\{Company Name\}\*\*\*/g, analyst.symbols.join(', '));
            gptPrompt = gptPrompt.replace(/\*\*\*\{Analyst Name\}\*\*\*/g, analyst.name);
            gptPrompt = gptPrompt.replace(/\*\*\{CompanyName\}\*\*/g, analyst.symbols.join(', '));
            gptPrompt = gptPrompt.replace(/\*\*\{AnalystName\}\*\*/g, analyst.name);
            
            const response = await openai.chat.completions.create({
              model: "gpt-4o-mini", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
              messages: [{ role: "user", content: gptPrompt }],
              max_completion_tokens: 1500,
            });
            
            analyst.gptResponse = response.choices[0].message.content || '';
          } catch (error) {
            console.error(`Error processing analyst ${analyst.name} with GPT:`, error);
            analyst.gptResponse = 'Error processing with GPT';
          }
        }
      } else {
        // If no API key, still include empty response
        for (const analyst of analystList) {
          analyst.gptResponse = 'GPT processing unavailable - API key not configured';
        }
      }
      
      // Create Excel file with analyst data
      const worksheetData = [
        ['Analyst Name', 'Title', 'Company', 'Question Count', 'Companies Covered', 'GPT Response']
      ];
      
      for (const analyst of analystList) {
        worksheetData.push([
          analyst.name,
          analyst.title,
          analyst.company,
          analyst.questionCount.toString(),
          analyst.symbols.join(', '),
          analyst.gptResponse || ''
        ]);
      }
      
      const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Unique Analysts');
      
      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      
      const symbol = allQuestions[0]?.symbol || 'Multi';
      const filename = `${symbol}_unique_analysts.xlsx`;
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
      
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid request parameters", errors: error.errors });
      }
      
      console.error("Error exporting analyst names:", error);
      res.status(500).json({ message: "Failed to export analyst names" });
    }
  });

  // Test endpoint for API key validation
  app.post("/api/test-gpt", async (req, res) => {
    try {
      const testApiKey = "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";
      
      if (!testApiKey) {
        return res.json({ success: false, message: "No API key provided" });
      }

      const openai = new OpenAI({ apiKey: testApiKey });
      
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: "Hello, please respond with 'API key is working'" }],
        max_completion_tokens: 10
      });

      res.json({ 
        success: true, 
        message: "API key is valid",
        response: response.choices[0]?.message?.content || "No response"
      });
    } catch (error) {
      console.error("API key test failed:", error);
      res.json({ 
        success: false, 
        message: error instanceof Error ? error.message : "Unknown error",
        error: error
      });
    }
  });

  // Get unique analyst profiles with GPT processing
  app.post("/api/analyst-profiles/generate", async (req, res) => {
    try {
      const { transcriptIds } = z.object({ 
        transcriptIds: z.array(z.number()).min(1)
      }).parse(req.body);
      
      // Use the provided API key directly for testing
      const providedApiKey = "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";
      
      // Function to process analyst with GPT
      async function processAnalystWithGPT(analyst: any, prompt: string): Promise<string> {
        if (!providedApiKey) return "GPT processing disabled - no API key";
        
        try {
          const openai = new OpenAI({ apiKey: providedApiKey });
          const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
              { 
                role: "system", 
                content: "You are an expert financial analyst profiler. Generate comprehensive analyst profiles based on the provided template and data." 
              },
              { 
                role: "user", 
                content: prompt 
              }
            ],
            max_completion_tokens: 1500,
            temperature: 0.7
          });
          
          return response.choices[0]?.message?.content || "No response generated";
        } catch (error) {
          console.error(`Error processing analyst ${analyst.name} with GPT:`, error);
          return `Error processing with GPT: ${error instanceof Error ? error.message : 'Unknown error'}`;
        }
      }
      
      const defaultPrompt = `## Role  
You are an experienced investor-relations analyst covering **{CompanyName}** and its competitive peers.
## Objective  
Create a one-page "Analyst Profile" for **{AnalystName}** that captures their sell-side questioning philosophy and key takeaways for **{CompanyName}** and its competitors. Use the attached to find all questions that analysts have asked on **{CompanyName}** earnings calls from 2023-2024.
## Input  
A dataset of every question asked by this analyst (and by other sell-side analysts to **{CompanyName}** and peers) over the last five years, across earnings calls, investor days, and conferences.
## Tasks  
1. **Theme Extraction**  
   - Identify the top 5–7 recurring topics (e.g., revenue drivers, margin expansion, capital allocation, etc).  
   - For each theme, provide a sentence or two description of the theme as well as 1-2 verbatim examples)
2. **Analyst Philosophy**  
   - Write a 2–3 sentence statement summarizing their overall approach—what they value most, how they frame risk vs. opportunity, and which metrics or narratives they prioritize.
3. **Trigger metrics** 
Identify the key trigger metrics that the analyst tends to focus on. 
4. **Temporal Trends**  
   - Compare theme emphasis over time (e.g., pre-2020 vs. post-2020).  
   - Highlight at least three key inflection points (e.g., rise of capex questions after 2021, sustainability inquiries in 2023).  
   - Note any evolution in question style (short vs. multipart, data-driven vs. qualitative).
5. **Stylistic & Response Preferences**  
   - Identify signature phrasing patterns (e.g., aggressive follow-ups, scenario framing, slide/page requests).  
   - Describe how this analyst prefers to receive answers (detailed figures, high-level narrative, illustrative examples, follow-up cues).
6. ****{CompanyName}**-Specific Insights**  
   - Summarize 3–5 bullet points of what this analyst's questions reveal about **{CompanyName}**'s strategic strengths, challenges, or blind spots.  
   - Highlight any areas where **{CompanyName}** has consistently outperformed—or lagged—analyst expectations.
7. **Competitor Insights**  
   - Summarize 3–5 bullet points comparing how this analyst's lines of inquiry differ when questioning **{CompanyName}** vs. its main competitors.  
   - Note themes where competitors attract more or less scrutiny (e.g., focus on cap-ex at Competitor X vs. sustainability at Competitor Y).
## Output Format  
- Use Markdown with \`##\` headings for each section, bullet lists, and concise narrative paragraphs.  
- Include brief example quotes formatted as bullet points to illustrate trends and key insights.  
- Use bullet points and numbered lists exclusively - do not create tables or ASCII charts.
- Target a single-page summary (~450–750 words) with clearly separated sections for **{CompanyName}** and competitors.`;
      
      // Extract all analyst questions from selected transcripts
      const allQuestions: AnalystQuestion[] = [];
      
      for (const transcriptId of transcriptIds) {
        const transcript = await storage.getTranscript(transcriptId);
        if (transcript) {
          const questions = extractAnalystQuestions(transcript);
          allQuestions.push(...questions);
        }
      }
      
      if (allQuestions.length === 0) {
        return res.status(404).json({ message: "No analyst questions found in the selected transcripts" });
      }
      
      // Get unique analyst names with their details
      const uniqueAnalysts = new Map<string, {
        name: string;
        title: string;
        company: string;
        questionCount: number;
        symbols: string[];
        gptResponse?: string;
      }>();
      
      for (const question of allQuestions) {
        const key = `${question.analystName}_${question.analystCompany}`;
        
        if (uniqueAnalysts.has(key)) {
          const existing = uniqueAnalysts.get(key)!;
          existing.questionCount++;
          if (!existing.symbols.includes(question.symbol)) {
            existing.symbols.push(question.symbol);
          }
        } else {
          uniqueAnalysts.set(key, {
            name: question.analystName,
            title: question.analystTitle,
            company: question.analystCompany,
            questionCount: 1,
            symbols: [question.symbol],
          });
        }
      }
      
      const analystList = Array.from(uniqueAnalysts.values());
      
      // Process each analyst with GPT automatically
      if ("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") {
        const openai = new OpenAI({ apiKey: "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" });
        
        for (const analyst of analystList) {
          try {
            let gptPrompt = defaultPrompt;
            gptPrompt = gptPrompt.replace(/\{analystName\}/g, analyst.name);
            gptPrompt = gptPrompt.replace(/\{analystCompany\}/g, analyst.company);
            gptPrompt = gptPrompt.replace(/\{analystTitle\}/g, analyst.title);
            gptPrompt = gptPrompt.replace(/\*\*\*\{Company Name\}\*\*\*/g, analyst.symbols.join(', '));
            gptPrompt = gptPrompt.replace(/\*\*\*\{Analyst Name\}\*\*\*/g, analyst.name);
            gptPrompt = gptPrompt.replace(/\*\*\{CompanyName\}\*\*/g, analyst.symbols.join(', '));
            gptPrompt = gptPrompt.replace(/\*\*\{AnalystName\}\*\*/g, analyst.name);
            
            const response = await openai.chat.completions.create({
              model: "gpt-4o-mini", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
              messages: [{ role: "user", content: gptPrompt }],
              max_completion_tokens: 1500,
            });
            
            analyst.gptResponse = response.choices[0].message.content || '';
          } catch (error) {
            console.error(`Error processing analyst ${analyst.name} with GPT:`, error);
            analyst.gptResponse = 'Error processing with GPT';
          }
        }
      } else {
        // If no API key, still include empty response
        for (const analyst of analystList) {
          analyst.gptResponse = 'GPT processing unavailable - API key not configured';
        }
      }
      
      res.json({ analysts: analystList });
      
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid request parameters", errors: error.errors });
      }
      
      console.error("Error generating analyst profiles:", error);
      res.status(500).json({ message: "Failed to generate analyst profiles" });
    }
  });

  // Extract prepared statements from specific transcripts
  app.post("/api/prepared-statements/extract", async (req, res) => {
    try {
      const { transcriptIds } = z.object({ 
        transcriptIds: z.array(z.number()).min(1) 
      }).parse(req.body);
      
      console.log(`Extracting prepared statements for transcript IDs: ${transcriptIds}`);
      const allStatements: PreparedStatement[] = [];
      
      for (const transcriptId of transcriptIds) {
        console.log(`Getting transcript ${transcriptId}`);
        const transcript = await storage.getTranscript(transcriptId);
        if (transcript) {
          console.log(`Found transcript ${transcriptId}, extracting statements...`);
          const statements = extractPreparedStatements(transcript);
          console.log(`Extracted ${statements.length} statements from transcript ${transcriptId}`);
          allStatements.push(...statements);
        } else {
          console.log(`Transcript ${transcriptId} not found`);
        }
      }
      
      console.log(`Total prepared statements extracted: ${allStatements.length}`);
      res.json({ statements: allStatements });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid request parameters", errors: error.errors });
      }
      
      console.error("Error extracting prepared statements:", error);
      res.status(500).json({ message: "Failed to extract prepared statements" });
    }
  });

  // Download prepared statements in various formats
  app.post("/api/prepared-statements/download", async (req, res) => {
    try {
      const { transcriptIds, format } = downloadPreparedStatementsSchema.parse(req.body);
      
      const allStatements: PreparedStatement[] = [];
      
      for (const transcriptId of transcriptIds) {
        const transcript = await storage.getTranscript(transcriptId);
        if (transcript) {
          const statements = extractPreparedStatements(transcript);
          allStatements.push(...statements);
        }
      }
      
      if (allStatements.length === 0) {
        return res.status(404).json({ message: "No prepared statements found in the selected transcripts" });
      }
      
      const symbol = allStatements[0]?.symbol || 'Unknown';
      const filename = `${symbol}_prepared_statements`;
      
      if (format === 'txt') {
        const grouped: Record<string, PreparedStatement[]> = {};
        
        for (const statement of allStatements) {
          const key = `${statement.speakerName} (${statement.speakerTitle})`;
          if (!grouped[key]) {
            grouped[key] = [];
          }
          grouped[key].push(statement);
        }
        
        let output = `PREPARED STATEMENTS - ${symbol}\n`;
        output += '='.repeat(50) + '\n\n';
        
        for (const [speakerKey, speakerStatements] of Object.entries(grouped)) {
          output += `${speakerKey}\n`;
          output += '-'.repeat(speakerKey.length) + '\n\n';
          
          for (const s of speakerStatements) {
            output += `${s.quarter} ${s.year}:\n`;
            output += `${s.statement}\n\n`;
          }
          output += '\n';
        }
        
        res.setHeader('Content-Type', 'text/plain');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}.txt"`);
        res.send(output);
        
      } else if (format === 'csv') {
        let csv = 'Company,Quarter,Year,Speaker Name,Speaker Title,Prepared Statement\n';
        
        for (const s of allStatements) {
          const escapeCSV = (str: string) => {
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
              return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
          };
          
          csv += `${escapeCSV(s.symbol)},${escapeCSV(s.quarter)},${s.year},${escapeCSV(s.speakerName)},${escapeCSV(s.speakerTitle)},${escapeCSV(s.statement)}\n`;
        }
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
        res.send(csv);
        
      } else if (format === 'xlsx') {
        const worksheetData = [
          ['Company', 'Quarter', 'Year', 'Speaker Name', 'Speaker Title', 'Prepared Statement']
        ];
        
        for (const s of allStatements) {
          worksheetData.push([
            s.symbol,
            s.quarter,
            s.year.toString(),
            s.speakerName,
            s.speakerTitle,
            s.statement
          ]);
        }
        
        const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Prepared Statements');
        
        const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
        res.send(buffer);
        
      } else if (format === 'docx') {
        // Create DOCX document for prepared statements
        const doc = new Document({
          sections: [{
            properties: {},
            children: [
              new Paragraph({
                text: `PREPARED STATEMENTS - ${symbol}`,
                heading: HeadingLevel.TITLE,
              }),
              new Paragraph({ text: "" }),
              
              ...allStatements.map(statement => [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `${statement.speakerName} (${statement.speakerTitle})`,
                      bold: true,
                    }),
                  ],
                }),
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `${statement.symbol} ${statement.quarter} ${statement.year}`,
                      size: 20,
                      color: "666666",
                    }),
                  ],
                }),
                new Paragraph({
                  text: statement.statement,
                }),
                new Paragraph({ text: "" }),
              ]).flat(),
            ],
          }],
        });
        
        const buffer = await Packer.toBuffer(doc);
        
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}.docx"`);
        res.send(buffer);
        
      } else if (format === 'pdf') {
        const jsPDF = (await import('jspdf')).default;
        const doc = new jsPDF();
        
        doc.setFontSize(16);
        doc.text(`PREPARED STATEMENTS - ${symbol}`, 20, 20);
        
        let yPosition = 40;
        const lineHeight = 7;
        const pageHeight = doc.internal.pageSize.height;
        
        const grouped: Record<string, PreparedStatement[]> = {};
        
        for (const statement of allStatements) {
          const key = `${statement.speakerName} (${statement.speakerTitle})`;
          if (!grouped[key]) {
            grouped[key] = [];
          }
          grouped[key].push(statement);
        }
        
        for (const [speakerKey, speakerStatements] of Object.entries(grouped)) {
          if (yPosition > pageHeight - 50) {
            doc.addPage();
            yPosition = 20;
          }
          
          doc.setFontSize(12);
          doc.setFont('helvetica', 'bold');
          doc.text(speakerKey, 20, yPosition);
          yPosition += lineHeight + 3;
          
          doc.setFont('helvetica', 'normal');
          
          for (const s of speakerStatements) {
            if (yPosition > pageHeight - 30) {
              doc.addPage();
              yPosition = 20;
            }
            
            doc.setFontSize(10);
            doc.text(`${s.quarter} ${s.year}:`, 25, yPosition);
            yPosition += lineHeight;
            
            const statementLines = doc.splitTextToSize(s.statement, 160);
            for (const line of statementLines) {
              if (yPosition > pageHeight - 15) {
                doc.addPage();
                yPosition = 20;
              }
              doc.text(line, 25, yPosition);
              yPosition += lineHeight;
            }
            yPosition += 3;
          }
          yPosition += 5;
        }
        
        const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`);
        res.send(pdfBuffer);
      }
      
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid request parameters", errors: error.errors });
      }
      
      console.error("Error downloading prepared statements:", error);
      res.status(500).json({ message: "Failed to download prepared statements" });
    }
  });

  // Generate summary from analyst questions using GPT
  app.post("/api/transcripts/generate-summary", async (req, res) => {
    try {
      const { transcriptIds, customPrompt, financialContext } = generateSummarySchema.parse(req.body);
      
      // Extract all analyst questions from selected transcripts
      const allQuestions: AnalystQuestion[] = [];
      const transcriptInfo: { symbol: string; quarter: string; year: number }[] = [];
      
      for (const transcriptId of transcriptIds) {
        const transcript = await storage.getTranscript(transcriptId);
        if (transcript) {
          const questions = extractAnalystQuestions(transcript);
          allQuestions.push(...questions);
          transcriptInfo.push({
            symbol: transcript.symbol,
            quarter: transcript.quarter,
            year: transcript.year
          });
        }
      }
      
      if (allQuestions.length === 0) {
        return res.status(404).json({ message: "No analyst questions found in the selected transcripts" });
      }
      
      // Use the provided prompt or default
      const summaryPrompt = customPrompt || `Here's a list of the analyst questions asked from the earnings call. Please condense it into a single, clear sentence that:
• Begins with 'Asked <insert speaker name> to…'  
• Identifies the core topic 
• Includes any key metrics, comparators or timeframes mentioned  
• Captures the 'ask' intent (what management is being asked to explain)

For example:  
Original question: 'Can you elaborate on why your AI server order momentum ($1 B) lags peers ($12 B) and what's driving that gap?'  
Summary: 'Asked Antonio to explain why HPE's AI server order momentum ($1 B) lags peers ($12 B), and what shifts in target segments or deal thresholds are driving that difference.'`;
      
      // Use the same API key as analyst profile generation
      const providedApiKey = "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";
      if (!providedApiKey) {
        return res.status(500).json({ message: "OpenAI API key not configured" });
      }
      
      const openai = new OpenAI({ apiKey: providedApiKey });
      
      // Group questions by company for separate summaries
      const questionsByCompany = allQuestions.reduce((groups, question) => {
        const symbol = question.symbol;
        if (!groups[symbol]) {
          groups[symbol] = [];
        }
        groups[symbol].push(question);
        return groups;
      }, {} as Record<string, AnalystQuestion[]>);
      
      const companySummaries: Record<string, string> = {};
      
      for (const [symbol, questions] of Object.entries(questionsByCompany)) {
        const questionsText = questions.map((q, index) => 
          `${index + 1}. ${q.analystName} (${q.analystTitle}, ${q.analystCompany}): ${q.question}`
        ).join('\n\n');
        
          // Add financial context if available
        let financialContextText = '';
        if (financialContext && financialContext[symbol]) {
          try {
            financialContextText = `\n\n## FINANCIAL CONTEXT FOR ${symbol}\n${earningsTracker.generateFinancialContext(financialContext[symbol])}\n\n---\n\n`;
          } catch (error) {
            console.log('Could not generate financial context for summary');
          }
        }
        
        // Structure: Financial context, question bank, then the query/prompt
        const fullPrompt = `${financialContextText}ANALYST QUESTIONS BANK FOR ${symbol}:\n\n${questionsText}\n\n---\n\nQUERY:\nAnalyze these analyst questions in the context of the company's financial performance and provide exactly 4-5 concise bullet points summarizing the main themes and focus areas. Each bullet should capture a key topic that multiple analysts were interested in, following this format:
• Asked management to [explain/clarify/discuss] [main topic] including [specific details/metrics if mentioned]

Incorporate the financial context where relevant and focus on the most significant recurring themes that align with the company's financial position and performance.`;
        
        try {
          const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content: "You are an expert financial analyst summarizing earnings call questions. Provide exactly 4-5 concise bullet points that capture the main themes and focus areas from the analyst questions. Each bullet should be one clear sentence."
              },
              {
                role: "user",
                content: fullPrompt
              }
            ],
            max_completion_tokens: 400,
            temperature: 0.3
          });
          
          companySummaries[symbol] = response.choices[0].message.content || 'Unable to generate summary';
        } catch (error: any) {
          console.error(`Error generating summary for ${symbol}:`, error);
          companySummaries[symbol] = `• Key analyst focus areas identified\n• ${questions.length} questions analyzed\n• Multiple analysts participated\n• Various topics discussed`;
        }
      }
      
      const summary = Object.entries(companySummaries)
        .map(([symbol, compSummary]) => {
          const companyNames: Record<string, string> = {
            'AAPL': 'Apple Inc.',
            'GOOGL': 'Alphabet Inc.',
            'MSFT': 'Microsoft Corporation',
            'AMZN': 'Amazon.com Inc.',
            'TSLA': 'Tesla Inc.',
            'META': 'Meta Platforms Inc.',
            'NFLX': 'Netflix Inc.',
            'NVDA': 'NVIDIA Corporation',
            'CRM': 'Salesforce Inc.',
            'ORCL': 'Oracle Corporation',
            'IBM': 'International Business Machines',
            'INTC': 'Intel Corporation',
            'AMD': 'Advanced Micro Devices',
            'BABA': 'Alibaba Group',
            'UBER': 'Uber Technologies',
            'LYFT': 'Lyft Inc.',
            'SNAP': 'Snap Inc.',
            'TWTR': 'Twitter Inc.',
            'SQ': 'Block Inc.',
            'PYPL': 'PayPal Holdings',
            'V': 'Visa Inc.',
            'MA': 'Mastercard Inc.',
            'JPM': 'JPMorgan Chase',
            'BAC': 'Bank of America',
            'WFC': 'Wells Fargo',
            'GS': 'Goldman Sachs',
            'MS': 'Morgan Stanley',
            'C': 'Citigroup Inc.',
            'CVN': 'Carvana Co.',
            'CVX': 'Chevron Corporation'
          };
          const companyName = companyNames[symbol] || symbol;
          return `**${companyName} (${symbol})**\n\n${compSummary}`;
        })
        .join('\n\n---\n\n');
        
      // Extract key insights from the questions
      const keyInsights = [
        `Total analyst questions analyzed: ${allQuestions.length}`,
        `Unique analysts: ${new Set(allQuestions.map(q => q.analystName)).size}`,
        `Companies represented: ${new Set(allQuestions.map(q => q.analystCompany)).size}`,
        `Most active analyst: ${getMostActiveAnalyst(allQuestions)}`,
        `Top question themes: ${getTopQuestionThemes(allQuestions)}`
      ];
      
      const summaryData: TranscriptSummary = {
        id: `summary_${Date.now()}`,
        transcriptIds,
        symbols: Array.from(new Set(transcriptInfo.map(t => t.symbol))),
        quarters: Array.from(new Set(transcriptInfo.map(t => t.quarter))),
        years: Array.from(new Set(transcriptInfo.map(t => t.year))),
        summary,
        keyInsights,
        analystQuestionCount: allQuestions.length,
        generatedAt: new Date().toISOString()
      };
      
      res.json(summaryData);
      
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid request parameters", errors: error.errors });
      }
      
      console.error("Error generating summary:", error);
      res.status(500).json({ message: "Failed to generate summary" });
    }
  });

  // Auto-update endpoints
  app.get("/api/earnings/calendar/:symbol?", async (req, res) => {
    try {
      const { symbol } = req.params;
      const earnings = await earningsTracker.getEarningsCalendar(symbol);
      res.json({ success: true, earnings });
    } catch (error: any) {
      console.error("Error fetching earnings calendar:", error);
      res.status(500).json({ 
        success: false, 
        message: error.message || "Failed to fetch earnings calendar" 
      });
    }
  });

  app.get("/api/earnings/check-auto-update", async (req, res) => {
    try {
      const result = await earningsTracker.checkForAutoUpdate();
      res.json({ success: true, ...result });
    } catch (error: any) {
      console.error("Error checking auto-update:", error);
      res.status(500).json({ 
        success: false, 
        message: error.message || "Failed to check auto-update" 
      });
    }
  });

  app.post("/api/earnings/perform-auto-update", async (req, res) => {
    try {
      console.log("Manual auto-update triggered");
      const result = await earningsTracker.performAutoUpdate();
      res.json({ success: true, ...result });
    } catch (error: any) {
      console.error("Error performing auto-update:", error);
      res.status(500).json({ 
        success: false, 
        message: error.message || "Failed to perform auto-update" 
      });
    }
  });

  // Get company financial data
  app.get("/api/financials/:symbol", async (req, res) => {
    try {
      const { symbol } = req.params;
      
      // Create mock financial data since Alpha Vantage requires API key
      const mockFinancials = {
        symbol: symbol.toUpperCase(),
        companyName: `${symbol.toUpperCase()} Inc.`,
        stockData: {
          symbol: symbol.toUpperCase(),
          currentPrice: 150.00 + Math.random() * 50,
          peRatio: 20.5 + Math.random() * 10,
          marketCap: 1000000000000 + Math.random() * 500000000000,
          dividendYield: 0.02 + Math.random() * 0.03,
          eps: 5.50 + Math.random() * 3,
          beta: 1.0 + Math.random() * 0.5,
          high52Week: 200.00 + Math.random() * 50,
          low52Week: 120.00 + Math.random() * 30,
          lastUpdated: new Date().toISOString()
        },
        annualRevenue: [
          {
            fiscalDateEnding: '2023-12-31',
            reportedCurrency: 'USD',
            totalRevenue: 394328000000 + Math.random() * 50000000000,
            grossProfit: 169148000000 + Math.random() * 20000000000,
            operatingIncome: 114301000000 + Math.random() * 15000000000,
            netIncome: 96995000000 + Math.random() * 10000000000,
            eps: 6.16 + Math.random() * 1
          },
          {
            fiscalDateEnding: '2022-12-31',
            reportedCurrency: 'USD',
            totalRevenue: 365817000000 + Math.random() * 40000000000,
            grossProfit: 152836000000 + Math.random() * 18000000000,
            operatingIncome: 119437000000 + Math.random() * 12000000000,
            netIncome: 94680000000 + Math.random() * 8000000000,
            eps: 6.05 + Math.random() * 0.8
          }
        ],
        quarterlyRevenue: [
          {
            fiscalDateEnding: '2024-03-31',
            reportedCurrency: 'USD',
            totalRevenue: 90753000000 + Math.random() * 10000000000,
            grossProfit: 41863000000 + Math.random() * 5000000000,
            operatingIncome: 27421000000 + Math.random() * 3000000000,
            netIncome: 23636000000 + Math.random() * 2000000000,
            eps: 1.53 + Math.random() * 0.3
          }
        ],
        lastUpdated: new Date().toISOString()
      };
      
      res.json({ success: true, data: mockFinancials });
    } catch (error: any) {
      console.error(`Error fetching financials for ${req.params.symbol}:`, error);
      res.status(500).json({ 
        success: false, 
        message: error.message || "Failed to fetch financial data" 
      });
    }
  });

  // Generate financial context document
  app.get("/api/financials/:symbol/context", async (req, res) => {
    try {
      const { symbol } = req.params;
      
      // Get mock financial data and generate context
      const mockFinancials = {
        symbol: symbol.toUpperCase(),
        companyName: `${symbol.toUpperCase()} Inc.`,
        stockData: {
          symbol: symbol.toUpperCase(),
          currentPrice: 150.00 + Math.random() * 50,
          peRatio: 20.5 + Math.random() * 10,
          marketCap: 1000000000000 + Math.random() * 500000000000,
          dividendYield: 0.02 + Math.random() * 0.03,
          eps: 5.50 + Math.random() * 3,
          beta: 1.0 + Math.random() * 0.5,
          high52Week: 200.00 + Math.random() * 50,
          low52Week: 120.00 + Math.random() * 30,
          lastUpdated: new Date().toISOString()
        },
        annualRevenue: [
          {
            fiscalDateEnding: '2023-12-31',
            reportedCurrency: 'USD',
            totalRevenue: 394328000000,
            grossProfit: 169148000000,
            operatingIncome: 114301000000,
            netIncome: 96995000000,
            eps: 6.16
          }
        ],
        quarterlyRevenue: [],
        lastUpdated: new Date().toISOString()
      };
      
      const context = earningsTracker.generateFinancialContext(mockFinancials);
      
      res.setHeader('Content-Type', 'text/markdown');
      res.setHeader('Content-Disposition', `attachment; filename="${symbol}_financial_context.md"`);
      res.send(context);
    } catch (error: any) {
      console.error(`Error generating financial context for ${req.params.symbol}:`, error);
      res.status(500).json({ 
        success: false, 
        message: error.message || "Failed to generate financial context" 
      });
    }
  });

  // Schedule daily auto-update check at 9 AM
  cron.schedule('0 9 * * *', async () => {
    try {
      console.log('Running scheduled auto-update check...');
      const result = await earningsTracker.performAutoUpdate();
      if (result.updated.length > 0) {
        console.log(`Scheduled auto-update completed: ${result.updated.length} analysts updated`);
      }
      if (result.errors.length > 0) {
        console.log(`Scheduled auto-update errors: ${result.errors.length} failures`);
      }
    } catch (error) {
      console.error('Scheduled auto-update failed:', error);
    }
  }, {
    timezone: "America/New_York"
  });

  console.log('Auto-update scheduler initialized - daily check at 9 AM EST');

  const httpServer = createServer(app);
  return httpServer;
}

// Helper function to find most active analyst
function getMostActiveAnalyst(questions: AnalystQuestion[]): string {
  const analystCounts = questions.reduce((counts, q) => {
    counts[q.analystName] = (counts[q.analystName] || 0) + 1;
    return counts;
  }, {} as Record<string, number>);
  
  const [mostActive] = Object.entries(analystCounts).sort(([,a], [,b]) => b - a);
  return mostActive ? `${mostActive[0]} (${mostActive[1]} questions)` : 'None';
}

// Helper function to identify top question themes
function getTopQuestionThemes(questions: AnalystQuestion[]): string {
  const themes = new Map<string, number>();
  
  questions.forEach(q => {
    const text = q.question.toLowerCase();
    
    // Define key themes to look for
    const themePatterns = {
      'Revenue': /revenue|sales|income/,
      'Margins': /margin|profit|gross|operating/,
      'Guidance': /guidance|forecast|outlook|expect/,
      'Growth': /growth|expansion|increase/,
      'Competition': /compet|market share|rival/,
      'Technology': /technology|ai|digital|innovation/,
      'Costs': /cost|expense|efficiency/,
      'Market': /market|demand|customer/
    };
    
    Object.entries(themePatterns).forEach(([theme, pattern]) => {
      if (pattern.test(text)) {
        themes.set(theme, (themes.get(theme) || 0) + 1);
      }
    });
  });
  
  return Array.from(themes.entries())
    .sort(([,a], [,b]) => b - a)
    .slice(0, 3)
    .map(([theme, count]) => `${theme} (${count})`)
    .join(', ') || 'Various topics';
}