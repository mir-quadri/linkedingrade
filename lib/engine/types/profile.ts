export type ExtractionConfidence = 'high' | 'medium' | 'low' | 'missing';

export interface SectionExtraction<T> {
  data: T | null;
  confidence: ExtractionConfidence;
  notes?: string;
}

export interface PhotoData {
  present: boolean;
  // Best-effort: rough framing — face fills a small/medium/large portion of the frame.
  // The DOM only reliably exposes presence and image src; the AI judge handles framing.
  imageSrc: string | null;
  isDefault: boolean;
}

export interface BannerData {
  present: boolean;
  imageSrc: string | null;
  isDefault: boolean;
}

export interface ExperienceEntry {
  title: string | null;
  company: string | null;
  dates: string | null;
  durationText: string | null;
  description: string | null;
}

export interface SkillsData {
  topThree: string[];
  all: string[];
  endorsementCounts: Record<string, number>;
}

export interface FeaturedItem {
  title: string | null;
  type: string | null;
  url: string | null;
}

export interface ActivityData {
  postsCount: number | null;
  mostRecentDaysAgo: number | null;
  // 'silent' = no activity in 90+ days; 'sporadic' = some, 'active' = regular cadence
  cadence: 'silent' | 'sporadic' | 'active' | 'unknown';
}

export interface RecommendationsData {
  count: number | null;
  recentCount: number | null; // last 18 months if extractable
}

export interface EducationItem {
  school: string | null;
  degree: string | null;
  dates: string | null;
}

export interface CertificationItem {
  name: string | null;
  issuer: string | null;
  date: string | null;
}

export interface ProfileData {
  url: string;
  extractedAt: string; // ISO timestamp
  fullName: string | null;
  headline: SectionExtraction<string>;
  photo: SectionExtraction<PhotoData>;
  banner: SectionExtraction<BannerData>;
  about: SectionExtraction<string>;
  currentExperience: SectionExtraction<ExperienceEntry>;
  experienceHistory: SectionExtraction<ExperienceEntry[]>;
  skills: SectionExtraction<SkillsData>;
  featured: SectionExtraction<FeaturedItem[]>;
  activity: SectionExtraction<ActivityData>;
  recommendations: SectionExtraction<RecommendationsData>;
  education: SectionExtraction<EducationItem[]>;
  certifications: SectionExtraction<CertificationItem[]>;
}
