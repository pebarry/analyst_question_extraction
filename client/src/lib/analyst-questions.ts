import { AnalystQuestion, Transcript } from "@shared/schema";

// Extract analyst questions from transcript content
export function extractAnalystQuestions(transcript: Transcript): AnalystQuestion[] {
  const questions: AnalystQuestion[] = [];
  
  // Parse the transcript content to find analyst speakers
  const lines = transcript.content.split('\n\n');
  
  for (const line of lines) {
    // Look for speaker pattern: "Name (Title): Content"
    const speakerMatch = line.match(/^(.+?)\s*\((.+?)\):\s*([\s\S]+)$/);
    
    if (speakerMatch) {
      const [, speakerName, speakerTitle, content] = speakerMatch;
      
      // Check if this is an analyst based on title
      const isAnalyst = speakerTitle.toLowerCase().includes('analyst') || 
                       speakerTitle.toLowerCase().includes('research') ||
                       speakerTitle.toLowerCase().includes('equity');
      
      if (isAnalyst) {
        // Check if content contains questions (ends with ?, contains question words)
        const hasQuestion = content.includes('?') || 
                           /\b(what|how|when|where|why|can you|could you|would you|do you|are you|will you|is there)\b/i.test(content);
        
        if (hasQuestion) {
          // Extract company from analyst title
          const extractCompany = (title: string): string => {
            // Common patterns for company extraction
            const patterns = [
              /(?:with|from|at)\s+([A-Za-z\s&]+?)(?:\s|$)/i,           // "with JPMorgan", "from Goldman Sachs"
              /([A-Za-z\s&]+?)\s*(?:analyst|research)/i,               // "JPMorgan Analyst"
              /analyst.*?(?:with|at|from)\s+([A-Za-z\s&]+?)(?:\s|$)/i, // "Analyst with Barclays"
              /([A-Za-z\s&]+?)(?:\s*-\s*analyst|\s*analyst)/i,         // "Barclays - Analyst"
            ];
            
            for (const pattern of patterns) {
              const match = title.match(pattern);
              if (match && match[1]) {
                let company = match[1].trim();
                // Clean up common suffixes
                company = company.replace(/\b(analyst|research|equity|securities|capital|markets|llc|inc|corp|ltd)\b/gi, '').trim();
                // Remove extra whitespace
                company = company.replace(/\s+/g, ' ').trim();
                if (company.length > 0) {
                  return company;
                }
              }
            }
            return 'Unknown';
          };

          questions.push({
            analystName: speakerName.trim(),
            analystTitle: speakerTitle.trim(),
            analystCompany: extractCompany(speakerTitle),
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
  
  return questions;
}

// Group questions by analyst across multiple transcripts
export function groupQuestionsByAnalyst(questions: AnalystQuestion[]): Record<string, AnalystQuestion[]> {
  const grouped: Record<string, AnalystQuestion[]> = {};
  
  for (const question of questions) {
    const key = `${question.analystName} (${question.analystTitle})`;
    if (!grouped[key]) {
      grouped[key] = [];
    }
    grouped[key].push(question);
  }
  
  return grouped;
}

// Format questions for different export types
export function formatQuestionsForExport(questions: AnalystQuestion[], format: 'txt' | 'csv' | 'xlsx'): string {
  if (format === 'txt') {
    const grouped = groupQuestionsByAnalyst(questions);
    let output = '';
    
    for (const [analystKey, analystQuestions] of Object.entries(grouped)) {
      const firstQuestion = analystQuestions[0];
      output += `\n=== ${firstQuestion.analystName} (${firstQuestion.analystTitle}) from ${firstQuestion.analystCompany} ===\n\n`;
      
      for (const q of analystQuestions) {
        output += `${q.symbol} ${q.quarter} ${q.year}:\n`;
        output += `${q.question}\n\n`;
      }
    }
    
    return output;
  }
  
  if (format === 'csv') {
    let csv = 'Stock Symbol,Quarter,Year,Analyst Name,Analyst Title,Analyst Company,Question\n';
    
    for (const q of questions) {
      // Escape quotes and wrap in quotes if contains comma
      const escapeCSV = (str: string) => {
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };
      
      csv += `${escapeCSV(q.symbol)},${escapeCSV(q.quarter)},${q.year},${escapeCSV(q.analystName)},${escapeCSV(q.analystTitle)},${escapeCSV(q.analystCompany)},${escapeCSV(q.question)}\n`;
    }
    
    return csv;
  }
  
  return '';
}