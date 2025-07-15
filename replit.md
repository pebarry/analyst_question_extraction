# Replit.md

## Overview

This is a full-stack web application called "Analyst Questions Extractor" built for financial transcript analysis. The application helps extract and analyze analyst questions from earnings call transcripts, with capabilities to generate summaries, profiles, and upload data to Google Drive.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite for development and production builds
- **UI Library**: Shadcn/ui components with Radix UI primitives
- **Styling**: Tailwind CSS with custom design tokens
- **State Management**: TanStack Query (React Query) for server state
- **Routing**: Wouter for client-side routing
- **Forms**: React Hook Form with Zod validation

### Backend Architecture
- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js
- **Development**: tsx for TypeScript execution
- **Session Management**: Connect-pg-simple for PostgreSQL sessions
- **File Processing**: 
  - docx for Word document generation
  - xlsx for Excel file handling
  - jsPDF for PDF generation

### Data Storage Solutions
- **Database**: PostgreSQL (configured via Replit modules)
- **ORM**: Drizzle ORM with TypeScript schema definitions
- **Schema Location**: `shared/schema.ts` with users and transcripts tables
- **Migrations**: Drizzle Kit for database migrations in `./migrations` directory

## Key Components

### Authentication & Authorization
- **Google OAuth 2.0**: Complete OAuth flow for Google Drive access
- **Service Account**: Alternative authentication method with service account key
- **Environment Variables**: 
  - `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` for OAuth
  - `DATABASE_URL` for PostgreSQL connection

### External Service Integrations
- **Google Drive API**: Full integration for file uploads and folder management
- **OpenAI API**: GPT-4o-mini integration for analyst profile generation
- **Google Cloud**: Service account authentication for automated operations

### Data Processing Pipeline
1. **Transcript Ingestion**: JSON-based transcript content parsing
2. **Analyst Question Extraction**: Pattern matching to identify analyst speakers
3. **Prepared Statement Parsing**: Executive statement extraction
4. **AI-Powered Analysis**: GPT integration for profile generation
5. **Multi-format Export**: PDF, DOCX, CSV, TXT, and XLSX generation

### UI Components
- **Multi-page Application**: 
  - Transcript Viewer (`/`) - Main analysis interface
  - Google Drive Manager (`/google-drive`) - File upload interface
- **Component Library**: Complete Shadcn/ui implementation
- **Responsive Design**: Mobile-first approach with Tailwind CSS
- **Interactive Elements**: Multi-select dropdowns, accordions, dialogs

## Data Flow

1. **User Authentication**: OAuth flow or service account for Google Drive access
2. **Transcript Selection**: Users select stock symbols, quarters, and years
3. **Data Fetching**: Mock data from in-memory storage (ready for database integration)
4. **Analysis Processing**: 
   - Extract analyst questions using regex patterns
   - Generate summaries via OpenAI API
   - Create analyst profiles with GPT-4o-mini
5. **Export Generation**: Multiple format support for downloaded content
6. **Google Drive Upload**: Automated folder creation and file organization

## External Dependencies

