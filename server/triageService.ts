import type { ItemAiInsight } from "@shared/schema";

// Triage recommendation types
export type TriageRecommendation = 'post_now' | 'clean_and_post' | 'skip' | 'insufficient_data';

export interface TriageResult {
  recommendedAction: TriageRecommendation;
  confidence: number; // 0-100
  estimatedValue: number | null; // in cents
  reasoning: string;
}

export interface WebEntity {
  entityId?: string;
  score?: number;
  description?: string;
}

export interface Label {
  description?: string;
  score?: number;
  confidence?: number;
}

export class TriageService {
  /**
   * Analyze AI insights for an item and generate triage recommendation
   * @param insights - All AI insights for the item (one per image)
   * @param imageCount - Total number of images for the item
   */
  analyzeItem(insights: ItemAiInsight[], imageCount: number): TriageResult {
    // Work with even 1 image - users are on their phones and want instant feedback
    if (imageCount < 1) {
      return {
        recommendedAction: 'insufficient_data',
        confidence: 100,
        estimatedValue: null,
        reasoning: 'Upload at least 1 photo for AI analysis',
      };
    }

    // Only process completed insights
    const completedInsights = insights.filter(i => i.status === 'completed');
    
    if (completedInsights.length === 0) {
      return {
        recommendedAction: 'insufficient_data',
        confidence: 100,
        estimatedValue: null,
        reasoning: 'AI analysis still processing. Please wait for image analysis to complete.',
      };
    }

    // Aggregate pricing data from all images
    const pricePoints = this.extractPricePoints(completedInsights);
    const conditionSignals = this.extractConditionSignals(completedInsights);
    const matchConfidence = this.calculateMatchConfidence(completedInsights);

    // Calculate estimated value
    const estimatedValue = this.calculateEstimatedValue(pricePoints);

    // Generate recommendation
    const recommendation = this.generateRecommendation(
      estimatedValue,
      conditionSignals,
      matchConfidence,
      imageCount,
      pricePoints.length,
      completedInsights
    );

    return recommendation;
  }

  /**
   * Extract price points from web entities across all insights
   */
  private extractPricePoints(insights: ItemAiInsight[]): number[] {
    const prices: number[] = [];

    for (const insight of insights) {
      if (!insight.webEntities) continue;

      const entities = insight.webEntities as WebEntity[] | { entities?: WebEntity[] };
      const entityArray = Array.isArray(entities) ? entities : entities.entities || [];

      for (const entity of entityArray) {
        const price = this.extractPriceFromDescription(entity.description || '');
        if (price) {
          prices.push(price);
        }
      }
    }

    return prices;
  }

  /**
   * Extract price from text like "$25", "25.00", "$15-$20"
   */
  private extractPriceFromDescription(text: string): number | null {
    // Common price patterns
    const patterns = [
      /\$(\d+(?:\.\d{2})?)/,           // $25.00 or $25
      /(\d+(?:\.\d{2})?)\s*(?:dollars|usd)/i,  // 25.00 dollars
      /price[:\s]+\$?(\d+(?:\.\d{2})?)/i,      // Price: $25 or Price 25
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        const dollarAmount = parseFloat(match[1]);
        return Math.round(dollarAmount * 100); // Convert to cents
      }
    }

