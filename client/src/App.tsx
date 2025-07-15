import { Switch, Route, Link, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import TranscriptViewer from "@/pages/transcript-viewer";
import GoogleDriveSimple from "@/pages/google-drive-simple";
import AutoUpdate from "@/pages/auto-update";
import NotFound from "@/pages/not-found";
import { FileText, FolderOpen, Calendar } from "lucide-react";

function Navigation() {
  const [location] = useLocation();
  
  return (
    <nav className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="flex items-center space-x-4">
        <h1 className="text-xl font-bold text-gray-900">Analyst Questions Manager</h1>
        <div className="flex space-x-2">
          <Link href="/">
            <Button 
              variant={location === "/" ? "default" : "outline"}
              size="sm"
              className="flex items-center gap-2"
            >
              <FileText className="h-4 w-4" />
              Transcript Analyzer
            </Button>
          </Link>
          <Link href="/google-drive">
            <Button 
              variant={location === "/google-drive" ? "default" : "outline"}
              size="sm"
              className="flex items-center gap-2"
            >
              <FolderOpen className="h-4 w-4" />
              Google Drive Manager
            </Button>
          </Link>
        </div>
      </div>
    </nav>
  );
}

function Router() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      <Switch>
        <Route path="/" component={TranscriptViewer} />
        <Route path="/google-drive" component={GoogleDriveSimple} />
        <Route path="/google-drive-simple" component={GoogleDriveSimple} />
        <Route path="/auto-update" component={AutoUpdate} />
        <Route component={NotFound} />
      </Switch>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