### Core Dependencies
- **React Ecosystem**: react, react-dom, @tanstack/react-query
- **UI Framework**: @radix-ui/* components, tailwindcss, class-variance-authority
- **Backend**: express, drizzle-orm, @neondatabase/serverless
- **File Processing**: docx, xlsx, jspdf
- **Google Integration**: googleapis
- **AI Integration**: openai
- **Development**: typescript, vite, tsx

### Authentication Services
- **Google Cloud Console**: OAuth 2.0 credentials management
- **Service Account**: JSON key file for automated authentication
- **Replit Environment**: Secure credential storage

## Deployment Strategy

### Development Environment
- **Replit Configuration**: `.replit` file configured for Node.js 20, web, and PostgreSQL 16
- **Development Server**: `npm run dev` with hot reload via Vite
- **Port Configuration**: Local port 5000, external port 80

### Production Build
- **Build Process**: Vite frontend build + esbuild backend bundling
- **Deployment Target**: Replit Autoscale
- **Environment**: Production environment variables required
- **Static Assets**: Served from `dist/public` directory

### Database Setup
- **Drizzle Configuration**: `drizzle.config.ts` for schema management
- **Migration Strategy**: `npm run db:push` for schema updates
- **Connection**: PostgreSQL via `DATABASE_URL` environment variable

## User Preferences

Preferred communication style: Simple, everyday language.

## Recent Changes

### June 23-25, 2025 - Complete System Integration & Enhanced Analyst Name Consolidation
- ✓ Fixed Excel file download from Google Drive API (resolved Blob vs Buffer handling)
- ✓ Implemented comprehensive Excel data merging (preserves existing entries, adds new on top)
- ✓ Integrated GPT-4 analyst profiling with same methodology as transcript analyzer
- ✓ Enhanced PDF generation with multi-page support and professional formatting
- ✓ Added intelligent content detection (headers, bullets, lists) for proper layout
- ✓ Implemented smart page breaks and typography hierarchy
- ✓ Fixed analyst naming convention to properly separate names from companies
- ✓ Implemented transcript-wide analyst company assignment - all instances of an analyst get the same company within a transcript
- ✓ Added company-wide analyst consolidation to merge analysts with same name across all transcripts for same stock symbol
- ✓ Enhanced operator extraction patterns for better company identification
- ✓ Fixed multi-transcript processing to apply consolidation across all questions simultaneously
- ✓ Successfully tested full workflow: Excel download → data merge → GPT analysis → PDF generation
- ✓ Enhanced error handling and logging for production debugging
- ✓ Implemented Google Custom Search API integration for business news context
- ✓ Added JSON-to-text conversion pipeline for GPT-compatible news processing
- ✓ Enhanced analyst profiles with current market context from recent news articles
- ✓ Upgraded to o1-mini model with 3000 token limit for comprehensive reasoning
- ✓ Updated GPT prompt to explicitly use news context for deeper question analysis
- ✓ Implemented comprehensive news integration system with multiple search strategies
- ✓ Fixed Google Custom Search API - extracted correct CX ID from HTML embed code
- ✓ Added proper quota limit handling for Google Custom Search API
- ✓ Enhanced error handling with detailed logging for search failures
- ✓ Added prominent summary text display functionality with modal dialog
- ✓ Implemented copy to clipboard and text file export features for summaries
- ✓ Enhanced summary viewing experience with formatted display and export options
- ✓ Implemented intelligent analyst name normalization for short/long name variations
- ✓ Added comprehensive name mapping system (Mike→Michael, Jim→James, etc.)
- ✓ Enhanced analyst consolidation to group analysts by normalized names
- ✓ Updated Google Drive service to use normalized names for consistent file naming
- ✓ Implemented Alpha Vantage earnings calendar integration for auto-update functionality
- ✓ Added scheduled auto-update system that checks for earnings calls 2 days after they occur
- ✓ Created Auto-Update page with earnings calendar display and manual trigger capabilities
- ✓ Integrated node-cron for daily automated checking at 9 AM EST
- ✓ Added comprehensive API endpoints for earnings tracking and auto-update management
- ✓ Implemented Alpha Vantage financial data integration (stock prices, P/E ratios, revenue data)
- ✓ Enhanced GPT analyst profile generation with comprehensive financial context
- ✓ Added financial metrics analysis framework for deeper analyst profiling
- ✓ Created financial context document generation for GPT input
- ✓ Integrated real-time stock data into summary generation process
- ✓ Fixed prepared statement extraction to properly separate from Q&A responses
- ✓ Enhanced prepared statement filtering using chronological section identification
- ✓ Improved executive title recognition and investor relations exclusion
- ✓ Successfully integrated real AlphaVantage API for live earnings call transcript data
- ✓ Confirmed API functionality with IBM Q1 2024 real earnings call data
- ✓ Fixed all extraction functionality to work with authentic API data sources
- ✓ System now fetches live transcripts instead of mock data
- ✓ Fixed prepared statement extraction for all companies (MCD, UL, AAPL, etc.)
- ✓ Improved Q&A section detection to properly identify prepared vs. Q&A content
- ✓ Enhanced transcript storage to preserve JSON structure for accurate extraction
- ✓ Successfully extracting CEO/CFO prepared statements from real AlphaVantage data

### Architecture Updates
- **Excel Merge Strategy**: New entries added on top while preserving all existing data
- **Google Drive Service**: Robust file handling with axios for binary data processing
- **Analyst Profile Generation**: Automated pipeline from Excel analysis to PDF creation
- **Intelligent Date Comparison**: Compares quarter/year ranges to determine if updates are needed
- **Smart Update Logic**: Updates Excel only when system has data newer than existing files
- **Prevents Redundant Updates**: Skips updates when requested data is already included in Excel
- **API Endpoint**: `/api/google-drive/generate-analyst-profile` for individual profile generation

## Changelog

- June 23, 2025: Initial project setup and Google Drive integration completion