    return null;
  }

  /**
   * Check for explicit collectible/vintage keywords in labels
   */
  private hasExplicitCollectibleKeywords(insights: ItemAiInsight[]): boolean {
    const collectibleKeywords = ['vintage', 'antique', 'rare', 'collectible', 'limited edition', 'signed'];

    for (const insight of insights) {
      if (!insight.labels) continue;

      const labels = insight.labels as Label[] | { labels?: Label[] };
      const labelArray = Array.isArray(labels) ? labels : labels.labels || [];

      for (const label of labelArray) {
        const desc = (label.description || '').toLowerCase();
        if (collectibleKeywords.some(kw => desc.includes(kw))) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Detect condition signals from labels (damage, wear, pristine, etc.)
   */
  private extractConditionSignals(insights: ItemAiInsight[]): {
    positive: number;
    negative: number;
    neutral: number;
  } {
    const signals = { positive: 0, negative: 0, neutral: 0 };

    const positiveKeywords = [
      'new', 'pristine', 'mint', 'excellent', 'perfect', 'unused', 'sealed',
      'vintage', 'antique', 'rare', 'collectible', 'premium', 'luxury'
    ];

    const negativeKeywords = [
      'damaged', 'broken', 'worn', 'stained', 'torn', 'cracked', 'scratched',
      'faded', 'missing', 'defect', 'poor', 'junk', 'scrap', 'parts'
    ];

    for (const insight of insights) {
      if (!insight.labels) continue;

      const labels = insight.labels as Label[] | { labels?: Label[] };
      const labelArray = Array.isArray(labels) ? labels : labels.labels || [];

      for (const label of labelArray) {
        const desc = (label.description || '').toLowerCase();
        const score = label.score || label.confidence || 0.5;

        if (positiveKeywords.some(kw => desc.includes(kw))) {
          signals.positive += score;
        } else if (negativeKeywords.some(kw => desc.includes(kw))) {
          signals.negative += score;
        } else {
          signals.neutral += score * 0.5; // Neutral signals count less
        }
      }
    }

    return signals;
  }

  /**
   * Calculate how confident we are in the product match
   */
  private calculateMatchConfidence(insights: ItemAiInsight[]): number {
    let totalConfidence = 0;
    let count = 0;

    for (const insight of insights) {
      if (!insight.webEntities) continue;

      const entities = insight.webEntities as WebEntity[] | { entities?: WebEntity[] };
      const entityArray = Array.isArray(entities) ? entities : entities.entities || [];

      // Top 3 matches matter most
      const topMatches = entityArray.slice(0, 3);
      for (const entity of topMatches) {
        totalConfidence += (entity.score || 0.5);
        count++;
      }
    }

    return count > 0 ? totalConfidence / count : 0;
  }

  /**
   * Calculate estimated market value from price points
   */
  private calculateEstimatedValue(pricePoints: number[]): number | null {
    if (pricePoints.length === 0) return null;

    // Remove outliers (lowest 10% and highest 10%)
    const sorted = [...pricePoints].sort((a, b) => a - b);
    const trimCount = Math.floor(sorted.length * 0.1);
    const trimmed = sorted.slice(trimCount, sorted.length - trimCount);

    if (trimmed.length === 0) return sorted[0]; // fallback to first price

    // Calculate median
    const mid = Math.floor(trimmed.length / 2);
    const median = trimmed.length % 2 === 0
      ? Math.round((trimmed[mid - 1] + trimmed[mid]) / 2)
      : trimmed[mid];

    return median;
  }

  /**
   * Generate final recommendation based on all factors
   */
  private generateRecommendation(
    estimatedValue: number | null,
    conditionSignals: { positive: number; negative: number; neutral: number },
    matchConfidence: number,
    imageCount: number,
    pricePointCount: number,
    insights: ItemAiInsight[]
  ): TriageResult {
    const reasons: string[] = [];
    let confidence = 50; // Base confidence

    // Insufficient price data - but give best guess anyway
    if (!estimatedValue || pricePointCount < 1) {
      // No price data at all - check if we can identify the product
      const hasGoodMatch = matchConfidence > 0.6;
      
      if (hasGoodMatch) {
        return {
          recommendedAction: 'clean_and_post',
          confidence: 40,
          estimatedValue: 2500, // Default $25 estimate when we can't find pricing
          reasoning: 'Product identified but no price data found. Estimated $25 - research actual market value before listing.',
        };
      }
      
      return {
        recommendedAction: 'insufficient_data',
        confidence: 60,
        estimatedValue,
        reasoning: 'Could not identify product clearly. Try different photo angles or better lighting.',
      };
    }
    
    // Low confidence with limited price points
    if (pricePointCount < 2) {
      reasons.push('Limited price data - estimate may be rough');
    }

    // Adjust confidence based on match quality
    confidence += Math.round(matchConfidence * 30); // Up to +30

    // Adjust confidence based on image count (1-5 ideal, more is better)
    if (imageCount >= 3 && imageCount <= 5) {
      confidence += 15;
    } else if (imageCount >= 2) {
      confidence += 10;
    } else if (imageCount === 1) {
      confidence -= 10; // Lower confidence with just 1 photo
      reasons.push('Only 1 photo - add more for better accuracy');
    } else if (imageCount > 5) {
      confidence += 5;
    }

    // Adjust confidence based on price point count
    if (pricePointCount >= 5) {
      confidence += 10;
    } else if (pricePointCount >= 3) {
      confidence += 5;
    }

    confidence = Math.min(95, Math.max(20, confidence));

    // Decision thresholds
    const MIN_VALUE_THRESHOLD = 1500; // $15 minimum to be worth listing
    const CLEAN_VALUE_THRESHOLD = 2500; // $25+ worth cleaning up
    const PRIME_VALUE_THRESHOLD = 5000; // $50+ post immediately

    const valueInDollars = estimatedValue / 100;

    // Low value check (<$15)
    if (estimatedValue < MIN_VALUE_THRESHOLD) {
      reasons.push(`Low estimated value (~$${valueInDollars.toFixed(2)})`);
      
      // Check if it might have hidden collectible value
      // Only override if we have explicit collectible signals AND minimal damage
      const hasCollectibleSignals = this.hasExplicitCollectibleKeywords(insights);
      const hasMinimalDamage = conditionSignals.negative < 0.5; // Very low damage threshold
      
      if (hasCollectibleSignals && hasMinimalDamage) {
        reasons.push('Detected collectible/vintage item');
        return {
          recommendedAction: 'clean_and_post',
          confidence: Math.min(confidence, 60),
          estimatedValue,
          reasoning: reasons.join('. ') + '. May have niche collector value - research recommended.',
        };
      }

      return {
        recommendedAction: 'skip',
        confidence,
        estimatedValue,
        reasoning: reasons.join('. ') + '. Not worth the listing effort.',
      };
    }

    // Mid-low value check ($15-$25)
    if (estimatedValue < CLEAN_VALUE_THRESHOLD) {
      reasons.push(`Modest value (~$${valueInDollars.toFixed(2)})`);
      
      // If condition is poor, skip it
      if (conditionSignals.negative > conditionSignals.positive) {
        reasons.push('Poor condition detected');
        return {
          recommendedAction: 'skip',
          confidence,
          estimatedValue,
          reasoning: reasons.join('. ') + '. At this price point, condition issues make it not worthwhile.',
        };
      }

      // If condition is decent, worth cleaning up
      reasons.push('Basic cleaning recommended');
      return {
        recommendedAction: 'clean_and_post',
        confidence,
        estimatedValue,
        reasoning: reasons.join('. ') + '. Quick cleanup will help it sell.',
      };
    }

    // High damage/poor condition check
    if (conditionSignals.negative > conditionSignals.positive * 1.5) {
      reasons.push('Significant damage or wear detected');
      
      if (estimatedValue < CLEAN_VALUE_THRESHOLD) {
        return {
          recommendedAction: 'skip',
          confidence,
          estimatedValue,
          reasoning: reasons.join('. ') + '. Repair cost likely exceeds value.',
        };
      } else {
        reasons.push(`But estimated value is good (~$${valueInDollars.toFixed(2)})`);
        return {
          recommendedAction: 'clean_and_post',
          confidence: Math.min(confidence, 70),
          estimatedValue,
          reasoning: reasons.join('. ') + '. Worth fixing up before listing.',
        };
      }
    }

    // High value, excellent condition - POST NOW
    // Only post immediately if condition is genuinely good (no or minimal damage)
    if (estimatedValue >= PRIME_VALUE_THRESHOLD) {
      const hasGoodCondition = conditionSignals.negative < 0.3 && conditionSignals.positive > conditionSignals.negative;
      
      if (hasGoodCondition) {
        reasons.push(`Excellent value (~$${valueInDollars.toFixed(2)})`);
        reasons.push('Good condition detected');
        return {
          recommendedAction: 'post_now',
          confidence,
          estimatedValue,
          reasoning: reasons.join('. ') + '. Ready to list!',
        };
      }
      
      // High value but has damage - recommend cleaning first
      reasons.push(`High value (~$${valueInDollars.toFixed(2)})`);
      reasons.push('Some condition issues detected');
      return {
        recommendedAction: 'clean_and_post',
        confidence,
        estimatedValue,
        reasoning: reasons.join('. ') + '. Worth fixing up given the value.',
      };
    }

    // Medium-high value ($25-$50) - CLEAN & POST
    if (estimatedValue < PRIME_VALUE_THRESHOLD) {
      reasons.push(`Good value (~$${valueInDollars.toFixed(2)})`);
      if (conditionSignals.negative > 0) {
        reasons.push('Minor cleaning recommended');
      } else {
        reasons.push('Decent condition');
      }
      return {
        recommendedAction: 'clean_and_post',
        confidence,
        estimatedValue,
        reasoning: reasons.join('. ') + '. Quick cleanup will maximize profit.',
      };
    }

    // High value ($50+) - POST NOW (already checked condition above)
    reasons.push(`High value (~$${valueInDollars.toFixed(2)})`);
    return {
      recommendedAction: 'post_now',
      confidence,
      estimatedValue,
      reasoning: reasons.join('. ') + '. Strong seller - list it!',
    };
  }
}
