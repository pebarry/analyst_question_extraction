import React, { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, Loader2 } from "lucide-react";

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

export default function GoogleDriveSimple() {
  const [symbol, setSymbol] = useState("");
  const [selectedQuarters, setSelectedQuarters] = useState<string[]>([]);
  const [selectedYears, setSelectedYears] = useState<string[]>([]);
  const [uploadingAnalysts, setUploadingAnalysts] = useState<Record<string, boolean>>({});
  const [analystQuestions, setAnalystQuestions] = useState<AnalystQuestion[]>([]);
  const [transcripts, setTranscripts] = useState<any[]>([]);
  const [uploadResults, setUploadResults] = useState<Array<{analyst: string, success: boolean, message: string}>>([]);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authUrl, setAuthUrl] = useState<string>("");
  const [altAuthUrl, setAltAuthUrl] = useState<string>("");
  const [authMethod, setAuthMethod] = useState<string>("");
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [authAttempt, setAuthAttempt] = useState(0);
  const [generatingProfiles, setGeneratingProfiles] = useState<Record<string, boolean>>({});
  const [profileResults, setProfileResults] = useState<Array<{analyst: string, success: boolean, message: string, fileName?: string}>>([]);

  
  const { toast } = useToast();

  // Check authentication status on component mount
  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      setCheckingAuth(true);
      const response = await apiRequest("/api/google-drive/status", "GET");
      const data = await response.json();
      setIsAuthenticated(data.isAuthenticated);
      setAuthMethod(data.method || "");
      
      if (!data.isAuthenticated) {
        setAuthUrl(data.authUrl);
        setAltAuthUrl(data.altAuthUrl || "");
        if (data.method === 'oauth_required') {
          toast({
            title: "Authentication Required",
            description: "Please authenticate with Google Drive to upload files",
            variant: "destructive",
          });
        }
      } else {
        if (data.method === 'service_account') {
          toast({
            title: "Automatic Connection Successful",
            description: "Google Drive connected automatically via service account",
          });
        }
      }
    } catch (error) {
      console.error("Error checking auth status:", error);
      setIsAuthenticated(false);
      toast({
        title: "Connection Error",
        description: "Failed to check Google Drive connection status",
        variant: "destructive",
      });
    } finally {
      setCheckingAuth(false);
    }
  };

  const handleAuthenticate = (useAltUrl = false) => {
    const urlToUse = useAltUrl ? altAuthUrl : authUrl;
    if (urlToUse) {
      const popup = window.open(urlToUse, 'google-auth', 'width=500,height=600,scrollbars=yes,resizable=yes');
      
      // Listen for authentication success
      const handleMessage = (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return; // Security check
        
        if (event.data.type === 'google-auth-success') {
          setIsAuthenticated(true);
          setAuthAttempt(0); // Reset attempt counter
          checkAuthStatus(); // Refresh status
          toast({
            title: "Authentication successful",
            description: "Google Drive connected - automatic connection enabled for future sessions",
          });
          window.removeEventListener('message', handleMessage);
          popup?.close();
        } else if (event.data.type === 'google-auth-error') {
          setAuthAttempt(prev => prev + 1);
          const errorMsg = event.data.error || "Failed to authenticate with Google Drive";
          
          // If scope error and we have alt URL, suggest trying it
          if (errorMsg.includes('invalid_scope') && altAuthUrl && !useAltUrl) {
            toast({
              title: "Scope Error - Try Alternative",
              description: "The requested permissions aren't available. Try the alternative authentication method below.",
              variant: "destructive",
            });
          } else {
            toast({
              title: "Authentication failed",
              description: errorMsg,
              variant: "destructive",
            });
          }
          window.removeEventListener('message', handleMessage);
          popup?.close();
        }
      };
      
      window.addEventListener('message', handleMessage);
      
      // Check if popup was blocked
      if (!popup) {
        toast({
          title: "Popup blocked",
          description: "Please allow popups and try again",
          variant: "destructive",
        });
        return;
      }

      // Handle popup closed manually
      const checkClosed = setInterval(() => {
        if (popup.closed) {
          clearInterval(checkClosed);
          window.removeEventListener('message', handleMessage);
        }
      }, 1000);
    }
  };



  const queryClient = useQueryClient();

  // Fetch transcripts mutation
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
      
      setTranscripts(data.transcripts);
      
      // Extract analyst questions using the same method as transcript viewer
      if (data.transcripts.length > 0) {
        extractAnalystQuestionsMutation.mutate(data.transcripts.map((t: any) => t.id));
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error fetching transcripts",
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
      setAnalystQuestions(data.questions || []);
      
      // Update transcripts with analyst questions
      const updatedTranscripts = transcripts.map(transcript => {
        const transcriptQuestions = (data.questions || []).filter((q: any) => q.transcriptId === transcript.id);
        return {
          ...transcript,
          analystQuestions: transcriptQuestions
        };
      });
      setTranscripts(updatedTranscripts);
    },
    onError: (error: any) => {
      toast({
        title: "Error extracting analyst questions",
        description: error.message || "Failed to extract analyst questions",
        variant: "destructive",
      });
    },
  });

  // Upload analyst questions to Google Drive
  const uploadAnalystQuestions = async (mappedName: string) => {
    try {
      setUploadingAnalysts(prev => ({ ...prev, [mappedName]: true }));
      
      const analystData = questionsByAnalyst[mappedName];
      if (!analystData) return;
      
      const response = await apiRequest("/api/google-drive/upload-analyst-questions", "POST", {
        analystName: analystData.originalName,
        questions: analystData.questions
      });
      
      const result = await response.json();
      
      setUploadResults(prev => [...prev, {
        analyst: `${analystData.mappedInfo.firstName} ${analystData.mappedInfo.lastName} (${analystData.mappedInfo.institution})`,
        success: true,
        message: `${result.questionsCount} questions ${result.fileUpdated ? 'merged with existing' : 'uploaded to new'} file`
      }]);
      
      toast({
        title: "Upload successful",
        description: `${result.questionsCount} questions processed for ${analystData.mappedInfo.firstName} ${analystData.mappedInfo.lastName}`,
      });
      
    } catch (error: any) {
      const analystData = questionsByAnalyst[mappedName];
      setUploadResults(prev => [...prev, {
        analyst: analystData ? `${analystData.mappedInfo.firstName} ${analystData.mappedInfo.lastName}` : mappedName,
        success: false,
        message: error.message || "Upload failed"
      }]);
      
      toast({
        title: "Upload failed",
        description: error.message || `Failed to upload questions for ${mappedName}`,
        variant: "destructive",
      });
    } finally {
      setUploadingAnalysts(prev => ({ ...prev, [mappedName]: false }));
    }
  };

  // Upload all analysts at once
  const uploadAllAnalysts = async () => {
    const analystKeys = Object.keys(questionsByAnalyst);
    for (const mappedName of analystKeys) {
      if (!uploadingAnalysts[mappedName]) {
        await uploadAnalystQuestions(mappedName);
        // Small delay between uploads
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  };

  // Generate analyst profile for individual analyst
  const generateAnalystProfile = async (analystName: string) => {
    try {
      setGeneratingProfiles(prev => ({ ...prev, [analystName]: true }));
      
      const response = await apiRequest("/api/google-drive/generate-analyst-profile", "POST", {
        analystName
      });
      
      const result = await response.json();
      
      setProfileResults(prev => [...prev, {
        analyst: analystName,
        success: true,
        message: `Profile generated: ${result.fileName}`,
        fileName: result.fileName
      }]);
      
      toast({
        title: "Profile Generated",
        description: `Analyst profile created for ${analystName}`,
      });
      
    } catch (error: any) {
      setProfileResults(prev => [...prev, {
        analyst: analystName,
        success: false,
        message: error.message || "Profile generation failed"
      }]);
      
      toast({
        title: "Profile Generation Failed",
        description: error.message || `Failed to generate profile for ${analystName}`,
        variant: "destructive",
      });
    } finally {
      setGeneratingProfiles(prev => ({ ...prev, [analystName]: false }));
    }
  };

  // Generate profiles for all analysts
  const generateAllProfiles = async () => {
    try {
      setGeneratingProfiles(prev => ({ ...prev, 'all': true }));
      
      const response = await apiRequest("/api/google-drive/generate-all-profiles", "POST", {});
      const result = await response.json();
      
      // Add results to state
      const newResults = result.results.map((r: any) => ({
        analyst: r.analyst,
        success: r.success,
        message: r.success ? `Profile generated: ${r.fileName}` : r.error,
        fileName: r.fileName
      }));
      
      setProfileResults(prev => [...prev, ...newResults]);
      
      toast({
        title: "Bulk Profile Generation Complete",
        description: result.message,
      });
      
    } catch (error: any) {
      toast({
        title: "Bulk Profile Generation Failed",
        description: error.message || "Failed to generate analyst profiles",
        variant: "destructive",
      });
    } finally {
      setGeneratingProfiles(prev => ({ ...prev, 'all': false }));
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

  const handleExportToGoogleDrive = async (transcript: any) => {
    if (!transcript.analystQuestions || transcript.analystQuestions.length === 0) {
      toast({
        title: "No analyst questions found",
        description: "This transcript doesn't contain any analyst questions to export.",
        variant: "destructive",
      });
      return;
    }

    try {
      setUploadingAnalysts(prev => ({ ...prev, [transcript.id]: true }));

      // Group questions by analyst
      const questionsByAnalyst: Record<string, any[]> = {};
      transcript.analystQuestions.forEach((question: any) => {
        const key = `${question.analystName}_${question.analystCompany}`;
        if (!questionsByAnalyst[key]) {
          questionsByAnalyst[key] = [];
        }
        questionsByAnalyst[key].push(question);
      });

      // Upload each analyst's questions separately
      const uploadPromises = Object.entries(questionsByAnalyst).map(async ([analystKey, questions]) => {
        const response = await apiRequest("/api/google-drive/upload-analyst-questions", "POST", {
          analystName: questions[0].analystName,
          questions: questions
        });
        return response.json();
      });

      const results = await Promise.all(uploadPromises);
      
      let successCount = 0;
      let updateCount = 0;
      
      results.forEach(result => {
        if (result.fileId) {
          successCount++;
          if (result.isUpdate) updateCount++;
        }
      });

      toast({
        title: "Export completed",
        description: `Successfully exported ${successCount} analyst(s) to Google Drive. ${updateCount} file(s) were updated with newer data.`,
      });

    } catch (error: any) {
      toast({
        title: "Export failed",
        description: error.message || "Failed to export analyst questions to Google Drive",
        variant: "destructive",
      });
    } finally {
      setUploadingAnalysts(prev => ({ ...prev, [transcript.id]: false }));
    }
  };

  const handleExportAllToGoogleDrive = async () => {
    const transcriptsWithQuestions = transcripts.filter(t => 
      t.analystQuestions && t.analystQuestions.length > 0
    );

    if (transcriptsWithQuestions.length === 0) {
      toast({
        title: "No analyst questions found",
        description: "None of the transcripts contain analyst questions to export.",
        variant: "destructive",
      });
      return;
    }

    try {
      // Mark all transcripts as uploading
      const uploadingState: Record<string, boolean> = {};
      transcriptsWithQuestions.forEach(t => {
        uploadingState[t.id] = true;
      });
      setUploadingAnalysts(uploadingState);

      // Collect all analyst questions from all transcripts
      const allAnalystGroups: Record<string, any[]> = {};
      
      transcriptsWithQuestions.forEach(transcript => {
        transcript.analystQuestions.forEach((question: any) => {
          const key = `${question.analystName}_${question.analystCompany}`;
          if (!allAnalystGroups[key]) {
            allAnalystGroups[key] = [];
          }
          allAnalystGroups[key].push(question);
        });
      });

      // Upload each analyst's questions separately
      const uploadPromises = Object.entries(allAnalystGroups).map(async ([analystKey, questions]) => {
        try {
          const response = await apiRequest("/api/google-drive/upload-analyst-questions", "POST", {
            analystName: questions[0].analystName,
            questions: questions
          });
          return { success: true, result: await response.json(), analyst: analystKey };
        } catch (error) {
          return { success: false, error, analyst: analystKey };
        }
      });

      const results = await Promise.all(uploadPromises);
      
      let successCount = 0;
      let updateCount = 0;
      let errorCount = 0;
      
      results.forEach(result => {
        if (result.success && result.result.fileId) {
          successCount++;
          if (result.result.isUpdate) updateCount++;
        } else {
          errorCount++;
        }
      });

      if (successCount > 0) {
        toast({
          title: "Export completed",
          description: `Successfully exported ${successCount} analyst(s) to Google Drive. ${updateCount} file(s) were updated with newer data.${errorCount > 0 ? ` ${errorCount} failed.` : ''}`,
        });
      } else {
        toast({
          title: "Export failed",
          description: "Failed to export analyst questions to Google Drive",
          variant: "destructive",
        });
      }

    } catch (error: any) {
      toast({
        title: "Export failed",
        description: error.message || "Failed to export analyst questions to Google Drive",
        variant: "destructive",
      });
    } finally {
      setUploadingAnalysts({});
    }
  };

  // Helper function to parse analyst name
  const parseAnalystInfo = (analystName: string, company: string) => {
    const nameParts = analystName.trim().split(' ');
    const firstName = nameParts[0] || 'Unknown';
    const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : 'Analyst';
    const institution = standardizeInstitutionName(company || 'Unknown');
    return { firstName, lastName, institution, mappedName: `${firstName}_${lastName}_${institution}` };
  };

  const standardizeInstitutionName = (company: string): string => {
    const institutionMap: Record<string, string> = {
      'Goldman Sachs': 'GoldmanSachs',
      'JPMorgan': 'JPMorgan',
      'JPMorgan Chase': 'JPMorgan',
      'Morgan Stanley': 'MorganStanley',
      'Bank of America': 'BankOfAmerica',
      'Wells Fargo': 'WellsFargo',
      'Citigroup': 'Citigroup',
      'Citi': 'Citigroup',
      'UBS': 'UBS',
      'Evercore': 'Evercore',
      'Cowen': 'Cowen',
      'TD Cowen': 'Cowen',
      'Melius': 'Melius',
      'Arete Research': 'AreteResearch'
    };

    for (const [key, value] of Object.entries(institutionMap)) {
      if (company.toLowerCase().includes(key.toLowerCase())) {
        return value;
      }
    }
    return company.replace(/[^a-zA-Z0-9]/g, '').substring(0, 15);
  };

  // Group questions by mapped analyst identity (firstName_lastName_institution)
  const questionsByAnalyst = analystQuestions.reduce((acc, question) => {
    const analystInfo = parseAnalystInfo(question.analystName, question.analystCompany);
    const key = analystInfo.mappedName;
    
    if (!acc[key]) {
      acc[key] = {
        originalName: question.analystName,
        mappedInfo: analystInfo,
        questions: []
      };
    }
    acc[key].questions.push(question);
    return acc;
  }, {} as Record<string, { originalName: string; mappedInfo: any; questions: AnalystQuestion[] }>);

  const analystStats = Object.entries(questionsByAnalyst).map(([mappedName, data]) => ({
    originalName: data.originalName,
    mappedName,
    firstName: data.mappedInfo.firstName,
    lastName: data.mappedInfo.lastName,
    institution: data.mappedInfo.institution,
    questionsCount: data.questions.length,
    companies: Array.from(new Set(data.questions.map(q => q.analystCompany))),
    symbols: Array.from(new Set(data.questions.map(q => q.symbol))),
    quarters: Array.from(new Set(data.questions.map(q => `${q.quarter} ${q.year}`))),
    questions: data.questions
  }));

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Google Drive Analyst Organizer</h1>
        <p className="text-gray-600">Automatically upload analyst questions to Google Drive organized by analyst folders</p>
      </div>

      {/* Authentication Status */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {checkingAuth ? (
              <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
            ) : isAuthenticated ? (
              <CheckCircle className="h-5 w-5 text-green-600" />
            ) : (
              <AlertCircle className="h-5 w-5 text-yellow-600" />
            )}
            Google Drive Authentication
          </CardTitle>
          <CardDescription>
            {checkingAuth 
              ? "Checking connection status..."
              : isAuthenticated 
                ? `Connected via ${authMethod === 'service_account' ? 'service account (automatic)' : 'OAuth'} - ready to upload files`
                : "Authentication required to upload files to Google Drive"
            }
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!checkingAuth && !isAuthenticated && (
            <div className="space-y-3">
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                <p className="text-sm text-blue-800">
                  <strong>One-time setup:</strong> Authenticate once with Google Drive. The app will remember your credentials for automatic connection in future sessions.
                </p>
              </div>
              
              {authAttempt > 0 && (
                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                  <p className="text-sm text-yellow-800">
                    <strong>Having scope issues?</strong> You may need to enable the Google Drive API in your Google Cloud Console. 
                    Check the documentation for setup instructions.
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Button onClick={() => handleAuthenticate(false)} disabled={!authUrl} className="w-full">
                  Connect to Google Drive (Full Access)
                </Button>
                
                {altAuthUrl && (
                  <Button 
                    onClick={() => handleAuthenticate(true)} 
                    disabled={!altAuthUrl}
                    variant="outline"
                    className="w-full"
                  >
                    Connect with Limited Permissions (Alternative)
                  </Button>
                )}
              </div>
            </div>
          )}
          
          {!checkingAuth && isAuthenticated && (
            <div className="flex items-center gap-3">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <span className="text-green-700 font-medium">
                Ready to upload analyst Excel files
                {authMethod === 'service_account' && ' (automatic connection active)'}
              </span>
            </div>
          )}
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

      {/* Transcript Results */}
      {transcripts.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Transcript Results</CardTitle>
                <CardDescription>
                  {transcripts.length} transcript{transcripts.length !== 1 ? 's' : ''} found
                </CardDescription>
              </div>
              <Button
                onClick={handleExportAllToGoogleDrive}
                disabled={Object.values(uploadingAnalysts).some(Boolean)}
                variant="default"
              >
                {Object.values(uploadingAnalysts).some(Boolean) ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Exporting...
                  </>
                ) : (
                  "Export All to Google Drive"
                )}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {transcripts.map((transcript, index) => (
                <div key={transcript.id || index} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold">{transcript.title}</h3>
                      <p className="text-sm text-muted-foreground">
                        {transcript.symbol} • {transcript.quarter} {transcript.year}
                      </p>
                    </div>
                    <Button
                      onClick={() => handleExportToGoogleDrive(transcript)}
                      disabled={uploadingAnalysts[transcript.id] || false}
                      variant="outline"
                      size="sm"
                    >
                      {uploadingAnalysts[transcript.id] ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Uploading...
                        </>
                      ) : (
                        "Export to Google Drive"
                      )}
                    </Button>
                  </div>
                  
                  {transcript.analystQuestions && transcript.analystQuestions.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="font-medium text-sm">
                        Analyst Questions ({transcript.analystQuestions.length})
                      </h4>
                      <div className="space-y-2 max-h-40 overflow-y-auto">
                        {transcript.analystQuestions.slice(0, 3).map((question: any, qIndex: number) => (
                          <div key={qIndex} className="text-sm p-2 bg-muted rounded border-l-2 border-blue-500">
                            <div className="font-medium text-blue-700 text-xs">
                              {question.analystName} - {question.analystCompany}
                            </div>
                            <div className="text-muted-foreground mt-1">
                              {question.question.length > 120 
                                ? `${question.question.substring(0, 120)}...` 
                                : question.question}
                            </div>
                          </div>
                        ))}
                        {transcript.analystQuestions.length > 3 && (
                          <div className="text-xs text-muted-foreground text-center py-1">
                            ... and {transcript.analystQuestions.length - 3} more questions
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Analyst Questions Summary */}
      {analystQuestions.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Analyst Questions Summary</CardTitle>
                <CardDescription>
                  {analystQuestions.length} questions from {Object.keys(questionsByAnalyst).length} analysts
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button onClick={uploadAllAnalysts} className="flex items-center gap-2">
                  <Upload className="h-4 w-4" />
                  Upload All to Drive
                </Button>
                <Button 
                  onClick={generateAllProfiles} 
                  disabled={generatingProfiles['all']}
                  variant="outline"
                  className="flex items-center gap-2"
                >
                  {generatingProfiles['all'] ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Generating Profiles...
                    </>
                  ) : (
                    <>
                      <FileSpreadsheet className="h-4 w-4" />
                      Generate All Profiles
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {analystStats.map((analyst) => (
                <Card key={analyst.mappedName} className="border border-gray-200">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-semibold text-gray-900">{analyst.firstName} {analyst.lastName}</h3>
                        <p className="text-sm text-gray-600">{analyst.institution}</p>
                        <p className="text-xs text-gray-500">Original: {analyst.originalName}</p>
                      </div>
                      <Badge variant="secondary">{analyst.questionsCount} questions</Badge>
                    </div>
                    
                    <div className="space-y-2 text-sm">
                      <div>
                        <span className="font-medium">Mapped File:</span>
                        <p className="text-xs text-gray-600 font-mono">{analyst.mappedName}_Questions.xlsx</p>
                      </div>
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
                    
                    <div className="space-y-2">
                      <Button
                        onClick={() => uploadAnalystQuestions(analyst.mappedName)}
                        disabled={uploadingAnalysts[analyst.mappedName]}
                        size="sm"
                        className="w-full"
                      >
                        {uploadingAnalysts[analyst.mappedName] ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Uploading...
                          </>
                        ) : (
                          <>
                            <Upload className="h-4 w-4 mr-2" />
                            Upload/Update Excel
                          </>
                        )}
                      </Button>
                      
                      <Button
                        onClick={() => generateAnalystProfile(analyst.originalName)}
                        disabled={generatingProfiles[analyst.originalName]}
                        size="sm"
                        variant="outline"
                        className="w-full"
                      >
                        {generatingProfiles[analyst.originalName] ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Generating...
                          </>
                        ) : (
                          <>
                            <FileSpreadsheet className="h-4 w-4 mr-2" />
                            Generate Profile PDF
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Upload Results */}
      {uploadResults.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Upload Results</CardTitle>
            <CardDescription>
              Status of Google Drive uploads
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {uploadResults.map((result, index) => (
                <div key={index} className={`flex items-center gap-3 p-3 rounded-md border ${
                  result.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
                }`}>
                  {result.success ? (
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-red-600" />
                  )}
                  <div>
                    <p className="font-medium">{result.analyst}</p>
                    <p className="text-sm text-gray-600">{result.message}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Profile Generation Results */}
      {profileResults.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Profile Generation Results</CardTitle>
            <CardDescription>
              Status of analyst profile PDF generation
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {profileResults.map((result, index) => (
                <div key={index} className={`flex items-center gap-3 p-3 rounded-md border ${
                  result.success ? 'bg-blue-50 border-blue-200' : 'bg-red-50 border-red-200'
                }`}>
                  {result.success ? (
                    <CheckCircle className="h-5 w-5 text-blue-600" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-red-600" />
                  )}
                  <div className="flex-1">
                    <p className="font-medium">{result.analyst}</p>
                    <p className="text-sm text-gray-600">{result.message}</p>
                    {result.fileName && (
                      <p className="text-xs text-blue-600 font-mono">{result.fileName}</p>
                    )}
                  </div>
                  {result.success && (
                    <FileSpreadsheet className="h-5 w-5 text-blue-600" />
                  )}
                </div>
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
            Fetch transcript data to organize analyst questions into Google Drive folders.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}