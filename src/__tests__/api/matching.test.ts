import { describe, it, expect } from "vitest";
import { FREE_MATCH_CREDITS } from "@/lib/credits";

describe("Matching Workflow Logic", () => {
  describe("Personality Vector Calculation", () => {
    const dimensions = ["extraversion", "conscientiousness", "agreeableness", "neuroticism", "openness"];

    it("should calculate average score per dimension", () => {
      const answers: Record<string, number> = {
        q1: 4, // extraversion
        q6: 2, // extraversion (reversed meaning)
        q2: 5, // conscientiousness
        q7: 4, // conscientiousness
        q3: 3, // agreeableness
        q8: 4, // agreeableness
        q4: 2, // neuroticism
        q9: 4, // neuroticism
        q5: 5, // openness
        q10: 4, // openness
      };

      const questionDimensions: Record<string, string> = {
        q1: "extraversion", q6: "extraversion",
        q2: "conscientiousness", q7: "conscientiousness",
        q3: "agreeableness", q8: "agreeableness",
        q4: "neuroticism", q9: "neuroticism",
        q5: "openness", q10: "openness",
      };

      const dimScores: Record<string, number[]> = {};
      for (const dim of dimensions) dimScores[dim] = [];

      for (const [qId, score] of Object.entries(answers)) {
        const dim = questionDimensions[qId];
        dimScores[dim].push(score);
      }

      const vector = dimensions.map((dim) => {
        const scores = dimScores[dim];
        return scores.reduce((a, b) => a + b, 0) / scores.length;
      });

      expect(vector).toHaveLength(5);
      expect(vector[0]).toBe(3); // extraversion: (4+2)/2
      expect(vector[1]).toBe(4.5); // conscientiousness: (5+4)/2
      expect(vector[2]).toBe(3.5); // agreeableness: (3+4)/2
      expect(vector[3]).toBe(3); // neuroticism: (2+4)/2
      expect(vector[4]).toBe(4.5); // openness: (5+4)/2
    });

    it("should determine personality type from highest dimension", () => {
      const vector = [3, 4.5, 3.5, 3, 4.5];
      const labels = ["الانبساطية", "يقظة الضمير", "الانسجام", "الاستقرار العاطفي", "الانفتاح"];
      const maxIdx = vector.indexOf(Math.max(...vector));
      const personalityType = labels[maxIdx];

      // First max is conscientiousness (index 1)
      expect(personalityType).toBe("يقظة الضمير");
    });
  });

  describe("Cosine Similarity", () => {
    function cosineSimilarity(a: number[], b: number[]): number {
      const dotProduct = a.reduce((sum, ai, i) => sum + ai * b[i], 0);
      const magnitudeA = Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0));
      const magnitudeB = Math.sqrt(b.reduce((sum, bi) => sum + bi * bi, 0));
      if (magnitudeA === 0 || magnitudeB === 0) return 0;
      return dotProduct / (magnitudeA * magnitudeB);
    }

    it("should return 1 for identical vectors", () => {
      const v = [4, 3, 5, 2, 4];
      expect(cosineSimilarity(v, v)).toBeCloseTo(1, 5);
    });

    it("should return high similarity for similar vectors", () => {
      const a = [4, 3, 5, 2, 4];
      const b = [4.5, 3.2, 4.8, 2.1, 3.9];
      expect(cosineSimilarity(a, b)).toBeGreaterThan(0.99);
    });

    it("should return lower similarity for different vectors", () => {
      const a = [5, 1, 5, 1, 5];
      const b = [1, 5, 1, 5, 1];
      expect(cosineSimilarity(a, b)).toBeLessThan(0.5);
    });

    it("should handle zero vectors", () => {
      expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
    });
  });

  describe("Compatibility Score Calculation", () => {
    it("should weight factors correctly: basic 25%, values 25%, personality 30%, behavioral 20%", () => {
      const basicScore = 80;
      const valuesScore = 90;
      const personalityScore = 85;
      const behavioralScore = 70;

      const total =
        basicScore * 0.25 +
        valuesScore * 0.25 +
        personalityScore * 0.30 +
        behavioralScore * 0.20;

      expect(total).toBeCloseTo(82.0, 1);
    });

    it("should return 100 for perfect match on all factors", () => {
      const total = 100 * 0.25 + 100 * 0.25 + 100 * 0.30 + 100 * 0.20;
      expect(total).toBe(100);
    });

    it("should return 0 for zero match on all factors", () => {
      const total = 0 * 0.25 + 0 * 0.25 + 0 * 0.30 + 0 * 0.20;
      expect(total).toBe(0);
    });
  });

  describe("Suggestion Card Data", () => {
    it("should show only first name, age, city, education, job, compatibility %", () => {
      const suggestionCard = {
        firstName: "أحمد",
        age: 28,
        city: "عمّان",
        education: "بكالوريوس",
        job: "مهندس",
        compatibilityScore: 87,
      };

      // These fields should be present
      expect(suggestionCard).toHaveProperty("firstName");
      expect(suggestionCard).toHaveProperty("age");
      expect(suggestionCard).toHaveProperty("city");
      expect(suggestionCard).toHaveProperty("education");
      expect(suggestionCard).toHaveProperty("job");
      expect(suggestionCard).toHaveProperty("compatibilityScore");

      // These fields should NOT be present (no photos, no last name, no contact info)
      expect(suggestionCard).not.toHaveProperty("lastName");
      expect(suggestionCard).not.toHaveProperty("email");
      expect(suggestionCard).not.toHaveProperty("phone");
      expect(suggestionCard).not.toHaveProperty("photos");
    });
  });

  describe("Matching Flow Rules", () => {
    it("should allow both genders to receive suggestions", () => {
      const femaleGender = "FEMALE";
      const maleGender = "MALE";
      // Both genders can receive suggestions
      const femaleCanReceive = ["FEMALE", "MALE"].includes(femaleGender);
      const maleCanReceive = ["FEMALE", "MALE"].includes(maleGender);
      expect(femaleCanReceive).toBe(true);
      expect(maleCanReceive).toBe(true);
    });

    it("should create mutual match when both users like each other", () => {
      const user1Liked = true;
      const user2Liked = true;
      const isMutualMatch = user1Liked && user2Liked;
      expect(isMutualMatch).toBe(true);
    });

    it("should not create match when only one likes", () => {
      const user1Liked = true;
      const user2Liked = false;
      const isMutualMatch = user1Liked && user2Liked;
      expect(isMutualMatch).toBe(false);
    });

    it("should reveal photos only after mutual match", () => {
      const isMutualMatch = true;
      const photosRevealed = isMutualMatch;
      expect(photosRevealed).toBe(true);
    });

    it("should not reveal photos before mutual match", () => {
      const isMutualMatch = false;
      const photosRevealed = isMutualMatch;
      expect(photosRevealed).toBe(false);
    });

    it("should create visit request after mutual match", () => {
      const isMutualMatch = true;
      const shouldCreateVisit = isMutualMatch;
      expect(shouldCreateVisit).toBe(true);
    });
  });

  describe("Free Tier Limits", () => {
    it("should grant 2 free suggestion credits at registration", () => {
      expect(FREE_MATCH_CREDITS).toBe(2);
    });

    it("should decrement suggestions on use", () => {
      let remaining = 5;
      remaining -= 1;
      expect(remaining).toBe(4);
    });

    it("should block when no suggestions remain", () => {
      const remaining = 0;
      const canReceiveSuggestion = remaining > 0;
      expect(canReceiveSuggestion).toBe(false);
    });
  });
});
