import { Transcript, PreparedStatement } from "@shared/schema";

export function extractPreparedStatements(transcript: Transcript): PreparedStatement[] {
  const statements: PreparedStatement[] = [];
  
  try {
    const content = JSON.parse(transcript.content);
    const speakers = content.speakers || [];
    
    // Look for CEO and CFO titles/roles
    const executiveTitles = [
      'CEO', 'Chief Executive Officer', 'President & CEO', 'President and CEO',
      'CFO', 'Chief Financial Officer', 'President & CFO', 'President and CFO',
      'President', 'Chief Operating Officer', 'COO', 'CTO', 'Chief Technology Officer'
    ];
    
    // Find where Q&A section starts by looking for first operator/analyst
    let qaStartIndex = -1;
    for (let i = 0; i < speakers.length; i++) {
      const speaker = speakers[i];
      const title = (speaker.title || '').toLowerCase();
      const isOperator = title.includes('operator');
      const isAnalyst = title.includes('analyst');
      
      // Q&A section typically starts with operator or first analyst
      if (isOperator || isAnalyst) {
        qaStartIndex = i;
        break;
      }
    }
    
    // If no Q&A section found, treat all as potential prepared statements
    if (qaStartIndex === -1) {
      qaStartIndex = speakers.length;
    }
    
    // Only process speakers before Q&A section starts
    const preparedStatementSpeakers = speakers.slice(0, qaStartIndex);
    
    preparedStatementSpeakers.forEach((speaker: any) => {
      const title = speaker.title || '';
      const isExecutive = executiveTitles.some(execTitle => 
        title.toLowerCase().includes(execTitle.toLowerCase())
      );
      
      // Exclude investor relations speakers even in prepared section
      const isInvestorRelations = title.toLowerCase().includes('investor relations') ||
                                title.toLowerCase().includes('head of investor relations') ||
                                title.toLowerCase().includes('director of investor relations');
      
      if (isExecutive && !isInvestorRelations && speaker.content && speaker.content.trim().length > 100) {
        statements.push({
          speakerName: speaker.speaker || 'Unknown',
          speakerTitle: title,
          statement: speaker.content,
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

export function groupStatementsBySpeaker(statements: PreparedStatement[]): Record<string, PreparedStatement[]> {
  return statements.reduce((groups, statement) => {
    const key = `${statement.speakerName} (${statement.speakerTitle})`;
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(statement);
    return groups;
  }, {} as Record<string, PreparedStatement[]>);
}

export function formatStatementsForExport(statements: PreparedStatement[], format: 'txt' | 'csv' | 'xlsx'): string {
  if (format === 'txt') {
    return statements.map(statement => {
      return `Company: ${statement.symbol}
Quarter: ${statement.quarter} ${statement.year}
Speaker: ${statement.speakerName}
Title: ${statement.speakerTitle}
Transcript: ${statement.transcriptTitle}

Prepared Statement:
${statement.statement}

${'='.repeat(80)}

`;
    }).join('');
  }
  
  if (format === 'csv') {
    const headers = 'Symbol,Quarter,Year,Speaker Name,Speaker Title,Transcript Title,Prepared Statement\n';
    const rows = statements.map(statement => {
      const cleanStatement = statement.statement.replace(/"/g, '""').replace(/\n/g, ' ');
      return `"${statement.symbol}","${statement.quarter}","${statement.year}","${statement.speakerName}","${statement.speakerTitle}","${statement.transcriptTitle}","${cleanStatement}"`;
    }).join('\n');
    return headers + rows;
  }
  
  return ''; // XLSX will be handled separately
}