const ANALYSIS_CACHE_KEY = 'analysisCache';

export interface AnalysisCache {
  analysis: string;
  chatHistory: { role: string; parts: { text: string }[] }[];
}

export const saveAnalysisCache = (cache: AnalysisCache) => {
  try {
    const serializedCache = JSON.stringify(cache);
    localStorage.setItem(ANALYSIS_CACHE_KEY, serializedCache);
  } catch (error) {
    console.error('Error saving analysis cache:', error);
  }
};

export const loadAnalysisCache = (): AnalysisCache | null => {
  try {
    const serializedCache = localStorage.getItem(ANALYSIS_CACHE_KEY);
    if (serializedCache === null) {
      return null;
    }
    return JSON.parse(serializedCache);
  } catch (error) {
    console.error('Error loading analysis cache:', error);
    return null;
  }
};