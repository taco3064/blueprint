import { fetchStories } from '~app/services/storiesApi';

export interface Story {
  id: number;
  title: string;
}

export function useStories(limit: number): Story[] {
  return fetchStories(limit);
}
