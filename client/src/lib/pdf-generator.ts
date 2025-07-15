import jsPDF from "jspdf";
import type { Transcript, TranscriptSummary } from "@shared/schema";
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx";

export function generateTranscriptPDF(transcript: Transcript): void {
  const pdf = new jsPDF();
  const pageWidth = pdf.internal.pageSize.getWidth();
  const margin = 20;
  const lineHeight = 7;
  let yPosition = margin;

  // Helper function to add text with word wrapping
  const addWrappedText = (text: string, fontSize: number = 12, fontStyle: string = 'normal') => {
    pdf.setFontSize(fontSize);
    pdf.setFont('helvetica', fontStyle);
    
    const lines = pdf.splitTextToSize(text, pageWidth - 2 * margin);
    
    for (const line of lines) {
      if (yPosition > pdf.internal.pageSize.getHeight() - margin) {
        pdf.addPage();
        yPosition = margin;
      }
      pdf.text(line, margin, yPosition);
      yPosition += lineHeight;
    }
    yPosition += 3; // Add extra space after paragraphs
  };

  // Add header
  addWrappedText(transcript.title, 16, 'bold');
  addWrappedText(`Date: ${transcript.date}`, 12, 'normal');
  addWrappedText(`Symbol: ${transcript.symbol} | Quarter: ${transcript.quarter} | Year: ${transcript.year}`, 12, 'normal');
  
  // Add metrics if available
  if (transcript.revenue && transcript.revenue !== "N/A") {
    yPosition += 5;
    addWrappedText("Key Metrics:", 14, 'bold');
    addWrappedText(`Revenue: ${transcript.revenue}`, 12, 'normal');
    if (transcript.growth && transcript.growth !== "N/A") {
      addWrappedText(`Growth: ${transcript.growth}`, 12, 'normal');
    }
    if (transcript.eps && transcript.eps !== "N/A") {
      addWrappedText(`EPS: ${transcript.eps}`, 12, 'normal');
    }
    if (transcript.margin && transcript.margin !== "N/A") {
      addWrappedText(`Gross Margin: ${transcript.margin}`, 12, 'normal');
    }
  }

  yPosition += 10;
  addWrappedText("Transcript:", 14, 'bold');
  yPosition += 5;

  // Add transcript content
  addWrappedText(transcript.content, 10, 'normal');

  // Generate filename and download
  const filename = `${transcript.symbol}-${transcript.quarter}-${transcript.year}-transcript.pdf`;
  pdf.save(filename);
}

export function generateMultipleTranscriptsPDF(transcripts: Transcript[]): void {
  const pdf = new jsPDF();
  const pageWidth = pdf.internal.pageSize.getWidth();
  const margin = 20;
  const lineHeight = 7;
  let yPosition = margin;

  // Helper function to add text with word wrapping
  const addWrappedText = (text: string, fontSize: number = 12, fontStyle: string = 'normal') => {
    pdf.setFontSize(fontSize);
    pdf.setFont('helvetica', fontStyle);
    
    const lines = pdf.splitTextToSize(text, pageWidth - 2 * margin);
    
    for (const line of lines) {
      if (yPosition > pdf.internal.pageSize.getHeight() - margin) {
        pdf.addPage();
        yPosition = margin;
      }
      pdf.text(line, margin, yPosition);
      yPosition += lineHeight;
    }
    yPosition += 3;
  };

  // Add main header
  addWrappedText("Earnings Call Transcripts", 18, 'bold');
  addWrappedText(`Generated on: ${new Date().toLocaleDateString()}`, 12, 'normal');
  yPosition += 10;

  // Add each transcript
  transcripts.forEach((transcript, index) => {
    if (index > 0) {
      pdf.addPage();
      yPosition = margin;
    }

    addWrappedText(`${index + 1}. ${transcript.title}`, 16, 'bold');
    addWrappedText(`Date: ${transcript.date}`, 12, 'normal');
    addWrappedText(`Symbol: ${transcript.symbol} | Quarter: ${transcript.quarter} | Year: ${transcript.year}`, 12, 'normal');
    
    if (transcript.revenue && transcript.revenue !== "N/A") {
      yPosition += 5;
      addWrappedText("Key Metrics:", 14, 'bold');
      addWrappedText(`Revenue: ${transcript.revenue}`, 12, 'normal');
      if (transcript.growth && transcript.growth !== "N/A") {
        addWrappedText(`Growth: ${transcript.growth}`, 12, 'normal');
      }
      if (transcript.eps && transcript.eps !== "N/A") {
        addWrappedText(`EPS: ${transcript.eps}`, 12, 'normal');
      }
      if (transcript.margin && transcript.margin !== "N/A") {
        addWrappedText(`Gross Margin: ${transcript.margin}`, 12, 'normal');
      }
    }

    yPosition += 10;
    addWrappedText("Transcript:", 14, 'bold');
    yPosition += 5;
    addWrappedText(transcript.content, 10, 'normal');
  });

  // Generate filename and download
  const symbols = Array.from(new Set(transcripts.map(t => t.symbol))).join('-');
  const filename = `${symbols}-earnings-transcripts-${new Date().toISOString().split('T')[0]}.pdf`;
  pdf.save(filename);
}

