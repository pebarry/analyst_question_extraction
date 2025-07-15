import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ChartLine, Search, Download, Eye, Brain, FileText, Building, Calendar, Clock, Info, TriangleAlert, Loader2, Filter, CheckSquare, Square, RotateCcw, ChevronDown, ChevronRight, Expand, Copy, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { MultiSelect } from "@/components/multi-select";
import { generateTranscriptPDF, generateMultipleTranscriptsPDF, generateSummaryPDF, generateSummaryWord, generateAnalystProfilesPDF, generateAnalystProfilesWord, generateAnalystProfilesCSV, generateAnalystProfilesExcel } from "@/lib/pdf-generator";
import { validateStockSymbol, getAvailableYears } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Transcript, FetchTranscriptsRequest, AnalystQuestion, PreparedStatement, TranscriptSummary, GenerateSummaryRequest } from "@shared/schema";
import logoImage from "@assets/Analyst Questions Extractor Logo_1749530713487.png";

const quarterOptions = [
  { label: "Q1 - First Quarter", value: "Q1" },
  { label: "Q2 - Second Quarter", value: "Q2" },
  { label: "Q3 - Third Quarter", value: "Q3" },
  { label: "Q4 - Fourth Quarter", value: "Q4" },
];

const yearOptions = getAvailableYears().map(year => ({
  label: year.toString(),
  value: year.toString()
}));

// Get company full name from ticker symbol
function getCompanyName(symbol: string): string {
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
  
  return companyNames[symbol] || symbol;
}



