import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Calendar, Clock, Play, CheckCircle, AlertCircle, Building2 } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';

interface EarningsDate {
  symbol: string;
  reportDate: string;
  estimate?: string;
  quarter: string;
  year: number;
}

interface AutoUpdateCheck {
  shouldUpdate: boolean;
  earningsToUpdate: EarningsDate[];
}

interface AutoUpdateResult {
  updated: string[];
  errors: string[];
}

export default function AutoUpdate() {
  const [selectedSymbol, setSelectedSymbol] = useState<string>('');
  const queryClient = useQueryClient();

  // Check for auto-updates
  const { data: autoUpdateCheck, isLoading: checkLoading } = useQuery({
    queryKey: ['/api/earnings/check-auto-update'],
    refetchInterval: 60000 // Check every minute
  });

  // Get earnings calendar
  const { data: earningsData, isLoading: earningsLoading } = useQuery({
    queryKey: ['/api/earnings/calendar', selectedSymbol],
    enabled: true
  });

  // Perform auto-update mutation
  const performAutoUpdate = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('/api/earnings/perform-auto-update', {
        method: 'POST'
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/earnings/check-auto-update'] });
    }
  });

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getNextEarningsDate = (earnings: EarningsDate[]) => {
    const today = new Date();
    const upcoming = earnings
      .filter(e => new Date(e.reportDate) > today)
      .sort((a, b) => new Date(a.reportDate).getTime() - new Date(b.reportDate).getTime());
    return upcoming[0];
  };

  const symbols = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'META', 'NVDA', 'CRM', 'ORCL', 'ADBE'];

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <Calendar className="w-8 h-8 text-blue-500" />
        <div>
          <h1 className="text-3xl font-bold">Auto-Update Center</h1>
          <p className="text-muted-foreground">
            Monitor earnings calls and automatically update analyst profiles
          </p>
        </div>
      </div>

      {/* Auto-Update Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Auto-Update Status
          </CardTitle>
          <CardDescription>
            System automatically checks for updates 2 days after earnings calls
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {checkLoading ? (
            <div className="text-center py-4">
              <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full mx-auto"></div>
              <p className="text-sm text-muted-foreground mt-2">Checking for updates...</p>
            </div>
          ) : autoUpdateCheck?.shouldUpdate ? (
            <Alert>
              <AlertCircle className="w-4 h-4" />
              <AlertDescription>
                <div className="space-y-2">
                  <p className="font-medium">Updates Available!</p>
                  <p>Found {autoUpdateCheck.earningsToUpdate.length} companies with earnings calls from 2 days ago:</p>
                  <div className="flex flex-wrap gap-2">
                    {autoUpdateCheck.earningsToUpdate.map((earning) => (
                      <Badge key={earning.symbol} variant="secondary">
                        {earning.symbol} ({formatDate(earning.reportDate)})
                      </Badge>
                    ))}
                  </div>
                  <Button
                    onClick={() => performAutoUpdate.mutate()}
                    disabled={performAutoUpdate.isPending}
                    className="mt-3"
                  >
                    <Play className="w-4 h-4 mr-2" />
                    {performAutoUpdate.isPending ? 'Updating...' : 'Run Auto-Update'}
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          ) : (
            <Alert>
              <CheckCircle className="w-4 h-4" />
              <AlertDescription>
                No auto-updates needed. System will check again tomorrow at 9 AM EST.
              </AlertDescription>
            </Alert>
          )}

          {performAutoUpdate.data && (
            <Alert>
              <CheckCircle className="w-4 h-4" />
              <AlertDescription>
                <div className="space-y-2">
                  <p className="font-medium">Auto-Update Complete!</p>
                  {performAutoUpdate.data.updated.length > 0 && (
                    <p>Updated {performAutoUpdate.data.updated.length} analyst profiles:</p>
                  )}
                  {performAutoUpdate.data.updated.map((update: string) => (
                    <Badge key={update} variant="outline" className="mr-2">
                      {update}
                    </Badge>
                  ))}
                  {performAutoUpdate.data.errors.length > 0 && (
                    <div>
                      <p className="text-red-600">Errors encountered:</p>
                      {performAutoUpdate.data.errors.map((error: string, idx: number) => (
                        <p key={idx} className="text-sm text-red-600">{error}</p>
                      ))}
                    </div>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Earnings Calendar */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5" />
            Earnings Calendar
          </CardTitle>
          <CardDescription>
            View upcoming earnings calls for major companies
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            <Button
              variant={selectedSymbol === '' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedSymbol('')}
            >
              All Companies
            </Button>
            {symbols.map((symbol) => (
              <Button
                key={symbol}
                variant={selectedSymbol === symbol ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedSymbol(symbol)}
              >
                {symbol}
              </Button>
            ))}
          </div>

          {earningsLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full mx-auto"></div>
              <p className="text-sm text-muted-foreground mt-2">Loading earnings calendar...</p>
            </div>
          ) : earningsData?.earnings?.length > 0 ? (
            <div className="space-y-3">
              {earningsData.earnings.slice(0, 10).map((earning: EarningsDate, idx: number) => {
                const isUpcoming = new Date(earning.reportDate) > new Date();
                const daysDiff = Math.ceil((new Date(earning.reportDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
                
                return (
                  <div
                    key={`${earning.symbol}-${earning.reportDate}-${idx}`}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <Badge variant="outline">{earning.symbol}</Badge>
                      <div>
                        <p className="font-medium">{formatDate(earning.reportDate)}</p>
                        <p className="text-sm text-muted-foreground">
                          {earning.quarter} {earning.year}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      {isUpcoming ? (
                        <Badge variant="secondary">
                          {daysDiff === 0 ? 'Today' : daysDiff === 1 ? 'Tomorrow' : `${daysDiff} days`}
                        </Badge>
                      ) : (
                        <Badge variant="outline">Past</Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No earnings data available</p>
              <p className="text-sm">Check Alpha Vantage API configuration</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}