// Generate PDF for AI Summary
export function generateSummaryPDF(summary: TranscriptSummary): void {
  const pdf = new jsPDF();
  const pageWidth = pdf.internal.pageSize.getWidth();
  const margin = 20;
  const lineHeight = 7;
  let yPosition = margin;

  const addWrappedText = (text: string, fontSize: number = 12, fontStyle: string = 'normal') => {
    pdf.setFontSize(fontSize);
    pdf.setFont('helvetica', fontStyle);
    
    const lines = pdf.splitTextToSize(text, pageWidth - 2 * margin);
    
    for (const line of lines) {
      if (yPosition > pdf.internal.pageSize.getHeight() - margin) {
        pdf.addPage();
        yPosition = margin;
      }
      pdf.text(line, margin, yPosition);
      yPosition += lineHeight;
    }
    yPosition += 3;
  };

  // Header
  addWrappedText("AI-Generated Earnings Call Summary", 18, 'bold');
  addWrappedText(`Generated: ${new Date(summary.generatedAt).toLocaleString()}`, 12, 'normal');
  addWrappedText(`Companies: ${summary.symbols.join(', ')}`, 12, 'normal');
  addWrappedText(`Quarters: ${summary.quarters.join(', ')} | Years: ${summary.years.join(', ')}`, 12, 'normal');
  addWrappedText(`Total Analyst Questions: ${summary.analystQuestionCount}`, 12, 'normal');
  yPosition += 10;

  // Summary content
  addWrappedText("Summary:", 14, 'bold');
  yPosition += 5;
  
  // Clean and format summary text
  const cleanSummary = summary.summary
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/•/g, '• ')
    .replace(/---/g, '\n\n');
  
  addWrappedText(cleanSummary, 11, 'normal');
  
  yPosition += 10;
  addWrappedText("Key Insights:", 14, 'bold');
  yPosition += 5;
  
  summary.keyInsights.forEach((insight, index) => {
    addWrappedText(`${index + 1}. ${insight}`, 11, 'normal');
  });

  const filename = `AI-Summary-${summary.symbols.join('-')}-${new Date().toISOString().split('T')[0]}.pdf`;
  pdf.save(filename);
}

// Generate Word document for AI Summary
export async function generateSummaryWord(summary: TranscriptSummary): Promise<void> {
  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        new Paragraph({
          text: "AI-Generated Earnings Call Summary",
          heading: HeadingLevel.TITLE,
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: `Generated: ${new Date(summary.generatedAt).toLocaleString()}`,
              break: 1,
            }),
            new TextRun({
              text: `Companies: ${summary.symbols.join(', ')}`,
              break: 1,
            }),
            new TextRun({
              text: `Quarters: ${summary.quarters.join(', ')} | Years: ${summary.years.join(', ')}`,
              break: 1,
            }),
            new TextRun({
              text: `Total Analyst Questions: ${summary.analystQuestionCount}`,
              break: 1,
            }),
          ],
        }),
        new Paragraph({
          text: "Summary",
          heading: HeadingLevel.HEADING_1,
        }),
        ...summary.summary.split('\n').map(line => 
          new Paragraph({
            text: line.replace(/\*\*(.*?)\*\*/g, '$1').replace(/•/g, '• '),
          })
        ),
        new Paragraph({
          text: "Key Insights",
          heading: HeadingLevel.HEADING_1,
        }),
        ...summary.keyInsights.map((insight, index) => 
          new Paragraph({
            text: `${index + 1}. ${insight}`,
          })
        ),
      ],
    }],
  });

  const buffer = await Packer.toBlob(doc);
  const filename = `AI-Summary-${summary.symbols.join('-')}-${new Date().toISOString().split('T')[0]}.docx`;
  
  const link = document.createElement('a');
  link.href = URL.createObjectURL(buffer);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

