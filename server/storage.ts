import { users, transcripts, type User, type InsertUser, type Transcript, type InsertTranscript } from "@shared/schema";

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getTranscript(id: number): Promise<Transcript | undefined>;
  getTranscriptsBySymbol(symbol: string): Promise<Transcript[]>;
  createTranscript(transcript: InsertTranscript): Promise<Transcript>;
  getTranscriptsByFilters(symbol: string, quarters: string[], years: number[]): Promise<Transcript[]>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private transcripts: Map<number, Transcript>;
  private currentUserId: number;
  private currentTranscriptId: number;

  constructor() {
    this.users = new Map();
    this.transcripts = new Map();
    this.currentUserId = 1;
    this.currentTranscriptId = 1;
    
    // Initialize with sample transcripts for demonstration
    this.initializeSampleTranscripts();
  }

  private async initializeSampleTranscripts() {
    // Microsoft Q1 2024 transcript
    await this.createTranscript({
      symbol: "MSFT",
      quarter: "2024Q1",
      year: 2024,
      title: "Microsoft Corporation Q1 2024 Earnings Call",
      date: "2024-01-24",
      content: JSON.stringify([
        {
          "speaker": "Operator",
          "title": "Operator",
          "content": "Good afternoon, and welcome to the Microsoft Q1 2024 earnings conference call. Our first question comes from Keith Weiss with Morgan Stanley. Please go ahead.",
          "sentiment": "0.0"
        },
        {
          "speaker": "Keith Weiss",
          "title": "Analyst",
          "content": "Thank you for taking the question. Satya, I wanted to ask about the Azure growth trajectory and how you're thinking about AI workloads contributing to that growth going forward?",
          "sentiment": "0.2"
        },
        {
          "speaker": "Satya Nadella",
          "title": "CEO",
          "content": "Thanks Keith. We're seeing tremendous momentum in Azure, particularly with our AI services. The integration of OpenAI capabilities into our platform is driving significant customer engagement.",
          "sentiment": "0.6"
        },
        {
          "speaker": "Operator",
          "title": "Operator", 
          "content": "Our next question comes from Brad Zelnick with Deutsche Bank. Please go ahead.",
          "sentiment": "0.0"
        },
        {
          "speaker": "Brad Zelnick",
          "title": "Analyst",
          "content": "Good afternoon. Can you provide more color on the Office 365 subscriber growth and what you're seeing in terms of enterprise adoption?",
          "sentiment": "0.2"
        },
        {
          "speaker": "Amy Hood",
          "title": "CFO",
          "content": "Thank you Brad. We continue to see strong momentum in Office 365 commercial with over 400 million paid seats globally.",
          "sentiment": "0.5"
        },
        {
          "speaker": "Keith Weiss",
          "title": "Analyst",
          "content": "As a follow-up, can you provide more details on the AI integration roadmap?",
          "sentiment": "0.1"
        },
        {
          "speaker": "Michael Ng",
          "title": "Analyst",
          "content": "What are your thoughts on cloud competition dynamics?",
          "sentiment": "0.1"
        }
      ]),
      wordCount: 850,
      revenue: "$62.0B",
      growth: "16%",
      eps: "$2.93",
      margin: "42.0%"
    });

    // Microsoft Q2 2024 transcript (to test company-wide consolidation)
    await this.createTranscript({
      symbol: "MSFT",
      quarter: "2024Q2",
      year: 2024,
      title: "Microsoft Corporation Q2 2024 Earnings Call", 
      date: "2024-04-24",
      content: JSON.stringify([
        {
          "speaker": "Satya Nadella",
          "title": "CEO",
          "content": "Good afternoon, and thank you for joining us today. We are pleased to report strong results for the second quarter. Our continued focus on innovation in cloud computing and AI has driven exceptional growth across all segments. Microsoft's mission to empower every person and organization on the planet to achieve more remains our guiding principle as we navigate an increasingly digital world.",
          "sentiment": "0.7"
        },
        {
          "speaker": "Amy Hood",
          "title": "CFO",
          "content": "Thank you, Satya. We delivered strong financial performance this quarter with revenue of $65.0 billion, representing 18% year-over-year growth. Our operating margin of 43% reflects our disciplined approach to cost management while continuing to invest in our growth priorities. Azure and other cloud services grew 30% this quarter, demonstrating the strength of our cloud platform.",
          "sentiment": "0.6"
        },
        {
          "speaker": "Operator",
          "title": "Operator",
          "content": "We will now begin the question-and-answer session. Our first question comes from Michael Ng with Goldman Sachs. Please go ahead.",
          "sentiment": "0.0"
        },
        {
          "speaker": "Michael Ng",
          "title": "Analyst",
          "content": "Thank you. Can you discuss the Azure revenue growth trajectory for Q3?",
          "sentiment": "0.2"
        }
      ]),
      wordCount: 400,
      revenue: "$65.0B",
      growth: "18%",
      eps: "$3.05", 
      margin: "43.0%"
    });

    // Google Q1 2024 transcript
    await this.createTranscript({
      symbol: "GOOGL",
      quarter: "2024Q1", 
      year: 2024,
      title: "Alphabet Inc. Q1 2024 Earnings Call",
      date: "2024-01-25",
      content: JSON.stringify([
        {
          "speaker": "Sundar Pichai",
          "title": "CEO",
          "content": "Thank you for joining us today for Alphabet's first quarter 2024 earnings call. We delivered strong results this quarter, with Search continuing to be a powerful growth engine and our AI initiatives gaining momentum across all our products. Our focus on innovation in artificial intelligence is creating new opportunities for users and advertisers alike.",
          "sentiment": "0.7"
        },
        {
          "speaker": "Ruth Porat",
          "title": "CFO",
          "content": "Good afternoon, everyone. We reported total revenues of $80.5 billion in Q1, up 15% year-over-year. Google Search revenues were $46.2 billion, up 14% versus the prior year. YouTube advertising revenues were $8.1 billion, reflecting the strength of our video platform. Our continued investment in AI and machine learning capabilities positions us well for future growth.",
          "sentiment": "0.6"
        },
        {
          "speaker": "Operator",
          "title": "Operator",
          "content": "Thank you for standing by. We will now begin the Q&A session. Our first question comes from Douglas Anmuth with JPMorgan. Please go ahead.",
          "sentiment": "0.0"
        },
        {
          "speaker": "Douglas Anmuth",
          "title": "Analyst", 
          "content": "Thanks for taking the questions. Sundar, can you talk about the integration of Bard AI into search and how that's impacting user engagement?",
          "sentiment": "0.2"
        },
        {
          "speaker": "Sundar Pichai",
          "title": "CEO",
          "content": "Thanks Douglas. We're excited about the progress we're making with AI integration across our products. Bard represents a significant step forward in how users interact with information.",
          "sentiment": "0.5"
        },
        {
          "speaker": "Operator",
          "title": "Operator",
          "content": "Our next question comes from Justin Post with Bank of America. Please go ahead.",
          "sentiment": "0.0"
        },
        {
          "speaker": "Justin Post", 
          "title": "Analyst",
          "content": "Hi, thanks. Ruth, can you walk us through the YouTube advertising trends and what you're seeing in terms of Shorts monetization?",
          "sentiment": "0.2"
        }
      ]),
      wordCount: 920,
      revenue: "$80.5B",
      growth: "15%", 
      eps: "$1.89",
      margin: "25.0%"
    });

    // Tesla Q1 2024 transcript
    await this.createTranscript({
      symbol: "TSLA",
      quarter: "2024Q1",
      year: 2024, 
      title: "Tesla Inc. Q1 2024 Earnings Call",
      date: "2024-01-24",
      content: JSON.stringify([
        {
          "speaker": "Elon Musk",
          "title": "CEO",
          "content": "Good afternoon, and thank you for joining Tesla's first quarter 2024 earnings call. We delivered solid results this quarter despite ongoing supply chain challenges. Our focus remains on scaling production, advancing our autonomous driving capabilities, and accelerating the world's transition to sustainable energy. The Cybertruck program is progressing well, and we're excited about the opportunities ahead.",
          "sentiment": "0.7"
        },
        {
          "speaker": "Vaibhav Taneja",
          "title": "CFO",
          "content": "Thank you, Elon. For the first quarter, we generated revenue of $25.2 billion, representing 9% growth year-over-year. Our automotive gross margin was 18.7%, reflecting our continued operational improvements. We maintained strong cash generation and ended the quarter with $29.1 billion in cash and cash equivalents, positioning us well for our growth initiatives.",
          "sentiment": "0.6"
        },
        {
          "speaker": "Operator",
          "title": "Operator",
          "content": "Thank you. We will now begin the question and answer session. Our first question comes from Dan Ives with Wedbush. Please go ahead.",
          "sentiment": "0.0"
        },
        {
          "speaker": "Dan Ives",
          "title": "Analyst",
          "content": "Thanks for taking the question. Elon, can you provide an update on the Cybertruck production ramp and what we should expect for deliveries this year?",
          "sentiment": "0.2"
        },
        {
          "speaker": "Elon Musk", 
          "title": "CEO",
          "content": "Thanks Dan. We're making good progress on Cybertruck production. The manufacturing challenges are significant but we're working through them systematically.",
          "sentiment": "0.4"
        },
        {
          "speaker": "Operator",
          "title": "Operator",
          "content": "Our next question comes from Adam Jonas with Morgan Stanley. Please go ahead.",
          "sentiment": "0.0"
        },
        {
          "speaker": "Adam Jonas",
          "title": "Analyst",
          "content": "Hi team. I wanted to ask about the FSD progress and the timeline for wider release of the full self-driving capabilities?",
          "sentiment": "0.2"
        }
      ]),
      wordCount: 780,
      revenue: "$25.2B",
      growth: "9%",
      eps: "$0.71", 
      margin: "18.7%"
    });

    // Amazon Q1 2024 transcript
    await this.createTranscript({
      symbol: "AMZN",
      quarter: "2024Q1",
      year: 2024,
      title: "Amazon.com Inc. Q1 2024 Earnings Call", 
      date: "2024-01-26",
      content: JSON.stringify([
        {
          "speaker": "Andy Jassy",
          "title": "CEO",
          "content": "Good afternoon, and thank you for joining Amazon's first quarter 2024 earnings call. We delivered strong results across all business segments this quarter. Our relentless focus on customer obsession continues to drive innovation and growth. AWS remains a key growth driver, while our retail business shows solid momentum. We're particularly excited about the AI opportunities we're pursuing across all our services.",
          "sentiment": "0.7"
        },
        {
          "speaker": "Brian Olsavsky",
          "title": "CFO",
          "content": "Thank you, Andy. We reported net sales of $143.3 billion for the first quarter, representing 13% growth year-over-year. Operating margin improved to 8.2%, reflecting our continued operational discipline. AWS revenue grew 17% to $25.0 billion, demonstrating the strength of our cloud platform. We remain confident in our long-term growth prospects across all segments.",
          "sentiment": "0.6"
        },
        {
          "speaker": "Operator",
          "title": "Operator",
          "content": "Thank you for joining us today. We will now begin the Q&A portion. Our first question comes from Brian Nowak with Goldman Sachs. Please go ahead.",
          "sentiment": "0.0"
        },
        {
          "speaker": "Brian Nowak",
          "title": "Analyst",
          "content": "Thanks for taking the question. Andy, can you talk about the AWS growth trends and how you're thinking about the competitive landscape in cloud?",
          "sentiment": "0.2"
        },
        {
          "speaker": "Andy Jassy",
          "title": "CEO", 
          "content": "Thanks Brian. AWS continues to see strong momentum across all customer segments. We're particularly excited about the AI and machine learning workloads we're seeing.",
          "sentiment": "0.6"
        },
        {
          "speaker": "Operator",
          "title": "Operator",
          "content": "Our next question comes from Mark Mahaney with Evercore. Please go ahead.",
          "sentiment": "0.0"
        },
        {
          "speaker": "Mark Mahaney",
          "title": "Analyst",
          "content": "Thank you. Can you provide more details on the Prime membership trends and what you're seeing in terms of engagement and retention?",
          "sentiment": "0.2"
        }
      ]),
      wordCount: 940,
      revenue: "$143.3B",
      growth: "13%",
      eps: "$0.98",
      margin: "8.2%"
    });
  }

  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentUserId++;
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async getTranscript(id: number): Promise<Transcript | undefined> {
    return this.transcripts.get(id);
  }

  async getTranscriptsBySymbol(symbol: string): Promise<Transcript[]> {
    return Array.from(this.transcripts.values()).filter(
      (transcript) => transcript.symbol === symbol.toUpperCase()
    );
  }

  async createTranscript(insertTranscript: InsertTranscript): Promise<Transcript> {
    const id = this.currentTranscriptId++;
    const transcript: Transcript = { 
      id,
      symbol: insertTranscript.symbol,
      quarter: insertTranscript.quarter,
      year: insertTranscript.year,
      title: insertTranscript.title,
      date: insertTranscript.date,
      content: insertTranscript.content,
      wordCount: insertTranscript.wordCount,
      revenue: insertTranscript.revenue || null,
      growth: insertTranscript.growth || null,
      eps: insertTranscript.eps || null,
      margin: insertTranscript.margin || null,
      createdAt: new Date()
    };
    this.transcripts.set(id, transcript);
    return transcript;
  }

  async getTranscriptsByFilters(symbol: string, quarters: string[], years: number[]): Promise<Transcript[]> {
    return Array.from(this.transcripts.values()).filter(
      (transcript) => 
        transcript.symbol === symbol.toUpperCase() &&
        quarters.includes(transcript.quarter) &&
        years.includes(transcript.year)
    );
  }
}

export const storage = new MemStorage();
