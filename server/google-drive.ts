import { google } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';
import { Readable } from 'stream';

export class GoogleDriveService {
  private oauth2Client: OAuth2Client;
  private drive: any;
  private isAuthenticated: boolean = false;
  private storedTokens: any = null;

  constructor() {
    this.initializeDirectAuth();
  }

  private async initializeDirectAuth() {
    try {
      // Try service account authentication first for automatic connection
      const serviceAccountPath = path.join(process.cwd(), 'service-account-key.json');
      
      if (fs.existsSync(serviceAccountPath)) {
        console.log('Loading Google service account credentials...');
        const auth = new google.auth.GoogleAuth({
          keyFile: serviceAccountPath,
          scopes: [
            'https://www.googleapis.com/auth/drive'
          ]
        });
        
        this.drive = google.drive({ version: 'v3', auth });
        this.isAuthenticated = true;
        
        // Test the connection
        try {
          await this.drive.files.list({ pageSize: 1 });
          console.log('Successfully authenticated with service account - automatic connection ready');
          return;
        } catch (error) {
          console.log('Service account authentication failed, falling back to OAuth');
        }
      }

      // Load OAuth credentials from your provided JSON file
      const credentialsPath = path.join(process.cwd(), 'attached_assets', 'client_secret_306180696141-cnu4mr6dtu9psk61b5jurjgv1s89l4at.apps.googleusercontent.com_1750695948835.json');
      
      let clientId = process.env.GOOGLE_CLIENT_ID;
      let clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      
      if (fs.existsSync(credentialsPath)) {
        console.log('Loading Google OAuth credentials from provided JSON file...');
        const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
        clientId = credentials.web.client_id;
        clientSecret = credentials.web.client_secret;
        console.log('Successfully loaded OAuth credentials from JSON file');
      } else {
        console.log('JSON credentials file not found at:', credentialsPath);
      }

      if (!clientId || !clientSecret) {
        throw new Error('Google OAuth credentials not found in JSON file or environment variables');
      }

      const redirectUri = `https://${process.env.REPLIT_DOMAINS}/auth/google/callback`;
      console.log('Configuring OAuth with redirect URI:', redirectUri);
      
      this.oauth2Client = new google.auth.OAuth2(
        clientId,
        clientSecret,
        redirectUri
      );

      // Try to load stored tokens
      await this.loadStoredTokens();
      
      if (this.storedTokens) {
        console.log('Found stored tokens, attempting to use them...');
        this.oauth2Client.setCredentials(this.storedTokens);
        this.drive = google.drive({ version: 'v3', auth: this.oauth2Client });
        this.isAuthenticated = true;
        
        // Test the connection
        try {
          await this.drive.files.list({ pageSize: 1 });
          console.log('Successfully authenticated with stored tokens');
          return;
        } catch (error) {
          console.log('Stored tokens expired, need to re-authenticate');
          this.isAuthenticated = false;
        }
      }

      // If no valid tokens, prepare for OAuth flow
      this.drive = null;
      this.isAuthenticated = false;
      
      console.log('Google Drive service initialized. User authentication required.');
      
    } catch (error) {
      console.error('Failed to initialize Google Drive auth:', error);
      this.isAuthenticated = false;
    }
  }

  private async loadStoredTokens() {
    try {
      const tokensPath = path.join(process.cwd(), '.google-tokens.json');
      if (fs.existsSync(tokensPath)) {
        this.storedTokens = JSON.parse(fs.readFileSync(tokensPath, 'utf8'));
        console.log('Loaded stored Google tokens');
      }
    } catch (error) {
      console.log('No stored tokens found or invalid format');
    }
  }

  private async saveTokens(tokens: any) {
    try {
      const tokensPath = path.join(process.cwd(), '.google-tokens.json');
      fs.writeFileSync(tokensPath, JSON.stringify(tokens, null, 2));
      this.storedTokens = tokens;
      console.log('Saved Google tokens for future use');
    } catch (error) {
      console.error('Failed to save tokens:', error);
    }
  }

  isAuthenticatedStatus(): boolean {
    return this.isAuthenticated;
  }