// Generate PDF for Analyst Profiles
export function generateAnalystProfilesPDF(profiles: any[]): void {
  const pdf = new jsPDF();
  const pageWidth = pdf.internal.pageSize.getWidth();
  const margin = 20;
  const lineHeight = 7;
  let yPosition = margin;

  const addWrappedText = (text: string, fontSize: number = 12, fontStyle: string = 'normal') => {
    pdf.setFontSize(fontSize);
    pdf.setFont('helvetica', fontStyle);
    
    const lines = pdf.splitTextToSize(text, pageWidth - 2 * margin);
    
    for (const line of lines) {
      if (yPosition > pdf.internal.pageSize.getHeight() - margin) {
        pdf.addPage();
        yPosition = margin;
      }
      pdf.text(line, margin, yPosition);
      yPosition += lineHeight;
    }
    yPosition += 3;
  };

  // Header
  addWrappedText("Analyst Profiles Report", 18, 'bold');
  addWrappedText(`Generated: ${new Date().toLocaleString()}`, 12, 'normal');
  addWrappedText(`Total Analysts: ${profiles.length}`, 12, 'normal');
  yPosition += 10;

  profiles.forEach((profile, index) => {
    if (index > 0) {
      pdf.addPage();
      yPosition = margin;
    }

    addWrappedText(`${index + 1}. ${profile.name}`, 16, 'bold');
    addWrappedText(`${profile.title} at ${profile.company}`, 12, 'normal');
    addWrappedText(`Questions Asked: ${profile.questionCount}`, 12, 'normal');
    addWrappedText(`Companies Covered: ${profile.symbols.join(', ')}`, 12, 'normal');
    yPosition += 10;

    addWrappedText("Profile Analysis:", 14, 'bold');
    yPosition += 5;
    
    // Process the profile response to match HTML formatting and convert to PDF
    const processProfileForPDF = (htmlContent: string) => {
      // Convert HTML to PDF-friendly format while preserving structure
      let text = htmlContent
        // Handle main section headers (h3)
        .replace(/<h3[^>]*class="[^"]*font-bold[^"]*text-lg[^"]*"[^>]*>(.*?)<\/h3>/g, '\n**MAIN_HEADER**$1\n')
        // Handle subtitles (h4) like "Key inflection points" and "Evolution in Question Style"
        .replace(/<h4[^>]*class="[^"]*font-bold[^"]*text-gray-700[^"]*"[^>]*>(.*?)<\/h4>/g, '\n**SUBTITLE**$1\n')
        // Handle numbered section headers (bold)
        .replace(/<div[^>]*><span[^>]*class="[^"]*font-bold[^"]*text-gray-900[^"]*"[^>]*>(\d+\.\s*.*?)<\/span><\/div>/g, '\n**NUMBERED**$1\n')
        // Handle bullet points with proper indentation
        .replace(/<div[^>]*class="[^"]*flex[^"]*mb-2[^"]*ml-8[^"]*"[^>]*><span[^>]*>•<\/span><div[^>]*class="[^"]*text-gray-700[^"]*"[^>]*>(.*?)<\/div><\/div>/g, '\n    • $1')
        .replace(/<div[^>]*class="[^"]*flex[^"]*mb-1[^"]*ml-8[^"]*"[^>]*><span[^>]*>•<\/span><div[^>]*>(.*?)<\/div><\/div>/g, '\n    • $1')
        .replace(/<div[^>]*class="[^"]*flex[^"]*mb-1[^"]*ml-12[^"]*"[^>]*><span[^>]*>•<\/span><div[^>]*>(.*?)<\/div><\/div>/g, '\n      • $1')
        .replace(/<div[^>]*class="[^"]*flex[^"]*mb-1[^"]*ml-16[^"]*"[^>]*><span[^>]*>•<\/span><div[^>]*>(.*?)<\/div><\/div>/g, '\n        • $1')
        // Handle example boxes
        .replace(/<div[^>]*class="bg-gray-100[^"]*rounded-md[^>]*>(.*?)<\/div>/gs, '\n**EXAMPLE**$1\n')
        // Handle indented text
        .replace(/<div[^>]*class="[^"]*ml-8[^"]*mb-1[^"]*text-gray-700[^"]*"[^>]*>(.*?)<\/div>/g, '\n    $1')
        .replace(/<div[^>]*class="[^"]*ml-12[^"]*mb-1[^"]*text-gray-700[^"]*"[^>]*>(.*?)<\/div>/g, '\n      $1')
        // Clean up HTML entities and tags
        .replace(/&nbsp;/g, ' ')
        .replace(/<strong[^>]*>(.*?)<\/strong>/g, '$1')
        .replace(/<br>/g, '\n')
        .replace(/<[^>]*>/g, '')
        .replace(/\n\s*\n+/g, '\n\n')
        .trim();
      
      return text;
    };
    
    const cleanProfile = processProfileForPDF(profile.gptResponse);
    
    // Format different types of content appropriately
    const lines = cleanProfile.split('\n');
    lines.forEach(line => {
      if (line.trim()) {
        const trimmedLine = line.trim();
        
        if (trimmedLine.startsWith('**MAIN_HEADER**')) {
          // Main section headers (like "Key Focus Areas")
          const headerText = trimmedLine.replace('**MAIN_HEADER**', '');
          addWrappedText(headerText, 14, 'bold');
          yPosition += 3;
        } else if (trimmedLine.startsWith('**SUBTITLE**')) {
          // Subtitles (like "Key inflection points", "Evolution in Question Style")
          const subtitleText = trimmedLine.replace('**SUBTITLE**', '');
          addWrappedText(subtitleText, 12, 'bold');
          yPosition += 2;
        } else if (trimmedLine.startsWith('**NUMBERED**')) {
          // Numbered sections (like "1. Revenue Drivers")
          const numberedText = trimmedLine.replace('**NUMBERED**', '');
          addWrappedText(numberedText, 11, 'bold');
          yPosition += 2;
        } else if (trimmedLine.startsWith('**EXAMPLE**')) {
          // Example boxes
          const exampleText = trimmedLine.replace('**EXAMPLE**', '').replace(/Examples?:\s*/i, '');
          addWrappedText('Examples:', 10, 'bold');
          addWrappedText(exampleText, 9, 'normal');
          yPosition += 3;
        } else if (trimmedLine.startsWith('        •')) {
          // Deep indented bullets
          addWrappedText('        ' + trimmedLine.substring(8), 9, 'normal');
        } else if (trimmedLine.startsWith('      •')) {
          // Medium indented bullets
          addWrappedText('      ' + trimmedLine.substring(6), 9, 'normal');
        } else if (trimmedLine.startsWith('    •')) {
          // Regular indented bullets
          addWrappedText('    ' + trimmedLine.substring(4), 10, 'normal');
        } else if (trimmedLine.startsWith('    ')) {
          // Indented text
          addWrappedText(trimmedLine, 10, 'normal');
        } else if (trimmedLine.length > 0) {
          // Regular text
          addWrappedText(trimmedLine, 10, 'normal');
        }
      }
    });
  });

  const filename = `Analyst-Profiles-${new Date().toISOString().split('T')[0]}.pdf`;
  pdf.save(filename);
}

