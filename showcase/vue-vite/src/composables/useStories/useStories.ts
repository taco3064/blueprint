import { fetchStories } from '~app/services/storiesApi';

export interface Story {
  id: number;
  title: string;
}

export function useStories(): Story[] {
  return fetchStories(10);
}
