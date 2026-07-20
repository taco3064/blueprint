import { StoryCard } from '~app/components/StoryCard';
import { ThemeProvider } from '~app/contexts/ThemeContext';
import { useStories } from '~app/hooks/useStories';

export function StoryFeed({ limit }: { limit: number }) {
  const stories = useStories(limit);
  return <ThemeProvider>{stories.map((s) => <StoryCard key={s.id} story={s} />)}</ThemeProvider>;
}