// Format analyst profile response for better display
function formatAnalystProfile(gptResponse: string): string {
  if (!gptResponse) return '';
  
  // Clean up the response first - remove # prefixes and trailing **
  let cleaned = gptResponse
    // Remove all # prefixes from headings and ## patterns
    .replace(/^#+\s*/gm, '')
    .replace(/##\s*/g, '')
    // Remove ": analyst name" patterns at the beginning and throughout
    .replace(/^:\s*[A-Z][a-zA-Z\s]+\n*/gm, '')
    .replace(/:\s*[A-Z][a-z]+\s+[A-Z][a-z]+(\s+[A-Z][a-z]+)*/g, '')
    // Remove "Questions*" from example sections
    .replace(/Questions?\*\s*/gi, '')
    // Remove orphaned ** patterns
    .replace(/\*\*:\s*/g, '')
    .replace(/^\*\*\s*/gm, '')
    .replace(/\s*\*\*$/gm, '')
    // Remove trailing ** from lines
    .replace(/\*\*\s*$/gm, '')
    // Clean up any orphaned ** at the end of words
    .replace(/(\w)\*\*(\s|$)/gm, '$1$2')
    // Convert dashes at start of lines to asterisks for bullet handling
    .replace(/^-\s+/gm, '* ')
    .replace(/^--\s+/gm, '** ')
    .replace(/^---\s+/gm, '*** ');

  // Handle simple table formatting if present
  if (cleaned.includes('|')) {
    cleaned = cleaned.replace(/\|([^|]+)\|/g, '<span class="inline-table-cell px-2 border border-gray-300">$1</span>');
  }

  let formatted = cleaned
    // Remove "Analyst Profile" heading
    .replace(/^Analyst Profile\s*\n*/i, '')
    // Remove standalone *Description* lines
    .replace(/^\*Description\*\s*$/gm, '')
    // Convert major section headings with larger font and bold
    .replace(/^(Theme Extraction|Temporal Trends|Analyst Philosophy|Trigger [Mm]etrics|Stylistic & Response Preferences|.*-Specific Insights|Competitor Insights|Background|Experience|Focus Areas?|Coverage|Investment Style|Notable|Key|Summary|Profile|Analysis|Overview|Expertise)(.*)$/gm, '<h3 class="font-bold text-lg text-gray-900 mb-3 mt-6">$1$2</h3>')
    // Convert subsection headings
    .replace(/^([A-Z][a-z\s]+:)$/gm, '<h4 class="font-medium text-sm text-gray-800 mb-1 mt-3 ml-4">$1</h4>');

  // Process line by line to handle numbered lists and bullets with proper indentation
  const lines = formatted.split('\n');
  const processedLines: string[] = [];
  let inExampleBlock = false;
  let exampleContent: string[] = [];
  let inTemporalSection = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Check if we're entering temporal trends section
    if (line.toLowerCase().includes('temporal trends')) {
      inTemporalSection = true;
      processedLines.push(line);
      continue;
    }
    
    // Check if we're leaving temporal section (new major heading)
    if (inTemporalSection && line.match(/^<h3/)) {
      inTemporalSection = false;
    }
    
    // Handle quotes from analysts - look for quoted text
    const quoteMatch = line.match(/^[*-]?\s*["'""](.+?)["'""](.*)$/);
    if (quoteMatch && !inExampleBlock) {
      const [, quote, remainder] = quoteMatch;
      processedLines.push(`<div class="bg-gray-100 border border-gray-200 rounded-md p-3 my-3 text-sm text-gray-700"><strong>Example:</strong><br>&nbsp;&nbsp;&nbsp;&nbsp;• "${quote}"${remainder}</div>`);
      continue;
    }
    
    // Handle examples - collect up to 2 example items into grey boxes (only quotes)
    if (line.toLowerCase().includes('example') && (line.includes(':') || line.includes('*') || line.includes('-'))) {
      inExampleBlock = true;
      exampleContent = []; // Reset for new example block
      const exampleText = line.replace(/^\*+\s*/, '').replace(/^-+\s*/, '').replace(/example[s]?:?\s*/gi, '').replace(/Questions?:?\*?\s*/gi, '').replace(/\*\*:\s*/g, '').trim();
      // Only add if it contains quotes or is clearly a quote
      if (exampleText.length > 0 && (exampleText.includes('"') || exampleText.includes('"') || exampleText.includes('"'))) {
        exampleContent.push(exampleText);
      }
      continue;
    }
    
    // Continue collecting example content if we're in an example block (limit to 2 items, only quotes)
    if (inExampleBlock && exampleContent.length < 2 && (line.startsWith('*') || line.startsWith('-') || line.includes('"'))) {
      const exampleText = line.replace(/^\*+\s*/, '').replace(/^-+\s*/, '').replace(/Questions?:?\*?\s*/gi, '').replace(/\*\*:\s*/g, '').trim();
      // Only add if it's not just "**" and contains quotes or is clearly a quote
      if (exampleText.length > 2 && exampleText !== '**' && (exampleText.includes('"') || exampleText.includes('"') || exampleText.includes('"'))) {
        exampleContent.push(exampleText);
      }
      continue;
    }
    
    // End example block and output collected content (only if we have actual quotes)
    if (inExampleBlock && (exampleContent.length >= 2 || (!line.startsWith('*') && !line.startsWith('-') && !line.includes('"')))) {
      if (exampleContent.length > 0) {
        const limitedExamples = exampleContent.slice(0, 2);
        const formattedExamples = limitedExamples.map((ex, index) => {
          // Handle multi-line examples with proper indentation
          const lines = ex.split('\n');
          if (lines.length > 1) {
            const firstLine = `&nbsp;&nbsp;&nbsp;&nbsp;• ${lines[0]}`;
            const subsequentLines = lines.slice(1).map(l => `&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;${l.trim()}`).join('<br>');
            return `${firstLine}<br>${subsequentLines}`;
          }
          return `&nbsp;&nbsp;&nbsp;&nbsp;• ${ex}`;
        }).join('<br>');
        processedLines.push(`<div class="bg-gray-100 border border-gray-200 rounded-md p-4 my-4 text-sm text-gray-700"><strong>Examples:</strong><br>${formattedExamples}</div>`);
      }
      inExampleBlock = false;
      exampleContent = [];
    }
    
    // Handle "Key inflection points" as proper subtitle (bold and dark grey)
    if ((line.toLowerCase().includes('key inflection point') || line.toLowerCase().includes('inflection point')) && !line.match(/^\s*[\*\-]/)) {
      const cleanLine = line.replace(/^##\s*/, '').replace(/^-\s*/, '').replace(/^\*+\s*/, '').replace(/\d+\s*$/, '').trim();
      processedLines.push(`<h4 class="font-bold text-gray-700 mt-4 mb-3">${cleanLine}</h4>`);
      continue;
    }
    
    // Handle "Evolution in Question Style" as proper subtitle (bold and dark grey)
    if (line.toLowerCase().includes('evolution in question style') && !line.match(/^\s*[\*\-]/)) {
      const cleanLine = line.replace(/^##\s*/, '').replace(/^-\s*/, '').replace(/^\*+\s*/, '').trim();
      processedLines.push(`<h4 class="font-bold text-gray-700 mt-4 mb-3">${cleanLine}</h4>`);
      continue;
    }
    
    // Add "Key Focus Areas" section before "1. Revenue Drivers"
    if (line.match(/^1\.\s*Revenue\s+Drivers/i)) {
      processedLines.push(`<h3 class="font-bold text-lg text-gray-900 mb-3 mt-6">Key Focus Areas</h3>`);
      processedLines.push(`<div class="ml-4 mb-2"><span class="font-medium text-gray-700">1. ${line.replace(/^1\.\s*/, '')}</span></div>`);
      continue;
    }
    
    // Handle temporal trends formatting - multi-line entries with proper alignment
    const yearInfoMatch = line.match(/^(.*(20\d{2}|pre-20\d{2}|post-20\d{2}|Sustainability|Growth|Market|Revenue|Margin|Technology|AI|Data|Cloud|Innovation).*):\s*(.+)$/);
    if (yearInfoMatch && inTemporalSection) {
      const [, yearPart, , details] = yearInfoMatch;
      processedLines.push(`<div class="ml-4 mb-2 flex"><span class="mr-3 flex-shrink-0 text-black">•</span><div><strong class="text-gray-800">${yearPart}:</strong> ${details}</div></div>`);
      continue;
    }
    
    // Handle continuation lines in temporal section (lines that don't start with bullets or numbers)
    if (inTemporalSection && !line.match(/^[*#\d-]/) && !line.includes(':') && line.length > 0 && !line.match(/^<h/)) {
      processedLines.push(`<div class="ml-10 mb-1 text-gray-700">${line}</div>`);
      continue;
    }
    
    // Handle numbered items that should be bullet points under Inflection Points
    const inflectionNumberMatch = line.match(/^(\d+)\.\s*\*\*(.*?)\*\*(.*)$/);
    if (inflectionNumberMatch) {
      const [, , boldContent, remainingContent] = inflectionNumberMatch;
      processedLines.push(`<div class="flex mb-2 ml-8"><span class="mr-3 flex-shrink-0">•</span><div><span class="font-bold text-gray-900">${boldContent}</span>${remainingContent}</div></div>`);
      continue;
    }
    
    // Handle numbered lists with # prefix (#1., #2., etc.) - treat as bold section headers
    const hashNumberedMatch = line.match(/^#(\d+)\.\s*(.+)$/);
    if (hashNumberedMatch) {
      const [, number, content] = hashNumberedMatch;
      const cleanContent = content.replace(/^\*+\s*/, '').replace(/\*+$/, '');
      processedLines.push(`<div class="ml-4 mb-3 mt-4"><span class="font-bold text-gray-900">${number}. ${cleanContent}</span></div>`);
      continue;
    }
    
    // Handle numbered lists (1., 2., etc.) - treat as bold section headers for main sections
    const numberedMatch = line.match(/^(\d+)\.\s*(.+)$/);
    if (numberedMatch) {
      const [, number, content] = numberedMatch;
      const cleanContent = content.replace(/^\*+\s*/, '').replace(/\*+$/, '');
      // Check if this is under an inflection points or evolution section by looking at recent lines
      const recentLines = processedLines.slice(-3).join('');
      if (recentLines.toLowerCase().includes('inflection point') || recentLines.toLowerCase().includes('evolution in question style')) {
        // Treat as regular bullet point under subtitles (remove the number, no bold)
        processedLines.push(`<div class="flex mb-2 ml-8"><span class="mr-3 flex-shrink-0">•</span><div class="text-gray-700">${cleanContent}</div></div>`);
      } else {
        // Treat as regular section header
        processedLines.push(`<div class="ml-4 mb-3 mt-4"><span class="font-bold text-gray-900">${number}. ${cleanContent}</span></div>`);
      }
      continue;
    }
    
    // Handle sub-bullets with different indentation levels - use bullet points with proper indentation
    const tripleStarMatch = line.match(/^\*\*\*\s*(.+)$/);
    if (tripleStarMatch) {
      const cleanContent = tripleStarMatch[1].replace(/^\*+\s*/, '').replace(/\*+$/, '');
      processedLines.push(`<div class="flex mb-1 ml-16 text-sm text-gray-700"><span class="mr-3 flex-shrink-0">•</span><div>${cleanContent}</div></div>`);
      continue;
    }
    
    const doubleStarMatch = line.match(/^\*\*\s*(.+)$/);
    if (doubleStarMatch) {
      const cleanContent = doubleStarMatch[1].replace(/^\*+\s*/, '').replace(/\*+$/, '');
      processedLines.push(`<div class="flex mb-1 ml-12 text-sm text-gray-700"><span class="mr-3 flex-shrink-0">•</span><div>${cleanContent}</div></div>`);
      continue;
    }
    
    const singleStarMatch = line.match(/^\*\s*(.+)$/);
    if (singleStarMatch) {
      const cleanContent = singleStarMatch[1].replace(/^\*+\s*/, '').replace(/\*+$/, '');
      processedLines.push(`<div class="flex mb-1 ml-8"><span class="mr-3 flex-shrink-0">•</span><div>${cleanContent}</div></div>`);
      continue;
    }
    
    // Handle dash bullets with indentation - use bullet points with proper indentation
    const dashMatch = line.match(/^-\s*(.+)$/);
    if (dashMatch) {
      const cleanContent = dashMatch[1].replace(/^\*+\s*/, '').replace(/\*+$/, '');
      processedLines.push(`<div class="flex mb-1 ml-8"><span class="mr-3 flex-shrink-0">•</span><div>${cleanContent}</div></div>`);
      continue;
    }
    
    // Handle double dash for sub-bullets - use bullet points with proper indentation
    const doubleDashMatch = line.match(/^--\s*(.+)$/);
    if (doubleDashMatch) {
      const cleanContent = doubleDashMatch[1].replace(/^\*+\s*/, '').replace(/\*+$/, '');
      processedLines.push(`<div class="flex mb-1 ml-12 text-sm text-gray-700"><span class="mr-3 flex-shrink-0">•</span><div>${cleanContent}</div></div>`);
      continue;
    }
    
    // Handle triple dash for deeper sub-bullets
    const tripleDashMatch = line.match(/^---\s*(.+)$/);
    if (tripleDashMatch) {
      const cleanContent = tripleDashMatch[1].replace(/^\*+\s*/, '').replace(/\*+$/, '');
      processedLines.push(`<div class="flex mb-1 ml-16 text-sm text-gray-700"><span class="mr-3 flex-shrink-0">•</span><div>${cleanContent}</div></div>`);
      continue;
    }
    
    // Handle regular text that should be indented under numbered sections or bullet points
    if (line.trim() && !line.match(/^[*#\d-]/) && !line.match(/^<h/)) {
      // Check if we're after a numbered section or bullet point by looking at recent lines
      const lastFewLines = processedLines.slice(-2).join('');
      if (lastFewLines.includes('font-bold text-gray-900') || lastFewLines.includes('ml-8') || lastFewLines.includes('ml-12')) {
        // Determine appropriate indentation based on context
        if (lastFewLines.includes('ml-8')) {
          processedLines.push(`<div class="ml-12 mb-1 text-gray-700">${line}</div>`);
        } else {
          processedLines.push(`<div class="ml-8 mb-1 text-gray-700">${line}</div>`);
        }
        continue;
      }
    }
    
    // Keep other lines as-is
    processedLines.push(line);
  }
  
  // Handle any remaining example content at the end
  if (inExampleBlock && exampleContent.length > 0) {
    const limitedExamples = exampleContent.slice(0, 2);
    const formattedExamples = limitedExamples.map(ex => `&nbsp;&nbsp;&nbsp;&nbsp;• ${ex}`).join('<br>');
    processedLines.push(`<div class="bg-gray-100 border border-gray-200 rounded-md p-4 my-4 text-sm text-gray-700"><strong>Examples:</strong><br>${formattedExamples}</div>`);
  }
  
  formatted = processedLines.join('\n')
    // Remove *example* text and make examples section italicized
    .replace(/\*example\*/gi, '')
    .replace(/(examples?:)/gi, '<em class="text-gray-600 italic">$1</em>')
    // Replace ticker symbols with company names
    .replace(/\bAAPL\b/g, 'Apple Inc.')
    .replace(/\bMSFT\b/g, 'Microsoft Corporation')
    .replace(/\bGOOGL\b/g, 'Alphabet Inc.')
    .replace(/\bAMZN\b/g, 'Amazon.com Inc.')
    .replace(/\bTSLA\b/g, 'Tesla Inc.')
    .replace(/\bMETA\b/g, 'Meta Platforms Inc.')
    .replace(/\bNFLX\b/g, 'Netflix Inc.')
    .replace(/\bNVDA\b/g, 'NVIDIA Corporation')
    .replace(/\bCRM\b/g, 'Salesforce Inc.')
    .replace(/\bORCL\b/g, 'Oracle Corporation')
    .replace(/\bIBM\b/g, 'International Business Machines')
    .replace(/\bINTC\b/g, 'Intel Corporation')
    .replace(/\bAMD\b/g, 'Advanced Micro Devices')
    .replace(/\bBABA\b/g, 'Alibaba Group')
    .replace(/\bUBER\b/g, 'Uber Technologies')
    .replace(/\bLYFT\b/g, 'Lyft Inc.')
    .replace(/\bSNAP\b/g, 'Snap Inc.')
    .replace(/\bTWTR\b/g, 'Twitter Inc.')
    .replace(/\bSQ\b/g, 'Block Inc.')
    .replace(/\bPYPL\b/g, 'PayPal Holdings')
    .replace(/\bV\b/g, 'Visa Inc.')
    .replace(/\bMA\b/g, 'Mastercard Inc.')
    .replace(/\bJPM\b/g, 'JPMorgan Chase')
    .replace(/\bBAC\b/g, 'Bank of America')
    .replace(/\bWFC\b/g, 'Wells Fargo')
    .replace(/\bGS\b/g, 'Goldman Sachs')
    .replace(/\bMS\b/g, 'Morgan Stanley')
    .replace(/\bC\b/g, 'Citigroup Inc.')
    .replace(/\bCVN\b/g, 'Carvana Co.')
    .replace(/\bCVX\b/g, 'Chevron Corporation')
    // Convert remaining ** bold to HTML bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Convert line breaks to paragraphs
    .split('\n\n')
    .map(para => para.trim())
    .filter(para => para.length > 0)
    .map(para => {
      if (!para.startsWith('<h3') && !para.startsWith('<h4') && !para.startsWith('<div')) {
        return `<p class="mb-3">${para}</p>`;
      }
      return para;
    })
    .join('');
    
  return formatted;
}

export default function TranscriptViewer() {
  const [symbols, setSymbols] = useState<string[]>(["", "", "", "", ""]);
  const [selectedQuarters, setSelectedQuarters] = useState<string[]>([]);
  const [selectedYears, setSelectedYears] = useState<string[]>([]);
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [symbolError, setSymbolError] = useState("");
  const [selectedTranscripts, setSelectedTranscripts] = useState<number[]>([]);
  const [analystQuestions, setAnalystQuestions] = useState<AnalystQuestion[]>([]);
  const [preparedStatements, setPreparedStatements] = useState<PreparedStatement[]>([]);
  const [activeTab, setActiveTab] = useState<"questions" | "statements">("questions");
  const [downloadFormat, setDownloadFormat] = useState<"pdf" | "docx" | "txt" | "xlsx" | "csv">("pdf");
  const [summaryData, setSummaryData] = useState<TranscriptSummary | null>(null);
  const [expandedQuestions, setExpandedQuestions] = useState<Set<string>>(new Set());
  const [expandAllQuestions, setExpandAllQuestions] = useState(false);
  const [analystProfiles, setAnalystProfiles] = useState<any[]>([]);
  const [showSummaryModal, setShowSummaryModal] = useState(false);

  const [gptProgress, setGptProgress] = useState<{
    isProcessing: boolean;
    currentAnalyst: string;
    totalAnalysts: number;
    processedAnalysts: number;
    processedItems: string[];
  }>({
    isProcessing: false,
    currentAnalyst: '',
    totalAnalysts: 0,
    processedAnalysts: 0,
    processedItems: []
  });

  const [summaryProgress, setSummaryProgress] = useState<{
    isGenerating: boolean;
    status: string;
  }>({
    isGenerating: false,
    status: ''
  });
  
  const { toast } = useToast();

  // Helper functions for expanding questions
  const toggleQuestionExpansion = (questionId: string) => {
    const newExpanded = new Set(expandedQuestions);
    if (newExpanded.has(questionId)) {
      newExpanded.delete(questionId);
    } else {
      newExpanded.add(questionId);
    }
    setExpandedQuestions(newExpanded);
  };

  const toggleExpandAll = () => {
    if (expandAllQuestions) {
      setExpandedQuestions(new Set());
      setExpandAllQuestions(false);
    } else {
      const allQuestionIds = analystQuestions.map((q, index) => `${q.transcriptId}-${q.analystName}-${index}`);
      setExpandedQuestions(new Set(allQuestionIds));
      setExpandAllQuestions(true);
    }
  };

  const fetchTranscriptsMutation = useMutation({
    mutationFn: async (validSymbols: string[]) => {
      const allTranscripts: Transcript[] = [];
      
      for (const symbol of validSymbols) {
        const data: FetchTranscriptsRequest = {
          symbol,
          quarters: selectedQuarters as ("Q1" | "Q2" | "Q3" | "Q4")[],
          years: selectedYears.map(Number),
        };
        
        try {
          const response = await apiRequest("/api/transcripts/fetch", "POST", data);
          const result = await response.json();
          if (result.transcripts) {
            allTranscripts.push(...result.transcripts);
          }
        } catch (error) {
          console.error(`Error fetching transcripts for ${symbol}:`, error);
        }
      }
      
      return { transcripts: allTranscripts };
    },
    onSuccess: (data: { transcripts: Transcript[] }) => {
      setTranscripts(data.transcripts);
      setSelectedTranscripts(data.transcripts.map(t => t.id));
      setAnalystQuestions([]);
      
      const uniqueSymbols = new Set(data.transcripts.map(t => t.symbol));
      toast({
        title: "Success",
        description: `Found ${data.transcripts.length} transcript(s) across ${uniqueSymbols.size} compan${uniqueSymbols.size !== 1 ? 'ies' : 'y'}`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to fetch transcripts",
        variant: "destructive",
      });
    },
  });

  const extractAnalystQuestionsMutation = useMutation({
    mutationFn: async (transcriptIds: number[]) => {
      const response = await apiRequest("/api/analyst-questions/extract", "POST", { transcriptIds });
      return response.json();
    },
    onSuccess: (data) => {
      setAnalystQuestions(data.questions);
      toast({
        title: "Success",
        description: `Extracted ${data.questions.length} analyst question(s)`,
      });
      
      // Auto-generate summary after extracting questions
      if (data.questions.length > 0) {
        generateSummaryMutation.mutate({ transcriptIds: selectedTranscripts });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to extract analyst questions",
        variant: "destructive",
      });
    },
  });

  const downloadAnalystQuestionsMutation = useMutation({
    mutationFn: async ({ transcriptIds, format }: { transcriptIds: number[], format: string }) => {
      const response = await fetch("/api/analyst-questions/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcriptIds, format }),
      });
      
      if (!response.ok) {
        throw new Error("Download failed");
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      
      // Create descriptive filename with company, quarters, and years
      const uniqueQuarters = selectedQuarters.filter((q, i) => selectedQuarters.indexOf(q) === i).sort();
      const uniqueYears = selectedYears.filter((y, i) => selectedYears.indexOf(y) === i).sort();
      const quarters = uniqueQuarters.join("-");
      const years = uniqueYears.join("-");
      const validSymbols = symbols.filter(s => s.trim()).map(s => s.trim().toUpperCase());
      const symbolsStr = validSymbols.length > 0 ? validSymbols.join("-") : "multi-symbol";
      const filename = `${symbolsStr}_${quarters}_${years}_analyst_questions.${format}`;
      a.download = filename;
      
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Download started successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to download analyst questions",
        variant: "destructive",
      });
    },
  });

  const generateAnalystProfilesMutation = useMutation({
    mutationFn: async (transcriptIds: number[]) => {
      // Get analysts count first for progress tracking
      const extractResponse = await fetch("/api/analyst-questions/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcriptIds }),
      });
      const extractData = await extractResponse.json();
      const uniqueAnalysts = new Set(extractData.questions?.map((q: any) => q.analystName) || []);
      const totalAnalysts = uniqueAnalysts.size;

      // Set initial progress state
      setGptProgress({
        isProcessing: true,
        currentAnalyst: 'Starting GPT analysis...',
        totalAnalysts,
        processedAnalysts: 0,
        processedItems: []
      });

      // Simulate progress updates every 2 seconds
      const progressInterval = setInterval(() => {
        setGptProgress(prev => {
          const newProcessed = Math.min(prev.processedAnalysts + 1, prev.totalAnalysts);
          return {
            ...prev,
            processedAnalysts: newProcessed,
            currentAnalyst: newProcessed < prev.totalAnalysts 
              ? `Processing analyst ${newProcessed + 1} of ${prev.totalAnalysts}...`
              : 'Generating analyst profiles...'
          };
        });
      }, 2000); // Update progress every 2 seconds

      const response = await fetch("/api/analyst-profiles/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcriptIds }),
      });
      
      clearInterval(progressInterval);
      
      if (!response.ok) {
        throw new Error("Failed to generate analyst profiles");
      }
      
      return response.json();
    },
    onSuccess: (data: any) => {
      setAnalystProfiles(data.analysts);
      setGptProgress({
        isProcessing: false,
        currentAnalyst: '',
        totalAnalysts: 0,
        processedAnalysts: 0,
        processedItems: []
      });
      toast({
        title: "Success",
        description: `Generated ${data.analysts.length} analyst profile(s)`,
      });
    },
    onError: (error: any) => {
      setGptProgress({
        isProcessing: false,
        currentAnalyst: '',
        totalAnalysts: 0,
        processedAnalysts: 0,
        processedItems: []
      });
      toast({
        title: "Error",
        description: error.message || "Failed to generate analyst profiles",
        variant: "destructive",
      });
    },
  });

  const exportAnalystNamesMutation = useMutation({
    mutationFn: async (transcriptIds: number[]) => {
      const response = await fetch("/api/analyst-names/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcriptIds }),
      });
      
      if (!response.ok) {
        throw new Error("Export failed");
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = response.headers.get("content-disposition")?.split("filename=")[1]?.replace(/"/g, "") || "unique_analysts.xlsx";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Unique analyst names exported successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to export analyst names",
        variant: "destructive",
      });
    },
  });

  const extractPreparedStatementsMutation = useMutation({
    mutationFn: async (transcriptIds: number[]) => {
      const response = await fetch("/api/prepared-statements/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcriptIds }),
      });
      
      if (!response.ok) {
        throw new Error("Failed to extract prepared statements");
      }
      
      return response.json();
    },
    onSuccess: (data: any) => {
      setPreparedStatements(data.statements);
      toast({
        title: "Success",
        description: `Extracted ${data.statements.length} prepared statement(s)`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to extract prepared statements",
        variant: "destructive",
      });
    },
  });

  const downloadPreparedStatementsMutation = useMutation({
    mutationFn: async ({ transcriptIds, format }: { transcriptIds: number[], format: string }) => {
      const response = await fetch("/api/prepared-statements/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcriptIds, format }),
      });
      
      if (!response.ok) {
        throw new Error("Download failed");
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      
      const uniqueQuarters = selectedQuarters.filter((q, i) => selectedQuarters.indexOf(q) === i).sort();
      const uniqueYears = selectedYears.filter((y, i) => selectedYears.indexOf(y) === i).sort();
      const quarters = uniqueQuarters.join("-");
      const years = uniqueYears.join("-");
      const validSymbols = symbols.filter(s => s.trim()).map(s => s.trim().toUpperCase());
      const symbolsStr = validSymbols.length > 0 ? validSymbols.join("-") : "multi-symbol";
      const filename = `${symbolsStr}_${quarters}_${years}_prepared_statements.${format}`;
      a.download = filename;
      
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Download started successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to download prepared statements",
        variant: "destructive",
      });
    },
  });

  const generateSummaryMutation = useMutation({
    mutationFn: async (data: GenerateSummaryRequest) => {
      setSummaryProgress({
        isGenerating: true,
        status: 'Fetching financial data for context...'
      });
      
      const symbols = Array.from(new Set(transcripts.map(t => t.symbol)));
      
      // Fetch financial data for each symbol for GPT context
      const financialData: Record<string, any> = {};
      for (const symbol of symbols) {
        try {
          const response = await fetch(`/api/financials/${symbol}`);
          if (response.ok) {
            const financialResponse = await response.json();
            financialData[symbol] = financialResponse.data;
          }
        } catch (error) {
          console.log(`Could not fetch financial data for ${symbol}`);
        }
      }
      
      setSummaryProgress({
        isGenerating: true,
        status: 'Analyzing questions with financial context...'
      });
      
      const requestData = {
        ...data,
        financialContext: Object.keys(financialData).length > 0 ? financialData : undefined
      };
      
      const response = await apiRequest("/api/transcripts/generate-summary", "POST", requestData);
      return response.json();
    },
    onSuccess: (data: TranscriptSummary) => {
      setSummaryData(data);
      setSummaryProgress({
        isGenerating: false,
        status: ''
      });
      setShowSummaryModal(true); // Auto-show the summary modal
      toast({
        title: "Summary Generated",
        description: `AI summary created for ${data.analystQuestionCount} analyst questions with financial context`,
      });
    },
    onError: (error: any) => {
      setSummaryProgress({
        isGenerating: false,
        status: ''
      });
      toast({
        title: "Error",
        description: error.message || "Failed to generate summary",
        variant: "destructive",
      });
    },
  });

  const handleSymbolChange = (index: number, value: string) => {
    const upperValue = value.toUpperCase();
    const newSymbols = [...symbols];
    newSymbols[index] = upperValue;
    setSymbols(newSymbols);
    
    if (upperValue && !validateStockSymbol(upperValue)) {
      setSymbolError(`Invalid symbol: ${upperValue} (1-5 letters only)`);
    } else {
      setSymbolError("");
    }
  };

  const handleFetchTranscripts = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const validSymbols = symbols.filter(s => s.trim()).map(s => s.trim().toUpperCase());
    
    if (validSymbols.length === 0) {
      toast({
        title: "Error",
        description: "Please enter at least one stock symbol",
        variant: "destructive",
      });
      return;
    }
    
    for (const symbol of validSymbols) {
      if (!validateStockSymbol(symbol)) {
        setSymbolError(`Invalid symbol: ${symbol}`);
        toast({
          title: "Error",
          description: `Invalid symbol: ${symbol} (1-5 letters only)`,
          variant: "destructive",
        });
        return;
      }
    }
    
    if (selectedQuarters.length === 0) {
      toast({
        title: "Error",
        description: "Please select at least one quarter",
        variant: "destructive",
      });
      return;
    }
    
    if (selectedYears.length === 0) {
      toast({
        title: "Error",
        description: "Please select at least one year",
        variant: "destructive",
      });
      return;
    }

    setSymbolError("");
    fetchTranscriptsMutation.mutate(validSymbols);
  };

  const handleDownloadPDF = (transcript: Transcript) => {
    generateTranscriptPDF(transcript);
  };

  const handleTranscriptSelection = (transcriptId: number, checked: boolean) => {
    if (checked) {
      setSelectedTranscripts(prev => [...prev, transcriptId]);
    } else {
      setSelectedTranscripts(prev => prev.filter(id => id !== transcriptId));
    }
  };

  const handleSelectAllTranscripts = (checked: boolean) => {
    if (checked) {
      setSelectedTranscripts(transcripts.map(t => t.id));
    } else {
      setSelectedTranscripts([]);
    }
  };

  const handleExtractAnalystQuestions = () => {
    if (selectedTranscripts.length === 0) {
      toast({
        title: "Error",
        description: "Please select at least one transcript",
        variant: "destructive",
      });
      return;
    }
    extractAnalystQuestionsMutation.mutate(selectedTranscripts);
  };

  const handleExtractPreparedStatements = () => {
    if (selectedTranscripts.length === 0) {
      toast({
        title: "Error",
        description: "Please select at least one transcript",
        variant: "destructive",
      });
      return;
    }
    extractPreparedStatementsMutation.mutate(selectedTranscripts);
  };

  const handleDownloadAnalystQuestions = () => {
    if (selectedTranscripts.length === 0) {
      toast({
        title: "Error",
        description: "Please select at least one transcript",
        variant: "destructive",
      });
      return;
    }
    downloadAnalystQuestionsMutation.mutate({
      transcriptIds: selectedTranscripts,
      format: downloadFormat,
    });
  };

  const handleDownloadPreparedStatements = () => {
    if (selectedTranscripts.length === 0) {
      toast({
        title: "Error",
        description: "Please select at least one transcript",
        variant: "destructive",
      });
      return;
    }
    downloadPreparedStatementsMutation.mutate({
      transcriptIds: selectedTranscripts,
      format: downloadFormat,
    });
  };

  // Summary text display utilities
  const copySummaryToClipboard = () => {
    if (!summaryData) return;
    
    const plainText = summaryData.summary
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/---/g, '\n---\n') // Add line breaks around separators
      .replace(/•/g, '• ') // Ensure proper bullet spacing
      .trim();
    
    navigator.clipboard.writeText(plainText).then(() => {
      toast({
        title: "Copied",
        description: "Summary text copied to clipboard",
      });
    });
  };

  const downloadSummaryAsText = () => {
    if (!summaryData) return;
    
    const plainText = `AI-Generated Earnings Call Summary
Generated: ${new Date(summaryData.generatedAt).toLocaleString()}
Companies: ${summaryData.symbols.join(', ')}
Quarters: ${summaryData.quarters.join(', ')} | Years: ${summaryData.years.join(', ')}
Total Analyst Questions: ${summaryData.analystQuestionCount}

SUMMARY
${summaryData.summary.replace(/<[^>]*>/g, '').replace(/---/g, '\n---\n')}

KEY INSIGHTS
${summaryData.keyInsights.map((insight, index) => `${index + 1}. ${insight}`).join('\n')}`;
    
    const blob = new Blob([plainText], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `AI-Summary-${summaryData.symbols.join('-')}-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
    
    toast({
      title: "Downloaded",
      description: "Summary text file downloaded",
    });
  };

  const handleDownloadAllPDFs = () => {
    if (transcripts.length === 0) {
      toast({
        title: "Error",
        description: "No transcripts available to download",
        variant: "destructive",
      });
      return;
    }
    generateMultipleTranscriptsPDF(transcripts);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-3">
            </div>
          </div>
        </div>
      </header>
      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          
          {/* Search Form */}
          <div className="lg:col-span-1">
            <Card className="p-6 min-h-[600px]">
              <CardHeader className="px-0 pt-0">
                <CardTitle className="flex items-center space-x-2">
                  <Search className="w-5 h-5 text-primary" />
                  <span>Transcript Finder</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-0 pb-0">
                <form onSubmit={handleFetchTranscripts} className="space-y-6">
                  
                  {/* Stock Symbol Inputs */}
                  <div>
                    <Label className="flex items-center space-x-2 text-sm font-medium text-neutral mb-2">
                      <Building className="w-4 h-4 text-gray-400" />
                      <span>Stock Symbols (up to 5)</span>
                    </Label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {symbols.map((symbol, index) => (
                        <Input
                          key={index}
                          type="text"
                          value={symbol}
                          onChange={(e) => handleSymbolChange(index, e.target.value)}
                          placeholder={index === 0 ? "e.g., AAPL" : "Optional"}
                          className="w-full uppercase"
                          maxLength={5}
                        />
                      ))}
                    </div>
                    {symbolError && (
                      <p className="text-xs text-destructive flex items-center mt-1">
                        <TriangleAlert className="w-3 h-3 mr-1" />
                        {symbolError}
                      </p>
                    )}
                  </div>

                  {/* Quarter Selection */}
                  <div>
                    <Label className="flex items-center space-x-2 text-sm font-medium text-neutral mb-2">
                      <Calendar className="w-4 h-4 text-gray-400" />
                      <span>Quarters (Multi-select)</span>
                    </Label>
                    <MultiSelect
                      options={quarterOptions}
                      value={selectedQuarters}
                      onChange={setSelectedQuarters}
                      placeholder="Select quarters..."
                      disableSearch={true}
                    />
                    {/* Selected Quarter Bubbles */}
                    {selectedQuarters.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {selectedQuarters.map((quarter) => (
                          <Badge
                            key={quarter}
                            variant="secondary"
                            className="flex items-center gap-1 px-2 py-1"
                          >
                            <span>{quarter} - {quarterOptions.find(q => q.value === quarter)?.label.split(' - ')[1]}</span>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedQuarters(prev => prev.filter(q => q !== quarter));
                              }}
                              className="ml-1 text-gray-500 hover:text-gray-700"
                            >
                              ×
                            </button>
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Year Selection */}
                  <div>
                    <Label className="flex items-center space-x-2 text-sm font-medium text-neutral mb-2">
                      <Clock className="w-4 h-4 text-gray-400" />
                      <span>Years (Multi-select)</span>
                    </Label>
                    <MultiSelect
                      options={yearOptions}
                      value={selectedYears}
                      onChange={setSelectedYears}
                      placeholder="Select years..."
                    />
                    {/* Selected Year Bubbles */}
                    {selectedYears.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {selectedYears.map((year) => (
                          <Badge
                            key={year}
                            variant="secondary"
                            className="flex items-center gap-1 px-2 py-1"
                          >
                            <span>{year}</span>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedYears(prev => prev.filter(y => y !== year));
                              }}
                              className="ml-1 text-gray-500 hover:text-gray-700"
                            >
                              ×
                            </button>
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="mt-6 flex space-x-2">
                    <Button 
                      type="submit" 
                      disabled={fetchTranscriptsMutation.isPending}
                      className="flex-1 bg-[#f06a02] hover:bg-[#d4590b]"
                    >
                      {fetchTranscriptsMutation.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Search className="w-4 h-4 mr-2" />
                      )}
                      Search
                    </Button>
                    <Button 
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setSymbols(["", "", "", "", ""]);
                        setSelectedQuarters([]);
                        setSelectedYears([]);
                        setTranscripts([]);
                        setSelectedTranscripts([]);
                        setAnalystQuestions([]);
                        setSymbolError("");
                      }}
                    >
                      <RotateCcw className="w-4 h-4" />
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            {/* Quick Stats */}

          </div>

          {/* Results Area */}
          <div className="lg:col-span-3">
            
            {/* Results Header */}
            <Card className="p-6 mb-6 text-[13px] min-h-[600px]">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-start space-x-6">
                  <div className="flex flex-col items-start flex-shrink-0">
                    <img 
                      src={logoImage} 
                      alt="DemystifAI's Analyst Question Extractor"
                      className="h-72 w-auto flex-shrink-0"
                      style={{ minWidth: '288px', width: '288px' }}
                    />
                    <p className="text-gray-600 italic mt-4 text-[15px] flex-shrink-0" style={{ width: '288px' }}>
                      Ripping Analysts Questions from<br />Any Earnings Call Transcript
                    </p>
                  </div>
                  
                  {/* Usage Directions or Search Summary and Extract Button */}
                  {(selectedQuarters.length > 0 || selectedYears.length > 0) ? (
                    // Show search summary and extract button when selections are made
                    (<div className="flex flex-col space-y-4">
                      <div className="flex flex-wrap items-center gap-4 text-[19px]">
                        {symbols.some(s => s.trim()) && (
                          <div className="flex items-center space-x-1">
                            <span className="text-gray-600">Symbols:</span>
                            <div className="flex flex-wrap gap-1">
                              {symbols.filter(s => s.trim()).map((symbol, index) => (
                                <Badge key={index} variant="secondary">{symbol}</Badge>
                              ))}
                            </div>
                          </div>
                        )}
                        {selectedQuarters.length > 0 && (
                          <div className="flex items-center space-x-1">
                            <span className="text-gray-600">Quarters:</span>
                            <Badge variant="secondary">{selectedQuarters.join(", ")}</Badge>
                          </div>
                        )}
                        {selectedYears.length > 0 && (
                          <div className="flex items-center space-x-1">
                            <span className="text-gray-600">Years:</span>
                            <Badge variant="secondary">{selectedYears.join(", ")}</Badge>
                          </div>
                        )}
                      </div>
                      
                    </div>)
                  ) : (
                    // Show usage directions when no selections are made
                    (<div className="flex flex-col justify-center h-72 flex-shrink-0" style={{ width: '400px', minWidth: '400px' }}>
                      <h3 className="font-semibold text-gray-800 mb-5 text-[24px]">How to Use the Transcript Finder</h3>
                      <div className="space-y-4 text-gray-600 text-[16px]">
                        <div className="flex items-start space-x-3">
                          <span className="text-orange-500 font-bold text-base flex-shrink-0">1.</span>
                          <p>Use the Transcript Finder to enter up to 5 stock symbols (e.g., AAPL, MSFT, GOOGL)</p>
                        </div>
                        <div className="flex items-start space-x-3">
                          <span className="text-orange-500 font-bold text-base flex-shrink-0">2.</span>
                          <p>Select quarters and years you want to analyze in the tracker</p>
                        </div>
                        <div className="flex items-start space-x-3">
                          <span className="text-orange-500 font-bold text-base flex-shrink-0">3.</span>
                          <p>Click "Search" to find earnings call transcripts</p>
                        </div>
                        <div className="flex items-start space-x-3">
                          <span className="text-orange-500 font-bold text-base flex-shrink-0">4.</span>
                          <p>Select transcripts and extract analyst questions</p>
                        </div>
                        <div className="flex items-start space-x-3">
                          <span className="text-orange-500 font-bold text-base flex-shrink-0">5.</span>
                          <p>Download results in PDF, TXT, XLSX, CSV or DOCX formats</p>
                        </div>
                      </div>
                    </div>)
                  )}
                </div>
                
                {transcripts.length > 0 && (
                  <Badge variant="outline" className="text-sm">
                    {transcripts.length} transcript{transcripts.length !== 1 ? 's' : ''} found
                  </Badge>
                )}
              </div>

            </Card>

            

            {/* Analysis Panel with Tabs */}
            {transcripts.length > 0 && (
              <Card className="p-6 mt-6 text-[13px]">
                <CardHeader className="px-0 pt-0">
                  <CardTitle className="flex items-center space-x-2">
                    <Filter className="w-5 h-5 text-primary" />
                    <span>Analysis & Extraction</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-0 pb-0">
                  <div className="space-y-4">
                    
                    {/* Tab Navigation */}
                    <div className="flex space-x-1 p-1 bg-gray-100 rounded-lg">
                      <button
                        onClick={() => setActiveTab("questions")}
                        className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                          activeTab === "questions"
                            ? "bg-white text-gray-900 shadow-sm"
                            : "text-gray-500 hover:text-gray-900"
                        }`}
                      >
                        <Brain className="w-4 h-4 inline mr-2" />
                        Analyst Questions
                      </button>
                      <button
                        onClick={() => setActiveTab("statements")}
                        className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                          activeTab === "statements"
                            ? "bg-white text-gray-900 shadow-sm"
                            : "text-gray-500 hover:text-gray-900"
                        }`}
                      >
                        <FileText className="w-4 h-4 inline mr-2" />
                        Prepared Statements
                      </button>

                    </div>
                    
                    {/* Selection Controls */}
                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                      <div className="flex items-center space-x-4">
                        <span className="text-sm text-gray-600">
                          Found {transcripts.length} transcript{transcripts.length !== 1 ? 's' : ''} ready for {
                            activeTab === "questions" ? "analyst question extraction" : 
                            "prepared statement extraction"
                          }
                        </span>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <Select 
                          value={downloadFormat} 
                          onValueChange={(value) => setDownloadFormat(value as any)}
                        >
                          <SelectTrigger className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pdf">PDF</SelectItem>
                            <SelectItem value="docx">DOCX</SelectItem>
                            <SelectItem value="txt">TXT</SelectItem>
                            <SelectItem value="xlsx">XLSX</SelectItem>
                            <SelectItem value="csv">CSV</SelectItem>
                          </SelectContent>
                        </Select>
                        
                        {activeTab === "questions" ? (
                          <Button
                            onClick={handleDownloadAnalystQuestions}
                            disabled={selectedTranscripts.length === 0 || downloadAnalystQuestionsMutation.isPending}
                            className="text-[#ffffff] bg-[#f06a0a] hover:bg-[#d4590b]"
                          >
                            {downloadAnalystQuestionsMutation.isPending ? (
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            ) : (
                              <Download className="w-4 h-4 mr-2" />
                            )}
                            Download Questions
                          </Button>
                        ) : (
                          <Button
                            onClick={handleDownloadPreparedStatements}
                            disabled={selectedTranscripts.length === 0 || downloadPreparedStatementsMutation.isPending}
                            className="text-[#ffffff] bg-[#f06a0a] hover:bg-[#d4590b]"
                          >
                            {downloadPreparedStatementsMutation.isPending ? (
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            ) : (
                              <Download className="w-4 h-4 mr-2" />
                            )}
                            Download Statements
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Tab Content */}
                    {activeTab === "questions" && (
                      // Analyst Questions Content
                      <div className="space-y-4">
                        <Button
                          onClick={handleExtractAnalystQuestions}
                          disabled={selectedTranscripts.length === 0 || extractAnalystQuestionsMutation.isPending}
                          className="bg-orange-500 hover:bg-orange-600 text-white font-semibold w-full"
                        >
                          {extractAnalystQuestionsMutation.isPending ? (
                            <>
                              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                              Extracting Questions...
                            </>
                          ) : (
                            <>
                              <Brain className="w-5 h-5 mr-2" />
                              Extract Analyst Questions
                            </>
                          )}
                        </Button>
                        {/* Analyst Questions Results */}
                        {analystQuestions.length > 0 && (
                          <div className="space-y-4">
                            <div className="flex items-center justify-between">
                              <h3 className="text-md font-semibold text-neutral">
                                Extracted Analyst Questions ({analystQuestions.length})
                              </h3>
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={toggleExpandAll}
                                  className="text-orange-600 border-orange-200 hover:bg-orange-50"
                                >
                                  <Expand className="w-4 h-4 mr-1" />
                                  {expandAllQuestions ? 'Collapse All' : 'Expand All'}
                                </Button>
                                <Badge variant="secondary">
                                  {new Set(analystQuestions.map(q => q.analystName)).size} unique analysts
                                </Badge>
                              </div>
                            </div>
                            
                            <ScrollArea className="border rounded-lg p-4 h-96">
                              <div className="space-y-4">
                                {Object.entries(
                                  analystQuestions.reduce((groups, question) => {
                                    const companyKey = question.symbol;
                                    if (!groups[companyKey]) {
                                      groups[companyKey] = {};
                                    }
                                    const analystKey = question.analystName;
                                    if (!groups[companyKey][analystKey]) {
                                      groups[companyKey][analystKey] = [];
                                    }
                                    groups[companyKey][analystKey].push(question);
                                    return groups;
                                  }, {} as Record<string, Record<string, typeof analystQuestions>>)
                                ).map(([companySymbol, analysts]) => {
                                  const companyName = getCompanyName(companySymbol);
                                  const displayName = companyName !== companySymbol ? `${companyName} (${companySymbol})` : companySymbol;
                                  
                                  return (
                                    <div key={companySymbol} className="border border-gray-300 rounded-lg p-4 bg-white">
                                      <div className="flex items-center justify-between mb-4">
                                        <h5 className="font-semibold text-lg text-gray-900 flex items-center gap-2">
                                          <Building className="w-5 h-5 text-orange-500" />
                                          {displayName}
                                        </h5>
                                        <Badge variant="secondary" className="text-xs">
                                          {Object.keys(analysts).length} analyst{Object.keys(analysts).length !== 1 ? 's' : ''}
                                        </Badge>
                                      </div>
                                    
                                      <div className="space-y-3">
                                        {Object.entries(analysts).map(([analystName, questions]) => (
                                          <div key={analystName} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                                            <div className="flex items-center justify-between mb-3">
                                              <div className="flex items-center gap-2">
                                                <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center">
                                                  <span className="text-orange-600 font-semibold text-xs">
                                                    {analystName.split(' ').map((n: string) => n[0]).join('')}
                                                  </span>
                                                </div>
                                                <div>
                                                  <span className="font-medium text-sm text-gray-900">
                                                    {analystName}
                                                  </span>
                                                  <span className="text-xs text-gray-600 ml-2">
                                                    ({questions[0].analystTitle})
                                                  </span>
                                                  <p className="text-xs text-gray-500">
                                                    {questions[0].analystCompany}
                                                  </p>
                                                </div>
                                              </div>
                                              <Badge variant="outline" className="text-xs">
                                                {questions.length} question{questions.length !== 1 ? 's' : ''}
                                              </Badge>
                                            </div>
                                            
                                            <div className="space-y-2">
                                              {questions.map((question, qIndex) => {
                                                const questionId = `${question.transcriptId}-${question.analystName}-${qIndex}`;
                                                const isExpanded = expandedQuestions.has(questionId) || expandAllQuestions;
                                                const shouldTruncate = question.question.length > 200;
                                                
                                                return (
                                                  <div key={qIndex} className="bg-orange-50 rounded-md p-3 border border-orange-100 relative">
                                                    <div className="flex items-center justify-between mb-2">
                                                      <Badge className="inline-flex items-center rounded-full border px-2.5 py-0.5 font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 text-sm bg-[#000000] text-[#ffffff]">
                                                        {question.quarter} {question.year}
                                                      </Badge>
                                                      {shouldTruncate && (
                                                        <Button
                                                          variant="ghost"
                                                          size="sm"
                                                          onClick={() => toggleQuestionExpansion(questionId)}
                                                          className="h-6 w-6 p-0 text-orange-600 hover:bg-orange-100"
                                                        >
                                                          {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                                                        </Button>
                                                      )}
                                                    </div>
                                                    <p className="text-sm text-gray-700 leading-relaxed">
                                                      {isExpanded || !shouldTruncate 
                                                        ? question.question 
                                                        : `${question.question.substring(0, 200)}...`}
                                                    </p>
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </ScrollArea>
                            
                            {/* Summary Loading Indicator */}
                            {summaryProgress.isGenerating && (
                              <div className="mt-6">
                                <div className="border border-orange-200 rounded-lg p-6 bg-gradient-to-r from-orange-50 to-amber-50">
                                  <div className="flex items-center justify-center space-x-3">
                                    <Loader2 className="w-6 h-6 animate-spin text-orange-600" />
                                    <div className="text-center">
                                      <h3 className="text-lg font-semibold text-orange-800 mb-1">Generating AI Summary</h3>
                                      <p className="text-sm text-orange-600">{summaryProgress.status}</p>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* AI Summary Section - Auto-generated after questions extraction */}
                            {summaryData && !summaryProgress.isGenerating && (
                              <div className="mt-6">
                                <div className="border border-orange-300 rounded-lg p-6 bg-gradient-to-r from-orange-50 to-amber-50">
                                  <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-lg font-semibold text-orange-900 flex items-center">
                                      <ChartLine className="w-5 h-5 mr-2 text-orange-600" />
                                      AI Summary of Analyst Questions
                                    </h3>
                                    <div className="flex items-center gap-2">
                                      <Badge variant="secondary" className="text-xs bg-orange-100 text-orange-800">
                                        Generated {new Date(summaryData.generatedAt).toLocaleString()}
                                      </Badge>
                                      <div className="flex gap-1">
                                        <Dialog open={showSummaryModal} onOpenChange={setShowSummaryModal}>
                                          <DialogTrigger asChild>
                                            <Button
                                              size="sm"
                                              variant="outline"
                                              className="text-xs h-7 px-2 border-orange-300 text-orange-700 hover:bg-orange-100"
                                            >
                                              <Eye className="w-3 h-3 mr-1" />
                                              View Text
                                            </Button>
                                          </DialogTrigger>
                                          <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
                                            <DialogHeader>
                                              <DialogTitle className="flex items-center">
                                                <Brain className="w-5 h-5 mr-2 text-orange-600" />
                                                AI-Generated Summary
                                              </DialogTitle>
                                            </DialogHeader>
                                            <div className="space-y-4">
                                              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                                <div className="text-sm text-gray-600">
                                                  <span className="font-medium">Companies:</span> {summaryData.symbols.join(', ')} | 
                                                  <span className="font-medium ml-2">Questions:</span> {summaryData.analystQuestionCount}
                                                </div>
                                                <div className="flex gap-2">
                                                  <Button
                                                    onClick={copySummaryToClipboard}
                                                    size="sm"
                                                    variant="outline"
                                                    className="text-xs h-8"
                                                  >
                                                    <Copy className="w-3 h-3 mr-1" />
                                                    Copy
                                                  </Button>
                                                  <Button
                                                    onClick={downloadSummaryAsText}
                                                    size="sm"
                                                    variant="outline"
                                                    className="text-xs h-8"
                                                  >
                                                    <Download className="w-3 h-3 mr-1" />
                                                    TXT
                                                  </Button>
                                                </div>
                                              </div>
                                              <ScrollArea className="h-[60vh] pr-4">
                                                <div className="space-y-6">
                                                  <div>
                                                    <h4 className="font-semibold text-lg mb-3">Summary</h4>
                                                    <div 
                                                      className="prose prose-sm max-w-none text-gray-700 leading-relaxed"
                                                      dangerouslySetInnerHTML={{ 
                                                        __html: formatAnalystProfile(summaryData.summary) 
                                                      }} 
                                                    />
                                                  </div>
                                                  <div>
                                                    <h4 className="font-semibold text-lg mb-3">Key Insights</h4>
                                                    <div className="space-y-2">
                                                      {summaryData.keyInsights.map((insight, index) => (
                                                        <div key={index} className="flex items-start bg-white p-3 rounded-md border">
                                                          <Badge variant="outline" className="mr-3 mt-0.5 text-xs">
                                                            {index + 1}
                                                          </Badge>
                                                          <p className="text-sm text-gray-700">{insight}</p>
                                                        </div>
                                                      ))}
                                                    </div>
                                                  </div>
                                                </div>
                                              </ScrollArea>
                                            </div>
                                          </DialogContent>
                                        </Dialog>
                                        <Button
                                          onClick={() => generateSummaryPDF(summaryData)}
                                          size="sm"
                                          variant="outline"
                                          className="text-xs h-7 px-2 border-orange-300 text-orange-700 hover:bg-orange-100"
                                        >
                                          PDF
                                        </Button>
                                        <Button
                                          onClick={() => generateSummaryWord(summaryData)}
                                          size="sm"
                                          variant="outline"
                                          className="text-xs h-7 px-2 border-orange-300 text-orange-700 hover:bg-orange-100"
                                        >
                                          Word
                                        </Button>
                                      </div>
                                    </div>
                                  </div>
                                  
                                  {/* Summary Content with Company Separation */}
                                  <div className="space-y-4">
                                    <div className="text-sm text-gray-700 leading-relaxed">
                                      {summaryData.summary.split('---').map((section, sectionIndex) => (
                                        <div key={sectionIndex}>
                                          {sectionIndex > 0 && <hr className="my-6 border-gray-300" />}
                                          {section.split('\n').map((line, lineIndex) => {
                                            if (line.trim().startsWith('**') && line.trim().endsWith('**')) {
                                              const title = line.replace(/\*\*/g, '');
                                              return (
                                                <h4 key={lineIndex} className="font-semibold text-base text-gray-900 mt-4 mb-3 border-b border-gray-300 pb-1">
                                                  {title}
                                                </h4>
                                              );
                                            } else if (line.trim().startsWith('•') || line.trim().startsWith('-')) {
                                              const bulletText = line.replace(/^[•-]\s*/, '').trim();
                                              return (
                                                <div key={lineIndex} className="mb-5 pl-5 relative leading-relaxed">
                                                  <span className="absolute left-0 top-1.5 w-2 h-2 bg-orange-500 rounded-full"></span>
                                                  <span className="text-gray-700 leading-tight block">{bulletText}</span>
                                                </div>
                                              );
                                            } else if (line.trim()) {
                                              return (
                                                <p key={lineIndex} className="mb-2 leading-tight text-gray-600">
                                                  {line.trim()}
                                                </p>
                                              );
                                            }
                                            return null;
                                          })}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                  
                                  {/* Key Insights */}
                                  <div className="mt-6 border-t border-orange-300 pt-4">
                                    <h4 className="text-sm font-medium text-orange-900 mb-3 flex items-center">
                                      <Info className="w-4 h-4 mr-2 text-orange-600" />
                                      Key Insights
                                    </h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                                      {summaryData.keyInsights.map((insight, index) => (
                                        <div key={index} className="flex items-start bg-white p-3 rounded border border-orange-200">
                                          <span className="w-2 h-2 bg-orange-500 rounded-full mt-1.5 mr-2 flex-shrink-0"></span>
                                          <span className="text-gray-600">{insight}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                            
                            {/* Analyst Profile Generation */}
                            <div className="border rounded-lg p-4 bg-blue-50 mt-6">
                              <h4 className="font-semibold text-blue-800 mb-3">Generate Analyst Profiles with GPT</h4>
                              <div className="space-y-3">
                                <div className="flex gap-2">
                                  <Button
                                    onClick={() => generateAnalystProfilesMutation.mutate(selectedTranscripts)}
                                    disabled={selectedTranscripts.length === 0 || generateAnalystProfilesMutation.isPending}
                                    className="bg-blue-600 hover:bg-blue-700 text-white flex-1"
                                  >
                                    {generateAnalystProfilesMutation.isPending || gptProgress.isProcessing ? (
                                      <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        Generating Analyst Profiles
                                      </>
                                    ) : (
                                      <>
                                        <Brain className="w-4 h-4 mr-2" />
                                        Generate Analyst Profiles
                                      </>
                                    )}
                                  </Button>

                                </div>
                                {/* Progress Indicator */}
                                {gptProgress.isProcessing && (
                                  <div className="bg-white border border-blue-200 rounded-md p-3">
                                    <div className="flex items-center justify-between mb-2">
                                      {gptProgress.totalAnalysts > 0 && (
                                        <span className="text-xs text-blue-600">
                                          {gptProgress.processedAnalysts} / {gptProgress.totalAnalysts}
                                        </span>
                                      )}
                                    </div>
                                    <div className="w-full bg-blue-100 rounded-full h-2 mb-2">
                                      <div 
                                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                                        style={{ 
                                          width: gptProgress.totalAnalysts > 0 
                                            ? `${(gptProgress.processedAnalysts / gptProgress.totalAnalysts) * 100}%` 
                                            : '0%' 
                                        }}
                                      ></div>
                                    </div>
                                    <p className="text-xs text-blue-600 flex items-center gap-2">
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                      {gptProgress.currentAnalyst}
                                    </p>
                                  </div>
                                )}
                              </div>
                            </div>
                            
                            {/* Analyst Profiles Display */}
                            {analystProfiles.length > 0 && (
                              <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                  <h4 className="font-semibold text-gray-800">Generated Analyst Profiles ({analystProfiles.length})</h4>
                                  <div className="flex items-center gap-2">
                                    <Badge variant="secondary" className="bg-green-100 text-green-800">
                                      GPT Analysis Complete
                                    </Badge>
                                    <div className="flex gap-1">
                                      <Button
                                        onClick={() => generateAnalystProfilesPDF(analystProfiles)}
                                        size="sm"
                                        variant="outline"
                                        className="text-xs h-7 px-2"
                                      >
                                        PDF
                                      </Button>
                                      <Button
                                        onClick={() => generateAnalystProfilesWord(analystProfiles)}
                                        size="sm"
                                        variant="outline"
                                        className="text-xs h-7 px-2"
                                      >
                                        Word
                                      </Button>
                                      <Button
                                        onClick={() => generateAnalystProfilesCSV(analystProfiles)}
                                        size="sm"
                                        variant="outline"
                                        className="text-xs h-7 px-2"
                                      >
                                        CSV
                                      </Button>
                                      <Button
                                        onClick={() => generateAnalystProfilesExcel(analystProfiles)}
                                        size="sm"
                                        variant="outline"
                                        className="text-xs h-7 px-2"
                                      >
                                        Excel
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                                
                                <ScrollArea className="border rounded-lg p-4 h-96">
                                  <div className="space-y-4">
                                    {analystProfiles.length > 0 && (() => {
                                      const groupedProfiles: Record<string, any[]> = {};
                                      
                                      analystProfiles.forEach(profile => {
                                        profile.symbols.forEach((symbol: string) => {
                                          if (!groupedProfiles[symbol]) {
                                            groupedProfiles[symbol] = [];
                                          }
                                          groupedProfiles[symbol].push(profile);
                                        });
                                      });
                                      
                                      return Object.entries(groupedProfiles).map(([companySymbol, profiles]) => {
                                        const companyName = getCompanyName(companySymbol);
                                        const displayName = companyName !== companySymbol ? `${companyName} (${companySymbol})` : companySymbol;
                                        
                                        return (
                                          <div key={companySymbol} className="border border-gray-300 rounded-lg p-4 bg-white">
                                            <div className="flex items-center justify-between mb-4">
                                              <h5 className="font-semibold text-lg text-gray-900 flex items-center gap-2">
                                                <Building className="w-5 h-5 text-blue-600" />
                                                {displayName}
                                              </h5>
                                              <Badge variant="secondary" className="text-xs">
                                                {profiles.length} analyst{profiles.length !== 1 ? 's' : ''}
                                              </Badge>
                                            </div>
                                          
                                            <div className="space-y-3">
                                              {profiles.map((profile, index) => (
                                                <div key={`${profile.name}_${index}`} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                                                  <div className="flex items-center justify-between mb-3">
                                                    <div className="flex items-center gap-2">
                                                      <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                                                        <span className="text-green-600 font-semibold text-xs">
                                                          {profile.name.split(' ').map((n: string) => n[0]).join('')}
                                                        </span>
                                                      </div>
                                                      <div>
                                                        <span className="font-medium text-sm text-gray-900">
                                                          {profile.name}
                                                        </span>
                                                        <span className="text-xs text-gray-600 ml-2">
                                                          ({profile.title})
                                                        </span>
                                                        <p className="text-xs text-gray-500">
                                                          {profile.company}
                                                        </p>
                                                      </div>
                                                    </div>
                                                    <div className="flex flex-col items-end gap-1">
                                                      <Badge variant="outline" className="text-xs">
                                                        {profile.questionCount} question{profile.questionCount !== 1 ? 's' : ''}
                                                      </Badge>
                                                      <Badge variant="outline" className="text-xs bg-blue-50">
                                                        {profile.symbols.join(', ')}
                                                      </Badge>
                                                    </div>
                                                  </div>
                                                  
                                                  <div className="bg-white rounded-lg p-4 border border-gray-100">
                                                    <div className="prose prose-sm max-w-none">
                                                      <div 
                                                        className="text-sm text-gray-700 leading-relaxed font-sans"
                                                        dangerouslySetInnerHTML={{
                                                          __html: formatAnalystProfile(profile.gptResponse)
                                                        }}
                                                      />
                                                    </div>
                                                  </div>
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        );
                                      });
                                    })()}
                                  </div>
                                </ScrollArea>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                    
                    {activeTab === "statements" && (
                      // Prepared Statements Content
                      <div className="space-y-4">
                        <Button
                          onClick={handleExtractPreparedStatements}
                          disabled={selectedTranscripts.length === 0 || extractPreparedStatementsMutation.isPending}
                          className="bg-orange-500 hover:bg-orange-600 text-white font-semibold w-full"
                        >
                          {extractPreparedStatementsMutation.isPending ? (
                            <>
                              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                              Extracting Statements...
                            </>
                          ) : (
                            <>
                              <FileText className="w-5 h-5 mr-2" />
                              Extract Prepared Statements
                            </>
                          )}
                        </Button>
                        {/* Prepared Statements Results */}
                        {preparedStatements.length > 0 && (
                          <div className="space-y-4">
                            <div className="flex items-center justify-between">
                              <h3 className="text-md font-semibold text-neutral">
                                Extracted Prepared Statements ({preparedStatements.length})
                              </h3>
                              <Badge variant="secondary">
                                {new Set(preparedStatements.map(s => s.speakerName)).size} unique speakers
                              </Badge>
                            </div>
                            
                            <ScrollArea className="h-64 border rounded-lg p-4">
                              <div className="space-y-3">
                                {preparedStatements.map((statement, index) => (
                                  <div key={index} className="border-l-4 border-green-500 pl-4 py-2">
                                    <div className="flex items-center justify-between mb-1">
                                      <div className="flex flex-col">
                                        <span className="font-medium text-sm text-neutral">
                                          {statement.speakerName} ({statement.speakerTitle})
                                        </span>
                                      </div>
                                      <Badge variant="outline" className="text-xs">
                                        {statement.symbol} {statement.quarter} {statement.year}
                                      </Badge>
                                    </div>
                                    <p className="text-sm text-gray-600 leading-relaxed">
                                      {statement.statement.length > 200 
                                        ? `${statement.statement.substring(0, 200)}...` 
                                        : statement.statement}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </ScrollArea>
                          </div>
                        )}
                      </div>
                    )}


                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>
      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-6">
              <p className="text-sm text-gray-600">
                © 2025 DemystifAI, LLC.
              </p>
            </div>
            
          </div>
        </div>
      </footer>
    </div>
  );
}
