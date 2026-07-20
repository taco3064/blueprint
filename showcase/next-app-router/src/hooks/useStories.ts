import { fetchStories } from '~app/services/storiesApi';

export function useStories(limit: number) {
  return fetchStories(limit);
}
