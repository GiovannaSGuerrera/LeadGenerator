export type Mode = "business_without_website" | "public_requests";
export type ReviewStatus = "new" | "reviewed" | "discarded" | "confirmed";
export type Confidence = "low" | "medium" | "high";
export type PlaceStatus = "unchecked" | "confirmed" | "not_found";
export type WebsiteReview = "unchecked" | "no_site" | "has_site";
export type ContactStatus = "new" | "to_contact" | "contacted" | "replied" | "proposal" | "won" | "lost";
export interface LeadWorkflow { placeStatus: PlaceStatus; websiteReview: WebsiteReview; contactStatus: ContactStatus; lastContactAt: string; nextActionAt: string; notes: string; }

export interface Evidence { sourceUrl: string; collectedAt: string; excerpt?: string; criterion: string; }
export interface Lead { id: string; mode: Mode; name: string; category: string; neighborhood: string; city: string; address?: string; phone?: string; website?: string; mapUrl?: string; websiteStatus: "absent_in_source" | "present" | "unknown"; source: string; sourceUrl: string; sourceRecordId?: string; collectedAt: string; publishedAt?: string; deadlineAt?: string; budget?: number; budgetText?: string; description?: string; organization?: string; confidence: Confidence; reviewStatus: ReviewStatus; isMock: boolean; evidence: Evidence[]; criteria: string[]; note: string; workflow?: LeadWorkflow; priority?: number; }
export interface SearchFilters { mode: Mode; category?: string; neighborhood?: string; query?: string; }
