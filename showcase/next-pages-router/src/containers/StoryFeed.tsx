import { StoryCard } from '~app/components/StoryCard';
import { useStories } from '~app/hooks/useStories';

export function StoryFeed({ limit }: { limit: number }) {
  const stories = useStories(limit);
  return <>{stories.map((s) => <StoryCard key={s.id} story={s} />)}</>;
}
