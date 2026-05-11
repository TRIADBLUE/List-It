import type { ItemAiInsight } from "@shared/schema";

interface SearchApiLabel {
  description: string;
  score: number;
}

interface SearchApiWebEntity {
  title: string;
  link?: string;
  source?: string;
  price?: string;
}

interface SearchApiResponse {
  visual_matches?: SearchApiWebEntity[];
  knowledge_graph?: {
    title?: string;
    description?: string;
  };
  text?: string;
}

export class SearchApiService {
  private apiKey: string | undefined;
  private baseUrl = "https://www.searchapi.io/api/v1/search";

  constructor() {
    this.apiKey = process.env.SEARCHAPI_API_KEY;
    if (!this.apiKey) {
      console.warn("[SearchAPI] SEARCHAPI_API_KEY not configured - image analysis will be disabled");
    }
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  async analyzeImage(imageUrl: string): Promise<Partial<ItemAiInsight>> {
    if (!this.apiKey) {
      return {
        imageUrl,
        status: "failed",
        error: "SearchAPI not configured - add SEARCHAPI_API_KEY to secrets",
      };
    }

    try {
      // Build query string - SearchAPI uses GET with query params
      const params = new URLSearchParams({
        engine: "google_lens",
        url: imageUrl,
        hl: "en", // Force English language results
        gl: "us", // Use US geolocation for better English results
      });

      const url = `${this.baseUrl}?${params.toString()}`;
      
      console.log(`[SearchAPI] Analyzing image: ${imageUrl}`);
      
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[SearchAPI] Request failed: ${response.status} ${response.statusText}`, errorText);
        throw new Error(`SearchAPI request failed: ${response.status} ${response.statusText}`);
      }

      const data: SearchApiResponse = await response.json();
      console.log(`[SearchAPI] Analysis complete. Found ${data.visual_matches?.length || 0} visual matches`);
      console.log(`[SearchAPI] Raw response summary:`, {
        hasKnowledgeGraph: !!data.knowledge_graph,
        knowledgeGraphTitle: data.knowledge_graph?.title,
        visualMatchCount: data.visual_matches?.length || 0,
        firstMatchTitle: data.visual_matches?.[0]?.title,
        hasText: !!data.text,
        textPreview: data.text?.substring(0, 100),
      });

      // Helper function to check if text is primarily English
      const isEnglish = (text: string): boolean => {
        if (!text) return false;
        // Check if most characters are ASCII (English)
        const asciiCount = text.split('').filter(c => c.charCodeAt(0) < 128).length;
        return asciiCount / text.length > 0.7;
      };

      // Filter and prefer English results
      const englishMatches = (data.visual_matches || [])
        .filter(m => m.title && isEnglish(m.title));
      
      const allMatches = data.visual_matches || [];

      // Extract labels from matches (prefer English)
      const labels: SearchApiLabel[] = (englishMatches.length > 0 ? englishMatches : allMatches)
        .slice(0, 10)
        .map((match, index) => ({
          description: match.title,
          score: 1 - (index * 0.1), // Decreasing confidence score
        }));

      // Generate suggested title - prefer English sources
      let suggestedTitle = '';
      
      // Try knowledge graph first (usually English)
      if (data.knowledge_graph?.title && isEnglish(data.knowledge_graph.title)) {
        suggestedTitle = data.knowledge_graph.title;
      }
      
      // Try English matches
      if (!suggestedTitle && englishMatches.length > 0) {
        suggestedTitle = englishMatches[0].title;
      }
      
      // Try to extract product name from any English match
      if (!suggestedTitle && allMatches.length > 0) {
        // Look through all matches for English titles
        for (const match of allMatches) {
          if (match.title && isEnglish(match.title)) {
            suggestedTitle = match.title;
            break;
          }
        }
      }
      
      // Last resort: use first match but clean it up
      if (!suggestedTitle && allMatches.length > 0) {
        suggestedTitle = allMatches[0]?.title || "Item";
      }
      
      if (!suggestedTitle) {
        suggestedTitle = "Item"; // Final fallback
      }
      
      // Clean up title: remove excessive detail, keep it concise
      suggestedTitle = suggestedTitle
        .split(/[|–—\-]|for sale|price/i)[0] // Remove price/sale info
        .trim()
        .substring(0, 100); // Limit length

      // Generate suggested description with fallback
      let suggestedDescription = data.knowledge_graph?.description || 
        data.text?.substring(0, 500);
      
      if (!suggestedDescription) {
        // Create description from visual matches
        if (data.visual_matches && data.visual_matches.length > 0) {
          const matchDescriptions = data.visual_matches.slice(0, 3)
            .map(m => m.title)
            .filter(Boolean)
            .join(', ');
          suggestedDescription = `Similar items: ${matchDescriptions}`;
        } else {
          suggestedDescription = "Please add a description for this item.";
        }
      }

      // Determine category from labels
      const suggestedCategory = this.determineCategory(labels);
      
      // Extract price from visual matches
      let suggestedPrice: number | undefined;
      for (const match of allMatches) {
        if (match.price) {
          // Parse price string (e.g., "$29.99", "€15.50", "¥2000")
          const priceMatch = match.price.match(/[\d,]+\.?\d*/);
          if (priceMatch) {
            const priceValue = parseFloat(priceMatch[0].replace(/,/g, ''));
            if (!isNaN(priceValue) && priceValue > 0) {
              suggestedPrice = Math.round(priceValue * 100); // Convert to cents
              break;
            }
          }
        }
      }
      
      console.log(`[SearchAPI] Generated suggestions:`, {
        title: suggestedTitle,
        descriptionLength: suggestedDescription.length,
        category: suggestedCategory,
        price: suggestedPrice ? `$${(suggestedPrice / 100).toFixed(2)}` : 'none',
      });

      return {
        imageUrl,
        labels: labels as any,
        webEntities: data.visual_matches as any,
        suggestedTitle,
        suggestedDescription,
        suggestedCategory,
        suggestedPrice,
        status: "completed",
      };
    } catch (error) {
      console.error("SearchAPI analysis error:", error);
      return {
        imageUrl,
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  private determineCategory(labels: SearchApiLabel[]): string {
    const categoryKeywords: Record<string, string[]> = {
      "Electronics": ["phone", "laptop", "computer", "tablet", "camera", "electronic", "device"],
      "Furniture": ["chair", "table", "desk", "sofa", "couch", "bed", "furniture", "stool", "bench", "cabinet", "shelf", "dresser"],
      "Clothing": ["shirt", "pants", "dress", "shoes", "jacket", "clothing", "apparel"],
      "Tools": ["tool", "drill", "hammer", "wrench", "saw", "equipment"],
      "Books": ["book", "magazine", "novel", "textbook"],
      "Toys": ["toy", "game", "puzzle", "action figure", "doll"],
      "Kitchen": ["kitchen", "pot", "pan", "utensil", "cookware", "appliance"],
      "Sports": ["sports", "ball", "equipment", "fitness", "exercise"],
      "Home & Garden": ["plant", "garden", "decor", "decoration", "home"],
      "Collectibles": ["vintage", "antique", "collectible", "rare"],
    };

    // Check labels against category keywords
    for (const label of labels) {
      const desc = label.description.toLowerCase();
      for (const [category, keywords] of Object.entries(categoryKeywords)) {
        if (keywords.some(keyword => desc.includes(keyword))) {
          return category;
        }
      }
    }

    return "Other";
  }
}