  getAuthUrl(scopeType: 'full' | 'file' = 'full'): string {
    let scopes: string[];
    
    if (scopeType === 'file') {
      scopes = [
        'https://www.googleapis.com/auth/drive.file',
        'https://www.googleapis.com/auth/drive.metadata'
      ];
    } else {
      scopes = [
        'https://www.googleapis.com/auth/drive'
      ];
    }

    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent'
    });
  }

  async setCredentials(code: string): Promise<void> {
    try {
      console.log('Starting token exchange with code:', code.substring(0, 20) + '...');
      
      const { tokens } = await this.oauth2Client.getToken(code);
      console.log('Token exchange successful, received tokens:', {
        access_token: tokens.access_token ? 'present' : 'missing',
        refresh_token: tokens.refresh_token ? 'present' : 'missing',
        expires_in: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : 'not set'
      });
      
      this.oauth2Client.setCredentials(tokens);
      this.drive = google.drive({ version: 'v3', auth: this.oauth2Client });
      this.isAuthenticated = true;
      
      // Save tokens for future use
      await this.saveTokens(tokens);
      
      // Test the connection
      console.log('Testing Google Drive connection...');
      const testResponse = await this.drive.files.list({ pageSize: 1 });
      console.log('Google Drive connection test successful, tokens saved for future use');
      
    } catch (error: any) {
      console.error('Error during credential setup:', error);
      this.isAuthenticated = false;
      throw new Error(`Failed to authenticate with Google Drive: ${error?.message || 'Unknown error'}`);
    }
  }

  async authenticateDirectly(): Promise<boolean> {
    try {
      // Try stored OAuth refresh tokens first (most common for automatic auth)
      if (this.storedTokens && this.storedTokens.refresh_token && this.oauth2Client) {
        console.log('Attempting OAuth refresh token authentication...');
        this.oauth2Client.setCredentials(this.storedTokens);
        
        try {
          // Test the connection and refresh tokens if needed
          this.drive = google.drive({ version: 'v3', auth: this.oauth2Client });
          await this.drive.files.list({ pageSize: 1 });
          this.isAuthenticated = true;
          console.log('OAuth refresh token authentication successful');
          return true;
        } catch (tokenError) {
          console.log('Stored tokens expired or invalid, clearing them');
          this.storedTokens = null;
          // Delete the invalid token file
          const tokensPath = path.join(process.cwd(), '.google-tokens.json');
          if (fs.existsSync(tokensPath)) {
            fs.unlinkSync(tokensPath);
          }
        }
      }

      console.log('No valid automatic authentication methods available');
      console.log('Please authenticate manually to enable automatic connection for future sessions');
      return false;
    } catch (error) {
      console.error('Direct authentication failed:', error);
      this.isAuthenticated = false;
      return false;
    }
  }

  async findOrCreateAnalystFolder(analystName: string): Promise<string> {
    if (!this.isAuthenticated || !this.drive) {
      throw new Error("Google Drive not authenticated. Please authenticate first.");
    }

    // First, check if "Testing for Analyst Profile Overview" root folder exists
    const rootFolderName = 'Testing for Analyst Profile Overview';
    let rootFolderId = await this.findFolder(rootFolderName);
    
    if (!rootFolderId) {
      rootFolderId = await this.createFolder(rootFolderName, 'root');
    }

    // Then find or create analyst-specific folder within root folder
    let analystFolderId = await this.findFolder(analystName, rootFolderId);
    
    if (!analystFolderId) {
      analystFolderId = await this.createFolder(analystName, rootFolderId);
    }

    return analystFolderId;
  }

  private async findFolder(name: string, parentId: string = 'root'): Promise<string | null> {
    try {
      const response = await this.drive.files.list({
        q: `name='${name}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`,
        fields: 'files(id, name)',
      });

      if (response.data.files && response.data.files.length > 0) {
        return response.data.files[0].id;
      }
      return null;
    } catch (error) {
      console.error('Error finding folder:', error);
      return null;
    }
  }

  private async createFolder(name: string, parentId: string): Promise<string> {
    try {
      const response = await this.drive.files.create({
        resource: {
          name,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [parentId],
        },
        fields: 'id',
      });

      return response.data.id;
    } catch (error) {
      console.error('Error creating folder:', error);
      throw error;
    }
  }

  async uploadAnalystExcel(analystName: string, questions: any[], filename?: string): Promise<{fileId: string, isUpdate: boolean, totalQuestions: number}> {
    try {
      // Parse analyst name and company for mapping
      const analystInfo = this.parseAnalystInfo(analystName, questions[0]?.analystCompany);
      const mappedFolderName = `${analystInfo.firstName}_${analystInfo.lastName}_${analystInfo.institution}`;
      
      // Get analyst folder using mapped name
      const folderId = await this.findOrCreateAnalystFolder(mappedFolderName);

      // Get the most recent quarter and year from questions
      const mostRecentData = this.getMostRecentQuarter(questions);
      
      // Generate filename with quarter and year
      const finalFilename = filename || `${mappedFolderName}_${mostRecentData.quarter}${mostRecentData.year}.xlsx`;

      // Check if any file exists for this analyst (any quarter/year)
      const existingFiles = await this.findAnalystFiles(mappedFolderName, folderId);
      let shouldReplace = false;
      let existingFileId = null;
      let allQuestions = questions;

      if (existingFiles.length > 0) {
        // Find the most recent existing file
        const mostRecentExisting = this.getMostRecentFile(existingFiles);
        
        // Always merge with existing data, don't replace
        shouldReplace = true;
        existingFileId = mostRecentExisting.fileId;
        
        // Download existing questions and merge with new ones
        const existingQuestions = await this.downloadExistingQuestions(existingFileId);
        allQuestions = this.mergeQuestions(existingQuestions, questions);
      }
      
      // Create Excel workbook with merged data
      const wb = XLSX.utils.book_new();
      
      // Format questions for Excel
      const excelData = allQuestions.map(q => ({
        'Analyst Name': q.analystName,
        'Company': q.analystCompany,
        'Title': q.analystTitle,
        'Question': q.question,
        'Stock Symbol': q.symbol,
        'Quarter': q.quarter,
        'Year': q.year,
        'Transcript Title': q.transcriptTitle,
        'Date Added': q.dateAdded || new Date().toISOString().split('T')[0]
      }));

      const ws = XLSX.utils.json_to_sheet(excelData);
      
      // Auto-size columns
      const colWidths = [
        { wch: 20 }, // Analyst Name
        { wch: 20 }, // Company
        { wch: 25 }, // Title
        { wch: 80 }, // Question
        { wch: 10 }, // Symbol
        { wch: 10 }, // Quarter
        { wch: 8 },  // Year
        { wch: 40 }, // Transcript Title
        { wch: 12 }  // Date Added
      ];
      ws['!cols'] = colWidths;

      XLSX.utils.book_append_sheet(wb, ws, 'Analyst Questions');
      
      // Convert to buffer and create readable stream
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      const stream = Readable.from(buffer);

      if (shouldReplace && existingFileId) {
        // Update existing file (replace with new data)
        const response = await this.drive.files.update({
          fileId: existingFileId,
          resource: {
            name: finalFilename, // Update name to reflect new quarter/year
          },
          media: {
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            body: stream,
          },
        });
        return {
          fileId: response.data.id,
          isUpdate: true,
          totalQuestions: allQuestions.length
        };
      } else {
        // Create new file
        const response = await this.drive.files.create({
          resource: {
            name: finalFilename,
            parents: [folderId],
          },
          media: {
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            body: stream,
          },
          fields: 'id',
        });
        return {
          fileId: response.data.id,
          isUpdate: false,
          totalQuestions: allQuestions.length
        };
      }
    } catch (error) {
      console.error('Error uploading Excel to Google Drive:', error);
      throw error;
    }
  }

  private parseAnalystInfo(analystName: string, company: string): { firstName: string; lastName: string; institution: string } {
    // Parse and normalize first and last name from analyst name
    const nameParts = analystName.trim().split(' ');
    let firstName = nameParts[0] || 'Unknown';
    const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : 'Analyst';
    
    // Apply name normalization for common short forms
    const nameVariations: Record<string, string> = {
      'mike': 'Michael', 'jim': 'James', 'bob': 'Robert', 'bill': 'William',
      'tom': 'Thomas', 'dan': 'Daniel', 'dave': 'David', 'chris': 'Christopher',
      'nick': 'Nicholas', 'alex': 'Alexander', 'steve': 'Steven', 'ben': 'Benjamin',
      'matt': 'Matthew', 'tony': 'Anthony', 'joe': 'Joseph', 'sam': 'Samuel',
      'andy': 'Andrew', 'pat': 'Patrick', 'pete': 'Peter', 'ed': 'Edward',
      'ted': 'Theodore', 'frank': 'Francis', 'greg': 'Gregory', 'jeff': 'Jeffrey',
      'ken': 'Kenneth', 'brad': 'Bradley', 'marc': 'Mark', 'jon': 'Jonathan',
      'tim': 'Timothy'
    };
    
    const firstNameLower = firstName.toLowerCase().replace('.', '');
    if (nameVariations[firstNameLower]) {
      firstName = nameVariations[firstNameLower];
    }
    
    // Clean and standardize institution name
    const institution = this.standardizeInstitutionName(company || 'Unknown');
    
    return { firstName, lastName, institution };
  }

  private standardizeInstitutionName(company: string): string {
    // Standardize common banking institution names
    const institutionMap: Record<string, string> = {
      'Goldman Sachs': 'GoldmanSachs',
      'Goldman Sachs & Co': 'GoldmanSachs',
      'Goldman Sachs Group': 'GoldmanSachs',
      'JPMorgan': 'JPMorgan',
      'JPMorgan Chase': 'JPMorgan',
      'JP Morgan': 'JPMorgan',
      'Morgan Stanley': 'MorganStanley',
      'Bank of America': 'BankOfAmerica',
      'BofA': 'BankOfAmerica',
      'Wells Fargo': 'WellsFargo',
      'Citigroup': 'Citigroup',
      'Citi': 'Citigroup',
      'UBS': 'UBS',
      'Credit Suisse': 'CreditSuisse',
      'Deutsche Bank': 'DeutscheBank',
      'Barclays': 'Barclays',
      'Evercore': 'Evercore',
      'Cowen': 'Cowen',
      'TD Cowen': 'Cowen',
      'Wedbush': 'Wedbush',
      'Oppenheimer': 'Oppenheimer',
      'Melius': 'Melius',
      'Arete Research': 'AreteResearch'
    };

    // Find matching institution or clean the name
    for (const [key, value] of Object.entries(institutionMap)) {
      if (company.toLowerCase().includes(key.toLowerCase())) {
        return value;
      }
    }

    // If no match found, clean the company name (remove spaces, special chars)
    return company.replace(/[^a-zA-Z0-9]/g, '').substring(0, 15);
  }

  private async downloadExistingQuestions(fileId: string): Promise<any[]> {
    try {
      // Use the axios library directly to properly handle binary data
      const axios = (await import('axios')).default;
      
      // Get the access token from the oauth2Client
      const accessToken = this.oauth2Client.credentials.access_token;
      if (!accessToken) {
        throw new Error('No access token available');
      }

      const response = await axios.get(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
        responseType: 'arraybuffer',
      });

      // Convert response to buffer and parse Excel
      const buffer = Buffer.from(response.data);
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      
      if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
        console.log('No worksheets found in Excel file');
        return [];
      }

      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      console.log(`Downloaded ${jsonData.length} rows from Excel file`);

      // Convert back to our question format
      const questions = jsonData.map((row: any) => ({
        analystName: row['Analyst Name'],
        analystCompany: row['Company'],
        analystTitle: row['Title'],
        question: row['Question'],
        symbol: row['Stock Symbol'] || row['Symbol'],
        quarter: row['Quarter'],
        year: row['Year'],
        transcriptTitle: row['Transcript Title']
      })).filter(q => q.question && q.question.trim().length > 0);

      console.log(`Filtered to ${questions.length} valid questions`);
      return questions;

    } catch (error) {
      console.error('Error downloading existing questions:', error);
      return [];
    }
  }

  private async getSystemMostRecentQuarter(analystName: string): Promise<{ quarter: string; year: number } | null> {
    try {
      // Import storage to get transcripts
      const { storage } = await import('./storage');
      
      // Get all transcripts to find the most recent quarter/year
      const allTranscripts = await storage.getTranscriptsBySymbol('AAPL'); // Using AAPL as representative
      
      if (allTranscripts.length === 0) {
        return null;
      }
      
      // Find the most recent quarter/year across all transcripts
      let mostRecentQuarter = 'Q1';
      let mostRecentYear = 2020;
      
      for (const transcript of allTranscripts) {
        if (transcript.year > mostRecentYear || 
            (transcript.year === mostRecentYear && transcript.quarter > mostRecentQuarter)) {
          mostRecentQuarter = transcript.quarter;
          mostRecentYear = transcript.year;
        }
      }
      
      return { quarter: mostRecentQuarter, year: mostRecentYear };
    } catch (error) {
      console.error('Error getting system most recent quarter:', error);
      return null;
    }
  }

  private async getFreshAnalystQuestions(analystName: string): Promise<any[]> {
    try {
      // Import storage to get transcripts
      const { storage } = await import('./storage');
      
      // Get all transcripts and extract questions for this analyst
      const symbols = ['AAPL']; // For now, focus on AAPL
      const allQuestions: any[] = [];
      
      for (const symbol of symbols) {
        const transcripts = await storage.getTranscriptsBySymbol(symbol);
        
        for (const transcript of transcripts) {
          if (transcript.content) {
            const questions = this.extractAnalystQuestionsFromTranscript(transcript, analystName);
            allQuestions.push(...questions);
          }
        }
      }
      
      return allQuestions;
    } catch (error) {
      console.error('Error getting fresh analyst questions:', error);
      return [];
    }
  }

  private async getFreshAnalystQuestionsAfter(analystName: string, afterQuarter: string, afterYear: number): Promise<any[]> {
    try {
      // Import storage to get transcripts
      const { storage } = await import('./storage');
      
      // Get all transcripts and extract questions for this analyst
      const symbols = ['AAPL']; // For now, focus on AAPL
      const allQuestions: any[] = [];
      
      for (const symbol of symbols) {
        const transcripts = await storage.getTranscriptsBySymbol(symbol);
        
        for (const transcript of transcripts) {
          // Only include transcripts that are newer than the Excel file's most recent data
          const isNewer = this.isQuarterMoreRecent(
            transcript.quarter, transcript.year,
            afterQuarter, afterYear
          );
          
          if (isNewer && transcript.content) {
            const questions = this.extractAnalystQuestionsFromTranscript(transcript, analystName);
            allQuestions.push(...questions);
          }
        }
      }
      
      console.log(`Found ${allQuestions.length} questions after ${afterQuarter} ${afterYear} for ${analystName}`);
      return allQuestions;
    } catch (error) {
      console.error('Error getting fresh analyst questions after date:', error);
      return [];
    }
  }

  private extractAnalystQuestionsFromTranscript(transcript: any, targetAnalyst: string): any[] {
    const questions: any[] = [];
    
    try {
      let content;
      if (typeof transcript.content === 'string') {
        try {
          content = JSON.parse(transcript.content);
        } catch (e) {
          // Content is plain text, not JSON - skip this transcript
          console.log(`Transcript ${transcript.id} has plain text content, skipping extraction`);
          return [];
        }
      } else {
        content = transcript.content;
      }
      
      for (const segment of content.segments || []) {
        // Check if this segment is from the target analyst
        const speakerName = segment.speaker?.replace(/\s+/g, '_').toLowerCase();
        const targetName = targetAnalyst.toLowerCase();
        
        if (speakerName && targetName.includes(speakerName.split('_')[0]) && targetName.includes(speakerName.split('_')[1])) {
          // Extract questions from this analyst's segments
          const text = segment.text || '';
          const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
          
          for (const sentence of sentences) {
            if (sentence.includes('?') || sentence.toLowerCase().includes('question')) {
              questions.push({
                analystName: targetAnalyst,
                analystCompany: segment.company || 'Unknown',
                analystTitle: segment.title || 'Analyst',
                question: sentence.trim(),
                symbol: transcript.symbol,
                quarter: transcript.quarter,
                year: transcript.year,
                transcriptTitle: transcript.title || `${transcript.symbol} ${transcript.quarter} ${transcript.year}`,
                dateAdded: new Date().toISOString().split('T')[0]
              });
            }
          }
        }
      }
    } catch (error) {
      console.error('Error extracting questions from transcript:', error);
    }
    
    return questions;
  }

  private mergeQuestions(existingQuestions: any[], newQuestions: any[]): any[] {
    const mergedQuestions = [...existingQuestions];
    
    // Add new questions, avoiding duplicates
    for (const newQuestion of newQuestions) {
      const isDuplicate = existingQuestions.some(existing => 
        existing.question === newQuestion.question &&
        existing.symbol === newQuestion.symbol &&
        existing.quarter === newQuestion.quarter &&
        existing.year === newQuestion.year
      );

      if (!isDuplicate) {
        mergedQuestions.push({
          ...newQuestion,
          dateAdded: new Date().toISOString().split('T')[0]
        });
      }
    }

    // Sort by date added (newest first) and then by year/quarter
    return mergedQuestions.sort((a, b) => {
      const dateA = new Date(a.dateAdded || '1900-01-01');
      const dateB = new Date(b.dateAdded || '1900-01-01');
      
      if (dateA.getTime() !== dateB.getTime()) {
        return dateB.getTime() - dateA.getTime();
      }
      
      // If same date, sort by year then quarter
      if (a.year !== b.year) {
        return b.year - a.year;
      }
      
      return b.quarter.localeCompare(a.quarter);
    });
  }

  private async findFileInFolder(filename: string, folderId: string): Promise<string | null> {
    try {
      const response = await this.drive.files.list({
        q: `name='${filename}' and '${folderId}' in parents and trashed=false`,
        fields: 'files(id, name)',
      });

      if (response.data.files && response.data.files.length > 0) {
        return response.data.files[0].id;
      }
      return null;
    } catch (error) {
      console.error('Error finding file in folder:', error);
      return null;
    }
  }

  async getFileUrl(fileId: string): Promise<string> {
    return `https://drive.google.com/file/d/${fileId}/view`;
  }

  async generateAnalystProfile(analystName: string, shouldUpdateExcel: boolean = true): Promise<{ profileText: string; pdfBuffer: Buffer }> {
    if (!this.isAuthenticated || !this.drive) {
      throw new Error("Google Drive not authenticated");
    }

    // First, ensure Excel file is up to date if requested
    if (shouldUpdateExcel) {
      console.log(`Checking if Excel file is up to date for ${analystName}...`);
      
      try {
        // Get the current Excel file to check its most recent quarter/year
        const rootFolderName = 'Testing for Analyst Profile Overview';
        const rootFolderId = await this.findFolder(rootFolderName);
        
        if (rootFolderId) {
          const analystFolderId = await this.findFolder(analystName, rootFolderId);
          
          if (analystFolderId) {
            const files = await this.findAnalystFiles(analystName, analystFolderId);
            
            if (files.length > 0) {
              const mostRecentFile = this.getMostRecentFile(files);
              const existingQuestions = await this.downloadExistingQuestions(mostRecentFile.fileId);
              
              // Get the most recent quarter/year from existing Excel
              const excelMostRecent = this.getMostRecentQuarter(existingQuestions);
              
              // Get the most recent quarter/year available from transcript system
              const systemMostRecent = await this.getSystemMostRecentQuarter(analystName);
              
              if (systemMostRecent) {
                // Check if system has data newer than what's in Excel
                const hasNewerData = this.isQuarterMoreRecent(
                  systemMostRecent.quarter, systemMostRecent.year,
                  excelMostRecent.quarter, excelMostRecent.year
                );
                
                if (hasNewerData) {
                  console.log(`Excel has data through ${excelMostRecent.quarter} ${excelMostRecent.year}, system has data through ${systemMostRecent.quarter} ${systemMostRecent.year} - updating Excel with newer data`);
                  
                  // Get only the questions that are newer than what's in Excel
                  const freshQuestions = await this.getFreshAnalystQuestionsAfter(analystName, excelMostRecent.quarter, excelMostRecent.year);
                  if (freshQuestions.length > 0) {
                    console.log(`Found ${freshQuestions.length} new questions to add to Excel`);
                    await this.uploadAnalystExcel(analystName, freshQuestions);
                  } else {
                    console.log(`No new questions found despite newer quarter availability`);
                  }
                } else {
                  console.log(`Excel file is up to date for ${analystName} - has data through ${excelMostRecent.quarter} ${excelMostRecent.year}, system has through ${systemMostRecent.quarter} ${systemMostRecent.year}`);
                }
              } else {
                console.log(`Could not determine system's most recent quarter for ${analystName}`);
              }
            }
          }
        }
      } catch (error) {
        console.log(`Could not check/update Excel for ${analystName}, proceeding with existing file:`, error);
      }
    }

    // Find analyst folder
    const rootFolderName = 'Testing for Analyst Profile Overview';
    const rootFolderId = await this.findFolder(rootFolderName);
    if (!rootFolderId) {
      throw new Error('Root folder not found');
    }

    const analystFolderId = await this.findFolder(analystName, rootFolderId);
    if (!analystFolderId) {
      throw new Error(`Analyst folder not found for ${analystName}`);
    }

    // Get Excel files from analyst folder
    const files = await this.findAnalystFiles(analystName, analystFolderId);
    if (files.length === 0) {
      throw new Error(`No Excel files found for ${analystName}`);
    }

    // Get the most recent file
    const mostRecentFile = this.getMostRecentFile(files);
    
    // Download and read Excel content
    const questions = await this.downloadExistingQuestions(mostRecentFile.fileId);
    
    if (questions.length === 0) {
      throw new Error(`No questions found in Excel file for ${analystName}`);
    }

    console.log(`Generating profile for ${analystName} using ${questions.length} questions from updated Excel file`);

    // Generate GPT profile
    const profileText = await this.generateGPTProfile(analystName, questions);
    
    // Generate PDF
    const pdfBuffer = await this.generateProfilePDF(analystName, profileText, mostRecentFile.quarter, mostRecentFile.year);
    
    return { profileText, pdfBuffer };
  }

  private async fetchCompanyNews(companySymbol: string): Promise<string> {
    try {
      const googleApiKey = process.env.GOOGLE_API_KEY;
      const googleCxId = process.env.GOOGLE_CX_ID;
      
      if (!googleApiKey || !googleCxId) {
        console.log('Google Custom Search API credentials not available, skipping news fetch');
        return '';
      }

      // Use the new working CX ID: 8071f9af21ce2415b (works with 5M+ results)
      let actualCxId = '8071f9af21ce2415b';
      
      if (googleCxId.includes('<') || googleCxId.includes('>') || googleCxId.includes('script')) {
        console.log('GOOGLE_CX_ID contains HTML code, using new working CX ID...');
        console.log(`Using working CX ID: ${actualCxId}`);
      } else {
        // If it's already just the CX ID, use it
        actualCxId = googleCxId;
        console.log(`Using provided CX ID: ${actualCxId}`);
      }

      const companyNameMap: Record<string, string> = {
        'AAPL': 'Apple Inc',
        'MSFT': 'Microsoft Corporation',
        'GOOGL': 'Google Alphabet',
        'AMZN': 'Amazon',
        'TSLA': 'Tesla',
        'META': 'Meta Facebook',
        'NVDA': 'NVIDIA',
        'NFLX': 'Netflix'
      };

      const companyName = companyNameMap[companySymbol] || companySymbol;
      // Try multiple search strategies to find relevant content
      const searchStrategies = [
        `${companySymbol} earnings news`,
        `${companySymbol} stock market`,
        `${companySymbol} financial results`,
        `${companyName} quarterly report`,
        `${companySymbol} analyst coverage`
      ];

      let searchResults = [];
      
      // Try different search strategies until we find results
      for (const searchQuery of searchStrategies) {
        console.log(`Trying search: ${searchQuery}`);

        const searchUrl = new URL('https://www.googleapis.com/customsearch/v1');
        searchUrl.searchParams.append('key', googleApiKey);
        searchUrl.searchParams.append('cx', actualCxId);
        searchUrl.searchParams.append('q', searchQuery);
        searchUrl.searchParams.append('num', '10');
        searchUrl.searchParams.append('sort', 'date');

        let response;
        try {
          response = await fetch(searchUrl.toString());
        } catch (fetchError) {
          console.log(`Network error for "${searchQuery}": ${fetchError.message}`);
          continue;
        }
        
        if (!response.ok) {
          console.log(`Search API failed for "${searchQuery}" - Status: ${response.status}`);
          const errorText = await response.text();
          console.log(`Error details: ${errorText.substring(0, 500)}`);
          continue;
        }

        let data;
        try {
          data = await response.json();
        } catch (jsonError) {
          console.log(`JSON parse error for "${searchQuery}": ${jsonError.message}`);
          continue;
        }
        
        if (data.error) {
          console.log(`Search error for "${searchQuery}": ${data.error.message} (Code: ${data.error.code})`);
          
          // Handle quota exceeded error specifically
          if (data.error.code === 429 || data.error.message.includes('Quota exceeded')) {
            console.log('Google Custom Search quota exceeded for today, skipping news fetch');
            return '';
          }
          continue;
        }

        const items = data.items || [];
        
        if (items.length > 0) {
          console.log(`Found ${items.length} results for: ${searchQuery}`);
          searchResults = items;
          break;
        } else {
          console.log(`No results for: ${searchQuery}`);
        }
      }
      
      if (searchResults.length === 0) {
        console.log('No news results found with any search strategy');
        return '';
      }

      const newsTextContent = this.formatNewsResultsAsText(searchResults, companyName);
      
      const fs = await import('fs/promises');
      const tempNewsFile = `temp_news_${companySymbol}_${Date.now()}.txt`;
      
      await fs.writeFile(tempNewsFile, newsTextContent, 'utf8');
      console.log(`Created news file: ${tempNewsFile} with ${searchResults.length} articles`);
      
      const newsText = await fs.readFile(tempNewsFile, 'utf8');
      await fs.unlink(tempNewsFile);
      
      return newsText;
    } catch (error) {
      console.log(`News fetch error: ${error.message}, skipping news fetch`);
      return '';
    }
  }



  private formatNewsResultsAsText(results: any[], companyName: string): string {
    const header = `BUSINESS NEWS SUMMARY FOR ${companyName.toUpperCase()}\n`;
    const separator = '='.repeat(60) + '\n';
    const timestamp = `Generated: ${new Date().toISOString()}\n`;
    const resultCount = `Total Articles: ${results.length}\n\n`;
    
    const articles = results.map((result: any, index: number) => {
      const articleNumber = `ARTICLE ${index + 1}`;
      const title = `Title: ${result.title || 'No title available'}`;
      const source = `Source: ${result.displayLink || 'Unknown source'}`;
      const url = `URL: ${result.link || 'No URL available'}`;
      const snippet = `Summary: ${result.snippet || 'No description available'}`;
      const articleSeparator = '-'.repeat(40);
      
      return [
        articleNumber,
        title,
        source,
        url,
        snippet,
        articleSeparator,
        ''
      ].join('\n');
    }).join('\n');
    
    return [
      header,
      separator,
      timestamp,
      resultCount,
      articles
    ].join('');
  }

  private async generateNewsSummary(newsText: string, companyName: string): Promise<string> {
    if (!newsText || newsText.trim() === '') {
      return '';
    }

    try {
      const OpenAI = (await import('openai')).default;
      const apiKey = "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";
      
      if (!apiKey) {
        console.log('No OpenAI API key available for news summary');
        return '';
      }

      const openai = new OpenAI({ apiKey });
      
      const prompt = `You are analyzing business news for ${companyName}. The news data is provided in text format below. Create a concise market context summary that will help analysts understand current market dynamics.

NEWS DATA:
${newsText}

ANALYSIS REQUIREMENTS:
Please provide a structured summary with these sections:

1. **Key Market Developments**
   - Major recent events, announcements, or trends
   - Regulatory changes or industry developments

2. **Financial Performance Indicators**
   - Revenue, earnings, growth metrics mentioned
   - Market performance and stock movements

3. **Strategic Initiatives**
   - New products, partnerships, market expansions
   - Management changes or corporate restructuring

4. **Market Sentiment**
   - Overall tone and investor outlook
   - Analyst upgrades/downgrades mentioned

5. **Competitive Landscape**
   - Mentions of competitors or market position
   - Industry trends affecting the company

Focus on information that would be relevant for financial analyst questioning patterns and investment analysis. Keep each section concise but informative.`;

      const response = await openai.chat.completions.create({
        model: "o1-mini",
        messages: [
          {
            role: "user",
            content: prompt
          }
        ],
        max_completion_tokens: 2000
      });

      const summary = response.choices[0]?.message?.content || '';
      console.log(`Generated news summary for ${companyName} (${summary.length} chars)`);
      
      return summary;
    } catch (error) {
      console.error('Error generating news summary:', error);
      return '';
    }
  }

  private async generateGPTProfile(analystName: string, questions: any[]): Promise<string> {
    const OpenAI = (await import('openai')).default;
    const apiKey = "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";
    
    if (!apiKey) {
      throw new Error("OpenAI API key not configured");
    }

    console.log(`Generating GPT profile for ${analystName} with ${questions.length} questions`);
    console.log('Sample questions:', questions.slice(0, 2));

    if (!questions || questions.length === 0) {
      throw new Error(`No questions available for ${analystName}. Cannot generate profile.`);
    }

    // Extract company from questions - handle both formats
    const companies = [...new Set(questions.map(q => q.symbol || q.Symbol || q['Stock Symbol']).filter(Boolean))];
    const companySymbol = companies.length > 0 ? companies[0] : "UNKNOWN";

    // Fetch financial data for context
    let financialContext = '';
    try {
      const { earningsTracker } = await import('./earnings-tracker');
      const financials = await earningsTracker.getCompanyFinancials(companySymbol);
      financialContext = earningsTracker.generateFinancialContext(financials);
    } catch (error) {
      console.log('Could not fetch financial data, proceeding without it');
    }

    // Fetch latest business news for the company
    const newsText = await this.fetchCompanyNews(companySymbol);
    const newsSummary = await this.generateNewsSummary(newsText, companySymbol);

    // Create questions summary for GPT - handle both formats
    const questionsSummary = questions.map((q, index) => {
      const quarter = q.quarter || q.Quarter || 'Unknown';
      const year = q.year || q.Year || 'Unknown';
      const question = q.question || q.Question || 'No question text';
      return `${index + 1}. Q${quarter} ${year} - ${question}`;
    }).join('\n');

    console.log('Questions summary for GPT (first 200 chars):', questionsSummary.substring(0, 200));
    
    if (newsSummary) {
      console.log(`News summary available for ${companySymbol} (${newsSummary.length} chars)`);
    } else {
      console.log('No news summary available - will generate profile without market context');
    }

    if (!questionsSummary || questionsSummary.trim() === '') {
      throw new Error(`Questions data is empty or malformed for ${analystName}`);
    }

    // Add financial context section
    const financialSection = financialContext ? `

## Financial Context for ${companySymbol}
${financialContext}

` : '';

    // Add news context section if available
    const newsSection = newsSummary ? `

## Current Market Context for ${companySymbol}
${newsSummary}

` : '';

    const prompt = `# Comprehensive Analyst Profile Generation

${financialSection}${newsSection}## Analyst Questions History for ${analystName}
${questionsSummary}

# Analysis Task
Create a comprehensive analyst profile for **${analystName}** based on their questioning patterns for ${companySymbol}. Use the financial data and market context provided to create a detailed analysis.

## Required Analysis Framework:

### 1. Financial Metrics Focus
- Which financial metrics does this analyst consistently probe (revenue, margins, cash flow, etc.)?
- How do their questions align with the company's actual financial performance?
- Do they focus on growth metrics, profitability, or valuation concerns?

### 2. Question Themes & Evolution
- What are the recurring topics this analyst focuses on?
- How have their areas of focus changed over time relative to the company's financial trajectory?
- Which questions correlate with significant financial performance periods?

### 3. Market Context Understanding
- How do their questions reflect understanding of the company's valuation (P/E ratio, market cap)?
- Do they probe areas where the company underperforms or outperforms financially?
- How do they incorporate broader market trends into their questioning?

### 4. Analytical Sophistication
- Do they ask about forward-looking financial guidance vs. historical performance?
- How do they frame questions around the company's competitive financial position?
- What level of financial detail do they seek in their questions?

### 5. Investment Thesis Focus
- What investment themes emerge from their question patterns?
- How do their questions align with the company's key value drivers?
- Do they focus on short-term financial performance or long-term strategic value?

Please provide specific examples from the questions and correlate them with the financial data provided. Create a comprehensive profile that would be valuable for investor relations teams preparing for earnings calls.`;

    console.log(`Sending prompt to GPT (${prompt.length} chars total)`);
    console.log('Financial section included:', financialSection ? 'YES' : 'NO');
    console.log('News section included:', newsSection ? 'YES' : 'NO');
    
    try {
      const openai = new OpenAI({ apiKey });
      const response = await openai.chat.completions.create({
        model: "o1-mini",
        messages: [
          { 
            role: "user", 
            content: prompt
          }
        ],
        max_completion_tokens: 4000
      });
      
      const generatedProfile = response.choices[0]?.message?.content || "No profile generated";
      console.log(`Generated profile length: ${generatedProfile.length} chars`);
      
      return generatedProfile;
    } catch (error) {
      console.error('Error generating GPT profile:', error);
      throw new Error(`Failed to generate profile: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async generateProfilePDF(analystName: string, profileText: string, quarter: string, year: number): Promise<Buffer> {
    const jsPDF = (await import('jspdf')).default;
    const doc = new jsPDF();
    
    const pageHeight = doc.internal.pageSize.height;
    const pageWidth = doc.internal.pageSize.width;
    const leftMargin = 15;
    const rightMargin = 15;
    const textWidth = pageWidth - leftMargin - rightMargin;
    const bottomMargin = 25;
    
    let currentY = 25;
    
    // Helper function to check if we need a new page
    const checkPageBreak = (neededHeight: number) => {
      if (currentY + neededHeight > pageHeight - bottomMargin) {
        doc.addPage();
        currentY = 25;
        return true;
      }
      return false;
    };
    
    // Header
    doc.setFontSize(18);
    doc.setFont(undefined, 'bold');
    const title = `Analyst Profile: ${analystName.replace(/_/g, ' ')}`;
    doc.text(title, leftMargin, currentY);
    currentY += 20;
    
    doc.setFontSize(11);
    doc.setFont(undefined, 'normal');
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, leftMargin, currentY);
    currentY += 8;
    doc.text(`Data Period: Through ${quarter} ${year}`, leftMargin, currentY);
    currentY += 15;
    
    // Add separator line
    doc.setLineWidth(0.8);
    doc.line(leftMargin, currentY, pageWidth - rightMargin, currentY);
    currentY += 15;
    
    // Process content by sections and paragraphs
    const sections = profileText.split(/(?=##)/g).filter(s => s.trim().length > 0);
    
    for (const section of sections) {
      const lines = section.split('\n').filter(l => l.trim().length > 0);
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        // Determine content type
        const isMainHeader = line.startsWith('##');
        const isSubHeader = line.startsWith('**') && line.endsWith('**');
        const isBulletPoint = line.startsWith('- ') || line.startsWith('• ');
        const isNumberedPoint = /^\d+\./.test(line);
        
        let fontSize = 10;
        let fontWeight = 'normal';
        let leftIndent = leftMargin;
        let lineSpacing = 5;
        
        // Set formatting based on content type
        if (isMainHeader) {
          checkPageBreak(25);
          fontSize = 13;
          fontWeight = 'bold';
          lineSpacing = 8;
          currentY += 5; // Extra space before headers
        } else if (isSubHeader) {
          checkPageBreak(20);
          fontSize = 11;
          fontWeight = 'bold';
          lineSpacing = 6;
          currentY += 3;
        } else if (isBulletPoint || isNumberedPoint) {
          fontSize = 10;
          fontWeight = 'normal';
          leftIndent = leftMargin + 8;
          lineSpacing = 4;
        } else {
          fontSize = 10;
          fontWeight = 'normal';
          lineSpacing = 4;
        }
        
        // Clean text
        let cleanText = line
          .replace(/##\s*/g, '')
          .replace(/\*\*/g, '')
          .trim();
        
        // Set font properties
        doc.setFontSize(fontSize);
        doc.setFont(undefined, fontWeight);
        
        // Calculate available width for indented content
        const availableWidth = textWidth - (leftIndent - leftMargin);
        
        // Split text to fit width
        const textLines = doc.splitTextToSize(cleanText, availableWidth);
        
        // Check if we need a page break for this content
        const neededHeight = textLines.length * 5 + lineSpacing;
        checkPageBreak(neededHeight);
        
        // Add the text
        for (let j = 0; j < textLines.length; j++) {
          doc.text(textLines[j], leftIndent, currentY);
          currentY += 5;
        }
        
        currentY += lineSpacing;
      }
    }
    
    // Add footer with page numbers
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(9);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(128, 128, 128);
      
      // Center the page number
      const pageText = `Page ${i} of ${pageCount}`;
      const textWidth = doc.getTextWidth(pageText);
      const xPosition = (pageWidth - textWidth) / 2;
      
      doc.text(pageText, xPosition, pageHeight - 10);
      
      // Reset text color for next page
      doc.setTextColor(0, 0, 0);
    }
    
    // Return as buffer
    const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
    return pdfBuffer;
  }

  async uploadAnalystProfile(analystName: string): Promise<{ fileId: string; fileName: string }> {
    if (!this.isAuthenticated || !this.drive) {
      throw new Error("Google Drive not authenticated");
    }

    try {
      // Generate profile
      const { profileText, pdfBuffer } = await this.generateAnalystProfile(analystName);
      
      // Find analyst folder
      const rootFolderName = 'Testing for Analyst Profile Overview';
      const rootFolderId = await this.findFolder(rootFolderName);
      if (!rootFolderId) {
        throw new Error('Root folder not found');
      }

      const analystFolderId = await this.findFolder(analystName, rootFolderId);
      if (!analystFolderId) {
        throw new Error(`Analyst folder not found for ${analystName}`);
      }

      // Get most recent quarter info for naming
      const files = await this.findAnalystFiles(analystName, analystFolderId);
      const mostRecentFile = this.getMostRecentFile(files);
      
      // Create filename with naming convention
      const analystInfo = this.parseAnalystInfo(analystName, '');
      const fileName = `${analystInfo.firstName}_${analystInfo.lastName}_Profile_${mostRecentFile.quarter}${mostRecentFile.year}.pdf`;
      
      // Convert buffer to stream
      const stream = Readable.from(pdfBuffer);
      
      // Check if profile already exists
      const existingProfileId = await this.findFileInFolder(fileName, analystFolderId);
      
      if (existingProfileId) {
        // Update existing profile
        const response = await this.drive.files.update({
          fileId: existingProfileId,
          resource: { name: fileName },
          media: {
            mimeType: 'application/pdf',
            body: stream,
          },
        });
        return { fileId: response.data.id, fileName };
      } else {
        // Create new profile
        const response = await this.drive.files.create({
          resource: {
            name: fileName,
            parents: [analystFolderId],
          },
          media: {
            mimeType: 'application/pdf',
            body: stream,
          },
          fields: 'id',
        });
        return { fileId: response.data.id, fileName };
      }
    } catch (error) {
      console.error('Error uploading analyst profile:', error);
      throw error;
    }
  }

  async listAnalystFolders(): Promise<{ id: string; name: string; questionsCount?: number }[]> {
    try {
      // Find root "Testing for Analyst Profile Overview" folder
      const rootFolderId = await this.findFolder('Testing for Analyst Profile Overview');
      if (!rootFolderId) {
        return [];
      }

      // List all analyst folders
      const response = await this.drive.files.list({
        q: `'${rootFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        fields: 'files(id, name)',
        orderBy: 'name',
      });

      const folders = response.data.files || [];
      
      // For each folder, count the number of Excel files
      const foldersWithCounts = await Promise.all(
        folders.map(async (folder: any) => {
          const filesResponse = await this.drive.files.list({
            q: `'${folder.id}' in parents and trashed=false`,
            fields: 'files(id)',
          });
          
          return {
            id: folder.id,
            name: folder.name,
            questionsCount: filesResponse.data.files?.length || 0
          };
        })
      );

      return foldersWithCounts;
    } catch (error) {
      console.error('Error listing analyst folders:', error);
      return [];
    }
  }

  private getMostRecentQuarter(questions: any[]): { quarter: string; year: number } {
    let mostRecentQuarter = 'Q1';
    let mostRecentYear = 2020;

    questions.forEach(q => {
      const year = parseInt(q.year);
      const quarter = q.quarter;
      
      if (year > mostRecentYear || (year === mostRecentYear && this.quarterToNumber(quarter) > this.quarterToNumber(mostRecentQuarter))) {
        mostRecentYear = year;
        mostRecentQuarter = quarter;
      }
    });

    return { quarter: mostRecentQuarter, year: mostRecentYear };
  }

  private quarterToNumber(quarter: string): number {
    switch (quarter) {
      case 'Q1': return 1;
      case 'Q2': return 2;
      case 'Q3': return 3;
      case 'Q4': return 4;
      default: return 1;
    }
  }

  private async findAnalystFiles(analystName: string, folderId: string): Promise<Array<{fileId: string, quarter: string, year: number, filename: string}>> {
    try {
      const response = await this.drive.files.list({
        q: `'${folderId}' in parents and name contains '${analystName}' and mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'`,
        fields: 'files(id, name)',
      });

      const files = response.data.files || [];
      return files.map((file: any) => {
        const filename = file.name;
        // Extract quarter and year from filename like "FirstName_LastName_Bank_Q12024.xlsx"
        const match = filename.match(/_([Q]\d)(\d{4})\.xlsx$/);
        const quarter = match ? match[1] : 'Q1';
        const year = match ? parseInt(match[2]) : 2020;
        
        return {
          fileId: file.id,
          quarter,
          year,
          filename
        };
      });
    } catch (error) {
      console.error('Error finding analyst files:', error);
      return [];
    }
  }

  private getMostRecentFile(files: Array<{fileId: string, quarter: string, year: number, filename: string}>): {fileId: string, quarter: string, year: number} {
    let mostRecent = files[0];
    
    files.forEach(file => {
      if (file.year > mostRecent.year || 
          (file.year === mostRecent.year && this.quarterToNumber(file.quarter) > this.quarterToNumber(mostRecent.quarter))) {
        mostRecent = file;
      }
    });

    return mostRecent;
  }

  private isQuarterMoreRecent(newQuarter: string, newYear: number, existingQuarter: string, existingYear: number): boolean {
    if (newYear > existingYear) return true;
    if (newYear < existingYear) return false;
    return this.quarterToNumber(newQuarter) > this.quarterToNumber(existingQuarter);
  }
}

export const googleDriveService = new GoogleDriveService();