# Analyst Questions Extractor

A full-stack web application for financial transcript analysis that extracts and analyzes analyst questions from earnings call transcripts, with automated Google Drive integration and AI-powered analyst profiling.

## Features

### Core Functionality
- **Transcript Analysis**: Extract analyst questions and prepared statements from earnings call transcripts
- **AI-Powered Summaries**: Generate comprehensive summaries using GPT-4
- **Multi-format Export**: Export data in PDF, DOCX, CSV, TXT, and XLSX formats
- **Interactive Filtering**: Filter by stock symbols, quarters, and years

### Google Drive Integration
- **Automated Upload**: Seamlessly upload analyst questions to organized Google Drive folders
- **Excel Management**: Merge new questions with existing data while preserving history
- **Analyst Profiles**: Generate comprehensive analyst profiles using GPT-4 analysis
- **PDF Generation**: Create professional multi-page PDF reports with proper formatting

### Advanced Features
- **Smart Merging**: Add new entries to existing Excel files without data loss
- **Automated Profiling**: Bulk generate analyst profiles for all analysts
- **Professional Formatting**: Multi-page PDF support with automatic page breaks
- **Real-time Processing**: Live updates and progress tracking

## Technology Stack

### Frontend
- **React 18** with TypeScript
- **Vite** for build tooling
- **Shadcn/ui** with Radix UI components
- **Tailwind CSS** for styling
- **TanStack Query** for state management
- **Wouter** for routing

### Backend
- **Node.js** with Express.js
- **TypeScript** for type safety
- **Drizzle ORM** with PostgreSQL
- **Google Drive API** integration
- **OpenAI GPT-4** for AI analysis

### File Processing
- **xlsx** for Excel file handling
- **jsPDF** for PDF generation
- **docx** for Word document creation

## Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/YOUR_USERNAME/analyst-questions-extractor.git
   cd analyst-questions-extractor
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   Create a `.env` file with:
   ```env
   DATABASE_URL=your_postgresql_connection_string
   GOOGLE_CLIENT_ID=your_google_client_id
   GOOGLE_CLIENT_SECRET=your_google_client_secret
   OPENAI_API_KEY=your_openai_api_key
   ```

4. **Set up Google Drive API**
   - Create a Google Cloud Console project
   - Enable Google Drive API
   - Create OAuth 2.0 credentials
   - Download the credentials JSON file

5. **Run the application**
   ```bash
   npm run dev
   ```

## Usage

### Basic Transcript Analysis
1. Navigate to the main transcript viewer
2. Select stock symbols, quarters, and years
3. Click "Fetch Transcripts" to load data
4. Use the export buttons to download results in various formats

### Google Drive Integration
1. Go to the Google Drive Manager page
2. Upload your analyst questions using the interface
3. Click "Generate Profile" for individual analysts
4. Use "Generate All Profiles" for bulk processing

### Analyst Profile Generation
- Profiles are automatically generated using GPT-4 analysis
- PDFs include professional formatting with multiple pages
- Profiles analyze questioning patterns and investment focus areas

## API Endpoints

### Transcript Management
- `GET /api/transcripts` - Fetch transcripts with filters
- `POST /api/transcripts/summary` - Generate AI summary

### Google Drive Operations
- `GET /api/google-drive/status` - Check authentication status
- `POST /api/google-drive/upload-analyst-questions` - Upload questions
- `POST /api/google-drive/generate-analyst-profile` - Generate single profile
- `POST /api/google-drive/generate-all-profiles` - Bulk generate profiles

## Configuration

### Google OAuth Setup
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable Google Drive API
4. Create OAuth 2.0 credentials
5. Add authorized redirect URIs

### Database Setup
- PostgreSQL database required
- Run migrations using Drizzle Kit
- Schema defined in `shared/schema.ts`

## Development

### Project Structure
```
├── client/          # React frontend
├── server/          # Express backend
├── shared/          # Shared TypeScript types
├── migrations/      # Database migrations
└── attached_assets/ # Uploaded files
```

### Key Components
- **GoogleDriveService**: Handles all Google Drive operations
- **PDF Generation**: Multi-page support with proper formatting
- **Excel Merging**: Preserves existing data while adding new entries
- **GPT Integration**: Analyst profiling using same methodology as transcript analysis

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For support and questions, please open an issue in the GitHub repository.