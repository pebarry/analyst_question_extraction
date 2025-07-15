import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { MultiSelect } from "@/components/multi-select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { validateStockSymbol, getAvailableYears } from "@/lib/utils";
import { FetchTranscriptsRequest, type AnalystQuestion } from "@shared/schema";
import { ExternalLink, Upload, Folder, FileSpreadsheet, CheckCircle, AlertCircle, Loader2 } from "lucide-react";

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

export default function GoogleDriveManager() {
  const [symbol, setSymbol] = useState("");
  const [selectedQuarters, setSelectedQuarters] = useState<string[]>([]);
  const [selectedYears, setSelectedYears] = useState<string[]>([]);
  const [uploadingAnalysts, setUploadingAnalysts] = useState<Record<string, boolean>>({});
  const [analystQuestions, setAnalystQuestions] = useState<AnalystQuestion[]>([]);
  const [driveConnected, setDriveConnected] = useState(true); // Always connected since we have credentials
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch transcripts query
  const fetchTranscriptsMutation = useMutation({
    mutationFn: async (data: FetchTranscriptsRequest) => {
      const response = await apiRequest("/api/transcripts/fetch", "POST", data);
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Transcripts fetched successfully",
        description: `Found ${data.transcripts.length} transcripts`,
      });
      
      // Extract analyst questions from all transcripts
      const questions: AnalystQuestion[] = [];
      data.transcripts.forEach((transcript: any) => {
        if (transcript.analystQuestions) {
          questions.push(...transcript.analystQuestions);
        }
      });
      setAnalystQuestions(questions);
    },
    onError: (error: any) => {
      toast({
        title: "Error fetching transcripts",
        description: error.message || "Failed to fetch transcripts",
        variant: "destructive",
      });
    },
  });

  // Removed authentication since credentials are already configured

  // Google Drive folders query
  const { data: googleDriveFolders, refetch: refreshGoogleDriveFolders } = useQuery({
    queryKey: ["/api/google-drive/analyst-folders"],
    queryFn: () => apiRequest("/api/google-drive/analyst-folders", "GET").then(res => res.json()),
    enabled: false, // Only fetch when explicitly called
    retry: false,
  });

  // Handle authentication status based on query success/failure
  useEffect(() => {
    if (googleDriveFolders) {
      setDriveConnected(true);
    }
  }, [googleDriveFolders]);

  // Upload analyst questions to Google Drive
  const uploadAnalystQuestions = async (analystName: string) => {
    try {
      setUploadingAnalysts(prev => ({ ...prev, [analystName]: true }));
      
      const analystQuestionsList = analystQuestions.filter(q => q.analystName === analystName);
      
      const response = await apiRequest("/api/google-drive/upload-analyst-questions", "POST", {
        analystName,
        questions: analystQuestionsList
      });
      
      const result = await response.json();
      
      toast({
        title: "Upload successful",
        description: `${result.questionsCount} questions uploaded for ${analystName}`,
      });
      
      // Refresh folders list
      refreshGoogleDriveFolders();
      
    } catch (error: any) {
      toast({
        title: "Upload failed",
        description: error.message || `Failed to upload questions for ${analystName}`,
        variant: "destructive",
      });
    } finally {
      setUploadingAnalysts(prev => ({ ...prev, [analystName]: false }));
    }
  };

  const handleFetchTranscripts = () => {
    if (!symbol.trim()) {
      toast({
        title: "Stock symbol required",
        description: "Please enter a stock symbol",
        variant: "destructive",
      });
      return;
    }

    if (!validateStockSymbol(symbol)) {
      toast({
        title: "Invalid stock symbol",
        description: "Please enter a valid stock symbol (e.g., AAPL, GOOGL)",
        variant: "destructive",
      });
      return;
    }

    if (selectedQuarters.length === 0) {
      toast({
        title: "Quarter selection required",
        description: "Please select at least one quarter",
        variant: "destructive",
      });
      return;
    }

    if (selectedYears.length === 0) {
      toast({
        title: "Year selection required",
        description: "Please select at least one year",
        variant: "destructive",
      });
      return;
    }

    fetchTranscriptsMutation.mutate({
      symbol: symbol.toUpperCase(),
      quarters: selectedQuarters as ("Q1" | "Q2" | "Q3" | "Q4")[],
      years: selectedYears.map(y => parseInt(y)),
    });
  };

  // Group questions by analyst
  const questionsByAnalyst = analystQuestions.reduce((acc, question) => {
    const key = question.analystName;
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(question);
    return acc;
  }, {} as Record<string, AnalystQuestion[]>);

  const analystStats = Object.entries(questionsByAnalyst).map(([name, questions]) => ({
    name,
    questionsCount: questions.length,
    companies: Array.from(new Set(questions.map(q => q.analystCompany))),
    symbols: Array.from(new Set(questions.map(q => q.symbol))),
    quarters: Array.from(new Set(questions.map(q => `${q.quarter} ${q.year}`))),
  }));

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Google Drive Analyst Manager</h1>
        <p className="text-gray-600">Organize analyst questions into Excel files stored in Google Drive folders</p>
      </div>

      {/* Google Drive Status */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Folder className="h-5 w-5" />
            Google Drive Integration
          </CardTitle>
          <CardDescription>
            Automatically organizes analyst questions into "Testing for Analyst Profile Overview" folder
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <CheckCircle className="h-5 w-5 text-green-600" />
            <span className="text-green-700 font-medium">Ready to upload to Google Drive</span>
            <Button variant="outline" size="sm" onClick={() => { refreshGoogleDriveFolders(); }}>
              Check Folders
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Transcript Fetching */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Fetch Transcript Data</CardTitle>
          <CardDescription>
            Get analyst questions from earnings call transcripts
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Stock Symbol
              </label>
              <Input
                placeholder="e.g., AAPL, GOOGL"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                className="font-mono"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Quarters
              </label>
              <MultiSelect
                options={quarterOptions}
                value={selectedQuarters}
                onChange={setSelectedQuarters}
                placeholder="Select quarters"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Years
              </label>
              <MultiSelect
                options={yearOptions}
                value={selectedYears}
                onChange={setSelectedYears}
                placeholder="Select years"
              />
            </div>
          </div>
          <Button 
            onClick={handleFetchTranscripts}
            disabled={fetchTranscriptsMutation.isPending}
            className="w-full"
          >
            {fetchTranscriptsMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Fetching Transcripts...
              </>
            ) : (
              "Fetch Transcripts"
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Analyst Questions Summary */}
      {analystQuestions.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Analyst Questions Summary</CardTitle>
            <CardDescription>
              {analystQuestions.length} questions from {Object.keys(questionsByAnalyst).length} analysts
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {analystStats.map((analyst) => (
                <Card key={analyst.name} className="border border-gray-200">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-semibold text-gray-900">{analyst.name}</h3>
                        <p className="text-sm text-gray-600">{analyst.companies[0]}</p>
                      </div>
                      <Badge variant="secondary">{analyst.questionsCount} questions</Badge>
                    </div>
                    
                    <div className="space-y-2 text-sm">
                      <div>
                        <span className="font-medium">Symbols:</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {analyst.symbols.map(symbol => (
                            <Badge key={symbol} variant="outline" className="text-xs">
                              {symbol}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div>
                        <span className="font-medium">Periods:</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {analyst.quarters.map(quarter => (
                            <Badge key={quarter} variant="outline" className="text-xs">
                              {quarter}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>

                    <Separator className="my-3" />
                    
                    <Button
                      onClick={() => uploadAnalystQuestions(analyst.name)}
                      disabled={!driveConnected || uploadingAnalysts[analyst.name]}
                      size="sm"
                      className="w-full"
                    >
                      {uploadingAnalysts[analyst.name] ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Uploading...
                        </>
                      ) : (
                        <>
                          <Upload className="h-4 w-4 mr-2" />
                          Upload to Drive
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Google Drive Folders */}
      {googleDriveFolders && (googleDriveFolders as any).folders && (googleDriveFolders as any).folders.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Google Drive Folders
            </CardTitle>
            <CardDescription>
              Analyst folders in "Testing for Analyst Profile Overview"
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {((googleDriveFolders as any).folders || []).map((folder: any) => (
                <Card key={folder.id} className="border border-gray-200">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold text-gray-900">{folder.name}</h3>
                        <p className="text-sm text-gray-600">
                          {folder.questionsCount} file{folder.questionsCount !== 1 ? 's' : ''}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(`https://drive.google.com/drive/folders/${folder.id}`, '_blank')}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {analystQuestions.length === 0 && !fetchTranscriptsMutation.isPending && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Fetch transcript data to see analyst questions and organize them into Google Drive folders.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}