// Generate Word document for Analyst Profiles
export async function generateAnalystProfilesWord(profiles: any[]): Promise<void> {
  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        new Paragraph({
          text: "Analyst Profiles Report",
          heading: HeadingLevel.TITLE,
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: `Generated: ${new Date().toLocaleString()}`,
              break: 1,
            }),
            new TextRun({
              text: `Total Analysts: ${profiles.length}`,
              break: 1,
            }),
          ],
        }),
        ...profiles.flatMap((profile, index) => [
          new Paragraph({
            text: `${index + 1}. ${profile.name}`,
            heading: HeadingLevel.HEADING_1,
          }),
          new Paragraph({
            text: `${profile.title} at ${profile.company}`,
          }),
          new Paragraph({
            text: `Questions Asked: ${profile.questionCount} | Companies: ${profile.symbols.join(', ')}`,
          }),
          new Paragraph({
            text: "Profile Analysis:",
            heading: HeadingLevel.HEADING_2,
          }),
          ...profile.gptResponse.split('\n').map((line: string) => 
            new Paragraph({
              text: line.replace(/\*\*(.*?)\*\*/g, '$1').replace(/•/g, '• '),
            })
          ),
        ]),
      ],
    }],
  });

  const buffer = await Packer.toBlob(doc);
  const filename = `Analyst-Profiles-${new Date().toISOString().split('T')[0]}.docx`;
  
  const link = document.createElement('a');
  link.href = URL.createObjectURL(buffer);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

// Generate CSV for Analyst Profiles
export function generateAnalystProfilesCSV(profiles: any[]): void {
  const headers = ['Name', 'Title', 'Company', 'Question Count', 'Companies Covered', 'Profile Analysis'];
  const rows = profiles.map(profile => [
    profile.name,
    profile.title,
    profile.company,
    profile.questionCount.toString(),
    profile.symbols.join('; '),
    profile.gptResponse.replace(/\n/g, ' ').replace(/"/g, '""')
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const filename = `Analyst-Profiles-${new Date().toISOString().split('T')[0]}.csv`;
  
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

// Generate Excel for Analyst Profiles
export function generateAnalystProfilesExcel(profiles: any[]): void {
  import('xlsx').then(XLSX => {
    const data = profiles.map(profile => ({
      'Name': profile.name,
      'Title': profile.title,
      'Company': profile.company,
      'Question Count': profile.questionCount,
      'Companies Covered': profile.symbols.join(', '),
      'Profile Analysis': profile.gptResponse.replace(/\n/g, ' ')
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Analyst Profiles');

    // Auto-size columns
    const cols = [
      { wch: 20 }, // Name
      { wch: 15 }, // Title
      { wch: 20 }, // Company
      { wch: 12 }, // Question Count
      { wch: 15 }, // Companies Covered
      { wch: 50 }, // Profile Analysis
    ];
    worksheet['!cols'] = cols;

    const filename = `Analyst-Profiles-${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, filename);
  });
}
